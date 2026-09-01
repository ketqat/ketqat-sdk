import { type StudyHashLimits } from "./limits.js";
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
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
/**
 * ECMAScript `Number::toString` (ECMA-262 §7.1.12.1), which RFC 8785 §3.2.2.3
 * requires, minus the two values JSON cannot carry.
 *
 * `String(-0)` is `"0"` by that algorithm, so minus zero needs no special case
 * here; it needs one in Python, where it does not.
 */
export declare function serializeJcsNumber(value: number, path?: string | null): string;
/**
 * RFC 8785 §3.2.2.2 string serialization, including the enclosing quotes.
 *
 * Written out rather than delegated to `JSON.stringify` so the rule a reader
 * checks against the RFC is the rule that runs. The two agree today; the escape
 * table is short enough that saying so in code costs less than assuming it.
 */
export declare function serializeJcsString(value: string, path?: string | null): string;
/**
 * The canonical form of a JSON value, as text (RFC 8785 §3.2.1--§3.2.3).
 *
 * The bounds in `limits.ts` are enforced during the walk rather than after it,
 * so a document designed to exhaust memory is refused before it has been
 * serialized rather than after.
 */
export declare function canonicalizeJcs(value: unknown, limits?: StudyHashLimits): string;
/**
 * The canonical form as UTF-8 bytes (RFC 8785 §3.2.4).
 *
 * This is what a digest consumes. The text form above is for tests and for
 * error messages; nothing hashes a JavaScript string, because a string is a
 * sequence of UTF-16 code units and the specification is about bytes.
 */
export declare function canonicalizeJcsBytes(value: unknown, limits?: StudyHashLimits): Uint8Array;
//# sourceMappingURL=jcs.d.ts.map