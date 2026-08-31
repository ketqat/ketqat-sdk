from __future__ import annotations

import json
from pathlib import Path

import pytest

from ketqat_runner.hashing import calculate_reproducibility_hash
from ketqat_runner.study_hashing import (
    STUDY_EXCLUDED_KEYS,
    STUDY_HASH_RULES_ID,
    STUDY_HASH_RULES_KEY,
    calculate_study_hash,
    canonical_study_json,
    study_rules_id_of,
    verify_study_record_hash,
)


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "reproducibility"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text())


def _study_record() -> dict:
    """A study-shaped record carrying one of everything the exclusion set names."""
    return {
        "schema_version": "1.0",
        STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
        "study_type": "FTQC_FEASIBILITY",
        "title": "Is a fault-tolerant factoring run affordable in 2031?",
        "is_demo": True,
        "max_credits": 2500,
        "attestation_level": "hash_only",
        "claim": {
            "subject": "shor-2048",
            "metric": "total_physical_qubits",
            "comparator": "AT_MOST",
            "value": 4200000,
        },
        "id": "volatile-study-id",
        "slug": "volatile-study-slug",
        "status": "DRAFT",
        "latest_specification": { "revision_hash": "a" * 64, "revision": 1},
        "latest_plan": None,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z",
        "runtime_seconds": 41.5,
        "content_hash": "b" * 64,
    }


def test_python_study_hashes_match_shared_expected_fixtures() -> None:
    """Against hashes the TypeScript implementation produced.

    Two independent implementations of the same canonical form is the only way a
    reader can check a study without running the code that made it, and the only
    thing that makes "reproduced" mean anything. The fixtures are the contract
    between them: a drift in either canonicalizer fails here rather than showing
    up as two languages quietly disagreeing about what a record says.
    """
    expected = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    inputs = {
        "study_float_edge_cases": "study-float-edge-cases.json",
        "study_plan_revision": "study-plan-revision.json",
        "study_capsule": "study-capsule.json",
    }
    for key, filename in inputs.items():
        assert calculate_study_hash(_fixture(filename)) == expected[key], (
            f"study-v1 hash drifted for {key}"
        )

    # The evidence graph is a container of records rather than a record itself:
    # each node and edge inside it names the rules it was hashed under, the file
    # wrapped around them does not. So this is the one pin that names the rules
    # from the outside -- there is no record here to have named them, and
    # inventing a marker on the wrapper would put a field in the corpus that no
    # contract declares.
    graph = _fixture("study-evidence-graph.json")
    assert calculate_study_hash(graph, STUDY_HASH_RULES_ID) == expected["study_evidence_graph"], (
        "study-v1 hash drifted for study_evidence_graph"
    )

    # And each record the graph carries verifies against the hash written into
    # it, so the container's digest pins the parts as well as the whole.
    for record in [*graph["nodes"], *graph["edges"]]:
        assert calculate_study_hash(record) == record["content_hash"]


def test_float_formatting_matches_javascript_inside_study_nesting() -> None:
    # The same four boundaries test_hashing.py pins for benchmark results, now
    # nested inside the Quantity envelopes this family wraps every number in:
    # a whole-number float, a value inside the window where Python switches to
    # scientific notation and JavaScript does not, a value below both thresholds,
    # and negative zero. Python's own repr() disagrees with JavaScript on the
    # first two, which is why the canonical encoder formats floats by hand.
    canonical = canonical_study_json(_fixture("study-float-edge-cases.json"))
    assert '"value":3}' in canonical
    assert '"value":0.00005}' in canonical
    assert '"value":1e-7}' in canonical
    assert '"value":0}' in canonical
    # An unknown quantity keeps its null. Dropping it would turn "we asked and
    # there is no answer" into "we never asked", which is the one thing the
    # UNKNOWN discipline exists to prevent.
    assert '"value":null}' in canonical


def test_the_hash_is_over_the_parsed_value_not_the_source_text() -> None:
    # `3.0` and `3` are the same JSON number and the same IEEE-754 double, but
    # Python parses them to different types and JavaScript does not have the
    # distinction at all. If that leaked into the digest, the same file would
    # hash differently in the two languages -- which is the one failure the
    # canonical encoder exists to prevent.
    expected = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    source = (FIXTURE_DIR / "study-float-edge-cases.json").read_text()
    variation = json.loads(
        source.replace('"value": 3.0', '"value": 3').replace('"value": -0.0', '"value": -0')
    )
    assert calculate_study_hash(variation) == expected["study_float_edge_cases"]


def test_a_record_without_a_rules_id_is_refused_not_defaulted() -> None:
    """Nothing is inferred. A record with no marker is malformed, not old."""
    record = _fixture("study-float-edge-cases.json")
    for broken in (
        {key: item for key, item in record.items() if key != STUDY_HASH_RULES_KEY},
        {**record, STUDY_HASH_RULES_KEY: ""},
        {**record, STUDY_HASH_RULES_KEY: 1},
        {**record, STUDY_HASH_RULES_KEY: None},
    ):
        with pytest.raises(ValueError, match="refused, not defaulted"):
            calculate_study_hash(broken)
        with pytest.raises(ValueError, match="refused, not defaulted"):
            verify_study_record_hash(broken)
        with pytest.raises(ValueError, match="refused, not defaulted"):
            study_rules_id_of(broken)


def test_the_legacy_marker_earns_a_study_record_nothing() -> None:
    """ADR 0006's no-marker-means-version-1 inference is disabled for this family.

    Inheriting it would hash a malformed record under the wrong rules and report
    success, which is worse than either the right answer or a refusal.
    """
    record = _fixture("study-float-edge-cases.json")
    legacy_marker_only = {
        **{key: item for key, item in record.items() if key != STUDY_HASH_RULES_KEY},
        "reproducibility_hash_version": 2,
    }
    with pytest.raises(ValueError, match="refused, not defaulted"):
        calculate_study_hash(legacy_marker_only)

    # And the reverse: the rules id in the legacy field is inert. It changes no
    # hash here, and the legacy verifier's opinion of such a record is not this
    # family's opinion.
    expected = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    assert (
        calculate_study_hash({**record, "reproducibility_hash_version": STUDY_HASH_RULES_ID})
        == expected["study_float_edge_cases"]
    )


def test_an_unknown_rules_id_is_refused_rather_than_treated_as_current() -> None:
    record = _fixture("study-float-edge-cases.json")
    with pytest.raises(ValueError, match="Unknown study hash rules id"):
        calculate_study_hash({**record, STUDY_HASH_RULES_KEY: "study-v2"})
    with pytest.raises(ValueError, match="Unknown study hash rules id"):
        calculate_study_hash(record, "study-v99")


def test_volatile_fields_are_excluded_but_decisions_are_not() -> None:
    record = _study_record()
    baseline = calculate_study_hash(record)

    # None of these describes the study. An id, a timestamp, a duration, a
    # denormalized status and the pointers at the newest revisions all move on
    # their own schedule, and a hash that moved with them would mean the same
    # study stopped matching itself between two reads of the same row.
    for volatile in (
        {"id": "changed"},
        {"slug": "changed"},
        {"created_at": "2027-06-06T00:00:00.000Z"},
        {"status": "CONCLUDED"},
        {"latest_plan": { "revision_hash": "d" * 64, "revision": 4}},
        {"runtime_seconds": 999.5},
        {"content_hash": "e" * 64},
        {"reproducibility_hash_version": 1},
    ):
        assert calculate_study_hash({**record, **volatile}) == baseline, (
            f"{next(iter(volatile))} must not be able to move a study hash"
        )

    # Everything a decision rests on does move it: a limit the user set, what the
    # record claims to prove, and the number a reader will quote.
    for decision in (
        {"study_type": "QEC_LOGICAL_BENCHMARK"},
        {"max_credits": 2501},
        {"attestation_level": "signed"},
        {"claim": {**record["claim"], "value": 4200001}},
    ):
        assert calculate_study_hash({**record, **decision}) != baseline, (
            f"{next(iter(decision))} must move a study hash"
        )


def test_a_record_verifies_against_whichever_self_hash_field_it_carries() -> None:
    record = _study_record()
    expected = calculate_study_hash(record)

    stamped = {**record, "content_hash": expected}
    assert verify_study_record_hash(stamped)["valid"] is True
    assert verify_study_record_hash(stamped)["rules_id"] == STUDY_HASH_RULES_ID
    assert verify_study_record_hash({**stamped, "max_credits": 5000})["valid"] is False

    capsule_shaped = {
        **{key: item for key, item in record.items() if key != "content_hash"},
        "reproducibility_hash": expected,
    }
    assert verify_study_record_hash(capsule_shaped)["valid"] is True


def test_the_exclusion_set_is_inherited_rather_than_retyped() -> None:
    """The identity and timing keys every published hash was computed under.

    Listing them again in this module would be a second copy free to drift from
    the first; importing them means a change to the legacy sets is a change here
    too, and the parity fixtures notice.
    """
    for key in (
        "id",
        "slug",
        "created_at",
        "updated_at",
        "started_at",
        "finished_at",
        "submitted_at",
        "ui_metadata",
        "owner_username",
        "visibility",
        "reproducibility_hash",
        "reproducibility_hash_version",
        "runtime_seconds",
        "decoder_latency_ms",
        "hash_rules_id",
        "content_hash",
        "status",
        "latest_specification",
        "latest_plan",
    ):
        assert key in STUDY_EXCLUDED_KEYS


def test_study_rules_are_isolated_from_the_legacy_registry() -> None:
    """The two rule sets are genuinely different, and the frozen corpus is untouched.

    If a study record hashed the same under both, the family would be hashing
    under the legacy rules while claiming its own.
    """
    record = _fixture("study-float-edge-cases.json")
    assert calculate_reproducibility_hash(record, 2) != calculate_study_hash(record)
    assert calculate_reproducibility_hash(record, 1) != calculate_study_hash(record)

    legacy_expected = _fixture("expected-hashes.json")
    qec_result = _fixture("qec-result-before-hash.json")
    assert calculate_reproducibility_hash(qec_result, 1) == legacy_expected["v1"]["qec_result"]
    assert calculate_reproducibility_hash(qec_result, 2) == legacy_expected["v2"]["qec_result"]

    # A legacy record has no rules id, and this family will not invent one for it.
    with pytest.raises(ValueError, match="refused, not defaulted"):
        calculate_study_hash(qec_result)
