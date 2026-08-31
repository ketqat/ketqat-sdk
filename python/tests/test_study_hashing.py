from __future__ import annotations

import json
from pathlib import Path

import pytest

from ketqat_runner.hashing import calculate_reproducibility_hash
from ketqat_runner.study_hashing import (
    EMBEDDED_RECORD_EXEMPT_KEYS,
    JS_MAX_SAFE_INTEGER,
    STUDY_EXCLUDED_KEYS,
    STUDY_HASH_RULES_ID,
    STUDY_HASH_RULES_KEY,
    assert_no_nested_excluded_keys,
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
        # A package hashed exactly as its bytes read. Its one citation now
        # *carries* its author list: `CitationSchema.authors` used to default to
        # `[]`, which was the last way the TypeScript builder could materialise a
        # container before hashing while this language hashed the file -- one
        # schema-valid record, two digests, and no message on either side saying
        # so. `StudyCitationSchema` requires the list, so an empty array here is a
        # fact about the file rather than something a parser supplies.
        "study_research_package_as_written": "study-research-package-as-written.json",
        # `seed` and `max_memory_bytes` at exactly Number.MAX_SAFE_INTEGER: the
        # last integer both languages hold exactly, and therefore the last one
        # they can agree about.
        "study_capsule_max_safe_integers": "study-capsule-max-safe-integers.json",
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
        # A string this family does not define, on purpose: ADR 0014 reserves no
        # name and pre-names no future level, so "signed" in a test would put the
        # word the family declines to promise where a reader could mistake it for
        # a candidate.
        {"attestation_level": "level-this-family-does-not-define"},
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


def test_a_record_carrying_two_self_hash_fields_is_refused() -> None:
    """One record, one self-hash.

    Neither field name is part of the digest, so a second one costs nothing to
    add to a finished record -- and this function is the only verifier a Python
    caller has, running before any schema has seen the dict. It preferred
    `content_hash`, so editing a capsule and adding a `content_hash` over the
    edited contents produced a record it reported intact.
    """
    record = _study_record()
    expected = calculate_study_hash(record)
    edited = {
        **{key: item for key, item in record.items() if key != "content_hash"},
        "max_credits": 9999,
        "reproducibility_hash": expected,
    }
    assert verify_study_record_hash(edited)["valid"] is False

    spoofed = {**edited, "content_hash": calculate_study_hash(edited)}
    with pytest.raises(ValueError, match="one self-hash field"):
        verify_study_record_hash(spoofed)


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


def test_a_free_form_map_cannot_hide_a_key_the_digest_drops() -> None:
    """The exclusion set is applied at every depth, and a map's keys are data.

    A study record used to carry `EnvironmentSchema`'s `packages` and `hardware`
    maps, whose keys arrive at run time and appear in no schema, so a dependency
    genuinely named `id` was dropped before the digest was taken. The reviewer's
    case: two execution capsules differing only in the version of a package
    called `id` hashed identically, and one could be handed the other's
    environment while still verifying against its own digest. `StudyEnvironment`
    records a dependency name in a declared field, so no study record has such a
    key -- but this function takes a dict no schema has seen, which is exactly
    what a caller who only has Python hands it.

    Refused, in the same words as `assertNoNestedExcludedKeys` in
    src/study/hashing.ts.
    """
    def capsule(version: str) -> dict:
        return {
            STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
            "environment": {"packages": {"id": version}, "hardware": {}},
        }

    for broken in (capsule("1.0.0"), capsule("2.0.0")):
        with pytest.raises(ValueError, match=r"environment\.packages\.id"):
            calculate_study_hash(broken)
        with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
            canonical_study_json(broken)
        with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
            verify_study_record_hash(broken)
        with pytest.raises(ValueError, match=r"environment\.packages\.id"):
            assert_no_nested_excluded_keys(broken)

    # At every depth, and through lists, because the canonicalizer drops the name
    # wherever it appears rather than at some fixed level.
    for hardware in (
        {"visibility": "public"},
        {"accelerator": {"id": "gpu-0"}},
        {"racks": [{"slug": "rack-a"}]},
    ):
        with pytest.raises(ValueError, match="must not carry an excluded key"):
            calculate_study_hash(
                {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "environment": {"hardware": hardware}}
            )

    # The refusal names the offending path, because renaming the field is what
    # fixes it and a reader cannot rename what they cannot find.
    with pytest.raises(ValueError, match=r"environment\.hardware\.racks\[0\]\.slug"):
        assert_no_nested_excluded_keys(
            {
                STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
                "environment": {"hardware": {"racks": [{"slug": "rack-a"}]}},
            }
        )


def test_the_two_exemptions_the_walk_has_to_keep() -> None:
    """A record's own top level, and an embedded record's.

    Without both, every record in this family would refuse itself: the exclusions
    exist precisely so that a root-level `created_at` or `status` cannot move a
    hash, and a study record carries other whole records -- evidence nodes, which
    name their own rules, and `Quantity` envelopes, which pair a value with the
    evidence class that qualifies it -- each of which is a root in its own right.
    """
    for name in (
        "study-float-edge-cases.json",
        "study-plan-revision.json",
        "study-capsule.json",
        "study-research-package-as-written.json",
    ):
        assert_no_nested_excluded_keys(_fixture(name))
    assert_no_nested_excluded_keys(_fixture("study-evidence-graph.json"), STUDY_HASH_RULES_ID)

    embedded = {
        STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
        "id": "volatile",
        "node": {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "content_hash": "b" * 64},
        "measurement": {"value": 3, "evidence": "MODELLED", "created_at": "2026-01-01T00:00:00.000Z"},
    }
    assert_no_nested_excluded_keys(embedded)
    # And the root-level exclusions still bite, which is what they are for.
    assert calculate_study_hash(embedded) == calculate_study_hash({**embedded, "id": "different"})


def test_the_embedded_record_exemption_is_per_key_and_not_a_blanket_one() -> None:
    """Being a record is not a licence to hide arbitrary content.

    `hash_rules_id`, `content_hash` and `created_at` are the only excluded names
    any schema in this family declares below a record's root, and each is one
    whose being dropped cannot hide a difference: the marker is a single fixed
    known id, a timestamp is excluded everywhere by design, and an identity is
    recomputed from the record's own contents by the graph checks. Every other
    excluded name stays refused inside an embedded record -- otherwise an object
    that carried a marker, or merely a `value` beside an `evidence`, could hold
    an `id`, and two records differing only there would be content-addressed
    identically. This is `EMBEDDED_RECORD_EXEMPT_KEYS` in src/study/hashing.ts.
    """
    for embedded in (
        {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "id": "gpu-0"},
        {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "slug": "rack-a"},
        {"value": 1, "evidence": "MEASURED", "id": "gpu-0"},
        {"value": 1, "evidence": "MEASURED", "status": "DRAFT"},
    ):
        with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
            assert_no_nested_excluded_keys(
                {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "embedded": embedded}
            )

    # And a marker naming no known rule set is not a marker. `study_rules_id_of`
    # refuses such an id at a record's own root, so an arbitrary string one level
    # down must not buy the exemption a real record has -- which is the route by
    # which `hardware.accelerator = {"hash_rules_id": "junk", "id": ...}` once
    # hashed two different accelerators identically.
    with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
        assert_no_nested_excluded_keys(
            {
                STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
                "accelerator": {STUDY_HASH_RULES_KEY: "junk", "content_hash": "b" * 64},
            }
        )


def test_the_exclusion_set_cannot_be_added_to_at_run_time() -> None:
    """"Must stay identical to src/study/hashing.ts" is a run-time fact here.

    A plain set would let any consumer put a name on the exclusion list every
    study-v1 digest was computed under, and nothing would report it. `frozenSet`
    on this side and `frozenKeySet` on the other make the sentence true rather
    than aspirational.
    """
    assert isinstance(STUDY_EXCLUDED_KEYS, frozenset)
    assert isinstance(EMBEDDED_RECORD_EXEMPT_KEYS, frozenset)
    with pytest.raises(AttributeError):
        STUDY_EXCLUDED_KEYS.add("not-an-exclusion")  # type: ignore[attr-defined]
    assert "not-an-exclusion" not in STUDY_EXCLUDED_KEYS
    assert "id" in STUDY_EXCLUDED_KEYS


# ------------------------------------- values the two languages would not agree about


def test_an_integer_javascript_cannot_hold_exactly_is_refused_at_any_depth() -> None:
    """The bound is a property of the class, not of two fields that met it first.

    `seed` and `resource_limits.max_memory_bytes` were the only guarded numbers
    on either side. `Quantity.value` -- every number a study reports -- was not,
    and near 4.2e21 one IEEE-754 double stands for 524287 distinct integers: two
    research packages whose reported figure differed by 524286 took one digest in
    JavaScript, kept one node identity, and verified clean, while this language
    held the integers as written and computed two digests that matched neither.

    So the refusal lives in the hashing layer now and applies wherever a number
    sits. This must stay identical to `assertNoUnrepresentableValues` in
    src/study/hashing.ts, or the two languages stop refusing the same files.
    """
    low = 4199999999999999737857
    high = 4200000000000000262143
    assert float(low) == float(high), "one double, two integers 524286 apart"

    def node(value: object) -> dict:
        return {
            STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
            "kind": "quantity",
            "label": "total physical-qubit-seconds",
            "quantity": {"value": value, "unit": "qubit_seconds", "evidence": "MODELLED"},
        }

    # Written as an integer either way round, and written as the float JavaScript
    # would have held: all three are the same ambiguity and all three are refused,
    # which is what makes the two languages refuse the same *file*.
    for written in (low, high, 4.2e21, -low, 2**63):
        with pytest.raises(ValueError, match="quantity.value"):
            calculate_study_hash(node(written))
        with pytest.raises(ValueError, match="two different digests"):
            canonical_study_json(node(written))

    # The boundary is inclusive: the last integer JavaScript holds exactly is the
    # last one the two languages can agree about, and refusing it would refuse a
    # value that was never in danger.
    assert calculate_study_hash(node(9007199254740991))
    assert calculate_study_hash(node(-9007199254740991))
    # And a non-integral number of any magnitude is fine, because no second value
    # canonicalizes onto it: the refusal is about ambiguity, not about size.
    assert calculate_study_hash(node(1.5e-9))
    assert calculate_study_hash(node(0.1))
    assert calculate_study_hash(node(None))

    # A boolean is not an integer here, in either language.
    assert calculate_study_hash(node(True))


def test_a_value_under_an_excluded_key_is_not_refused_because_it_is_not_hashed() -> None:
    """The refusal is about the bytes the digest sees, and nothing else.

    `_canonicalize` drops excluded names at every depth, so a number under one
    never reaches either canonical form and cannot make them differ. Refusing a
    record for something the digest never reads would teach a caller to change a
    value that was never in danger.
    """
    record = {
        STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
        "title": "a study",
        "ui_metadata": {"row_id": 2**70},
    }
    assert calculate_study_hash(record) == calculate_study_hash(
        {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "title": "a study"}
    )


def test_an_unpaired_surrogate_is_refused_rather_than_crashing_this_verifier() -> None:
    """A byte sequence neither language can round-trip is refused in both.

    A lone `\\ud800` in a node label is legal in a JavaScript string and legal in
    JSON. That side escaped it and hashed the escape; this side held the same
    lone surrogate and raised `UnicodeEncodeError` out of the `.encode("utf-8")`
    in `calculate_study_hash`, so a recipient could not check the file at all --
    worse than two digests, because nobody is even told the two answers disagree.
    Refusing beats diverging, exactly as with the integers.
    """
    def labelled(label: str) -> dict:
        return {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "kind": "quantity", "label": label}

    # Exactly what `json.loads` produces from the escape a JavaScript writer emits.
    from_json = json.loads('{"hash_rules_id":"study-v1","label":"total qubits \\ud800"}')
    for record in (labelled("\ud800"), labelled("\udc00 total qubits"), from_json):
        with pytest.raises(ValueError, match="unpaired UTF-16 surrogate"):
            calculate_study_hash(record)
        with pytest.raises(ValueError, match="neither language can round-trip"):
            canonical_study_json(record)

    # A well-formed pair is one character and hashes normally: `json.loads` joins
    # the two escapes back into U+1F600 exactly as JavaScript does, so refusing it
    # would be refusing an emoji rather than the thing that actually breaks.
    paired = json.loads('{"hash_rules_id":"study-v1","label":"total qubits \\ud83d\\ude00"}')
    assert calculate_study_hash(paired) == calculate_study_hash(
        {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "label": "total qubits \U0001f600"}
    )

    # A key is encoded exactly as a value is, so the walk asks about keys too.
    with pytest.raises(ValueError, match="unpaired UTF-16 surrogate"):
        calculate_study_hash(
            {STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID, "notes": {"\ud800": "half a key"}}
        )


def test_a_rules_id_that_is_only_an_inherited_attribute_name_is_refused() -> None:
    """The lookup answers for known ids and for nothing else.

    On the TypeScript side the registry was an object literal, so
    `hash_rules_id: "toString"` resolved to `Function.prototype.toString` and was
    handed on as a rule set -- an internal `TypeError` where a refusal belongs,
    reported under the wrong refusal code. A dict lookup here has never had
    inherited entries, and this pins that: the two languages must refuse the same
    ids, and "the other implementation happens to be safe" is not a property
    anybody can read off the code.
    """
    for name in (
        "toString",
        "constructor",
        "__proto__",
        "keys",
        "items",
        "get",
        "__class__",
        "__init__",
    ):
        record = {STUDY_HASH_RULES_KEY: name, "title": "a study"}
        with pytest.raises(ValueError, match="Unknown study hash rules id"):
            study_rules_id_of(record)
        with pytest.raises(ValueError, match="Unknown study hash rules id"):
            calculate_study_hash(record)
        with pytest.raises(ValueError, match="Unknown study hash rules id"):
            assert_no_nested_excluded_keys(record)

    # And such a name one level down buys an object nothing either: an embedded
    # record is one that names rules this build knows.
    with pytest.raises(ValueError, match="must not carry an excluded key below its own top level"):
        assert_no_nested_excluded_keys(
            {
                STUDY_HASH_RULES_KEY: STUDY_HASH_RULES_ID,
                "accelerator": {STUDY_HASH_RULES_KEY: "toString", "id": "gpu-0"},
            }
        )


def test_non_finite_numbers_are_refused_rather_than_written_as_bare_inf() -> None:
    """A value neither language can agree on is refused, not hashed.

    ``float('inf').is_integer()`` is False, so the safe-integer rule waved all
    three non-finite values past. ``json.dumps`` then writes them as bare ``inf``
    and ``nan`` -- not JSON, and unreadable by the other implementation -- while
    JavaScript canonicalizes all three to ``null``, giving three distinct values
    one digest. Both halves are refusals now, in both languages.
    """
    for label, value in (("inf", float("inf")), ("-inf", float("-inf")), ("nan", float("nan"))):
        record = {"hash_rules_id": STUDY_HASH_RULES_ID, "kind": "probe", "value": value}
        try:
            calculate_study_hash(record)
        except ValueError as error:
            assert "not a finite number" in str(error), f"{label} refused for the wrong reason"
        else:  # pragma: no cover - the assertion below reports it
            raise AssertionError(f"{label} was hashed rather than refused")

    # The finite boundary still hashes, so the rule refuses what it must and no more.
    for value in (JS_MAX_SAFE_INTEGER, 3.0, -0.0):
        record = {"hash_rules_id": STUDY_HASH_RULES_ID, "kind": "probe", "value": value}
        assert isinstance(calculate_study_hash(record), str)


def test_a_dunder_proto_key_is_hashed_the_same_way_in_both_languages() -> None:
    """The TypeScript canonicalizer used to lose this key; the pins say it no longer does.

    ``JSON.parse`` makes ``__proto__`` an ordinary own key, but assigning it on a
    ``{}`` literal invokes the inherited setter rather than creating a property, so
    the key and everything under it disappeared from the JavaScript digest while
    this language hashed it -- one payload, two answers. The expected digests below
    were produced by the TypeScript implementation after the fix.
    """
    import json

    base = json.loads('{"hash_rules_id":"study-v1","a":1}')
    with_one = json.loads('{"hash_rules_id":"study-v1","a":1,"__proto__":{"x":1}}')
    with_two = json.loads('{"hash_rules_id":"study-v1","a":1,"__proto__":{"x":2}}')

    assert calculate_study_hash(with_one) != calculate_study_hash(base)
    assert calculate_study_hash(with_one) != calculate_study_hash(with_two)
    assert '"__proto__": {"x": 1}'.replace(" ", "") in canonical_study_json(with_one).replace(" ", "")
