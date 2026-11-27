"""Channel representations: Kraus, Choi, Liouville superoperator and Pauli transfer matrix.

Conventions (used everywhere in this package)
---------------------------------------------
* A channel Phi maps d_in x d_in matrices to d_out x d_out matrices and is given
  by Kraus operators K_k (each d_out x d_in): Phi(X) = sum_k K_k X K_k^dagger.
* Unnormalized Choi matrix (input (x) output ordering):
      J(Phi) = sum_{ij} |i><j| (x) Phi(|i><j|),   Tr J = d_in for a TP channel.
  The normalized Choi state is rho_Phi = J / d_in = (id (x) Phi)(|Phi+><Phi+|),
  with |Phi+> = d^{-1/2} sum_i |i>|i>.
* CP  <=> J >= 0.   TP <=> Tr_out J = I_in.
* Liouville superoperator, column stacking: vec(K X K^dag) = (conj(K) (x) K) vec(X),
  so S = sum_k conj(K_k) (x) K_k.
* Pauli transfer matrix (n qubits, d = 2^n): R_ij = Tr(P_i Phi(P_j)) / d with
  P_i ranging over n-qubit Pauli strings in lexicographic I, X, Y, Z order.
"""
from __future__ import annotations

from itertools import product as _product

import numpy as np

PAULI_1Q = {
    "I": np.eye(2, dtype=complex),
    "X": np.array([[0, 1], [1, 0]], dtype=complex),
    "Y": np.array([[0, -1j], [1j, 0]], dtype=complex),
    "Z": np.array([[1, 0], [0, -1]], dtype=complex),
}


def as_kraus(kraus) -> list[np.ndarray]:
    ops = [np.asarray(k, dtype=complex) for k in kraus]
    if not ops:
        raise ValueError("at least one Kraus operator is required")
    shape = ops[0].shape
    if len(shape) != 2 or any(op.shape != shape for op in ops):
        raise ValueError("Kraus operators must be 2-D matrices of one common shape")
    return ops


def dims(kraus: list[np.ndarray]) -> tuple[int, int]:
    d_out, d_in = kraus[0].shape
    return d_in, d_out


def apply(kraus: list[np.ndarray], rho: np.ndarray) -> np.ndarray:
    return sum(k @ rho @ k.conj().T for k in kraus)


def kraus_to_choi(kraus) -> np.ndarray:
    """Unnormalized Choi matrix J (input (x) output); see module docstring."""
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    choi = np.zeros((d_in * d_out, d_in * d_out), dtype=complex)
    for i in range(d_in):
        for j in range(d_in):
            e = np.zeros((d_in, d_in), dtype=complex)
            e[i, j] = 1.0
            choi += np.kron(e, apply(ops, e))
    return choi


def kraus_to_superoperator(kraus) -> np.ndarray:
    ops = as_kraus(kraus)
    return sum(np.kron(k.conj(), k) for k in ops)


def partial_trace_output(choi: np.ndarray, d_in: int, d_out: int) -> np.ndarray:
    return np.trace(choi.reshape(d_in, d_out, d_in, d_out), axis1=1, axis2=3)


def cptp_check(kraus, tolerance: float = 1e-9) -> dict:
    """CP from the Choi spectrum, TP from Tr_out J = I (equivalently sum K^dag K = I)."""
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    choi = kraus_to_choi(ops)
    herm = (choi + choi.conj().T) / 2
    min_eig = float(np.min(np.linalg.eigvalsh(herm)))
    tp_dev = float(np.linalg.norm(partial_trace_output(choi, d_in, d_out) - np.eye(d_in), ord=2))
    return {
        "completely_positive": bool(min_eig >= -tolerance),
        "trace_preserving": bool(tp_dev <= tolerance),
        "min_choi_eigenvalue": min_eig,
        "trace_preservation_deviation": tp_dev,
        "tolerance": tolerance,
    }


def is_qubit_dimension(d: int) -> bool:
    return d >= 2 and (d & (d - 1)) == 0


def pauli_basis(n_qubits: int) -> tuple[list[str], list[np.ndarray]]:
    labels, mats = [], []
    for letters in _product("IXYZ", repeat=n_qubits):
        m = np.array([[1.0 + 0j]])
        for letter in letters:
            m = np.kron(m, PAULI_1Q[letter])
        labels.append("".join(letters))
        mats.append(m)
    return labels, mats


def kraus_to_ptm(kraus) -> tuple[list[str], np.ndarray]:
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    if d_in != d_out or not is_qubit_dimension(d_in):
        raise ValueError("the Pauli transfer matrix is defined here for n-qubit channels (d_in = d_out = 2^n)")
    n = int(round(np.log2(d_in)))
    labels, paulis = pauli_basis(n)
    ptm = np.array([[np.trace(p_i @ apply(ops, p_j)).real / d_in for p_j in paulis] for p_i in paulis])
    return labels, ptm


def pauli_channel_probabilities(kraus, tolerance: float = 1e-9) -> dict[str, float] | None:
    """Pauli error probabilities if the channel is a Pauli channel, else None.

    A channel is a Pauli channel exactly when its normalized Choi state is
    diagonal in the Bell basis |Phi_P> = (I (x) P)|Phi+>; then p_P = <Phi_P|rho_Phi|Phi_P>.
    """
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    if d_in != d_out or not is_qubit_dimension(d_in):
        return None
    n = int(round(np.log2(d_in)))
    labels, paulis = pauli_basis(n)
    phi_plus = np.eye(d_in, dtype=complex).reshape(-1) / np.sqrt(d_in)
    bell = np.column_stack([np.kron(np.eye(d_in), p) @ phi_plus for p in paulis])
    rho = kraus_to_choi(ops) / d_in
    in_bell = bell.conj().T @ rho @ bell
    off = in_bell - np.diag(np.diag(in_bell))
    if np.max(np.abs(off)) > tolerance:
        return None
    return {label: float(in_bell[i, i].real) for i, label in enumerate(labels)}
