import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { StudyHashRefusalError } from "./limits.js"
import { STUDY_HASH_RULES_KEY, STUDY_KNOWN_HASH_RULES_IDS } from "./rules.js"

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
  /**
   * The hashing core refused this record, so no digest exists to report.
   *
   * One code for the whole class, because the class is one thing: the record
   * cannot be projected and canonicalized, so there is nothing to compare a
   * stored hash against. The hashing core's own code -- `UNDECLARED_FIELD`,
   * `SHAPE_MISMATCH`, `NON_FINITE_NUMBER`, `LONE_SURROGATE`,
   * `MAX_DEPTH_EXCEEDED` and the rest of the closed list in `limits.ts` -- is
   * carried in the message, where it names the field and the path a reader has
   * to go and look at.
   *
   * It replaces two codes that named the retired rules rather than the failure:
   * `STUDY_EXCLUDED_KEY_NESTED` described a key the digest would have dropped,
   * and there is no such key any more -- the projection reads declared fields
   * and refuses the rest -- while `STUDY_VALUE_NOT_REPRESENTABLE` described a
   * blanket bound on integers that the typed number contracts replace.
   */
  "STUDY_RECORD_NOT_HASHABLE",
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
  /**
   * The claim map cites evidence that no edge in the package joins to the claim.
   * Resolving a hash proves the record is carried; only an edge asserts that it
   * backs anything, and the edge is where the rationale and the asserter live.
   */
  "CLAIM_EVIDENCE_UNLINKED",
  /** A node is cited as its own evidence. Restating a claim establishes nothing. */
  "CLAIM_EVIDENCE_SELF_REFERENTIAL",
  /** A result row names a node that carries no value, so the row has no number to read. */
  "RESULT_ROW_WITHOUT_VALUE",
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
])
export type StudyRefusalCode = z.infer<typeof StudyRefusalCodeSchema>

export interface StudyRefusal {
  subject: string
  code: StudyRefusalCode
  message: string
}

export const StudyRefusalSchema: Contract<StudyRefusal> = z.object({
  /** Which record, field or claim was refused. A refusal that does not say what it is about is a mood. */
  subject: z.string().min(1),
  code: StudyRefusalCodeSchema,
  /** What would have to be true instead, in words a reader can act on. */
  message: z.string().min(1),
}).strict()

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
export function studyRulesIdRefusal(subject: string, record: object): StudyRefusal | null {
  const recorded = Object.prototype.hasOwnProperty.call(record, STUDY_HASH_RULES_KEY)
    ? (record as Record<string, unknown>)[STUDY_HASH_RULES_KEY]
    : undefined
  if (typeof recorded !== "string" || recorded.length === 0) {
    return {
      subject,
      code: "STUDY_HASH_RULES_ID_MISSING",
      message:
        `A study-family record must name its hash rules in ${STUDY_HASH_RULES_KEY}; nothing is inferred from ` +
        "silence. A record without one is refused, not defaulted (ADR 0010).",
    }
  }
  if (!STUDY_KNOWN_HASH_RULES_IDS.includes(recorded)) {
    return {
      subject,
      code: "STUDY_HASH_RULES_ID_UNKNOWN",
      message:
        `This build does not know the hash rules id ${JSON.stringify(recorded)}. Known ids: ` +
        `${STUDY_KNOWN_HASH_RULES_IDS.join(", ")}. A future study-v2 is a new rule set, never a ` +
        "reinterpretation of this one, so a record naming it is not verifiable here.",
    }
  }
  return null
}

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
export function studyNotHashableRefusal(subject: string, error: unknown): StudyRefusal {
  if (!(error instanceof StudyHashRefusalError)) throw error
  return {
    subject,
    code: "STUDY_RECORD_NOT_HASHABLE",
    message: `${error.code}: ${error.message}`,
  }
}
