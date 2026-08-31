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
export declare const STUDY_HASH_RULES_ID = "study-v1";
/** Where a study record names its rules. Never itself hashed. */
export declare const STUDY_HASH_RULES_KEY = "hash_rules_id";
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
export declare const STUDY_EXCLUDED_KEYS: ReadonlySet<string>;
/**
 * Which rules a study record was hashed under, or a refusal.
 *
 * Inputs are typed `object` rather than `Record<string, unknown>` so the
 * hand-written record interfaces in this family -- which have no index signature
 * -- can be passed without a cast at every call site. The canonicalizer walks
 * values and never names a field, so nothing narrower is needed.
 */
export declare function studyRulesIdOf(input: object): string;
/**
 * The canonical form of a study record.
 *
 * The rules id defaults to the one the record itself declares rather than to the
 * current id: hashing a record under rules it does not name is how a verifier
 * ends up comparing two different algorithms and blaming the record.
 */
export declare function canonicalStudyJson(input: object, rulesId?: string): string;
export declare function calculateStudyHash(input: object, rulesId?: string): string;
/**
 * Recompute a study record's hash under the rules it names.
 *
 * `content_hash` and `reproducibility_hash` are both accepted because the family
 * uses both: revisioned records carry a `content_hash` that *is* their identity,
 * while an execution capsule and a research package carry a
 * `reproducibility_hash` with recompute semantics. Both are excluded from the
 * digest, so which one a record uses cannot change the answer.
 */
export declare function verifyStudyRecordHash(input: object): {
    valid: boolean;
    rules_id: string;
    expected: string;
    actual: string | null;
};
//# sourceMappingURL=hashing.d.ts.map