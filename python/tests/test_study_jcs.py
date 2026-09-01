"""RFC 8785 conformance, pinned against the RFC's own published vectors.

The mirror of `tests/study-jcs.test.mjs`: the same fixture file, the same
assertions. That is the whole point of adopting a published canonicalization
scheme -- when this file and the TypeScript one disagree about a digest, one of
them fails here, against the specification, and the failure names which side is
wrong instead of merely reporting that two implementations differ.

Two of these tests exist specifically because Python gets them wrong by default:
sorting property names natively compares code points and puts U+FB33 before
U+1F600, and ``repr`` formats four of the RFC's own sample numbers differently
from ECMAScript.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import pytest

from ketqat_runner.study_jcs import (
    canonicalize_jcs,
    canonicalize_jcs_bytes,
    serialize_jcs_number,
    serialize_jcs_string,
)
from ketqat_runner.study_limits import StudyHashRefusal

_FIXTURE = (
    Path(__file__).resolve().parents[2] / "fixtures" / "jcs" / "rfc8785-vectors.json"
)
VECTORS = json.loads(_FIXTURE.read_text(encoding="utf-8"))


def double_from_hex(hex_text: str) -> float:
    """An IEEE 754 double from the RFC's 64-bit big-endian hex bit pattern."""
    return struct.unpack(">d", bytes.fromhex(hex_text))[0]


def test_appendix_b_number_serialization() -> None:
    samples = VECTORS["number_serialization"]["samples"]
    assert len(samples) == 24, "the RFC's table has 24 serializable rows"
    for sample in samples:
        value = double_from_hex(sample["ieee754"])
        assert serialize_jcs_number(value) == sample["json"], sample
        # And through the canonicalizer, which is the path a digest takes.
        assert canonicalize_jcs(value) == sample["json"], sample


def test_minus_zero_and_whole_floats() -> None:
    # The two the RFC cites ECMAScript `Number::toString` for. A canonicalizer
    # that rendered them faithfully would give two spellings to two values JSON
    # cannot tell apart.
    assert serialize_jcs_number(-0.0) == "0"
    assert serialize_jcs_number(0.0) == "0"
    assert serialize_jcs_number(3.0) == "3"
    assert serialize_jcs_number(4.5) == "4.5"
    assert canonicalize_jcs({"a": -0.0, "b": 3.0}) == '{"a":0,"b":3}'


def test_python_repr_would_have_been_wrong() -> None:
    # The four rows where `repr` and ECMAScript disagree, called out so a future
    # simplification to `repr` fails here rather than in a digest comparison.
    assert repr(1e20) == "1e+20" and serialize_jcs_number(1e20) == "100000000000000000000"
    assert repr(0.000001) == "1e-06" and serialize_jcs_number(0.000001) == "0.000001"
    assert repr(1e-7) == "1e-07" and serialize_jcs_number(1e-7) == "1e-7"
    assert (
        repr(9007199254740992.0) == "9007199254740992.0"
        and serialize_jcs_number(9007199254740992.0) == "9007199254740992"
    )


def test_nan_and_infinity_terminate() -> None:
    for sample in VECTORS["number_serialization"]["must_terminate"]:
        value = double_from_hex(sample["ieee754"])
        with pytest.raises(StudyHashRefusal) as caught:
            serialize_jcs_number(value)
        assert caught.value.code == "NON_FINITE_NUMBER", sample
    with pytest.raises(StudyHashRefusal) as caught:
        canonicalize_jcs({"x": -math.inf})
    assert caught.value.code == "NON_FINITE_NUMBER"


def test_primitive_sample_canonicalizes_verbatim() -> None:
    sample = VECTORS["primitive_serialization"]
    assert canonicalize_jcs(json.loads(sample["input_json"])) == sample["expected_canonical"]


def test_property_names_sort_by_utf16_code_unit() -> None:
    sorting = VECTORS["property_sorting"]
    canonical = canonicalize_jcs(json.loads(sorting["input_json"]))
    previous = -1
    for value in sorting["expected_value_order"]:
        at = canonical.index(json.dumps(value))
        assert at > previous, f"{value} must follow the value before it"
        previous = at
    # The point of the vector. Sorting Python strings natively compares code
    # points and puts U+FB33 first; the RFC requires U+1F600 first, because it
    # sorts as its high surrogate D83D.
    assert canonical.index('"Emoji: Grinning Face"') < canonical.index(
        '"Hebrew Letter Dalet With Dagesh"'
    )
    assert sorted(["דּ", "\U0001f600"]) == ["דּ", "\U0001f600"], (
        "native Python order is the wrong one, which is why this vector exists"
    )


def test_string_escaping_is_the_short_table() -> None:
    assert serialize_jcs_string("\b\t\n\f\r") == '"\\b\\t\\n\\f\\r"'
    assert serialize_jcs_string("\u0000\u001f") == '"\\u0000\\u001f"'
    assert serialize_jcs_string('a"b\\c') == '"a\\"b\\\\c"'
    # Not escaped: the solidus, and everything non-ASCII including C1 controls.
    assert serialize_jcs_string("/") == '"/"'
    assert serialize_jcs_string("€ö\U0001f600") == '"€ö\U0001f600"'
    assert serialize_jcs_string("\u0080\u009f") == '"\u0080\u009f"'


def test_lone_surrogate_terminates() -> None:
    for bad in ["\ud800", "\udead", "a\ud83db", "\udc00x"]:
        with pytest.raises(StudyHashRefusal) as caught:
            serialize_jcs_string(bad)
        assert caught.value.code == "LONE_SURROGATE", bad
    # A well-formed pair is one code point in Python and is serialized as itself.
    assert serialize_jcs_string("\U0001f600") == '"\U0001f600"'


def test_the_sample_encodes_to_the_exact_bytes_the_rfc_prints() -> None:
    # The RFC gives the byte sequence for the 3.2.2 sample, and a digest consumes
    # bytes rather than code points -- an implementation could produce the right
    # characters and the wrong encoding, and only this vector would notice.
    sample = VECTORS["primitive_serialization"]
    encoded = canonicalize_jcs_bytes(json.loads(sample["input_json"]))
    assert encoded.hex() == sample["expected_utf8_hex"]


def test_canonical_form_is_utf8_bytes() -> None:
    encoded = canonicalize_jcs_bytes({"€": "\U0001f600"})
    assert isinstance(encoded, bytes)
    assert encoded.decode("utf-8") == '{"€":"\U0001f600"}'


def test_no_unicode_normalization() -> None:
    composed = "é"
    decomposed = "é"
    assert canonicalize_jcs({"name": composed}) != canonicalize_jcs({"name": decomposed})
    both = canonicalize_jcs({composed: 1, decomposed: 2})
    assert '"é":1' in both
    assert '"é":2' in both


def test_arrays_keep_order_and_nested_objects_are_sorted() -> None:
    assert canonicalize_jcs([3, 1, 2]) == "[3,1,2]"
    assert canonicalize_jcs([{"b": 1, "a": 2}]) == '[{"a":2,"b":1}]'
    assert canonicalize_jcs({"z": {"y": 1, "x": 2}}) == '{"z":{"x":2,"y":1}}'


def test_literals() -> None:
    assert canonicalize_jcs(None) == "null"
    assert canonicalize_jcs(True) == "true"
    assert canonicalize_jcs(False) == "false"
    assert canonicalize_jcs({"a": None}) == '{"a":null}'


def test_an_unsafe_integer_is_refused_by_name() -> None:
    # The one value the two languages cannot be brought into agreement about by
    # a rendering rule: Python holds the integer as written, JavaScript reads the
    # nearest double, and many distinct integers share it.
    with pytest.raises(StudyHashRefusal) as caught:
        canonicalize_jcs({"seed": 13835058055282163712})
    assert caught.value.code == "UNSAFE_INTEGER"
    assert canonicalize_jcs({"n": 9007199254740991}) == '{"n":9007199254740991}'
    # A float of the same magnitude is the same double in both languages and is
    # left alone.
    assert canonicalize_jcs({"n": 1e30}) == '{"n":1e+30}'


def test_a_bool_is_not_a_number() -> None:
    # `isinstance(True, int)` is true in Python, so without the guard `true` and
    # `1` would take one digest.
    assert canonicalize_jcs([True, 1]) == "[true,1]"
