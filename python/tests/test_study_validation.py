from __future__ import annotations

import copy
import json
from importlib import resources
from pathlib import Path

import pytest
from jsonschema import Draft7Validator

from ketqat_runner.study_hash import study_self_hash
from ketqat_runner.study_limits import JS_MAX_SAFE_INTEGER, StudyHashRefusal
from ketqat_runner.study_rules import STUDY_HASH_RULES_ID
from ketqat_runner.validation import KetQatValidationError, load_schema
from ketqat_runner.study_validation import (
    STUDY_SCHEMA_FILES,
    STUDY_SCHEMA_VERSION,
    validate_study_record,
    verify_research_package,
)


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "reproducibility"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text())


VECTOR_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "study" / "verification-vectors.json"


def _vector_case(label: str) -> dict:
    """One case from the cross-language verification vectors, by label."""
    document = json.loads(VECTOR_PATH.read_text())
    for case in document["cases"]:
        if case["label"] == label:
            return case
    raise AssertionError(f"No verification vector case is labelled {label!r}.")


#: A study id, not a digest: `study_ref` points at the aggregate's stable
#: opaque id, so a rename does not orphan every record that names it.
STUDY_REF = "d5a370a6-8b65-4ae8-8f57-8c06f313afac"
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
        "visibility": "PUBLIC",
        "claim": None,
        "quantity": None,
        "reference": None,
        "citation": None,
        "limitations": [],
        "source_published_on": None,
        "retrieved_on": None,
    }
    body.update(changes)
    return {**body, "content_hash": study_self_hash("evidence_node", body)}


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
    return {**body, "content_hash": study_self_hash("evidence_edge", body)}


def _package() -> dict:
    """The intact package from the cross-language verification vectors.

    Built by TypeScript and committed as `fixtures/study/verification-vectors.json`,
    rather than assembled again here. A second hand-written package would be a
    second thing that can drift from the shape the schemas describe -- and it
    would drift silently, because a Python-only package is one nothing on the
    other side ever reads.
    """
    return copy.deepcopy(_vector_case("intact")["package"])


def _quantity_node(package: dict) -> dict:
    return next(node for node in package["nodes"] if node["kind"] == "quantity")


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
    assert verify_research_package(_package())["status"] == "STRUCTURE_VERIFIED"


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


def test_a_64_bit_seed_and_byte_count_are_carried_as_digits_rather_than_refused() -> None:
    """A 64-bit seed is not the same number in the two languages, so it is not a number.

    This language holds the integer as written; JavaScript reads the same JSON as
    a double, so the ordinary seed a Stim or NumPy run reports --
    13835058055282163712 -- comes back there as 13835058055282164000, and the two
    digests differ over one file. Refusing every integer past 2^53 fixed that by
    refusing the family's own inputs. The contract fixes it instead: a seed and a
    byte count are `exact_integer_string`, so both languages hash the digits the
    file contains at any magnitude.
    """
    capsule = _fixture("study-capsule-64-bit-integers.json")
    assert int(capsule["seed"]) > JS_MAX_SAFE_INTEGER
    assert int(capsule["execution"]["resource_limits"]["max_memory_bytes"]) > JS_MAX_SAFE_INTEGER
    # And on an artifact reference, which is the third place in this family where
    # a byte count routinely outgrows a double.
    assert int(capsule["outputs"][0]["byte_size"]) > JS_MAX_SAFE_INTEGER
    validate_study_record(capsule, "execution_capsule")

    pins = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    assert study_self_hash("execution_capsule", capsule) == pins["study_capsule_64_bit_integers"]["self_hash"]
    assert study_self_hash("execution_capsule", capsule) == capsule["reproducibility_hash"]

    # Two integers one apart, which one double cannot tell apart and the digits can.
    neighbour = copy.deepcopy(capsule)
    neighbour["seed"] = str(int(capsule["seed"]) - 1)
    assert float(neighbour["seed"]) == float(capsule["seed"])
    assert study_self_hash("execution_capsule", neighbour) != capsule["reproducibility_hash"]


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
def test_a_seed_written_as_a_number_is_refused_by_the_shipped_schema_too() -> None:
    """The contract has to survive into the JSON Schema, or only one language applies it.

    `zod-to-json-schema` emits a `pattern` and cannot emit a `.refine`, so the
    rule is written as one regular expression rather than split between a loose
    pattern and refinements beside it. Without that, `seed` would be
    `{"type": "string"}` here -- and a capsule carrying `"abc"` would be refused
    in TypeScript and accepted by the validator that reads this schema.
    """
    schema = load_schema("execution-capsule.schema.json")
    seed = schema["definitions"]["execution-capsule"]["properties"]["seed"]["anyOf"][0]
    assert seed["type"] == "string"
    assert seed["pattern"] == "^(?:0|-?[1-9][0-9]{0,63})$"

    capsule = _fixture("study-capsule.json")
    for spelling in (13835058055282163712, "-0", "007", "+7", "1e3", "abc", "9" * 65):
        broken = copy.deepcopy(capsule)
        broken["seed"] = spelling
        with pytest.raises(KetQatValidationError, match="seed"):
            validate_study_record(broken, "execution_capsule")


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
    assert result["status"] == "STRUCTURE_VERIFIED"
    assert result["levels"]["hash_matches"] is True
    # Structural, not reproduction: this language does not re-run a model, and
    # the value says so rather than the docstring alone (ADR 0010, ADR 0014).
    assert result["verification_performed"] == "INTEGRITY_AND_STRUCTURE"
    assert result["levels"]["science_recomputed"] is False
    pins = _fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]
    assert result["expected_hash"] == pins["study_research_package_as_written"]["self_hash"]


# ------------------------------------- what a projection makes impossible to ask
#
# Three forgeries used to work, each schema-valid, and each buying the "embedded
# record" exemption with data rather than with a schema: an object under
# `hardware` carrying a rules marker, an object under `hardware` shaped like a
# `Quantity` envelope, and a dependency literally named `hash_rules_id`. The
# exemption then let the canonicalizer drop `id` inside it, so two environments
# hashed identically and a capsule verified against a digest that could not see
# its own environment.
#
# There is no exemption to buy any more, and no marker to forge: the projection
# reads the fields a record kind declares and refuses the rest, so "is this
# object an embedded record?" is not a question the digest asks. What is left is
# a `hardware` entry that is a declared `{name, value}` pair or is not a capsule.


def _capsule_with_environment(environment: dict) -> dict:
    capsule = copy.deepcopy(_fixture("study-capsule.json"))
    capsule["environment"] = environment
    capsule.pop("reproducibility_hash", None)
    return capsule


@pytest.mark.parametrize(
    "hardware",
    [
        {"accelerator": {"hash_rules_id": "junk", "id": "gpu-0"}},
        {"accelerator": {"value": 1, "evidence": "MEASURED", "id": "gpu-0"}},
    ],
    ids=["marker", "quantity-envelope"],
)
def test_an_object_under_hardware_has_no_exemption_left_to_buy(hardware: dict) -> None:
    capsule = _capsule_with_environment(
        {"operating_system": "Linux", "packages": [], "hardware": hardware}
    )
    capsule["reproducibility_hash"] = "0" * 64

    # The declaration says `hardware` is a list, so a map is refused as a shape
    # mismatch rather than walked to see what its keys are called.
    with pytest.raises(StudyHashRefusal) as caught:
        study_self_hash("execution_capsule", capsule)
    assert caught.value.code == "SHAPE_MISMATCH"
    assert caught.value.path == "environment.hardware"

    with pytest.raises(KetQatValidationError):
        validate_study_record(capsule, "execution_capsule")


def test_a_dependency_named_after_the_rules_marker_is_a_value_like_any_other() -> None:
    capsule = _capsule_with_environment(
        {"operating_system": "Linux", "packages": {"hash_rules_id": "1.0.0"}, "hardware": []}
    )
    capsule["reproducibility_hash"] = "0" * 64
    with pytest.raises(StudyHashRefusal) as caught:
        study_self_hash("execution_capsule", capsule)
    assert caught.value.code == "SHAPE_MISMATCH"

    # Recorded the way the schema declares it, the same dependency is content:
    # two versions of a package called `hash_rules_id` are two different capsules,
    # and the name buys nothing because no name buys anything.
    def with_version(version: str) -> str:
        return study_self_hash(
            "execution_capsule",
            _capsule_with_environment(
                {
                    "operating_system": "Linux",
                    "packages": [{"name": "hash_rules_id", "version": version}],
                    "hardware": [],
                }
            ),
        )

    assert with_version("1.0.0") != with_version("2.0.0")


def test_two_environments_that_differ_are_two_capsules() -> None:
    def with_accelerator(name: str) -> str:
        return study_self_hash(
            "execution_capsule",
            _capsule_with_environment(
                {
                    "operating_system": "Linux",
                    "packages": [],
                    "hardware": [{"name": "accelerator", "value": name}],
                }
            ),
        )

    assert with_accelerator("gpu-0") != with_accelerator("gpu-1")


@pytest.mark.parametrize("undeclared", ["owner_username", "smuggled_root_key", "__proto__"])
def test_an_undeclared_key_is_refused_here_and_in_typescript(undeclared: str) -> None:
    """One file, one verdict, and no name is special.

    `owner_username` is the case that hid best: undeclared by the contract *and*
    on the retired exclusion list, so zod stripped it, the hash did not move, and
    `verifyResearchPackage` reported `valid: True, problems: []` while this
    language raised "Additional properties are not allowed" over the same bytes.
    The digest now refuses it too, and refuses `smuggled_root_key` and
    `__proto__` on exactly the same grounds -- the question is whether a field is
    declared, not whether its name is suspicious.
    """
    package = _package()
    forged = {**package, undeclared: "somebody-else"}

    with pytest.raises(StudyHashRefusal) as caught:
        study_self_hash("research_package", forged)
    assert caught.value.code == "UNDECLARED_FIELD"
    assert caught.value.path == undeclared

    result = verify_research_package(forged, validate_schema=False)
    assert result["status"] != "STRUCTURE_VERIFIED"
    assert result["expected_hash"] == "", "the digest was never taken"
    assert result["findings"][0]["code"] == "STUDY_RECORD_NOT_HASHABLE"
    assert "UNDECLARED_FIELD" in result["findings"][0]["message"]


@pytest.mark.skipif(not SCHEMAS_LOADABLE, reason="study schemas are not generated yet")
@pytest.mark.parametrize("undeclared", ["owner_username", "smuggled_root_key"])
def test_the_schema_refuses_the_same_undeclared_keys(undeclared: str) -> None:
    """The schema still says so, and the validator now answers before it.

    `validate_study_record` reaches the hashing gate first, so an undeclared key
    is reported as `UNDECLARED_FIELD` rather than as "Additional properties are
    not allowed" -- deliberately, because "this cannot be hashed" and "this is
    the wrong shape" send a reader to different places. The schema is asserted
    directly here so that the two answers cannot drift apart while only one of
    them is ever exercised.
    """
    schema = load_schema("research-package.schema.json")
    assert schema["definitions"]["research-package"]["additionalProperties"] is False

    package = dict(_package(), **{undeclared: "somebody-else"})
    errors = list(Draft7Validator(schema).iter_errors(package))
    assert any("Additional properties are not allowed" in error.message for error in errors)

    with pytest.raises(KetQatValidationError, match="UNDECLARED_FIELD"):
        validate_study_record(package, "research_package")


# ------------------------------- one rule, every record kind, at every depth


def test_a_key_hidden_inside_a_quantity_envelope_is_refused_at_any_depth() -> None:
    """Nesting depth is not a question the projection asks.

    The retired rule matched key names recursively, so it had to be right about
    every name that could appear at every depth -- including names an attacker
    picks. Five rounds of probing found five holes in it. Here a key nobody
    declared is never read, wherever it sits, and the refusal names the path.
    """
    for key in ("id", "slug", "content_hash", "smuggled", "__proto__"):
        package = copy.deepcopy(_package())
        node = next(node for node in package["nodes"] if node["quantity"] is not None)
        node["quantity"][key] = "smuggled"

        result = verify_research_package(package, validate_schema=False)
        assert result["status"] == "REFUSED"
        assert result["levels"]["canonicalizable"] is False
        assert result["levels"]["hash_matches"] is False
        assert result["expected_hash"] == "", "the digest was never taken"
        assert len(result["findings"]) == 1
        assert result["findings"][0]["code"] == "STUDY_RECORD_NOT_HASHABLE"
        assert f"quantity.{key}" in result["findings"][0]["message"]

        with pytest.raises(StudyHashRefusal) as caught:
            study_self_hash("evidence_node", node)
        assert caught.value.code == "UNDECLARED_FIELD"
        assert caught.value.path == f"quantity.{key}"


def test_a_declared_envelope_annotation_is_classified_rather_than_dropped() -> None:
    """The mirror image, which is what makes this a classification and not a denylist.

    `created_at` inside a `Quantity` is a declared field, so it is not smuggled at
    all. It is `RECORD_ONLY`: rebuilding an envelope around the same measurement
    must not read as new science, and the record digest still covers it.
    """
    from ketqat_runner.study_hash import record_hash, semantic_hash

    package = _package()
    node = next(node for node in package["nodes"] if node["quantity"] is not None)
    rebuilt = copy.deepcopy(node)
    rebuilt["quantity"]["created_at"] = "2027-01-01T00:00:00.000Z"

    assert semantic_hash("evidence_node", rebuilt) == semantic_hash("evidence_node", node)
    assert record_hash("evidence_node", rebuilt) != record_hash("evidence_node", node)


def test_a_non_finite_number_is_refused_rather_than_written_as_bare_inf() -> None:
    """RFC 8785 §3.2.2.3 requires a compliant implementation to terminate on one.

    JSON has no syntax for NaN or an infinity, and the two languages disagree
    about what to write instead: one emits `null`, collapsing three distinct
    values onto one digest, the other emits bare `inf`, which is not JSON and
    which the first cannot read back.
    """
    for figure in (float("nan"), float("inf"), float("-inf")):
        package = copy.deepcopy(_package())
        node = next(node for node in package["nodes"] if node["quantity"] is not None)
        node["quantity"]["value"] = figure

        with pytest.raises(StudyHashRefusal) as caught:
            study_self_hash("evidence_node", node)
        assert caught.value.code == "NON_FINITE_NUMBER"
        assert caught.value.path == "quantity.value"


def test_a_string_neither_language_can_round_trip_is_refused_rather_than_raised() -> None:
    """A lone surrogate stopped this verifier dead.

    The canonical form is encoded as UTF-8, and an unpaired surrogate cannot be
    encoded at all, so a package carrying one raised `UnicodeEncodeError` out of
    `verify_research_package` -- a recipient could not check the file, and
    nothing said why. The TypeScript side hashed the escape and reported the
    package valid. Both now refuse it by name, which is RFC 8785 §3.2.2.2's own
    requirement.
    """
    package = copy.deepcopy(_package())
    node = next(node for node in package["nodes"] if node["quantity"] is not None)
    node["label"] = "Total physical qubits \ud800"

    result = verify_research_package(package, validate_schema=False)
    assert result["status"] != "STRUCTURE_VERIFIED"
    assert result["problems"][0].startswith("STUDY_RECORD_NOT_HASHABLE")
    assert "LONE_SURROGATE" in result["problems"][0]

    with pytest.raises(KetQatValidationError, match="LONE_SURROGATE"):
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
    """The parse and the digest are two readings of one file, and they now agree.

    `Quantity` is declared in `src/intelligence` and used to strip what it did
    not declare, so a `smuggled_note` inside an `expected_credits` envelope
    survived into the digest and did not survive the parse: a consumer that
    parsed the file and then verified got one digest for two different files,
    while one that hashed the file as read got two. The generated schema has said
    `additionalProperties: false` here all along, and `StudyQuantitySchema` makes
    the TypeScript parse agree -- and now the digest refuses it too, so all three
    readings are one.
    """
    schema = load_schema("research-package.schema.json")
    envelope = schema["definitions"]["research-package"]["properties"]["nodes"]["items"][
        "properties"
    ]["quantity"]["anyOf"][0]
    assert envelope["additionalProperties"] is False, "this language has always refused it"

    package = copy.deepcopy(_package())
    node = next(node for node in package["nodes"] if node["quantity"] is not None)
    node["quantity"]["smuggled_note"] = "figures revised downward after review"

    # The hashing refusal comes first, because "this cannot be hashed" and "this
    # is the wrong shape" send a reader to different places.
    with pytest.raises(KetQatValidationError, match="UNDECLARED_FIELD"):
        validate_study_record(package, "research_package")
