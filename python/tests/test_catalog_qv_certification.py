"""Scientific validation of kq.qinfo.quantum-volume-certification (quantum-volume-certification).

The pass rule is checked against hand-computed bounds, the noise model against
its exact linear action on the heavy-output probability, the finite-shot
sampling against the exact noisy values, and the end-to-end certification
against outcomes fixed by the protocol (small noiseless widths pass, a nearly
depolarized device fails).
"""

from __future__ import annotations

import math

import pytest

np = pytest.importorskip("numpy")

from ketqat_runner import catalog  # noqa: E402
from ketqat_runner.catalog.params import ParameterError  # noqa: E402
from ketqat_runner.catalog.products import qv_certification  # noqa: E402
from ketqat_runner.catalog.products.qv_certification.certification import achieved_quantum_volume, certify  # noqa: E402
from ketqat_runner.catalog.products.qv_certification.protocol import sample_width  # noqa: E402
from ketqat_runner.catalog.products.qv_certification.study import run_certification  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))


def test_the_pass_rule_matches_a_hand_computed_example() -> None:
    """h = 0.75: with 100 circuits the bound is 0.75 - 2 sqrt(0.1875 / 100) = 0.6634 < 2/3, with 200 it is 0.6888 > 2/3."""
    fail = certify([0.75] * 100)
    assert fail["heavy_output_probability"] == 0.75
    assert fail["two_sigma_lower_bound"] == pytest.approx(0.75 - 2 * math.sqrt(0.75 * 0.25 / 100), abs=1e-12)
    assert fail["two_sigma_lower_bound"] == pytest.approx(0.6634, abs=5e-5)
    assert fail["passed"] is False and fail["meets_protocol_minimum_circuits"] is True
    ok = certify([0.75] * 200)
    assert ok["two_sigma_lower_bound"] == pytest.approx(0.68876, abs=5e-5)
    assert ok["passed"] is True
    strong = certify([0.8] * 100)
    assert strong["two_sigma_lower_bound"] == pytest.approx(0.72, abs=1e-12)
    assert strong["passed"] is True
    # The mean is the mean of per-circuit heavy fractions, not of pooled counts.
    mixed = certify([0.9] * 50 + [0.6] * 50)
    assert mixed["heavy_output_probability"] == pytest.approx(0.75)
    assert certify([0.9])["passed"] is False
    assert certify([1.0] * 10)["passed"] is True  # sigma = 0, bound = 1


def test_noiseless_heavy_output_probability_at_small_width_is_above_two_thirds() -> None:
    """Widths 2 and 3 pass without noise. The asymptote (1 + ln 2)/2 is not claimed at these widths."""
    result = run_certification(widths=[2, 3], circuits_per_width=100, shots=200, depolarizing_rate=0.0, seed=5, bootstrap_resamples=50)
    for entry in result["per_width"]:
        cert = entry["certification"]
        assert cert["heavy_output_probability"] > 2 / 3
        assert cert["passed"] is True, cert
        assert entry["mean_ideal_heavy_output_probability"] > 2 / 3
        assert entry["bootstrap_interval"]["lower"] > 2 / 3
    assert result["achieved_quantum_volume"] == 8
    assert result["certification"]["all_smaller_widths_pass"] is True
    assert result["meets_protocol_minimum_circuits"] is True


def test_strong_depolarizing_fails_certification() -> None:
    """At rate 0.8 the heavy-output probability is 0.5 + 0.2 (h_ideal - 0.5) ~ 0.57 < 2/3."""
    result = run_certification(widths=[3], circuits_per_width=60, shots=200, depolarizing_rate=0.8, seed=1, bootstrap_resamples=20)
    cert = result["per_width"][0]["certification"]
    assert cert["passed"] is False
    assert cert["heavy_output_probability"] < 2 / 3
    assert result["achieved_quantum_volume"] is None
    assert result["certification"]["failing_widths"] == [3]
    assert "No tested width passes" in result["certification"]["interpretation"]
    assert result["meets_protocol_minimum_circuits"] is False


def test_finite_shot_heavy_fractions_agree_with_the_exact_noisy_values() -> None:
    circuits = sample_width(width=4, circuits=40, shots=400, depolarizing_rate=0.2, seed=9)
    sampled = np.array([c["heavy_fraction"] for c in circuits])
    exact = np.array([c["exact_noisy_heavy_output_probability"] for c in circuits])
    ideal = np.array([c["ideal_heavy_output_probability"] for c in circuits])
    # Global depolarizing toward uniform moves the heavy probability linearly to 0.5.
    assert np.allclose(exact, 0.8 * ideal + 0.2 * 0.5, atol=1e-12)
    # Per-circuit shot noise is sqrt(h(1-h)/400) ~ 0.02; the mean over 40 circuits is within a few of that / sqrt(40).
    assert abs(sampled.mean() - exact.mean()) < 3 * 0.025 / math.sqrt(40)
    assert all(0 <= c["heavy_count"] <= 400 for c in circuits)


def test_achieved_quantum_volume_is_two_to_the_largest_passing_width_with_a_monotonicity_flag() -> None:
    def entry(width, passed):
        return {"width": width, "certification": {"passed": passed}}

    summary = achieved_quantum_volume([entry(2, True), entry(3, True), entry(4, False)])
    assert summary["achieved_quantum_volume"] == 8 and summary["max_passing_width"] == 3
    assert summary["all_smaller_widths_pass"] is True and summary["failing_widths"] == [4]
    gap = achieved_quantum_volume([entry(2, True), entry(3, False), entry(4, True)])
    assert gap["achieved_quantum_volume"] == 16 and gap["all_smaller_widths_pass"] is False
    assert "not monotone" in gap["interpretation"]
    sparse = achieved_quantum_volume([entry(2, True), entry(5, True)])
    assert sparse["achieved_quantum_volume"] == 32 and "not tested consecutively" in sparse["interpretation"]
    none = achieved_quantum_volume([entry(2, False)])
    assert none["achieved_quantum_volume"] is None and none["all_smaller_widths_pass"] is None


def test_catalog_run_is_reproducible_and_matches_the_definition() -> None:
    params = {"widths": [2, 3], "circuits_per_width": 10, "shots": 50, "depolarizing_rate": 0.1}
    a = catalog.run("quantum-volume-certification@1.1.0", seed=4, **params)
    b = catalog.run("quantum-volume-certification@1.1.0", seed=4, **params)
    assert a.result_sha256 == b.result_sha256
    assert a.result["schema"] == "ketqat.pro.quantum-volume-certification/v1"  # historical identifier, kept for hash parity
    assert "# Quantum volume certification" in a.result["report"]
    assert a.result["per_width"][0]["per_circuit"][0]["circuit_seed"] != a.result["per_width"][1]["per_circuit"][0]["circuit_seed"]
    definition = catalog.get_product("quantum-volume-certification").definition
    assert tuple(field["name"] for field in definition["inputs"]) == qv_certification.INPUTS
    declared = {field["name"] for field in definition["outputs"]}
    assert declared <= set(a.result) and set(qv_certification.OUTPUTS) == declared


def test_validate_enforces_the_contract() -> None:
    good = {"widths": [2, 3], "circuits_per_width": 10, "shots": 50, "depolarizing_rate": 0.1}
    qv_certification.validate(good)
    with pytest.raises(ParameterError, match="widths"):
        qv_certification.validate({**good, "widths": [2, 13]})
    with pytest.raises(ParameterError, match="repeat"):
        qv_certification.validate({**good, "widths": [3, 3]})
    with pytest.raises(ParameterError, match="exceeds"):
        qv_certification.validate({**good, "widths": [10, 11, 12], "circuits_per_width": 2000})
    with pytest.raises(ParameterError, match="unsupported"):
        qv_certification.validate({**good, "bootstrap_resamples": 5})
    with pytest.raises(ParameterError, match="exceeds"):
        catalog.run("quantum-volume-certification", widths=[10, 11, 12], circuits_per_width=2000)
