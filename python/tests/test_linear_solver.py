"""Tests for the HHL linear solver (ketqat-sdk#157)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from ketqat_runner.linear_solver import (
    LinearSolverError,
    solve,
    spectrum_is_representable,
)

# Eigenvalues 1 and 2. With t = pi/2 both land on clock integers, so HHL is
# exact and any shortfall would be a bug rather than discretisation.
WELL_CONDITIONED = np.array([[1.5, 0.5], [0.5, 1.5]])
EXACT_TIME = math.pi / 2


@pytest.mark.parametrize("vector", [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.3, -0.9]])
def test_exact_when_the_spectrum_is_representable(vector: list[float]) -> None:
    """The load-bearing test: agreement with `numpy.linalg.solve` is exact.

    When every eigenvalue lands on a clock integer, phase estimation does not
    round and HHL has no approximation left. So fidelity must be 1 -- not "high"
    -- and several right-hand sides are checked, since a single b can agree by
    accident when it happens to be an eigenvector.
    """
    report = solve(WELL_CONDITIONED, np.array(vector), clock_qubits=4, evolution_time=EXACT_TIME)
    assert report["spectrum_representable"] is True
    assert report["fidelity_with_classical"] == pytest.approx(1.0, abs=1e-12)


def test_fidelity_improves_with_clock_size_when_not_representable() -> None:
    """The other regime, measured rather than avoided.

    With a clock register that cannot represent the spectrum exactly, phase
    estimation rounds and fidelity falls short. That is expected behaviour, so it
    is shown converging -- 0.989 at 2 qubits to 0.9999 at 5 -- rather than hidden
    by only ever testing the exact case.
    """
    fidelities = [
        solve(WELL_CONDITIONED, np.array([1.0, 0.0]), clock_qubits=clock)["fidelity_with_classical"]
        for clock in (2, 3, 4, 5)
    ]
    assert all(later > earlier for earlier, later in zip(fidelities, fidelities[1:]))
    assert fidelities[0] < 0.999 and fidelities[-1] > 0.9998


def test_post_selection_cost_follows_b_not_just_the_condition_number() -> None:
    """HHL's cost is not a function of kappa alone, and saying so matters.

    The ancilla rotation gives amplitude C/lambda, so the useful branch is
    suppressed only for the components of b along *large* eigenvalues. Aligned
    with the large eigenvalue the success probability is exactly 1/kappa^2;
    aligned with the small one it is exactly 1, at any kappa.

    Stated because "HHL costs 1/kappa^2" is the usual shorthand and it is
    incomplete -- a well-chosen b pays nothing.
    """
    for kappa in (2, 4, 8, 16, 32):
        matrix = np.diag([1.0, float(kappa)])
        time = 2 * math.pi / (1 << 7)

        aligned_large = solve(matrix, np.array([0.0, 1.0]), clock_qubits=7, evolution_time=time)
        assert aligned_large["success_probability"] == pytest.approx(1 / kappa**2, rel=1e-9)
        assert aligned_large["fidelity_with_classical"] == pytest.approx(1.0, abs=1e-9)

        aligned_small = solve(matrix, np.array([1.0, 0.0]), clock_qubits=7, evolution_time=time)
        assert aligned_small["success_probability"] == pytest.approx(1.0, abs=1e-9)


def test_only_the_direction_is_claimed() -> None:
    """HHL yields a normalised state, so the scale of x is not recoverable.

    Reported as a direction for that reason. A scaled vector would imply
    information the algorithm does not produce.
    """
    report = solve(WELL_CONDITIONED, np.array([1.0, 0.0]), clock_qubits=4, evolution_time=EXACT_TIME)
    assert np.linalg.norm(report["solution"]) == pytest.approx(1.0, abs=1e-12)
    assert "the scale is not recoverable" in report["note"]


def test_representability_is_reported_honestly() -> None:
    """The report must say which regime a run is in, since it changes the claim."""
    exact = solve(WELL_CONDITIONED, np.array([1.0, 0.0]), clock_qubits=4, evolution_time=EXACT_TIME)
    assert "any shortfall is a bug" in exact["note"]

    rounded = solve(WELL_CONDITIONED, np.array([1.0, 0.0]), clock_qubits=4)
    assert rounded["spectrum_representable"] is False
    assert "expected rather than a defect" in rounded["note"]


def test_spectrum_check_identifies_representable_times() -> None:
    """t = pi/2 makes eigenvalues 1 and 2 integers on the clock; the default does not."""
    checked = spectrum_is_representable(WELL_CONDITIONED, 4, EXACT_TIME)
    assert checked["representable"] is True
    assert checked["encoded_integers"] == pytest.approx([4.0, 8.0])
    assert checked["condition_number"] == pytest.approx(2.0)


def test_larger_systems() -> None:
    """A 4x4 system, so the solver is not implicitly two-dimensional."""
    matrix = np.diag([1.0, 2.0, 3.0, 4.0])
    report = solve(matrix, np.array([1.0, 1.0, 1.0, 1.0]), clock_qubits=6, evolution_time=2 * math.pi / (1 << 6))
    assert report["spectrum_representable"] is True
    assert report["fidelity_with_classical"] == pytest.approx(1.0, abs=1e-9)


def test_rejects_systems_hhl_cannot_solve() -> None:
    """Each refusal names the mathematical reason, not just the rule."""
    with pytest.raises(LinearSolverError, match="Hermitian"):
        solve(np.array([[1.0, 2.0], [0.0, 1.0]]), np.array([1.0, 0.0]))
    with pytest.raises(LinearSolverError, match="singular"):
        solve(np.array([[1.0, 1.0], [1.0, 1.0]]), np.array([1.0, 0.0]))
    with pytest.raises(LinearSolverError, match="negative spectrum"):
        solve(np.diag([1.0, -2.0]), np.array([1.0, 1.0]))
    with pytest.raises(LinearSolverError, match="zero vector"):
        solve(WELL_CONDITIONED, np.array([0.0, 0.0]))
    with pytest.raises(LinearSolverError, match="square"):
        solve(np.array([[1.0, 0.0]]), np.array([1.0]))
    with pytest.raises(LinearSolverError, match="power of two"):
        solve(np.diag([1.0, 2.0, 3.0]), np.array([1.0, 1.0, 1.0]))
    with pytest.raises(LinearSolverError, match="clock_qubits must be"):
        solve(WELL_CONDITIONED, np.array([1.0, 0.0]), clock_qubits=99)
