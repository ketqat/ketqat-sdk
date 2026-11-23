"""Fidelities, unitarity and diamond-norm distances.

Diamond norm convention
-----------------------
||Delta||_diamond = max over density matrices rho on (input (x) reference) of
|| (Delta (x) id)(rho) ||_1, with the trace norm ||A||_1 = Tr|A|. Values for a
difference of two channels lie in [0, 2]. "Diamond distance" below means this
quantity, NOT half of it.

Bounds from the Choi matrix (J unnormalized, see channels.py):

    ||J1 - J2||_1 / d_in  <=  ||Phi1 - Phi2||_diamond  <=  ||J1 - J2||_1

Equivalently, with normalized Choi states rho_i = J_i / d_in:
    ||rho1 - rho2||_1 <= ||Phi1 - Phi2||_diamond <= d_in ||rho1 - rho2||_1.

Lower bound: (Delta (x) id)(|Phi+><Phi+|) = (J1 - J2)/d_in is one admissible
input (the maximally entangled state; Delta acts on the first factor up to
the swap that does not change the trace norm).
Upper bound: every pure input is |psi> = sqrt(d) (Y (x) I)|Phi+> -- here Y
acts on the reference -- with ||Y||_2 = 1, so ||Y||_inf <= 1 and
||(Delta (x) id)(psi)||_1 = d ||Y' ((J1-J2)/d) Y'^dag||_1 <= ||J1 - J2||_1.
Pure inputs suffice by convexity.

Exact cases implemented:
* Pauli channels (n qubits): ||Phi_p - Phi_q||_diamond = sum_P |p_P - q_P|;
  versus the identity, 2 (1 - p_I). Lower bound from the maximally entangled
  input (the Choi difference is Bell-diagonal), upper bound from the triangle
  inequality with ||P.P||_diamond = 1.
* Two unitary channels U, V: with W = V^dag U and delta the distance from 0
  to the convex hull of W's eigenvalues, ||U.U^dag - V.V^dag||_diamond =
  2 sqrt(1 - delta^2) (Aharonov-Kitaev-Nisan; Watrous, Theory of QI, Thm 3.55).
"""
from __future__ import annotations

import numpy as np

from .channels import as_kraus, dims, kraus_to_choi, kraus_to_superoperator, pauli_channel_probabilities, pauli_basis, is_qubit_dimension

CONVENTION = (
    "||Phi1-Phi2||_diamond = max_rho ||((Phi1-Phi2) (x) id)(rho)||_1, range [0, 2] (not halved). "
    "Choi bounds use the unnormalized Choi matrix J (Tr J = d_in): ||J1-J2||_1/d_in <= ||.||_diamond <= ||J1-J2||_1."
)


def trace_norm(a: np.ndarray) -> float:
    return float(np.sum(np.linalg.svd(a, compute_uv=False)))


def entanglement_fidelity(kraus, target_unitary: np.ndarray) -> float:
    """F_e = <Phi+| (id (x) U^dag Phi)(Phi+) |Phi+> = sum_k |Tr(U^dag K_k)|^2 / d^2."""
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    u = np.asarray(target_unitary, dtype=complex)
    if d_in != d_out or u.shape != (d_in, d_in):
        raise ValueError("fidelity needs a square channel and a target unitary of the same dimension")
    return float(sum(abs(np.trace(u.conj().T @ k)) ** 2 for k in ops) / d_in ** 2)


def average_gate_fidelity(kraus, target_unitary: np.ndarray) -> float:
    """F_avg = (d F_e + 1) / (d + 1) (Horodecki-Horodecki-Horodecki 1999; Nielsen 2002), for TP channels."""
    d = dims(as_kraus(kraus))[0]
    return (d * entanglement_fidelity(kraus, target_unitary) + 1) / (d + 1)


def unitarity(kraus) -> float:
    """Wallman et al. 2015: u = Tr(M^dag M)/(d^2 - 1), M the unital block of the transfer matrix.

    Basis-free form for a TP channel: u = (Tr(S^dag S) - Tr(Phi(I)^2)/d) / (d^2 - 1),
    S the Liouville superoperator.
    """
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    if d_in != d_out:
        raise ValueError("unitarity is defined for square channels")
    d = d_in
    s = kraus_to_superoperator(ops)
    phi_i = sum(k @ k.conj().T for k in ops)
    return float((np.real(np.trace(s.conj().T @ s)) - np.real(np.trace(phi_i @ phi_i)) / d) / (d * d - 1))


def is_unitary_channel(kraus, tolerance: float = 1e-9) -> np.ndarray | None:
    """The unitary U if the channel is X -> U X U^dag (Kraus rank 1), else None."""
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    if d_in != d_out:
        return None
    choi = kraus_to_choi(ops)
    eig = np.linalg.eigvalsh((choi + choi.conj().T) / 2)
    if np.sum(eig > tolerance * max(1.0, eig[-1])) != 1:
        return None
    # The single Kraus operator is sqrt(d * lambda) * unvec(eigenvector).
    w, v = np.linalg.eigh((choi + choi.conj().T) / 2)
    vec = v[:, -1] * np.sqrt(w[-1])
    u = vec.reshape(d_in, d_out).T  # J = vec(K)vec(K)^dag with input-major ordering
    if np.linalg.norm(u.conj().T @ u - np.eye(d_in), ord=2) > 1e-7:
        return None
    return u


def _hull_distance_to_origin(phases: np.ndarray) -> float:
    """Distance from 0 to the convex hull of unit-circle points e^{i phase}."""
    angles = np.sort(np.mod(phases, 2 * np.pi))
    gaps = np.diff(np.concatenate([angles, [angles[0] + 2 * np.pi]]))
    arc = 2 * np.pi - float(np.max(gaps))  # smallest arc containing all points
    return float(np.cos(arc / 2)) if arc < np.pi else 0.0


def unitary_diamond_distance(u: np.ndarray, v: np.ndarray) -> float:
    w = v.conj().T @ u
    delta = _hull_distance_to_origin(np.angle(np.linalg.eigvals(w)))
    return float(2 * np.sqrt(max(0.0, 1 - delta * delta)))


def pauli_label_of(u: np.ndarray, tolerance: float = 1e-9) -> str | None:
    """Pauli-string label if u equals a Pauli string up to a global phase."""
    d = u.shape[0]
    if not is_qubit_dimension(d):
        return None
    labels, paulis = pauli_basis(int(round(np.log2(d))))
    for label, p in zip(labels, paulis):
        overlap = np.trace(p.conj().T @ u) / d
        if abs(abs(overlap) - 1) < tolerance:
            return label
    return None


def diamond_distance(kraus, target_unitary: np.ndarray, tolerance: float = 1e-9) -> dict:
    """Exact where a closed form applies (Pauli channel vs Pauli target; unitary vs unitary), bounds otherwise."""
    ops = as_kraus(kraus)
    d_in, _ = dims(ops)
    target = np.asarray(target_unitary, dtype=complex)
    target_kraus = [target]
    diff = kraus_to_choi(ops) - kraus_to_choi(target_kraus)
    norm = trace_norm(diff)
    bounds = {"lower": norm / d_in, "upper": norm}

    probabilities = pauli_channel_probabilities(ops, tolerance)
    target_label = pauli_label_of(target, tolerance)
    if probabilities is not None and target_label is not None:
        value = float(sum(abs(p - (1.0 if label == target_label else 0.0)) for label, p in probabilities.items()))
        return {"kind": "exact", "method": "pauli-channel-l1", "value": value, "choi_bounds": bounds,
                "pauli_probabilities": probabilities, "convention": CONVENTION}
    u = is_unitary_channel(ops, tolerance)
    if u is not None:
        return {"kind": "exact", "method": "unitary-eigenvalue-hull", "value": unitary_diamond_distance(u, target),
                "choi_bounds": bounds, "convention": CONVENTION}
    return {"kind": "bounds", "method": "choi-trace-norm", "lower": bounds["lower"], "upper": bounds["upper"], "convention": CONVENTION}
