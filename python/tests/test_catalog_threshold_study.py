"""Scientific validation of kq.qec.surface-code-threshold-study (surface-code-threshold-study).

The estimators are checked on synthetic counts whose threshold is known by
construction (an exact power law crossing at p_th), and the sampled sweep on
behaviour fixed by the physics (no failures without noise, suppression below
the crossing and anti-suppression above it).
"""

from __future__ import annotations

import json
import math

import pytest

pytest.importorskip("stim")
pytest.importorskip("pymatching")

from ketqat_runner import catalog  # noqa: E402
from ketqat_runner.catalog.params import ParameterError  # noqa: E402
from ketqat_runner.catalog.products import threshold_study  # noqa: E402
from ketqat_runner.catalog.products.threshold_study.collapse import finite_size_collapse  # noqa: E402
from ketqat_runner.catalog.products.threshold_study.statistics import (  # noqa: E402
    curve_crossing,
    estimate_threshold,
    suppression_table,
)
from ketqat_runner.catalog.products.threshold_study.study import run_study  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))


def _study(**overrides):
    params = {"rounds": None, "decoder": "mwpm"}
    params.update(overrides)
    return run_study(**params)


def _synthetic_points(p_th: float, distances, rates, shots: int, amplitude: float = 0.02):
    """p_L(d, p) = A (p / p_th)^((d+1)/2): every distance has p_L = A at p = p_th, so all curves cross there."""
    points = []
    for d in distances:
        for p in rates:
            rate = amplitude * (p / p_th) ** ((d + 1) / 2)
            failures = int(round(rate * shots))
            points.append({"distance": d, "physical_error_rate": p, "rounds": d, "shots": shots, "logical_failures": failures,
                           "logical_error_rate": failures / shots})
    return points


def test_crossing_estimator_recovers_a_known_threshold_from_synthetic_counts() -> None:
    p_th = 0.0093
    rates = [0.004, 0.006, 0.008, 0.01, 0.012, 0.014]
    points = _synthetic_points(p_th, [3, 5, 7], rates, shots=10_000_000)
    estimate = estimate_threshold(points, resamples=60, seed=1)
    assert not estimate["inconclusive"]
    # Log-log interpolation is exact for a power law; only integer rounding of the counts remains.
    assert estimate["value"] == pytest.approx(p_th, rel=1e-3)
    for pair in estimate["pairs"]:
        assert pair["crossing"] == pytest.approx(p_th, rel=1e-3)
        assert pair["bootstrap"]["lower"] <= pair["crossing"] <= pair["bootstrap"]["upper"]
    boot = estimate["bootstrap"]
    assert boot["lower"] <= p_th <= boot["upper"]
    assert boot["resamples_with_all_crossings"] == 60


def test_crossing_is_exact_for_an_exact_power_law_without_rounding() -> None:
    p_th = 0.011
    rates = [0.005, 0.008, 0.012, 0.02]
    low = [0.02 * (p / p_th) ** 2 for p in rates]
    high = [0.02 * (p / p_th) ** 3 for p in rates]
    assert curve_crossing(rates, low, high)["crossing"] == pytest.approx(p_th, rel=1e-12)


def test_crossing_refuses_when_curves_never_cross() -> None:
    rates = [0.002, 0.004, 0.006]
    found = curve_crossing(rates, [0.01, 0.02, 0.03], [0.001, 0.004, 0.009])
    assert found["crossing"] is None and "above the largest rate" in found["reason"]
    found = curve_crossing(rates, [0.001, 0.002, 0.003], [0.01, 0.02, 0.03])
    assert found["crossing"] is None and "below the smallest rate" in found["reason"]
    assert curve_crossing(rates, [0.0, 0.0, 0.01], [0.0, 0.0, 0.02])["crossing"] is None


def test_suppression_factors_and_collapse_on_synthetic_data() -> None:
    p_th = 0.01
    rates = [0.004, 0.006, 0.008, 0.01, 0.012, 0.014]
    points = _synthetic_points(p_th, [3, 5, 7], rates, shots=1_000_000)
    rows = suppression_table(points)
    assert len(rows) == 2 * len(rates)
    for row in rows:
        expected = p_th / row["physical_error_rate"]  # ratio of (p/p_th)^((d+1)/2) between d and d+2
        assert row["value"] == pytest.approx(expected, rel=2e-2)
        assert row["lower"] < row["value"] < row["upper"]
        assert (row["value"] > 1) == (row["physical_error_rate"] < p_th)
    collapse = finite_size_collapse(points, rate_bounds=(rates[0], rates[-1]))
    assert collapse["available"]
    assert collapse["threshold"] == pytest.approx(p_th, abs=5e-4)
    assert collapse["chi_square_reduced"] is not None and collapse["r_squared"] > 0.95


def test_no_noise_gives_no_failures_and_an_honest_inconclusive_estimate() -> None:
    result = _study(distances=[3, 5], physical_error_rates=[0.0, 0.001], shots_per_point=200, seed=3, bootstrap_resamples=10)
    noiseless = [p for p in result["points"] if p["physical_error_rate"] == 0.0]
    assert len(noiseless) == 2
    for point in noiseless:
        assert point["logical_failures"] == 0 and point["logical_error_rate"] == 0.0 and point["is_upper_bound_only"]
        assert point["confidence_interval"]["upper"] > 0
    assert result["threshold_estimate"]["inconclusive"] is True
    assert result["threshold_estimate"]["value"] is None
    assert result["finite_size_collapse"]["available"] is False
    json.dumps(result, allow_nan=False)


def test_tiny_real_run_shows_suppression_below_the_estimated_threshold() -> None:
    """d = 3 and 5, 3000 shots per point: the crossing is found and Lambda > 1 below it.

    The seed is fixed, as in the surface-code-memory product's own distance-scaling
    validation: with rounds = d the d = 3 and d = 5 rates differ by only ~1.5x just
    below threshold, so a few hundred shots cannot resolve the ordering for every
    seed (9 of 10 seeds pass at these settings; 6 of 10 at 400 shots).
    """
    result = _study(distances=[3, 5], physical_error_rates=[0.004, 0.008, 0.016, 0.03], shots_per_point=3000,
                    seed=1, bootstrap_resamples=40)
    estimate = result["threshold_estimate"]
    assert not estimate["inconclusive"], estimate.get("reason")
    assert 0.004 < estimate["value"] < 0.03
    below = [row for row in result["suppression_factors"] if row["physical_error_rate"] < estimate["value"] and row["value"] is not None]
    assert below, "no rate below the estimate had failures at both distances"
    for row in below:
        assert row["value"] > 1, row
    above = [row for row in result["suppression_factors"] if row["physical_error_rate"] > estimate["value"] and row["value"] is not None]
    assert above and all(row["value"] < 1 for row in above)
    assert "# Surface-code threshold study" in result["report"]


def test_a_point_reproduces_the_surface_code_memory_product() -> None:
    from ketqat_runner.catalog.products import surface_code

    result = _study(distances=[3, 5], physical_error_rates=[0.006, 0.01], shots_per_point=300, seed=11, bootstrap_resamples=5)
    for point in result["points"]:
        free = surface_code.run({"distance": point["distance"], "rounds": None, "physical_error_rate": point["physical_error_rate"],
                                 "basis": "z", "shots": 300, "decoder": "pymatching"}, seed=11)
        assert free["logical_failures"] == point["logical_failures"]
        assert free["coordinate_seed"] == point["coordinate_seed"]
        # The study rounds floats to 12 decimals for the result hash; surface-code-memory does not.
        assert point["confidence_interval"]["lower"] == pytest.approx(free["confidence_interval"]["lower"], abs=1e-11)
        assert point["confidence_interval"]["upper"] == pytest.approx(free["confidence_interval"]["upper"], abs=1e-11)


def test_catalog_run_is_reproducible_and_matches_the_definition() -> None:
    params = {"distances": [3, 5], "physical_error_rates": [0.005, 0.01], "shots_per_point": 100}
    a = catalog.run("surface-code-threshold-study@1.1.0", seed=5, **params)
    b = catalog.run("surface-code-threshold-study@1.1.0", seed=5, **params)
    assert a.result_sha256 == b.result_sha256
    assert a.result["schema"] == "ketqat.pro.surface-code-threshold-study/v1"  # historical identifier, kept for hash parity
    assert not any(key.startswith("_") for key in a.result["points"][0])
    definition = catalog.get_product("surface-code-threshold-study").definition
    assert tuple(field["name"] for field in definition["inputs"]) == threshold_study.INPUTS
    declared = {field["name"] for field in definition["outputs"]}
    assert declared <= set(a.result) and set(threshold_study.OUTPUTS) == declared


def test_validate_enforces_the_contract() -> None:
    good = {"distances": [3, 5], "physical_error_rates": [0.006, 0.012], "shots_per_point": 200, "rounds": None, "decoder": "mwpm"}
    threshold_study.validate(good)
    with pytest.raises(ParameterError, match="odd"):
        threshold_study.validate({**good, "distances": [3, 6]})
    with pytest.raises(ParameterError, match="repeat"):
        threshold_study.validate({**good, "physical_error_rates": [0.01, 0.01]})
    with pytest.raises(ParameterError, match="GiB"):
        threshold_study.validate({**good, "distances": [3, 25], "shots_per_point": 10_000_000})
    with pytest.raises(ParameterError, match="unsupported"):
        threshold_study.validate({**good, "bootstrap_resamples": 5})
    with pytest.raises(ParameterError, match="odd"):
        catalog.run("surface-code-threshold-study", distances=[3, 6], shots_per_point=10)
    assert math.isfinite(threshold_study.MAX_TOTAL_SAMPLE_BYTES)
