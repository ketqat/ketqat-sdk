"""Named channels with closed-form Kraus operators (used by run() params and by the tests)."""
from __future__ import annotations

import numpy as np

from .channels import PAULI_1Q, pauli_basis


def depolarizing(p: float, n_qubits: int = 1) -> list[np.ndarray]:
    """Phi(rho) = (1 - p) rho + p I/d, valid for 0 <= p <= d^2/(d^2-1)."""
    d = 2 ** n_qubits
    _, paulis = pauli_basis(n_qubits)
    weights = [1 - p + p / d ** 2] + [p / d ** 2] * (d * d - 1)
    if min(weights) < -1e-12:
        raise ValueError("depolarizing parameter out of range")
    return [np.sqrt(max(w, 0.0)) * m for w, m in zip(weights, paulis)]


def amplitude_damping(gamma: float) -> list[np.ndarray]:
    if not 0 <= gamma <= 1:
        raise ValueError("gamma must be in [0, 1]")
    return [np.array([[1, 0], [0, np.sqrt(1 - gamma)]], dtype=complex), np.array([[0, np.sqrt(gamma)], [0, 0]], dtype=complex)]


def pauli_channel(px: float, py: float, pz: float) -> list[np.ndarray]:
    pi = 1 - px - py - pz
    if min(pi, px, py, pz) < -1e-12:
        raise ValueError("Pauli probabilities must be non-negative and sum to <= 1")
    return [np.sqrt(max(p, 0.0)) * PAULI_1Q[k] for p, k in ((pi, "I"), (px, "X"), (py, "Y"), (pz, "Z"))]


def rotation(axis: str, theta: float) -> np.ndarray:
    p = PAULI_1Q[axis.upper()]
    return np.cos(theta / 2) * np.eye(2) - 1j * np.sin(theta / 2) * p
