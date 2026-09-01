"""Every shipped study pattern, against every input that tells two engines apart.

A study JSON Schema carries the pattern text its TypeScript contract compiles,
byte for byte. That is what makes the two halves one contract, and it is why the
regex dialect matters: `jsonschema` reads that text with Python's `re`, whose
`$`, `.`, `\\s`, `\\d` and `\\w` do not mean what ECMAScript's mean.

These tests drive the real shipped schemas rather than a sample, so a pattern
added later is covered the day it ships.
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest

from ketqat_runner.study_pattern import matches_ecmascript, to_python_pattern
from ketqat_runner.study_validation import _STUDY_VALIDATOR

SCHEMAS = pathlib.Path(__file__).resolve().parents[2] / "schemas"

STUDY_SCHEMA_NAMES = (
    "study", "study-event", "problem-specification", "study-plan", "study-task",
    "evidence-node", "evidence-edge", "execution-capsule", "research-package",
    "confirmation-receipt", "study-task-authorization", "execution-job", "task-outcome",
)

#: Inputs that distinguish the engines, or that a contract should refuse outright.
HOSTILE_SUFFIXES = {
    "trailing LF": "\n",
    "trailing CRLF": "\r\n",
    "trailing CR": "\r",
    "U+2028 line separator": " ",
    "U+2029 paragraph separator": " ",
    "NUL": "\x00",
}

#: Shorthands whose meaning differs between the two engines. A shipped pattern
#: must not contain one: the family spells its classes with literal ranges so the
#: same text means the same thing on both sides.
NON_PORTABLE = re.compile(r"\\[sSdDwWbB]|\\[pP]\{|\(\?<[=!]")


def _patterns() -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}

    def walk(node: object, path: str, file: str) -> None:
        if isinstance(node, dict):
            pattern = node.get("pattern")
            if isinstance(pattern, str):
                found.setdefault(pattern, []).append(f"{file}{path}")
            for key, value in node.items():
                walk(value, f"{path}.{key}", file)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]", file)

    for name in STUDY_SCHEMA_NAMES:
        path = SCHEMAS / f"{name}.schema.json"
        if path.exists():
            walk(json.loads(path.read_text()), "", path.name)
    return found


PATTERNS = _patterns()


def test_the_shipped_schemas_actually_carry_patterns() -> None:
    """Guard the guard: an empty sweep would make every test below vacuous."""
    assert len(PATTERNS) >= 15, f"only {len(PATTERNS)} patterns found under {SCHEMAS}"


@pytest.mark.parametrize("pattern", sorted(PATTERNS))
def test_no_shipped_pattern_uses_a_shorthand_the_two_engines_read_differently(
    pattern: str,
) -> None:
    """`\\s` is not `\\s`, and `\\p{...}` is not syntax here at all.

    Python's `\\s` includes `\\x1c-\\x1f` and `\\x85`; ECMAScript's includes
    `\\ufeff`. `\\d` and `\\w` are Unicode-wide in Python and ASCII in
    ECMAScript. `\\p{...}` and lookbehind are ECMAScript-only or Python-only
    depending on the construct. A pattern using any of them means two things.
    """
    found = NON_PORTABLE.search(pattern)
    assert found is None, (
        f"{pattern!r} uses {found.group(0)!r}, which the two engines read differently. "
        f"Spell the class with literal ranges. Sites: {PATTERNS[pattern][:2]}"
    )


@pytest.mark.parametrize("pattern", sorted(PATTERNS))
def test_every_shipped_pattern_compiles_after_translation(pattern: str) -> None:
    """The translation must produce something Python can compile, for every pattern."""
    re.compile(to_python_pattern(pattern))


def _sample_for(pattern: str) -> str | None:
    """A value the pattern accepts, so the hostile variants have a base to spoil."""
    for candidate in (
        "a" * 64, "a" * 40, "1", "1.5", "0", "study-v1", "abc", "qubits",
        "2026-09-01", "2026-09-01T00:00:00Z", "sha256:" + "a" * 64,
        "SOME_CODE", "a" * 32, "abcdefghijklmnop", "text/csv", "a/b",
        "01234567-89ab-4cde-8f01-23456789abcd", "objective",
    ):
        if matches_ecmascript(pattern, candidate):
            return candidate
    return None


@pytest.mark.parametrize("pattern", sorted(PATTERNS))
def test_no_anchored_pattern_accepts_a_hostile_suffix(pattern: str) -> None:
    """The `$`-before-final-newline difference, and the line terminators.

    Only anchored patterns are asserted: an unanchored `pattern` is a search in
    both engines, and a trailing newline after a match is none of its business.
    """
    if not (pattern.startswith("^") and pattern.endswith("$")):
        pytest.skip("not fully anchored; `pattern` is a search keyword")
    sample = _sample_for(pattern)
    if sample is None:
        pytest.skip("no accepted sample derivable for this pattern")

    for label, suffix in HOSTILE_SUFFIXES.items():
        spoiled = sample + suffix
        assert not matches_ecmascript(pattern, spoiled), f"{label} accepted by {pattern!r}"
        # And through the validator the family actually uses.
        validator = _STUDY_VALIDATOR({"type": "string", "pattern": pattern})
        assert not validator.is_valid(spoiled), f"{label} accepted by the validator for {pattern!r}"
        assert validator.is_valid(sample), f"the sample itself was refused by {pattern!r}"
