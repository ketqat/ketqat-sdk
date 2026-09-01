import { type StudyHashPurpose } from "./projection.js";
/**
 * Domain separation: the typed header every study digest is taken over.
 *
 * ```
 * sha256(
 *   "ketqat.study" || 0x00 ||   # organisation + contract family
 *   <record_kind>  || 0x00 ||   # e.g. "study_plan"
 *   <hash_purpose> || 0x00 ||   # "semantic" | "record" | "receipt" | "artifact"
 *   <schema_version> || 0x00 ||
 *   <hash_rules_id>  || 0x00 ||
 *   <body>                      # JCS bytes, or the literal bytes of an artifact
 * )
 * ```
 *
 * Without the header, two record kinds that happen to project to the same body
 * share a digest. That is not a hypothetical in this family: a `study_task` and
 * an `evidence_edge` both project to a small object of content hashes and enum
 * strings, and a `semantic` and a `record` projection of the same record
 * coincide exactly whenever every field of that record is `SEMANTIC`. A digest
 * that can stand for either of two things identifies neither.
 *
 * NUL is the separator because it cannot occur in any of the five components:
 * each is validated below as one or more printable ASCII characters, so the
 * header parses back unambiguously and no component can be split, padded or
 * merged into its neighbour. A separator that could appear inside a component
 * is not a separator -- `("a", "b\0c")` and `("a\0b", "c")` would be one
 * preimage, and the "record kind" a digest committed to would depend on where a
 * reader chose to cut.
 */
export interface StudyPreimageHeader {
    readonly domain: string;
    readonly record_kind: string;
    readonly purpose: StudyHashPurpose;
    readonly schema_version: string;
    readonly hash_rules_id: string;
}
/**
 * The bytes a study digest is taken over.
 *
 * `body` is bytes rather than a value because two of the four roles need it to
 * be: `artifactHash` is defined over the literal bytes of a file, and defining
 * the header over anything else would mean two preimage constructions to keep
 * in step.
 */
export declare function buildStudyPreimage(header: StudyPreimageHeader, body: Uint8Array): Uint8Array;
/** The header this build writes for a record kind and purpose. */
export declare function studyHeader(recordKind: string, purpose: StudyHashPurpose, schemaVersion: string, hashRulesId?: string): StudyPreimageHeader;
//# sourceMappingURL=preimage.d.ts.map