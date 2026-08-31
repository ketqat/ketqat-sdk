import { z } from "zod";
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
export const StudyRefusalCodeSchema = z.enum([
    /** The record does not name its hash rules. Nothing is inferred from silence. */
    "STUDY_HASH_RULES_ID_MISSING",
    /** The record names rules this build does not have. Never treated as current. */
    "STUDY_HASH_RULES_ID_UNKNOWN",
    /** The requested status is not reachable from the current one. */
    "INVALID_STATUS_TRANSITION",
    /** An event does not follow the hash of the event before it. History was rewritten. */
    "EVENT_CHAIN_BROKEN",
    /** Work was requested against a plan nobody confirmed. */
    "PLAN_NOT_CONFIRMED",
    /** The confirmed hash is not what the plan's own contents canonicalize to. */
    "CONFIRMATION_HASH_MISMATCH",
    /** The confirmation names a revision a later one has replaced. */
    "PLAN_REVISION_SUPERSEDED",
    /** The plan rests on a value that is UNKNOWN, so its conclusion cannot be drawn. */
    "PLAN_DEPENDS_ON_UNKNOWN",
    /** A claim is asserted with no evidence node behind it. The export refuses; it does not warn. */
    "CLAIM_WITHOUT_EVIDENCE_NODE",
    /** A claim asserts an unknown value. An unknown belongs in a quantity node, not in an assertion. */
    "CLAIM_VALUE_UNKNOWN",
    /** A hash in a row or a claim map names a node the package does not carry. */
    "EVIDENCE_NODE_UNRESOLVED",
    /** An edge points at a node that is not in the graph. */
    "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
    /** The run would cost more than the maximum the user set. Their number, not an estimate. */
    "CREDITS_MAXIMUM_EXCEEDED",
    /** The baseline's provenance was never established, so no economic claim rests on it. */
    "BASELINE_SOURCE_UNKNOWN",
]);
export const StudyRefusalSchema = z.object({
    /** Which record, field or claim was refused. A refusal that does not say what it is about is a mood. */
    subject: z.string().min(1),
    code: StudyRefusalCodeSchema,
    /** What would have to be true instead, in words a reader can act on. */
    message: z.string().min(1),
});
//# sourceMappingURL=refusals.js.map