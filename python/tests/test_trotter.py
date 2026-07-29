"""Tests for Trotterized Ising evolution (ketqat-sdk#153)."""

from __future__ import annotations

import numpy as np
import pytest

from ketqat_runner.trotter import (
    TrotterError,
    error_scaling,
    exact_evolution,
    ising_hamiltonian,
    trotter_evolution,
    trotter_report,
)


@pytest.mark.parametrize("order,expected", [(1, -2.0), (2, -4.0)])
def test_error_scales_with_the_exponent_theory_predicts(order: int, expected: float) -> None:
    """The load-bearing test: the *exponent*, not the magnitude.

    First-order Trotter has amplitude error O(t^2/r), second-order O(t^3/r^2),
    and infidelity is the square of amplitude error -- so the log-log slope of
    infidelity against step count must be -2 and -4.

    A magnitude can be tuned to look good at one step count. A slope cannot: it
    is a property of the splitting's structure, so reproducing it is strong
    evidence the circuit implements the intended approximation.
    """
    fitted = error_scaling(4, order=order)["slope"]
    assert abs(fitted - expected) < 0.15, f"slope {fitted} is not {expected}"


def test_second_order_beats_first_at_equal_cost() -> None:
    """Strang splitting must be more accurate than the naive one, step for step.

    Not automatic -- it is why the half-step structure exists -- so it is
    checked rather than assumed.
    """
    for steps in (4, 16, 64):
        first = trotter_report(4, steps=steps, order=1)["infidelity"]
        second = trotter_report(4, steps=steps, order=2)["infidelity"]
        assert second < first


def test_commuting_terms_make_the_splitting_exact() -> None:
    """With one term switched off there is nothing to split, so error is zero.

    Trotter error comes entirely from non-commutation. Turning off the field
    leaves a diagonal Hamiltonian, and turning off the coupling leaves a
    single-qubit one; either way a single step must be exact. This isolates the
    error's cause instead of only measuring its size.
    """
    for coupling, field in ((1.0, 0.0), (0.0, 1.0)):
        report = trotter_report(3, coupling=coupling, field=field, time=1.7, steps=1, order=1)
        # 1e-12 is floating-point tolerance, not a loosened physical claim. The
        # two cases genuinely differ: with no field, |000> is an eigenstate of a
        # diagonal H and the error is *exactly* 0.0; with no coupling the
        # reference must diagonalise an 8x8 matrix, so ~1e-16 of rounding enters
        # through `eigh` itself rather than through Trotter. Demanding 1e-20
        # would be demanding more precision than double arithmetic has.
        assert report["infidelity"] < 1e-12


def test_scaling_refuses_to_fit_an_exact_case() -> None:
    """Zero error has no logarithm; say why rather than emitting a nonsense fit."""
    with pytest.raises(TrotterError, match="terms commute"):
        error_scaling(3, field=0.0, order=1)


def test_evolution_is_unitary() -> None:
    """Both paths conserve probability; a drift would mean a broken gate."""
    state = trotter_evolution(4, coupling=1.0, field=0.8, time=2.0, steps=12, order=2)
    assert abs(np.vdot(state, state).real - 1.0) < 1e-12

    hamiltonian = ising_hamiltonian(4, coupling=1.0, field=0.8)
    initial = np.zeros(16, dtype=complex)
    initial[0] = 1.0
    assert abs(np.vdot(exact_evolution(hamiltonian, 2.0, initial), exact_evolution(hamiltonian, 2.0, initial)).real - 1.0) < 1e-12


def test_hamiltonian_is_hermitian_with_the_right_spectrum() -> None:
    """The reference must itself be right, or agreement proves nothing.

    For a two-site chain with no field, H = -J Z Z is diagonal with eigenvalues
    -J (aligned) and +J (anti-aligned), each twice.
    """
    hamiltonian = ising_hamiltonian(4, coupling=1.0, field=0.7)
    assert np.allclose(hamiltonian, hamiltonian.conj().T)

    two_site = ising_hamiltonian(2, coupling=1.0, field=0.0)
    assert sorted(np.linalg.eigvalsh(two_site).round(9)) == [-1.0, -1.0, 1.0, 1.0]


def test_zero_time_is_the_identity() -> None:
    state = trotter_evolution(3, coupling=1.0, field=1.0, time=0.0, steps=5)
    assert abs(state[0] - 1.0) < 1e-12


def test_longer_time_needs_more_steps() -> None:
    """Error grows with t at fixed step count -- the practical cost of simulation."""
    short = trotter_report(4, time=0.5, steps=8, order=1)["infidelity"]
    long = trotter_report(4, time=2.0, steps=8, order=1)["infidelity"]
    assert long > short


def test_rejects_bad_configuration() -> None:
    with pytest.raises(TrotterError, match="at least one step"):
        trotter_evolution(3, coupling=1.0, field=1.0, time=1.0, steps=0)
    with pytest.raises(TrotterError, match="first- and second-order"):
        trotter_evolution(3, coupling=1.0, field=1.0, time=1.0, steps=1, order=3)
    with pytest.raises(TrotterError, match="outside"):
        ising_hamiltonian(99, coupling=1.0, field=1.0)
    with pytest.raises(TrotterError, match="amplitudes"):
        trotter_evolution(3, coupling=1.0, field=1.0, time=1.0, steps=1, initial=[1, 0])


def test_periodic_ring_adds_one_bond() -> None:
    """A ring closes the chain; a 2-site ring does not, or it would double-count."""
    open_chain = ising_hamiltonian(4, coupling=1.0, field=0.0, periodic=False)
    ring = ising_hamiltonian(4, coupling=1.0, field=0.0, periodic=True)
    assert not np.allclose(open_chain, ring)

    two_open = ising_hamiltonian(2, coupling=1.0, field=0.0, periodic=False)
    two_ring = ising_hamiltonian(2, coupling=1.0, field=0.0, periodic=True)
    assert np.allclose(two_open, two_ring)
