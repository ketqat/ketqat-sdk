"""What the study hashing entry points refuse, and the bounds they refuse past.

This mirrors `src/study/limits.ts`. The numbers and the refusal codes must stay
identical, because a limit that differs between the two languages is a file one
of them hashes and the other cannot -- which is worse than either answer, since
the reader is left unable to check rather than told that two answers disagree.

Every refusal carries a code from the closed list below. A code is what a caller
branches on and what the TypeScript verifier mirrors; a message is what a reader
acts on. Both are required, because the two audiences are different people.

The bounds exist because a hash function is reachable from a file somebody else
wrote. Depth, node count and canonical size are the three ways a well-formed
JSON document turns into unbounded work here, and each is bounded by a number
rather than by whichever recursion limit the interpreter happens to carry.

Rules are exported as immutable plain data -- tuples and frozen mappings, never
a mutable ``set`` or ``dict``. The working lookups are module-private, built once
from the published data, and never handed out.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Mapping

#: Every way the hashing core can refuse, named.
#:
#: A tuple rather than an enum so the list can be compared against
#: `STUDY_HASH_REFUSAL_CODES` in src/study/limits.ts element for element.
STUDY_HASH_REFUSAL_CODES: tuple[str, ...] = (
    # Values outside the JSON data model.
    "NOT_JSON_UNDEFINED",
    "NOT_JSON_FUNCTION",
    "NOT_JSON_SYMBOL",
    "NOT_JSON_BIGINT",
    "NOT_JSON_VALUE",
    # Values inside the JSON syntax that JCS itself refuses (RFC 8785 3.2.2.2,
    # 3.2.2.3), plus the one the two languages disagree about.
    "NON_FINITE_NUMBER",
    "LONE_SURROGATE",
    "UNSAFE_INTEGER",
    # Structural bounds.
    "CYCLE",
    "MAX_DEPTH_EXCEEDED",
    "MAX_NODES_EXCEEDED",
    "MAX_CANONICAL_BYTES_EXCEEDED",
    # Raw-byte file verification.
    "BYTE_ORDER_MARK",
    "INVALID_UTF8",
    "INVALID_JSON",
    "DUPLICATE_PROPERTY",
    # Projection and preimage.
    "UNKNOWN_RECORD_KIND",
    # A kind this build knows and deliberately does not hash. Separate from
    # ``UNKNOWN_RECORD_KIND`` because the two send a reader to different places:
    # one says nobody declared this, the other says we declared it as
    # control-plane state whose whole point is that it changes.
    "NOT_CONTENT_ADDRESSED",
    "UNKNOWN_HASH_RULES_ID",
    "MISSING_HEADER_COMPONENT",
    "INVALID_HEADER_COMPONENT",
    "EMPTY_PROJECTION",
    "SHAPE_MISMATCH",
    "UNDECLARED_FIELD",
    "INVALID_EXACT_NUMBER_STRING",
)

#: The lookup, module-private and built from the published tuple.
_REFUSAL_CODES = frozenset(STUDY_HASH_REFUSAL_CODES)


def is_study_hash_refusal_code(value: str) -> bool:
    return value in _REFUSAL_CODES


class StudyHashRefusal(ValueError):
    """A refusal from the hashing core.

    ``path`` is a dotted or indexed location inside the value being hashed, or
    ``None`` for a refusal about the value as a whole. It exists so a reader is
    sent to one place to look rather than told that something, somewhere, is
    wrong.
    """

    def __init__(self, code: str, message: str, path: str | None = None) -> None:
        super().__init__(message if path is None else f"{path}: {message}")
        self.code = code
        self.path = path


def refuse(code: str, message: str, path: str | None = None) -> "NoReturn":  # type: ignore[name-defined]
    raise StudyHashRefusal(code, message, path)


#: The structural bounds, as an immutable mapping.
#:
#: ``max_depth`` is generous for a study record -- the deepest declared shape in
#: the family nests five levels -- and small enough that neither language runs
#: out of stack before the bound is reached. ``max_nodes`` counts every value the
#: serializer visits, so a document that is wide rather than deep is bounded too.
#: ``max_canonical_bytes`` bounds the output rather than the input, which is what
#: a digest actually consumes.
#:
#: These three must stay identical to `STUDY_HASH_LIMITS` in
#: src/study/limits.ts; `python/tests/test_study_hash_core.py` compares them
#: against the TypeScript values through the shared fixture.
STUDY_HASH_LIMITS: Mapping[str, int] = MappingProxyType(
    {
        "max_depth": 64,
        "max_nodes": 100_000,
        "max_canonical_bytes": 8_388_608,
    }
)

#: The largest integer both languages represent exactly: 2**53 - 1.
#:
#: Above it a JSON integer literal stops meaning the same thing in the two
#: languages. Python holds the integer as written; JavaScript reads the nearest
#: double, so the ordinary 64-bit seed a Stim or NumPy run reports --
#: 13835058055282163712 -- comes back as 13835058055282164000 there, and near
#: 4.2e21 a single double stands for 524287 distinct integers at once. No
#: rendering rule reconciles that, because the value one side holds is not the
#: value that was written. Such a field takes the ``exact_integer_string``
#: contract in `study_values.py` instead.
JS_MAX_SAFE_INTEGER = 9_007_199_254_740_991
