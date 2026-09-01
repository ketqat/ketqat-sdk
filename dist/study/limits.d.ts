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
export declare const STUDY_HASH_REFUSAL_CODES: readonly string[];
export type StudyHashRefusalCode = (typeof STUDY_HASH_REFUSAL_CODES)[number];
export declare function isStudyHashRefusalCode(value: string): boolean;
/**
 * A refusal from the hashing core.
 *
 * `path` is a dotted/indexed location inside the value being hashed, or null
 * for a refusal about the value as a whole. It exists so a reader is sent to
 * one place to look rather than told that something, somewhere, is wrong.
 */
export declare class StudyHashRefusalError extends Error {
    readonly code: StudyHashRefusalCode;
    readonly path: string | null;
    constructor(code: StudyHashRefusalCode, message: string, path?: string | null);
}
export declare function refuse(code: StudyHashRefusalCode, message: string, path?: string | null): never;
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
    readonly max_depth: number;
    readonly max_nodes: number;
    readonly max_canonical_bytes: number;
}
export declare const STUDY_HASH_LIMITS: StudyHashLimits;
//# sourceMappingURL=limits.d.ts.map