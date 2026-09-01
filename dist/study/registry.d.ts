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
 * | `study` | `content_hash` | `semantic` | everything under `presentation` -- the title, the status and the two revision pointers -- moves without the study changing, and the identity a `study_ref` names is `study_id` rather than any digest |
 * | `study_event` | `content_hash` | `record` | immutable; every field is audit evidence, so `semantic` reads none of them and refuses |
 * | `problem_specification` | `content_hash` | `record` | immutable; `revision` and `supersedes` are the chain and must be covered |
 * | `study_plan` | `content_hash` | `record` | immutable; a confirmation authorises one revision, and "was this edited after it was written" is literally the question `verifyPlanConfirmation` asks |
 * | `confirmation_receipt` | `content_hash` | `record` | immutable; it is the server's record of what it observed, and an edited record of an observation has stopped being one |
 * | `study_task_authorization` | `content_hash` | `record` | immutable; nothing about running the work touches it, which is exactly what the retired `study_task` could not say |
 * | `task_outcome` | `content_hash` | `record` | immutable; written once when the work ends, never edited afterwards |
 * | `evidence_node` | `content_hash` | `record` | immutable; identity in the graph, so a relabelled node is a different node |
 * | `evidence_edge` | `content_hash` | `record` | immutable, same reason |
 * | `review_record` | `content_hash` | `record` | immutable; a review of one version of a node does not travel to the next |
 * | `reproduction_record` | `content_hash` | `record` | immutable, same reason |
 * | `execution_capsule` | `reproducibility_hash` | `record` | written once per run and never edited; `verifyExecutionCapsule` reports "unedited", which is the record question |
 * | `research_package` | `reproducibility_hash` | `record` | shipped as a file; `verifyResearchPackage` reports "the file was not edited after it was written" |
 *
 * Two consequences worth stating, because both were previously answered by one
 * digest doing two jobs.
 *
 * A `study` still has a record digest -- it is just not its identity.
 * `recordHash("study", study)` answers "was this row edited", presentation
 * included; the `content_hash` deliberately does not, so that a study can be
 * renamed and advanced without its digest moving. What every record kind
 * carrying a `study_ref` points at is neither digest: it is `study_id`, which is
 * minted once and derived from nothing.
 *
 * `study` is now the only kind whose self-hash is the semantic digest, and the
 * exception has shrunk rather than spread. `study_task` was the other one, and
 * it was there because the record mixed an authorization with a status the
 * execution system overwrote -- a digest that covered the status could not stay
 * still, so the semantic one was used to exclude it, and the record then had no
 * digest that could answer whether it had been edited. Splitting the record
 * (`task.ts`) removed the mixture instead of working around it, and all three
 * pieces that are content-addressed take the `record` digest.
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
 * The kinds this build knows and deliberately does not hash, as immutable plain
 * data.
 *
 * An `ExecutionJob` is queue status, an attempt counter, a progress figure and
 * a cancellation flag: every one of them is overwritten while the work runs,
 * which is exactly what a content address cannot survive. The retired
 * `study_task` demonstrated the cost of pretending otherwise -- it had to
 * exclude its own status from its own digest to stay referenceable, and so had
 * no digest left that could answer whether the row had been edited.
 *
 * Declared here rather than simply left out, because "we do not hash this" and
 * "we have never heard of this" are different answers and send a reader to
 * different places. A caller who hashes a job gets `NOT_CONTENT_ADDRESSED` and
 * a sentence saying which record to address instead; a caller who invents a
 * kind gets `UNKNOWN_RECORD_KIND`.
 */
export interface StudyControlPlaneKind {
    readonly record_kind: string;
    /** The content-addressed record a caller should reference instead. */
    readonly address_instead: string;
    readonly why: string;
}
export declare const STUDY_CONTROL_PLANE_KINDS: readonly StudyControlPlaneKind[];
/** The control-plane kind names, as immutable plain data. */
export declare const STUDY_CONTROL_PLANE_KIND_NAMES: readonly string[];
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
 *
 * A union contributes the fields of **every** option, because that is what the
 * completeness rule is asking: `StudyEventSchema` is a discriminated union of
 * twenty-two variants over one record kind, and a payload field carried by one
 * variant is as capable of entering a digest unclassified as a field carried by
 * all of them. Walking only the first option would let a field added to the
 * twenty-second pass unseen, which is the vacuous-completeness failure this
 * whole file exists to prevent. Paths repeated across options -- the chain
 * fields every variant carries -- are emitted once.
 */
export declare function flattenSchemaFields(schema: z.ZodTypeAny): readonly string[];
//# sourceMappingURL=registry.d.ts.map