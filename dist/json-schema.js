import { z } from "zod";
const DRAFT_07 = "http://json-schema.org/draft-07/schema#";
const SAFE = Number.MAX_SAFE_INTEGER;
// Published key order. Keys not listed keep zod's relative order between the
// listed leading and trailing groups.
const LEADING = ["$ref", "anyOf", "allOf", "type", "const", "enum", "properties", "required", "additionalProperties", "items"];
const TRAILING = ["description", "default"];
function isNode(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function order(node) {
    const keys = Object.keys(node);
    // A tuple was published with its length bounds before its items.
    const lead = Array.isArray(node.items) ? ["type", "minItems", "maxItems", "items"] : LEADING;
    const leading = lead.filter((key) => key in node);
    const trailing = TRAILING.filter((key) => key in node);
    const middle = keys.filter((key) => !leading.includes(key) && !trailing.includes(key));
    const ordered = {};
    for (const key of [...leading, ...middle, ...trailing])
        ordered[key] = node[key];
    return ordered;
}
function normalize(input) {
    const node = { ...input };
    if (Array.isArray(node.oneOf)) {
        node.anyOf = node.oneOf;
        delete node.oneOf;
    }
    if (node.type === "integer") {
        if (node.minimum === -SAFE)
            delete node.minimum;
        if (node.maximum === SAFE)
            delete node.maximum;
    }
    if (node.format === "date-time")
        delete node.pattern;
    if (Array.isArray(node.items) && node.additionalItems === false)
        delete node.additionalItems;
    if (node.type === "object" && isNode(node.propertyNames) && Object.keys(node.propertyNames).length === 1 &&
        node.propertyNames.type === "string") {
        delete node.propertyNames;
    }
    if (node.type === "object" && isNode(node.properties) && !("additionalProperties" in node)) {
        node.additionalProperties = false;
    }
    if (Array.isArray(node.anyOf) && node.anyOf.length > 1) {
        const members = node.anyOf;
        const type = isNode(members[0]) ? members[0].type : undefined;
        if (typeof type === "string" && members.every((member) => isNode(member) && Object.keys(member).length === 2 && member.type === type && "const" in member)) {
            delete node.anyOf;
            node.type = type;
            node.enum = members.map((member) => member.const);
        }
    }
    // Only an unconstrained primitive collapses; an integer is a number with a
    // check, which the published documents spell as anyOf.
    if (Array.isArray(node.anyOf) && node.anyOf.length === 2) {
        const [inner, nothing] = node.anyOf;
        if (isNode(inner) && isNode(nothing) && Object.keys(nothing).length === 1 && nothing.type === "null" &&
            Object.keys(inner).length === 1 && ["string", "number", "boolean"].includes(inner.type)) {
            delete node.anyOf;
            node.type = [inner.type, "null"];
        }
    }
    return order(node);
}
/** Converts every node bottom-up, resolving zod's `definitions` into pointers. */
function rewrite(root, name, definitions) {
    const placed = new Map();
    const visit = (value, path) => {
        if (Array.isArray(value))
            return value.map((item, index) => visit(item, [...path, String(index)]));
        if (!isNode(value))
            return value;
        if (Array.isArray(value.allOf) && value.allOf.length === 1 && Object.keys(value).length === 1) {
            return visit(value.allOf[0], path);
        }
        if (typeof value.$ref === "string" && value.$ref.startsWith("#/definitions/") && Object.keys(value).length === 1) {
            const id = value.$ref.slice("#/definitions/".length);
            const first = placed.get(id);
            if (first)
                return { $ref: first };
            placed.set(id, `#/${path.join("/")}`);
            const target = definitions[id];
            if (!isNode(target))
                throw new Error(`Unresolved schema reference ${id}`);
            return visit(target, path);
        }
        // Children first so a nested nullable can collapse before its parent is
        // ordered; visit in the published key order so the first occurrence of a
        // repeated schema is the one a reader meets first.
        const ordered = order(value);
        const out = {};
        for (const [key, child] of Object.entries(ordered)) {
            if (key === "properties" && isNode(child)) {
                const properties = {};
                for (const [property, schema] of Object.entries(child)) {
                    properties[property] = visit(schema, [...path, "properties", property]);
                }
                out[key] = properties;
            }
            else if (key === "definitions" || key === "$schema") {
                continue;
            }
            else if (isNode(child) || Array.isArray(child)) {
                out[key] = visit(child, [...path, key]);
            }
            else {
                out[key] = child;
            }
        }
        return normalize(out);
    };
    return visit(root, ["definitions", name]);
}
export function contractJsonSchema(schema, options) {
    const raw = z.toJSONSchema(schema, {
        target: "draft-7",
        io: "input",
        reused: options.references ? "ref" : "inline",
        unrepresentable: "throw",
        cycles: "throw",
    });
    const definitions = isNode(raw.definitions) ? raw.definitions : {};
    return {
        $ref: `#/definitions/${options.name}`,
        definitions: { [options.name]: rewrite(raw, options.name, definitions) },
        $schema: DRAFT_07,
    };
}
/** A single inlined document, for transports that want no wrapper (MCP tools). */
export function inlineJsonSchema(schema) {
    const document = contractJsonSchema(schema, { name: "schema" });
    const definitions = document.definitions;
    return { ...definitions.schema, $schema: DRAFT_07 };
}
//# sourceMappingURL=json-schema.js.map