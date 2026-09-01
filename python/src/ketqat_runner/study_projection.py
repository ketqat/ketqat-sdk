"""The typed canonical projection.

Mirrors `src/study/projection.ts`.

A projection reads **declared fields off a parsed record** and builds the
canonical body explicitly. It never matches on a key's name, never recurses over
keys it has not been told about, and never asks whether an object "looks like" an
embedded record.

That is the whole of the change. The rule it replaces decided what to leave out
by looking at a key's name at every nesting level, and five rounds of probing
found five holes in it -- a nested `slug`, a nested reference field named
`content_hash`, a free-map key chosen by whoever captured an environment,
unguarded numbers, `__proto__` -- each one found after the previous fix was
green. They were one bug reported five times: a rule that drops keys by name has
to be right about every name that can ever appear at every depth, including names
an attacker picks. Under a projection those questions do not arise, because a key
nobody declared is a key nothing reads.

The known cost of an allowlist is the mirror image, and it is real: a new
semantic field that nobody classifies stays out of the digest, and two records
differing only there share one. `tests/study-field-completeness.test.mjs` is what
that costs -- it walks each Zod schema and fails on any field the tables do not
classify, in either direction. This language reads the emitted tables rather than
restating them, so there is one declaration for that test to watch.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any, Mapping, Sequence

from .study_limits import refuse

#: The four classes every declared field takes exactly one of.
#:
#: - ``SEMANTIC`` -- model inputs, assumptions, scenario, reproduction
#:   conditions, and the numbers and claims a record asserts.
#: - ``RECORD_ONLY`` -- presentation and placement: labels, denormalized state,
#:   lifecycle pointers, prose written for a reader.
#: - ``RECEIPT_ONLY`` -- audit evidence: actor, subject, sequence, previous
#:   receipt, action, timestamp.
#: - ``DERIVED`` -- values that cannot be inputs to the digest that covers them:
#:   a record's own hash field, and the two header components a record repeats.
STUDY_FIELD_CLASSES: tuple[str, ...] = ("SEMANTIC", "RECORD_ONLY", "RECEIPT_ONLY", "DERIVED")

#: What a digest is being taken for.
#:
#: ``artifact`` reads no fields at all: it is taken over literal bytes and has no
#: projection. It is a member here because it is a header component, and a header
#: component drawn from a different list than the one the code branches on is how
#: two purposes end up sharing a namespace.
STUDY_HASH_PURPOSES: tuple[str, ...] = ("semantic", "record", "receipt", "artifact")

_NOT_DERIVED = ("SEMANTIC", "RECORD_ONLY", "RECEIPT_ONLY")

#: Which classes each purpose reads, as immutable plain data.
#:
#: Two lists per purpose, because a field's class answers two different
#: questions at two different depths.
#:
#: ``classes`` selects **top-level** fields: which of the record's own fields
#: this digest is taken over. ``record`` reads everything except ``DERIVED``,
#: which is what "the record as written" means once the fields that cannot be
#: inputs to themselves are set aside; ``semantic`` and ``receipt`` each read one
#: class, which is what makes them answer one question apiece.
#:
#: ``nested_classes`` filters **inside a value that has already been selected**.
#: Once a field participates in a digest, its value participates in full: the
#: only things stripped below the top level are ``DERIVED``, and -- for
#: ``semantic`` alone -- ``RECORD_ONLY``, the annotation on an envelope rather
#: than the measurement inside it. A ``Quantity``'s ``created_at`` moves whenever
#: an envelope is rebuilt around the same number, and a semantic digest that read
#: it would report new science every time a record was re-serialized.
#:
#: Applying ``classes`` at every depth instead dropped the contents of a selected
#: pointer: a ``study_event``'s ``plan_ref`` is ``RECEIPT_ONLY`` and
#: ``RevisionRef``'s own fields are ``SEMANTIC``, so the receipt projection wrote
#: ``"plan_ref":{}`` and two events adopting two different plan revisions took
#: one receipt digest.
STUDY_PURPOSE_FIELD_CLASSES: Mapping[str, Mapping[str, tuple[str, ...]]] = MappingProxyType(
    {
        "semantic": MappingProxyType(
            {"classes": ("SEMANTIC",), "nested_classes": ("SEMANTIC",)}
        ),
        "record": MappingProxyType({"classes": _NOT_DERIVED, "nested_classes": _NOT_DERIVED}),
        "receipt": MappingProxyType(
            {"classes": ("RECEIPT_ONLY",), "nested_classes": _NOT_DERIVED}
        ),
        "artifact": MappingProxyType({"classes": (), "nested_classes": ()}),
    }
)

_CLASSES_BY_PURPOSE = {
    purpose: (frozenset(entry["classes"]), frozenset(entry["nested_classes"]))
    for purpose, entry in STUDY_PURPOSE_FIELD_CLASSES.items()
}


def _filters_for_purpose(purpose: str) -> tuple[frozenset[str], frozenset[str]]:
    filters = _CLASSES_BY_PURPOSE.get(purpose)
    if filters is None:
        refuse(
            "INVALID_HEADER_COMPONENT",
            f"{purpose!r} is not a hash purpose. Known purposes: {', '.join(STUDY_HASH_PURPOSES)}. "
            "The list is closed because a purpose invented at a call site would be a new digest namespace "
            "nobody declared, sharing a name with none of the four whose meanings are written down.",
        )
    return filters


def classes_for_purpose(purpose: str) -> frozenset[str]:
    """The classes a purpose reads at the top level."""
    return _filters_for_purpose(purpose)[0]


def nested_classes_for_purpose(purpose: str) -> frozenset[str]:
    """The classes a purpose reads inside a value it has already selected."""
    return _filters_for_purpose(purpose)[1]


def _assert_projection_reads_something(
    shape: Mapping[str, Any], purpose: str, classes: frozenset[str], path: str
) -> None:
    """Refuse a projection that reads no field of this shape at all.

    A shape none of whose fields this purpose reads projects to ``{}`` for every
    record of its kind, so the digest is a constant: ``semantic_hash`` over a
    ``study_event`` -- whose every field is audit evidence -- returned one hex
    string for every event ever written, and a reader comparing two of them was
    told two unrelated events were "the same science".

    A constant is worse than a refusal, because it answers. The check is about
    which fields the *shape* declares, so it gives the same answer for every
    record of the kind and cannot pass on a full record and fail on a sparse one.
    """
    if any(field["field_class"] in classes for field in shape["fields"]):
        return
    refuse(
        "EMPTY_PROJECTION",
        f"{shape['name']} declares no field a {purpose} digest reads, so its {purpose} projection is {{}} for "
        "every record of this kind and the digest is a constant. A constant is not an answer to `are these two "
        "the same` -- it says yes to every pair. Ask for a purpose this kind has content for, or classify a "
        "field into the class this purpose reads.",
        path or None,
    )


def _declared_names(shape: Mapping[str, Any]) -> frozenset[str]:
    return frozenset(field["name"] for field in shape["fields"])


def _assert_only_declared_fields(shape: Mapping[str, Any], record: Mapping[str, Any], path: str) -> None:
    """Refuse a key nobody declared, rather than ignoring it.

    Ignoring is what an allowlist does by default, and by itself it is a
    collision: a record and the same record with one extra key project to the
    same body and take the same digest, so a field could be added to a signed-off
    file for nothing. The schemas in this family are all strict and would refuse
    such a file at parse -- but this layer is reachable without a parse, and this
    module is the only verifier some readers have.

    Note which question is asked: *is this key declared*, not *is this key called
    something suspicious*. No name is special, at any depth.
    """
    names = _declared_names(shape)
    for key in record:
        if key in names:
            continue
        here = key if path == "" else f"{path}.{key}"
        refuse(
            "UNDECLARED_FIELD",
            f"{shape['name']} does not declare a field named {key!r}. An undeclared key is refused rather "
            "than skipped: skipping it would give this record and the same record without the key one digest, "
            "and a field could then be added to a finished record at no cost.",
            here,
        )


def _project_value(
    value_shape: Mapping[str, Any],
    value: Any,
    purpose: str,
    nested: frozenset[str],
    path: str,
) -> Any:
    if value is None:
        return None
    kind = value_shape["kind"]
    if kind == "leaf":
        return value
    if kind == "array":
        if isinstance(value, (str, bytes, bytearray)) or not isinstance(value, Sequence):
            refuse(
                "SHAPE_MISMATCH",
                "the declaration says this field is a list, and the record carries something else. The "
                "projection builds the body from the declaration, so a value of the wrong shape is refused "
                "rather than serialized under a reading nobody declared.",
                path,
            )
        return [
            _project_value(value_shape["item"], item, purpose, nested, f"{path}[{index}]")
            for index, item in enumerate(value)
        ]
    if not isinstance(value, Mapping):
        refuse(
            "SHAPE_MISMATCH",
            f"the declaration says this field is a {value_shape['shape']['name']}, and the record carries "
            "something else.",
            path,
        )
    # ``nested`` for both the filter and the descent: below the top level the
    # rule no longer changes with depth.
    return _project_shape_with(value_shape["shape"], value, purpose, nested, nested, path)


def project_study_shape(
    shape: Mapping[str, Any],
    record: Mapping[str, Any],
    purpose: str,
    path: str = "",
) -> dict[str, Any]:
    """Build the canonical body for one shape.

    Only declared names are read, and only fields whose class this purpose reads
    are read at all. A declared field the record does not carry is omitted rather
    than written as null: absent and null are different statements in this
    family, and a projection that turned one into the other would give two
    different records one digest.
    """
    classes, nested = _filters_for_purpose(purpose)
    return _project_shape_with(shape, record, purpose, classes, nested, path)


def _project_shape_with(
    shape: Mapping[str, Any],
    record: Mapping[str, Any],
    purpose: str,
    classes: frozenset[str],
    nested: frozenset[str],
    path: str,
) -> dict[str, Any]:
    """The walk, with the two filters passed in rather than looked up.

    Top-level and nested filters differ (see ``STUDY_PURPOSE_FIELD_CLASSES``),
    and passing them explicitly keeps "which filter applies here" a fact about
    the call rather than about whether ``path`` happens to be empty.
    """
    _assert_projection_reads_something(shape, purpose, classes, path)
    if not isinstance(record, Mapping):
        refuse("SHAPE_MISMATCH", f"a {type(record).__name__} is not a {shape['name']}.", path)
    _assert_only_declared_fields(shape, record, path)
    body: dict[str, Any] = {}
    for field in shape["fields"]:
        if field["field_class"] not in classes:
            continue
        name = field["name"]
        if name not in record:
            continue
        here = name if path == "" else f"{path}.{name}"
        body[name] = _project_value(field["value"], record[name], purpose, nested, here)
    return body


def flatten_shape_classes(shape: Mapping[str, Any]) -> dict[str, str]:
    """The classification of one shape, flattened to ``path -> class``.

    The mirror of `flattenShapeClasses` in src/study/registry.ts, so the parity
    test can compare the two flattenings rather than two nested trees.
    """
    out: dict[str, str] = {}

    def visit(current: Mapping[str, Any], prefix: str, seen: frozenset[int]) -> None:
        # A shape that contained itself would not terminate here. No shape in
        # this family does; the guard makes that a fact about the code.
        if id(current) in seen:
            return
        nested = seen | {id(current)}
        for field in current["fields"]:
            path = field["name"] if prefix == "" else f"{prefix}.{field['name']}"
            out[path] = field["field_class"]
            value = field["value"]
            while value["kind"] == "array":
                value = value["item"]
            if value["kind"] == "object":
                visit(value["shape"], path, nested)

    visit(shape, "", frozenset())
    return out
