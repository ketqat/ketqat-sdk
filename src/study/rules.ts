/**
 * The names the `study` family hashes under (ADR 0010, superseded in its
 * exclusion clause by the projection decision).
 *
 * These four strings are the only vocabulary shared between the hashing core
 * and the record modules, so they live in a module of their own: the core must
 * be importable without dragging in a record schema, and a record module must
 * be able to name its rules without importing a canonicalizer.
 *
 * `study-v1` keeps its name. Nothing has ever been published under it -- npm
 * 404, PyPI 404, no releases, no study surface in the live API -- so the rules
 * behind the name changed rather than the name in front of them, and no digest
 * anywhere verifies under the rules this id used to mean.
 */

/**
 * The organisation and contract family, as one ASCII token.
 *
 * First component of every preimage header. Two families that reached the same
 * canonical bytes would otherwise share a digest namespace, and "the same
 * bytes" is not a rare accident between two families that both hash small
 * records of hashes.
 */
export const STUDY_HASH_DOMAIN = "ketqat.study"

/** The rule set this build computes and verifies under. */
export const STUDY_HASH_RULES_ID = "study-v1"

/**
 * Where a study record names its rules.
 *
 * Deliberately not `reproducibility_hash_version`: `hashVersionOf` in
 * `src/reproducibility` reports version 1 for any marker that is not a number,
 * so a string id written there would not fail -- it would verify the record
 * under version 1 rules and report success. A silent wrong answer is worse than
 * a refusal.
 */
export const STUDY_HASH_RULES_KEY = "hash_rules_id"

/** Where a study record names its schema version. Also a header component. */
export const STUDY_SCHEMA_VERSION_KEY = "schema_version"

/**
 * The rule ids this build knows, as immutable plain data.
 *
 * A readonly tuple rather than a `Set`, for the reason `limits.ts` states at
 * length: a `Set` handed to a consumer is a rule list that consumer can edit.
 * The lookup structure is module-private in `registry.ts`.
 */
export const STUDY_KNOWN_HASH_RULES_IDS: readonly string[] = Object.freeze([STUDY_HASH_RULES_ID])
