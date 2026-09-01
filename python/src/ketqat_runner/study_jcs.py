"""RFC 8785 -- JSON Canonicalization Scheme (JCS).

Written against the RFC rather than against the TypeScript implementation. The
point of adopting a published scheme is that cross-language byte agreement stops
being a coincidence maintained by hand between two canonicalizers and becomes
conformance to a specification that ships its own test vectors: when this file
and `src/study/jcs.ts` disagree, at least one of them fails the RFC's vectors, so
`fixtures/jcs/rfc8785-vectors.json` says which one is wrong instead of merely
that they differ.

Three things need saying about this language in particular.

**Property order (3.2.3) is over UTF-16 code units, not code points.** Python
strings are sequences of code points and sorting them natively is wrong: an
astral character such as U+1F600 must sort as its high surrogate D83D and
therefore *precede* U+FB33, which code-point order puts first. The keys are
encoded to UTF-16 big-endian and compared as bytes, which is the same ordering
-- comparing 16-bit units as unsigned integers is exactly comparing their
big-endian byte pairs. The RFC's own sorting vector is pinned as a fixture
precisely because this is the mistake a Python implementation makes and nothing
else notices.

**Numbers (3.2.2.3) are serialized by ECMAScript ``Number::toString``**
(ECMA-262 7.1.12.1), which Python does not have. ``repr`` is the shortest
round-tripping decimal, which is the same *digits* ECMAScript produces, but the
*formatting* differs in four ways that all appear in the RFC's own table:
``repr(1e20)`` is ``'1e+20'`` where ECMAScript writes it out in full,
``repr(0.000001)`` is ``'1e-06'`` where ECMAScript writes ``0.000001``,
``repr(1e-7)`` is ``'1e-07'`` where ECMAScript writes ``1e-7``, and
``repr(9007199254740992.0)`` keeps a ``.0`` ECMAScript does not. So the
formatting half of the algorithm is implemented explicitly below and the digits
are taken from ``repr``; both languages run the RFC's Appendix B table.

**An integer outside the safe range is refused.** This is the one place the two
languages cannot be reconciled by a rendering rule. A JSON integer literal
larger than 2**53 arrives here as an exact ``int`` and in JavaScript as the
nearest double, and many distinct integers share that one double -- so the same
file takes two digests, and nothing on the JavaScript side can tell which value
was written. The refusal is by name, and the field that needs such a value takes
the ``exact_integer_string`` contract instead.

**No Unicode normalization is performed, ever** (3.1). NFC and NFD are different
byte sequences and therefore different records. A canonicalizer that normalized
would silently merge two documents a user can see are different, and would make
the digest depend on which normalization library happened to be installed. If a
producer needs NFC, it normalizes before the record is written, where the change
is visible in the file.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from .study_limits import (
    JS_MAX_SAFE_INTEGER,
    STUDY_HASH_LIMITS,
    refuse,
)

_CONTROL_ESCAPES = {
    0x08: "\\b",
    0x09: "\\t",
    0x0A: "\\n",
    0x0C: "\\f",
    0x0D: "\\r",
}


def _shortest_decimal(value: float) -> tuple[str, int]:
    """The shortest round-tripping digits of ``value``, and where its point sits.

    Returns ``(digits, n)`` with ``0.digits * 10**n == value`` and no leading or
    trailing zero in ``digits``. This is the ``(s, k, n)`` triple ECMA-262
    7.1.12.1 is written in terms of, with ``k = len(digits)``.

    ``repr`` supplies the digits because CPython's float repr is the shortest
    decimal that round-trips, which is the same choice ECMAScript makes. Only the
    formatting around those digits differs, and that is what the caller below
    implements.
    """
    text = repr(abs(value))
    if "e" in text or "E" in text:
        mantissa, _, exponent_text = text.lower().partition("e")
        exponent = int(exponent_text)
    else:
        mantissa, exponent = text, 0
    integer_part, _, fraction_part = mantissa.partition(".")
    combined = integer_part + fraction_part
    stripped = combined.lstrip("0")
    leading_zeros = len(combined) - len(stripped)
    digits = stripped.rstrip("0")
    if digits == "":
        return "0", 1
    return digits, len(integer_part) + exponent - leading_zeros


def serialize_jcs_number(value: Any, path: str | None = None) -> str:
    """ECMAScript ``Number::toString``, which RFC 8785 3.2.2.3 requires.

    The five cases below are the five clauses of ECMA-262 7.1.12.1, in order.
    They are what makes ``1e+21`` and ``1000000000000000000000`` two different
    renderings of two adjacent magnitudes rather than a matter of taste.
    """
    if isinstance(value, bool):
        # A bool is an int in Python, and would otherwise serialize as 1 or 0.
        refuse(
            "NOT_JSON_VALUE",
            "a boolean reached the number serializer. It is a JSON literal, not a JSON number, and "
            "serializing it as 1 or 0 would give `true` and `1` one digest.",
            path,
        )
    if isinstance(value, int):
        if abs(value) > JS_MAX_SAFE_INTEGER:
            refuse(
                "UNSAFE_INTEGER",
                f"{value} is an integer outside +/-{JS_MAX_SAFE_INTEGER}. Python holds it as written and "
                "JavaScript reads the nearest double, and many distinct integers share that one double -- so "
                "the same file takes two digests and nothing on the JavaScript side can tell which value was "
                "meant. Record it under the `exact_integer_string` contract, which hashes the digits that were "
                "written.",
                path,
            )
        value = float(value)
    if not isinstance(value, float):
        refuse("NOT_JSON_VALUE", f"{value!r} is not a JSON number.", path)
    if math.isnan(value) or math.isinf(value):
        refuse(
            "NON_FINITE_NUMBER",
            f"{value} is not a JSON number. RFC 8785 3.2.2.3 requires a compliant implementation to terminate "
            "on NaN and Infinity rather than serialize them: JSON has no syntax for either, and the two "
            "languages disagree about what to write instead -- one emits `null`, collapsing three distinct "
            "values onto one digest, the other emits bare `nan`, which is not JSON and which the first cannot "
            "read back.",
            path,
        )
    if value == 0.0:
        # Minus zero renders as `0`. ECMAScript's algorithm says so, and it is
        # the reason the RFC's table lists two bit patterns against one output.
        return "0"

    sign = "-" if value < 0 else ""
    digits, n = _shortest_decimal(value)
    k = len(digits)

    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    exponent = n - 1
    exponent_text = f"e+{exponent}" if exponent >= 0 else f"e-{-exponent}"
    if k == 1:
        return sign + digits + exponent_text
    return sign + digits[0] + "." + digits[1:] + exponent_text


def _lone_surrogate_message(unit: int, half: str) -> str:
    return (
        f"the string contains a lone {half} surrogate U+{unit:04X}. RFC 8785 3.2.2.2 requires a compliant "
        "implementation to terminate on one: half a character is not a character, JavaScript will escape it "
        "and hash the escape, and Python cannot encode it as UTF-8 at all and raises instead of returning a "
        "digest -- so the verifier that reads the file second fails on bytes the first accepted. Write the "
        "character it was half of, or remove it."
    )


def serialize_jcs_string(value: str, path: str | None = None) -> str:
    """RFC 8785 3.2.2.2 string serialization, including the enclosing quotes.

    Written out rather than delegated to ``json.dumps`` so the rule a reader
    checks against the RFC is the rule that runs -- ``json.dumps`` escapes by a
    different table and would have to be configured into agreement, which is a
    second thing to keep right.

    Every surrogate reached here is a lone one. Python's JSON decoder combines a
    well-formed escape pair into the astral character it spells, so a surrogate
    code point surviving in a ``str`` is by construction unpaired.
    """
    out = ['"']
    for character in value:
        code = ord(character)
        if code < 0x20:
            out.append(_CONTROL_ESCAPES.get(code) or f"\\u{code:04x}")
            continue
        if code == 0x22:
            out.append('\\"')
            continue
        if code == 0x5C:
            out.append("\\\\")
            continue
        if 0xD800 <= code <= 0xDBFF:
            refuse("LONE_SURROGATE", _lone_surrogate_message(code, "high"), path)
        if 0xDC00 <= code <= 0xDFFF:
            refuse("LONE_SURROGATE", _lone_surrogate_message(code, "low"), path)
        out.append(character)
    out.append('"')
    return "".join(out)


def utf16_sort_key(name: str) -> bytes:
    """RFC 8785 3.2.3 property ordering, as a sort key.

    UTF-16 big-endian bytes: comparing them lexicographically is exactly
    comparing the code units as unsigned 16-bit integers, which is what the RFC
    specifies and what JavaScript's ``<`` on strings already does. Sorting the
    Python ``str`` directly would compare code points and put U+FB33 before
    U+1F600, which is the divergence the RFC's sorting vector exists to catch.
    """
    try:
        return name.encode("utf-16-be")
    except UnicodeEncodeError:
        refuse("LONE_SURROGATE", _lone_surrogate_message(ord(name[0]), "high"), name)


class _Walk:
    __slots__ = ("limits", "parents", "out", "nodes", "length")

    def __init__(self, limits: Mapping[str, int]) -> None:
        self.limits = limits
        self.parents: set[int] = set()
        self.out: list[str] = []
        self.nodes = 0
        self.length = 0


def _emit(state: _Walk, fragment: str) -> None:
    """Append one fragment, counting it.

    A UTF-8 byte is never shorter than the code unit that produced it, so
    counting characters here bounds the encoded size early: a pathological
    document is refused while it is being serialized rather than after it has
    been serialized in full. The exact byte count is checked once, on the encoded
    result, because the bound is stated in bytes.
    """
    state.out.append(fragment)
    state.length += len(fragment)
    if state.length > state.limits["max_canonical_bytes"]:
        refuse(
            "MAX_CANONICAL_BYTES_EXCEEDED",
            f"the canonical form is longer than {state.limits['max_canonical_bytes']} bytes.",
        )


def _describe_non_json(value: Any, path: str) -> None:
    if value is None:
        return
    refuse(
        "NOT_JSON_VALUE",
        f"a {type(value).__name__} is not a JSON value. JCS is defined over the JSON data model and nothing "
        "else; a datetime, a Decimal, a set or a dataclass would have to be converted first, and this layer "
        "refuses rather than choosing a conversion on the caller's behalf.",
        path,
    )


def _walk(value: Any, path: str, depth: int, state: _Walk) -> None:
    state.nodes += 1
    if state.nodes > state.limits["max_nodes"]:
        refuse(
            "MAX_NODES_EXCEEDED",
            f"the value has more than {state.limits['max_nodes']} nodes. A digest is reachable from a file "
            "somebody else wrote, so the work it can cause is bounded by a number both languages share rather "
            "than by whichever one happened to read the file first.",
            path,
        )
    if depth > state.limits["max_depth"]:
        refuse(
            "MAX_DEPTH_EXCEEDED",
            f"the value nests deeper than {state.limits['max_depth']} levels. The deepest shape this family "
            "declares nests five, so a document past this bound is not a study record; it is a stack overflow "
            "with a schema on top.",
            path,
        )

    if value is None:
        _emit(state, "null")
        return
    if isinstance(value, bool):
        _emit(state, "true" if value else "false")
        return
    if isinstance(value, (int, float)):
        _emit(state, serialize_jcs_number(value, path))
        return
    if isinstance(value, str):
        _emit(state, serialize_jcs_string(value, path))
        return
    if isinstance(value, Mapping):
        _enter_cycle_check(value, path, state)
        keys = sorted(value.keys(), key=_key_of)
        _emit(state, "{")
        for index, key in enumerate(keys):
            if not isinstance(key, str):
                refuse(
                    "NOT_JSON_VALUE",
                    f"a {type(key).__name__} is not a JSON property name. JSON names are strings, and "
                    "converting one on the caller's behalf would give two keys one name.",
                    path,
                )
            here = key if path == "" else f"{path}.{key}"
            if index > 0:
                _emit(state, ",")
            _emit(state, serialize_jcs_string(key, here))
            _emit(state, ":")
            _walk(value[key], here, depth + 1, state)
        _emit(state, "}")
        state.parents.discard(id(value))
        return
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        _enter_cycle_check(value, path, state)
        _emit(state, "[")
        for index, item in enumerate(value):
            if index > 0:
                _emit(state, ",")
            _walk(item, f"{path}[{index}]", depth + 1, state)
        _emit(state, "]")
        state.parents.discard(id(value))
        return
    _describe_non_json(value, path)


def _key_of(name: Any) -> bytes:
    return utf16_sort_key(name) if isinstance(name, str) else b""


def _enter_cycle_check(value: Any, path: str, state: _Walk) -> None:
    if id(value) in state.parents:
        refuse(
            "CYCLE",
            "the value contains a cycle: this object is its own ancestor. JSON has no syntax for one, and a "
            "serializer that did not check would not return at all. Two references to the same object side by "
            "side are fine and are not a cycle -- only an object reachable from itself is refused.",
            path,
        )
    state.parents.add(id(value))


def canonicalize_jcs(value: Any, limits: Mapping[str, int] = STUDY_HASH_LIMITS) -> str:
    """The canonical form of a JSON value, as text (RFC 8785 3.2.1--3.2.3).

    The bounds are enforced during the walk rather than after it, so a document
    designed to exhaust memory is refused before it has been serialized rather
    than after.
    """
    state = _Walk(limits)
    _walk(value, "", 0, state)
    return "".join(state.out)


def canonicalize_jcs_bytes(value: Any, limits: Mapping[str, int] = STUDY_HASH_LIMITS) -> bytes:
    """The canonical form as UTF-8 bytes (RFC 8785 3.2.4).

    This is what a digest consumes. The text form above is for tests and for
    error messages; nothing hashes a Python ``str``, because the specification is
    about bytes.
    """
    encoded = canonicalize_jcs(value, limits).encode("utf-8")
    if len(encoded) > limits["max_canonical_bytes"]:
        refuse(
            "MAX_CANONICAL_BYTES_EXCEEDED",
            f"the canonical form encodes to {len(encoded)} bytes, past the "
            f"{limits['max_canonical_bytes']} byte bound.",
        )
    return encoded
