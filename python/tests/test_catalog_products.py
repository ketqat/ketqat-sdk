"""Scientific validation of the Free catalog products.

Each test here is named in a product definition's `validation` list
(`catalog/products/*.json`), and `python -m ketqat_runner.catalog.build`
refuses a definition whose named test does not exist. Every check compares a
simulation or computation against an independent analytic value or an
independent computation -- never against a copy of the same formula.
"""

from __future__ import annotations

import json
import math

import pytest

np = pytest.importorskip("numpy")

from ketqat_runner import catalog  # noqa: E402
from ketqat_runner import grover_statevector as gs  # noqa: E402
from ketqat_runner import state_measures as sm  # noqa: E402
from ketqat_runner.phase_estimation import phase_estimation_distribution  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))


# ------------------------------------------------------------------------ Grover


def test_grover_matches_the_analytic_success_probability() -> None:
    checked = 0
    for n in range(2, 11):
        size = 1 << n
        for marked_count in sorted({1, 2, 3, size // 4, size // 2 - 1} - {0}):
            if marked_count >= size:
                continue
            rng = np.random.default_rng(n * 1000 + marked_count)
            marked = sorted(int(x) for x in rng.choice(size, size=marked_count, replace=False))
            optimum = gs.optimal_iterations(n, marked_count)
            for k in sorted({0, 1, 2, optimum, optimum + 1, 2 * optimum + 3}):
                state = gs.grover_statevector(n, marked, k)
                simulated = float(np.sum(np.abs(state[marked]) ** 2))
                theta = math.asin(math.sqrt(marked_count / size))
                expected = math.sin((2 * k + 1) * theta) ** 2
                assert simulated == pytest.approx(expected, abs=1e-10), (n, marked_count, k)
                assert float(np.sum(np.abs(state) ** 2)) == pytest.approx(1.0, abs=1e-12)
                checked += 1
    assert checked > 200


def test_grover_unmarked_amplitudes_stay_uniform() -> None:
    """Grover keeps all unmarked amplitudes equal -- a structural check the formula does not encode."""
    state = gs.grover_statevector(6, [5, 40], 4)
    unmarked = np.delete(state, [5, 40])
    assert np.allclose(unmarked, unmarked[0], atol=1e-12)
    assert state[5] == pytest.approx(state[40], abs=1e-12)


def test_grover_diffusion_equals_its_gate_construction() -> None:
    rng = np.random.default_rng(3)
    for n in (2, 3, 5, 7):
        vector = rng.normal(size=1 << n) + 1j * rng.normal(size=1 << n)
        vector /= np.linalg.norm(vector)
        closed_form = gs.apply_diffusion(vector.copy())
        by_gates = gs.apply_diffusion_by_gates(vector.copy(), n)
        assert np.allclose(closed_form, by_gates, atol=1e-12)


def test_grover_refuses_large_registers_with_a_memory_estimate() -> None:
    with pytest.raises(gs.GroverParameterError) as excinfo:
        gs.validate_request(24, [1], None)
    message = str(excinfo.value)
    assert "256.0 MiB" in message and "at most 20 qubits" in message

    with pytest.raises(catalog.ParameterError, match="above the maximum 20"):
        catalog.run("grover-search", seed=1, n_qubits=21, marked=[0])


def test_grover_product_result_and_seeded_counts() -> None:
    record = catalog.run("grover-search@1.0.0", seed=7, n_qubits=5, marked=[3, 17], shots=1000)
    result = record.result
    assert result["iterations"] == 3
    assert result["success_probability"] == pytest.approx(math.sin(7 * math.asin(0.25)) ** 2, abs=1e-12)
    assert sum(result["counts"].values()) == 1000
    assert result["observed_success_count"] == result["counts"].get("00011", 0) + result["counts"].get("10001", 0)
    again = catalog.run("grover-search", seed=7, n_qubits=5, marked=[17, 3], shots=1000)
    assert again.result_sha256 == record.result_sha256


@pytest.mark.parametrize(
    "params, message",
    [
        ({"n_qubits": 3, "marked": [8]}, "outside the 3-qubit register"),
        ({"n_qubits": 3, "marked": [1, 1]}, "distinct"),
        ({"n_qubits": 2, "marked": [0, 1, 2, 3]}, "Every basis state is marked"),
        ({"n_qubits": 3, "marked": []}, "at least 1"),
    ],
)
def test_grover_rejects_invalid_marked_sets(params, message) -> None:
    with pytest.raises(catalog.ParameterError, match=message):
        catalog.run("grover-search", seed=1, **params)


# -------------------------------------------------------------- phase estimation


def test_phase_estimation_is_exact_for_dyadic_phases() -> None:
    for n in range(1, 9):
        for k in range(1 << n):
            distribution = phase_estimation_distribution(k / (1 << n), n)
            assert distribution[k] == pytest.approx(1.0, abs=1e-12), (n, k)
    record = catalog.run("quantum-phase-estimation@1.0.0", seed=11, phase=0.3125, counting_qubits=4, shots=500)
    assert record.result["measured_integer"] == 5
    assert record.result["counts"] == {"0101": 500}


def _fejer(phase: float, n: int, m: int) -> float:
    size = 1 << n
    delta = phase - m / size
    denominator = math.sin(math.pi * delta) ** 2
    if denominator < 1e-30:
        return 1.0
    return math.sin(math.pi * size * delta) ** 2 / (size**2 * denominator)


def test_phase_estimation_matches_the_fejer_kernel() -> None:
    for n in (3, 5, 8):
        for phase in (0.1, 1 / 3, 0.637, 0.999):
            distribution = phase_estimation_distribution(phase, n)
            analytic = [_fejer(phase, n, m) for m in range(1 << n)]
            assert sum(distribution) == pytest.approx(1.0, abs=1e-12)
            for simulated, expected in zip(distribution, analytic):
                assert simulated == pytest.approx(expected, abs=1e-12)


def test_phase_estimation_rejects_phase_one() -> None:
    with pytest.raises(catalog.ParameterError, match=r"\[0, 1\)"):
        catalog.run("quantum-phase-estimation", seed=1, phase=1.0)


# ------------------------------------------------------------------ surface code


def test_surface_code_has_no_failures_without_noise() -> None:
    pytest.importorskip("stim")
    pytest.importorskip("pymatching")
    record = catalog.run("surface-code-memory@1.0.0", seed=5, distance=3, physical_error_rate=0.0, shots=2000)
    result = record.result
    assert result["logical_failures"] == 0
    assert result["is_upper_bound_only"] is True
    assert "not zero" in result["interpretation"]
    assert result["confidence_interval"]["upper"] > 0


def test_surface_code_logical_error_rate_falls_with_distance() -> None:
    pytest.importorskip("stim")
    pytest.importorskip("pymatching")
    common = {"physical_error_rate": 0.003, "shots": 100000, "basis": "z"}
    d3 = catalog.run("surface-code-memory", seed=2026, distance=3, **common).result
    d5 = catalog.run("surface-code-memory", seed=2026, distance=5, **common).result
    assert d5["logical_error_rate"] < d3["logical_error_rate"]
    # Disjoint intervals: the decrease is not shot noise.
    assert d5["confidence_interval"]["upper"] < d3["confidence_interval"]["lower"]


def test_surface_code_reports_a_wilson_interval() -> None:
    pytest.importorskip("stim")
    pytest.importorskip("pymatching")
    from ketqat_runner.qec_statistics import wilson_interval

    result = catalog.run("surface-code-memory", seed=9, distance=3, physical_error_rate=0.01, shots=3000).result
    interval = result["confidence_interval"]
    assert interval["method"] == "wilson_score" and interval["level"] == 0.95
    assert interval["lower"] <= result["logical_error_rate"] <= interval["upper"]
    lower, upper = wilson_interval(result["logical_failures"], 3000)
    assert (interval["lower"], interval["upper"]) == (lower, upper)


def test_surface_code_matches_the_manifest_runner() -> None:
    pytest.importorskip("stim")
    pytest.importorskip("pymatching")
    from ketqat_runner.runner import run_experiment

    manifest = {
        "schema_version": "0.1",
        "domain": "QEC",
        "experiment": {"name": "catalog-parity"},
        "benchmark": {"suite": "surface-code-memory-mwpm", "version": "0.1.0"},
        "qec": {
            "experiment_type": "memory",
            "code": {"family": "rotated-surface-code", "distances": [3], "rounds": "distance"},
            "noise": {"model": "circuit-level-depolarizing", "physical_error_rates": [0.004]},
            "decoder": {"name": "pymatching", "version": "auto"},
        },
        "sampling": {"shots": 4000, "seed": 77},
        "metrics": ["logical_error_rate"],
    }
    legacy = run_experiment(manifest)["metric_points"][0]
    product = catalog.run(
        "surface-code-memory", seed=77, distance=3, physical_error_rate=0.004, shots=4000, basis="x"
    ).result
    assert product["logical_failures"] == legacy["logical_failures"]
    assert product["coordinate_seed"] == legacy["seed"]


def test_surface_code_rejects_even_distance_and_unknown_decoder() -> None:
    with pytest.raises(catalog.ParameterError, match="odd"):
        catalog.run("surface-code-memory", seed=1, distance=4)
    with pytest.raises(catalog.ParameterError, match="not one of"):
        catalog.run("surface-code-memory", seed=1, decoder="union-find")


# ---------------------------------------------------------------- state measures


def _random_density(dimension: int, rng, rank: int | None = None):
    rank = rank or dimension
    a = rng.normal(size=(dimension, rank)) + 1j * rng.normal(size=(dimension, rank))
    rho = a @ a.conj().T
    return rho / np.trace(rho)


def _random_pure(dimension: int, rng):
    vector = rng.normal(size=dimension) + 1j * rng.normal(size=dimension)
    return vector / np.linalg.norm(vector)


def test_state_measures_on_a_bell_state() -> None:
    rho = sm.bell_state()
    assert sm.von_neumann_entropy(sm.partial_trace(rho, [2, 2], [0])) == pytest.approx(1.0, abs=1e-12)
    assert sm.concurrence(rho) == pytest.approx(1.0, abs=1e-9)
    assert sm.logarithmic_negativity(rho, [2, 2], [0]) == pytest.approx(1.0, abs=1e-12)
    assert sm.mutual_information(rho, [2, 2], [0]) == pytest.approx(2.0, abs=1e-12)
    assert sm.von_neumann_entropy(rho) == pytest.approx(0.0, abs=1e-12)
    assert sm.purity(rho) == pytest.approx(1.0, abs=1e-12)

    measures = catalog.run("quantum-state-measures@1.0.0", preset="bell").result["measures"]
    assert measures["reduced_entropy"] == pytest.approx(1.0, abs=1e-12)
    assert measures["concurrence"] == pytest.approx(1.0, abs=1e-9)
    assert measures["log_negativity"] == pytest.approx(1.0, abs=1e-12)
    assert measures["fidelity"] == pytest.approx(1.0, abs=1e-9)


def test_state_measures_vanish_on_product_states() -> None:
    rng = np.random.default_rng(11)
    pure = np.kron(_random_pure(2, rng), _random_pure(2, rng))
    rho = sm.density_matrix(pure)
    assert sm.von_neumann_entropy(sm.partial_trace(rho, [2, 2], [0])) == pytest.approx(0.0, abs=1e-9)
    assert sm.concurrence(rho) == pytest.approx(0.0, abs=1e-7)
    assert sm.logarithmic_negativity(rho, [2, 2], [0]) == pytest.approx(0.0, abs=1e-9)
    assert sm.mutual_information(rho, [2, 2], [0]) == pytest.approx(0.0, abs=1e-9)
    # Mixed product state with a qutrit factor.
    mixed = np.kron(_random_density(3, rng), _random_density(2, rng))
    assert sm.mutual_information(mixed, [3, 2], [0]) == pytest.approx(0.0, abs=1e-9)
    assert sm.negativity(mixed, [3, 2], [0]) == pytest.approx(0.0, abs=1e-9)
    assert sm.concurrence(np.kron(_random_density(2, rng), _random_density(2, rng))) == pytest.approx(0.0, abs=1e-7)


def test_state_measures_follow_the_werner_curves() -> None:
    singlet = sm.singlet_state()
    for p in np.linspace(0, 1, 41):
        rho = sm.werner_state(float(p))
        assert sm.concurrence(rho) == pytest.approx(max(0.0, (3 * p - 1) / 2), abs=1e-7)
        expected_log_negativity = math.log2((1 + 3 * p) / 2) if p > 1 / 3 else 0.0
        assert sm.logarithmic_negativity(rho, [2, 2], [0]) == pytest.approx(expected_log_negativity, abs=1e-9)
        assert sm.purity(rho) == pytest.approx((1 + 3 * p**2) / 4, abs=1e-12)
        assert sm.fidelity(rho, singlet) == pytest.approx((1 + 3 * p) / 4, abs=1e-9)
        eigenvalues = [(1 + 3 * p) / 4] + [(1 - p) / 4] * 3
        entropy = -sum(x * math.log2(x) for x in eigenvalues if x > 1e-15)
        assert sm.von_neumann_entropy(rho) == pytest.approx(entropy, abs=1e-9)
        assert sm.mutual_information(rho, [2, 2], [0]) == pytest.approx(2 - entropy, abs=1e-9)


def test_fidelity_two_independent_formulas_agree() -> None:
    rng = np.random.default_rng(2024)
    for dimension in (2, 3, 4, 8):
        for rank in (1, 2, dimension):
            rho = _random_density(dimension, rng, rank)
            sigma = _random_density(dimension, rng)
            by_svd = sm.fidelity(rho, sigma, method="svd")
            by_sqrtm = sm.fidelity(rho, sigma, method="sqrtm")
            # Rank-deficient cases included on purpose: without zeroing round-off-level
            # eigenvalues their square roots (~1e-8) made the two formulas disagree.
            assert by_svd == pytest.approx(by_sqrtm, abs=1e-12)
            assert sm.fidelity(rho, sigma) == pytest.approx(sm.fidelity(sigma, rho), abs=1e-9)
    for dimension in (2, 5):
        psi, phi = _random_pure(dimension, rng), _random_pure(dimension, rng)
        overlap = abs(np.vdot(psi, phi)) ** 2
        assert sm.fidelity(sm.density_matrix(psi), sm.density_matrix(phi), method="sqrtm") == pytest.approx(overlap, abs=1e-12)
        assert sm.fidelity(sm.density_matrix(psi), sm.density_matrix(phi), method="svd") == pytest.approx(overlap, abs=1e-12)


def test_trace_distance_matches_the_helstrom_measurement() -> None:
    rng = np.random.default_rng(99)
    for dimension in (2, 3, 4, 6):
        rho, sigma = _random_density(dimension, rng), _random_density(dimension, rng)
        distance = sm.trace_distance(rho, sigma)
        assert sm.helstrom_success_probability(rho, sigma) == pytest.approx((1 + distance) / 2, abs=1e-12)
        # Fuchs-van de Graaf inequalities tie the two distance measures together.
        fidelity = sm.fidelity(rho, sigma)
        assert 1 - math.sqrt(fidelity) <= distance + 1e-12
        assert distance <= math.sqrt(1 - fidelity) + 1e-12
    psi, phi = _random_pure(4, rng), _random_pure(4, rng)
    overlap = abs(np.vdot(psi, phi)) ** 2
    assert sm.trace_distance(sm.density_matrix(psi), sm.density_matrix(phi)) == pytest.approx(math.sqrt(1 - overlap), abs=1e-9)


def test_partial_trace_recovers_tensor_factors() -> None:
    rng = np.random.default_rng(5)
    for dims in ([2, 3], [3, 2, 2], [2, 2, 2, 2], [4, 3]):
        factors = [_random_density(d, rng) for d in dims]
        rho = factors[0]
        for factor in factors[1:]:
            rho = np.kron(rho, factor)
        for index, factor in enumerate(factors):
            assert np.allclose(sm.partial_trace(rho, dims, [index]), factor, atol=1e-12)
        if len(dims) >= 3:
            assert np.allclose(sm.partial_trace(rho, dims, [0, 2]), np.kron(factors[0], factors[2]), atol=1e-12)
        assert np.trace(sm.partial_trace(rho, dims, [])) == pytest.approx(1.0)


def test_state_measures_reject_invalid_input(tmp_path) -> None:
    with pytest.raises(sm.StateMeasureError, match="not Hermitian"):
        sm.validate_density_matrix([[0.5, 0.2], [0.0, 0.5]])
    with pytest.raises(sm.StateMeasureError, match="trace"):
        sm.validate_density_matrix([[0.6, 0], [0, 0.6]])
    with pytest.raises(sm.StateMeasureError, match="positive semidefinite"):
        sm.validate_density_matrix([[1.2, 0], [0, -0.2]])
    with pytest.raises(sm.StateMeasureError, match="square"):
        sm.validate_density_matrix([[1, 0, 0], [0, 0, 0]])
    with pytest.raises(sm.StateMeasureError, match="squared norm"):
        sm.density_matrix([1, 1])
    with pytest.raises(sm.StateMeasureError, match="multiply to"):
        sm.partial_trace(np.eye(4) / 4, [2, 3], [0])

    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"density_matrix": {"real": [[1.2, 0], [0, -0.2]]}}))
    with pytest.raises(catalog.ParameterError, match="positive semidefinite"):
        catalog.run("quantum-state-measures", matrix_file=str(bad))
    with pytest.raises(catalog.ParameterError, match="exactly one"):
        catalog.run("quantum-state-measures")
    with pytest.raises(catalog.ParameterError, match="werner_p"):
        catalog.run("quantum-state-measures", preset="werner")
    with pytest.raises(catalog.ParameterError, match="concurrence"):
        catalog.run("quantum-state-measures", preset="ghz", measures=["concurrence"])


def test_state_measures_from_files(tmp_path) -> None:
    rng = np.random.default_rng(8)
    rho = _random_density(4, rng)
    npy = tmp_path / "state.npy"
    np.save(npy, rho)
    record = catalog.run("quantum-state-measures", matrix_file=str(npy), reference="zero")
    result = record.result
    assert result["state"]["source"] == "file" and len(result["state"]["sha256"]) == 64
    assert result["measures"]["purity"] == pytest.approx(float(np.real(np.trace(rho @ rho))), abs=1e-12)
    assert result["measures"]["fidelity"] == pytest.approx(float(np.real(rho[0, 0])), abs=1e-9)

    vector = _random_pure(6, rng)
    document = {"statevector": {"real": vector.real.tolist(), "imag": vector.imag.tolist()}}
    path = tmp_path / "state.json"
    path.write_text(json.dumps(document))
    result = catalog.run("quantum-state-measures", matrix_file=str(path), dims=[2, 3]).result
    assert result["measures"]["von_neumann_entropy"] == pytest.approx(0.0, abs=1e-9)
    assert "concurrence" in result["not_applicable"]
    reduced = sm.partial_trace(sm.density_matrix(vector), [2, 3], [0])
    assert result["measures"]["reduced_entropy"] == pytest.approx(sm.von_neumann_entropy(reduced), abs=1e-12)
