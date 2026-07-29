"""HHL: solving a linear system on a quantum computer (ketqat-sdk#157).

Item 2's linear-algebra family. A linear solver is the ideal family to verify,
because the answer is not merely checkable -- it is *classically computable*.
`numpy.linalg.solve` gives A^-1 b exactly, so the quantum output can be compared
against truth rather than against a bound or a prior run.

Scope, stated up front because HHL is the algorithm most often oversold
-----------------------------------------------------------------------
**The eigenvalue register is finite, so HHL is exact only when A's eigenvalues
are exactly representable in the clock register.** Otherwise phase estimation
rounds, and the rounding shows up as fidelity loss in the answer. This module
does not hide that: it reports whether the spectrum is representable, and the
tests measure the error in both regimes rather than only demonstrating the happy
one.

**The controlled evolution is applied as a matrix, not compiled to gates.** That
simulates HHL's algorithmic structure exactly, but it means this module says
nothing about the gate cost of Hamiltonian simulation -- which is where HHL's
real cost lives. Any resource claim would have to come from elsewhere.

**Post-selection is a real cost, not a detail.** The useful branch is the one
where the ancilla reads 1, and its probability falls as the condition number
grows. That probability is reported, because an algorithm that succeeds one time
in ten thousand is not fast.

    |ancilla> (x) |clock> (x) |b>
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from .fourier import apply_qft

MAX_CLOCK_QUBITS = 8


class LinearSolverError(ValueError):
    """A system that could not be set up or solved as specified."""


def _check(matrix: np.ndarray, vector: np.ndarray) -> None:
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        raise LinearSolverError(f"A must be square, got shape {matrix.shape}.")
    if not np.allclose(matrix, matrix.conj().T):
        raise LinearSolverError(
            "A must be Hermitian. HHL evolves under exp(iAt), which is unitary only for Hermitian A."
        )
    if vector.shape != (matrix.shape[0],):
        raise LinearSolverError(f"b has shape {vector.shape}, expected {(matrix.shape[0],)}.")
    if np.allclose(vector, 0):
        raise LinearSolverError("b is the zero vector, so the solution is trivially zero.")
    eigenvalues = np.linalg.eigvalsh(matrix)
    if np.any(np.abs(eigenvalues) < 1e-12):
        raise LinearSolverError(f"A is singular (eigenvalue {eigenvalues[np.argmin(abs(eigenvalues))]:.2e}).")
    if np.any(eigenvalues < 0):
        raise LinearSolverError(
            "This implementation requires positive eigenvalues; a negative spectrum needs a sign qubit."
        )


def spectrum_is_representable(matrix: np.ndarray, clock_qubits: int, evolution_time: float) -> dict[str, Any]:
    """Whether phase estimation can resolve A's eigenvalues exactly.

    Reported rather than assumed. HHL is exact precisely when each eigenvalue
    maps to an integer in the clock register, and approximate otherwise -- so
    knowing which regime a run is in decides whether "fidelity 1" is achievable
    at all, or whether a shortfall is expected behaviour.
    """
    eigenvalues = np.linalg.eigvalsh(matrix)
    size = 1 << clock_qubits
    encoded = eigenvalues * evolution_time * size / (2 * math.pi)
    residuals = np.abs(encoded - np.round(encoded))
    return {
        "eigenvalues": eigenvalues.tolist(),
        "encoded_integers": encoded.tolist(),
        "max_rounding_residual": float(residuals.max()),
        "representable": bool(residuals.max() < 1e-9),
        "condition_number": float(abs(eigenvalues).max() / abs(eigenvalues).min()),
    }


def solve(
    matrix: np.ndarray,
    vector: np.ndarray,
    *,
    clock_qubits: int = 4,
    evolution_time: float | None = None,
) -> dict[str, Any]:
    """Run HHL and compare the result against a classical solve.

    The comparison is the point. A quantum linear solver that cannot be checked
    is indistinguishable from a plausible-looking state, and for systems this
    size the true answer is one call away.
    """
    matrix = np.asarray(matrix, dtype=complex)
    vector = np.asarray(vector, dtype=complex)
    _check(matrix, vector)

    if not 1 <= clock_qubits <= MAX_CLOCK_QUBITS:
        raise LinearSolverError(f"clock_qubits must be 1..{MAX_CLOCK_QUBITS}, got {clock_qubits}.")

    dimension = matrix.shape[0]
    system_qubits = int(math.log2(dimension))
    if 1 << system_qubits != dimension:
        raise LinearSolverError(f"A has dimension {dimension}, which is not a power of two.")

    eigenvalues, eigenvectors = np.linalg.eigh(matrix)

    # Default t maps the largest eigenvalue to the top of the clock register, so
    # the spectrum is resolved as finely as the register allows.
    clock_size = 1 << clock_qubits
    if evolution_time is None:
        evolution_time = 2 * math.pi * (clock_size - 1) / (clock_size * eigenvalues.max())

    spectrum = spectrum_is_representable(matrix, clock_qubits, evolution_time)

    # State layout: ancilla (1) x clock (clock_qubits) x system (system_qubits),
    # flattened. Working in the eigenbasis of A makes the controlled evolution
    # diagonal, which is exact -- no Trotter error enters the answer.
    normalised = vector / np.linalg.norm(vector)
    amplitudes_in_eigenbasis = eigenvectors.conj().T @ normalised

    # Phase estimation: clock register holds sum over k of e^{i lambda t k}|k>.
    clock = np.zeros((clock_size, dimension), dtype=complex)
    for index in range(dimension):
        phases = np.exp(1j * eigenvalues[index] * evolution_time * np.arange(clock_size))
        clock[:, index] = amplitudes_in_eigenbasis[index] * phases / math.sqrt(clock_size)

    # Inverse QFT on the clock register, using the primitive verified against the
    # DFT matrix rather than a second hand-rolled transform.
    for index in range(dimension):
        column = list(clock[:, index])
        apply_qft(column, clock_qubits, inverse=True)
        clock[:, index] = column

    # Controlled rotation: ancilla amplitude C/lambda, with C = smallest
    # eigenvalue so every rotation stays within range.
    constant = float(abs(eigenvalues).min())
    ancilla_one = np.zeros_like(clock)
    ancilla_zero = np.zeros_like(clock)
    for measured in range(clock_size):
        # Recover the eigenvalue this clock value encodes.
        if measured == 0:
            ratio = 0.0
        else:
            lam = 2 * math.pi * measured / (evolution_time * clock_size)
            ratio = min(1.0, constant / abs(lam))
        ancilla_one[measured, :] = clock[measured, :] * ratio
        ancilla_zero[measured, :] = clock[measured, :] * math.sqrt(max(0.0, 1 - ratio**2))

    # Undo phase estimation on the useful branch: QFT back, then unwind the
    # controlled evolution.
    for index in range(dimension):
        column = list(ancilla_one[:, index])
        apply_qft(column, clock_qubits, inverse=False)
        ancilla_one[:, index] = column

    solution_in_eigenbasis = np.zeros(dimension, dtype=complex)
    for index in range(dimension):
        phases = np.exp(-1j * eigenvalues[index] * evolution_time * np.arange(clock_size))
        solution_in_eigenbasis[index] = np.sum(ancilla_one[:, index] * phases) / math.sqrt(clock_size)

    success_probability = float(np.sum(np.abs(ancilla_one) ** 2))
    quantum = eigenvectors @ solution_in_eigenbasis

    classical = np.linalg.solve(matrix, normalised)
    classical_direction = classical / np.linalg.norm(classical)

    if np.linalg.norm(quantum) < 1e-14:
        raise LinearSolverError(
            "The post-selected branch has vanishing amplitude, so no solution can be read out. "
            "This usually means the clock register cannot resolve the spectrum at all."
        )
    quantum_direction = quantum / np.linalg.norm(quantum)

    fidelity = float(abs(np.vdot(classical_direction, quantum_direction)) ** 2)

    return {
        "solution": quantum_direction.tolist(),
        "classical_solution": classical_direction.tolist(),
        # HHL returns a state, so only the direction of x is recoverable -- the
        # overall scale is not, and reporting a scaled vector would imply
        # information the algorithm does not produce.
        "fidelity_with_classical": fidelity,
        "success_probability": success_probability,
        "clock_qubits": clock_qubits,
        "evolution_time": evolution_time,
        "condition_number": spectrum["condition_number"],
        "spectrum_representable": spectrum["representable"],
        "max_rounding_residual": spectrum["max_rounding_residual"],
        "note": (
            "Fidelity is against numpy.linalg.solve. Only the direction of x is compared: HHL yields a "
            "normalised state, so the scale is not recoverable. "
            + (
                "The spectrum is exactly representable in this clock register, so any shortfall is a bug."
                if spectrum["representable"]
                else "The spectrum is NOT exactly representable here, so phase estimation rounds and some "
                "fidelity loss is expected rather than a defect."
            )
        ),
    }
