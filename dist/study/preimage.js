import { refuse } from "./limits.js";
import { STUDY_HASH_DOMAIN, STUDY_HASH_RULES_ID } from "./rules.js";
import { STUDY_HASH_PURPOSES } from "./projection.js";
/**
 * A header component: 1 to 128 printable ASCII characters.
 *
 * Printable ASCII excludes NUL by construction, which is the property the
 * separator depends on, and it also excludes space, control characters and
 * every non-ASCII byte -- so the header is the same sequence of bytes in both
 * languages without a normalization question being asked about it.
 */
const MAX_COMPONENT_LENGTH = 128;
function assertComponent(name, value) {
    if (typeof value !== "string" || value.length === 0) {
        refuse("MISSING_HEADER_COMPONENT", `the preimage header needs a ${name}, and this record does not supply one. Nothing is inferred: a study ` +
            "record that does not say what it is, what rules it hashes under and what schema it was written against " +
            "is malformed rather than old, and it is refused rather than defaulted.");
    }
    if (value.length > MAX_COMPONENT_LENGTH) {
        refuse("INVALID_HEADER_COMPONENT", `the ${name} header component is longer than ${MAX_COMPONENT_LENGTH} characters.`);
    }
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 0x21 || code > 0x7e) {
            refuse("INVALID_HEADER_COMPONENT", `the ${name} header component contains a character outside printable ASCII at index ${index}. The header ` +
                "is NUL-separated, and that separator is unambiguous only because no component can contain a NUL -- or " +
                "any other byte outside this range, which would make the header's encoding a second question.");
        }
    }
}
const purposes = new Set(STUDY_HASH_PURPOSES);
function assertPurpose(value) {
    assertComponent("hash purpose", value);
    if (!purposes.has(value)) {
        refuse("INVALID_HEADER_COMPONENT", `${JSON.stringify(value)} is not a hash purpose. Known purposes: ${STUDY_HASH_PURPOSES.join(", ")}. ` +
            "The list is closed because a purpose invented at a call site would be a new digest namespace nobody " +
            "declared, sharing a name with none of the four whose meanings are written down.");
    }
}
const knownRulesIds = new Set([STUDY_HASH_RULES_ID]);
function assertKnownRulesId(value) {
    if (knownRulesIds.has(value))
        return;
    refuse("UNKNOWN_HASH_RULES_ID", `this build does not know the hash rules id ${JSON.stringify(value)}. Known ids: ` +
        `${[...knownRulesIds].join(", ")}. A future study-v2 is a new entry here, never a reinterpretation of ` +
        "this one.");
}
const NUL = new Uint8Array([0]);
/**
 * The bytes a study digest is taken over.
 *
 * `body` is bytes rather than a value because two of the four roles need it to
 * be: `artifactHash` is defined over the literal bytes of a file, and defining
 * the header over anything else would mean two preimage constructions to keep
 * in step.
 */
export function buildStudyPreimage(header, body) {
    assertComponent("domain", header.domain);
    assertComponent("record kind", header.record_kind);
    assertPurpose(header.purpose);
    assertComponent("schema version", header.schema_version);
    assertComponent("hash rules id", header.hash_rules_id);
    assertKnownRulesId(header.hash_rules_id);
    const encoder = new TextEncoder();
    const parts = [];
    for (const component of [
        header.domain,
        header.record_kind,
        header.purpose,
        header.schema_version,
        header.hash_rules_id,
    ]) {
        parts.push(encoder.encode(component), NUL);
    }
    parts.push(body);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const preimage = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        preimage.set(part, offset);
        offset += part.length;
    }
    return preimage;
}
/** The header this build writes for a record kind and purpose. */
export function studyHeader(recordKind, purpose, schemaVersion, hashRulesId = STUDY_HASH_RULES_ID) {
    return Object.freeze({
        domain: STUDY_HASH_DOMAIN,
        record_kind: recordKind,
        purpose,
        schema_version: schemaVersion,
        hash_rules_id: hashRulesId,
    });
}
//# sourceMappingURL=preimage.js.map