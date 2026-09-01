"""The hashing core in Python: domain separation, the four roles, the API
limits, the number contracts, raw-byte file verification, and cross-language
agreement.

The mirror of `tests/study-hash-core.test.mjs`. Two kinds of assertion live here
and they answer different questions:

* the properties -- that a digest names one record kind and one purpose, that a
  value outside the JSON data model is refused by name, that the exported rules
  cannot be edited -- are asserted directly, so this language holds them whether
  or not the other one is present;

* the cross-language vectors in `fixtures/study/hash-core-vectors.json` are
  reproduced from the records rather than trusted, so a drift in either
  language's projection or header construction fails here instead of showing up
  later as two verifiers disagreeing about a file neither can explain.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from ketqat_runner.study_file import read_study_file_bytes
from ketqat_runner.study_hash import (
    artifact_hash,
    receipt_hash,
    record_hash,
    semantic_hash,
    study_canonical_body,
)
from ketqat_runner.study_jcs import canonicalize_jcs
from ketqat_runner.study_limits import (
    STUDY_HASH_LIMITS,
    STUDY_HASH_REFUSAL_CODES,
    StudyHashRefusal,
    is_study_hash_refusal_code,
)
from ketqat_runner.study_preimage import build_study_preimage, study_header
from ketqat_runner.study_projection import (
    STUDY_FIELD_CLASSES,
    STUDY_HASH_PURPOSES,
    STUDY_PURPOSE_FIELD_CLASSES,
    classes_for_purpose,
    flatten_shape_classes,
    nested_classes_for_purpose,
)
from ketqat_runner.study_registry import (
    STUDY_RECORD_KIND_NAMES,
    STUDY_RECORD_KINDS,
    study_record_kind,
    study_shape_document,
)
from ketqat_runner.study_rules import (
    STUDY_HASH_DOMAIN,
    STUDY_HASH_RULES_ID,
    STUDY_KNOWN_HASH_RULES_IDS,
)
from ketqat_runner.study_values import (
    STUDY_NUMBER_CONTRACTS,
    assert_exact_decimal_string,
    assert_exact_integer_string,
    exact_integer_string_from_int,
    is_exact_decimal_string,
    is_exact_integer_string,
    is_finite_float,
    is_safe_integer,
)

_ROOT = Path(__file__).resolve().parents[2]
VECTORS = json.loads(
    (_ROOT / "fixtures" / "study" / "hash-core-vectors.json").read_text(encoding="utf-8")
)

SCHEMA_VERSION = "1.0"

#: A record carrying only fields its kind declares, which is all a projection reads.
#:
#: A ``study_task_authorization`` carries one field of each class and nothing
#: else: ``plan_ref`` and ``confirmation_receipt_ref`` are what was authorised,
#: ``study_ref`` is where the record sits, and ``created_at`` is when the server
#: observed it. It replaced a ``study_task`` that carried a mutable ``status``,
#: so the roles below are exercised against fields that stand still.
AUTHORIZATION = {
    "schema_version": SCHEMA_VERSION,
    "hash_rules_id": STUDY_HASH_RULES_ID,
    "study_ref": "9b1d5c40-2ea7-4b6f-8c31-7f0a6d2e4b58",
    "plan_ref": {"revision_hash": "b" * 64, "revision": 3},
    "confirmation_receipt_ref": "c" * 64,
    "requested_operation": "STUDY_BENCHMARK_RUN",
    "input_refs": [],
    "resource_ceiling": {
        "max_credits": 250,
        "max_runtime": 3600,
        "max_memory_bytes": "8589934592",
        "resource_class": "MANAGED_SIMULATION",
    },
    "created_at": "2026-09-01T00:00:00.000Z",
    "content_hash": "d" * 64,
}


def refused(code: str):
    class _Matcher:
        def __enter__(self):
            self._caught = pytest.raises(StudyHashRefusal)
            self._context = self._caught.__enter__()
            return self._context

        def __exit__(self, *args):
            handled = self._caught.__exit__(*args)
            if handled:
                assert self._context.value.code == code, (
                    f"expected {code}, got {self._context.value.code}"
                )
            return handled

    return _Matcher()


# ---------------------------------------------------------------------------
# Cross-language agreement
# ---------------------------------------------------------------------------


def test_every_record_kind_has_a_vector() -> None:
    # A record kind with no vector is a record kind nothing checks across the
    # boundary, which would let the two languages diverge quietly about it.
    assert sorted(entry["record_kind"] for entry in VECTORS["records"]) == sorted(
        STUDY_RECORD_KIND_NAMES
    )
    # A floor rather than an exact count: the family grows, and a test that
    # pinned the number would fail on every addition without saying anything
    # about the property it exists for -- that no kind is left unchecked.
    assert len(STUDY_RECORD_KIND_NAMES) >= 11


_HASH_FOR_PURPOSE = {
    "semantic": semantic_hash,
    "record": record_hash,
    "receipt": receipt_hash,
}


@pytest.mark.parametrize("entry", VECTORS["records"], ids=lambda e: e["record_kind"])
def test_digests_match_the_typescript_implementation(entry) -> None:
    kind = entry["record_kind"]
    record = entry["record"]
    for purpose, hash_for in _HASH_FOR_PURPOSE.items():
        expected_refusal = entry["refusals"].get(purpose)
        if expected_refusal is not None:
            # A purpose a kind refuses is pinned as a refusal rather than left
            # out, because "this kind has no semantic content" is a fact both
            # languages have to agree about. A `study_event` is entirely audit
            # evidence, so its semantic projection reads no field and the digest
            # would be one constant for every event ever written.
            assert purpose not in entry["digests"], (kind, purpose)
            with refused(expected_refusal):
                hash_for(kind, record)
            continue
        assert study_canonical_body(kind, record, purpose) == entry["canonical_bodies"][purpose], (
            kind,
            purpose,
        )
        assert hash_for(kind, record) == entry["digests"][purpose], (kind, purpose)


@pytest.mark.parametrize("entry", VECTORS["artifacts"], ids=lambda e: e["label"])
def test_artifact_digests_match_the_typescript_implementation(entry) -> None:
    encoded = entry["text"].encode("utf-8")
    assert artifact_hash(entry["record_kind"], encoded, SCHEMA_VERSION) == entry["digest"]


def test_the_shape_tables_are_the_emitted_ones() -> None:
    # This module projects from the tables `scripts/generate-study-shapes.mjs`
    # emits rather than from a second hand-written copy, so the completeness test
    # in TypeScript is watching the classification this language actually uses.
    document = study_shape_document()
    assert document["hash_domain"] == STUDY_HASH_DOMAIN
    assert document["hash_rules_id"] == STUDY_HASH_RULES_ID
    assert tuple(document["field_classes"]) == STUDY_FIELD_CLASSES
    assert dict(document["limits"]) == dict(STUDY_HASH_LIMITS)
    # The purpose table is the one place this language restates something the
    # emitted document also carries -- it is four short tuples, and reading them
    # from a file would put the projection's own filters behind a file load. So
    # the two copies are compared here instead of trusted to agree.
    emitted_purposes = {
        entry["purpose"]: (tuple(entry["classes"]), tuple(entry["nested_classes"]))
        for entry in document["purpose_field_classes"]
    }
    assert emitted_purposes == {
        purpose: (entry["classes"], entry["nested_classes"])
        for purpose, entry in STUDY_PURPOSE_FIELD_CLASSES.items()
    }
    classified = flatten_shape_classes(study_record_kind("research_package")["shape"])
    assert classified["nodes.claim.value_ref.node_hash"] == "SEMANTIC"
    assert classified["nodes.claim.subject_ref.record_slug"] == "RECORD_ONLY"
    assert classified["nodes.quantity.uncertainty.basis"] == "SEMANTIC"
    # A figure is a specification now rather than markup, so the deep path runs
    # through the coordinates: a point names a node, and that reference is
    # semantic even though the figure it is drawn in is presentation.
    assert classified["figures.spec.series.points.y.node_hash"] == "SEMANTIC"
    assert classified["figures.title"] == "RECORD_ONLY"
    assert classified["tables.rows.cells.node_hash"] == "SEMANTIC"
    assert classified["report.sections.segments.text"] == "RECORD_ONLY"
    assert classified["recipe.resource_limits.max_memory_bytes"] == "SEMANTIC"
    assert classified["check_ledger.tool.version"] == "RECEIPT_ONLY"
    assert len(classified) > 60


# ---------------------------------------------------------------------------
# Domain separation
# ---------------------------------------------------------------------------


def test_two_record_kinds_with_one_body_take_different_digests() -> None:
    # Not a hypothetical. The receipt projection of a `study`, a
    # `study_task_authorization` and a `problem_specification` is
    # `{"created_at": ...}` in all three cases,
    # because that is the only RECEIPT_ONLY field each declares.
    created_at = "2026-09-01T00:00:00.000Z"
    shared = {
        "schema_version": SCHEMA_VERSION,
        "hash_rules_id": STUDY_HASH_RULES_ID,
        "created_at": created_at,
    }
    kinds = ["study", "study_task_authorization", "problem_specification"]
    bodies = {study_canonical_body(kind, shared, "receipt") for kind in kinds}
    assert bodies == {f'{{"created_at":"{created_at}"}}'}
    assert len({receipt_hash(kind, shared) for kind in kinds}) == 3


def test_two_purposes_over_one_body_take_different_digests() -> None:
    edge = {
        "schema_version": SCHEMA_VERSION,
        "hash_rules_id": STUDY_HASH_RULES_ID,
        "kind": "SUPPORTS",
        "from_node_hash": "a" * 64,
        "to_node_hash": "b" * 64,
    }
    assert study_canonical_body("evidence_edge", edge, "semantic") == study_canonical_body(
        "evidence_edge", edge, "record"
    )
    assert semantic_hash("evidence_edge", edge) != record_hash("evidence_edge", edge)


def test_changing_any_header_component_changes_the_preimage() -> None:
    body = b'{"a":1}'
    base = study_header("study_task_authorization", "record", SCHEMA_VERSION, STUDY_HASH_RULES_ID)
    baseline = build_study_preimage(base, body)
    for override in [
        {"domain": "ketqat.other"},
        {"record_kind": "study"},
        {"purpose": "semantic"},
        {"schema_version": "2.0"},
    ]:
        assert build_study_preimage({**base, **override}, body) != baseline, override
    with refused("UNKNOWN_HASH_RULES_ID"):
        build_study_preimage({**base, "hash_rules_id": "study-v2"}, body)


def test_the_preimage_layout_is_nul_separated() -> None:
    preimage = build_study_preimage(
        study_header("study_task_authorization", "record", SCHEMA_VERSION), b"{}"
    )
    assert preimage == (
        f"{STUDY_HASH_DOMAIN}\x00study_task_authorization\x00record\x00{SCHEMA_VERSION}\x00"
        f"{STUDY_HASH_RULES_ID}\x00{{}}"
    ).encode("ascii")


def test_a_header_component_cannot_carry_a_separator() -> None:
    for bad in ["study task", "study\x00task", "стади", "study\ttask", ""]:
        with pytest.raises(StudyHashRefusal) as caught:
            build_study_preimage(study_header(bad, "record", SCHEMA_VERSION), b"{}")
        assert caught.value.code in {"INVALID_HEADER_COMPONENT", "MISSING_HEADER_COMPONENT"}, bad


def test_an_unknown_record_kind_is_refused() -> None:
    for bad in ["study_plans", "__class__", "keys", "items"]:
        with refused("UNKNOWN_RECORD_KIND"):
            study_record_kind(bad)


# ---------------------------------------------------------------------------
# The four roles
# ---------------------------------------------------------------------------


KIND = "study_task_authorization"


def test_semantic_hash_ignores_presentation_and_receipt_fields() -> None:
    base = semantic_hash(KIND, AUTHORIZATION)
    assert semantic_hash(KIND, {**AUTHORIZATION, "study_ref": "e" * 36}) == base
    assert semantic_hash(KIND, {**AUTHORIZATION, "created_at": "2020-01-01T00:00:00.000Z"}) == base
    # And moves when what was authorised does.
    assert semantic_hash(KIND, {**AUTHORIZATION, "confirmation_receipt_ref": "f" * 64}) != base


def test_record_hash_moves_for_everything_except_derived_fields() -> None:
    base = record_hash(KIND, AUTHORIZATION)
    assert record_hash(KIND, {**AUTHORIZATION, "study_ref": "e" * 36}) != base
    assert record_hash(KIND, {**AUTHORIZATION, "created_at": "2020-01-01T00:00:00.000Z"}) != base
    # A record's own digest cannot be an input to itself.
    assert record_hash(KIND, {**AUTHORIZATION, "content_hash": "0" * 64}) == base


def test_receipt_hash_covers_the_audit_fields_and_nothing_else() -> None:
    base = receipt_hash(KIND, AUTHORIZATION)
    assert receipt_hash(KIND, {**AUTHORIZATION, "created_at": "2020-01-01T00:00:00.000Z"}) != base
    assert receipt_hash(KIND, {**AUTHORIZATION, "confirmation_receipt_ref": "f" * 64}) == base


def test_artifact_hash_takes_bytes() -> None:
    encoded = "label,value\r\na,1\r\n".encode("utf-8")
    assert artifact_hash("research_package", encoded, SCHEMA_VERSION) != artifact_hash(
        "research_package", "label,value\na,1\n".encode("utf-8"), SCHEMA_VERSION
    )
    with refused("NOT_JSON_VALUE"):
        artifact_hash("research_package", "label,value", SCHEMA_VERSION)


def test_a_record_without_a_schema_version_is_refused() -> None:
    without_version = {key: value for key, value in AUTHORIZATION.items() if key != "schema_version"}
    with refused("MISSING_HEADER_COMPONENT"):
        record_hash(KIND, without_version)


def test_the_four_purposes_are_a_closed_list() -> None:
    assert STUDY_HASH_PURPOSES == ("semantic", "record", "receipt", "artifact")


EVENT = {
    "schema_version": SCHEMA_VERSION,
    "hash_rules_id": STUDY_HASH_RULES_ID,
    "study_ref": "a" * 64,
    "sequence": 1,
    "previous_event_hash": "b" * 64,
    "from_status": "DRAFT",
    "to_status": "PLANNED",
    "actor": "curator@example.invalid",
    "reason": "specification confirmed",
    "plan_ref": {"revision_hash": "c" * 64, "revision": 1},
    "created_at": "2026-09-01T00:00:00.000Z",
    "content_hash": "d" * 64,
}


def test_a_purpose_that_reads_no_field_refuses_rather_than_returning_a_constant() -> None:
    # Every field of a `study_event` is audit evidence, so a semantic projection
    # reads nothing and the body is `{}` for every event ever written. That is
    # one digest standing for every pair of unrelated events, answered `yes`. A
    # constant is worse than a refusal because it answers.
    with refused("EMPTY_PROJECTION"):
        semantic_hash("study_event", EVENT)
    with refused("EMPTY_PROJECTION"):
        study_canonical_body("study_event", EVENT, "semantic")
    # The purposes the kind does have content for still work.
    assert len(record_hash("study_event", EVENT)) == 64
    assert len(receipt_hash("study_event", EVENT)) == 64


def test_no_other_record_kind_and_purpose_projects_to_a_constant() -> None:
    # The structural sweep behind the refusal above: for every kind and every
    # purpose, either the projection reads a field or it refuses by name.
    degenerate = [
        f"{entry['record_kind']}/{purpose}"
        for entry in STUDY_RECORD_KINDS
        for purpose in ("semantic", "record", "receipt")
        if not any(
            field["field_class"] in classes_for_purpose(purpose)
            for field in entry["shape"]["fields"]
        )
    ]
    assert degenerate == ["study_event/semantic"]


def test_a_selected_value_is_projected_in_full_not_refiltered_at_every_depth() -> None:
    # The composition rule. `plan_ref` is RECEIPT_ONLY and `RevisionRef`'s own
    # fields are SEMANTIC, so applying the top-level filter again inside the
    # pointer emptied it: the receipt body carried `"plan_ref":{}` and two events
    # adopting two different plan revisions took one receipt digest.
    other = {**EVENT, "plan_ref": {"revision_hash": "e" * 64, "revision": 42}}
    body = study_canonical_body("study_event", EVENT, "receipt")
    assert '"plan_ref":{"revision":1,' in body, body
    assert "{}" not in body, "no selected value may project to an empty object"
    assert receipt_hash("study_event", EVENT) != receipt_hash("study_event", other)


def test_semantic_still_strips_envelope_annotation_inside_a_selected_value() -> None:
    # The other half of the composition rule, and the reason inner classes exist:
    # a `Quantity`'s `created_at`, `source` and `schema_version` are annotation
    # on the envelope, and rebuilding an envelope around the same number must not
    # read as new science.
    quantity = {
        "value": 0.001,
        "unit": "logical_error_rate",
        "bound": "ESTIMATE",
        "evidence": "MODELLED",
        "model": "surface-code",
        "model_version": "0.4.1",
    }
    node = {
        "schema_version": SCHEMA_VERSION,
        "hash_rules_id": STUDY_HASH_RULES_ID,
        "kind": "MEASURED_RESULT",
        "quantity": quantity,
    }
    reserialized = {
        **node,
        "quantity": {**quantity, "created_at": "2020-01-01T00:00:00.000Z", "source": "a rebuild"},
    }
    assert semantic_hash("evidence_node", node) == semantic_hash("evidence_node", reserialized)
    assert record_hash("evidence_node", node) != record_hash("evidence_node", reserialized)
    assert semantic_hash("evidence_node", node) != semantic_hash(
        "evidence_node", {**node, "quantity": {**quantity, "value": 0.002}}
    )


def test_each_purpose_publishes_both_its_filters_as_immutable_plain_data() -> None:
    assert tuple(STUDY_PURPOSE_FIELD_CLASSES) == STUDY_HASH_PURPOSES
    for purpose, entry in STUDY_PURPOSE_FIELD_CLASSES.items():
        assert isinstance(entry["classes"], tuple)
        assert isinstance(entry["nested_classes"], tuple)
        assert frozenset(entry["classes"]) == classes_for_purpose(purpose)
        assert frozenset(entry["nested_classes"]) == nested_classes_for_purpose(purpose)
        # DERIVED is never read, at any depth, by any purpose: a value cannot be
        # an input to the digest that covers it.
        assert "DERIVED" not in entry["classes"]
        assert "DERIVED" not in entry["nested_classes"]
    # `semantic` is the only purpose that strips annotation below the top level.
    assert nested_classes_for_purpose("semantic") == frozenset({"SEMANTIC"})
    for purpose in ("record", "receipt"):
        assert nested_classes_for_purpose(purpose) == frozenset(
            {"SEMANTIC", "RECORD_ONLY", "RECEIPT_ONLY"}
        )
    with pytest.raises(TypeError):
        STUDY_PURPOSE_FIELD_CLASSES["semantic"] = ("RECORD_ONLY",)  # type: ignore[index]


# ---------------------------------------------------------------------------
# The projection reads declared fields and refuses the rest
# ---------------------------------------------------------------------------


def test_an_undeclared_key_is_refused_rather_than_skipped() -> None:
    with refused("UNDECLARED_FIELD"):
        record_hash(KIND, {**AUTHORIZATION, "smuggled": 1})
    # No name is special. `__proto__` is refused because nobody declared it, not
    # because it is called something.
    with refused("UNDECLARED_FIELD"):
        record_hash(KIND, {**AUTHORIZATION, "__proto__": {"evil": 1}})


def test_a_nested_undeclared_key_is_refused_at_any_depth() -> None:
    nested = {**AUTHORIZATION, "plan_ref": {**AUTHORIZATION["plan_ref"], "slug": "looks-harmless"}}
    with refused("UNDECLARED_FIELD"):
        record_hash(KIND, nested)


def test_a_declared_field_of_the_wrong_shape_is_refused() -> None:
    with refused("SHAPE_MISMATCH"):
        record_hash(KIND, {**AUTHORIZATION, "plan_ref": "a string"})


def test_absent_and_null_are_different_records() -> None:
    # "We never recorded this" and "we recorded that there is none" are two
    # statements, and one digest for both would erase the difference.
    without = {key: value for key, value in AUTHORIZATION.items() if key != "created_at"}
    assert record_hash(KIND, without) != record_hash(KIND, {**AUTHORIZATION, "created_at": None})


def test_a_control_plane_kind_is_refused_with_its_own_code() -> None:
    # "We do not hash this" and "we have never heard of this" send a reader to
    # different places, so an `execution_job` -- queue status, attempt counter,
    # progress, cancellation -- is refused by name rather than by absence.
    with refused("NOT_CONTENT_ADDRESSED"):
        study_record_kind("execution_job")
    with refused("UNKNOWN_RECORD_KIND"):
        study_record_kind("execution_jobs")


# ---------------------------------------------------------------------------
# Public API limits
# ---------------------------------------------------------------------------


def test_values_outside_the_json_data_model_are_refused_by_name() -> None:
    import datetime
    import decimal

    for value in [datetime.date(2026, 1, 1), decimal.Decimal("1.5"), {1, 2}, object()]:
        with refused("NOT_JSON_VALUE"):
            canonicalize_jcs({"x": value})
    # A non-string property name is refused rather than coerced: coercing would
    # give two keys one name.
    with refused("NOT_JSON_VALUE"):
        canonicalize_jcs({1: "a"})


def test_a_cycle_is_refused_and_sharing_is_not_a_cycle() -> None:
    cyclic: dict = {"name": "a"}
    cyclic["self"] = cyclic
    with refused("CYCLE"):
        canonicalize_jcs(cyclic)
    shared = {"v": 1}
    assert canonicalize_jcs({"a": shared, "b": shared}) == '{"a":{"v":1},"b":{"v":1}}'


def test_depth_node_count_and_canonical_size_are_bounded() -> None:
    deep: object = 1
    for _ in range(STUDY_HASH_LIMITS["max_depth"] + 2):
        deep = {"n": deep}
    with refused("MAX_DEPTH_EXCEEDED"):
        canonicalize_jcs(deep)
    with refused("MAX_NODES_EXCEEDED"):
        canonicalize_jcs([0] * (STUDY_HASH_LIMITS["max_nodes"] + 2))
    with refused("MAX_CANONICAL_BYTES_EXCEEDED"):
        canonicalize_jcs("x" * (STUDY_HASH_LIMITS["max_canonical_bytes"] + 16))


def test_the_refusal_code_lists_agree_across_languages() -> None:
    # The two lists are compared element for element rather than described as
    # agreeing: a code one language can raise and the other cannot name is a
    # refusal a caller cannot branch on.
    typescript = (_ROOT / "src" / "study" / "limits.ts").read_text(encoding="utf-8")
    for code in STUDY_HASH_REFUSAL_CODES:
        assert f'"{code}"' in typescript, code
        assert is_study_hash_refusal_code(code)
    assert not is_study_hash_refusal_code("NOT_A_CODE")


# ---------------------------------------------------------------------------
# Immutability of the exported rule data
# ---------------------------------------------------------------------------


def test_exported_rule_data_is_immutable() -> None:
    for exported in [
        STUDY_HASH_REFUSAL_CODES,
        STUDY_KNOWN_HASH_RULES_IDS,
        STUDY_RECORD_KINDS,
        STUDY_RECORD_KIND_NAMES,
        STUDY_HASH_PURPOSES,
        STUDY_FIELD_CLASSES,
        STUDY_NUMBER_CONTRACTS,
    ]:
        assert isinstance(exported, tuple), "a rule list is a tuple, not a set or a list"
        assert not isinstance(exported, (set, frozenset, list))
    # A tuple has no mutators to borrow, and the mappings are read-only views.
    with pytest.raises(TypeError):
        STUDY_HASH_LIMITS["max_depth"] = 1  # type: ignore[index]
    with pytest.raises(TypeError):
        STUDY_RECORD_KINDS[0]["record_kind"] = "forged"  # type: ignore[index]
    with pytest.raises(AttributeError):
        STUDY_HASH_REFUSAL_CODES.append("FORGED")  # type: ignore[attr-defined]
    assert STUDY_HASH_LIMITS["max_depth"] == 64
    assert STUDY_RECORD_KINDS[0]["record_kind"] == "study"


def test_borrowed_mutators_cannot_edit_a_rule_list() -> None:
    # The Python shape of the method-borrowing attack: a list's mutators bound to
    # a tuple. Each raises rather than editing.
    for method in (list.append, list.extend, list.insert, list.remove, list.pop):
        with pytest.raises(TypeError):
            method(STUDY_HASH_REFUSAL_CODES, "FORGED")  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        set.add(STUDY_KNOWN_HASH_RULES_IDS, "study-v2")  # type: ignore[arg-type]
    assert "FORGED" not in STUDY_HASH_REFUSAL_CODES
    assert "study-v2" not in STUDY_KNOWN_HASH_RULES_IDS


def test_a_polluted_mapping_base_does_not_reach_the_projection() -> None:
    # Python has no `Object.prototype`, so the equivalent attack is a dict
    # subclass that answers for keys it does not have. The projection asks
    # `name in record`, so a record that does not carry `status` does not project
    # a forged one.
    class Forging(dict):
        def __missing__(self, key):  # pragma: no cover - only reached if asked
            return "POLLUTED"

    record = Forging({key: value for key, value in AUTHORIZATION.items() if key != "created_at"})
    body = study_canonical_body(KIND, record, "record")
    assert "POLLUTED" not in body
    assert '"created_at"' not in body


# ---------------------------------------------------------------------------
# Exact numbers
# ---------------------------------------------------------------------------


def test_the_five_number_contracts_are_published() -> None:
    assert [entry["contract"] for entry in STUDY_NUMBER_CONTRACTS] == [
        "finite_float",
        "safe_integer",
        "exact_integer_string",
        "exact_decimal_string",
        "unknown",
    ]


def test_finite_float_and_safe_integer() -> None:
    assert is_finite_float(1.5)
    assert not is_finite_float(math.nan)
    assert not is_finite_float(math.inf)
    assert not is_finite_float(1)
    assert is_safe_integer(1000)
    assert is_safe_integer(9007199254740991)
    assert not is_safe_integer(9007199254740993)
    assert not is_safe_integer(True)
    assert not is_safe_integer(1.5)


def test_an_exact_integer_string_admits_one_spelling_per_value() -> None:
    assert is_exact_integer_string("13835058055282163712")
    assert is_exact_integer_string("0")
    assert is_exact_integer_string("-7")
    for bad in ["+7", "007", "1e3", "1_000", "-0", " 7", "7 ", "", "7.0", "0x10", "1" * 65]:
        assert not is_exact_integer_string(bad), bad
        with refused("INVALID_EXACT_NUMBER_STRING"):
            assert_exact_integer_string(bad, "seed")


def test_an_exact_decimal_string_keeps_trailing_zeros() -> None:
    assert is_exact_decimal_string("1.50")
    assert is_exact_decimal_string("1.5")
    assert canonicalize_jcs({"v": "1.50"}) != canonicalize_jcs({"v": "1.5"})
    for bad in ["1.5e3", "-0", "-0.000", "01.5", ".5", "5."]:
        assert not is_exact_decimal_string(bad), bad
        with refused("INVALID_EXACT_NUMBER_STRING"):
            assert_exact_decimal_string(bad, "figure")


def test_a_large_int_crosses_the_boundary_as_validated_digits() -> None:
    with refused("UNSAFE_INTEGER"):
        canonicalize_jcs({"seed": 13835058055282163712})
    assert exact_integer_string_from_int(13835058055282163712) == "13835058055282163712"
    # The digits survive, which is the point. 2**53 + 1 is the smallest integer
    # a double cannot hold: it rounds to 2**53, so as a JSON number this value
    # and 9007199254740992 are one number here and one number there, and two
    # records reporting different counts would be content-addressed identically.
    assert float(9007199254740993) == 9007199254740992
    assert exact_integer_string_from_int(9007199254740993) == "9007199254740993"


# ---------------------------------------------------------------------------
# File verification, over raw bytes
# ---------------------------------------------------------------------------


def test_duplicate_keys_are_refused_before_the_parse() -> None:
    for text in [
        '{"a":1,"a":2}',
        '{"outer":{"a":1,"a":2}}',
        '[{"a":1},{"b":1,"b":2}]',
        '{"a":1,"\\u0061":2}',
    ]:
        with refused("DUPLICATE_PROPERTY"):
            read_study_file_bytes(text.encode("utf-8"))
    # The same name in two sibling objects is not a duplicate, and a string
    # *value* that looks like a name is not one either.
    assert read_study_file_bytes(b'{"x":{"a":1},"y":{"a":2}}').value == {"x": {"a": 1}, "y": {"a": 2}}
    assert read_study_file_bytes(b'{"a":"a"}').value == {"a": "a"}


def test_a_byte_order_mark_is_refused_rather_than_stripped() -> None:
    with refused("BYTE_ORDER_MARK"):
        read_study_file_bytes(b"\xef\xbb\xbf" + b'{"a":1}')
    assert read_study_file_bytes(b'{"a":1}').value == {"a": 1}


def test_invalid_utf8_is_refused_rather_than_repaired() -> None:
    with refused("INVALID_UTF8"):
        read_study_file_bytes(b'{"\xe2\x82":1}')
    with refused("INVALID_UTF8"):
        read_study_file_bytes(b'{"\x80":1}')


def test_an_unpaired_surrogate_escape_is_refused() -> None:
    with refused("LONE_SURROGATE"):
        read_study_file_bytes(b'{"a":"\\ud800"}')
    with refused("LONE_SURROGATE"):
        read_study_file_bytes(b'{"\\udead":1}')
    assert read_study_file_bytes(b'{"a":"\\ud83d\\ude00"}').value == {"a": "\U0001f600"}


def test_an_unsafe_integer_literal_is_refused_and_a_float_is_not() -> None:
    with refused("UNSAFE_INTEGER"):
        read_study_file_bytes(b'{"seed":13835058055282163712}')
    with refused("UNSAFE_INTEGER"):
        read_study_file_bytes(b'{"a":-9007199254740992}')
    assert read_study_file_bytes(b'{"a":9007199254740991}').value == {"a": 9007199254740991}
    assert read_study_file_bytes(b'{"a":1e30}').value == {"a": 1e30}


def test_file_verification_performs_no_normalization() -> None:
    # U+00E9, and U+0065 U+0301. Written as escapes rather than as literals,
    # because an editor that normalized this file would otherwise turn the test
    # into a comparison of one string with itself -- which passes by asserting
    # nothing, and is exactly the failure the test is about.
    composed = read_study_file_bytes(b'{"name":"\\u00e9"}')
    decomposed = read_study_file_bytes(b'{"name":"e\\u0301"}')
    assert composed.value["name"] != decomposed.value["name"]
    assert canonicalize_jcs(composed.value) != canonicalize_jcs(decomposed.value)


def test_a_file_that_is_not_json_is_refused_with_a_code() -> None:
    with refused("INVALID_JSON"):
        read_study_file_bytes(b"{")
    with refused("INVALID_JSON"):
        read_study_file_bytes(b"not json")
    with refused("NOT_JSON_VALUE"):
        read_study_file_bytes("a string")  # type: ignore[arg-type]
