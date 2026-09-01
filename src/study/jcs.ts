import {
  STUDY_HASH_LIMITS,
  refuse,
  type StudyHashLimits,
} from "./limits.js"

/**
 * RFC 8785 -- JSON Canonicalization Scheme (JCS).
 *
 * Written against the RFC rather than against the other implementation. The
 * point of adopting a published scheme is that cross-language byte agreement
 * stops being a coincidence maintained by hand between two canonicalizers and
 * becomes conformance to a specification that ships its own test vectors: when
 * this file and `python/src/ketqat_runner/study_jcs.py` disagree, at least one
 * of them fails the RFC's vectors, so the fixtures say which one is wrong
 * instead of merely that they differ.
 *
 * The three things the RFC fixes are the three that bit this repository:
 *
 * - **Property order** (§3.2.3) is ascending over UTF-16 code units, not code
 *   points and not UTF-8 bytes. The distinction is visible: an astral character
 *   such as U+1F600 sorts as its high surrogate D83D, so it precedes U+FB33 --
 *   which code-point order would put first. The RFC's own sorting vector is
 *   pinned as a fixture precisely because a Python implementation that sorts
 *   its native strings gets this wrong and nothing else notices.
 *
 * - **Numbers** (§3.2.2.3) are serialized by ECMAScript `Number::toString`
 *   (ECMA-262 §7.1.12.1), so `3.0` renders `3`, `-0` renders `0`, `1e21` and
 *   `1e-7` sit on the two exponent boundaries, and `4.50` renders `4.5`. This
 *   file delegates to `String(value)`, which *is* that operation -- implementing
 *   it by hand here would be a second, worse copy of the reference the RFC
 *   normatively cites. Python has no such operation and implements the
 *   algorithm explicitly; both run the RFC's Appendix B table.
 *
 * - **String escaping** (§3.2.2.2) is the short list: `\b \t \n \f \r` for the
 *   five named controls, lowercase `\uhhhh` for every other C0 control, `\"`
 *   and `\\`, and every other code point as itself. Nothing else is escaped --
 *   not `/`, not non-ASCII.
 *
 * **No Unicode normalization is performed, ever** (§3.1). NFC and NFD are
 * different byte sequences and therefore different records. A canonicalizer
 * that normalized would silently merge two documents a user can see are
 * different, and would make the digest depend on which normalization library
 * happened to be linked in. If a producer needs NFC, it normalizes before the
 * record is written, where the change is visible in the file.
 *
 * Two refusals are the RFC's own: a lone surrogate (§3.2.2.2 note) and a
 * non-finite number (§3.2.2.3 note) must terminate canonicalization with an
 * error rather than produce bytes. Everything else refused here is refused
 * because it is outside the JSON data model JCS is defined over.
 */

/** The JSON data model, which is the whole of what JCS is defined over. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/**
 * ECMAScript `Number::toString` (ECMA-262 §7.1.12.1), which RFC 8785 §3.2.2.3
 * requires, minus the two values JSON cannot carry.
 *
 * `String(-0)` is `"0"` by that algorithm, so minus zero needs no special case
 * here; it needs one in Python, where it does not.
 */
export function serializeJcsNumber(value: number, path: string | null = null): string {
  if (!Number.isFinite(value)) {
    refuse(
      "NON_FINITE_NUMBER",
      `${String(value)} is not a JSON number. RFC 8785 §3.2.2.3 requires a compliant implementation to ` +
        "terminate on NaN and Infinity rather than serialize them: JSON has no syntax for either, and the two " +
        "languages disagree about what to write instead -- one emits `null`, collapsing three distinct values " +
        "onto one digest, the other emits bare `nan`, which is not JSON and which the first cannot read back.",
      path,
    )
  }
  return String(value)
}

const CONTROL_ESCAPES: Readonly<Record<number, string>> = Object.freeze({
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
})

/**
 * RFC 8785 §3.2.2.2 string serialization, including the enclosing quotes.
 *
 * Written out rather than delegated to `JSON.stringify` so the rule a reader
 * checks against the RFC is the rule that runs. The two agree today; the escape
 * table is short enough that saying so in code costs less than assuming it.
 */
export function serializeJcsString(value: string, path: string | null = null): string {
  const out: string[] = ['"']
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit < 0x20) {
      const named = CONTROL_ESCAPES[unit]
      out.push(named ?? `\\u${unit.toString(16).padStart(4, "0")}`)
      continue
    }
    if (unit === 0x22) {
      out.push('\\"')
      continue
    }
    if (unit === 0x5c) {
      out.push("\\\\")
      continue
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = index + 1 < value.length ? value.charCodeAt(index + 1) : Number.NaN
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        refuse("LONE_SURROGATE", loneSurrogateMessage(unit, "high"), path)
      }
      out.push(value[index] as string, value[index + 1] as string)
      index += 1
      continue
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      refuse("LONE_SURROGATE", loneSurrogateMessage(unit, "low"), path)
    }
    out.push(value[index] as string)
  }
  out.push('"')
  return out.join("")
}

function loneSurrogateMessage(unit: number, half: "high" | "low"): string {
  return (
    `the string contains a lone ${half} surrogate U+${unit.toString(16).toUpperCase().padStart(4, "0")}. ` +
    "RFC 8785 §3.2.2.2 requires a compliant implementation to terminate on one: half a character is not a " +
    "character, JavaScript will escape it and hash the escape, and Python cannot encode it as UTF-8 at all and " +
    "raises instead of returning a digest -- so the verifier that reads the file second fails on bytes the first " +
    "accepted. Write the character it was half of, or remove it."
  )
}

/**
 * RFC 8785 §3.2.3 property ordering: ascending over UTF-16 code units.
 *
 * The RFC states the rule in terms of the `<` operator over arrays of code
 * units, which is exactly what JavaScript's relational comparison on strings
 * already is, so the comparator says so rather than reimplementing it. Python
 * compares native strings by code point and needs an explicit conversion; that
 * difference is the entire reason this rule is pinned by a fixture.
 */
function compareUtf16CodeUnits(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

interface Walk {
  readonly limits: StudyHashLimits
  readonly parents: Set<object>
  readonly out: string[]
  nodes: number
  length: number
}

/**
 * Append one fragment, counting it.
 *
 * A UTF-8 byte is never shorter than the UTF-16 code unit that produced it, so
 * counting code units here bounds the encoded size early -- a pathological
 * document is refused while it is being serialized rather than after it has
 * been serialized in full. The exact byte count is checked once, on the encoded
 * result, because the bound is stated in bytes.
 */
function emit(state: Walk, fragment: string): void {
  state.out.push(fragment)
  state.length += fragment.length
  if (state.length > state.limits.max_canonical_bytes) {
    refuse(
      "MAX_CANONICAL_BYTES_EXCEEDED",
      `the canonical form is longer than ${state.limits.max_canonical_bytes} bytes.`,
    )
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function describeNonJson(value: unknown, path: string): never {
  const type = typeof value
  if (type === "undefined") {
    refuse(
      "NOT_JSON_UNDEFINED",
      "`undefined` is not a JSON value. It is refused rather than dropped, because a dropped key is a difference " +
        "two records can have that their digests cannot show -- and refused rather than written as `null`, " +
        "because absent and null are different statements in this family.",
      path,
    )
  }
  if (type === "function") {
    refuse("NOT_JSON_FUNCTION", "a function is not a JSON value, and cannot be canonicalized.", path)
  }
  if (type === "symbol") {
    refuse("NOT_JSON_SYMBOL", "a symbol is not a JSON value, and cannot be canonicalized.", path)
  }
  if (type === "bigint") {
    refuse(
      "NOT_JSON_BIGINT",
      "a BigInt is not a JSON value, and never reaches JSON here. An integer that needs more than 53 bits is " +
        "carried as a validated decimal string -- see `exactIntegerString` in `values.ts` -- so that the two " +
        "languages hash the digits that were written rather than two different roundings of them.",
      path,
    )
  }
  refuse(
    "NOT_JSON_VALUE",
    `a ${Object.prototype.toString.call(value)} is not a JSON value. JCS is defined over the JSON data model and ` +
      "nothing else; a Date, a Map, a class instance or an object with accessor properties would have to be " +
      "converted first, and this layer refuses rather than choosing a conversion on the caller's behalf.",
    path,
  )
}

function walk(value: unknown, path: string, depth: number, state: Walk): void {
  state.nodes += 1
  if (state.nodes > state.limits.max_nodes) {
    refuse(
      "MAX_NODES_EXCEEDED",
      `the value has more than ${state.limits.max_nodes} nodes. A digest is reachable from a file somebody else ` +
        "wrote, so the work it can cause is bounded by a number both languages share rather than by whichever " +
        "one happened to read the file first.",
      path,
    )
  }
  if (depth > state.limits.max_depth) {
    refuse(
      "MAX_DEPTH_EXCEEDED",
      `the value nests deeper than ${state.limits.max_depth} levels. The deepest shape this family declares nests ` +
        "five, so a document past this bound is not a study record; it is a stack overflow with a schema on top.",
      path,
    )
  }

  if (value === null) {
    emit(state, "null")
  } else if (typeof value === "boolean") {
    emit(state, value ? "true" : "false")
  } else if (typeof value === "number") {
    emit(state, serializeJcsNumber(value, path))
  } else if (typeof value === "string") {
    emit(state, serializeJcsString(value, path))
  } else if (typeof value !== "object") {
    describeNonJson(value, path)
  } else if (Array.isArray(value)) {
    enterCycleCheck(value, path, state)
    emit(state, "[")
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) emit(state, ",")
      walk(value[index], `${path}[${index}]`, depth + 1, state)
    }
    emit(state, "]")
    state.parents.delete(value)
  } else {
    const object = value as object
    if (!isPlainObject(object)) describeNonJson(object, path)
    if (Object.getOwnPropertySymbols(object).length > 0) {
      refuse(
        "NOT_JSON_SYMBOL",
        "the object carries symbol-keyed properties. They cannot be canonicalized, and dropping them silently " +
          "would let two objects that differ reach one digest.",
        path,
      )
    }
    enterCycleCheck(object, path, state)
    const source = object as Record<string, unknown>
    const keys = Object.keys(source).sort(compareUtf16CodeUnits)
    emit(state, "{")
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index] as string
      const here = path === "" ? key : `${path}.${key}`
      const descriptor = Object.getOwnPropertyDescriptor(source, key)
      if (descriptor !== undefined && descriptor.get !== undefined) describeNonJson(source, here)
      if (index > 0) emit(state, ",")
      emit(state, serializeJcsString(key, here))
      emit(state, ":")
      walk(source[key], here, depth + 1, state)
    }
    emit(state, "}")
    state.parents.delete(object)
  }
}

function enterCycleCheck(value: object, path: string, state: Walk): void {
  if (state.parents.has(value)) {
    refuse(
      "CYCLE",
      "the value contains a cycle: this object is its own ancestor. JSON has no syntax for one, and a serializer " +
        "that did not check would not return at all. Two references to the same object side by side are fine and " +
        "are not a cycle -- only an object reachable from itself is refused.",
      path,
    )
  }
  state.parents.add(value)
}

/**
 * The canonical form of a JSON value, as text (RFC 8785 §3.2.1--§3.2.3).
 *
 * The bounds in `limits.ts` are enforced during the walk rather than after it,
 * so a document designed to exhaust memory is refused before it has been
 * serialized rather than after.
 */
export function canonicalizeJcs(value: unknown, limits: StudyHashLimits = STUDY_HASH_LIMITS): string {
  const state: Walk = { limits, parents: new Set<object>(), out: [], nodes: 0, length: 0 }
  walk(value, "", 0, state)
  return state.out.join("")
}

/**
 * The canonical form as UTF-8 bytes (RFC 8785 §3.2.4).
 *
 * This is what a digest consumes. The text form above is for tests and for
 * error messages; nothing hashes a JavaScript string, because a string is a
 * sequence of UTF-16 code units and the specification is about bytes.
 */
export function canonicalizeJcsBytes(
  value: unknown,
  limits: StudyHashLimits = STUDY_HASH_LIMITS,
): Uint8Array {
  const bytes = new TextEncoder().encode(canonicalizeJcs(value, limits))
  if (bytes.length > limits.max_canonical_bytes) {
    refuse(
      "MAX_CANONICAL_BYTES_EXCEEDED",
      `the canonical form encodes to ${bytes.length} bytes, past the ${limits.max_canonical_bytes} byte bound.`,
    )
  }
  return bytes
}
