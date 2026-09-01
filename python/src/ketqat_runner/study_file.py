"""Verifying a file, which is a different job from hashing a value (goal 3.5).

Mirrors `src/study/file.ts`.

Everything else in this core takes a parsed value. This entry point takes **raw
bytes**, because the questions it has to answer are questions about bytes and a
parse has already thrown the answers away by the time it returns.

**Duplicate keys.** ``{"a":1,"a":2}`` is syntactically valid JSON and RFC 8259
section 4 says only that names SHOULD be unique. Python's decoder keeps the last
value, JavaScript's keeps the last, other parsers keep the first, and none of
them records that there were two -- so one file has two readings and two digests,
and the verifier that reads it second reports a mismatch it cannot explain. The
check must therefore happen **before** the parse.

**A byte order mark.** U+FEFF at the start of a file is not JSON: RFC 8259
section 8.1 says implementations MUST NOT add one and MAY ignore one. "May
ignore" is the problem, not the solution -- an ignoring reader and a
non-ignoring reader hash different byte sequences for one file. So a BOM is
**refused**, not stripped. Refusing costs a producer one setting; stripping would
cost a reader the ability to tell whether the file they verified is the file
somebody else verified.

**Invalid UTF-8.** JSON text is UTF-8. A decoder that substitutes U+FFFD for a
malformed sequence turns two different files into one string, and hashing the
substitution would hash a repair nobody made. Refused.

**Unpaired surrogates.** A file may spell one as an escape -- ``"\\ud800"`` is
syntactically valid JSON, and Python's decoder produces the lone surrogate
happily. It is refused for RFC 8785 section 3.2.2.2's reason: half a character is
not a character, JavaScript will hash the escape and this language cannot encode
it as UTF-8 at all, so the file hashes in one language and crashes the verifier
in the other.

**Integer literals outside the safe range.** The one refusal that only exists
because two languages read one file. A literal with no point and no exponent
arrives here as an exact ``int`` and in JavaScript as the nearest double, and
above 2**53 many distinct integers share that double. Refused with the offset, so
the field can be moved to the ``exact_integer_string`` contract.

**No Unicode normalization is performed.** A file in NFD and the same text in NFC
are different bytes and are different records. Normalizing would silently merge
two documents a reader can see are different, and would make a digest depend on
which normalization library was installed.
"""

from __future__ import annotations

import json
from typing import Any, NamedTuple

from .study_limits import JS_MAX_SAFE_INTEGER, StudyHashRefusal, refuse

_BOM_UTF8 = b"\xef\xbb\xbf"

_SIMPLE_ESCAPES = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
}

_HEX_DIGITS = frozenset("0123456789abcdefABCDEF")


class StudyFileReading(NamedTuple):
    """The parsed value, and the decoded text for a caller that needs it."""

    value: Any
    text: str


def _decode_strict_utf8(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        refuse(
            "INVALID_UTF8",
            "the file is not valid UTF-8. JSON text is UTF-8 (RFC 8259 section 8.1), and a decoder that "
            "substituted U+FFFD for the malformed bytes would turn two different files into one string and "
            "hash a repair nobody made.",
        )


def _refuse_surrogate(unit: int, offset: int, half: str) -> None:
    refuse(
        "LONE_SURROGATE",
        f"the string starting at byte offset {offset} carries a lone {half} surrogate U+{unit:04X}. RFC 8785 "
        "section 3.2.2.2 requires a compliant canonicalizer to terminate on one: JavaScript would hash the "
        "escape and Python cannot encode it as UTF-8 at all, so the file hashes in one language and crashes "
        "the verifier in the other.",
    )


def _assert_no_unpaired_surrogates(decoded: str, offset: int) -> None:
    index = 0
    while index < len(decoded):
        unit = ord(decoded[index])
        if 0xD800 <= unit <= 0xDBFF:
            following = ord(decoded[index + 1]) if index + 1 < len(decoded) else 0
            if 0xDC00 <= following <= 0xDFFF:
                index += 2
                continue
            _refuse_surrogate(unit, offset, "high")
        if 0xDC00 <= unit <= 0xDFFF:
            _refuse_surrogate(unit, offset, "low")
        index += 1


def _scan(text: str) -> None:
    """Walk the text, refusing duplicate names, lone surrogates and unsafe integers.

    A hand-written scanner rather than an ``object_pairs_hook``, because a hook
    would catch duplicates but not the other two, and because the scanner is
    where a byte offset still exists to report. It tracks only structure: whether
    it is inside a string, and which property names each open object has met.

    An object *value* named the same as one in a sibling object is not a
    duplicate; two names at one level are.
    """
    stack: list[tuple[str, set[str]]] = []
    index = 0
    length = len(text)

    while index < length:
        character = text[index]
        if character == '"':
            start = index
            value, index = _read_string(text, index)
            if stack and stack[-1][0] == "object" and _is_property_name(text, index):
                names = stack[-1][1]
                if value in names:
                    refuse(
                        "DUPLICATE_PROPERTY",
                        f"the object contains the property {value!r} twice, at byte offset {start}. RFC 8259 "
                        "section 4 only says names SHOULD be unique, so this file parses -- and parsers "
                        "disagree about which of the two values wins, which gives one file two readings and "
                        "two digests. It is refused before the parse, because after the parse there is one "
                        "property and no evidence there were ever two.",
                    )
                names.add(value)
            continue
        if character == "{":
            stack.append(("object", set()))
            index += 1
            continue
        if character == "[":
            stack.append(("array", set()))
            index += 1
            continue
        if character in "}]":
            if stack:
                stack.pop()
            index += 1
            continue
        if character == "-" or character.isdigit():
            index = _check_number_literal(text, index)
            continue
        index += 1


def _read_string(text: str, index: int) -> tuple[str, int]:
    start = index
    index += 1
    out: list[str] = []
    length = len(text)
    while index < length:
        character = text[index]
        if character == "\\":
            if index + 1 >= length:
                break
            escape = text[index + 1]
            if escape == "u":
                hex_text = text[index + 2 : index + 6]
                if len(hex_text) != 4 or any(digit not in _HEX_DIGITS for digit in hex_text):
                    refuse("INVALID_JSON", f"a \\u escape at offset {index} is not four hex digits.")
                out.append(chr(int(hex_text, 16)))
                index += 6
                continue
            decoded = _SIMPLE_ESCAPES.get(escape)
            if decoded is None:
                refuse("INVALID_JSON", f"an unknown escape \\{escape} at offset {index}.")
            out.append(decoded)
            index += 2
            continue
        if character == '"':
            index += 1
            # Checked here rather than over the raw text, because over the raw
            # text a `\ud800` escape is six ASCII characters and no surrogate at
            # all -- the scan would pass and the parser would then produce the
            # lone surrogate anyway. This is the one place the decoded code units
            # and the byte offset are both in hand.
            _assert_no_unpaired_surrogates("".join(out), start)
            return "".join(out), index
        out.append(character)
        index += 1
    raise StudyHashRefusal("INVALID_JSON", "a string is not closed before the end of the file.")


def _is_property_name(text: str, index: int) -> bool:
    """Is the string that just ended at ``index`` a property name?

    A property name is the string a colon follows, whitespace aside. The
    alternative -- tracking "expecting a name" through the whole grammar -- is a
    second JSON parser, and a second parser is a second thing that can disagree
    with the first about what this file says.
    """
    for scan in range(index, len(text)):
        character = text[scan]
        if character in " \t\n\r":
            continue
        return character == ":"
    return False


def _check_number_literal(text: str, start: int) -> int:
    """Refuse an integer literal the two languages read as two different numbers.

    A literal *with* a point or an exponent is a float in both languages and
    holds the same double in both, so it is left alone however large it is. A
    literal without either is an exact ``int`` here and a rounded double there.
    """
    index = start
    if text[index] == "-":
        index += 1
    digits_from = index
    while index < len(text) and text[index].isdigit():
        index += 1
    integer_digits = text[digits_from:index]
    is_integer = bool(integer_digits)
    if index < len(text) and text[index] == ".":
        is_integer = False
        index += 1
        while index < len(text) and text[index].isdigit():
            index += 1
    if index < len(text) and text[index] in "eE":
        is_integer = False
        index += 1
        if index < len(text) and text[index] in "+-":
            index += 1
        while index < len(text) and text[index].isdigit():
            index += 1
    if is_integer and abs(int(integer_digits)) > JS_MAX_SAFE_INTEGER:
        refuse(
            "UNSAFE_INTEGER",
            f"the integer literal at byte offset {start} is outside +/-{JS_MAX_SAFE_INTEGER}. Python holds it "
            "as written and JavaScript reads the nearest double, and many distinct integers share that one "
            "double -- so this file takes two digests and nothing on the JavaScript side can tell which value "
            "was meant. A 64-bit seed, a large shot count or an external 64-bit id is recorded as digits under "
            "the `exact_integer_string` contract, which both languages hash as written.",
        )
    return max(index, start + 1)


def read_study_file_bytes(data: bytes) -> StudyFileReading:
    """Read a study file from raw bytes, or refuse it.

    The order is the contract, and each step exists because the next one would
    have destroyed its evidence: BOM before decode, decode before scan, scan
    before parse.
    """
    if isinstance(data, str) or not isinstance(data, (bytes, bytearray)):
        refuse(
            "NOT_JSON_VALUE",
            "file verification is defined over raw bytes and takes bytes. A str has already been decoded by "
            "somebody, under rules this function exists to check.",
        )
    if bytes(data[:3]) == _BOM_UTF8:
        refuse(
            "BYTE_ORDER_MARK",
            "the file begins with a UTF-8 byte order mark. RFC 8259 section 8.1 says an implementation MUST "
            "NOT add one and MAY ignore one, and `MAY ignore` is the problem: an ignoring reader and a "
            "non-ignoring reader hash two different byte sequences for one file. It is refused rather than "
            "stripped, because stripping would make the digest depend on which reader took it.",
        )
    text = _decode_strict_utf8(bytes(data))
    _scan(text)
    try:
        value = json.loads(text)
    except ValueError as error:
        refuse("INVALID_JSON", f"the file is not JSON: {error}")
    return StudyFileReading(value=value, text=text)
