from __future__ import annotations

import copy
import json
from importlib import resources
from pathlib import Path

import pytest

from ketqat_runner.study_hashing import STUDY_HASH_RULES_ID, calculate_study_hash
from ketqat_runner.validation import KetQatValidationError, load_schema
from ketqat_runner.study_validation import (
    JS_MAX_SAFE_INTEGER,
    STUDY_SCHEMA_FILES,
    STUDY_SCHEMA_VERSION,
    validate_study_record,
    verify_research_package,
)


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "reproducibility"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text())


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
    # The claim map cites the snapshot as well as the number, so the graph has to
    # carry an edge saying the snapshot supports the claim. `derived_from` below
    # is provenance -- where the number came from -- and provenance is not
    # support.
    result_supports_edge = _edge(
        kind="supports",
        from_node_hash=result_node["content_hash"],
        to_node_hash=claim_node["content_hash"],
        rationale="The claimed ceiling is read out of this estimate snapshot, which is the run that produced it.",
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
        "environment": {"operating_system": "linux", "packages": [], "hardware": []},
        "reproduction_command": "ketqat-engine study verify <this-file>",
        "nodes": [claim_node, quantity_node, result_node],
        "edges": [supports_edge, result_supports_edge, derived_edge],
        "claim_evidence_map": [
            {
                "claim_node_hash": claim_node["content_hash"],
                "evidence_node_hashes": [
                    quantity_node["content_hash"],
                    result_node["content_hash"],
                ],
                "edge_hashes": [
                    supports_edge["content_hash"],
                    result_supports_edge["content_hash"],
                ],
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


def test_a_claim_citing_itself_does_not_resolve() -> None:
    """Every hash resolves and nothing is established.

    This package passed a resolution-only check perfectly: the claim node is in
    the file, the map names it, and the hash it cites is a hash the package
    carries. What no part of it says is that anything supports anything -- and
    the edge that would say so cannot exist, because an edge must join two
    different nodes.
    """
    package = _package()
    claim_hash = next(
        node["content_hash"] for node in package["nodes"] if node["kind"] == "claim"
    )
    package["edges"] = []
    package["claim_evidence_map"] = [
        {
            "claim_node_hash": claim_hash,
            "evidence_node_hashes": [claim_hash],
            "edge_hashes": [],
        }
    ]
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["hash_matches"] is True
    assert result["claims_resolve"] is False
    problems = " ".join(result["problems"])
    assert "CLAIM_EVIDENCE_SELF_REFERENTIAL" in problems
    assert "CLAIM_EVIDENCE_UNLINKED" in problems
    assert "CLAIM_WITHOUT_EVIDENCE_NODE" in problems


def test_a_claim_citing_evidence_no_edge_joins_does_not_resolve() -> None:
    """The map and the graph, made to agree.

    The node is carried and the claim is real; what is missing is any edge
    asserting that the one bears on the other. `derived_from` is provenance and
    does not assert support, which is why removing the supports edge for the
    snapshot is enough to fail this while the snapshot stays in the graph.
    """
    package = _package()
    claim_hash = next(
        node["content_hash"] for node in package["nodes"] if node["kind"] == "claim"
    )
    result_hash = next(
        node["content_hash"] for node in package["nodes"] if node["kind"] == "result"
    )
    package["edges"] = [
        edge
        for edge in package["edges"]
        if not (edge["kind"] == "supports" and edge["from_node_hash"] == result_hash)
    ]
    package["claim_evidence_map"] = [
        {
            "claim_node_hash": claim_hash,
            "evidence_node_hashes": [result_hash],
            "edge_hashes": [package["edges"][0]["content_hash"]],
        }
    ]
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["claims_resolve"] is False
    assert any("CLAIM_EVIDENCE_UNLINKED" in problem for problem in result["problems"])


def test_a_result_row_naming_a_node_with_no_value_does_not_resolve() -> None:
    """A result row is a number in a table.

    The claim node is the tempting one: it holds a number, inside a sentence. A
    row reading from it would print the assertion as a measurement.
    """
    package = _package()
    claim_hash = next(
        node["content_hash"] for node in package["nodes"] if node["kind"] == "claim"
    )
    package["result_rows"] = [{"label": "Total physical qubits", "node_hash": claim_hash}]
    package["reproducibility_hash"] = calculate_study_hash(package)

    result = verify_research_package(package, validate_schema=False)

    assert result["claims_resolve"] is False
    assert any("RESULT_ROW_WITHOUT_VALUE" in problem for problem in result["problems"])


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


# ------------------------------------------------- cross-language hashing refusals


def test_an_integer_above_max_safe_integer_is_refused_rather_than_diverging() -> None:
    """A 64-bit seed is not the same number in the two languages.

    This one holds the integer as written; JavaScript reads the same JSON as a
    double, so the ordinary seed a Stim or NumPy run reports --
    13835058055282163712 -- comes back there as 13835058055282164000. The two
    canonical forms differ and so do the digests, and no rendering rule
    reconciles them, because the value the other side holds is not the value that
    was written. So the contract refuses rather than producing two answers for
    one record, in this language and in `src/study/capsule.ts` alike.
    """
    capsule = _fixture("study-capsule-max-safe-integers.json")

    for path, unsafe in (
        (("seed",), 13835058055282163712),
        (("resource_limits", "max_memory_bytes"), 2**63),
    ):
        broken = copy.deepcopy(capsule)
        target = broken
        for part in path[:-1]:
            target = target[part]
        target[path[-1]] = unsafe

        with pytest.raises(KetQatValidationError) as caught:
            validate_study_record(broken, "execution_capsule")
        message = str(caught.value)
        assert ".".join(path) in message
        # The message says *why*, not only that: a caller reading it can tell
        # that retrying will not help and that the value itself has to change.
        assert "two different digests" in message


def test_exactly_max_safe_integer_is_accepted_and_hashes_the_same_in_both_languages() -> None:
    """The boundary is inclusive, and pinned.

    9007199254740991 is the last integer JavaScript holds exactly, so it is the
    last one the two languages can agree about -- and a contract that refused it
    would be refusing a value that was never in danger.
    """
    capsule = _fixture("study-capsule-max-safe-integers.json")
    assert capsule["seed"] == JS_MAX_SAFE_INTEGER
    assert capsule["resource_limits"]["max_memory_bytes"] == JS_MAX_SAFE_INTEGER

    validate_study_record(capsule, "execution_capsule")
    expected = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    assert calculate_study_hash(capsule) == expected["study_capsule_max_safe_integers"]
    assert calculate_study_hash(capsule) == capsule["reproducibility_hash"]


def test_a_package_verifies_as_written_here_too() -> None:
    """The hash is over the record as written, in both languages.

    `CitationSchema.authors` carried a default in the TypeScript contracts and
    was the last one a study record met. It let one logical citation have two
    content addresses: the builder there parsed before it hashed and digested a
    list the producer never wrote, the verifier there hashed the file, and this
    language -- which fills in nothing -- agreed with whichever of them had
    written the file. `StudyCitationSchema` requires the list, so the fixture now
    carries `authors: []` as a fact about the file rather than as something a
    parser supplies, and there is one digest to agree about.
    """
    package = _fixture("study-research-package-as-written.json")
    assert package["references"][0]["authors"] == []

    result = verify_research_package(package, validate_schema=False)
    assert result["problems"] == []
    assert result["valid"] is True
    assert result["hash_matches"] is True
    expected = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    assert result["expected_hash"] == expected["study_research_package_as_written"]


def test_a_package_whose_graph_hides_an_excluded_key_is_reported_not_raised() -> None:
    """The keys a schema cannot answer for, walked in the data instead.

    An environment recording a dependency named `id` was dropped at every depth
    before the digest was taken, so two packages differing only there were
    content-addressed identically. `StudyEnvironment` puts the dependency name in
    a declared field, so that shape is no longer a package at all -- but a
    `Quantity` envelope is an embedded record whose own top level the exclusions
    deliberately do not bite at, and the exemption there covers only the three
    excluded names such a record declares. A recipient checking a file they were
    sent gets this beside the other findings rather than as an exception, which
    is how `verifyResearchPackage` reports it too.
    """
    package = copy.deepcopy(_package())
    node = next(node for node in package["nodes"] if node["quantity"] is not None)
    node["quantity"]["id"] = "smuggled"

    result = verify_research_package(package, validate_schema=False)
    assert result["valid"] is False
    assert result["hash_matches"] is False
    assert result["expected_hash"] == ""
    assert len(result["problems"]) == 1
    assert result["problems"][0].startswith("STUDY_EXCLUDED_KEY_NESTED")
    assert "quantity.id" in result["problems"][0]

    # And the validator refuses it outright, before the schema gate: "this cannot
    # be hashed" is a different answer from "this is the wrong shape".
    with pytest.raises(KetQatValidationError, match="quantity.id"):
        validate_study_record(package, "research_package")


# ----------------------------------------------------- the three forging routes
#
# Each was schema-valid, and each bought the "embedded record" exemption with
# data rather than with a schema: an object under `hardware` carrying a marker,
# an object under `hardware` shaped like a `Quantity` envelope, and a dependency
# literally named `hash_rules_id`. The exemption then let the canonicalizer drop
# `id` inside it, so two environments hashed identically and a capsule verified
# against a digest that could not see its own environment.
#
# Asserted from both languages, against the same routes, in
# tests/study-exclusion-collisions.test.mjs.


def _capsule_with_environment(environment: dict) -> dict:
    capsule = copy.deepcopy(_fixture("study-capsule.json"))
    capsule["environment"] = environment
    capsule.pop("reproducibility_hash", None)
    return capsule


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
@pytest.mark.parametrize(
    "hardware",
    [
        {"accelerator": {"hash_rules_id": "junk", "id": "gpu-0"}},
        {"accelerator": {"value": 1, "evidence": "MEASURED", "id": "gpu-0"}},
    ],
    ids=["marker", "quantity-envelope"],
)
def test_an_object_under_hardware_cannot_buy_the_embedded_record_exemption(hardware: dict) -> None:
    capsule = _capsule_with_environment(
        {"operating_system": "Linux", "packages": [], "hardware": hardware}
    )
    capsule["reproducibility_hash"] = "0" * 64

    # Refused at the hashing layer, which is the only gate a caller who hashes a
    # hand-assembled dict ever passes.
    with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
        calculate_study_hash(capsule)
    # And refused as a capsule, because a hardware entry has no key a producer chooses.
    with pytest.raises(KetQatValidationError):
        validate_study_record(capsule, "execution_capsule")


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_dependency_named_after_the_rules_marker_cannot_buy_it_either() -> None:
    capsule = _capsule_with_environment(
        {"operating_system": "Linux", "packages": {"hash_rules_id": "1.0.0"}, "hardware": []}
    )
    capsule["reproducibility_hash"] = "0" * 64

    # A marker naming no known rule set is not a marker, so the object carrying it
    # is not an embedded record and its `hash_rules_id` is refused, not dropped.
    with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
        calculate_study_hash(capsule)
    with pytest.raises(KetQatValidationError):
        validate_study_record(capsule, "execution_capsule")

    # Recorded as a value, the same dependency is content: two versions of a
    # package called `hash_rules_id` are two different capsules.
    def with_version(version: str) -> str:
        return calculate_study_hash(
            _capsule_with_environment(
                {
                    "operating_system": "Linux",
                    "packages": [{"name": "hash_rules_id", "version": version}],
                    "hardware": [],
                }
            )
        )

    assert with_version("1.0.0") != with_version("2.0.0")


def test_two_environments_that_differ_are_two_capsules() -> None:
    def with_accelerator(name: str) -> str:
        return calculate_study_hash(
            _capsule_with_environment(
                {
                    "operating_system": "Linux",
                    "packages": [],
                    "hardware": [{"name": "accelerator", "value": name}],
                }
            )
        )

    assert with_accelerator("gpu-0") != with_accelerator("gpu-1")


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
@pytest.mark.parametrize("undeclared", ["owner_username", "smuggled_root_key"])
def test_an_undeclared_key_is_refused_here_and_in_typescript(undeclared: str) -> None:
    """One file, one verdict.

    `owner_username` is the case that hid best: undeclared by the contract *and*
    excluded from the digest, so zod stripped it, the hash did not move, and
    `verifyResearchPackage` reported `valid: True, problems: []` while this
    language raised "Additional properties are not allowed" over the same bytes.
    The schema said `additionalProperties: false` all along; the zod parse now
    says the same thing, so this is the assertion that they agree.
    """
    package = dict(_package(), **{undeclared: "somebody-else"})

    with pytest.raises(KetQatValidationError, match="Additional properties are not allowed"):
        validate_study_record(package, "research_package")

    # The digest is untouched by an excluded key, which is why strictness rather
    # than hashing is what catches this one.
    if undeclared == "owner_username":
        assert package["reproducibility_hash"] == calculate_study_hash(package)


# ------------------------------- one rule, every record kind, at every depth


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_reported_figure_javascript_cannot_hold_exactly_is_refused_wherever_it_sits() -> None:
    """The half of the safe-integer rule no enumeration reached.

    `JS_SAFE_INTEGER_FIELDS` named two paths on one record kind, and
    `src/study/capsule.ts` bounded the same two fields. `Quantity.value` -- every
    number a study reports -- was guarded by neither. Near 4.2e21 one double
    stands for 524287 distinct integers, so two packages whose reported figure
    differed by 524286 took one digest in JavaScript, kept one node identity, and
    verified `valid: true` with no problems; this language held the integers as
    written, computed two different digests, and refused the *honest* file the
    TypeScript builder had just produced.

    Both languages now refuse both files, which is the only answer that leaves a
    reader able to tell the two studies apart.
    """
    low = 4199999999999999737857
    high = 4200000000000000262143
    assert float(low) == float(high)

    for figure in (low, high, 4.2e21):
        package = copy.deepcopy(_package())
        node = next(node for node in package["nodes"] if node["quantity"] is not None)
        node["quantity"]["value"] = figure

        # Reported rather than raised, beside the other findings, the way
        # `verifyResearchPackage` reports it: a recipient checking a file they
        # were sent needs the finding, not a traceback.
        result = verify_research_package(package, validate_schema=False)
        assert result["valid"] is False
        assert result["expected_hash"] == "", "the digest was never taken"
        assert len(result["problems"]) == 1
        assert result["problems"][0].startswith("STUDY_VALUE_NOT_REPRESENTABLE")
        assert "quantity.value" in result["problems"][0]
        assert "two different digests" in result["problems"][0]

        # And the validator refuses it before the schema gate, for every record
        # kind rather than for the one kind an enumeration happened to name.
        with pytest.raises(KetQatValidationError, match="quantity.value"):
            validate_study_record(package, "research_package")
        with pytest.raises(KetQatValidationError, match="quantity.value"):
            validate_study_record(node, "evidence_node")


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_capsule_seed_is_still_refused_now_that_the_schema_no_longer_bounds_it() -> None:
    """The two fields that met the problem first are still covered.

    `execution-capsule.schema.json` no longer carries
    `maximum: 9007199254740991` on `seed` or on
    `resource_limits.max_memory_bytes`, because the bound moved to the hashing
    layer where it covers every number instead of two. That is only an
    improvement if the original case is still refused, so it is asserted here
    rather than assumed.
    """
    capsule = _fixture("study-capsule-max-safe-integers.json")
    schema = load_schema("execution-capsule.schema.json")
    assert "9007199254740991" not in json.dumps(schema), "the per-field bound is gone"

    for path, unsafe in (
        (("seed",), 13835058055282163712),
        (("resource_limits", "max_memory_bytes"), 2**63),
    ):
        broken = copy.deepcopy(capsule)
        target = broken
        for part in path[:-1]:
            target = target[part]
        target[path[-1]] = unsafe

        with pytest.raises(KetQatValidationError) as caught:
            validate_study_record(broken, "execution_capsule")
        message = str(caught.value)
        assert ".".join(path) in message
        assert "two different digests" in message


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_string_neither_language_can_round_trip_is_refused_rather_than_raised() -> None:
    """A lone surrogate stopped this verifier dead.

    `calculate_study_hash` encodes the canonical form as UTF-8, and an unpaired
    surrogate cannot be encoded at all, so a package carrying one raised
    `UnicodeEncodeError` out of `verify_research_package` -- a recipient could
    not check the file, and nothing said why. The TypeScript side hashed the
    escape and reported the package valid. Now both refuse it by name.
    """
    package = copy.deepcopy(_package())
    node = next(node for node in package["nodes"] if node["quantity"] is not None)
    node["label"] = "Total physical qubits \ud800"

    result = verify_research_package(package, validate_schema=False)
    assert result["valid"] is False
    assert result["problems"][0].startswith("STUDY_VALUE_NOT_REPRESENTABLE")
    assert "unpaired UTF-16 surrogate" in result["problems"][0]

    with pytest.raises(KetQatValidationError, match="unpaired UTF-16 surrogate"):
        validate_study_record(package, "research_package")


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_citation_must_carry_its_author_list_rather_than_be_given_one() -> None:
    """The last default a study record hashed, removed on both sides.

    `CitationSchema.authors` defaulted to `[]`, so the TypeScript builder parsed
    and then hashed a list the producer never wrote, while its verifier hashed
    the file and this language filled in nothing. One logical citation had two
    content addresses depending on which side of the parse you stood.
    `StudyCitationSchema` requires the list, and the generated schema says so, so
    a file omitting it is refused here as well rather than accepted under a
    digest that depends on who read it.
    """
    schema = load_schema("research-package.schema.json")
    citation = schema["definitions"]["research-package"]["properties"]["references"]["items"]
    assert "authors" in citation["required"]
    assert "default" not in citation["properties"]["authors"]

    package = copy.deepcopy(_package())
    del package["references"][0]["authors"]
    with pytest.raises(KetQatValidationError, match="authors"):
        validate_study_record(package, "research_package")


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_an_undeclared_key_inside_a_quantity_envelope_is_refused_in_both_languages() -> None:
    """The parse and the digest are two readings of one file.

    `Quantity` is declared in `src/intelligence` and used to strip what it did
    not declare, so a `smuggled_note` inside an `expected_credits` envelope
    survived into the digest and did not survive the parse: a consumer that
    parsed the file and then verified got one digest for two different files,
    while one that hashed the file as read got two. The generated schema has said
    `additionalProperties: false` here all along -- so this language always
    refused it -- and `StudyQuantitySchema` now makes the TypeScript parse agree.
    """
    schema = load_schema("research-package.schema.json")
    envelope = schema["definitions"]["research-package"]["properties"]["nodes"]["items"][
        "properties"
    ]["claim"]["anyOf"][0]["properties"]["value"]
    assert envelope["additionalProperties"] is False, "this language has always refused it"

    package = copy.deepcopy(_package())
    node = next(node for node in package["nodes"] if node["quantity"] is not None)
    node["quantity"]["smuggled_note"] = "figures revised downward after review"

    # The quantity is nullable, so the schema reports the whole `anyOf` rather
    # than the additional property by name; the path is what a reader needs, and
    # the refusal is what the two languages now share.
    with pytest.raises(KetQatValidationError, match=r"\$\.nodes\[1\]\.quantity"):
        validate_study_record(package, "research_package")

    # It is content either way: the digest has always seen it, which is why the
    # parse that stripped it was the half that was wrong.
    clean = copy.deepcopy(_package())
    clean_node = next(node for node in clean["nodes"] if node["quantity"] is not None)
    assert calculate_study_hash(node) != calculate_study_hash(clean_node)
