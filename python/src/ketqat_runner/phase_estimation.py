"""Quantum phase estimation, executed as a real statevector simulation.

The runner's only algorithm family was `grover-search`, and that path does not
execute a circuit: it computes Grover's analytic success probability and draws
shots from it. That is a statistical model of the algorithm, disclosed as such,
but it means no algorithm here was ever actually simulated (ketqat-sdk#123).

This applies the gate sequence to a state vector, amplitude by amplitude:
Hadamards on the counting register, controlled phase rotations carrying the
kickback, then an inverse QFT. The output distribution is the Born rule applied
to the resulting state, not a formula for what it should be.

That matters beyond principle. Phase estimation has an exact answer when the
phase is a dyadic rational -- phi = k/2^n returns k with probability 1 -- so a
real simulation can be checked against theory. A model that computed the
textbook distribution would agree with the textbook by construction, and would
pass that check while proving nothing.
"""

from __future__ import annotations

import cmath
import math
from typing import Any

from .fourier import apply_qft


#: Above this the state vector stops being small. 2^20 complex amplitudes is
#: already 16 MB, and the runner refuses rather than approximating.
MAX_COUNTING_QUBITS = 16


def _hadamard_all(state: list[complex], qubits: int) -> None:
    """Apply H to every qubit of a `qubits`-wide register, in place."""
    inverse_root_two = 1 / math.sqrt(2)
    for target in range(qubits):
        stride = 1 << target
        for block in range(0, 1 << qubits, stride << 1):
            for offset in range(stride):
                index = block + offset
                partner = index + stride
                a = state[index]
                b = state[partner]
                state[index] = (a + b) * inverse_root_two
                state[partner] = (a - b) * inverse_root_two


def _phase_kickback(state: list[complex], qubits: int, phase: float) -> None:
    """Apply the controlled-U^(2^j) ladder against an eigenstate.

    Against an eigenstate the controlled operations act only as a phase on the
    counting register, which is what makes the eigenstate register unnecessary
    to carry. Qubit `j` controls U^(2^j), so basis state |k> picks up
    exp(2 pi i phi k) -- the k appears because the bits of k select which powers
    fired.
    """
    for index in range(1 << qubits):
        state[index] *= cmath.exp(2j * math.pi * phase * index)


def _inverse_qft(state: list[complex], qubits: int) -> None:
    """Inverse QFT, delegated to the shared primitive in `fourier`.

    This used to be implemented here. It was correct -- verified bit-identical
    to the extracted version, and both agree with a directly-constructed DFT
    matrix to floating-point precision -- but it was only ever exercised through
    phase estimation's output, where a wrong sign or bit order can hide behind
    "the most likely integer was right". `fourier` checks it against the DFT
    definition directly, which is the test that actually pins it down.
    """
    apply_qft(state, qubits, inverse=True)

def phase_estimation_distribution(phase: float, counting_qubits: int) -> list[float]:
    """Exact outcome distribution over the counting register.

    Returns probabilities indexed by the measured integer `k`, whose best
    estimate of the phase is `k / 2^n`.
    """
    if not 0 <= phase < 1:
        raise ValueError(f"Phase must lie in [0, 1), got {phase}.")
    if counting_qubits < 1:
        raise ValueError("Phase estimation needs at least one counting qubit.")
    if counting_qubits > MAX_COUNTING_QUBITS:
        raise ValueError(
            f"{counting_qubits} counting qubits exceeds the {MAX_COUNTING_QUBITS}-qubit ceiling. "
            "The runner refuses rather than approximating."
        )

    size = 1 << counting_qubits
    state: list[complex] = [0j] * size
    state[0] = 1 + 0j

    _hadamard_all(state, counting_qubits)
    _phase_kickback(state, counting_qubits, phase)
    _inverse_qft(state, counting_qubits)

    return [abs(amplitude) ** 2 for amplitude in state]


def estimate_phase(phase: float, counting_qubits: int) -> dict[str, Any]:
    """Run phase estimation and summarise what it recovered.

    `success_probability` is the probability of the *most likely* outcome, which
    for a dyadic phase is the exact answer and otherwise is the nearest
    representable one. It is reported next to the phase that outcome encodes, so
    a reader can see both how confident the algorithm is and what it is
    confident about -- a high probability on the wrong bin is a real failure
    mode and would otherwise look like success.
    """
    distribution = phase_estimation_distribution(phase, counting_qubits)
    size = 1 << counting_qubits

    best = max(range(size), key=lambda index: distribution[index])
    estimated = best / size

    # Distance on the circle: phase 0.99 and estimate 0.0 are close, not far.
    error = abs(estimated - phase)
    error = min(error, 1 - error)

    exact = abs(phase * size - round(phase * size)) < 1e-12

    return {
        "counting_qubits": counting_qubits,
        "true_phase": phase,
        "estimated_phase": estimated,
        "measured_integer": best,
        "success_probability": distribution[best],
        "phase_error": error,
        "distribution": distribution,
        # Stated because it is the difference between "this should be exact"
        # and "this is the best the register can represent".
        "phase_is_representable": exact,
        "resolution": 1 / size,
    }
