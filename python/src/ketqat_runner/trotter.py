"""Trotterized time evolution of the transverse-field Ising model
(ketqat-sdk#153).

Item 2's simulation family. Hamiltonian simulation is the one application where
a quantum computer's advantage is least disputed, and it is also the one where
the approximation is easiest to report dishonestly: a Trotter circuit always
produces *a* state, and without a reference there is nothing to say how far that
state is from the one being approximated.

Here there is a reference. For a handful of qubits the Hamiltonian is a small
matrix, so `exp(-iHt)` can be computed exactly by eigendecomposition -- H is
Hermitian, so `numpy.linalg.eigh` diagonalises it and the exponential is exact
up to floating point. The Trotter circuit is applied by hand as gates on
amplitudes. The two paths share no code, so the difference between them is the
Trotter error itself, **measured rather than bounded**.

That makes the stronger claim available: not "the error is small" but "the error
scales as theory says it must". First-order Trotter has global error O(t^2/r)
and second-order O(t^3/r^2), so the log-log slope of error against step count
should be -1 and -2. A slope is far harder to fake than a magnitude -- a wrong
implementation can be made accurate at one step count by tuning, but it will not
reproduce the exponent.

    H = -J * sum_<i,j> Z_i Z_j  -  h * sum_i X_i
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

MAX_TROTTER_QUBITS = 12


class TrotterError(ValueError):
    """An evolution that could not be set up or checked as specified."""


def _chain(qubits: int, periodic: bool) -> list[tuple[int, int]]:
    bonds = [(i, i + 1) for i in range(qubits - 1)]
    # A 2-site ring would double-count its single bond, so it is not closed.
    if periodic and qubits > 2:
        bonds.append((qubits - 1, 0))
    return bonds


def ising_hamiltonian(qubits: int, *, coupling: float, field: float, periodic: bool = False) -> np.ndarray:
    """Dense H for the transverse-field Ising chain.

    Built directly from the definition as a matrix, with no reference to the
    circuit that will approximate it -- that independence is the whole point.
    """
    if not 1 <= qubits <= MAX_TROTTER_QUBITS:
        raise TrotterError(f"{qubits} qubits is outside 1..{MAX_TROTTER_QUBITS} for a dense Hamiltonian.")

    size = 1 << qubits
    hamiltonian = np.zeros((size, size), dtype=complex)

    # Diagonal ZZ coupling: z = +1 for bit 0, -1 for bit 1.
    for basis in range(size):
        total = 0
        for left, right in _chain(qubits, periodic):
            z_left = 1 - 2 * ((basis >> left) & 1)
            z_right = 1 - 2 * ((basis >> right) & 1)
            total += z_left * z_right
        hamiltonian[basis, basis] = -coupling * total

    # Off-diagonal transverse field: X flips one bit.
    for basis in range(size):
        for qubit in range(qubits):
            hamiltonian[basis ^ (1 << qubit), basis] += -field

    return hamiltonian


def exact_evolution(hamiltonian: np.ndarray, time: float, state: np.ndarray) -> np.ndarray:
    """exp(-iHt)|psi>, computed exactly by eigendecomposition.

    H is Hermitian, so `eigh` gives real eigenvalues and a unitary basis; the
    exponential is then elementwise and exact up to floating point. No series
    truncation, so this reference carries no approximation of its own to be
    confused with the Trotter error being measured.
    """
    values, vectors = np.linalg.eigh(hamiltonian)
    return vectors @ (np.exp(-1j * values * time) * (vectors.conj().T @ state))


def trotter_evolution(
    qubits: int,
    *,
    coupling: float,
    field: float,
    time: float,
    steps: int,
    order: int = 1,
    periodic: bool = False,
    initial: Sequence[complex] | None = None,
) -> np.ndarray:
    """Apply the Trotter circuit, gate by gate on amplitudes.

    Written as explicit loops rather than matrix products so that this shares
    nothing with the exact reference -- a matrix-exponential shortcut here would
    make the comparison measure floating point rather than Trotter error.
    """
    if steps < 1:
        raise TrotterError(f"Evolution needs at least one step, not {steps}.")
    if order not in (1, 2):
        raise TrotterError(f"Only first- and second-order splittings are implemented, not order {order}.")

    size = 1 << qubits
    if initial is None:
        state = np.zeros(size, dtype=complex)
        state[0] = 1.0
    else:
        if len(initial) != size:
            raise TrotterError(f"A {qubits}-qubit state needs {size} amplitudes, got {len(initial)}.")
        state = np.array(initial, dtype=complex)

    bonds = _chain(qubits, periodic)
    dt = time / steps

    # Diagonal ZZ phases, precomputed once: the term is diagonal, so evolving
    # under it is a rephasing rather than a mixing.
    zz_sum = np.empty(size)
    for basis in range(size):
        total = 0
        for left, right in bonds:
            total += (1 - 2 * ((basis >> left) & 1)) * (1 - 2 * ((basis >> right) & 1))
        zz_sum[basis] = total

    def apply_zz(psi: np.ndarray, interval: float) -> None:
        psi *= np.exp(1j * coupling * interval * zz_sum)

    def apply_field(psi: np.ndarray, interval: float) -> None:
        # exp(i h dt X) = cos(h dt) I + i sin(h dt) X, applied per qubit.
        angle = field * interval
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        for target in range(qubits):
            stride = 1 << target
            for block in range(0, size, stride << 1):
                lo = slice(block, block + stride)
                hi = slice(block + stride, block + 2 * stride)
                a = psi[lo].copy()
                b = psi[hi].copy()
                psi[lo] = cos_a * a + 1j * sin_a * b
                psi[hi] = cos_a * b + 1j * sin_a * a

    for _ in range(steps):
        if order == 1:
            apply_zz(state, dt)
            apply_field(state, dt)
        else:
            # Strang splitting: half a field step either side of the coupling.
            apply_field(state, dt / 2)
            apply_zz(state, dt)
            apply_field(state, dt / 2)

    return state


def trotter_report(
    qubits: int,
    *,
    coupling: float = 1.0,
    field: float = 1.0,
    time: float = 1.0,
    steps: int = 10,
    order: int = 1,
    periodic: bool = False,
) -> dict[str, Any]:
    """Trotter error against exact dynamics, measured rather than bounded."""
    hamiltonian = ising_hamiltonian(qubits, coupling=coupling, field=field, periodic=periodic)
    initial = np.zeros(1 << qubits, dtype=complex)
    initial[0] = 1.0

    approximate = trotter_evolution(
        qubits, coupling=coupling, field=field, time=time, steps=steps, order=order, periodic=periodic
    )
    exact = exact_evolution(hamiltonian, time, initial)

    overlap = complex(np.vdot(exact, approximate))
    fidelity = abs(overlap) ** 2
    return {
        "qubits": qubits,
        "time": time,
        "steps": steps,
        "order": order,
        "fidelity": fidelity,
        "infidelity": 1 - fidelity,
        # Global phase is physically unobservable, so the state distance is
        # taken up to phase; reporting the raw norm difference would count a
        # phase convention as an error.
        "state_distance": float(np.linalg.norm(approximate - np.exp(1j * np.angle(overlap)) * exact)),
        "reference": "exp(-iHt) by eigendecomposition, exact up to floating point",
    }


def error_scaling(
    qubits: int,
    *,
    coupling: float = 1.0,
    field: float = 1.0,
    time: float = 1.0,
    order: int = 1,
    step_counts: Sequence[int] = (4, 8, 16, 32, 64),
    periodic: bool = False,
) -> dict[str, Any]:
    """Fit the exponent of Trotter error against step count.

    The exponent is the real test. A magnitude can be made to look good at one
    step count; the slope of log(error) against log(steps) cannot be tuned, and
    theory fixes it at -1 for first order and -2 for second.
    """
    errors = [
        trotter_report(
            qubits, coupling=coupling, field=field, time=time, steps=steps, order=order, periodic=periodic
        )["infidelity"]
        for steps in step_counts
    ]
    if any(error <= 0 for error in errors):
        raise TrotterError(
            "An error of zero cannot be fitted on a log scale. This usually means the terms commute, "
            "in which case the splitting is exact and there is no Trotter error to measure."
        )

    logs_x = np.log(np.array(step_counts, dtype=float))
    logs_y = np.log(np.array(errors))
    slope, intercept = np.polyfit(logs_x, logs_y, 1)

    # Infidelity is the square of a state distance, so its exponent is twice
    # the amplitude-error exponent: -2 for first order, -4 for second.
    return {
        "order": order,
        "step_counts": list(step_counts),
        "infidelities": errors,
        "slope": float(slope),
        "expected_slope": -2.0 * order,
        "intercept": float(intercept),
        "note": (
            f"Infidelity ~ steps^{slope:.2f}. Theory gives amplitude error O(t^{order + 1}/steps^{order}), "
            f"and infidelity is its square, so the expected slope is {-2.0 * order:.0f}."
        ),
    }
