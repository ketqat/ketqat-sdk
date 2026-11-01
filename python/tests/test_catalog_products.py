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


# ------------------------------------------------------------------ QAOA MaxCut

from ketqat_runner import qaoa as qa  # noqa: E402
from ketqat_runner import fourier as fr  # noqa: E402
from ketqat_runner import repetition_code as rc  # noqa: E402
from ketqat_runner import steane as st  # noqa: E402
from ketqat_runner import teleportation as tp  # noqa: E402
from ketqat_runner import trotter as tr  # noqa: E402
from ketqat_runner import vqe as vq  # noqa: E402


def _ring(n: int) -> list[tuple[int, int]]:
    return [(0, 1)] if n == 2 else [(i, (i + 1) % n) for i in range(n)]


def test_qaoa_p1_expectation_matches_the_farhi_closed_form() -> None:
    checked = 0
    for n, degree in ((2, 1), (4, 2), (6, 2), (8, 2)):
        edges = _ring(n)
        for beta in (0.1, 0.4, 0.7, 1.1):
            for gamma in (0.2, 0.6, 1.3, 2.1):
                simulated = qa.expectation(n, edges, [beta], [gamma])
                analytic = qa.farhi_p1_expectation(len(edges), degree, beta, gamma)
                assert simulated == pytest.approx(analytic, abs=1e-12), (n, beta, gamma)
                checked += 1
    assert checked == 64
    # The p=1 ceiling on a triangle-free 2-regular graph is 3/4 of the edges: max over
    # angles of 1/2 + 1/2 sin(4b) sin(g) cos(g) is 3/4, and the default grid contains it.
    result = catalog.run("qaoa-maxcut@1.0.0", seed=7, graph="ring", n_vertices=6).result
    assert result["analytic_p1_applies"] is True
    assert result["analytic_p1_expectation"] == pytest.approx(result["best_expectation"], abs=1e-9)
    assert result["approximation_ratio"] == pytest.approx(0.75, abs=1e-9)
    assert result["max_cut"] == 6


def test_qaoa_cuts_never_exceed_the_brute_force_maximum() -> None:
    cases = [
        ("ring", 6, None, 6),  # even ring: bipartite, every edge cut
        ("custom", 3, ["0-1", "1-2", "2-0"], 2),  # triangle: one edge must survive
        ("complete", 5, None, 6),  # K_n: floor(n/2) * ceil(n/2)
        ("complete", 6, None, 9),
        ("path", 5, None, 4),
    ]
    for graph, n, edges, expected_max in cases:
        result = catalog.run("qaoa-maxcut", seed=3, graph=graph, n_vertices=n, edges=edges, grid=8, shots=500).result
        assert result["max_cut"] == expected_max, (graph, n)
        assert result["best_expectation"] <= expected_max + 1e-9
        assert result["sampled_cut_mean"] <= expected_max + 1e-9
        assert result["best_sampled_cut"] <= expected_max
        if result["analytic_p1_expectation"] is not None:
            assert result["analytic_p1_expectation"] <= expected_max + 1e-9
        edge_list = [tuple(edge) for edge in result["graph"]["edges"]]
        for assignment in result["optimal_assignments"]:
            assert qa.cut_value(int(assignment, 2), edge_list) == expected_max


def test_qaoa_samples_follow_the_state_vector() -> None:
    shots = 4000
    result = catalog.run("qaoa-maxcut", seed=11, graph="ring", n_vertices=6, shots=shots).result
    edges = [tuple(edge) for edge in result["graph"]["edges"]]
    state = qa.qaoa_state(6, edges, result["best_beta"], result["best_gamma"])
    probabilities = np.array([abs(amplitude) ** 2 for amplitude in state])
    cuts = np.array([qa.cut_value(assignment, edges) for assignment in range(64)])
    p_optimal = float(probabilities[cuts == result["max_cut"]].sum())
    assert result["probability_of_optimal_cut"] == pytest.approx(p_optimal, abs=1e-9)
    sigma_fraction = math.sqrt(p_optimal * (1 - p_optimal) / shots)
    assert abs(result["observed_optimal_fraction"] - p_optimal) <= 5 * sigma_fraction
    mean = float(np.dot(probabilities, cuts))
    sigma_cut = math.sqrt(float(np.dot(probabilities, (cuts - mean) ** 2)) / shots)
    assert abs(result["sampled_cut_mean"] - mean) <= 5 * sigma_cut
    assert sum(result["counts"].values()) == shots


def test_qaoa_refuses_oversized_searches_and_bad_graphs() -> None:
    with pytest.raises(catalog.ParameterError, match="expectation evaluations"):
        catalog.run("qaoa-maxcut", seed=1, n_vertices=12, layers=2, grid=64)
    with pytest.raises(catalog.ParameterError, match="self-loop"):
        catalog.run("qaoa-maxcut", seed=1, graph="custom", n_vertices=3, edges=["0-0"])
    with pytest.raises(catalog.ParameterError, match="more than once"):
        catalog.run("qaoa-maxcut", seed=1, graph="custom", n_vertices=3, edges=["0-1", "1-0"])
    with pytest.raises(catalog.ParameterError, match="outside"):
        catalog.run("qaoa-maxcut", seed=1, graph="custom", n_vertices=3, edges=["0-5"])
    with pytest.raises(catalog.ParameterError, match="above the maximum 12"):
        catalog.run("qaoa-maxcut", seed=1, n_vertices=13)
    with pytest.raises(catalog.ParameterError, match="applies only to graph=custom"):
        catalog.run("qaoa-maxcut", seed=1, graph="ring", n_vertices=4, edges=["0-1"])


# ------------------------------------------------------------------------- VQE


def test_vqe_reaches_analytic_ground_energies() -> None:
    quick = {"restarts": 6, "iterations": 200}
    # Two-qubit transverse-field Ising: E_0 = -sqrt(J^2 + 4 h^2) in closed form.
    for coupling, field in ((1.0, 0.7), (0.5, 1.0)):
        result = catalog.run(
            "vqe-ground-state@1.0.0", seed=7, hamiltonian="transverse-ising", qubits=2,
            ising_coupling=coupling, ising_field=field, **quick,
        ).result
        assert result["energy"] == pytest.approx(-math.sqrt(coupling**2 + 4 * field**2), abs=1e-6)
    # No field: aligned spins, E_0 = -J (n - 1); no coupling: E_0 = -n h.
    chain = catalog.run("vqe-ground-state", seed=7, hamiltonian="transverse-ising", qubits=3, ising_field=0.0, **quick).result
    assert chain["energy"] == pytest.approx(-2.0, abs=1e-6)
    free = catalog.run("vqe-ground-state", seed=7, hamiltonian="transverse-ising", qubits=3, ising_coupling=0.0, **quick).result
    assert free["energy"] == pytest.approx(-3.0, abs=1e-6)
    # H2 testbed: the exact energy by diagonalisation, independent of the optimiser.
    h2 = catalog.run("vqe-ground-state", seed=7).result
    matrix = vq.pauli_hamiltonian([(t["coefficient"], t["pauli"]) for t in h2["hamiltonian"]["terms"]])
    assert h2["exact_ground_energy"] == pytest.approx(float(np.linalg.eigvalsh(matrix)[0]), abs=1e-9)
    assert h2["energy"] == pytest.approx(h2["exact_ground_energy"], abs=1e-6)
    assert h2["h2_provenance"]["validated"] is False


def test_vqe_energy_never_falls_below_the_exact_ground_energy() -> None:
    rng = np.random.default_rng(2026)
    strings = ["II", "IX", "IY", "IZ", "XI", "XX", "XY", "XZ", "YI", "YX", "YY", "YZ", "ZI", "ZX", "ZY", "ZZ"]
    for trial in range(6):
        terms = [{"coefficient": float(rng.normal()), "pauli": pauli} for pauli in rng.choice(strings, size=5, replace=False)]
        for entangling in (True, False):
            result = catalog.run(
                "vqe-ground-state", seed=trial, hamiltonian="custom", qubits=2, terms=terms,
                entangling=entangling, restarts=2, iterations=30,
            ).result
            matrix = vq.pauli_hamiltonian([(t["coefficient"], t["pauli"]) for t in terms])
            floor = float(np.linalg.eigvalsh(matrix)[0])
            assert result["energy"] >= floor - 1e-9
            assert result["gap"] >= -1e-9
            assert result["variational_principle_holds"] is True


def test_vqe_product_ansatz_reports_a_representational_gap() -> None:
    modest = catalog.run("vqe-ground-state", seed=7, entangling=False, restarts=4, iterations=100).result
    generous = catalog.run("vqe-ground-state", seed=7, entangling=False, layers=4, restarts=20, iterations=800).result
    for result in (modest, generous):
        assert result["ground_state_entangled"] is True
        assert result["ansatz_can_represent_ground_state"] is False
        assert result["gap"] > 1e-3
        assert "not of the optimiser" in result["explanation"]
    product = catalog.run(
        "vqe-ground-state", seed=7, hamiltonian="custom", qubits=2, entangling=False, layers=1,
        terms=[{"coefficient": -1.0, "pauli": "ZI"}, {"coefficient": -0.6, "pauli": "IZ"}], restarts=4, iterations=100,
    ).result
    assert product["gap"] < 1e-8 and product["energy"] == pytest.approx(-1.6, abs=1e-9)


def test_vqe_rejects_bad_hamiltonians_and_oversized_requests() -> None:
    with pytest.raises(catalog.ParameterError, match="set qubits=2"):
        catalog.run("vqe-ground-state", seed=1, qubits=3)
    with pytest.raises(catalog.ParameterError, match="needs 'terms'"):
        catalog.run("vqe-ground-state", seed=1, hamiltonian="custom")
    with pytest.raises(catalog.ParameterError, match="letters from I, X, Y, Z"):
        catalog.run("vqe-ground-state", seed=1, hamiltonian="custom", terms=[{"coefficient": 1.0, "pauli": "XQ"}])
    with pytest.raises(catalog.ParameterError, match="exactly the keys"):
        catalog.run("vqe-ground-state", seed=1, hamiltonian="custom", terms=[{"coefficient": 1.0}])
    with pytest.raises(catalog.ParameterError, match="apply only to hamiltonian=transverse-ising"):
        catalog.run("vqe-ground-state", seed=1, ising_field=0.5)
    with pytest.raises(catalog.ParameterError, match="could take up to about"):
        catalog.run("vqe-ground-state", seed=1, hamiltonian="transverse-ising", qubits=6, restarts=50, iterations=2000)


# ------------------------------------------------------------------------- QFT


def test_qft_of_every_basis_state_equals_the_dft_column() -> None:
    for n in range(1, 7):
        size = 1 << n
        for inverse in (False, True):
            matrix = fr.dft_matrix(size, inverse=inverse)
            for j in range(size):
                state = [0j] * size
                state[j] = 1 + 0j
                fr.apply_qft(state, n, inverse=inverse)
                assert max(abs(state[k] - matrix[k][j]) for k in range(size)) < 1e-12, (n, j, inverse)
    result = catalog.run("quantum-fourier-transform@1.0.0", seed=7, n_qubits=5, basis_index=13).result
    assert result["max_deviation_from_reference"] < 1e-12
    assert result["output_norm"] == pytest.approx(1.0, abs=1e-12)
    inverse = catalog.run("quantum-fourier-transform", seed=7, n_qubits=5, basis_index=13, inverse=True).result
    assert inverse["max_deviation_from_reference"] < 1e-12


def test_qft_followed_by_its_inverse_is_the_identity() -> None:
    rng = np.random.default_rng(5)
    for n in range(1, 9):
        size = 1 << n
        vector = rng.normal(size=size) + 1j * rng.normal(size=size)
        vector /= np.linalg.norm(vector)
        for first in (False, True):
            state = [complex(x) for x in vector]
            fr.apply_qft(state, n, inverse=first)
            fr.apply_qft(state, n, inverse=not first)
            assert max(abs(a - b) for a, b in zip(state, vector)) < 1e-12
    result = catalog.run("quantum-fourier-transform", seed=7, n_qubits=8, input_state="random").result
    assert result["round_trip_error"] < 1e-12
    assert result["max_deviation_from_reference"] < 1e-12  # the O(N^2) matrix reference, n <= 10
    assert sum(result["counts"].values()) == 1000


def test_qft_of_uniform_and_basis_states_match_their_closed_forms() -> None:
    for n in (1, 3, 6):
        uniform = catalog.run("quantum-fourier-transform", seed=2, n_qubits=n, input_state="uniform", shots=300).result
        assert uniform["counts"] == {"0" * n: 300}
        assert uniform["top_outcomes"][0]["probability"] == pytest.approx(1.0, abs=1e-12)
        assert uniform["max_deviation_from_reference"] < 1e-12
        basis = catalog.run("quantum-fourier-transform", seed=2, n_qubits=n, basis_index=(1 << n) - 1, shots=300).result
        assert basis["max_magnitude_deviation_from_flat"] < 1e-12
        for outcome in basis["top_outcomes"]:
            assert outcome["probability"] == pytest.approx(1 / (1 << n), abs=1e-12)
    with pytest.raises(catalog.ParameterError, match="outside the 3-qubit register"):
        catalog.run("quantum-fourier-transform", seed=1, n_qubits=3, basis_index=8)


# --------------------------------------------------------------------- Trotter


def test_trotter_error_scales_with_the_expected_order() -> None:
    for order, expected in ((1, -2.0), (2, -4.0)):
        result = catalog.run("trotter-ising-dynamics@1.0.0", seed=7, qubits=4, order=order).result
        assert result["scaling"]["expected_slope"] == expected
        assert abs(result["scaling"]["slope"] - expected) < 0.15, result["scaling"]
        infidelities = result["scaling"]["infidelities"]
        assert infidelities == sorted(infidelities, reverse=True)
    for steps in (4, 16, 64):
        first = catalog.run("trotter-ising-dynamics", seed=7, qubits=4, steps=steps, order=1, fit_scaling=False).result
        second = catalog.run("trotter-ising-dynamics", seed=7, qubits=4, steps=steps, order=2, fit_scaling=False).result
        assert second["infidelity"] < first["infidelity"]


def test_trotter_matches_closed_forms_when_the_terms_commute() -> None:
    # No coupling: n independent spins under -h X, survival probability cos(ht)^(2n).
    for n, field, time in ((3, 1.0, 0.7), (5, 0.4, 2.3)):
        result = catalog.run(
            "trotter-ising-dynamics", seed=7, qubits=n, coupling=0.0, field=field, time=time, steps=3, fit_scaling=False
        ).result
        expected = math.cos(field * time) ** (2 * n)
        assert result["observables"]["survival_probability"]["trotter"] == pytest.approx(expected, abs=1e-12)
        assert result["observables"]["survival_probability"]["exact"] == pytest.approx(expected, abs=1e-12)
        assert result["fidelity"] == pytest.approx(1.0, abs=1e-12)
        assert result["observables"]["average_magnetization_z"]["exact"] == pytest.approx(math.cos(2 * field * time), abs=1e-12)
    # No field: |0...0> is an eigenstate of the diagonal Hamiltonian.
    result = catalog.run("trotter-ising-dynamics", seed=7, qubits=4, field=0.0, time=1.3, steps=2).result
    assert result["observables"]["survival_probability"]["trotter"] == pytest.approx(1.0, abs=1e-12)
    assert result["observables"]["average_magnetization_z"]["trotter"] == pytest.approx(1.0, abs=1e-12)
    assert result["infidelity"] < 1e-12
    assert result["scaling"] is None and "terms commute" in result["scaling_note"]
    # And the non-commuting case really does have an error to measure.
    assert tr.trotter_report(4, steps=3)["infidelity"] > 1e-4


def test_trotter_refuses_large_chains_with_a_memory_estimate() -> None:
    with pytest.raises(catalog.ParameterError, match="MiB"):
        catalog.run("trotter-ising-dynamics", seed=1, qubits=11)
    with pytest.raises(catalog.ParameterError, match="would take about"):
        catalog.run("trotter-ising-dynamics", seed=1, qubits=10, steps=10000, scaling_step_counts=[10000, 9000, 8000, 7000])
    with pytest.raises(catalog.ParameterError, match="not one of"):
        catalog.run("trotter-ising-dynamics", seed=1, order=3)


# --------------------------------------------------------------- teleportation

_AXIS_STATES = [(0.0, 0.0), (math.pi, 0.0), (math.pi / 2, 0.0), (math.pi / 2, math.pi), (math.pi / 2, math.pi / 2), (math.pi / 2, 3 * math.pi / 2)]


def test_teleportation_fidelity_is_one_for_every_outcome() -> None:
    rng = np.random.default_rng(99)
    states = [tp.random_state(rng) for _ in range(200)] + [tp.bloch_state(theta, phi) for theta, phi in _AXIS_STATES]
    for state in states:
        report = tp.teleport(state)
        assert len(report["branches"]) == 4
        for branch in report["branches"]:
            assert branch["fidelity"] == pytest.approx(1.0, abs=1e-12)
            assert branch["probability"] == pytest.approx(0.25, abs=1e-12)
    for kwargs in ({"theta": 1.0, "phi": 0.5}, {}):
        result = catalog.run("quantum-teleportation@1.0.0", seed=7, shots=100, **kwargs).result
        assert result["min_fidelity"] == pytest.approx(1.0, abs=1e-12)
        assert [branch["probability"] for branch in result["branches"]] == pytest.approx([0.25] * 4, abs=1e-12)
        x, y, z = result["input_state"]["bloch_vector"]
        assert x * x + y * y + z * z == pytest.approx(1.0, abs=1e-9)
        assert [branch["correction"] for branch in result["branches"]] == ["none", "X", "Z", "X then Z"]


def test_teleportation_without_corrections_averages_one_half() -> None:
    rng = np.random.default_rng(7)
    for _ in range(50):
        state = tp.random_state(rng)
        report = tp.teleport(state)
        x, y, z = tp.bloch_vector(state)
        expected = (1 + x * x + y * y + z * z) / 4
        assert expected == pytest.approx(0.5, abs=1e-12)
        assert report["average_fidelity_without_correction"] == pytest.approx(expected, abs=1e-12)
        # Per branch: |<psi|X|psi>|^2 = x^2, |<psi|Z|psi>|^2 = z^2, |<psi|XZ|psi>|^2 = y^2.
        by_outcome = {branch["outcome"]: branch["fidelity_without_correction"] for branch in report["branches"]}
        assert by_outcome["00"] == pytest.approx(1.0, abs=1e-12)
        assert by_outcome["01"] == pytest.approx(x * x, abs=1e-12)
        assert by_outcome["10"] == pytest.approx(z * z, abs=1e-12)
        assert by_outcome["11"] == pytest.approx(y * y, abs=1e-12)
    zero = catalog.run("quantum-teleportation", seed=1, theta=0.0, phi=0.0, shots=10).result
    uncorrected = {branch["outcome"]: branch["fidelity_without_correction"] for branch in zero["branches"]}
    assert uncorrected == {"00": 1.0, "01": 0.0, "10": 1.0, "11": 0.0}
    assert zero["average_fidelity_without_correction"] == pytest.approx(0.5, abs=1e-12)


def test_teleportation_outcomes_are_uniform_within_five_sigma() -> None:
    shots = 4000
    result = catalog.run("quantum-teleportation", seed=7, theta=1.0, phi=0.5, shots=shots).result
    sigma = math.sqrt(shots * 0.25 * 0.75)
    assert sum(result["counts"].values()) == shots
    for label in ("00", "01", "10", "11"):
        assert abs(result["counts"][label] - shots / 4) <= 5 * sigma
    with pytest.raises(catalog.ParameterError, match="both 'theta' and 'phi'"):
        catalog.run("quantum-teleportation", seed=1, theta=0.3)


# ---------------------------------------------------------------- Steane code


def _commutation_syndrome(error: str) -> tuple[int, ...]:
    """Syndrome by matrix algebra: bit 1 when S E = -E S."""
    matrix = st.pauli_matrix(error)
    bits = []
    for generator in st.STEANE_STABILIZERS:
        stabilizer = st.pauli_matrix(generator)
        if np.allclose(stabilizer @ matrix, matrix @ stabilizer):
            bits.append(0)
        else:
            assert np.allclose(stabilizer @ matrix, -(matrix @ stabilizer))
            bits.append(1)
    return tuple(bits)


def test_steane_every_single_qubit_error_has_a_unique_syndrome_and_is_corrected() -> None:
    errors = st.single_qubit_errors()
    assert len(errors) == 21
    syndromes = [_commutation_syndrome(error) for error in errors]
    assert all(any(code) for code in syndromes)
    assert len(set(syndromes)) == 21
    result = catalog.run("steane-code@1.0.0").result
    table = result["syndrome_table"]
    assert len(table) == 21
    for error, code in zip(errors, syndromes):
        assert table["".join(str(bit) for bit in code)] == error
    single = result["single_qubit_errors"]
    assert single["count"] == 21 and single["distinct_syndromes"] == 21
    assert single["all_detected"] and single["all_uniquely_identified"] and single["all_recovered"]
    assert single["state_level_recovered"] == 21
    for error in errors[:5]:
        trace = catalog.run("steane-code", error=error, exhaustive=False).result["applied_error"]
        assert trace["corrected"] is True and trace["residual_logical_action"] == "I"
        assert trace["decoder_applies"] == error


def test_steane_some_weight_two_error_is_miscorrected() -> None:
    result = catalog.run("steane-code").result
    two = result["weight_two_errors"]
    assert two["count"] == 189 and two["detected"] == 189 and two["all_detected"] is True
    assert two["miscorrected_to_a_logical_error"] == 63
    assert two["flagged_uncorrectable"] == 126
    assert result["distance_limit"]["miscorrected_ordered_pairs"] == 126
    x_type = catalog.run("steane-code", logical_state="zero", error="XXIIIII", exhaustive=False).result["applied_error"]
    assert x_type["syndrome_matches_a_single_qubit_error"] is True
    assert x_type["decoder_applies"] == "IIXIIII" and x_type["residual"] == "XXXIIII"
    assert x_type["residual_logical_action"] == "X"
    assert x_type["fidelity_after_correction"] == pytest.approx(0.0, abs=1e-12) and x_type["corrected"] is False
    z_on_zero = catalog.run("steane-code", logical_state="zero", error="ZZIIIII", exhaustive=False).result["applied_error"]
    assert z_on_zero["residual_logical_action"] == "Z" and z_on_zero["fidelity_after_correction"] == pytest.approx(1.0, abs=1e-12)
    z_on_plus = catalog.run("steane-code", logical_state="plus", error="ZZIIIII", exhaustive=False).result["applied_error"]
    assert z_on_plus["fidelity_after_correction"] == pytest.approx(0.0, abs=1e-12) and z_on_plus["corrected"] is False
    flagged = catalog.run("steane-code", error="XIIIIIZ", exhaustive=False).result["applied_error"]
    assert flagged["detected"] is True and flagged["flagged_uncorrectable"] is True and flagged["decoder_applies"] is None
    with pytest.raises(catalog.ParameterError, match="7-letter"):
        catalog.run("steane-code", error="XX")


def test_steane_projection_syndromes_agree_with_commutation() -> None:
    zero = st.logical_zero()
    one = st.pauli_matrix(st.LOGICAL_X) @ zero
    plus = (zero + one) / math.sqrt(2)
    assert abs(np.vdot(zero, one)) < 1e-12
    for state in (zero, one, plus):
        assert np.linalg.norm(state) == pytest.approx(1.0, abs=1e-12)
        for generator in st.STEANE_STABILIZERS:
            assert np.allclose(st.pauli_matrix(generator) @ state, state)
    for error in st.single_qubit_errors():
        for logical_state in ("zero", "one", "plus"):
            trace = catalog.run("steane-code", logical_state=logical_state, error=error, exhaustive=False).result["applied_error"]
            assert trace["syndromes_agree"] is True
            assert trace["syndrome_by_commutation"] == "".join(str(bit) for bit in _commutation_syndrome(error))
            assert trace["corrected"] is True


# ------------------------------------------------------------ repetition code


def _exact_tail(n: int, p: float) -> float:
    return sum(math.comb(n, k) * p**k * (1 - p) ** (n - k) for k in range(n // 2 + 1, n + 1))


def test_repetition_code_interval_contains_the_exact_binomial_rate() -> None:
    for n, p in ((1, 0.1), (3, 0.1), (5, 0.1), (7, 0.2), (9, 0.05), (3, 0.3)):
        result = catalog.run("repetition-code@1.0.0", seed=7, n=n, physical_error_rate=p, shots=20000).result
        exact = _exact_tail(n, p)
        assert result["exact_logical_error_rate"] == pytest.approx(exact, abs=1e-12)
        interval = result["confidence_interval"]
        assert interval["lower"] <= exact <= interval["upper"], (n, p, result["logical_error_rate"], interval)
        assert result["exact_within_interval"] is True
        assert interval["lower"] <= result["logical_error_rate"] <= interval["upper"]
    assert _exact_tail(1, 0.1) == pytest.approx(0.1)


def test_repetition_code_boundary_cases() -> None:
    silent = catalog.run("repetition-code", seed=1, n=5, physical_error_rate=0.0, shots=5000).result
    assert silent["logical_failures"] == 0 and silent["exact_logical_error_rate"] == 0.0
    assert silent["is_upper_bound_only"] is True and "not zero" in silent["interpretation"]
    broken = catalog.run("repetition-code", seed=1, n=5, physical_error_rate=1.0, shots=5000).result
    assert broken["logical_failures"] == 5000 and broken["logical_error_rate"] == 1.0
    assert broken["exact_logical_error_rate"] == pytest.approx(1.0, abs=1e-12)
    for n in (3, 5, 7):
        half = catalog.run("repetition-code", seed=1, n=n, physical_error_rate=0.5, shots=100).result
        assert half["exact_logical_error_rate"] == pytest.approx(0.5, abs=1e-12)
        assert half["below_pseudothreshold"] is False


def test_repetition_code_syndrome_decoder_equals_majority_vote() -> None:
    rng = np.random.default_rng(3)
    for n in (1, 3, 5, 9, 15):
        for p in (0.05, 0.3, 0.7):
            flips = (rng.random((2000, n)) < p).astype(np.uint8)
            decoded = rc.decode_majority(flips)
            majority = flips.sum(axis=1) > n // 2
            assert np.array_equal(decoded, majority)
    assert rc.sample_logical_failures(5, 0.2, 3000, seed=4)["logical_failures"] == int(
        np.count_nonzero((np.random.default_rng(4).random((3000, 5)) < 0.2).sum(axis=1) > 2)
    )


def test_repetition_code_refuses_even_n_and_oversized_runs() -> None:
    with pytest.raises(catalog.ParameterError, match="odd"):
        catalog.run("repetition-code", seed=1, n=4)
    with pytest.raises(catalog.ParameterError, match="qubit flips, about"):
        catalog.run("repetition-code", seed=1, n=101, shots=100000000)


# ------------------------------------------------------------------ tomography


def test_state_tomography_from_exact_expectations_recovers_the_state() -> None:
    for theta, phi in ((1.0, 0.5), (2.5, 4.0), (0.0, 0.0), (math.pi / 2, math.pi / 2)):
        result = catalog.run("quantum-state-tomography@1.0.0", seed=7, preset="bloch", theta=theta, phi=phi, exact=True).result
        bloch = result["bloch_vector"]
        expected = (math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta))
        assert (bloch["x"], bloch["y"], bloch["z"]) == pytest.approx(expected, abs=1e-12)
        assert result["fidelity_with_target"] == pytest.approx(1.0, abs=1e-12)
        assert result["purity"] == pytest.approx(1.0, abs=1e-12) and result["physical"] is True
    for preset, qubits, psi in (("bell", None, [1, 0, 0, 1]), ("ghz", 3, [1, 0, 0, 0, 0, 0, 0, 1]), ("plus", None, [1, 1])):
        result = catalog.run("quantum-state-tomography", seed=7, preset=preset, qubits=qubits, exact=True).result
        vector = np.array(psi, dtype=complex) / math.sqrt(2)
        density = np.outer(vector, vector.conj())
        rho = np.array(result["density_matrix_real"]) + 1j * np.array(result["density_matrix_imaginary"])
        assert np.allclose(rho, density, atol=1e-12)
        assert result["fidelity_with_target"] == pytest.approx(1.0, abs=1e-12)
        assert result["trace"] == pytest.approx(1.0, abs=1e-12) and result["purity"] == pytest.approx(1.0, abs=1e-12)
        assert result["max_expectation_error"] == 0.0 and result["pauli_settings"] == 4 ** result["qubits"]


def test_state_tomography_estimates_are_consistent_with_binomial_statistics() -> None:
    errors = {}
    for shots in (100, 100000):
        for preset, kwargs in (("bloch", {"theta": 1.0, "phi": 0.5}), ("random", {"qubits": 3})):
            result = catalog.run("quantum-state-tomography", seed=7, preset=preset, shots=shots, **kwargs).result
            for entry in result["expectations"]:
                sigma = math.sqrt(max(0.0, 1 - entry["exact"] ** 2) / shots)
                assert abs(entry["estimate"] - entry["exact"]) <= 5 * sigma + 1e-12, entry
                expected_error = math.sqrt(max(0.0, 1 - entry["estimate"] ** 2) / shots)
                assert entry["standard_error"] == pytest.approx(expected_error, abs=1e-9)
            errors[(preset, shots)] = result["max_expectation_error"]
            assert result["trace"] == pytest.approx(1.0, abs=1e-12)
    assert errors[("bloch", 100000)] < errors[("bloch", 100)]
    assert errors[("random", 100000)] < errors[("random", 100)]


def test_state_tomography_reports_unphysical_reconstructions_unprojected() -> None:
    found = None
    for seed in range(1, 30):
        result = catalog.run("quantum-state-tomography", seed=seed, preset="plus", shots=40).result
        if not result["physical"]:
            found = result
            break
    assert found is not None, "linear inversion of a pure state from 40 shots should go unphysical for some seed"
    assert found["bloch_length"] > 1
    assert min(found["eigenvalues"]) < 0
    assert "Bloch vector has length" in found["physicality_note"]
    assert found["trace"] == pytest.approx(1.0, abs=1e-12)
    bloch = found["bloch_vector"]
    assert found["fidelity_with_target"] == pytest.approx((1 + bloch["x"]) / 2, abs=1e-12)
    rho = np.array(found["density_matrix_real"]) + 1j * np.array(found["density_matrix_imaginary"])
    assert np.allclose(rho, 0.5 * np.array([[1 + bloch["z"], bloch["x"] - 1j * bloch["y"]], [bloch["x"] + 1j * bloch["y"], 1 - bloch["z"]]]), atol=1e-12)
    with pytest.raises(catalog.ParameterError, match="applies only to preset=ghz"):
        catalog.run("quantum-state-tomography", seed=1, preset="plus", qubits=2)
