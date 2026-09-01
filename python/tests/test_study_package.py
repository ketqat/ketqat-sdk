"""Structural verification of a research package, and the cross-language contract.

The file this sits beside in TypeScript is `tests/research-package.test.mjs`, and
the two are held together by `fixtures/study/verification-vectors.json`: a corpus
of packages, each carrying one deliberate defect, and the findings the verifier
should raise about it. What is pinned is a **code and a JSON path** per defect --
never a message. A code is what a caller branches on and a path is where a reader
is sent to look; prose is written for a person and is improved whenever somebody
finds a better sentence, so a test comparing English across two implementations
would fail on an improvement and pass on a wrong path.

The vectors also record, separately, the findings this build does *not* produce:
the checks `verifyEvidenceGraph` makes from a subject rather than from a position
-- cycles, supersession forks, reference agreement -- which land on `$.nodes` or
`$.edges` there and are TypeScript's alone. The difference between the two
verifiers is written down rather than implied.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from ketqat_runner.study_hash import artifact_hash, study_self_hash
from ketqat_runner.study_package import (
    STUDY_PACKAGE_LIMITS,
    check_ledger_summary,
    claim_is_grounded,
    derive_status,
    render_table_csv,
    resolve_bundle_field,
    study_path,
    verify_research_package,
)

VECTOR_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "study" / "verification-vectors.json"

#: The two paths a subject-addressed graph refusal lands on.
COLLECTION_PATHS = frozenset({"$.nodes", "$.edges"})


def _vectors() -> dict:
    return json.loads(VECTOR_PATH.read_text())


def _case(label: str) -> dict:
    for case in _vectors()["cases"]:
        if case["label"] == label:
            return case
    raise AssertionError(f"No verification vector case is labelled {label!r}.")


def _package(label: str = "intact") -> dict:
    return copy.deepcopy(_case(label)["package"])


def _sorted(findings: list[dict]) -> list[dict]:
    return sorted(
        ({"code": item["code"], "path": item["path"]} for item in findings),
        key=lambda item: (item["code"], item["path"]),
    )


def _quantity_node(package: dict) -> dict:
    return next(node for node in package["nodes"] if node.get("quantity") is not None)


# ------------------------------------------------ the cross-language contract


def test_the_committed_vectors_are_the_ones_this_verifier_produces() -> None:
    """The definition of done: one file, two languages, one set of codes and paths.

    Each case is verified here and the indexed findings compared against what
    TypeScript wrote. A disagreement is either a check one language makes and the
    other does not, or a path that would send two readers to two different places
    in the same file -- and both are the thing this fixture exists to catch.
    """
    vectors = _vectors()
    assert vectors["hash_rules_id"] == "study-v1"
    assert len(vectors["cases"]) >= 10, "a handful of cases is not a corpus"
    # A passing case is required: a vector set in which every package is broken
    # cannot tell a strict verifier from one that refuses everything.
    assert any(not case["findings"] for case in vectors["cases"])

    for case in vectors["cases"]:
        result = verify_research_package(case["package"], validate_schema=False)
        indexed = [item for item in result["findings"] if item["path"] not in COLLECTION_PATHS]
        assert _sorted(indexed) == case["findings"], case["label"]


def test_the_levels_both_languages_compute_agree() -> None:
    """Eight of the twelve, pinned.

    `science_recomputed` is not among them and cannot be: TypeScript rebuilds a
    cited bundle's estimates and decisions from its own inputs, and ADR 0010
    withholds that from this language on purpose -- a second implementation of
    one model disagrees with the first at the third decimal place and nobody can
    say which is right. The four that are left out are the ones that would be
    pinning a coincidence rather than an agreement.
    """
    for case in _vectors()["cases"]:
        result = verify_research_package(case["package"], validate_schema=False)
        for level, expected in case["levels"].items():
            assert result["levels"][level] is expected, f"{case['label']}.{level}"
        assert result["status"] == case["status"], case["label"]


def test_this_language_says_what_it_did_rather_than_implying_it() -> None:
    """ADR 0014's rule, discharged in the returned value.

    A caller rendering "verified in Python" renders `verification_performed` with
    it. The field exists so the difference between the two verifiers is a value a
    surface can show, not a docstring somebody has to have read.
    """
    result = verify_research_package(_package(), validate_schema=False)

    assert result["verification_performed"] == "INTEGRITY_AND_STRUCTURE"
    assert result["levels"]["science_recomputed"] is False
    assert any("structural verification, not reproduction" in line for line in result["not_established"])
    # And nothing in what it does not establish reads as a stronger claim than
    # the one a digest supports.
    joined = " ".join(result["not_established"]).lower()
    assert "authentic" not in joined
    assert "scientifically correct" not in joined
    assert "nothing here is signed" in joined


def test_the_status_ladder_is_the_same_derivation_in_both_languages() -> None:
    """Ordered rungs, derived from the levels and never asserted."""
    levels = {
        "schema_valid": True,
        "canonicalizable": True,
        "hash_matches": True,
        "record_integrity_valid": True,
        "graph_structurally_valid": True,
        "provenance_closed": True,
        "claims_resolve": True,
        "bundles_resolve": True,
        "science_recomputed": False,
        "independent_reproduction_present": False,
        "review_present": False,
        "attestation_level": "hash_only",
    }
    assert derive_status(levels) == "STRUCTURE_VERIFIED"
    assert derive_status({**levels, "science_recomputed": True}) == "SCIENCE_RECOMPUTED"
    assert (
        derive_status({**levels, "science_recomputed": True, "independent_reproduction_present": True})
        == "INDEPENDENTLY_REPRODUCED"
    )
    assert derive_status({**levels, "provenance_closed": False}) == "STRUCTURE_UNVERIFIED"
    assert derive_status({**levels, "canonicalizable": False}) == "REFUSED"
    # A review is deliberately not a rung: a ladder that climbed on it would
    # report a stronger verification because somebody wrote ACCEPTED in a record
    # they also control.
    assert derive_status({**levels, "review_present": True}) == "STRUCTURE_VERIFIED"


# ------------------------------------------------------------ tables and CSV


def test_the_csv_this_language_renders_is_the_one_the_package_carries() -> None:
    """The forwarded file, regenerated and re-hashed from the same rows.

    Byte-identical to the TypeScript rendering, which is what makes the digest
    worth carrying: the numbers go through `serialize_jcs_number`, the family's
    one canonical number-to-string function, rather than through a formatter each
    language wrote for itself.
    """
    package = _package()
    sources = {node["content_hash"]: node for node in package["nodes"]}
    table = package["tables"][0]

    data = render_table_csv(table, sources).encode("utf-8")
    assert str(len(data)) == table["csv_artifact"]["byte_size"]
    assert artifact_hash("research_package", data, package["schema_version"]) == (
        table["csv_artifact"]["content_hash"]
    )
    # Every value column contributes the number and the node it came from, so the
    # traceability survives the format everyone actually forwards.
    header, row = data.decode("utf-8").splitlines()
    assert header.endswith("Total physical qubits node")
    assert _quantity_node(package)["content_hash"] in row


def test_a_number_typed_into_a_table_cell_is_refused() -> None:
    result = verify_research_package(_package("table_value_cell_without_node"), validate_schema=False)
    codes = {item["code"]: item["path"] for item in result["findings"]}
    assert codes["TABLE_CELL_WITHOUT_NODE"] == study_path("tables", 0, "rows", 0, "cells", 1, "node_hash")
    assert result["levels"]["claims_resolve"] is False


def test_a_csv_artifact_that_is_not_the_digest_of_these_rows_is_refused() -> None:
    result = verify_research_package(_package("csv_artifact_mismatch"), validate_schema=False)
    assert result["levels"]["hash_matches"] is True
    assert any(item["code"] == "TABLE_CSV_ARTIFACT_MISMATCH" for item in result["findings"])


# ------------------------------------------------------------------- report


def test_a_number_typed_into_verified_prose_is_refused() -> None:
    """The rule the structured report exists for, applied identically in both.

    A digit may appear inside a name and never as a number, and the expression is
    the same one on both sides -- a one-character lookbehind, which Python's `re`
    accepts and JavaScript's has supported for years.
    """
    result = verify_research_package(_package("prose_carries_a_number"), validate_schema=False)
    assert _sorted(result["findings"]) == [
        {
            "code": "VERIFIED_PROSE_NOT_GROUNDED",
            "path": study_path("report", "sections", 0, "segments", 0, "text"),
        }
    ]


def test_a_name_carrying_digits_is_prose_and_a_measurement_is_not() -> None:
    package = _package()
    package["report"]["sections"][0]["segments"][0]["text"] = "Shor-2048 at v1.2 of the model"
    package["reproducibility_hash"] = study_self_hash("research_package", package)
    assert verify_research_package(package, validate_schema=False)["status"] == "STRUCTURE_VERIFIED"

    package["report"]["sections"][0]["title"] = "Findings at distance 21"
    package["reproducibility_hash"] = study_self_hash("research_package", package)
    result = verify_research_package(package, validate_schema=False)
    assert [item["path"] for item in result["findings"] if item["code"] == "VERIFIED_PROSE_NOT_GROUNDED"] == [
        study_path("report", "sections", 0, "title")
    ]


def test_a_report_segment_naming_a_node_the_package_does_not_carry_is_refused() -> None:
    result = verify_research_package(_package("report_reference_unresolved"), validate_schema=False)
    assert _sorted(result["findings"]) == [
        {
            "code": "REPORT_REFERENCE_UNRESOLVED",
            "path": study_path("report", "sections", 0, "segments", 1, "node_hash"),
        }
    ]


# ------------------------------------------------- tampered-study detection


def test_an_edited_package_fails_its_hash_check() -> None:
    result = verify_research_package(_package("edited_without_rehash"), validate_schema=False)

    assert result["levels"]["hash_matches"] is False
    assert result["status"] == "STRUCTURE_UNVERIFIED"
    assert result["expected_hash"] != result["actual_hash"]


def test_an_edited_and_rehashed_package_fails_structurally() -> None:
    """The fabrication a digest cannot see.

    Identity in this graph *is* the content hash, so re-stamping an edited node
    changes what that node is: every table cell, report segment, figure
    coordinate, edge endpoint and claim-map entry that named the old hash now
    names something the package does not contain. Making the numbers lie
    therefore means rewriting the whole graph, and a graph rewritten consistently
    is a different study that says different things -- visibly, to a reader.
    """
    result = verify_research_package(_package("edited_and_rehashed"), validate_schema=False)

    # Cryptographically the file is beyond reproach.
    assert result["levels"]["hash_matches"] is True
    assert result["levels"]["record_integrity_valid"] is True
    # Structurally it has fallen apart, at every surface that named the node.
    assert result["levels"]["claims_resolve"] is False
    assert result["levels"]["graph_structurally_valid"] is False
    assert result["status"] == "STRUCTURE_UNVERIFIED"
    paths = {item["path"] for item in result["findings"]}
    assert study_path("tables", 0, "rows", 0, "cells", 1, "node_hash") in paths
    assert study_path("report", "sections", 0, "segments", 1, "node_hash") in paths
    assert study_path("figures", 0, "spec", "series", 0, "points", 0, "y") in paths
    assert study_path("edges", 0, "from_node_hash") in paths


# --------------------------------------------------- the map against the graph


def test_a_claim_whose_evidence_no_edge_joins_to_it_is_refused() -> None:
    result = verify_research_package(_package("claim_evidence_unlinked"), validate_schema=False)
    codes = {item["code"] for item in result["findings"]}
    assert "CLAIM_EVIDENCE_UNLINKED" in codes
    assert "CLAIM_WITHOUT_EVIDENCE_NODE" in codes
    assert result["levels"]["provenance_closed"] is False


def test_provenance_closure_is_walked_here_too() -> None:
    """A structural traversal, which is why this language may make it.

    Nothing here re-derives a value: the walk follows `supports` backwards out of
    a claim and `derived_from` and `used_input` forwards out of everything else,
    and the node kinds that end a chain are read from the table the TypeScript
    registry emits rather than restated.
    """
    package = _package()
    index = {node["content_hash"]: node for node in package["nodes"]}
    claim = next(node for node in package["nodes"] if node["kind"] == "claim")
    assert claim_is_grounded(index, package["edges"], claim["content_hash"]) is True

    # Remove the edge that says where the number came from, and the claim is
    # supported by a quantity that rests on nothing.
    stripped = [edge for edge in package["edges"] if edge["kind"] != "derived_from"]
    assert claim_is_grounded(index, stripped, claim["content_hash"]) is False


# ------------------------------------------------------------------- bundles


def test_an_offline_export_that_does_not_carry_a_bundle_it_cites_is_refused() -> None:
    result = verify_research_package(_package("offline_export_without_bundle"), validate_schema=False)

    assert result["levels"]["bundles_resolve"] is False
    assert _sorted(result["findings"]) == [
        {"code": "OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED", "path": study_path("bundle_refs", 0, "embedded")}
    ]


def test_a_bundle_field_path_walks_own_keys_only() -> None:
    """A prototype or attribute walk would resolve a field nobody wrote."""
    document = {"estimates": [{"runtime": {"value": 12.5}}]}
    assert resolve_bundle_field(document, "estimates[0].runtime.value") == 12.5
    assert resolve_bundle_field(document, "estimates[1].runtime.value") is None
    assert resolve_bundle_field(document, "estimates[0].missing") is None
    for attribute in ("items", "keys", "__class__"):
        assert resolve_bundle_field(document, attribute) is None


# -------------------------------------------------------------- check ledger


def test_a_check_that_did_not_run_is_a_status_rather_than_a_silence() -> None:
    entries = [
        {"check_id": "a", "status": "PASS", "requirement": "REQUIRED"},
        {"check_id": "b", "status": "NOT_RUN", "requirement": "OPTIONAL"},
        {"check_id": "c", "status": "INCONCLUSIVE", "requirement": "OPTIONAL"},
        {"check_id": "d", "status": "FAIL", "requirement": "REQUIRED"},
    ]
    assert check_ledger_summary(entries) == {
        "total": 4,
        "passed": 1,
        "failed": 1,
        "not_run": 1,
        "inconclusive": 1,
        # Not "no failures": a required check that did not run has not passed.
        "required_checks_passed": False,
    }
    assert check_ledger_summary(entries[:1])["required_checks_passed"] is True
    assert check_ledger_summary([{"check_id": "a", "status": "NOT_RUN", "requirement": "REQUIRED"}])[
        "required_checks_passed"
    ] is False


def test_two_entries_for_one_check_id_refuse_the_package() -> None:
    result = verify_research_package(_package("check_ledger_duplicate_id"), validate_schema=False)

    assert result["status"] == "REFUSED"
    assert _sorted(result["findings"]) == [
        {"code": "CHECK_LEDGER_DUPLICATE_ID", "path": study_path("check_ledger", 1, "check_id")}
    ]


def test_a_required_check_the_ledger_does_not_mention_is_not_a_passing_one() -> None:
    result = verify_research_package(
        _package(), validate_schema=False, required_checks=["independent_reproduction"]
    )
    assert result["levels"]["claims_resolve"] is False
    assert [
        item["path"] for item in result["findings"] if item["code"] == "CHECK_LEDGER_REQUIRED_CHECK_ABSENT"
    ] == [study_path("check_ledger")]


# ------------------------------------------------------------------ ceilings


def test_the_ceilings_are_the_same_numbers_in_both_languages() -> None:
    """Read from the emitted document rather than restated.

    A ceiling that differed between the languages would be a package one of them
    checks and the other refuses, which is two answers to "is this file all
    right". Reading the emitted copy is how this module inherits the TypeScript
    test that compares that copy against its source.
    """
    assert STUDY_PACKAGE_LIMITS["max_nodes"] == 5000
    assert STUDY_PACKAGE_LIMITS["max_nesting_depth"] == 24
    assert set(STUDY_PACKAGE_LIMITS) == {
        "max_nodes",
        "max_edges",
        "max_tables",
        "max_table_rows",
        "max_report_bytes",
        "max_commentary_bytes",
        "max_csv_bytes",
        "max_figures",
        "max_svg_bytes",
        "max_citations",
        "max_embedded_bundle_bytes",
        "max_check_ledger_entries",
        "max_nesting_depth",
    }


def test_a_package_past_a_ceiling_is_refused_before_anything_walks_it() -> None:
    package = _package()
    package["nodes"] = package["nodes"] * 2000

    result = verify_research_package(package, validate_schema=False)
    assert result["status"] == "REFUSED"
    assert _sorted(result["findings"]) == [
        {"code": "PACKAGE_LIMIT_EXCEEDED", "path": study_path("nodes")}
    ]


def test_a_package_built_to_be_deep_is_refused_by_the_nesting_ceiling() -> None:
    package = _package()
    nest: dict = {}
    root = nest
    for _ in range(40):
        nest["child"] = {}
        nest = nest["child"]
    package["limitations"] = [root]

    result = verify_research_package(package, validate_schema=False)
    assert result["status"] == "REFUSED"
    assert _sorted(result["findings"]) == [{"code": "PACKAGE_LIMIT_EXCEEDED", "path": "$"}]


def test_a_package_that_is_not_an_object_is_refused() -> None:
    with pytest.raises(TypeError):
        verify_research_package(["not", "a", "package"], validate_schema=False)
