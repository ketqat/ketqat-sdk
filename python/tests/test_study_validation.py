from __future__ import annotations

import copy
from importlib import resources

import pytest

from ketqat_runner.study_hashing import STUDY_HASH_RULES_ID, calculate_study_hash
from ketqat_runner.validation import KetQatValidationError, load_schema
from ketqat_runner.study_validation import (
    STUDY_SCHEMA_FILES,
    STUDY_SCHEMA_VERSION,
    validate_study_record,
    verify_research_package,
)


STUDY_REF = "da5370a68b65fae82f578c06f313afac786e0b5e9d3caf543b1e37319d9720d9"
ABSENT_HASH = "9" * 64


def _packaged(filename: str) -> bool:
    """Whether the schema ships inside the installed package.

    Checked through ``importlib.resources`` rather than through
    ``load_schema``, which also finds a copy in a checkout: a schema that exists
    only beside the repository validates for maintainers and for nobody who
    installed the wheel, and that gap is exactly what this asks about.
    """
    return resources.files("ketqat_runner").joinpath("schemas", filename).is_file()


def _loadable(filename: str) -> bool:
    try:
        load_schema(filename)
    except KetQatValidationError:
        return False
    return True


# The nine study schemas are emitted by the schema generator, which is wired up
# in the integration work package. Until then they are absent from both the
# package and the checkout, and every case below that needs one skips rather than
# failing -- while the hash and structural cases, which need no schema at all,
# run now and pin the behaviour they check.
PACKAGED_SCHEMAS_PRESENT = all(_packaged(name) for name in STUDY_SCHEMA_FILES.values())
SCHEMAS_LOADABLE = all(_loadable(name) for name in STUDY_SCHEMA_FILES.values())


def _quantity(value: float | None = 4200000) -> dict:
    return {
        "value": value,
        "unit": "physical qubits",
        "bound": "UPPER_BOUND",
        "evidence": "MODELLED",
        "source": "Resource estimate under the base scenario.",
        "model": "ketqat-resource-intelligence",
        "model_version": "0.1.0",
        "assumptions": ["Physical error rate 0.001."],
        "schema_version": "0.1",
        "limitations": ["Modelled, not measured. No device was run."],
    }


def _node(**changes) -> dict:
    """A node stamped with the hash of its own contents.

    `content_hash` is excluded from the digest, which is what makes stamping it
    afterwards non-circular -- and what lets a test edit a node and re-stamp it,
    which is the fabrication the structural checks exist to catch.
    """
    body = {
        "schema_version": STUDY_SCHEMA_VERSION,
        "hash_rules_id": STUDY_HASH_RULES_ID,
        "study_ref": STUDY_REF,
        "kind": "quantity",
        "label": "a node",
        "claim": None,
        "quantity": None,
        "reference": None,
        "citation": None,
        "limitations": [],
        "source_published_on": None,
        "retrieved_on": None,
    }
    body.update(changes)
    return {**body, "content_hash": calculate_study_hash(body)}


def _edge(**changes) -> dict:
    body = {
        "schema_version": STUDY_SCHEMA_VERSION,
        "hash_rules_id": STUDY_HASH_RULES_ID,
        "study_ref": STUDY_REF,
        "kind": "supports",
        "from_node_hash": "a" * 64,
        "to_node_hash": "b" * 64,
        "asserted_by": "ketqat-resource-intelligence",
        "rationale": "The bound is read from the estimate rather than restated.",
    }
    body.update(changes)
    return {**body, "content_hash": calculate_study_hash(body)}


def _package() -> dict:
    """A small, self-consistent research package, built rather than committed.

    Inline because the nine schemas -- and the fixture that will be validated
    against them -- arrive with the integration work package. Everything this
    checks is computable from the record itself, so nothing here waits on a file.
    """
    claim_node = _node(
        kind="claim",
        label="Shor-2048 fits within 4.2 million physical qubits under the base scenario",
        claim={
            "subject": "shor-2048",
            "metric": "total_physical_qubits",
            "comparator": "AT_MOST",
            "value": _quantity(),
        },
    )
    quantity_node = _node(
        kind="quantity",
        label="Total physical qubits, base scenario",
        quantity=_quantity(),
    )
    result_node = _node(
        kind="result",
        label="Resource estimate snapshot, base scenario",
        reference={
            "record_kind": "resource_estimate_snapshot",
            "hash": "e" * 64,
            "record_slug": None,
        },
    )
    supports_edge = _edge(
        kind="supports",
        from_node_hash=quantity_node["content_hash"],
        to_node_hash=claim_node["content_hash"],
        rationale="The claimed ceiling is the estimate's own upper bound, not a rounding of it.",
    )
    derived_edge = _edge(
        kind="derived_from",
        from_node_hash=quantity_node["content_hash"],
        to_node_hash=result_node["content_hash"],
        rationale="The qubit count is read out of the estimate snapshot.",
    )

    body = {
        "schema_version": STUDY_SCHEMA_VERSION,
        "hash_rules_id": STUDY_HASH_RULES_ID,
        "package_kind": "KETQAT_RESEARCH_PACKAGE",
        "study_ref": STUDY_REF,
        "plan_ref": { "revision_hash": "c" * 64, "revision": 2},
        "report_markdown": "# Shor-2048 feasibility\n\nOne claim, and the numbers it rests on.",
        "methods": "Surface-code resource estimation under the base scenario.",
        "assumption_rows": [
            {"label": "Estimate snapshot", "node_hash": result_node["content_hash"]}
        ],
        "result_rows": [
            {"label": "Total physical qubits", "node_hash": quantity_node["content_hash"]}
        ],
        "csv": "label,node_hash\nTotal physical qubits," + quantity_node["content_hash"] + "\n",
        "figures": [],
        "references": [
            {
                "title": "Surface codes: towards practical large-scale quantum computation",
                "authors": [],
                "year": 2012,
            }
        ],
        "bundle_refs": ["f" * 64],
        "environment": {"operating_system": "linux", "packages": {}, "hardware": {}},
        "reproduction_command": "ketqat-engine study verify <this-file>",
        "nodes": [claim_node, quantity_node, result_node],
        "edges": [supports_edge, derived_edge],
        "claim_evidence_map": [
            {
                "claim_node_hash": claim_node["content_hash"],
                "evidence_node_hashes": [
                    quantity_node["content_hash"],
                    result_node["content_hash"],
                ],
                "edge_hashes": [supports_edge["content_hash"]],
            }
        ],
        "limitations": ["Modelled, not measured. No device was run."],
        "failed_checks": [],
        "is_demo": True,
    }
    return {**body, "reproducibility_hash": calculate_study_hash(body)}


def _quantity_node(package: dict) -> dict:
    return next(node for node in package["nodes"] if node["kind"] == "quantity")


# ------------------------------------------------------------- hash + structure


def test_a_self_consistent_package_verifies() -> None:
    """The baseline the tampering tests are read against.

    Everything checkable from the file alone holds: the digest is the digest of
    the contents, every node is its own hash, every edge joins two nodes that are
    here, and every table row resolves to a node the recipient actually has.
    """
    result = verify_research_package(_package(), validate_schema=False)

    assert result["problems"] == []
    assert result["valid"] is True
    assert result["hash_matches"] is True
    assert result["claims_resolve"] is True
    assert result["graph_valid"] is True


def test_an_edited_package_fails_its_hash_check() -> None:
    package = _package()
    _quantity_node(package)["quantity"]["value"] = 42

    result = verify_research_package(package, validate_schema=False)

    assert result["hash_matches"] is False
    assert result["valid"] is False
    assert result["expected_hash"] != package["reproducibility_hash"]


def test_an_edited_and_rehashed_package_fails_structurally() -> None:
    """The fabrication a hash check cannot see, caught by the structure instead.

    Anyone who edits a package can recompute its digests, and after this the file
    is cryptographically beyond reproach. What they cannot do quietly is keep the
    edited node's identity: identity here *is* the content hash, so the result
    row, the supporting edge and the claim map all now name a node the package no
    longer contains. Making the numbers lie means rewriting the graph, and a
    rewritten graph says something different where a reader can see it.
    """
    package = _package()
    node = _quantity_node(package)
    node["quantity"]["value"] = 42
    node["content_hash"] = calculate_study_hash(node)
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["hash_matches"] is True
    assert result["claims_resolve"] is False
    assert result["graph_valid"] is False
    assert result["valid"] is False
    assert any("EVIDENCE_NODE_UNRESOLVED" in problem for problem in result["problems"])


def test_a_result_row_without_a_node_does_not_resolve() -> None:
    package = _package()
    package["result_rows"] = [{"label": "Total physical qubits", "node_hash": ABSENT_HASH}]
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["hash_matches"] is True
    assert result["claims_resolve"] is False
    assert any("EVIDENCE_NODE_UNRESOLVED" in problem for problem in result["problems"])


def test_a_claim_with_no_map_entry_does_not_resolve() -> None:
    package = _package()
    package["claim_evidence_map"] = []
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["claims_resolve"] is False
    assert any("CLAIM_WITHOUT_EVIDENCE_NODE" in problem for problem in result["problems"])


def test_a_claim_map_naming_absent_evidence_does_not_resolve() -> None:
    package = _package()
    package["claim_evidence_map"][0]["evidence_node_hashes"] = [ABSENT_HASH]
    package["claim_evidence_map"][0]["edge_hashes"] = [ABSENT_HASH]
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["claims_resolve"] is False
    problems = " ".join(result["problems"])
    assert "EVIDENCE_NODE_UNRESOLVED" in problems
    assert "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED" in problems


def test_a_dangling_edge_endpoint_invalidates_the_graph() -> None:
    package = _package()
    package["edges"].append(
        _edge(
            kind="reviewed_by",
            from_node_hash=package["nodes"][0]["content_hash"],
            to_node_hash=ABSENT_HASH,
            rationale="Reviewed by a node this package forgot to carry.",
        )
    )
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["graph_valid"] is False
    assert result["valid"] is False


def test_verification_reports_that_no_decision_was_recomputed() -> None:
    """ADR 0014's honest-absence rule, in the result rather than only in prose.

    Python validates and hashes; it does not re-derive an estimate or re-run a
    decision rule. A caller that renders this dict renders the limitation with
    it, so "verified in Python" cannot quietly grow to mean more than was
    checked.
    """
    result = verify_research_package(_package(), validate_schema=False)

    assert result["decision_recompute"] is False
    assert "does not recompute the science" in verify_research_package.__doc__


def test_a_package_that_is_not_an_object_is_refused() -> None:
    with pytest.raises(KetQatValidationError):
        verify_research_package(["not", "a", "package"], validate_schema=False)


# ------------------------------------------------------------------ validation


def test_an_unknown_record_kind_is_refused_by_name() -> None:
    """The kind is checked before any file is opened, so the message is about the kind."""
    with pytest.raises(KetQatValidationError) as caught:
        validate_study_record(_package(), "research_bundle")
    assert "research_bundle" in str(caught.value)


def test_a_record_from_another_schema_version_is_refused() -> None:
    package = _package()
    package["schema_version"] = "0.1"
    with pytest.raises(KetQatValidationError) as caught:
        validate_study_record(package, "research_package")
    assert "schema_version" in str(caught.value)


def test_a_record_without_a_hash_rules_id_is_refused_by_name() -> None:
    """Nothing is inferred from silence, and the refusal says which marker is missing.

    A generic schema error would send the reader looking for a malformed field.
    The record is not malformed; it never said which rules it was hashed under,
    and no rule set is assumed on its behalf.
    """
    package = _package()
    del package["hash_rules_id"]
    with pytest.raises(KetQatValidationError) as caught:
        validate_study_record(package, "research_package")
    assert "hash_rules_id" in str(caught.value)
    assert "refused, not defaulted" in str(caught.value)


def test_a_record_naming_unknown_rules_is_refused() -> None:
    package = _package()
    package["hash_rules_id"] = "study-v2"
    with pytest.raises(KetQatValidationError) as caught:
        validate_study_record(package, "research_package")
    assert "study-v2" in str(caught.value)


@pytest.mark.skipif(
    SCHEMAS_LOADABLE, reason="the study schemas are present, so nothing is missing to name"
)
def test_a_missing_schema_is_refused_by_filename() -> None:
    """Until the generator emits them, the refusal names the file that is absent.

    The recorded trap this guards is a schema referenced by validation code and
    absent from the wheel, where validation works from a checkout and fails for
    everyone who installed the package. Naming the file is what turns that into
    a one-line diagnosis.
    """
    with pytest.raises(KetQatValidationError) as caught:
        validate_study_record(_package(), "research_package")
    assert "research-package.schema.json" in str(caught.value)


@pytest.mark.skipif(not PACKAGED_SCHEMAS_PRESENT, reason="study schemas are not generated yet")
def test_every_study_schema_ships_inside_the_package() -> None:
    for kind, filename in STUDY_SCHEMA_FILES.items():
        assert _packaged(filename), f"{kind} schema {filename} is missing from the wheel"


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_valid_package_passes_schema_validation() -> None:
    validate_study_record(_package(), "research_package")
    assert verify_research_package(_package())["valid"] is True


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_the_schema_refuses_an_enum_member_in_the_wrong_case() -> None:
    """Node kinds are lowercase in this family, and `"CLAIM"` is not a near miss.

    A validator that accepted either casing would let two spellings of one kind
    into the corpus, and a consumer switching on the string would silently handle
    one of them.
    """
    package = copy.deepcopy(_package())
    package["nodes"][0]["kind"] = "CLAIM"
    with pytest.raises(KetQatValidationError):
        validate_study_record(package, "research_package")
