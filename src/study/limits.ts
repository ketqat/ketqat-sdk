/**
 * What the study hashing entry points refuse, and the bounds they refuse past
 * (goal §3.5).
 *
 * Every refusal in the hashing core carries a code from the closed list below.
 * A code is what a caller can branch on and a Python verifier can mirror; a
 * message is what a reader can act on. Both are required, because the two
 * audiences are different people.
 *
 * The bounds exist because a hash function is reachable from a file somebody
 * else wrote. Depth, node count and canonical size are the three ways a
 * well-formed JSON document turns into unbounded work here, and each is bounded
 * by a number rather than by the recursion limit of whichever language read the
 * file first -- a limit that differs between the two implementations is a
 * document one of them hashes and the other cannot.
 *
 * **Rules are exported as immutable plain data.** `Object.freeze` on an array
 * or a plain object makes the exported value genuinely unwritable; on a `Set`
 * it does not, because a `Set`'s members live in an internal slot the freeze
 * does not reach and `add` goes on working. So nothing here exports a `Set` or
 * a `Map`. The working lookup structures are module-private, built once from
 * the frozen data, and never handed out. `tests/study-hash-core.test.mjs` runs
 * the attacks: `Set.prototype.add.call` on an exported value, method borrowing,
 * property replacement, and `Object.prototype` pollution against every lookup.
 */

/**
 * Every way the hashing core can refuse, named.
 *
 * Kept as a readonly tuple rather than an enum so the same list can be
 * serialized into the cross-language fixture and compared against
 * `python/src/ketqat_runner/study_limits.py` byte for byte.
 */
export const STUDY_HASH_REFUSAL_CODES: readonly string[] = Object.freeze([
  // Values outside the JSON data model.
  "NOT_JSON_UNDEFINED",
  "NOT_JSON_FUNCTION",
  "NOT_JSON_SYMBOL",
  "NOT_JSON_BIGINT",
  "NOT_JSON_VALUE",
  // Values inside the JSON syntax that JCS itself refuses (RFC 8785 §3.2.2.2,
  // §3.2.2.3), plus the one the two languages disagree about. `UNSAFE_INTEGER`
  // is raised by `readStudyFileBytes` rather than by the canonicalizer, because
  // it is a fact about a *literal* and this language has thrown that away by the
  // time it holds a number: `1e30` and `1000000000000000000000000000000` are one
  // double here and a float and an int in Python. See `file.ts`.
  "NON_FINITE_NUMBER",
  "LONE_SURROGATE",
  "UNSAFE_INTEGER",
  // Structural bounds.
  "CYCLE",
  "MAX_DEPTH_EXCEEDED",
  "MAX_NODES_EXCEEDED",
  "MAX_CANONICAL_BYTES_EXCEEDED",
  // Raw-byte file verification.
  "BYTE_ORDER_MARK",
  "INVALID_UTF8",
  "INVALID_JSON",
  "DUPLICATE_PROPERTY",
  // Projection and preimage.
  "UNKNOWN_RECORD_KIND",
  // A kind this build knows and deliberately does not hash. Separate from
  // `UNKNOWN_RECORD_KIND` because the two send a reader to different places:
  // one says nobody declared this, the other says we declared it as
  // control-plane state whose whole point is that it changes (`task.ts`).
  "NOT_CONTENT_ADDRESSED",
  "UNKNOWN_HASH_RULES_ID",
  "MISSING_HEADER_COMPONENT",
  "INVALID_HEADER_COMPONENT",
  "EMPTY_PROJECTION",
  "SHAPE_MISMATCH",
  "UNDECLARED_FIELD",
  "INVALID_EXACT_NUMBER_STRING",
])

export type StudyHashRefusalCode = (typeof STUDY_HASH_REFUSAL_CODES)[number]

/**
 * The lookup, module-private and built from the frozen tuple.
 *
 * This is the pattern every rule set in the core follows: the exported value is
 * plain frozen data, the `Set` that makes membership cheap never leaves the
 * module, and the two cannot drift because one is built from the other at load.
 */
const refusalCodes = new Set<string>(STUDY_HASH_REFUSAL_CODES)

export function isStudyHashRefusalCode(value: string): boolean {
  return refusalCodes.has(value)
}

/**
 * A refusal from the hashing core.
 *
 * `path` is a dotted/indexed location inside the value being hashed, or null
 * for a refusal about the value as a whole. It exists so a reader is sent to
 * one place to look rather than told that something, somewhere, is wrong.
 */
export class StudyHashRefusalError extends Error {
  readonly code: StudyHashRefusalCode
  readonly path: string | null

  constructor(code: StudyHashRefusalCode, message: string, path: string | null = null) {
    super(path === null ? message : `${path}: ${message}`)
    this.name = "StudyHashRefusalError"
    this.code = code
    this.path = path
  }
}

export function refuse(
  code: StudyHashRefusalCode,
  message: string,
  path: string | null = null,
): never {
  throw new StudyHashRefusalError(code, message, path)
}

/**
 * The structural bounds, as immutable plain data.
 *
 * `max_depth` is generous for a study record -- the deepest declared shape in
 * the family nests five levels -- and small enough that neither language runs
 * out of stack before the bound is reached. `max_nodes` counts every value the
 * serializer visits, so a document that is wide rather than deep is bounded
 * too. `max_canonical_bytes` bounds the output rather than the input, which is
 * what a digest actually consumes.
 *
 * These three numbers must stay identical to `STUDY_HASH_LIMITS` in
 * `python/src/ketqat_runner/study_limits.py`; the cross-language fixture fails
 * if they drift, because a limit that differs between the languages is a file
 * one of them hashes and the other refuses.
 */
export interface StudyHashLimits {
  readonly max_depth: number
  readonly max_nodes: number
  readonly max_canonical_bytes: number
}

export const STUDY_HASH_LIMITS: StudyHashLimits = Object.freeze({
  max_depth: 64,
  max_nodes: 100000,
  max_canonical_bytes: 8388608,
})
