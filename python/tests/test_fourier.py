"""Tests for the QFT primitive (ketqat-sdk#149)."""

from __future__ import annotations

import math
import random

import pytest

from ketqat_runner.fourier import (
    FourierError,
    MAX_QFT_QUBITS,
    apply_dft,
    apply_qft,
    dft_matrix,
)


def _random_state(size: int, seed: int) -> list[complex]:
    rng = random.Random(seed)
    state = [complex(rng.gauss(0, 1), rng.gauss(0, 1)) for _ in range(size)]
    norm = math.sqrt(sum(abs(x) ** 2 for x in state))
    return [x / norm for x in state]


@pytest.mark.parametrize("qubits", [1, 2, 3, 4, 5, 6, 7])
@pytest.mark.parametrize("inverse", [False, True])
def test_circuit_equals_the_discrete_fourier_transform(qubits: int, inverse: bool) -> None:
    """The load-bearing test: the gate sequence must equal the DFT matrix.

    A differential test against an independent implementation. `apply_qft` is
    Hadamards and controlled rotations; `dft_matrix` is one line straight from
    the definition. They share no code, so agreement is evidence about the
    circuit rather than about a common helper.

    This is what catches the two errors that a QFT tested only through a caller
    will hide -- a flipped sign convention and a reversed bit order.
    """
    state = _random_state(1 << qubits, seed=qubits + (100 if inverse else 0))
    circuit = list(state)
    apply_qft(circuit, qubits, inverse=inverse)
    reference = apply_dft(state, inverse=inverse)
    assert max(abs(a - b) for a, b in zip(circuit, reference)) < 1e-12


def test_ordering_not_just_angles() -> None:
    """An inverse is the adjoint gates in reverse order, not negated angles.

    Recorded because this exact mistake was made writing this module and slipped
    through a one-qubit check: on a single qubit the loop order cannot matter,
    so the transform was exactly right at n=1 and wrong at every larger width.
    A test that only covered n=1 would have passed.
    """
    state = _random_state(4, seed=3)
    forward = list(state)
    apply_qft(forward, 2, inverse=False)
    assert max(abs(a - b) for a, b in zip(forward, apply_dft(state, inverse=False))) < 1e-12
    # And the n=1 case cannot distinguish the two, which is why it is not enough.
    single = _random_state(2, seed=4)
    a, b = list(single), list(single)
    apply_qft(a, 1, inverse=False)
    apply_qft(b, 1, inverse=True)
    assert max(abs(x - y) for x, y in zip(a, b)) < 1e-12


@pytest.mark.parametrize("qubits", [1, 2, 3, 4, 5])
def test_inverse_undoes_forward(qubits: int) -> None:
    """Round trip returns the original state."""
    state = _random_state(1 << qubits, seed=qubits + 50)
    working = list(state)
    apply_qft(working, qubits, inverse=False)
    apply_qft(working, qubits, inverse=True)
    assert max(abs(a - b) for a, b in zip(working, state)) < 1e-12


def test_basis_state_becomes_uniform_in_magnitude() -> None:
    """QFT of a computational basis state is flat: every outcome equally likely.

    The information is entirely in the phases, which is the property phase
    estimation depends on -- so a transform that damaged magnitudes would break
    it while still looking plausible.
    """
    for qubits in (2, 3, 4):
        size = 1 << qubits
        for basis in (0, 1, size - 1):
            state = [0j] * size
            state[basis] = 1 + 0j
            apply_qft(state, qubits)
            expected = 1 / math.sqrt(size)
            assert all(abs(abs(x) - expected) < 1e-12 for x in state)


def test_preserves_norm() -> None:
    """The transform is unitary, so it cannot change the total probability."""
    for qubits in (1, 3, 5):
        state = _random_state(1 << qubits, seed=qubits + 9)
        apply_qft(state, qubits)
        assert abs(sum(abs(x) ** 2 for x in state) - 1.0) < 1e-12


def test_dft_matrix_is_unitary() -> None:
    """The reference must itself be right, or agreement proves nothing."""
    for size in (2, 4, 8):
        matrix = dft_matrix(size)
        for row in range(size):
            for column in range(size):
                inner = sum(matrix[row][k] * matrix[column][k].conjugate() for k in range(size))
                assert abs(inner - (1 if row == column else 0)) < 1e-12


def test_rejects_bad_widths() -> None:
    with pytest.raises(FourierError, match="at least one qubit"):
        apply_qft([1 + 0j], 0)
    with pytest.raises(FourierError, match="refuses rather than approximating"):
        apply_qft([1 + 0j], MAX_QFT_QUBITS + 1)
    with pytest.raises(FourierError, match="amplitudes"):
        apply_qft([1 + 0j, 0j, 0j], 2)


def test_phase_estimation_still_exact_after_delegation() -> None:
    """Phase estimation now calls this module; its exact case must be unchanged.

    phi = k/2^n is returned with probability 1. If delegation had altered the
    convention, this is where it would show.
    """
    from ketqat_runner.phase_estimation import estimate_phase

    for qubits in (3, 4):
        for k in range(1 << qubits):
            report = estimate_phase(k / (1 << qubits), counting_qubits=qubits)
            assert report["measured_integer"] == k
            assert abs(report["success_probability"] - 1.0) < 1e-9
