"""Typed value contracts for numbers (goal 11).

Mirrors `src/study/values.ts`.

Refusing everything above 2**53 was the wrong fix for the right problem. The
problem is real: above that bound a JSON integer literal is an exact ``int`` here
and an IEEE-754 double in JavaScript, the mapping stops being injective -- near
4.2e21 a single double stands for 524287 distinct integers -- and the same file
takes two digests depending on which language read it. But a 64-bit seed is what
Stim and NumPy hand out, a shot count can exceed 2**53, a byte count certainly
can, and an external 64-bit identifier is an ordinary thing to record. A family
that refuses all of them refuses its own inputs.

So the fix is a contract per field rather than a bound per number:

===========================  ===========  ==================================
contract                     JSON type    for
===========================  ===========  ==================================
``finite_float``             number       measurements, rates, probabilities
``safe_integer``             number       counts that cannot exceed 2**53
``exact_integer_string``     string       64-bit seeds, shot counts, byte
                                          counts, external 64-bit ids
``exact_decimal_string``     string       figures whose decimal precision
                                          must survive
``unknown``                  null         a number the study looked for and
                                          did not find
===========================  ===========  ==================================

The string contracts are *validated*, not free text. An unvalidated string would
be a number-shaped field accepting ``"1_000"``, ``"+7"``, ``"007"`` and
``"1e3"`` -- four spellings of values a reader would call equal and a digest
would call different, which is the same injectivity failure moved one layer up.
Both patterns below admit exactly one spelling of each value.

Python's arbitrary-precision ``int`` never reaches JSON above the safe bound:
`study_jcs.py` refuses it by name, and ``exact_integer_string_from_int`` is the
sanctioned way across the boundary, so the digits are hashed as digits and the
two languages hash what was written rather than two different roundings of it.
"""

from __future__ import annotations

import math
import re
from types import MappingProxyType
from typing import Any, Mapping

from .study_limits import JS_MAX_SAFE_INTEGER, refuse

#: At most 64 digits.
#:
#: Every integer a study can plausibly record fits: a 64-bit seed is 20 digits, a
#: 128-bit identifier is 39, a 256-bit one is 78 and is not a number. The bound
#: exists so a field declared "an exact integer" cannot become a megabyte of
#: digits that both languages dutifully hash.
EXACT_STRING_MAX_DIGITS = 64

#: One spelling per value: `0`, or an optional minus and a digit string with a
#: non-zero leading digit.
#:
#: The whole rule is in the expression, including the digit bound and the
#: exclusion of `-0` -- which cannot match, because the signed branch requires a
#: non-zero first digit. The TypeScript mirror states it the same way for a
#: reason this module inherits: the pattern is what
#: `zod-to-json-schema` emits into `execution-capsule.schema.json`, which is the
#: schema `study_validation.py` checks a capsule against, so a rule kept outside
#: the pattern is a rule only one of the two languages applies.
_EXACT_INTEGER_STRING = re.compile(rf"^(?:0|-?[1-9][0-9]{{0,{EXACT_STRING_MAX_DIGITS - 1}}})$")

#: A plain decimal: optional minus, an integer part with no leading zero, and an
#: optional fraction, at most 64 digits in each. Deliberately no exponent --
#: `1.5e3` and `1500` are the same value and different strings, and this contract
#: exists for fields where the string *is* the value. Trailing zeros are kept and
#: are significant: `"1.50"` and `"1.5"` are different records, because a producer
#: that wrote two decimal places was saying something a producer that wrote one
#: was not.
_EXACT_DECIMAL_STRING = re.compile(
    rf"^-?(?:0|[1-9][0-9]{{0,{EXACT_STRING_MAX_DIGITS - 1}}})"
    rf"(?:\.[0-9]{{1,{EXACT_STRING_MAX_DIGITS}}})?$"
)

#: Minus zero, in every spelling it has. The one rule this contract states beside
#: its pattern rather than inside it: `-0.5` is a value and `-0.0` is not, so the
#: expression would have to say "a negative number has a non-zero digit
#: somewhere", which reads worse than the sentence.
_MINUS_ZERO_DECIMAL = re.compile(r"^-0(?:\.0+)?$")


def is_finite_float(value: Any) -> bool:
    """A finite IEEE-754 double: the contract for a measurement."""
    return isinstance(value, float) and not isinstance(value, bool) and math.isfinite(value)


def is_safe_integer(value: Any) -> bool:
    """An integer both languages represent exactly.

    "Cannot exceed 2**53" is a claim about the field, not about the value in
    front of us, which is why this contract and ``exact_integer_string`` are
    chosen per field rather than per value. A field that takes this contract and
    then overflows it was classified wrong; it fails here rather than silently
    hashing a rounded number.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    return abs(value) <= JS_MAX_SAFE_INTEGER


def is_exact_integer_string(value: Any) -> bool:
    """Exactly the strings `EXACT_INTEGER_STRING` accepts in src/study/values.ts.

    ``fullmatch``, not ``match``, and the difference is not cosmetic: Python's
    ``$`` matches at the end of the string **or just before a trailing
    newline**, and ECMAScript's does not. Sharing the pattern text with the
    TypeScript mirror -- which is required, because
    ``zod-to-json-schema`` emits that same text into the shipped JSON Schemas --
    therefore does not by itself make the two contracts agree. With ``match``,
    ``"1\\n"`` was an exact integer string here and was not one there: two
    spellings of one value, one accepted by this language's validator and
    refused by the other's, hashing to two different digests. That is the
    injectivity failure this contract exists to close, arriving through the
    regex engine instead of through the number.

    ``fullmatch`` requires the whole string to be consumed, so the zero-width
    ``$`` can still match before the newline and the newline itself is then
    left over and fails. The pattern stays byte-identical to the emitted schema,
    which is the property the module docstring depends on.

    Found by `tests/study-properties.test.mjs` and
    `python/tests/test_study_properties.py`, which pin the answer for a
    trailing newline in `fixtures/study/property-corpus.json`.
    """
    return isinstance(value, str) and _EXACT_INTEGER_STRING.fullmatch(value) is not None


def is_exact_decimal_string(value: Any) -> bool:
    """The same, and the same reason: `"1.5\\n"` was accepted here and nowhere else."""
    if not isinstance(value, str):
        return False
    if _EXACT_DECIMAL_STRING.fullmatch(value) is None:
        return False
    return _MINUS_ZERO_DECIMAL.fullmatch(value) is None


def assert_exact_integer_string(value: Any, path: str) -> None:
    if is_exact_integer_string(value):
        return
    refuse(
        "INVALID_EXACT_NUMBER_STRING",
        f"{value!r} is not an exact integer string. This field carries an integer JavaScript cannot represent "
        "exactly, so it is recorded as digits: optional minus, then `0` or a leading digit 1-9 followed by "
        f"digits, at most {EXACT_STRING_MAX_DIGITS} of them. No plus sign, no leading zeros, no exponent, no "
        "separators, and not `-0` -- each of those would be a second spelling of a value that already has one, "
        "and two spellings of one value are two digests for one record.",
        path,
    )


def assert_exact_decimal_string(value: Any, path: str) -> None:
    if is_exact_decimal_string(value):
        return
    refuse(
        "INVALID_EXACT_NUMBER_STRING",
        f"{value!r} is not an exact decimal string. This field carries a decimal whose precision must survive, "
        "so it is recorded as digits: optional minus, an integer part with no leading zero, and an optional "
        "fraction. No exponent, and not a signed zero. Trailing zeros are significant and are kept.",
        path,
    )


def exact_integer_string_from_int(value: int, path: str = "(value)") -> str:
    """The one sanctioned way a large ``int`` becomes a hashable value.

    An oversized ``int`` is refused by the canonicalizer rather than converted
    there, because the conversion is a decision about the *field*: an identifier
    becomes a string, a count that fits becomes a number, and choosing on the
    caller's behalf inside a serializer is how a field ends up with two
    representations in two code paths.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        refuse("INVALID_EXACT_NUMBER_STRING", f"{value!r} is not an integer.", path)
    rendered = str(value)
    assert_exact_integer_string(rendered, path)
    return rendered


#: Which contract a field takes, as immutable plain data.
#:
#: Exported so the guidance a reviewer applies and the guidance the tests check
#: are the same list, and so it can be compared against `STUDY_NUMBER_CONTRACTS`
#: in src/study/values.ts rather than described as agreeing with it.
STUDY_NUMBER_CONTRACTS: tuple[Mapping[str, str], ...] = (
    MappingProxyType(
        {
            "contract": "finite_float",
            "json_type": "number",
            "use_for": (
                "measurements, rates, probabilities, durations that are results rather than "
                "artifacts of running"
            ),
            "refuses": "NaN, Infinity, -Infinity",
        }
    ),
    MappingProxyType(
        {
            "contract": "safe_integer",
            "json_type": "number",
            "use_for": (
                "counts, revisions, sequence numbers -- anything that cannot exceed 2^53 by construction"
            ),
            "refuses": "non-integers and any magnitude above Number.MAX_SAFE_INTEGER",
        }
    ),
    MappingProxyType(
        {
            "contract": "exact_integer_string",
            "json_type": "string",
            "use_for": "64-bit seeds, large shot counts, byte counts, external 64-bit identifiers",
            "refuses": "plus signs, leading zeros, exponents, separators, -0, and more than 64 digits",
        }
    ),
    MappingProxyType(
        {
            "contract": "exact_decimal_string",
            "json_type": "string",
            "use_for": "figures whose decimal precision must survive, including trailing zeros",
            "refuses": "exponent notation and signed zero",
        }
    ),
    MappingProxyType(
        {
            "contract": "unknown",
            "json_type": "null",
            "use_for": "a number the study looked for and did not find; pairs with evidence class UNKNOWN",
            "refuses": "a value beside the UNKNOWN classification, in either direction",
        }
    ),
)
