"""Quantum teleportation of one qubit through a Bell pair, as a state vector.

The protocol of Bennett, Brassard, Crepeau, Jozsa, Peres and Wootters (1993):
Alice holds the message qubit and one half of a Bell pair, Bob the other half.
Alice applies CNOT(message -> her half) and a Hadamard on the message qubit,
measures both, and sends the two classical bits; Bob applies X and/or Z
according to the bits and ends up holding the message state.

Everything here is exact. The three-qubit state is a vector of eight
amplitudes, every one of the four measurement outcomes is projected out
analytically, and the fidelity of Bob's qubit with the input is computed for
each branch -- so "the fidelity is 1" is a statement about all four branches,
not about the branches a sampler happened to visit. Shots only sample which
branch occurred, which is what a run on hardware would record.

Two analytic facts are reported beside the simulation so a reader can check
them: every outcome has probability exactly 1/4 whatever the input state, and
without Bob's corrections the fidelity averaged over the four outcomes is
exactly 1/2 for any pure input. Both fall out of the simulation rather than
being assumed, and the tests compare the simulation against them.

Qubit order is little-endian as elsewhere in this package: qubit 0 (the
message) is the least significant bit of a basis-state index, qubit 1 is
Alice's half of the pair and qubit 2 is Bob's.
"""

from __future__ import annotations

import cmath
import math
from typing import Any, Sequence

import numpy as np

#: Outcome labels are "m0 m1": the message qubit's bit after the Hadamard,
#: then Alice's half of the pair. m1 decides the X correction, m0 the Z.
OUTCOMES = ("00", "01", "10", "11")
BELL_PAIR = "|Phi+> = (|00> + |11>)/sqrt(2)"


class TeleportationError(ValueError):
    """An input state that cannot be teleported as specified."""


def bloch_state(theta: float, phi: float) -> np.ndarray:
    """cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>."""
    return np.array([math.cos(theta / 2), cmath.exp(1j * phi) * math.sin(theta / 2)], dtype=complex)


def random_state(rng: np.random.Generator) -> np.ndarray:
    """A Haar-random pure qubit state, with the global phase fixed so the |0> amplitude is real."""
    vector = rng.normal(size=2) + 1j * rng.normal(size=2)
    vector /= np.linalg.norm(vector)
    phase = cmath.exp(-1j * cmath.phase(complex(vector[0]))) if abs(vector[0]) > 1e-15 else 1.0
    return vector * phase


def validate_state(state: Sequence[complex]) -> np.ndarray:
    vector = np.asarray(state, dtype=complex)
    if vector.shape != (2,):
        raise TeleportationError(f"A single-qubit state needs 2 amplitudes, got shape {vector.shape}.")
    norm = float(np.linalg.norm(vector))
    if abs(norm - 1) > 1e-9:
        raise TeleportationError(f"The input state has norm {norm:.9f}; it must be normalised.")
    return vector


def bloch_vector(state: Sequence[complex]) -> tuple[float, float, float]:
    a0, a1 = validate_state(state)
    cross = complex(np.conj(a0) * a1)
    return (2 * cross.real, 2 * cross.imag, float(abs(a0) ** 2 - abs(a1) ** 2))


def bloch_angles(state: Sequence[complex]) -> tuple[float, float]:
    """(theta, phi) with |psi> = cos(theta/2)|0> + e^{i phi} sin(theta/2)|1> up to a global phase."""
    a0, a1 = validate_state(state)
    theta = 2 * math.acos(min(1.0, max(0.0, abs(a0))))
    phi = (cmath.phase(complex(a1)) - cmath.phase(complex(a0))) % (2 * math.pi) if abs(a1) > 1e-15 else 0.0
    return theta, phi


def _apply_single(state: np.ndarray, qubit: int, gate: np.ndarray) -> np.ndarray:
    """Apply a 2x2 gate to one qubit of a little-endian state vector."""
    size = state.shape[0]
    stride = 1 << qubit
    out = state.copy()
    for block in range(0, size, stride << 1):
        lo = slice(block, block + stride)
        hi = slice(block + stride, block + 2 * stride)
        a, b = state[lo], state[hi]
        out[lo] = gate[0, 0] * a + gate[0, 1] * b
        out[hi] = gate[1, 0] * a + gate[1, 1] * b
    return out


def _apply_cnot(state: np.ndarray, control: int, target: int) -> np.ndarray:
    out = state.copy()
    for index in range(state.shape[0]):
        if (index >> control) & 1:
            out[index ^ (1 << target)] = state[index]
    return out


_H = np.array([[1, 1], [1, -1]], dtype=complex) / math.sqrt(2)
_X = np.array([[0, 1], [1, 0]], dtype=complex)
_Z = np.array([[1, 0], [0, -1]], dtype=complex)


def teleport(state: Sequence[complex]) -> dict[str, Any]:
    """Run the protocol exactly and report every measurement branch.

    Returns, per outcome, its exact probability, the correction Bob applies, the
    fidelity of Bob's qubit with the input after the correction and -- for
    contrast -- before it.
    """
    message = validate_state(state)

    # |psi>_0 (x) |Phi+>_{12}, index = q0 + 2 q1 + 4 q2.
    full = np.zeros(8, dtype=complex)
    for q0 in range(2):
        full[q0 + 0 + 0] = message[q0] / math.sqrt(2)  # q1 = q2 = 0
        full[q0 + 2 + 4] = message[q0] / math.sqrt(2)  # q1 = q2 = 1

    full = _apply_cnot(full, control=0, target=1)
    full = _apply_single(full, 0, _H)

    branches = []
    for label in OUTCOMES:
        m0, m1 = int(label[0]), int(label[1])
        base = m0 + 2 * m1
        bob = np.array([full[base], full[base + 4]], dtype=complex)
        probability = float(np.vdot(bob, bob).real)
        if probability <= 0:
            raise TeleportationError(f"Outcome {label} has zero probability; the protocol is broken.")
        bob /= math.sqrt(probability)
        uncorrected_fidelity = float(abs(np.vdot(message, bob)) ** 2)

        corrected = bob
        gates = []
        if m1:
            corrected = _X @ corrected
            gates.append("X")
        if m0:
            corrected = _Z @ corrected
            gates.append("Z")
        fidelity = float(abs(np.vdot(message, corrected)) ** 2)
        branches.append(
            {
                "outcome": label,
                "probability": probability,
                "correction": " then ".join(gates) if gates else "none",
                "fidelity": fidelity,
                "fidelity_without_correction": uncorrected_fidelity,
            }
        )

    x, y, z = bloch_vector(message)
    theta, phi = bloch_angles(message)
    return {
        "input_state": {
            "amplitudes": [[float(message[0].real), float(message[0].imag)], [float(message[1].real), float(message[1].imag)]],
            "theta": theta,
            "phi": phi,
            "bloch_vector": [x, y, z],
        },
        "bell_pair": BELL_PAIR,
        "branches": branches,
        "min_fidelity": min(branch["fidelity"] for branch in branches),
        "max_fidelity": max(branch["fidelity"] for branch in branches),
        "average_fidelity_without_correction": sum(
            branch["probability"] * branch["fidelity_without_correction"] for branch in branches
        ),
    }


def teleportation_report(state: Sequence[complex], *, shots: int, seed: int) -> dict[str, Any]:
    """`teleport` plus seeded sampling of which measurement outcome occurred."""
    if shots < 1:
        raise TeleportationError(f"shots must be positive, got {shots}.")
    report = teleport(state)
    probabilities = np.array([branch["probability"] for branch in report["branches"]])
    probabilities /= probabilities.sum()
    rng = np.random.default_rng(seed)
    counts = rng.multinomial(shots, probabilities)
    report["shots"] = shots
    report["counts"] = {label: int(count) for label, count in zip(OUTCOMES, counts)}
    report["observed_frequencies"] = {label: int(count) / shots for label, count in zip(OUTCOMES, counts)}
    return report
