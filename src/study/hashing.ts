import { createHash } from "node:crypto"
import {
  HASH_VERSION_KEY,
  IDENTITY_KEYS,
  TIMING_KEYS,
  canonicalJsonForExcludedKeys,
} from "../reproducibility/index.js"

/**
 * The `study-v1` hash rules (ketqat-sdk#259, ADR 0010).
 *
 * The canonical form is the one `src/reproducibility` already publishes --
 * recursive key sort, `undefined` dropped, `null` kept, `JSON.stringify` float
 * rendering, sha256 as lowercase hex. Only the exclusion set differs, and only
 * how a record names its rules differs. Nothing in the legacy registry is read,
 * written or extended here, so every hash ever published still verifies under
 * exactly the algorithm that produced it.
 *
 * Two decisions are load-bearing.
 *
 * **The rules id is a string, in its own field.** `hashVersionOf` reports
 * version 1 for any marker that is not a number, so writing `"study-v1"` into
 * `reproducibility_hash_version` would not fail -- it would quietly verify the
 * record under version 1 rules and report success. A silent wrong answer is
 * worse than either a right one or a refusal, so the family marks itself in
 * `hash_rules_id` instead, where the legacy verifier cannot mistake it for
 * anything.
 *
 * **Nothing is inferred.** ADR 0006's "no marker means version 1" is correct for
 * a registry whose records predate versioning; this family has no such history,
 * and a study record without a rules id is not an old record but a malformed
 * one. It is refused rather than defaulted, in both languages.
 */

export const STUDY_HASH_RULES_ID = "study-v1"

/** Where a study record names its rules. Never itself hashed. */
export const STUDY_HASH_RULES_KEY = "hash_rules_id"

/**
 * What `study-v1` leaves out.
 *
 * The identity and timing lists are inherited from `src/reproducibility` by
 * reference, not copied: a study record's `created_at` is as volatile as a
 * benchmark result's, and version 2's finding -- that a duration is an artifact
 * of running rather than a result -- holds here unchanged. A duration that
 * genuinely *is* a result wears a `Quantity` under a name of its own and hashes
 * like any other measurement.
 *
 * The four family-specific entries below are all cases of the same rule: a field
 * whose value is a consequence of something else must not be able to move a hash
 * on its own.
 *
 * This set must stay identical to `STUDY_EXCLUDED_KEYS` in
 * `python/src/ketqat_runner/study_hashing.py`; the parity fixtures fail if it
 * drifts.
 */
export const STUDY_EXCLUDED_KEYS: ReadonlySet<string> = new Set<string>([
  ...IDENTITY_KEYS,
  // Inert on a study record, but a legacy marker that found its way onto one
  // must not be able to change its hash either.
  HASH_VERSION_KEY,
  ...TIMING_KEYS,
  // The marker never hashes itself; `HASH_VERSION_KEY` has always worked this
  // way, and a marker inside its own digest cannot be checked without first
  // assuming the answer.
  STUDY_HASH_RULES_KEY,
  // A record's own hash field. `reproducibility_hash` is already an identity
  // key; records that name theirs `content_hash` need the same exemption.
  "content_hash",
  // Denormalized lifecycle state. A study's status is a projection of its event
  // trail and never a source of truth (ADR 0010), so the same study at DRAFT and
  // at CONCLUDED is the same study, with the same hash, and the trail is where
  // the change is recorded.
  "status",
  // Denormalized pointers at the newest specification and plan revisions. They
  // move every time a revision is added; the revisions themselves are immutable
  // and individually hashed, which is where that history actually lives.
  "latest_specification",
  "latest_plan",
])

const excludedByRulesId: Record<string, ReadonlySet<string>> = {
  [STUDY_HASH_RULES_ID]: STUDY_EXCLUDED_KEYS,
}

function excludedFor(rulesId: string): ReadonlySet<string> {
  const excluded = excludedByRulesId[rulesId]
  if (!excluded) {
    throw new Error(
      `Unknown study hash rules id ${rulesId}. Known ids: ${Object.keys(excludedByRulesId).join(", ")}.`,
    )
  }
  return excluded
}

/**
 * Which rules a study record was hashed under, or a refusal.
 *
 * Inputs are typed `object` rather than `Record<string, unknown>` so the
 * hand-written record interfaces in this family -- which have no index signature
 * -- can be passed without a cast at every call site. The canonicalizer walks
 * values and never names a field, so nothing narrower is needed.
 */
export function studyRulesIdOf(input: object): string {
  const recorded = (input as Record<string, unknown>)[STUDY_HASH_RULES_KEY]
  if (typeof recorded !== "string" || recorded.length === 0) {
    throw new Error(
      "A study-family record must name its hash rules id explicitly; nothing is inferred. " +
        "A record without one is refused, not defaulted (ADR 0010).",
    )
  }
  // An id no rule set answers to is refused here rather than at the digest, so a
  // caller that only asks which rules apply is told the same thing as one that
  // asks for the hash. A future `study-v2` is a new entry, never a reinterpretation
  // of this one.
  excludedFor(recorded)
  return recorded
}

/**
 * The canonical form of a study record.
 *
 * The rules id defaults to the one the record itself declares rather than to the
 * current id: hashing a record under rules it does not name is how a verifier
 * ends up comparing two different algorithms and blaming the record.
 */
export function canonicalStudyJson(input: object, rulesId: string = studyRulesIdOf(input)): string {
  return canonicalJsonForExcludedKeys(input, excludedFor(rulesId))
}

export function calculateStudyHash(input: object, rulesId: string = studyRulesIdOf(input)): string {
  return createHash("sha256").update(canonicalStudyJson(input, rulesId)).digest("hex")
}

/**
 * Recompute a study record's hash under the rules it names.
 *
 * `content_hash` and `reproducibility_hash` are both accepted because the family
 * uses both: revisioned records carry a `content_hash` that *is* their identity,
 * while an execution capsule and a research package carry a
 * `reproducibility_hash` with recompute semantics. Both are excluded from the
 * digest, so which one a record uses cannot change the answer.
 */
export function verifyStudyRecordHash(input: object): {
  valid: boolean
  rules_id: string
  expected: string
  actual: string | null
} {
  const rulesId = studyRulesIdOf(input)
  const expected = calculateStudyHash(input, rulesId)
  const record = input as Record<string, unknown>
  const recorded = typeof record.content_hash === "string" ? record.content_hash : record.reproducibility_hash
  return {
    valid: typeof recorded === "string" && recorded === expected,
    rules_id: rulesId,
    expected,
    actual: typeof recorded === "string" ? recorded : null,
  }
}
