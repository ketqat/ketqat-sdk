import { z } from "zod";
import { type StudyFieldClass, type StudyHashPurpose, type StudyShape } from "./projection.js";
/**
 * Every record kind this build hashes, as immutable plain data.
 *
 * A readonly tuple rather than a `Map`, for the reason `limits.ts` gives: the
 * exported value is data a consumer can read and cannot edit, and the lookup
 * that makes it cheap is module-private below. `record_kind` is a preimage
 * header component, so an entry added here is a new digest namespace and never
 * a reinterpretation of an existing one.
 */
export interface StudyRecordKindEntry {
    readonly record_kind: string;
    readonly shape: StudyShape;
    readonly self_hash_field: string;
    readonly self_hash_purpose: StudyHashPurpose;
}
/**
 * Which of the four digests a record kind writes into its own hash field.
 *
 * The four roles are separate because they answer separate questions, so
 * "which one is this record's identity" is a decision per kind rather than a
 * default. It is declared here, as data, for the same reason the field classes
 * are: both languages read one table, and a reviewer sees the choice in a diff.
 *
 * One rule decides every row: **a record whose fields all stand still takes a
 * `record` self-hash; a record that carries denormalized state which moves
 * under it takes a `semantic` one.**
 *
 * | kind | field | purpose | why |
 * | --- | --- | --- | --- |
 * | `study` | `content_hash` | `semantic` | `status`, `latest_specification` and `latest_plan` are projections of the event trail and move without the study changing |
 * | `study_event` | `content_hash` | `record` | immutable; every field is audit evidence, so `semantic` reads none of them and refuses |
 * | `problem_specification` | `content_hash` | `record` | immutable; `revision` and `supersedes` are the chain and must be covered |
 * | `study_plan` | `content_hash` | `record` | immutable; a confirmation authorises one revision, and "was this edited after it was written" is literally the question `verifyPlanConfirmation` asks |
 * | `study_task` | `content_hash` | `semantic` | the execution system overwrites `status` as the job moves |
 * | `evidence_node` | `content_hash` | `record` | immutable; identity in the graph, so a relabelled node is a different node |
 * | `evidence_edge` | `content_hash` | `record` | immutable, same reason |
 * | `execution_capsule` | `reproducibility_hash` | `record` | written once per run and never edited; `verifyExecutionCapsule` reports "unedited", which is the record question |
 * | `research_package` | `reproducibility_hash` | `record` | shipped as a file; `verifyResearchPackage` reports "the file was not edited after it was written" |
 *
 * Two consequences worth stating, because both were previously answered by one
 * digest doing two jobs.
 *
 * A `study` and a `study_task` still have a record digest -- it is just not
 * their identity. `recordHash("study", study)` answers "was this row edited",
 * including its status; the `content_hash` deliberately does not, so that five
 * other record kinds can point at a study that is still moving.
 *
 * An `execution_capsule` and a `research_package` still have a semantic digest,
 * and it is the one a reproduction comparison wants: `semanticHash` over two
 * capsules asks whether they describe the same intended computation, ignoring
 * when they ran and whether one was cancelled. Their `reproducibility_hash`
 * cannot answer that and does not claim to -- it answers whether the file in
 * front of the reader is the file that was written.
 */
export declare const STUDY_RECORD_KINDS: readonly StudyRecordKindEntry[];
/** The record kind names, as immutable plain data. */
export declare const STUDY_RECORD_KIND_NAMES: readonly string[];
/**
 * The entry for a record kind, or a refusal.
 *
 * A `Map` rather than an object literal, because an object literal answers to
 * every name on `Object.prototype`: a record kind of `"toString"` once resolved
 * to `Function.prototype.toString` and was handed on as a rule set, so the
 * digest layer threw a `TypeError` where a refusal belonged.
 */
export declare function studyRecordKind(recordKind: string): StudyRecordKindEntry;
/**
 * The classification of one shape, flattened to `path -> class`, as immutable
 * plain data.
 *
 * This is what the completeness test compares against a walk of the Zod schema.
 * Flattening rather than exposing the tree keeps the comparison a set
 * difference, which is the form in which "unclassified in either direction" is
 * a readable failure rather than a diff of two nested objects.
 */
export declare function flattenShapeClasses(shape: StudyShape): ReadonlyMap<string, StudyFieldClass>;
/**
 * Every Zod object field of a record schema, flattened the same way.
 *
 * Walking the schema is what makes the classification checkable: the schema is
 * where a field is actually added, so a field added there and nowhere else is
 * exactly the silent omission a projection would otherwise hide. The wrappers
 * are unwrapped rather than special-cased at each call, because a field's class
 * does not depend on whether it is optional.
 */
export declare function flattenSchemaFields(schema: z.ZodTypeAny): readonly string[];
//# sourceMappingURL=registry.d.ts.map