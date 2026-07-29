"""Tests for VQE over Pauli Hamiltonians (ketqat-sdk#155)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from ketqat_runner.vqe import (
    CHEMICAL_ACCURACY,
    VqeError,
    ansatz_state,
    energy,
    exact_ground_energy,
    ground_state_is_entangled,
    h2_hamiltonian_approximate,
    pauli_hamiltonian,
    run_vqe,
)


def test_variational_principle_never_violated() -> None:
    """The strongest available check, because it is a theorem rather than a tolerance.

    <psi|H|psi> >= E_0 holds for every state and every Hamiltonian. It cannot be
    satisfied approximately or on average -- one violation anywhere proves the
    expectation value or the state preparation wrong. Tested over random
    Hermitian matrices at random parameters, where no tuning could hide an error.
    """
    rng = np.random.default_rng(20260730)
    for qubits in (2, 3):
        size = 1 << qubits
        for _trial in range(40):
            raw = rng.normal(size=(size, size)) + 1j * rng.normal(size=(size, size))
            hamiltonian = raw + raw.conj().T
            floor = exact_ground_energy(hamiltonian)
            for _sample in range(10):
                parameters = rng.uniform(0, 2 * math.pi, 2 * qubits)
                for entangling in (True, False):
                    value = energy(parameters, hamiltonian, qubits, entangling=entangling)
                    assert value >= floor - 1e-9


def test_reaches_the_exact_ground_energy() -> None:
    """With an expressive ansatz, convergence is to truth from diagonalisation."""
    hamiltonian, _ = h2_hamiltonian_approximate()
    report = run_vqe(hamiltonian, 2, layers=2, entangling=True)
    assert report["gap"] < 1e-8
    assert report["variational_principle_holds"]


def test_product_ansatz_cannot_reach_an_entangled_ground_state() -> None:
    """A limit of the hypothesis class, distinguished from optimiser failure.

    The distinction matters: "more iterations would fix it" is false here, and
    reporting the shortfall as noise is how VQE results get overstated. More
    restarts and iterations must not close this gap.
    """
    hamiltonian, _ = h2_hamiltonian_approximate()
    assert ground_state_is_entangled(hamiltonian, 2)

    modest = run_vqe(hamiltonian, 2, layers=2, entangling=False, restarts=4, iterations=100)
    generous = run_vqe(hamiltonian, 2, layers=4, entangling=False, restarts=20, iterations=800, seed=7)

    assert modest["gap"] > 1e-3
    assert generous["gap"] > 1e-3, "more effort must not close a representational gap"
    assert not generous["ansatz_can_represent_ground_state"]
    assert "not of the optimiser" in generous["explanation"]


def test_product_ansatz_suffices_when_the_ground_state_is_a_product() -> None:
    """The converse, so the check above is not merely pessimism about products.

    A Hamiltonian with no coupling has a product ground state, and there the
    product ansatz must reach it exactly.
    """
    hamiltonian = pauli_hamiltonian([(-1.0, "ZI"), (-0.6, "IZ")])
    assert not ground_state_is_entangled(hamiltonian, 2)
    report = run_vqe(hamiltonian, 2, layers=1, entangling=False)
    assert report["gap"] < 1e-8


def test_h2_coefficients_are_reported_as_unvalidated() -> None:
    """The provenance must state that this is not a chemistry result.

    These coefficients land ~6 mHa from the literature total -- about four times
    chemical accuracy. The module is required to say so, so the testbed cannot
    be mistaken for a validated molecular Hamiltonian.
    """
    _, provenance = h2_hamiltonian_approximate()
    assert provenance["validated"] is False
    assert provenance["within_chemical_accuracy"] is False
    assert provenance["discrepancy"] > CHEMICAL_ACCURACY
    assert "not suitable for reporting a chemistry result" in provenance["note"]


def test_ansatz_states_are_normalised() -> None:
    """Ry rotations and CNOTs are unitary, so the norm cannot move."""
    rng = np.random.default_rng(3)
    for qubits in (2, 3, 4):
        for entangling in (True, False):
            parameters = rng.uniform(0, 2 * math.pi, 2 * qubits)
            state = ansatz_state(parameters, qubits, entangling=entangling)
            assert abs(np.vdot(state, state).real - 1.0) < 1e-12


def test_product_ansatz_produces_unentangled_states() -> None:
    """The claim the limitation rests on, checked directly rather than assumed."""
    rng = np.random.default_rng(11)
    for _trial in range(20):
        state = ansatz_state(rng.uniform(0, 2 * math.pi, 4), 2, entangling=False)
        singular = np.linalg.svd(state.reshape(2, 2), compute_uv=False)
        assert singular[1] < 1e-12


def test_pauli_hamiltonians_are_hermitian() -> None:
    hamiltonian = pauli_hamiltonian([(0.3, "XY"), (-1.2, "ZZ"), (0.7, "IX")])
    assert np.allclose(hamiltonian, hamiltonian.conj().T)


def test_rejects_malformed_input() -> None:
    with pytest.raises(VqeError, match="at least one term"):
        pauli_hamiltonian([])
    with pytest.raises(VqeError, match="not a Pauli operator"):
        pauli_hamiltonian([(1.0, "XQ")])
    with pytest.raises(VqeError, match="expected"):
        pauli_hamiltonian([(1.0, "XX"), (1.0, "X")])
    with pytest.raises(VqeError, match="do not divide into layers"):
        ansatz_state([0.1, 0.2, 0.3], 2)
    with pytest.raises(VqeError, match="at least one layer"):
        run_vqe(pauli_hamiltonian([(1.0, "ZZ")]), 2, layers=0)


def test_ry_convention_is_the_standard_one() -> None:
    """Pins the gate convention, which the variational principle cannot police.

    Recorded because a mutation replacing Ry(theta) with Ry(2*theta) survives
    every other test here, and correctly so: it is still unitary, so it reaches
    the same set of states at different parameter values and VQE still converges
    to the exact ground energy. The theorem constrains the physics, not the
    parameterisation.

    But the convention is part of this module's interface -- a caller reading
    optimised angles, or comparing them against another framework, would be
    misled. So it is fixed directly against the standard matrix:
    Ry(theta)|0> = cos(theta/2)|0> + sin(theta/2)|1>.
    """
    state = ansatz_state([math.pi / 2, 0.0], 2, entangling=False)
    assert state[0] == pytest.approx(1 / math.sqrt(2), abs=1e-12)
    assert state[1] == pytest.approx(1 / math.sqrt(2), abs=1e-12)

    # And a full pi is a complete flip, not a return to start.
    flipped = ansatz_state([math.pi, 0.0], 2, entangling=False)
    assert abs(flipped[1]) == pytest.approx(1.0, abs=1e-12)
