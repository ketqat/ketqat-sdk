import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
/**
 * One refusal vocabulary for the whole family (ketqat-sdk#259).
 *
 * A study is built out of things that are not known yet, so refusing is the
 * normal case rather than the error case: no baseline, no confirmation, a claim
 * with nothing behind it. The intelligence tier already established the shape --
 * `computeAdvantageThresholds` records `{ threshold, code, message }` and returns
 * an UNKNOWN quantity rather than a plausible number -- and this is the same
 * shape one level up.
 *
 * Codes are the contract; messages are for people. Tests assert on `code`,
 * because a refusal a caller can only detect by matching prose is a refusal that
 * breaks the day someone improves the wording. The enum is closed for the same
 * reason: a free-string code cannot be exhaustively handled, and "handled every
 * case" is the property that makes refusing safe.
 */
export declare const StudyRefusalCodeSchema: z.ZodEnum<["STUDY_HASH_RULES_ID_MISSING", "STUDY_HASH_RULES_ID_UNKNOWN", "STUDY_RECORD_NOT_HASHABLE", "INVALID_STATUS_TRANSITION", "EVENT_TYPE_NOT_PERMITTED", "EVENT_CHAIN_BROKEN", "EVENT_HEAD_MISMATCH", "REVISION_BASE_EDITED", "REVISION_BASE_MISMATCH", "REVISION_BRANCH_DETECTED", "CONFIRMATION_HASH_MISMATCH", "PLAN_REVISION_SUPERSEDED", "CONFIRMATION_RECEIPT_EDITED", "CONFIRMATION_RECEIPT_EXPIRED", "CONFIRMATION_RECEIPT_STUDY_MISMATCH", "CONFIRMATION_SCOPE_INSUFFICIENT", "TASK_REFERENCE_UNRESOLVED", "EXECUTION_CLASS_MISMATCH", "PLAN_DEPENDS_ON_UNKNOWN", "CLAIM_WITHOUT_EVIDENCE_NODE", "CLAIM_EVIDENCE_UNLINKED", "CLAIM_EVIDENCE_SELF_REFERENTIAL", "RESULT_ROW_WITHOUT_VALUE", "CLAIM_VALUE_UNKNOWN", "EVIDENCE_NODE_UNRESOLVED", "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED", "CLAIM_NOT_GROUNDED", "CLAIM_SUPPORT_BRANCH_UNGROUNDED", "CLAIM_EVIDENCE_CONTRADICTS", "CLAIM_MAP_DUPLICATE_ENTRY", "EVIDENCE_EDGE_NOT_PERMITTED", "EVIDENCE_EDGE_DUPLICATE", "EVIDENCE_NODE_DUPLICATE", "EVIDENCE_GRAPH_CYCLE", "EVIDENCE_SUPERSESSION_BRANCH", "EVIDENCE_GRAPH_STUDY_MISMATCH", "EVIDENCE_REFERENCE_DISAGREES", "EVIDENCE_RECORD_KIND_UNKNOWN", "EVIDENCE_NODE_KIND_MISMATCH", "EVIDENCE_NODE_NOT_PUBLIC", "CREDITS_MAXIMUM_EXCEEDED", "BASELINE_SOURCE_UNKNOWN", "VERIFIED_PROSE_NOT_GROUNDED", "REPORT_REFERENCE_UNRESOLVED", "REPORT_REFERENCE_KIND_MISMATCH", "REPORT_DUPLICATE_ID", "TABLE_CELL_WITHOUT_NODE", "TABLE_SHAPE_MISMATCH", "TABLE_CSV_ARTIFACT_MISMATCH", "FIGURE_RAW_SVG_REFUSED", "FIGURE_POINT_UNRESOLVED", "SVG_SCRIPT_REFUSED", "SVG_FOREIGN_OBJECT_REFUSED", "SVG_EXTERNAL_REFERENCE_REFUSED", "SVG_EVENT_HANDLER_REFUSED", "SVG_ELEMENT_NOT_PERMITTED", "RECIPE_RUNNER_NOT_APPROVED", "RECIPE_ARGUMENT_UNSAFE", "RECIPE_ENVIRONMENT_NOT_ALLOWLISTED", "RECIPE_ARTIFACT_UNRESOLVED", "RECIPE_NETWORK_POLICY_INCONSISTENT", "CHECK_LEDGER_ENTRY_INCOMPLETE", "CHECK_LEDGER_DUPLICATE_ID", "CHECK_LEDGER_REQUIRED_CHECK_ABSENT", "BUNDLE_UNRESOLVED", "BUNDLE_KIND_MISMATCH", "BUNDLE_HASH_MISMATCH", "BUNDLE_SCIENCE_NOT_RECOMPUTED", "BUNDLE_FIELD_UNRESOLVED", "CLAIM_BUNDLE_FIELD_MISSING", "OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED", "PACKAGE_LIMIT_EXCEEDED"]>;
export type StudyRefusalCode = z.infer<typeof StudyRefusalCodeSchema>;
export interface StudyRefusal {
    subject: string;
    code: StudyRefusalCode;
    message: string;
}
export declare const StudyRefusalSchema: Contract<StudyRefusal>;
/**
 * The rules a record names, or the refusal that it names none this build has.
 *
 * Asked before the digest rather than left to it, and the reason is the order
 * of the two answers. "We do not know how to hash this" and "this is not a
 * capsule" are different findings, and reporting the second when the first is
 * true sends a reader looking for a schema bug in a record that simply names a
 * rule set nobody here implements.
 *
 * Nothing is inferred from silence (ADR 0010): a study record without a rules
 * id is malformed rather than old, and the two cases are separate codes because
 * they need separate fixes -- one asks a producer to mark the record, the other
 * says this build cannot verify it at all and no amount of editing here will
 * change that.
 */
export declare function studyRulesIdRefusal(subject: string, record: object): StudyRefusal | null;
/**
 * A hashing-core refusal, in this family's vocabulary.
 *
 * One code for the whole class, because the class is one thing: the record
 * cannot be projected and canonicalized, so there is no digest to compare a
 * stored hash against. Which of the closed list in `limits.ts` fired --
 * `UNDECLARED_FIELD`, `SHAPE_MISMATCH`, `NON_FINITE_NUMBER`, `LONE_SURROGATE`,
 * `MAX_DEPTH_EXCEEDED` -- is carried in the message together with the path,
 * because that is what tells a reader which field to go and look at, and a
 * caller branching on a refusal needs to handle the class rather than enumerate
 * twenty ways of being unhashable.
 *
 * Anything that is not a hashing refusal is rethrown. An `Error` this layer did
 * not raise is a bug here rather than a finding about the record, and
 * translating it into a refusal would report the record as the problem.
 */
export declare function studyNotHashableRefusal(subject: string, error: unknown): StudyRefusal;
//# sourceMappingURL=refusals.d.ts.map