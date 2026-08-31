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
 * Refuse a record whose contents hide something the digest would drop.
 *
 * `tests/study-exclusion-collisions.test.mjs` walks the generated *schemas* and
 * fails on any declared property, below a record's root, named after an excluded
 * key. That answers for the fields this family declares, and a schema can only
 * answer for those: it says nothing about a key chosen at run time. No study
 * record has such a key any more -- `StudyEnvironment` records a package name in
 * a field rather than in a key precisely so that none does -- but this function
 * takes an `object`, not a parsed record, and it is the only check a caller who
 * hand-assembles a dict ever runs. `calculateStudyHash` is public, and its
 * Python counterpart is the whole verifier some readers have.
 *
 * A canonicalizer that kept an excluded key below a root would be a second
 * canonical form, and `src/reproducibility` is deliberately the only one. So the
 * record is refused instead: this walks the actual data, and any excluded key
 * found below a record's own top level -- or below an embedded record's, beyond
 * the three that record legitimately carries -- stops the hash before it is
 * taken. Refusing costs a caller a rename; hashing would cost a reader the
 * ability to tell two different runs apart.
 */
export declare function assertNoNestedExcludedKeys(input: object, rulesId?: string): void;
/**
 * Refuse a record carrying a value the two languages would hash differently.
 *
 * The rule lives here, in the class, rather than on the fields that happened to
 * meet it first. `seed` and `resource_limits.max_memory_bytes` were bounded
 * individually and every other hashed number was not -- including
 * `Quantity.value`, which is every number a study reports -- so a package could
 * report a figure 524286 apart from another one, take the same digest, verify
 * `valid: true` with no problems, and keep every node identity, row, edge and
 * claim-map entry resolving. Meanwhile Python refused the honest file the
 * TypeScript builder had just written, because its mirror of the bound listed
 * the same two fields.
 *
 * One rule in one place is what fixes that: every study digest is taken over
 * `canonicalStudyJson`, so a record kind added tomorrow, and a field added to
 * one that exists today, are covered without anybody remembering to bound them.
 * `python/src/ketqat_runner/study_hashing.py` carries the same walk, so the two
 * languages refuse the same files.
 */
export declare function assertNoUnrepresentableValues(input: object, rulesId?: string): void;
/**
 * The canonical form of a study record.
 *
 * The rules id defaults to the one the record itself declares rather than to the
 * current id: hashing a record under rules it does not name is how a verifier
 * ends up comparing two different algorithms and blaming the record.
 *
 * Both refusals live here rather than at each call site because every study
 * digest is taken over this string: `calculateStudyHash` and the build and
 * verify paths above it inherit them by construction, and a family that gains a
 * tenth record kind cannot forget to ask.
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
 *
 * **A record carrying both is refused.** That is the same fact turned against
 * this function: because neither field is hashed, a second one can be added to a
 * finished record for nothing, and a verifier that preferred one and ignored the
 * other would read the added field and report the record intact. This is the
 * low-level verifier -- no schema has been applied when it runs, and its Python
 * counterpart is the only verifier some callers have -- so the ambiguity is
 * refused here rather than assumed away. One record, one self-hash; which name
 * it uses is the record kind's business, having two is nobody's.
 */
export declare function verifyStudyRecordHash(input: object): {
    valid: boolean;
    rules_id: string;
    expected: string;
    actual: string | null;
};
//# sourceMappingURL=hashing.d.ts.map