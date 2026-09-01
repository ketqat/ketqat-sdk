import { z } from "zod";
/**
 * Typed value contracts for numbers (goal §11).
 *
 * Refusing everything above 2^53 was the wrong fix for the right problem. The
 * problem is real: above `Number.MAX_SAFE_INTEGER` a JSON number is an IEEE-754
 * double in JavaScript and an arbitrary-precision integer in Python, the
 * mapping stops being injective -- near 4.2e21 a single double stands for
 * 524287 distinct integers -- and the same file takes two digests depending on
 * which language read it. But a 64-bit seed is what Stim and NumPy hand out, a
 * shot count can exceed 2^53, a byte count certainly can, and an external
 * 64-bit identifier is an ordinary thing to record. A family that refuses all
 * of them refuses its own inputs.
 *
 * So the fix is a contract per field rather than a bound per number. Five
 * contracts, and the guidance below says which field takes which:
 *
 * | contract | JSON type | for |
 * | --- | --- | --- |
 * | `finite_float` | number | measurements, rates, probabilities |
 * | `safe_integer` | number | counts that cannot exceed 2^53 |
 * | `exact_integer_string` | string | 64-bit seeds, shot counts, byte counts, external 64-bit ids |
 * | `exact_decimal_string` | string | figures whose decimal precision must survive |
 * | `unknown` | null + `UNKNOWN` | a number the study looked for and did not find |
 *
 * The string contracts are *validated*, not free text. An unvalidated string
 * would be a number-shaped field that accepts `"1_000"`, `"+7"`, `"007"` and
 * `"1e3"` -- four spellings of values a reader would call equal and a digest
 * would call different, which is the same injectivity failure moved one layer
 * up. Both patterns below admit exactly one spelling of each value.
 *
 * **BigInt never reaches JSON.** `canonicalizeJcs` refuses a `bigint` by name,
 * and `exactIntegerStringFromBigInt` is the sanctioned way across the boundary:
 * the digits are hashed as digits, so the two languages hash what was written
 * rather than two different roundings of it.
 */
/** A finite IEEE-754 double: the contract for a measurement. */
export declare function isFiniteFloat(value: unknown): value is number;
/**
 * An integer both languages represent exactly: the contract for a count that
 * cannot exceed 2^53.
 *
 * "Cannot" is a claim about the field, not about the value in front of us,
 * which is why this contract and `exact_integer_string` are chosen per field
 * rather than per value. A field that takes this contract and then overflows it
 * is a field that was classified wrong; it fails here rather than silently
 * hashing a rounded number.
 */
export declare function isSafeInteger(value: unknown): value is number;
export declare function isExactIntegerString(value: unknown): value is string;
export declare function isExactDecimalString(value: unknown): value is string;
export declare function assertExactIntegerString(value: unknown, path: string): asserts value is string;
export declare function assertExactDecimalString(value: unknown, path: string): asserts value is string;
/**
 * The one sanctioned way a BigInt becomes a hashable value.
 *
 * A `bigint` is refused by the canonicalizer rather than converted there,
 * because the conversion is a decision about the *field*: an identifier becomes
 * a string, a count that fits becomes a number, and choosing on the caller's
 * behalf inside a serializer is how a field ends up with two representations in
 * two code paths.
 */
export declare function exactIntegerStringFromBigInt(value: bigint, path?: string): string;
/**
 * The four schemas, written so the generated JSON Schema carries the contract.
 *
 * Every constraint below is one `zod-to-json-schema` can emit -- `.int()`,
 * `.min()`, `.max()`, `.regex()` -- and none is a `.refine()`, which it cannot.
 * That is not a style preference: `python/src/ketqat_runner/study_validation.py`
 * checks records against the emitted schemas, so a bound that exists only in a
 * refinement is a bound only one of the two languages applies.
 */
/**
 * `finite_float`.
 *
 * `.finite()` is `.min(-Infinity).max(Infinity)` in zod, which the generator
 * renders as nothing at all -- correctly, since JSON has no syntax for a
 * non-finite number and a JSON Schema validator can never see one. The
 * canonicalizer refuses NaN and both infinities outright (RFC 8785 §3.2.2.3),
 * so a value that reached this schema as a JavaScript `NaN` is refused here and
 * a value that reached a Python validator as JSON cannot have been one.
 */
export declare const FiniteFloatSchema: z.ZodNumber;
/**
 * `safe_integer`, bounded in the schema rather than in a refinement.
 *
 * The bound is what the contract *is*, so it has to survive into the JSON
 * Schema: `{"type": "integer"}` with no maximum would let a Python validator
 * accept the 64-bit count this contract exists to send to
 * `exact_integer_string`.
 */
export declare const SafeIntegerSchema: z.ZodNumber;
/** `exact_integer_string`. */
export declare const ExactIntegerStringSchema: z.ZodString;
/**
 * `exact_decimal_string`.
 *
 * The one contract whose rule is not entirely in its pattern -- see
 * `MINUS_ZERO` above -- and therefore the one whose emitted JSON Schema would
 * be a shade looser than this validator. No field takes it, so nothing is
 * emitted with that gap today.
 */
export declare const ExactDecimalStringSchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * Which contract a field takes, as immutable plain data.
 *
 * Exported so the guidance a reviewer applies and the guidance the tests check
 * are the same list, and so `python/src/ketqat_runner/study_values.py` can be
 * compared against it rather than described as agreeing with it.
 */
export interface StudyNumberContract {
    readonly contract: string;
    readonly json_type: "number" | "string" | "null";
    readonly use_for: string;
    readonly refuses: string;
}
export declare const STUDY_NUMBER_CONTRACTS: readonly StudyNumberContract[];
//# sourceMappingURL=values.d.ts.map