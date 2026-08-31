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
 * A set nothing downstream can add to.
 *
 * `Object.freeze` is enough for the arrays `src/reproducibility` exports and not
 * enough for a `Set`, whose members live in an internal slot freezing does not
 * reach: `add` goes on working on a frozen one. The mutators are therefore
 * replaced before the freeze, because "this set must stay identical to its
 * Python counterpart" has to be true at run time and not only in the sentence
 * that says it -- a consumer able to add a name would be editing the rules every
 * study-v1 digest was computed under, from JavaScript, or from TypeScript with
 * one cast.
 */
function frozenKeySet(name: string, keys: Iterable<string>): ReadonlySet<string> {
  const set = new Set(keys)
  for (const method of ["add", "delete", "clear"] as const) {
    Object.defineProperty(set, method, {
      value: () => {
        throw new TypeError(
          `${name} is frozen: ${method} would change the rules every study-v1 digest was computed under, and ` +
            "every published digest with them.",
        )
      },
      writable: false,
      enumerable: false,
      configurable: false,
    })
  }
  return Object.freeze(set)
}

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
export const STUDY_EXCLUDED_KEYS: ReadonlySet<string> = frozenKeySet("STUDY_EXCLUDED_KEYS", [
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

/**
 * The rule sets this build knows, keyed by id.
 *
 * A `Map` rather than an object literal, because an object literal answers to
 * every name on `Object.prototype`: `hash_rules_id: "toString"` resolved to
 * `Function.prototype.toString` and was handed on as a rule set, so the digest
 * layer went looking for `excluded.has` on a function and threw a `TypeError`
 * where a refusal belongs. A reader then saw an internal type error instead of
 * "this build does not know those rules", and `verifyExecutionCapsule` reported
 * the wrong refusal code for it. A `Map` has no inherited entries, so an id no
 * rule set answers to is absent rather than accidentally present.
 */
const excludedByRulesId: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [STUDY_HASH_RULES_ID, STUDY_EXCLUDED_KEYS],
])

function excludedFor(rulesId: string): ReadonlySet<string> {
  const excluded = excludedByRulesId.get(rulesId)
  if (!excluded) {
    throw new Error(
      `Unknown study hash rules id ${rulesId}. Known ids: ${[...excludedByRulesId.keys()].join(", ")}.`,
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
 * Where one record ends and another begins.
 *
 * The exclusions are meant to bite at a record's own top level, and only there:
 * that is where `created_at`, `status` and `id` annotate the record rather than
 * describe it. One level down they are content like any other, so the walk below
 * has to know which objects are a top level of their own. Two markers say so,
 * and they are the two `tests/study-exclusion-collisions.test.mjs` already reads
 * off the schemas: a study-family record names its own hash rules, and a
 * `Quantity` -- or the `TextField` built on the same envelope -- pairs a value
 * with the evidence class that qualifies it.
 *
 * A marker that names no rule set this build knows is not a marker. `studyRulesIdOf`
 * refuses such an id at a record's own root, and an object below a root cannot
 * be a study record on weaker evidence than a record at one: an arbitrary string
 * in this field would otherwise buy an object the same exemption a real record has.
 */
function isEmbeddedRecord(value: Record<string, unknown>): boolean {
  const rulesId = value[STUDY_HASH_RULES_KEY]
  if (typeof rulesId === "string") {
    return excludedByRulesId.has(rulesId)
  }
  return "evidence" in value && "value" in value
}

/**
 * The excluded keys an embedded record may carry at its own top level.
 *
 * The exemption is per-key rather than per-object, because being a record is not
 * a licence to hide arbitrary content. These three are the only excluded names
 * any schema in this family declares below a record's root -- a node's and an
 * edge's `hash_rules_id`, `content_hash` and `created_at`, and a `Quantity`
 * envelope's `created_at` -- and each is a key whose being dropped cannot hide a
 * difference: the marker is one fixed known id, a `created_at` is excluded
 * everywhere by design, and a `content_hash` is recomputed from the record's own
 * contents by the graph verifier, so an edited one is caught there rather than
 * hidden here.
 *
 * Every other excluded name stays refused inside an embedded record. Without
 * that, an object carrying a marker -- or merely a `value` beside an `evidence`
 * -- could hold an `id`, a `slug` or a `visibility`, and two records differing
 * only there would be content-addressed identically.
 */
const EMBEDDED_RECORD_EXEMPT_KEYS: ReadonlySet<string> = frozenKeySet("EMBEDDED_RECORD_EXEMPT_KEYS", [
  STUDY_HASH_RULES_KEY,
  "content_hash",
  "created_at",
])

/** No exemption at all: the ordinary case, where every excluded name is refused. */
const NO_EXEMPT_KEYS: ReadonlySet<string> = frozenKeySet("NO_EXEMPT_KEYS", [])

/**
 * The first path, if any, at which the canonicalizer would silently drop data.
 *
 * Depth-first and first-hit rather than exhaustive: the refusal has to name one
 * path a reader can go and look at, and a record with one such key almost always
 * has one such key.
 */
function findNestedExcludedKey(
  value: unknown,
  path: string,
  atRecordRoot: boolean,
  excluded: ReadonlySet<string>,
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findNestedExcludedKey(value[index], `${path}[${index}]`, false, excluded)
      if (found !== null) return found
    }
    return null
  }
  if (value === null || typeof value !== "object") return null

  const source = value as Record<string, unknown>
  // Null means every excluded key is exempt, which is true only at a record's
  // own root -- the one place `id`, `slug` and `status` are annotation rather
  // than content.
  const exempt: ReadonlySet<string> | null = atRecordRoot
    ? null
    : isEmbeddedRecord(source)
      ? EMBEDDED_RECORD_EXEMPT_KEYS
      : NO_EXEMPT_KEYS
  for (const key of Object.keys(source)) {
    const here = path === "" ? key : `${path}.${key}`
    if (exempt !== null && excluded.has(key) && !exempt.has(key)) return here
    const found = findNestedExcludedKey(source[key], here, false, excluded)
    if (found !== null) return found
  }
  return null
}

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
export function assertNoNestedExcludedKeys(
  input: object,
  rulesId: string = studyRulesIdOf(input),
): void {
  const offending = findNestedExcludedKey(input, "", true, excludedFor(rulesId))
  if (offending === null) return
  const name = offending.slice(offending.lastIndexOf(".") + 1)
  throw new Error(
    `A study record must not carry an excluded key below its own top level: ${offending} is named ` +
      `"${name}", and ${rulesId} drops that name at every nesting level. The value would be gone before ` +
      "the digest was taken, so two records differing only there would be content-addressed identically. " +
      "Rename the field -- this is refused rather than hashed into a digest that omits it.",
  )
}

/**
 * An unpaired UTF-16 surrogate, and nothing else.
 *
 * The `u` flag makes the engine match code *points*, so a well-formed pair is
 * one non-surrogate code point and does not match here. What is left is exactly
 * the half-characters: a `\uD800` with no low surrogate after it, or a `\uDC00`
 * with no high surrogate before it.
 */
const UNPAIRED_SURROGATE = /\p{Surrogate}/u

/**
 * Why a value can be unhashable even though both languages will happily read it.
 *
 * Two cases, one rule: a study digest is only worth anything if the two
 * implementations of the canonical form produce the same bytes for the same
 * file, and these are the values for which they cannot.
 *
 * **An integer outside ±`Number.MAX_SAFE_INTEGER`.** Above 2^53 a JSON number is
 * an IEEE-754 double here and an arbitrary-precision integer in Python, and the
 * mapping stops being injective: near 4.2e21 a single double stands for 524287
 * distinct integers, so two research packages whose reported figure differs by
 * half a million canonicalize to one string and take one digest. Nothing on the
 * JavaScript side can tell which value was written -- the number this process
 * holds is not the number the file contains -- while Python holds the integer as
 * written and computes a different digest from the same bytes. A digest that
 * could stand for either value identifies neither, so the value is refused.
 *
 * **A string carrying an unpaired UTF-16 surrogate.** JavaScript strings are
 * sequences of code units and tolerate a lone one; `JSON.stringify` escapes it
 * and hashes the escape. Python holds the same lone surrogate and cannot encode
 * it as UTF-8 at all, so `calculate_study_hash` raises rather than returning a
 * digest. One record then hashes in one language and crashes the verifier in the
 * other, which is the worst of the three possible outcomes -- worse than two
 * digests, because the reader is left unable to check the file rather than told
 * the two answers disagree.
 */
function describeUnrepresentable(value: unknown, path: string): string | null {
  if (typeof value === "number") {
    // Non-finite first, because the integer test below answers `false` for all three
    // of them and would wave them through. `JSON.stringify` renders Infinity,
    // -Infinity and NaN as `null`, so three distinct values reach one digest -- and
    // Python's encoder emits bare `inf`/`nan`, which is not JSON and which the other
    // language cannot read back. Neither half of that is a number a study can report.
    if (!Number.isFinite(value)) {
      return (
        `${path} is ${String(value)}, which is not a finite number. JavaScript canonicalizes ` +
        "Infinity, -Infinity and NaN all to `null`, so three different values would share one digest, and " +
        "Python writes them as bare `inf` and `nan`, which is not JSON and which JavaScript cannot read back. " +
        "A measurement that overflowed or divided by zero is not a value: record what is known, or record " +
        "UNKNOWN, which this family represents explicitly."
      )
    }
    if (!Number.isInteger(value) || Math.abs(value) <= Number.MAX_SAFE_INTEGER) return null
    return (
      `${path} is ${JSON.stringify(value)}, an integer outside ±Number.MAX_SAFE_INTEGER ` +
      `(${Number.MAX_SAFE_INTEGER}). A number that size cannot be represented exactly in JavaScript, which ` +
      "reads it as the nearest double, and many distinct integers share that one double; Python holds the " +
      "integer as written. So two candidate values canonicalize to one, nothing on the JavaScript side can " +
      "tell which was meant, and the same file hashes to two different digests depending on which language " +
      "read it. Refusing is the honest answer: a digest that could stand for either value identifies neither. " +
      "Record the number as a string in a field that is not this one, or as a hash of the thing it counts."
    )
  }
  if (typeof value === "string" && UNPAIRED_SURROGATE.test(value)) {
    return (
      `${path} contains an unpaired UTF-16 surrogate. Half a character is not a character: JavaScript escapes ` +
      "it and hashes the escape, while Python cannot encode it as UTF-8 at all and raises instead of returning " +
      "a digest, so the verifier that reads the file second fails on bytes the first accepted. A byte sequence " +
      "neither language can round-trip cannot be hashed identically in both, so it is refused here rather than " +
      "hashed in one language and unreadable in the other. Remove the surrogate, or write the character it was " +
      "half of."
    )
  }
  return null
}

/**
 * The first value, if any, the two canonicalizers would not agree about.
 *
 * Depth-first and first-hit, for `findNestedExcludedKey`'s reason: the refusal
 * has to name one path a reader can go and look at. Keys are checked as strings
 * too -- a key is encoded into the canonical form exactly as a value is, and a
 * surrogate in one breaks Python's encoder in the same place.
 *
 * The walk asks only about the values a digest actually sees. Keys the exclusion
 * set drops are skipped exactly as `canonicalize` drops them: a `created_at`
 * never reaches either canonical form, so it cannot make them differ, and
 * refusing a record for something the digest never reads would send a caller to
 * change a value that was never in danger.
 */
function findUnrepresentableValue(
  value: unknown,
  path: string,
  excluded: ReadonlySet<string>,
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnrepresentableValue(value[index], `${path}[${index}]`, excluded)
      if (found !== null) return found
    }
    return null
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>
    for (const key of Object.keys(source)) {
      // Exactly what `canonicalize` skips, so this asks about the bytes that get
      // hashed rather than about the record's annotations.
      if (excluded.has(key) || source[key] === undefined) continue
      const here = path === "" ? key : `${path}.${key}`
      const inKey = describeUnrepresentable(key, `the key at ${here}`)
      if (inKey !== null) return inKey
      const found = findUnrepresentableValue(source[key], here, excluded)
      if (found !== null) return found
    }
    return null
  }
  return describeUnrepresentable(value, path === "" ? "(root)" : path)
}

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
export function assertNoUnrepresentableValues(
  input: object,
  rulesId: string = studyRulesIdOf(input),
): void {
  const offending = findUnrepresentableValue(input, "", excludedFor(rulesId))
  if (offending === null) return
  throw new Error(`A study record must not carry a value the two languages hash differently: ${offending}`)
}

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
export function canonicalStudyJson(input: object, rulesId: string = studyRulesIdOf(input)): string {
  assertNoNestedExcludedKeys(input, rulesId)
  assertNoUnrepresentableValues(input, rulesId)
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
export function verifyStudyRecordHash(input: object): {
  valid: boolean
  rules_id: string
  expected: string
  actual: string | null
} {
  const rulesId = studyRulesIdOf(input)
  const record = input as Record<string, unknown>
  const content = record.content_hash
  const reproducibility = record.reproducibility_hash
  if (typeof content === "string" && typeof reproducibility === "string") {
    throw new Error(
      "A study record must carry one self-hash field, and this one carries both content_hash and " +
        "reproducibility_hash. Neither is part of the digest, so the second could be added to a record after the " +
        "fact at no cost, and a verifier that preferred one would report the record intact on the strength of a " +
        "field nobody hashed. Remove the one the record kind does not use -- this is refused rather than resolved " +
        "by precedence.",
    )
  }
  const expected = calculateStudyHash(input, rulesId)
  const recorded = typeof content === "string" ? content : reproducibility
  return {
    valid: typeof recorded === "string" && recorded === expected,
    rules_id: rulesId,
    expected,
    actual: typeof recorded === "string" ? recorded : null,
  }
}
