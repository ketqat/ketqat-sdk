"""Properties of the study hashing family, and the cross-language corpus (goal 16).

The mirror of `tests/study-properties.test.mjs`. The five properties are the
same five, and they are stated here rather than imported, because a property
checked by one implementation against itself is not a check:

    1  records defined as identical produce identical canonical bytes
    2  changing one SEMANTIC field changes the semantic bytes
    3  changing only a RECORD_ONLY or RECEIPT_ONLY field behaves exactly as its
       classification says -- unchanged where the classification excludes it,
       changed where it includes it
    4  TypeScript and Python return the same bytes, or the same refusal code and
       JSON path, for the same input
    5  a record built in memory and the same record re-read from a file hash
       identically

Properties 2 and 3 are one predicate here rather than two assertions. Stated
separately, 2 says "a semantic change moves the semantic digest" and 3 says "a
presentation change does not"; only their conjunction -- **the digest moves
exactly when the projection reaches the field** -- rules out both an
implementation that hashes everything and one that hashes nothing.
``_visible_for_purpose`` below derives that prediction from the emitted class
tables, and the TypeScript suite derives it again from its own copy, so a wrong
classification has to be wrong in three places before anything passes.

Property 4 is what the corpus is for. `fixtures/study/property-corpus.json`
carries the inputs and the answers TypeScript computed; this module recomputes
them here. A divergence fails on this side, with a case id naming the input,
rather than as two suites reporting different totals.

``hypothesis`` is a test-only dependency, declared in the ``dev`` extra of
`python/pyproject.toml`. It is imported at module scope rather than through
``importorskip`` on purpose: a machine without it must fail loudly, because a
generative suite that skips reads as a pass, and this is the file whose whole job
is to find what the fixtures did not.
"""

from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path
from typing import Any, Mapping

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from ketqat_runner.study_file import read_study_file_bytes
from ketqat_runner.study_hash import (
    artifact_hash,
    receipt_hash,
    record_hash,
    semantic_hash,
    study_canonical_body,
    study_self_hash,
)
from ketqat_runner.study_limits import STUDY_HASH_LIMITS, StudyHashRefusal
from ketqat_runner.study_projection import (
    classes_for_purpose,
    nested_classes_for_purpose,
)
from ketqat_runner.study_registry import (
    STUDY_RECORD_KIND_NAMES,
    STUDY_RECORD_KINDS,
    study_record_kind,
)
from ketqat_runner.study_rules import STUDY_HASH_RULES_ID
from ketqat_runner.study_values import is_exact_decimal_string, is_exact_integer_string

_ROOT = Path(__file__).resolve().parents[2]
_CORPUS_PATH = _ROOT / "fixtures" / "study" / "property-corpus.json"
CORPUS: Mapping[str, Any] = json.loads(_CORPUS_PATH.read_text(encoding="utf-8"))

PURPOSES = ("semantic", "record", "receipt")
_HASH_FOR_PURPOSE = {
    "semantic": semantic_hash,
    "record": record_hash,
    "receipt": receipt_hash,
}

RECORDS_BY_ID = {entry["case_id"]: entry for entry in CORPUS["records"]}
ENTRIES_BY_KIND = {entry["record_kind"]: entry for entry in STUDY_RECORD_KINDS}

#: How many cases a generative property draws.
#:
#: The PR gate runs a fixed number from a fixed seed, so a red build is red for
#: everybody rather than a coin toss that lands differently on a rerun. A
#: scheduled job raises ``KETQAT_PROPERTY_RUNS``; a case it finds is written into
#: the corpus, where it stays found.
_RUNS = int(os.environ.get("KETQAT_PROPERTY_RUNS", "120"))
_SETTINGS = settings(
    max_examples=_RUNS,
    deadline=None,
    derandomize=True,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large],
)


# ---------------------------------------------------------------------------
# Reading the corpus
# ---------------------------------------------------------------------------


def _apply_edits(record: Any, edits: Any) -> Any:
    """Apply a case's edits to a copy of its base record.

    The mirror of ``applyEdits`` in the generator, written independently so a bug
    in one interpreter shows up as a disagreement rather than as two languages
    quietly agreeing about the wrong record.
    """
    out = json.loads(json.dumps(record))
    for edit in edits:
        op = edit["op"]
        if op == "delete":
            container, last = _resolve(out, edit["path"])
            if isinstance(last, int):
                container.pop(last)
            else:
                container.pop(last, None)
            continue
        value = _build_special(edit["special"]) if "special" in edit else edit.get("value")
        if op == "set":
            container, last = _resolve(out, edit["path"])
            container[last] = value
            continue
        if op == "add":
            container = out if edit["path"] == "" else _read_at(out, edit["path"])
            container[edit["key"]] = value
            continue
        raise AssertionError(f"Unknown edit op {op}")
    return out


def _segments(path: str) -> list[Any]:
    """A dotted path with bracketed indices, the spelling a refusal reports.

    An empty run between two separators contributes nothing, so ``inputs[0].name``
    is three segments rather than four. The grammar is the one the projection
    reports refusals in, and a refusal *can* name an empty key -- ``core.`` is
    what an undeclared key called ``""`` looks like -- but an edit never
    addresses one: the ``add`` op carries its key beside the path for exactly
    that reason.
    """
    out: list[Any] = []
    current = ""
    index = 0
    while index < len(path):
        char = path[index]
        if char == ".":
            if current != "":
                out.append(current)
            current = ""
            index += 1
            continue
        if char == "[":
            if current != "":
                out.append(current)
                current = ""
            end = path.index("]", index)
            out.append(int(path[index + 1 : end]))
            index = end + 1
            continue
        current += char
        index += 1
    if current != "":
        out.append(current)
    return out


def _resolve(record: Any, path: str) -> tuple[Any, Any]:
    segments = _segments(path)
    current = record
    for segment in segments[:-1]:
        current = current[segment]
    return current, segments[-1]


def _read_at(record: Any, path: str) -> Any:
    container, last = _resolve(record, path)
    return container[last]


def _build_special(special: Mapping[str, Any]) -> Any:
    """The values a JSON file cannot carry, built rather than parsed.

    A lone surrogate is a legal ``str`` here and an illegal literal in the
    corpus; ``-0.0`` would have been written as ``0`` by whichever serializer
    produced the file. Both are described in the corpus and constructed here, so
    what this language hashes is what the other one hashed rather than what a
    round trip left behind.
    """
    kind = special["kind"]
    if kind == "nan":
        return math.nan
    if kind == "infinity":
        return math.inf
    if kind == "negative_infinity":
        return -math.inf
    if kind == "negative_zero":
        return -0.0
    if kind == "lone_surrogate_high":
        return "before\ud800after"
    if kind == "lone_surrogate_low":
        return "before\udc00after"
    if kind == "deep_array":
        value: Any = 1
        for _ in range(special["depth"]):
            value = [value]
        return value
    if kind == "wide_array":
        return list(range(special["length"]))
    if kind == "long_string":
        return "a" * special["length"]
    raise AssertionError(f"Unknown special {kind}")


def _outcome(
    record_kind: str, record: Any, purpose: str, limits: Any = None, *, with_body: bool = False
) -> dict[str, Any]:
    """What a purpose does with a record: bytes and a digest, or a refusal."""
    effective = STUDY_HASH_LIMITS if limits is None else limits
    try:
        digest = _HASH_FOR_PURPOSE[purpose](record_kind, record, effective)
        if with_body:
            return {
                "body": study_canonical_body(record_kind, record, purpose, effective),
                "digest": digest,
            }
        return {"digest": digest}
    except StudyHashRefusal as refusal:
        return {"refusal": {"code": refusal.code, "path": refusal.path}}


# ---------------------------------------------------------------------------
# The corpus: property 4, and the pinned answers behind 1-3 and 5
# ---------------------------------------------------------------------------


def test_corpus_agrees_about_the_rules_it_was_written_under() -> None:
    assert dict(CORPUS["limits"]) == dict(STUDY_HASH_LIMITS)
    assert CORPUS["hash_rules_id"] == STUDY_HASH_RULES_ID
    covered = {entry["record_kind"] for entry in CORPUS["records"]}
    assert covered == set(STUDY_RECORD_KIND_NAMES), (
        "A record kind with no corpus record is a kind nothing checks across the language boundary."
    )


def test_corpus_is_itself_a_file_this_family_accepts() -> None:
    # The corpus is full of the values that break readers. A fixture the family's
    # own file gate refuses would prove that these bytes are unhashable, not that
    # they hash the same in two languages -- and it is what forces the two values
    # that cannot be written down in it, a lone surrogate and an integer past
    # 2**53, to be carried as instructions and as base64 rather than as literals.
    reading = read_study_file_bytes(_CORPUS_PATH.read_bytes())
    assert reading.value["seed"] == CORPUS["seed"]


def test_every_base_record_reproduces_its_pinned_bodies_and_digests() -> None:
    failures = []
    for entry in CORPUS["records"]:
        for purpose in PURPOSES:
            actual = _outcome(entry["record_kind"], entry["record"], purpose, with_body=True)
            if actual != entry["purposes"][purpose]:
                failures.append(f"{entry['case_id']} {purpose}: {actual}")
        expected = entry["self_hash"]
        try:
            actual_self: dict[str, Any] = {
                "field": expected["field"],
                "purpose": expected["purpose"],
                "digest": study_self_hash(entry["record_kind"], entry["record"]),
            }
        except StudyHashRefusal as refusal:
            actual_self = {
                "field": expected["field"],
                "purpose": expected["purpose"],
                "refusal": {"code": refusal.code, "path": refusal.path},
            }
        if actual_self != expected:
            failures.append(f"{entry['case_id']} self_hash: {actual_self}")
    assert failures == [], "\n".join(failures[:8])


def test_every_case_reproduces_its_pinned_answer() -> None:
    failures = []
    for case in CORPUS["cases"]:
        base = RECORDS_BY_ID[case["base"]]
        record = _apply_edits(base["record"], case["edits"])
        for purpose in PURPOSES:
            pinned = case["purposes"][purpose]
            if pinned == "unchanged":
                before = base["purposes"][purpose]
                expected = (
                    {"refusal": before["refusal"]}
                    if "refusal" in before
                    else {"digest": before["digest"]}
                )
            else:
                expected = pinned
            actual = _outcome(case["record_kind"], record, purpose, case.get("limits"))
            if actual != expected:
                failures.append(f"{case['case_id']} {purpose}: expected {expected}, got {actual}")
    assert failures == [], "\n".join(failures[:8])


def _flatten_classes(shape: Mapping[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}

    def visit(current: Mapping[str, Any], prefix: str, seen: frozenset[int]) -> None:
        if id(current) in seen:
            return
        deeper = seen | {id(current)}
        for field in current["fields"]:
            path = field["name"] if prefix == "" else f"{prefix}.{field['name']}"
            out[path] = field["field_class"]
            value = field["value"]
            while value["kind"] == "array":
                value = value["item"]
            if value["kind"] == "object":
                visit(value["shape"], path, deeper)

    visit(shape, "", frozenset())
    return out


CLASSES_BY_KIND = {
    entry["record_kind"]: _flatten_classes(entry["shape"]) for entry in STUDY_RECORD_KINDS
}


def _visible_for_purpose(classes: Mapping[str, str], purpose: str, decl_path: str) -> bool:
    """Whether a purpose's projection reaches a declaration path.

    ``STUDY_PURPOSE_FIELD_CLASSES`` read as a path predicate: the *first* segment
    is selected by the purpose's top-level classes, and every segment below it by
    the nested classes. That composition rule is the one the ``study_event``
    receipt defect broke -- applying the top-level classes at every depth made a
    ``RECEIPT_ONLY`` ``plan_ref`` select the pointer and then drop the
    ``SEMANTIC`` fields inside it, so two events adopting two different plan
    revisions took one receipt digest. The corpus case is
    ``study_event/full:set:plan_ref.revision_hash``, which is why this walks
    ancestors instead of asking about one field.
    """
    top = classes_for_purpose(purpose)
    nested = nested_classes_for_purpose(purpose)
    parts = decl_path.split(".")
    for index in range(len(parts)):
        prefix = ".".join(parts[: index + 1])
        field_class = classes.get(prefix)
        assert field_class is not None, f"No class declared for {prefix}"
        if field_class not in (top if index == 0 else nested):
            return False
    return True


def test_properties_2_and_3_a_digest_moves_exactly_when_its_purpose_reaches_the_field() -> None:
    failures = []
    checked = 0
    for case in CORPUS["cases"]:
        if "visible" not in case:
            continue
        base = RECORDS_BY_ID[case["base"]]
        classes = CLASSES_BY_KIND[case["record_kind"]]
        for purpose in PURPOSES:
            predicted = _visible_for_purpose(classes, purpose, case["declaration_path"])
            if predicted != case["visible"][purpose]:
                failures.append(
                    f"{case['case_id']} {purpose}: the corpus predicts "
                    f"{case['visible'][purpose]} and the class tables predict {predicted}"
                )
                continue
            # A purpose the base record already refuses says nothing about
            # visibility: `semantic_hash` over a `study_event` refuses for every
            # event ever written, so "did the digest move" has no answer.
            if "refusal" in base["purposes"][purpose]:
                continue
            checked += 1
            moved = case["purposes"][purpose] != "unchanged"
            if moved != predicted:
                failures.append(
                    f"{case['case_id']} {purpose}: {case['field_class']} at "
                    f"{case['declaration_path']} is {'read' if predicted else 'not read'} by this "
                    f"purpose, and the digest {'moved' if moved else 'did not move'}"
                )
    assert failures == [], "\n".join(failures[:8])
    assert checked > 1000, f"Only {checked} classification claims were checkable."


def _declaration_leaf_paths(shape: Mapping[str, Any]) -> list[str]:
    """Every declaration path of a shape that ends in a leaf.

    A leaf is where a value actually lives, so the set of leaf paths is the set of
    places a record can differ. An intermediate object path is not one: changing
    ``core`` means changing something inside it, and the case that does so is
    already present under a longer path.
    """
    out: list[str] = []

    def visit(current: Mapping[str, Any], prefix: str, seen: frozenset[int]) -> None:
        if id(current) in seen:
            return
        deeper = seen | {id(current)}
        for field in current["fields"]:
            path = field["name"] if prefix == "" else f"{prefix}.{field['name']}"
            value = field["value"]
            while value["kind"] == "array":
                value = value["item"]
            if value["kind"] == "object":
                visit(value["shape"], path, deeper)
            else:
                out.append(path)

    visit(shape, "", frozenset())
    return out


def test_every_declared_leaf_of_every_kind_is_mutated_somewhere() -> None:
    # The coverage claim, checked rather than asserted in a comment. A field added
    # to a shape and to no fixture is exactly the silent omission the projection's
    # allowlist can hide, and `tests/study-field-completeness.test.mjs` catches it
    # only against the Zod schema -- it says nothing about whether anything hashes
    # the field afterwards. This does, in the language that reads the emitted
    # tables rather than the one that writes them.
    failures = []
    for entry in STUDY_RECORD_KINDS:
        expected = [
            path
            for path in _declaration_leaf_paths(entry["shape"])
            # Committed by the preimage header rather than by the body, and
            # exercised as header components instead.
            if path not in ("schema_version", "hash_rules_id")
        ]
        mutated = {
            case["declaration_path"]
            for case in CORPUS["cases"]
            if case.get("kind") == "leaf-mutation"
            and case["base"] == f"{entry['record_kind']}/full"
        }
        failures.extend(
            f"{entry['record_kind']}: {path}" for path in expected if path not in mutated
        )
    assert failures == [], "Declared leaves nothing in the corpus changes:\n" + "\n".join(
        failures[:12]
    )


def test_the_corpus_exercises_both_sides_of_the_classification() -> None:
    # A corpus in which every mutation moved every digest would pass the property
    # above while proving nothing about exclusion, and one in which none did would
    # prove nothing about inclusion. Both halves have to be populated for the
    # `if and only if` to have any content.
    moved = sum(
        1
        for case in CORPUS["cases"]
        if case.get("visible", {}).get("semantic") is True
        and case["purposes"]["semantic"] != "unchanged"
    )
    held = sum(
        1
        for case in CORPUS["cases"]
        if case.get("visible", {}).get("semantic") is False
        and case["purposes"]["semantic"] == "unchanged"
    )
    assert moved > 200, f"Only {moved} mutations moved the semantic digest."
    assert held > 50, f"Only {held} mutations were excluded from the semantic digest."


def test_a_records_own_hash_field_is_inert_in_all_four_digests() -> None:
    # What makes building and verifying one call rather than two: the builder
    # hashes a record it has not stamped, the verifier hashes one that is already
    # stamped, and they must not be two code paths.
    failures = []
    for entry in STUDY_RECORD_KINDS:
        base = RECORDS_BY_ID[f"{entry['record_kind']}/full"]
        stamped = _apply_edits(
            base["record"], [{"op": "set", "path": entry["self_hash_field"], "value": "f" * 64}]
        )
        for purpose in PURPOSES:
            before = _outcome(entry["record_kind"], base["record"], purpose)
            after = _outcome(entry["record_kind"], stamped, purpose)
            if before != after:
                failures.append(f"{entry['record_kind']} {purpose}")
    assert failures == []


def test_pairs_two_spellings_of_one_value_and_one_spelling_of_two() -> None:
    for pair in CORPUS["pairs"]:
        base = RECORDS_BY_ID[pair["base"]]
        left = semantic_hash(pair["record_kind"], _apply_edits(base["record"], pair["left_edits"]))
        right = semantic_hash(pair["record_kind"], _apply_edits(base["record"], pair["right_edits"]))
        assert left == pair["left_digest"], f"{pair['case_id']} left"
        assert right == pair["right_digest"], f"{pair['case_id']} right"
        if pair["relation"] == "identical":
            assert left == right, f"{pair['case_id']}: {pair['why']}"
        else:
            assert left != right, f"{pair['case_id']}: {pair['why']}"


def test_property_5_a_record_read_back_from_a_file_hashes_as_it_did_in_memory() -> None:
    failures = []
    for file_case in CORPUS["files"]:
        data = base64.b64decode(file_case["base64"])
        try:
            reading = read_study_file_bytes(data)
            actual: dict[str, Any] = {
                "purposes": {
                    purpose: _outcome(file_case["record_kind"], reading.value, purpose)
                    for purpose in PURPOSES
                }
            }
        except StudyHashRefusal as refusal:
            actual = {"refusal": {"code": refusal.code, "path": refusal.path}}
        if actual != file_case["expect"]:
            failures.append(f"{file_case['case_id']}: {str(actual)[:200]}")
    assert failures == [], "\n".join(failures[:8])

    # Every round-trip case must agree with the in-memory record it was
    # serialized from. That is the property rather than a restatement of the
    # fixture: the base record and its bytes are two inputs, and the corpus pins
    # one answer for both.
    for file_case in CORPUS["files"]:
        if file_case.get("kind") != "round-trip":
            continue
        base = RECORDS_BY_ID[file_case["case_id"][len("file:") :]]
        for purpose in PURPOSES:
            in_memory = base["purposes"][purpose]
            expected = (
                {"refusal": in_memory["refusal"]}
                if "refusal" in in_memory
                else {"digest": in_memory["digest"]}
            )
            assert file_case["expect"]["purposes"][purpose] == expected, (
                f"{file_case['case_id']} {purpose}"
            )


def test_artifact_digests_are_over_bytes() -> None:
    for artifact in CORPUS["artifacts"]:
        data = base64.b64decode(artifact["base64"])
        assert (
            artifact_hash(artifact["record_kind"], data, CORPUS["schema_version"])
            == artifact["digest"]
        ), artifact["case_id"]
    # Two of the entries are the NFC and NFD spellings of one string, and one is
    # not valid UTF-8 at all. All three are ordinary byte sequences to this
    # digest, which is the difference between it and the other three.
    by_id = {entry["case_id"]: entry for entry in CORPUS["artifacts"]}
    assert by_id["artifact:utf8"]["digest"] != by_id["artifact:nfd"]["digest"]


def test_the_two_string_number_contracts_admit_one_spelling_per_value() -> None:
    """The contracts a `str` is a `str` for, checked against the other language.

    Only the string contracts are pinned across the boundary, and the omission is
    deliberate. ``finite_float`` and ``safe_integer`` ask what *type* a value has,
    and a JSON number has two types here and one there: the literal ``3`` is an
    ``int`` here and a ``number`` there, ``3.0`` is a ``float`` here and the same
    ``number`` there. No cross-language answer to "is this a safe integer" exists
    for a JSON number -- which is exactly why the digest is defined over the
    canonical rendering, where ``3`` and ``3.0`` are one string.

    A trailing newline is the case this section exists for. Python's ``$``
    matches before one and ECMAScript's does not, so ``is_exact_integer_string("1\\n")``
    was true here and false there until `study_values.py` moved to ``fullmatch``:
    two spellings of one value, accepted by this language's contract and refused
    by the other's, hashing to two different digests.
    """
    for entry in CORPUS["string_contracts"]:
        assert is_exact_integer_string(entry["value"]) == entry["exact_integer_string"], (
            f"{entry['case_id']} exact_integer_string {entry['value']!r}"
        )
        assert is_exact_decimal_string(entry["value"]) == entry["exact_decimal_string"], (
            f"{entry['case_id']} exact_decimal_string {entry['value']!r}"
        )
    assert is_exact_integer_string("1\n") is False
    assert is_exact_decimal_string("1\n") is False


def test_the_corpus_reaches_the_refusals_it_claims_to() -> None:
    # Anti-vacuity for the refusal half: a corpus whose every case produced a
    # digest would check the accepting path only, and every refusal in
    # ``STUDY_HASH_REFUSAL_CODES`` would be unexercised across the boundary while
    # the suite reported green.
    reached: set[str] = set()

    def collect(outcome: Any) -> None:
        if isinstance(outcome, Mapping) and "refusal" in outcome:
            reached.add(outcome["refusal"]["code"])

    for entry in CORPUS["records"]:
        for purpose in PURPOSES:
            collect(entry["purposes"][purpose])
    for case in CORPUS["cases"]:
        for purpose in PURPOSES:
            collect(case["purposes"][purpose])
    for file_case in CORPUS["files"]:
        collect(file_case["expect"])
    required = {
        "BYTE_ORDER_MARK",
        "DUPLICATE_PROPERTY",
        "EMPTY_PROJECTION",
        "INVALID_HEADER_COMPONENT",
        "INVALID_UTF8",
        "LONE_SURROGATE",
        "MAX_CANONICAL_BYTES_EXCEEDED",
        "MAX_DEPTH_EXCEEDED",
        "MAX_NODES_EXCEEDED",
        "MISSING_HEADER_COMPONENT",
        "NON_FINITE_NUMBER",
        "NOT_CONTENT_ADDRESSED",
        "SHAPE_MISMATCH",
        "UNDECLARED_FIELD",
        "UNKNOWN_HASH_RULES_ID",
        "UNKNOWN_RECORD_KIND",
        "UNSAFE_INTEGER",
    }
    assert required <= reached, f"The corpus no longer reaches: {sorted(required - reached)}"


# ---------------------------------------------------------------------------
# Generated properties: 1, 2, 3 and 5 without the other language present
# ---------------------------------------------------------------------------

def _leaf_locations(shape: Mapping[str, Any], record: Any) -> list[tuple[str, str]]:
    """Where every declared leaf actually sits in one record.

    A declaration path names a field; a concrete path names a place.
    ``inputs.name`` is one field and ``inputs[0].name``, ``inputs[1].name`` are
    two places -- a mutation needs the second while the classification lookup
    needs the first.
    """
    found: list[tuple[str, str]] = []

    def walk_value(value_shape: Mapping[str, Any], value: Any, decl: str, concrete: str) -> None:
        kind = value_shape["kind"]
        if kind == "leaf":
            found.append((decl, concrete))
            return
        if kind == "array":
            if not isinstance(value, list):
                return
            for index, item in enumerate(value):
                walk_value(value_shape["item"], item, decl, f"{concrete}[{index}]")
            return
        if not isinstance(value, Mapping):
            return
        walk_shape(value_shape["shape"], value, decl, concrete)

    def walk_shape(current: Mapping[str, Any], value: Any, decl: str, concrete: str) -> None:
        for field in current["fields"]:
            if field["name"] not in value:
                continue
            name = field["name"]
            walk_value(
                field["value"],
                value[name],
                name if decl == "" else f"{decl}.{name}",
                name if concrete == "" else f"{concrete}.{name}",
            )

    walk_shape(shape, record, "", "")
    return found


def _leaf_pool() -> list[Any]:
    """Every distinct value the corpus's `full` records carry in a declared leaf.

    Read out of the corpus rather than restated, so the two languages draw from
    one pool: a value only this language ever tried would be a value only this
    language is known to handle, which is the failure mode the shared corpus
    exists to remove. Reading it through the shape walk rather than by scraping
    every node keeps the pool to values that actually occupy a leaf slot -- an
    embedded record is not one, and generating records that carried other records
    in their leaves would test a shape nobody declares.
    """
    seen: dict[str, Any] = {}
    for entry in CORPUS["records"]:
        if entry["mode"] != "full":
            continue
        shape = ENTRIES_BY_KIND[entry["record_kind"]]["shape"]
        for _, concrete in _leaf_locations(shape, entry["record"]):
            value = _read_at(entry["record"], concrete)
            seen.setdefault(json.dumps(value, sort_keys=True), value)
    return [seen[key] for key in sorted(seen)]


LEAVES = _leaf_pool()


def _value_strategy(value_shape: Mapping[str, Any]) -> st.SearchStrategy[Any]:
    kind = value_shape["kind"]
    if kind == "leaf":
        return st.sampled_from(LEAVES).map(lambda value: json.loads(json.dumps(value)))
    if kind == "array":
        return st.lists(_value_strategy(value_shape["item"]), max_size=2)
    return _shape_strategy(value_shape["shape"])


def _shape_strategy(shape: Mapping[str, Any]) -> st.SearchStrategy[dict[str, Any]]:
    """A record of a shape, with every field optional.

    Optional everywhere is what covers "optional fields present and absent"
    without a table of which ones to drop: hypothesis drops a different subset
    every draw and shrinks toward the smallest record that still fails. The two
    header components are put back afterwards, because they are not optional --
    a record that does not name its schema version is refused before any
    projection runs, and a strategy that dropped them would spend its draws on
    one refusal.
    """
    return st.fixed_dictionaries(
        {}, optional={field["name"]: _value_strategy(field["value"]) for field in shape["fields"]}
    )


def _record_strategy(record_kind: str) -> st.SearchStrategy[dict[str, Any]]:
    entry = ENTRIES_BY_KIND[record_kind]

    def stamp(record: dict[str, Any]) -> dict[str, Any]:
        record = dict(record)
        record["schema_version"] = CORPUS["schema_version"]
        record["hash_rules_id"] = STUDY_HASH_RULES_ID
        return record

    return _shape_strategy(entry["shape"]).map(stamp)


KIND_AND_RECORD = st.sampled_from(list(STUDY_RECORD_KIND_NAMES)).flatmap(
    lambda record_kind: _record_strategy(record_kind).map(
        lambda record: (record_kind, record)
    )
)


def _reverse_key_order(value: Any) -> Any:
    """The same value, with every mapping's keys in reverse insertion order.

    This is property 1's whole input: two objects a reader would call identical,
    differing only in the order somebody happened to write them. RFC 8785 3.2.3
    sorts property names, so the two must reach one byte sequence -- and a
    canonicalizer that emitted keys in insertion order would pass every fixture
    in this repository, because every fixture was written once.
    """
    if isinstance(value, Mapping):
        return {key: _reverse_key_order(value[key]) for key in reversed(list(value))}
    if isinstance(value, list):
        return [_reverse_key_order(item) for item in value]
    return value


@given(KIND_AND_RECORD)
@_SETTINGS
def test_property_1_two_spellings_of_one_record_produce_one_byte_sequence(
    drawn: tuple[str, dict[str, Any]],
) -> None:
    record_kind, record = drawn
    reordered = _reverse_key_order(record)
    for purpose in PURPOSES:
        assert _outcome(record_kind, reordered, purpose, with_body=True) == _outcome(
            record_kind, record, purpose, with_body=True
        ), f"{record_kind} {purpose}"


_OBSERVED = {"visible": 0, "blind": 0}


@given(KIND_AND_RECORD, st.integers(min_value=0), st.integers(min_value=0))
@_SETTINGS
def test_properties_2_and_3_generated(
    drawn: tuple[str, dict[str, Any]], where: int, what: int
) -> None:
    record_kind, record = drawn
    entry = ENTRIES_BY_KIND[record_kind]
    classes = CLASSES_BY_KIND[record_kind]
    locations = [
        location
        for location in _leaf_locations(entry["shape"], record)
        # The two header components are committed by the preimage rather than by
        # the body, so they move every digest while the class tables -- correctly
        # -- say no projection reads them. They are exercised as header
        # components in the corpus instead.
        if location[0] not in ("schema_version", "hash_rules_id")
    ]
    if not locations:
        return
    decl_path, concrete_path = locations[where % len(locations)]
    before = json.dumps(_read_at(record, concrete_path), sort_keys=True)
    candidates = [value for value in LEAVES if json.dumps(value, sort_keys=True) != before]
    mutated = _apply_edits(
        record, [{"op": "set", "path": concrete_path, "value": candidates[what % len(candidates)]}]
    )

    for purpose in PURPOSES:
        left = _outcome(record_kind, record, purpose, with_body=True)
        right = _outcome(record_kind, mutated, purpose, with_body=True)
        if "refusal" in left or "refusal" in right:
            # Nothing in the leaf pool can cause a refusal by itself -- no NaN,
            # no lone surrogate, nothing past a bound -- so the only refusals
            # reachable here are structural, decided by the shape rather than by
            # the record. `EMPTY_PROJECTION` on a `study_event`'s semantic digest
            # is the one that fires. A structural refusal cannot move when a leaf
            # does, and asserting that is a claim rather than a skip.
            assert left == right, f"{record_kind} {purpose}: a refusal moved with a leaf"
            continue
        predicted = _visible_for_purpose(classes, purpose, decl_path)
        _OBSERVED["visible" if predicted else "blind"] += 1
        assert (left["body"] != right["body"]) == predicted, (
            f"{record_kind} {purpose} at {concrete_path} ({classes[decl_path]})"
        )
        # The digest follows the bytes exactly: same header, same body, same
        # digest, and no two different bodies share one. Without this the property
        # above would be a claim about a string nobody hashes.
        assert (left["digest"] != right["digest"]) == (left["body"] != right["body"])


def test_the_generated_classification_property_was_not_vacuous() -> None:
    # A draw that carries no mutable leaf is a legitimate draw and not a case, so
    # the example count is an upper bound on the claims actually made. Without
    # this, a strategy that quietly produced nothing would leave a green test
    # that asserted nothing.
    assert _OBSERVED["visible"] > 20, (
        f"Only {_OBSERVED['visible']} draws reached a field a purpose reads. "
        "Run the whole module rather than this test alone."
    )
    assert _OBSERVED["blind"] > 20, (
        f"Only {_OBSERVED['blind']} draws reached a field a purpose excludes."
    )


@given(KIND_AND_RECORD)
@_SETTINGS
def test_property_5_generated(drawn: tuple[str, dict[str, Any]]) -> None:
    record_kind, record = drawn
    # `separators` so the bytes are compact, `ensure_ascii=False` so the file
    # carries the characters rather than escapes: both are choices this family's
    # digest is deliberately independent of, since the record is canonicalized
    # after the parse rather than hashed as written.
    data = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    # Nothing in the leaf pool can fail this gate, and that is the claim: a record
    # built from values this family accepts survives being written to a file and
    # read back. A refusal here is a real failure, not a skip.
    reading = read_study_file_bytes(data)
    for purpose in PURPOSES:
        assert _outcome(record_kind, reading.value, purpose, with_body=True) == _outcome(
            record_kind, record, purpose, with_body=True
        ), f"{record_kind} {purpose}"


def test_an_unknown_record_kind_is_refused_rather_than_resolved() -> None:
    # `study_record_kind` is a dict lookup with an explicit miss. The two names
    # below are the ones that resolve on an object in a language that uses objects
    # for maps, and they must be refusals here exactly as they are there.
    for name in ("toString", "__proto__", "constructor", "not_a_record_kind"):
        with pytest.raises(StudyHashRefusal) as raised:
            study_record_kind(name)
        assert raised.value.code == "UNKNOWN_RECORD_KIND"
