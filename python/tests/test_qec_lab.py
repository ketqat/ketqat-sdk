"""Tests for decoder adapters, QEC statistics, and the code catalog."""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from ketqat_runner.decoders import DecoderError, LookupTableDecoder, PyMatchingDecoder, resolve_decoder
from ketqat_runner.qec_codes import CATALOG, assess_suitability, codes_in_family, get_code
from ketqat_runner.qec_statistics import (
    COMPARABILITY_FIELDS,
    latency_comparable,
    latency_percentiles,
    logical_error_rate_summary,
    runs_are_comparable,
    suppression_factor,
    wilson_interval,
)
from ketqat_runner.runner import run_experiment

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def _load_manifest(name: str) -> dict:
    import yaml

    return yaml.safe_load((REPOSITORY_ROOT / "examples" / "qec" / name).read_text())


# --- Statistics -------------------------------------------------------------


def test_wilson_interval_matches_known_values() -> None:
    # 50/100 at 95%: the textbook Wilson interval is approximately [0.404, 0.596].
    lower, upper = wilson_interval(50, 100)
    assert math.isclose(lower, 0.4038, abs_tol=1e-3)
    assert math.isclose(upper, 0.5962, abs_tol=1e-3)
    # The interval always brackets the point estimate and stays inside [0, 1].
    for failures, shots in ((0, 10), (1, 10), (10, 10), (3, 1000)):
        low, high = wilson_interval(failures, shots)
        assert 0.0 <= low <= failures / shots <= high <= 1.0


def test_zero_failures_is_an_upper_bound_not_a_rate_of_zero() -> None:
    summary = logical_error_rate_summary(0, 10_000)
    assert summary["logical_error_rate"] == 0.0
    assert summary["is_upper_bound_only"] is True
    # The upper bound must be strictly positive: observing no failure does not
    # establish that the error rate is zero.
    assert summary["confidence_interval_upper"] > 0
    assert "not zero" in summary["interpretation"]

    observed = logical_error_rate_summary(5, 10_000)
    assert observed["is_upper_bound_only"] is False
    assert "interpretation" not in observed


def test_wilson_interval_rejects_impossible_inputs() -> None:
    with pytest.raises(ValueError):
        wilson_interval(1, 0)
    with pytest.raises(ValueError):
        wilson_interval(11, 10)
    with pytest.raises(ValueError):
        wilson_interval(-1, 10)


def test_suppression_factor_declines_to_divide_by_an_unobserved_rate() -> None:
    assert suppression_factor(0.1, 0.01) == pytest.approx(10.0)
    # A suppression factor against zero observed failures would be an artifact
    # of the shot budget, not a measurement.
    assert suppression_factor(0.1, 0.0) is None


def test_latency_percentiles_report_the_tail() -> None:
    samples = [1.0] * 95 + [50.0] * 5
    percentiles = latency_percentiles(samples)
    assert percentiles["p50_ms"] == pytest.approx(1.0)
    assert percentiles["p99_ms"] > percentiles["p50_ms"]
    assert percentiles["max_ms"] == 50.0
    # A mean would hide the tail entirely; the percentiles do not.
    assert percentiles["p95_ms"] < percentiles["max_ms"]
    assert latency_percentiles([]) == {}


# --- Comparability ----------------------------------------------------------


def _run_record(**overrides) -> dict:
    record = {
        "benchmark_suite": "surface-code-memory-decoder-comparison",
        "benchmark_suite_version": "0.1.0",
        "code_family": "rotated-surface-code",
        "code_distance": 3,
        "rounds": 3,
        "physical_error_rate": 0.01,
        "noise_model": "circuit-level-depolarizing",
        "stopping_rule": "fixed_shots=2000",
        "decoder_version": "2.2.1",
        "cpu": "test-cpu",
        "thread_count": 1,
        "gpu": None,
    }
    record.update(overrides)
    return record


def test_runs_differing_in_any_key_field_are_not_comparable() -> None:
    base = _run_record()
    assert runs_are_comparable(base, _run_record())["comparable"] is True

    for field in COMPARABILITY_FIELDS:
        other = _run_record(**{field: "different-value"})
        result = runs_are_comparable(base, other)
        assert result["comparable"] is False, f"{field} must block comparison"
        assert any(field in reason for reason in result["reasons"])


def test_latency_comparison_additionally_requires_the_same_machine() -> None:
    base = _run_record()
    faster_host = _run_record(cpu="a-much-faster-cpu")
    # Accuracy is still comparable across machines...
    assert runs_are_comparable(base, faster_host)["comparable"] is True
    # ...but latency is not: a faster host is not a better decoder.
    latency = latency_comparable(base, faster_host)
    assert latency["comparable"] is False
    assert any("property of the machine" in reason for reason in latency["reasons"])
    assert latency_comparable(base, _run_record())["comparable"] is True


# --- Code catalog -----------------------------------------------------------


def test_catalog_exposes_families_and_rejects_unknown_codes() -> None:
    surface = get_code("rotated-surface-code-memory-x")
    assert "SURFACE" in surface.families
    assert "CSS" in surface.families
    assert surface.stim_generator == "surface_code:rotated_memory_x"
    assert len(codes_in_family("SURFACE")) >= 3
    assert codes_in_family("COLOR")
    with pytest.raises(KeyError):
        get_code("not-a-code")


def test_repetition_code_records_that_it_is_not_a_full_quantum_code() -> None:
    code = get_code("repetition-code-memory")
    assert any("one error type" in note for note in code.notes)


def test_suitability_is_derived_from_capabilities_and_lists_blockers() -> None:
    surface = get_code("rotated-surface-code-memory-x")

    capable = assess_suitability(surface, {"mid_circuit_measurement": True})
    assert capable["level"] == "THEORETICALLY_SUITABLE"
    assert capable["blockers"] == []
    # Capability matching is never presented as an experimental result.
    assert "not an experimental result" in capable["evidence"]

    incapable = assess_suitability(surface, {"mid_circuit_measurement": False})
    assert incapable["level"] == "INCOMPATIBLE_UNDER_ASSUMPTIONS"
    assert any("mid-circuit measurement" in blocker for blocker in incapable["blockers"])


# --- Decoder adapters -------------------------------------------------------


def test_unknown_decoder_is_rejected_rather_than_defaulted() -> None:
    with pytest.raises(DecoderError, match="Unknown decoder"):
        resolve_decoder("definitely-not-a-decoder")
    # Aliases resolve to the canonical adapter.
    assert isinstance(resolve_decoder("mwpm"), PyMatchingDecoder)
    assert isinstance(resolve_decoder("lookup"), LookupTableDecoder)
    assert resolve_decoder("pymatching").name == "pymatching"


def test_lookup_decoder_rejects_a_nonsensical_fault_weight() -> None:
    with pytest.raises(DecoderError):
        LookupTableDecoder(max_fault_weight=0)


def test_two_decoders_benchmark_the_same_samples_and_report_intervals() -> None:
    manifest = _load_manifest("decoder-comparison.yaml")
    manifest["sampling"]["shots"] = 300
    result = run_experiment(manifest)

    decoders = {point["metadata"]["decoder"] for point in result["metric_points"]}
    assert decoders == {"pymatching", "ketqat-lookup"}

    # Both decoders decoded the identical sample set, so their coordinate seed
    # and shot count match. Anything else would make the comparison unfair.
    seeds = {point["seed"] for point in result["metric_points"]}
    shots = {point["shots"] for point in result["metric_points"]}
    assert len(seeds) == 1
    assert shots == {300}

    for point in result["metric_points"]:
        metadata = point["metadata"]
        # Every rate carries an interval and the method that produced it.
        assert metadata["interval_method"] == "wilson_score"
        assert metadata["confidence_interval_lower"] <= point["logical_error_rate"]
        assert point["logical_error_rate"] <= metadata["confidence_interval_upper"]
        # Assumptions travel with the measurement.
        assert metadata["decoder_assumptions"]["algorithm"]
        assert metadata["comparability_key_fields"] == list(COMPARABILITY_FIELDS)
        # Model preparation is reported apart from inference time.
        assert metadata["decoder_preparation_seconds"] >= 0.0

    lookup = next(p for p in result["metric_points"] if p["metadata"]["decoder"] == "ketqat-lookup")
    assumptions = lookup["metadata"]["decoder_assumptions"]
    # The truncation bound is the decoder's defining assumption, and abstentions
    # are reported separately from wrong predictions.
    assert assumptions["max_fault_weight"] == 2
    assert assumptions["abstentions"] >= 0
    assert "abstains" in assumptions["abstention_note"]

    # Only the lookup decoder precomputes, so only it reports preparation time.
    matching = next(p for p in result["metric_points"] if p["metadata"]["decoder"] == "pymatching")
    assert matching["metadata"]["decoder_preparation_seconds"] == 0.0
    assert lookup["metadata"]["decoder_preparation_seconds"] > 0.0


def test_unknown_code_family_is_rejected_rather_than_silently_substituted() -> None:
    manifest = _load_manifest("decoder-comparison.yaml")
    manifest["qec"]["code"]["family"] = "not-a-real-code"
    manifest["sampling"]["shots"] = 10
    with pytest.raises(Exception, match="Unsupported QEC code family"):
        run_experiment(manifest)


def test_repetition_code_runs_through_the_same_pipeline() -> None:
    manifest = _load_manifest("decoder-comparison.yaml")
    manifest["qec"]["code"]["family"] = "repetition-code"
    manifest["qec"]["decoders"] = [{"name": "pymatching"}]
    manifest["sampling"]["shots"] = 200
    result = run_experiment(manifest)
    assert result["metric_points"]
    assert result["metric_points"][0]["metadata"]["decoder"] == "pymatching"


def test_single_decoder_manifests_still_work_unchanged() -> None:
    manifest = _load_manifest("surface-code-memory.yaml")
    result = run_experiment(manifest)
    # The pre-existing backend string is preserved, so stored runs stay
    # comparable with new ones.
    assert result["metric_points"][0]["metadata"]["backend"] == "stim-pymatching"
    assert result["metric_points"][0]["metadata"]["decoder"] == "pymatching"


def test_packaged_and_repository_examples_stay_in_sync() -> None:
    from importlib import resources

    packaged = resources.files("ketqat_runner").joinpath("examples", "decoder-comparison.yaml")
    assert packaged.is_file()
    assert packaged.read_text() == (REPOSITORY_ROOT / "examples" / "qec" / "decoder-comparison.yaml").read_text()


# --- Cross-language catalog parity -------------------------------------------


def test_catalog_is_loaded_from_the_generated_single_source() -> None:
    """The Python catalog must be the generated file, not a second copy.

    Two hand-maintained copies drift, and a drifted scientific catalog looks
    authoritative while being wrong.
    """
    generated = json.loads((REPOSITORY_ROOT / "schemas" / "qec-code-catalog.json").read_text())
    generated_slugs = {entry["slug"] for entry in generated["codes"]}
    assert generated_slugs == set(CATALOG), "Python catalog must match the generated source exactly"

    for entry in generated["codes"]:
        code = get_code(entry["slug"])
        assert code.name == entry["name"]
        assert list(code.families) == entry["families"]
        assert code.stim_generator == entry.get("stim_generator")
        assert list(code.supported_distances) == entry.get("supported_distances", [])
        assert code.requires_mid_circuit_measurement == entry.get(
            "requires_mid_circuit_measurement", True
        )


def test_packaged_catalog_matches_the_repository_catalog() -> None:
    """The wheel's copy is what actually loads, so it must not drift either."""
    from importlib import resources

    packaged = resources.files("ketqat_runner").joinpath("schemas", "qec-code-catalog.json")
    assert packaged.is_file()
    assert json.loads(packaged.read_text()) == json.loads(
        (REPOSITORY_ROOT / "schemas" / "qec-code-catalog.json").read_text()
    )


def test_python_and_typescript_suitability_agree() -> None:
    """Both languages derive suitability from the same catalog and rules.

    Runs the TypeScript implementation through node and compares its verdict
    with this module's, so a divergence fails here rather than showing a user
    two different answers for the same device.
    """
    import subprocess

    if not (REPOSITORY_ROOT / "node_modules" / "zod").is_dir():
        pytest.skip(
            "JavaScript dependencies are not installed, so the TypeScript side cannot be run. "
            "CI installs them precisely so this parity check is not skipped there."
        )

    capability_sets = [
        {"mid_circuit_measurement": True},
        {"mid_circuit_measurement": False},
        {"mid_circuit_measurement": True, "feed_forward": True},
        {},
    ]

    script = """
import { QEC_CODE_CATALOG, assessQecSuitability } from '../dist/index.js'
const capabilities = JSON.parse(process.argv[2])
const out = {}
for (const code of QEC_CODE_CATALOG) {
  const result = assessQecSuitability(code, capabilities)
  out[code.slug] = { level: result.level, blockers: result.blockers }
}
process.stdout.write(JSON.stringify(out))
"""
    (REPOSITORY_ROOT / "tests" / "_suitability_parity.mjs").write_text(script)
    try:
        for capabilities in capability_sets:
            completed = subprocess.run(
                ["node", "tests/_suitability_parity.mjs", json.dumps(capabilities)],
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                check=True,
            )
            typescript = json.loads(completed.stdout)
            for slug, expected in typescript.items():
                actual = assess_suitability(get_code(slug), capabilities)
                assert actual["level"] == expected["level"], (
                    f"{slug} under {capabilities}: python said {actual['level']}, "
                    f"typescript said {expected['level']}"
                )
                assert actual["blockers"] == expected["blockers"]
    finally:
        (REPOSITORY_ROOT / "tests" / "_suitability_parity.mjs").unlink(missing_ok=True)
