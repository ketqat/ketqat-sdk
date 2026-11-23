"""Scientific validation of kq.qinfo.randomized-benchmarking-suite (randomized-benchmarking-suite).

The simulated device is gate-independent depolarizing noise, whose RB decay
is known in closed form: lambda = 1 - p d^2/(d^2-1) and r = p d/(d+1). The
fits, the interleaved gate error and the addressability error are checked
against those values, the fit against exact synthetic decays, and the sampled
means against `randomized_benchmarking.survival_probability`.
"""

from __future__ import annotations

import pytest

pytest.importorskip("stim")
pytest.importorskip("numpy")

from ketqat_runner import catalog  # noqa: E402
from ketqat_runner.catalog.params import ParameterError  # noqa: E402
from ketqat_runner.catalog.products import rb_suite  # noqa: E402
from ketqat_runner.catalog.products.rb_suite.analysis import analytic_decay, analytic_error_per_clifford, run_suite  # noqa: E402
from ketqat_runner.catalog.products.rb_suite.fitting import fit_decay  # noqa: E402
from ketqat_runner.catalog.products.rb_suite.sampling import build_interleaved_sequence, collect_standard  # noqa: E402

LENGTHS = [1, 2, 4, 8, 16, 32, 64]


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))


def _suite(**overrides):
    params = {"qubits": 1, "sequence_lengths": LENGTHS, "sequences_per_length": 25, "depolarizing_rate": 0.01, "shots": 200,
              "bootstrap_resamples": 60, "seed": 11}
    params.update(overrides)
    return run_suite(**params)


@pytest.mark.parametrize("qubits,rate", [(1, 0.01), (1, 0.003), (2, 0.005)])
def test_error_per_clifford_matches_the_depolarizing_model(qubits, rate) -> None:
    """r = (d-1)/d (1 - lambda) with lambda = 1 - p d^2/(d^2-1): 2p/3 on one qubit, 4p/5 on two."""
    lengths = LENGTHS if qubits == 1 else [1, 2, 4, 8, 16, 32]
    result = _suite(qubits=qubits, depolarizing_rate=rate, sequence_lengths=lengths, sequences_per_length=25 if qubits == 1 else 15)
    dimension = 2**qubits
    expected = rate * dimension / (dimension + 1)
    assert analytic_error_per_clifford(rate, dimension) == pytest.approx(expected)
    assert analytic_decay(rate, dimension) == pytest.approx(1 - rate * dimension**2 / (dimension**2 - 1))
    fit = result["standard"]["fit"]
    assert not fit["inconclusive"], fit.get("reason")
    assert abs(result["error_per_clifford"] - expected) < 0.2 * expected, (result["error_per_clifford"], expected)
    interval = result["standard"]["bootstrap"]["error_per_clifford"]
    half = (interval["upper"] - interval["lower"]) / 2
    assert interval["lower"] - half <= expected <= interval["upper"] + half
    # The linearized fit of randomized_benchmarking and the nonlinear fit agree on the same data.
    linear = result["standard"]["linearized_fit"]
    assert not linear["inconclusive"]
    assert abs(linear["error_per_clifford"] - result["error_per_clifford"]) < 0.25 * expected


def test_no_noise_gives_decay_parameter_exactly_one() -> None:
    result = _suite(depolarizing_rate=0.0, sequences_per_length=5, bootstrap_resamples=5)
    assert result["decay_parameter"] == 1.0
    assert result["error_per_clifford"] == 0.0
    for point in result["standard"]["points"]:
        assert point["survival_probability"] == 1.0
    assert result["standard"]["bootstrap"]["decay_parameter"]["lower"] == 1.0


def test_nonlinear_fit_recovers_an_exact_decay() -> None:
    for lam in (0.9, 0.99, 0.999):
        points = [{"sequence_length": m, "survival_probability": 0.5 * lam**m + 0.5, "standard_error": 0.001} for m in LENGTHS]
        fit = fit_decay(points, 2)
        assert not fit["inconclusive"]
        assert fit["decay_parameter"] == pytest.approx(lam, abs=1e-9)
        assert fit["amplitude"] == pytest.approx(0.5, abs=1e-8)
        assert fit["error_per_clifford"] == pytest.approx(0.5 * (1 - lam), abs=1e-9)


def test_per_length_means_equal_the_sdk_survival_probability() -> None:
    from ketqat_runner.randomized_benchmarking import survival_probability

    points = collect_standard(qubits=1, lengths=[1, 4, 16], sequences=6, rate=0.01, shots=100, seed=5)
    for point in points:
        reference = survival_probability(qubits=1, length=point["sequence_length"], depolarizing_rate=0.01, sequences=6, shots=100, seed=5)
        assert point["survival_probability"] == reference["survival_probability"]
        assert point["standard_error"] == pytest.approx(reference["standard_error"], abs=1e-12)


@pytest.mark.parametrize("qubits,gate", [(1, "i"), (1, "x"), (1, "h"), (1, "s"), (2, "h"), (2, "z")])
def test_interleaved_builder_matches_the_sdk_builder_at_equal_rates(qubits, gate) -> None:
    from ketqat_runner.randomized_benchmarking import build_interleaved_sequence as sdk_builder

    for seed in (1, 2, 3):
        mine = build_interleaved_sequence(qubits, 6, 0.01, seed, gate, 0.01)
        assert str(mine) == str(sdk_builder(qubits, 6, 0.01, seed, gate))
    noiseless = build_interleaved_sequence(qubits, 8, 0.0, 4, gate, 0.0)
    samples = noiseless.compile_sampler(seed=4).sample(shots=50)
    assert not samples.any()


def test_a_cx_interleaved_sequence_still_inverts_without_noise() -> None:
    circuit = build_interleaved_sequence(2, 10, 0.0, 9, "cx", 0.0)
    assert "CX" in str(circuit)
    assert not circuit.compile_sampler(seed=9).sample(shots=50).any()


def test_interleaved_estimate_of_an_ideal_gate_is_zero_within_its_bound() -> None:
    """Noisy Cliffords around a noiseless gate: the estimate must be consistent with zero."""
    result = _suite(interleaved_gate="x", interleaved_gate_depolarizing_rate=0.0, sequence_lengths=[1, 2, 4, 8, 16, 32], sequences_per_length=25)
    estimate = result["interleaved"]["gate_error"]
    assert not estimate["inconclusive"]
    assert abs(estimate["gate_error"]) <= estimate["systematic_bound"], estimate
    interval = result["interleaved"]["gate_error_bootstrap"]
    assert interval["lower"] <= 0.0 <= interval["upper"] + 1e-9 or abs(estimate["gate_error"]) < 1e-3
    assert result["interleaved"]["analytic_expectation"]["gate_error"] == 0.0


def test_interleaved_estimate_of_a_noisy_gate_matches_its_own_rate() -> None:
    """Cliffords at p = 0.01, the gate at q = 0.03: r_gate = 2q/3 on one qubit."""
    result = _suite(interleaved_gate="h", interleaved_gate_depolarizing_rate=0.03, sequence_lengths=[1, 2, 4, 8, 16, 32], sequences_per_length=25)
    estimate = result["interleaved"]["gate_error"]
    expected = 2 * 0.03 / 3
    assert not estimate["inconclusive"]
    assert abs(estimate["gate_error"] - expected) < 0.3 * expected, (estimate["gate_error"], expected)
    assert result["interleaved"]["analytic_expectation"]["gate_error"] == pytest.approx(expected)


def test_addressability_is_zero_without_crosstalk_and_positive_with_it() -> None:
    # Lengths and sequences are kept small because the simultaneous builder costs ~5 ms per step.
    quiet = _suite(simultaneous_crosstalk_rate=0.0, sequence_lengths=[1, 2, 4, 8, 16], depolarizing_rate=0.004, sequences_per_length=15)
    assert abs(quiet["simultaneous"]["mean_addressability_error"]) < 2e-3, quiet["simultaneous"]["mean_addressability_error"]
    loud = _suite(simultaneous_crosstalk_rate=0.03, sequence_lengths=[1, 2, 4, 8, 16], depolarizing_rate=0.004, sequences_per_length=15)
    measured = loud["simultaneous"]["mean_addressability_error"]
    expected = loud["simultaneous"]["analytic_expectation"]["addressability_error"]
    assert expected == pytest.approx(0.5 * (1 - 4 * 0.004 / 3) * 16 * 0.03 / 15)
    assert measured > 0.005
    assert abs(measured - expected) < 0.5 * expected, (measured, expected)
    for q in loud["simultaneous"]["per_qubit"]:
        assert not q["addressability"]["inconclusive"]
        assert q["addressability_bootstrap"]["lower"] > 0


def test_catalog_run_is_reproducible_and_matches_the_definition() -> None:
    params = {"sequence_lengths": [1, 4, 16], "sequences_per_length": 4, "shots": 50, "interleaved_gate": "x",
              "simultaneous_crosstalk_rate": 0.01}
    a = catalog.run("randomized-benchmarking-suite@1.1.0", seed=3, **params)
    b = catalog.run("randomized-benchmarking-suite@1.1.0", seed=3, **params)
    assert a.result_sha256 == b.result_sha256
    assert a.result["schema"] == "ketqat.pro.randomized-benchmarking-suite/v1"  # historical identifier, kept for hash parity
    assert "per_sequence" not in a.result["standard"]["points"][0]
    assert a.result["interleaved"]["gate"] == "x" and a.result["simultaneous"]["crosstalk_rate"] == 0.01
    assert "# Randomized benchmarking suite" in a.result["report"]
    definition = catalog.get_product("randomized-benchmarking-suite").definition
    assert tuple(field["name"] for field in definition["inputs"]) == rb_suite.INPUTS
    declared = {field["name"] for field in definition["outputs"]}
    assert declared <= set(a.result) and set(rb_suite.OUTPUTS) == declared


def test_validate_enforces_the_contract() -> None:
    good = {"qubits": 1, "sequence_lengths": [1, 4, 16], "sequences_per_length": 4, "depolarizing_rate": 0.01, "shots": 50,
            "interleaved_gate": None, "interleaved_gate_depolarizing_rate": None, "simultaneous_crosstalk_rate": None}
    rb_suite.validate(good)
    with pytest.raises(ParameterError, match="interleaved_gate"):
        rb_suite.validate({**good, "interleaved_gate": "cx"})
    with pytest.raises(ParameterError, match="needs an"):
        rb_suite.validate({**good, "interleaved_gate_depolarizing_rate": 0.01})
    with pytest.raises(ParameterError, match="repeat"):
        rb_suite.validate({**good, "sequence_lengths": [1, 1, 4]})
    with pytest.raises(ParameterError, match="exceeds"):
        rb_suite.validate({**good, "sequence_lengths": [100, 200, 512], "sequences_per_length": 1000})
    with pytest.raises(ParameterError, match="unsupported"):
        rb_suite.validate({**good, "bootstrap_resamples": 5})
    with pytest.raises(ParameterError, match="interleaved_gate"):
        catalog.run("randomized-benchmarking-suite", qubits=1, interleaved_gate="cx")
