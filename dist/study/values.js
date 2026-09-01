import { z } from "zod";
import { refuse } from "./limits.js";
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
export function isFiniteFloat(value) {
    return typeof value === "number" && Number.isFinite(value);
}
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
export function isSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value);
}
/**
 * At most 64 digits.
 *
 * Every integer a study can plausibly record fits: a 64-bit seed is 20 digits,
 * a 128-bit identifier is 39, and a 256-bit one is 78 and is not a number. The
 * bound exists so that a field declared "an exact integer" cannot become a
 * megabyte of digits that both languages dutifully hash.
 */
const EXACT_STRING_MAX_DIGITS = 64;
/**
 * One spelling per value: `0`, or an optional minus and a digit string with a
 * non-zero leading digit.
 *
 * The whole rule is in the expression, deliberately, rather than split between
 * a loose pattern and refinements beside it. `zod-to-json-schema` can emit a
 * `pattern` and cannot emit a `.refine`, so a rule stated in a refinement is a
 * rule the generated JSON Schema does not carry -- and the Python validator
 * checks records against that schema. Splitting it is how `seed` came to be
 * `{"type": "string"}` in `execution-capsule.schema.json`: TypeScript refused
 * `"abc"` and a Python caller validating against the shipped schema accepted
 * it, which is two languages disagreeing about one file, which is the thing
 * this family exists to prevent.
 *
 * So, read left to right: `0` alone (which is why `-0` cannot match -- the
 * signed branch requires a non-zero first digit), or an optional minus, a digit
 * 1-9, and up to 63 more. No plus sign, no leading zeros, no underscores, no
 * exponent, no whitespace. Each excluded spelling is a second way to write a
 * value that already has one, and two spellings of one value are two digests
 * for one record.
 *
 * The bound counts digits rather than characters, which is why it sits inside
 * the expression rather than beside it as a `maxLength`: a character bound
 * would be one larger for a negative value and would therefore admit 65 digits
 * for a positive one, which bounds the spelling rather than the number.
 */
const EXACT_INTEGER_STRING = new RegExp(`^(?:0|-?[1-9][0-9]{0,${EXACT_STRING_MAX_DIGITS - 1}})$`);
export function isExactIntegerString(value) {
    return typeof value === "string" && EXACT_INTEGER_STRING.test(value);
}
/**
 * A plain decimal: optional minus, an integer part with no leading zero, and an
 * optional fraction.
 *
 * Deliberately no exponent. `1.5e3` and `1500` are the same value and different
 * strings, and this contract exists for fields where the string *is* the value
 * -- so admitting two spellings would defeat it. Trailing zeros are kept and
 * are significant: `"1.50"` and `"1.5"` are different records, because a
 * producer that wrote two decimal places was saying something a producer that
 * wrote one was not.
 */
const EXACT_DECIMAL_STRING = new RegExp(`^-?(?:0|[1-9][0-9]{0,${EXACT_STRING_MAX_DIGITS - 1}})(?:\\.[0-9]{1,${EXACT_STRING_MAX_DIGITS}})?$`);
/**
 * Minus zero, in every spelling it has.
 *
 * The one rule this contract states beside its pattern rather than inside it.
 * `-0.5` is a value and `-0.0` is not, so the expression would have to say "a
 * negative number has a non-zero digit somewhere", which is a lookahead that
 * reads worse than the sentence. No field takes this contract yet, so no
 * generated schema is missing it; the moment one does, this fold into the
 * pattern is the change to make.
 */
const MINUS_ZERO = /^-0(?:\.0+)?$/;
export function isExactDecimalString(value) {
    if (typeof value !== "string")
        return false;
    if (!EXACT_DECIMAL_STRING.test(value))
        return false;
    return !MINUS_ZERO.test(value);
}
export function assertExactIntegerString(value, path) {
    if (isExactIntegerString(value))
        return;
    refuse("INVALID_EXACT_NUMBER_STRING", `${JSON.stringify(value)} is not an exact integer string. This field carries an integer JavaScript may not ` +
        "be able to represent exactly, so it is recorded as digits: `0`, or an optional minus and a leading digit " +
        `1-9 followed by up to ${EXACT_STRING_MAX_DIGITS - 1} more. No plus sign, no leading zeros, no exponent, ` +
        "no separators, and not `-0` -- each of those would be a second spelling of a value that already has one, " +
        "and two spellings of one value are two digests for one record.", path);
}
export function assertExactDecimalString(value, path) {
    if (isExactDecimalString(value))
        return;
    refuse("INVALID_EXACT_NUMBER_STRING", `${JSON.stringify(value)} is not an exact decimal string. This field carries a decimal whose precision must ` +
        "survive, so it is recorded as digits: optional minus, an integer part with no leading zero, and an " +
        "optional fraction. No exponent, and not a signed zero. Trailing zeros are significant and are kept.", path);
}
/**
 * The one sanctioned way a BigInt becomes a hashable value.
 *
 * A `bigint` is refused by the canonicalizer rather than converted there,
 * because the conversion is a decision about the *field*: an identifier becomes
 * a string, a count that fits becomes a number, and choosing on the caller's
 * behalf inside a serializer is how a field ends up with two representations in
 * two code paths.
 */
export function exactIntegerStringFromBigInt(value, path = "(value)") {
    const rendered = value.toString(10);
    assertExactIntegerString(rendered, path);
    return rendered;
}
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
export const FiniteFloatSchema = z.number().finite();
/**
 * `safe_integer`, bounded in the schema rather than in a refinement.
 *
 * The bound is what the contract *is*, so it has to survive into the JSON
 * Schema: `{"type": "integer"}` with no maximum would let a Python validator
 * accept the 64-bit count this contract exists to send to
 * `exact_integer_string`.
 */
export const SafeIntegerSchema = z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER);
/** `exact_integer_string`. */
export const ExactIntegerStringSchema = z.string().regex(EXACT_INTEGER_STRING, {
    message: "An exact integer string is `0`, or an optional minus and up to 64 digits with a non-zero leading digit: no " +
        "plus sign, no leading zeros, no exponent, no separators, not `-0`.",
});
/**
 * `exact_decimal_string`.
 *
 * The one contract whose rule is not entirely in its pattern -- see
 * `MINUS_ZERO` above -- and therefore the one whose emitted JSON Schema would
 * be a shade looser than this validator. No field takes it, so nothing is
 * emitted with that gap today.
 */
export const ExactDecimalStringSchema = z
    .string()
    .regex(EXACT_DECIMAL_STRING, {
    message: "An exact decimal string is an optional minus, an integer part with no leading zero, and an optional " +
        "fraction: no exponent, at most 64 digits in each part. Trailing zeros are significant.",
})
    .refine((value) => !MINUS_ZERO.test(value), {
    message: "`-0`, `-0.0` and `-0.000` are all minus zero. The unsigned spelling is the one.",
});
export const STUDY_NUMBER_CONTRACTS = Object.freeze([
    Object.freeze({
        contract: "finite_float",
        json_type: "number",
        use_for: "measurements, rates, probabilities, durations that are results rather than artifacts of running",
        refuses: "NaN, Infinity, -Infinity",
    }),
    Object.freeze({
        contract: "safe_integer",
        json_type: "number",
        use_for: "counts, revisions, sequence numbers -- anything that cannot exceed 2^53 by construction",
        refuses: "non-integers and any magnitude above Number.MAX_SAFE_INTEGER",
    }),
    Object.freeze({
        contract: "exact_integer_string",
        json_type: "string",
        use_for: "64-bit seeds, large shot counts, byte counts, external 64-bit identifiers",
        refuses: "plus signs, leading zeros, exponents, separators, -0, and more than 64 digits",
    }),
    Object.freeze({
        contract: "exact_decimal_string",
        json_type: "string",
        use_for: "figures whose decimal precision must survive, including trailing zeros",
        refuses: "exponent notation and signed zero",
    }),
    Object.freeze({
        contract: "unknown",
        json_type: "null",
        use_for: "a number the study looked for and did not find; pairs with evidence class UNKNOWN",
        refuses: "a value beside the UNKNOWN classification, in either direction",
    }),
]);
//# sourceMappingURL=values.js.map