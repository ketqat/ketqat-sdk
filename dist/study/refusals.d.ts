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
export declare const StudyRefusalCodeSchema: z.ZodEnum<["STUDY_HASH_RULES_ID_MISSING", "STUDY_HASH_RULES_ID_UNKNOWN", "STUDY_EXCLUDED_KEY_NESTED", "STUDY_VALUE_NOT_REPRESENTABLE", "INVALID_STATUS_TRANSITION", "EVENT_CHAIN_BROKEN", "PLAN_NOT_CONFIRMED", "CONFIRMATION_HASH_MISMATCH", "PLAN_REVISION_SUPERSEDED", "PLAN_DEPENDS_ON_UNKNOWN", "CLAIM_WITHOUT_EVIDENCE_NODE", "CLAIM_EVIDENCE_UNLINKED", "CLAIM_EVIDENCE_SELF_REFERENTIAL", "RESULT_ROW_WITHOUT_VALUE", "CLAIM_VALUE_UNKNOWN", "EVIDENCE_NODE_UNRESOLVED", "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED", "CREDITS_MAXIMUM_EXCEEDED", "BASELINE_SOURCE_UNKNOWN"]>;
export type StudyRefusalCode = z.infer<typeof StudyRefusalCodeSchema>;
export interface StudyRefusal {
    subject: string;
    code: StudyRefusalCode;
    message: string;
}
export declare const StudyRefusalSchema: Contract<StudyRefusal>;
//# sourceMappingURL=refusals.d.ts.map