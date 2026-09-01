"""The study parity fixtures, read from the same files the TypeScript suite reads.

Mirrors `tests/study-hashing.test.mjs`. Both suites read the committed fixtures
and assert the same hex strings, so a drift in either canonicalizer, projection
or preimage header fails on the side that drifted rather than showing up later
as two verifiers disagreeing about a file neither can explain.

Every study digest moved when the rules did: `study-v1` keeps its name because
nothing has ever been published under it, so the rules behind the name changed
rather than the name in front of them. What must not have moved is anything in
``expected-hashes.json`` -- the legacy registry is a separate rule set over
separate records, and the last section here re-asserts its load-bearing digests
next to the code that could have disturbed them.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from ketqat_runner.hashing import calculate_reproducibility_hash
from ketqat_runner.study_file import read_study_file_bytes
from ketqat_runner.study_hash import (
    record_hash,
    semantic_hash,
    study_self_hash,
    verify_study_self_hash,
)
from ketqat_runner.study_limits import StudyHashRefusal
from ketqat_runner.study_registry import STUDY_RECORD_KIND_NAMES, study_record_kind
from ketqat_runner.study_rules import STUDY_HASH_RULES_ID, STUDY_HASH_RULES_KEY

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "reproducibility"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text())


def _bytes(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


PINS = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]

SINGLE_RECORDS = [
    ("study_plan_revision", "study-plan-revision.json"),
    ("study_capsule", "study-capsule.json"),
    ("study_capsule_64_bit_integers", "study-capsule-64-bit-integers.json"),
    ("study_research_package_as_written", "study-research-package-as-written.json"),
]


@pytest.mark.parametrize("name,filename", SINGLE_RECORDS)
def test_each_single_record_fixture_verifies_against_its_pin(name: str, filename: str) -> None:
    """The digest this language computes from the file is the one TypeScript wrote.

    The record kind is not a label on the pin: it is a component of the preimage
    header, so a digest taken under the wrong kind is a different digest rather
    than the same one described differently.
    """
    pin = PINS[name]
    record = _fixture(filename)

    assert pin["record_kind"] in STUDY_RECORD_KIND_NAMES
    entry = study_record_kind(pin["record_kind"])
    assert entry["self_hash_field"] == pin["self_hash_field"]

    assert study_self_hash(pin["record_kind"], record) == pin["self_hash"]
    assert record[pin["self_hash_field"]] == pin["self_hash"]

    verified = verify_study_self_hash(pin["record_kind"], record)
    assert verified["valid"] is True
    assert verified["purpose"] == entry["self_hash_purpose"]


def test_which_digest_a_kind_writes_into_its_own_field_is_the_same_in_both_languages() -> None:
    """The self-hash purpose is data both languages read, not a call each makes.

    A builder and a verifier that picked different purposes would disagree about
    every record ever written, so the choice is declared once in
    `src/study/registry.ts` and emitted into the shape tables this module reads.
    """
    assert {
        entry["record_kind"]: entry["self_hash_purpose"] for entry in map(study_record_kind, STUDY_RECORD_KIND_NAMES)
    } == {
        "study": "semantic",
        "study_event": "record",
        "problem_specification": "record",
        "study_plan": "record",
        "study_task": "semantic",
        "evidence_node": "record",
        "evidence_edge": "record",
        "execution_capsule": "record",
        "research_package": "record",
    }


def test_a_fixture_hashed_under_another_record_kind_takes_another_digest() -> None:
    capsule = _fixture("study-capsule.json")
    with pytest.raises(StudyHashRefusal) as excinfo:
        study_self_hash("research_package", capsule)
    assert excinfo.value.code == "UNDECLARED_FIELD"

    assert record_hash("execution_capsule", capsule) != semantic_hash("execution_capsule", capsule)


# --------------------------------------------------------------- the containers
#
# A file holding a list of records is not itself a record: no kind declares
# `nodes` and `edges` at its root, so there is no digest of the wrapper. What is
# pinned is every record inside it, which is where the content actually lives.


def test_every_node_and_edge_in_the_pinned_evidence_graph_matches_its_pin() -> None:
    graph = _fixture("study-evidence-graph.json")
    pin = PINS["study_evidence_graph"]

    assert [study_self_hash("evidence_node", node) for node in graph["nodes"]] == pin["nodes"]
    assert [study_self_hash("evidence_edge", edge) for edge in graph["edges"]] == pin["edges"]

    present = set(pin["nodes"])
    for edge in graph["edges"]:
        assert edge["from_node_hash"] in present
        assert edge["to_node_hash"] in present


def test_float_formatting_matches_javascript_inside_a_study_record() -> None:
    """The four places two implementations of RFC 8785 §3.2.2.3 could part company.

    Python has no `Number::toString`, so `study_jcs.py` implements the algorithm
    the RFC normatively cites. A whole-number float renders without its fraction,
    0.00005 stays positional, 1e-7 goes to scientific notation, and minus zero is
    written `0`. Each case sits in a `Quantity` envelope inside an evidence node,
    which is where a study's numbers actually live and where a digest reaches
    them.
    """
    nodes = _fixture("study-float-edge-cases.json")["nodes"]
    assert [study_self_hash("evidence_node", node) for node in nodes] == PINS["study_float_edge_cases"]["nodes"]

    values = [node["quantity"]["value"] for node in nodes]
    assert values[0] == 3
    assert values[1] == 0.00005
    assert values[2] == 1e-7
    assert values[3] == 0 and math.copysign(1.0, values[3]) < 0, "the fixture carries a negative zero"
    assert values[4] is None


def test_the_hash_is_over_the_parsed_value_not_the_source_text() -> None:
    """`3.0` and `3` are one IEEE-754 double and one JSON number.

    Python's int/float distinction has no counterpart in JavaScript and must not
    leak into a digest the two languages have to agree on. Minus zero is the
    mirror case: `-0.0` and `0` are two literals and one canonical form.
    """
    text = (FIXTURE_DIR / "study-float-edge-cases.json").read_text()
    rewritten = json.loads(text.replace('"value": 3,', '"value": 3.0,').replace('"value": -0.0,', '"value": 0,'))
    assert [
        study_self_hash("evidence_node", node) for node in rewritten["nodes"]
    ] == PINS["study_float_edge_cases"]["nodes"]


# ------------------------------------------- what the digests answer, on real records


def test_the_roles_answer_different_questions_about_the_pinned_capsule() -> None:
    capsule = _fixture("study-capsule.json")

    rerun = {**capsule, "started_at": "2027-06-06T00:00:00.000Z"}
    assert semantic_hash("execution_capsule", rerun) == semantic_hash("execution_capsule", capsule)
    assert record_hash("execution_capsule", rerun) != record_hash("execution_capsule", capsule)

    # A seed is digits, so two spellings of one value cannot exist to take two
    # digests -- and two different 64-bit values cannot collapse onto one double.
    assert capsule["seed"] == "20260101"
    assert semantic_hash("execution_capsule", {**capsule, "seed": "20260102"}) != semantic_hash(
        "execution_capsule", capsule
    )


def test_a_64_bit_seed_and_byte_count_are_carried_as_digits_in_both_languages() -> None:
    """The case the retired rules refused, and the case that made them refuse it.

    A 64-bit seed is what Stim and NumPy hand out. As a JSON number it is the
    nearest double in JavaScript and the integer as written here, so one capsule
    took two digests; blanket-refusing every integer past 2^53 fixed that by
    refusing the family's own inputs. As digits both languages hash what the file
    contains, at any magnitude.
    """
    capsule = _fixture("study-capsule-64-bit-integers.json")
    assert int(capsule["seed"]) > 2**53
    assert int(capsule["resource_limits"]["max_memory_bytes"]) > 2**53
    assert study_self_hash("execution_capsule", capsule) == PINS["study_capsule_64_bit_integers"]["self_hash"]

    # Two integers one apart, which one double cannot tell apart and the digits can.
    neighbour = {**capsule, "seed": str(int(capsule["seed"]) - 1)}
    assert float(neighbour["seed"]) == float(capsule["seed"])
    assert study_self_hash("execution_capsule", neighbour) != capsule["reproducibility_hash"]


def test_a_record_that_does_not_name_its_schema_version_is_refused_not_defaulted() -> None:
    capsule = _fixture("study-capsule.json")
    unversioned = {key: value for key, value in capsule.items() if key != "schema_version"}
    with pytest.raises(StudyHashRefusal) as missing:
        study_self_hash("execution_capsule", unversioned)
    assert missing.value.code == "MISSING_HEADER_COMPONENT"

    with pytest.raises(StudyHashRefusal) as unknown:
        study_self_hash("execution_capsule", {**capsule, STUDY_HASH_RULES_KEY: "study-v2"})
    assert unknown.value.code == "UNKNOWN_HASH_RULES_ID"


def test_every_fixture_is_read_from_its_raw_bytes_without_a_refusal() -> None:
    """The reader answers questions a parse has already thrown away.

    A byte order mark, invalid UTF-8, a duplicate property name, an integer
    literal outside +/-2^53. Running it over the committed fixtures is what keeps
    them files a recipient could actually verify rather than dicts that happen to
    hash.
    """
    for name in [
        "study-plan-revision.json",
        "study-capsule.json",
        "study-capsule-64-bit-integers.json",
        "study-research-package-as-written.json",
        "study-evidence-graph.json",
        "study-float-edge-cases.json",
    ]:
        reading = read_study_file_bytes(_bytes(name))
        assert reading.value == _fixture(name)


# ------------------------------------------------------------- legacy isolation


def test_study_rules_are_isolated_from_the_legacy_registry() -> None:
    """The same payload hashes differently under each rule set.

    If these ever agreed, the family would be hashing under the legacy rules
    while claiming its own.
    """
    capsule = _fixture("study-capsule.json")
    for version in (1, 2):
        assert calculate_reproducibility_hash(capsule, version) != study_self_hash("execution_capsule", capsule)


def test_a_legacy_record_is_not_a_study_record() -> None:
    with pytest.raises(StudyHashRefusal) as excinfo:
        study_self_hash("qec_benchmark_result", _fixture("qec-result-before-hash.json"))
    assert excinfo.value.code == "UNKNOWN_RECORD_KIND"


def test_the_legacy_expected_hashes_are_byte_identical_to_what_they_always_were() -> None:
    """The load-bearing negative: the frozen corpus is untouched.

    These are asserted in `python/tests/test_hashing.py` already; re-asserting
    them here means a change made for the study family fails in this file, next
    to the code that caused it, rather than only in a suite nobody was editing.
    """
    expected = _fixture("expected-hashes.json")
    qec_result = _fixture("qec-result-before-hash.json")
    qec_manifest = _fixture("qec-manifest.json")

    assert (
        calculate_reproducibility_hash(qec_result, 1)
        == "2b1be50bd10215449956fc37555cecccf1987eebed374449c2643793d7e3d6a5"
    )
    assert (
        calculate_reproducibility_hash(qec_result, 2)
        == "e15000bd534e391f917bfc8715829938e0017f5953d918ebef2d88a8b1adad8a"
    )
    assert calculate_reproducibility_hash(qec_result, 1) == expected["v1"]["qec_result"]
    assert calculate_reproducibility_hash(qec_result, 2) == expected["v2"]["qec_result"]
    assert calculate_reproducibility_hash(qec_manifest, 1) == expected["v1"]["qec_manifest"]
    assert calculate_reproducibility_hash(qec_manifest, 2) == expected["v2"]["qec_manifest"]
