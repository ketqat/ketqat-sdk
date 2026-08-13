import { z } from "zod";
import { parseQasm3 } from "../circuit/qasm3.js";
import { estimateResources } from "../engine/resources.js";
import { ClassicalBaselineSchema } from "./baseline.js";
import { INTELLIGENCE_SCHEMA_VERSION } from "./measurement.js";
import { LayoutModelSchema, EconomicModelSchema, ResourceScenarioSchema, ScenarioPresetSchema, presetScenarios, } from "./scenario.js";
import { LogicalResourceCountsSchema, ProblemSizeSchema, QuantumWorkloadSchema, WorkloadSourceSchema, workloadFromResourceEstimate, } from "./workload.js";
import { EvidenceSourceSchema } from "./bundle.js";
/**
 * The assessment document (ketqat-sdk#236).
 *
 * A file someone writes by hand, so it is deliberately thinner than the bundle
 * it produces: a workload, an optional classical baseline, and which scenarios
 * to run. Everything else -- estimates, thresholds, decisions, the hash -- is
 * computed, and computing it from a short input is what makes the output
 * reproducible from something a person can read and diff.
 *
 * ## Why there is a YAML reader in here
 *
 * The SDK's only runtime dependency is `zod`, and that constraint is load-bearing
 * rather than aesthetic: this is the package other people install. Adding a YAML
 * library to read a config file would be the first crack in it.
 *
 * So this reads a **declared subset** of YAML and refuses everything else, the
 * same approach the OpenQASM 3 parser takes. Anchors, aliases, tags, flow
 * collections, multiple documents, and complex keys are rejected by name rather
 * than mis-parsed -- a config reader that silently misreads a file is worse than
 * one that cannot read it, because the misreading becomes a number in a report.
 *
 * JSON is accepted too, and is the better choice for generated files.
 */
export class AssessmentFileError extends Error {
}
const UNSUPPORTED = [
    { pattern: /^\s*---\s*$/m, feature: "document separators" },
    { pattern: /^\s*\.\.\.\s*$/m, feature: "document end markers" },
    { pattern: /(^|\s)[&*][A-Za-z0-9_-]+/, feature: "anchors and aliases" },
    { pattern: /(^|\s)!!?[A-Za-z0-9_/-]+/, feature: "explicit tags" },
    { pattern: /^\s*\?\s/m, feature: "complex mapping keys" },
];
function readLines(source) {
    const lines = [];
    const raw = source.split(/\r?\n/);
    for (let index = 0; index < raw.length; index += 1) {
        const line = raw[index];
        if (/^\s*$/.test(line))
            continue;
        if (/^\s*#/.test(line))
            continue;
        const indent = line.length - line.trimStart().length;
        if (line.includes("\t")) {
            throw new AssessmentFileError(`Line ${index + 1}: tabs are not valid YAML indentation.`);
        }
        lines.push({ indent, text: line.trimEnd(), number: index + 1 });
    }
    return lines;
}
function parseScalar(token, lineNumber) {
    const trimmed = token.trim();
    if (trimmed === "" || trimmed === "~" || trimmed === "null")
        return null;
    if (trimmed === "true")
        return true;
    if (trimmed === "false")
        return false;
    if (/^'(?:[^']|'')*'$/.test(trimmed))
        return trimmed.slice(1, -1).replace(/''/g, "'");
    if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            throw new AssessmentFileError(`Line ${lineNumber}: could not read the quoted string ${trimmed}.`);
        }
    }
    if (/^[[{]/.test(trimmed)) {
        throw new AssessmentFileError(`Line ${lineNumber}: flow collections ([...] and {...}) are outside the supported YAML subset. ` +
            "Use block style, or write the file as JSON.");
    }
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed))
        return Number(trimmed);
    return trimmed;
}
/** Strip an inline `# comment`, honouring quotes so a `#` inside a string survives. */
function stripComment(text) {
    let quote = null;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quote) {
            if (character === "\\" && quote === '"')
                index += 1;
            else if (character === quote)
                quote = null;
        }
        else if (character === '"' || character === "'") {
            quote = character;
        }
        else if (character === "#" && (index === 0 || /\s/.test(text[index - 1]))) {
            return text.slice(0, index);
        }
    }
    return text;
}
/**
 * Read a block scalar (`|` or `>`), which is the only reason this reader exists.
 *
 * An OpenQASM circuit inside an assessment file is a multi-line string, and
 * requiring it to be JSON-escaped onto one line would make the document
 * unreadable, which is the whole advantage YAML has here.
 */
function readBlockScalar(lines, start, parentIndent, style) {
    const body = [];
    let index = start;
    let blockIndent = null;
    while (index < lines.length && lines[index].indent > parentIndent) {
        const line = lines[index];
        if (blockIndent === null)
            blockIndent = line.indent;
        body.push(line.text.slice(blockIndent));
        index += 1;
    }
    const joined = style === ">" ? body.join(" ") : body.join("\n");
    return [style === ">" ? joined : `${joined}\n`, index];
}
function parseBlock(lines, start, indent) {
    const first = lines[start];
    if (!first)
        return [null, start];
    if (first.text.trimStart().startsWith("- ") || first.text.trim() === "-") {
        const items = [];
        let index = start;
        while (index < lines.length && lines[index].indent === indent) {
            const line = lines[index];
            const content = stripComment(line.text.trimStart().replace(/^-\s?/, ""));
            if (content.trim() === "") {
                const [value, next] = parseBlock(lines, index + 1, lines[index + 1]?.indent ?? indent + 2);
                items.push(value);
                index = next;
                continue;
            }
            // `- key: value` opens a mapping whose first key sits on the dash line.
            if (/^[^:#]+:(\s|$)/.test(content)) {
                const childIndent = line.indent + (line.text.trimStart().indexOf("-") + 2);
                const synthetic = [{ indent: childIndent, text: " ".repeat(childIndent) + content, number: line.number }];
                let scan = index + 1;
                while (scan < lines.length && lines[scan].indent > indent) {
                    synthetic.push(lines[scan]);
                    scan += 1;
                }
                const [value] = parseBlock(synthetic, 0, childIndent);
                items.push(value);
                index = scan;
                continue;
            }
            items.push(parseScalar(content, line.number));
            index += 1;
        }
        return [items, index];
    }
    const mapping = {};
    let index = start;
    while (index < lines.length && lines[index].indent === indent) {
        const line = lines[index];
        const text = stripComment(line.text.trim());
        if (text === "") {
            index += 1;
            continue;
        }
        const separator = text.indexOf(":");
        if (separator === -1) {
            throw new AssessmentFileError(`Line ${line.number}: expected 'key: value', got '${text}'.`);
        }
        const key = text.slice(0, separator).trim().replace(/^["']|["']$/g, "");
        const rest = text.slice(separator + 1).trim();
        if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
            const [value, next] = readBlockScalar(lines, index + 1, indent, rest[0]);
            mapping[key] = rest.endsWith("-") ? value.replace(/\n$/, "") : value;
            index = next;
            continue;
        }
        if (rest === "") {
            const child = lines[index + 1];
            if (!child || child.indent <= indent) {
                mapping[key] = null;
                index += 1;
                continue;
            }
            const [value, next] = parseBlock(lines, index + 1, child.indent);
            mapping[key] = value;
            index = next;
            continue;
        }
        mapping[key] = parseScalar(rest, line.number);
        index += 1;
    }
    return [mapping, index];
}
/** Read the supported YAML subset. Refuses the rest by name. */
export function parseYamlSubset(source) {
    for (const { pattern, feature } of UNSUPPORTED) {
        if (pattern.test(source)) {
            throw new AssessmentFileError(`This file uses ${feature}, which are outside the YAML subset this reader supports. ` +
                "Rewrite without them, or supply the document as JSON.");
        }
    }
    const lines = readLines(source);
    if (lines.length === 0)
        return null;
    const [value] = parseBlock(lines, 0, lines[0].indent);
    return value;
}
// ------------------------------------------------------------- the document
const WorkloadSpecSchema = z
    .object({
    name: z.string().min(1),
    description: z.string().min(1),
    is_demo: z.boolean().default(false),
    /** OpenQASM 3 source. Parsed here; no code is executed. */
    openqasm3: z.string().min(1).optional(),
    source: WorkloadSourceSchema.optional(),
    /** Counts supplied directly, when there is no circuit to parse. */
    logical: LogicalResourceCountsSchema.optional(),
    logical_counts_evidence: z.enum(["DERIVED", "USER_PROVIDED", "MODELLED"]).optional(),
    gate_set: z.array(z.string().min(1)).optional(),
    problem_size: ProblemSizeSchema.optional(),
    notes: z.array(z.string().min(1)).default([]),
})
    .superRefine((spec, context) => {
    if (!spec.openqasm3 && !spec.logical) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A workload needs either an `openqasm3` circuit to parse or explicit `logical` counts. " +
                "Nothing is inferred from the name.",
            path: ["openqasm3"],
        });
    }
    if (spec.logical && !spec.openqasm3) {
        if (!spec.logical_counts_evidence) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Supplied counts must state how they were obtained: USER_PROVIDED for typed-in numbers, MODELLED for " +
                    "an analytic formula. There is no default, because the default would be a claim.",
                path: ["logical_counts_evidence"],
            });
        }
        if (!spec.gate_set || spec.gate_set.length === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Supplied counts must state the gate set they were taken over. Two counts over different gate sets are " +
                    "not comparable, and without this nothing can tell.",
                path: ["gate_set"],
            });
        }
    }
});
const ScenarioSpecSchema = z.object({
    presets: z.array(ScenarioPresetSchema.exclude(["CUSTOM"])).default(["CONSERVATIVE", "BASE", "OPTIMISTIC"]),
    error_budget: z.number().positive().max(1).optional(),
    runtime_target: z.number().positive().nullable().default(null),
    physical_qubit_capacity: z.number().int().positive().nullable().default(null),
    layout_model: LayoutModelSchema.optional(),
    economics: EconomicModelSchema.nullable().default(null),
    /** Fully specified scenarios, for anything the presets do not cover. */
    custom: z.array(ResourceScenarioSchema).default([]),
});
export const AssessmentSpecSchema = z.object({
    schema_version: z.string().min(1).default(INTELLIGENCE_SCHEMA_VERSION),
    workload: WorkloadSpecSchema,
    classical_baseline: ClassicalBaselineSchema.nullable().default(null),
    scenarios: ScenarioSpecSchema.default({}),
    sources: z.array(EvidenceSourceSchema).default([]),
});
/** Turn a document into the three inputs `buildBundle` takes. */
export function resolveAssessment(spec) {
    const workloadSpec = spec.workload;
    let workload;
    if (workloadSpec.openqasm3) {
        const parsed = parseQasm3(workloadSpec.openqasm3);
        workload = workloadFromResourceEstimate({
            name: workloadSpec.name,
            description: workloadSpec.description,
            source: workloadSpec.source ??
                WorkloadSourceSchema.parse({ kind: "OPENQASM3", openqasm3: workloadSpec.openqasm3 }),
            estimate: estimateResources(parsed.circuit),
            isDemo: workloadSpec.is_demo,
            ...(workloadSpec.problem_size ? { problemSize: workloadSpec.problem_size } : {}),
            notes: workloadSpec.notes,
        });
    }
    else {
        workload = QuantumWorkloadSchema.parse({
            schema_version: INTELLIGENCE_SCHEMA_VERSION,
            name: workloadSpec.name,
            description: workloadSpec.description,
            is_demo: workloadSpec.is_demo,
            source: workloadSpec.source ?? { kind: "MANUAL_LOGICAL_COUNTS" },
            logical: workloadSpec.logical,
            logical_counts_evidence: workloadSpec.logical_counts_evidence,
            ...(workloadSpec.problem_size ? { problem_size: workloadSpec.problem_size } : {}),
            gate_set: workloadSpec.gate_set,
            notes: workloadSpec.notes,
        });
    }
    const options = {
        ...(spec.scenarios.error_budget === undefined ? {} : { errorBudget: spec.scenarios.error_budget }),
        runtimeTarget: spec.scenarios.runtime_target,
        physicalQubitCapacity: spec.scenarios.physical_qubit_capacity,
        ...(spec.scenarios.layout_model ? { layoutModel: spec.scenarios.layout_model } : {}),
        economics: spec.scenarios.economics,
    };
    const wanted = new Set(spec.scenarios.presets);
    const presets = presetScenarios(options).filter((scenario) => wanted.has(scenario.preset));
    const scenarios = [...presets, ...spec.scenarios.custom];
    if (scenarios.length === 0) {
        throw new AssessmentFileError("This document selects no scenarios. An assessment with no assumptions to evaluate has nothing to report.");
    }
    return { workload, baseline: spec.classical_baseline, scenarios, sources: spec.sources };
}
/** Read a `.json` or `.yaml` assessment document. */
export function readAssessmentDocument(source, filename) {
    const looksJson = filename.endsWith(".json") || source.trimStart().startsWith("{");
    let raw;
    if (looksJson) {
        try {
            raw = JSON.parse(source);
        }
        catch (error) {
            throw new AssessmentFileError(`${filename} is not valid JSON: ${error.message}`);
        }
    }
    else {
        raw = parseYamlSubset(source);
    }
    const parsed = AssessmentSpecSchema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("\n");
        throw new AssessmentFileError(`${filename} is not a valid assessment document:\n${issues}`);
    }
    return parsed.data;
}
//# sourceMappingURL=assessment-file.js.map