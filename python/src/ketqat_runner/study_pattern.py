"""ECMAScript regular-expression semantics, for patterns written once and read twice.

A study JSON Schema is generated from a Zod schema. The pattern text in the
schema is the pattern text the TypeScript contract compiles, byte for byte --
which is the point, and which is also the trap: the same text does not mean the
same thing to ECMAScript and to Python's ``re``, and ``jsonschema`` evaluates the
``pattern`` keyword with ``re``.

Two differences reach the shipped patterns, and both make Python the *more*
permissive engine, so a file one language refuses the other accepts:

``$``
    In ECMAScript without the ``m`` flag, ``$`` asserts end of input. In Python
    it also matches immediately before a final newline. Every ``^…$`` pattern in
    the family therefore accepts one trailing ``\\n`` in Python -- and a value
    and the same value with a newline hash to different digests, so a contract
    whose purpose is one spelling per value admitted two.

``.``
    ECMAScript's ``.`` excludes four line terminators: ``\\n``, ``\\r``,
    ``U+2028`` and ``U+2029``. Python's excludes only ``\\n``. A pattern ending
    ``.+$`` accepts a carriage return and both Unicode separators here and not
    there.

The translation below rewrites those two constructs into forms that mean the
same thing in both engines, and leaves everything else alone. It is deliberately
conservative: it tracks character classes and escapes so it never rewrites a
``$`` that is a literal dollar sign or a ``.`` inside ``[...]``, and anything it
does not understand it passes through unchanged rather than guessing.

This is not a general ECMAScript engine. It closes the differences the shipped
patterns actually contain, and `tests/test_study_pattern.py` drives every one of
them against every input that distinguishes the two engines, so a new pattern
that introduces a third difference fails there rather than in a consumer.
"""

from __future__ import annotations

import re
from typing import Final

#: ECMAScript's `.`: any code point that is not a line terminator.
#:
#: Written as a negated class rather than as `re.DOTALL` plus exclusions,
#: because the pattern is embedded in a larger expression whose flags belong to
#: the pattern's author.
ECMASCRIPT_DOT: Final = "[^\\n\\r\\u2028\\u2029]"

#: ECMAScript's `$` without the `m` flag: nothing follows.
#:
#: `\Z` would be the direct equivalent, but a lookahead composes in every
#: position `$` can occupy -- inside an alternation, inside a group, before a
#: quantified suffix -- where `\Z` reads the same and behaves the same only
#: because it is zero-width. The lookahead is chosen for being obviously
#: zero-width to a reader.
ECMASCRIPT_END: Final = "(?![\\s\\S])"

#: ECMAScript's `^` without the `m` flag: nothing precedes.
ECMASCRIPT_START: Final = "(?<![\\s\\S])"


def to_python_pattern(pattern: str) -> str:
    """Rewrite an ECMAScript pattern so Python's ``re`` reads it the same way.

    Only ``^``, ``$`` and ``.`` are touched, and only where they are operators:
    an escaped ``\\.``, a ``$`` inside ``[...]``, and everything inside a
    character class are left exactly as written.
    """
    out: list[str] = []
    in_class = False
    index = 0
    length = len(pattern)

    while index < length:
        character = pattern[index]

        if character == "\\":
            # An escape and whatever it escapes travel together, untouched. This
            # is what keeps `\.` a literal dot and `\$` a literal dollar.
            out.append(pattern[index : index + 2])
            index += 2
            continue

        if in_class:
            if character == "]":
                in_class = False
            out.append(character)
            index += 1
            continue

        if character == "[":
            in_class = True
            out.append(character)
            index += 1
            continue

        if character == ".":
            out.append(ECMASCRIPT_DOT)
        elif character == "$":
            out.append(ECMASCRIPT_END)
        elif character == "^":
            out.append(ECMASCRIPT_START)
        else:
            out.append(character)
        index += 1

    return "".join(out)


def compile_ecmascript(pattern: str) -> re.Pattern[str]:
    """Compile an ECMAScript pattern with Python semantics corrected."""
    return re.compile(to_python_pattern(pattern))


def matches_ecmascript(pattern: str, value: str) -> bool:
    """Does ``value`` match ``pattern`` the way ECMAScript's ``test`` would?

    A search rather than a full match, because that is what JSON Schema's
    ``pattern`` keyword specifies in both engines -- an unanchored pattern is
    satisfied by a substring. The anchors do the anchoring, and after the
    translation above they anchor to the same places.
    """
    return compile_ecmascript(pattern).search(value) is not None
