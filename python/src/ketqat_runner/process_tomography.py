"""Process tomography and multi-qubit state tomography (ketqat-sdk#178).

Item 9's last tomography gaps. State tomography reconstructs a state; process
tomography reconstructs the *channel* -- what a gate actually does, including how
it fails.

Why the Pauli transfer matrix
-----------------------------
A single-qubit channel is represented here by its Pauli transfer matrix,
R[i][j] = Tr[sigma_i E(sigma_j)] / 2. Two reasons, both practical.

**Known channels have known PTMs, exactly.** The identity is the 4x4 identity; an
X gate is diag(1, 1, -1, -1); depolarizing with strength p is
diag(1, 1-p, 1-p, 1-p). So a reconstruction can be checked against an analytic
matrix rather than against another reconstruction. That is the same discipline
used for the QFT and HHL, and it is what makes a tomography result trustworthy
rather than merely self-consistent.

**The entries mean something.** The diagonal is how much each Pauli component
survives; the first row and column say whether the channel is trace-preserving
and unital. A reader can see *which* axis a gate damages, not just that fidelity
fell.

Physicality is reported, never repaired
---------------------------------------
Finite statistics routinely produce a reconstruction that is not completely
positive -- a Choi matrix with a negative eigenvalue, describing no physical
channel. Projecting onto the nearest valid channel is defensible but it *changes
the estimate*, and a caller told only the projected result cannot tell a clean
measurement from a rescued one. So this reports, with the negative eigenvalue,
and leaves the matrix alone. Same choice as the single-qubit state tomography this
extends, for the same reason.
"""

from __future__ import annotations

from typing import Any, Callable, Sequence

import numpy as np

_I = np.eye(2, dtype=complex)
_X = np.array([[0, 1], [1, 0]], dtype=complex)
_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
_Z = np.array([[1, 0], [0, -1]], dtype=complex)

#: Single-qubit Pauli basis, in the order the PTM rows and columns follow.
PAULI_BASIS: tuple[tuple[str, np.ndarray], ...] = (("I", _I), ("X", _X), ("Y", _Y), ("Z", _Z))

#: Below this a Choi eigenvalue counts as numerical noise rather than a negative.
COMPLETE_POSITIVITY_TOLERANCE = 1e-9


class ProcessTomographyError(ValueError):
    """A reconstruction that could not be performed as specified."""


Channel = Callable[[np.ndarray], np.ndarray]


def pauli_transfer_matrix(channel: Channel) -> np.ndarray:
    """Reconstruct R[i][j] = Tr[sigma_i E(sigma_j)] / 2.

    Applies the channel to each Pauli basis element directly. That is what a
    tomography experiment approximates by preparing states and measuring
    observables, and doing it exactly here separates errors in the reconstruction
    from errors in the sampling.
    """
    matrix = np.zeros((4, 4), dtype=float)
    for column, (_, basis) in enumerate(PAULI_BASIS):
        mapped = channel(basis)
        if mapped.shape != (2, 2):
            raise ProcessTomographyError(
                f"The channel returned a {mapped.shape} matrix; a single-qubit channel must return 2x2."
            )
        for row, (_, observable) in enumerate(PAULI_BASIS):
            value = np.trace(observable.conj().T @ mapped) / 2
            if abs(value.imag) > 1e-9:
                raise ProcessTomographyError(
                    f"R[{row}][{column}] has an imaginary part ({value.imag:.2e}). The Pauli transfer "
                    "matrix of a Hermiticity-preserving channel is real, so this channel is not one."
                )
            matrix[row, column] = value.real
    return matrix


def choi_from_channel(channel: Channel) -> np.ndarray:
    """Choi matrix, whose positivity is exactly complete positivity of the channel.

    Built by applying the channel to one half of an unnormalised maximally
    entangled state -- the Choi-Jamiolkowski correspondence. Positivity of this
    matrix is the definition of a physical channel, which is why physicality is
    judged here rather than from the PTM.
    """
    choi = np.zeros((4, 4), dtype=complex)
    for i in range(2):
        for j in range(2):
            unit = np.zeros((2, 2), dtype=complex)
            unit[i, j] = 1.0
            block = channel(unit)
            choi[2 * i : 2 * i + 2, 2 * j : 2 * j + 2] = block
    return choi


def analytic_ptm(name: str, strength: float = 0.0) -> np.ndarray:
    """PTMs of channels whose form is known exactly, for use as references.

    Written from the definitions rather than derived from `pauli_transfer_matrix`,
    so agreement between the two is evidence about the reconstruction rather than
    about a shared helper.
    """
    if name == "identity":
        return np.eye(4)
    if name == "x":
        return np.diag([1.0, 1.0, -1.0, -1.0])
    if name == "y":
        return np.diag([1.0, -1.0, 1.0, -1.0])
    if name == "z":
        return np.diag([1.0, -1.0, -1.0, 1.0])
    if name == "hadamard":
        # H swaps X and Z and negates Y.
        matrix = np.zeros((4, 4))
        matrix[0, 0] = 1.0
        matrix[1, 3] = 1.0
        matrix[2, 2] = -1.0
        matrix[3, 1] = 1.0
        return matrix
    if name == "depolarizing":
        if not 0.0 <= strength <= 1.0:
            raise ProcessTomographyError(f"Depolarizing strength must be in [0, 1], got {strength}.")
        return np.diag([1.0, 1 - strength, 1 - strength, 1 - strength])
    if name == "amplitude_damping":
        if not 0.0 <= strength <= 1.0:
            raise ProcessTomographyError(f"Damping strength must be in [0, 1], got {strength}.")
        keep = float(np.sqrt(1 - strength))
        # Amplitude damping shrinks X and Y by sqrt(1-g), Z by (1-g), and shifts
        # Z by g -- the shift is what makes it non-unital.
        matrix = np.zeros((4, 4))
        matrix[0, 0] = 1.0
        matrix[1, 1] = keep
        matrix[2, 2] = keep
        matrix[3, 3] = 1 - strength
        matrix[3, 0] = strength
        return matrix
    raise ProcessTomographyError(f"No analytic PTM for {name!r}.")


def unitary_channel(unitary: np.ndarray) -> Channel:
    """Channel for a unitary gate."""
    return lambda rho: unitary @ rho @ unitary.conj().T


def depolarizing_channel(strength: float) -> Channel:
    """E(rho) = (1 - p) rho + p I/2, the convention `analytic_ptm` matches."""
    return lambda rho: (1 - strength) * rho + strength * np.trace(rho) * _I / 2


def amplitude_damping_channel(strength: float) -> Channel:
    """Kraus form, so the reconstruction is not handed the PTM it is checked against."""
    k0 = np.array([[1, 0], [0, np.sqrt(1 - strength)]], dtype=complex)
    k1 = np.array([[0, np.sqrt(strength)], [0, 0]], dtype=complex)
    return lambda rho: k0 @ rho @ k0.conj().T + k1 @ rho @ k1.conj().T


def describe_channel(channel: Channel) -> dict[str, Any]:
    """Reconstruct a channel and report what it is, including whether it is physical."""
    ptm = pauli_transfer_matrix(channel)
    choi = choi_from_channel(channel)
    eigenvalues = np.linalg.eigvalsh(choi)
    smallest = float(eigenvalues.min())

    # Trace preservation shows up as the first row being (1, 0, 0, 0): the channel
    # maps the identity's coefficient to itself and mixes nothing into it.
    trace_preserving = bool(np.allclose(ptm[0, :], [1, 0, 0, 0], atol=1e-9))
    # Unital channels leave the maximally mixed state alone, i.e. no Pauli
    # component is created from the identity.
    unital = bool(np.allclose(ptm[1:, 0], 0, atol=1e-9))

    physical = smallest >= -COMPLETE_POSITIVITY_TOLERANCE
    return {
        "pauli_transfer_matrix": ptm.tolist(),
        "choi_eigenvalues": eigenvalues.tolist(),
        "smallest_choi_eigenvalue": smallest,
        "completely_positive": physical,
        "trace_preserving": trace_preserving,
        "unital": unital,
        # Average gate fidelity for a single qubit: (Tr[R_ideal^T R] / d + d) / (d + 1)
        # is the standard relation; against the identity it reduces to the form below.
        "average_fidelity_with_identity": float((np.trace(ptm) / 2 + 1) / 3),
        "physicality_note": (
            "Completely positive within tolerance."
            if physical
            else f"NOT completely positive: smallest Choi eigenvalue {smallest:.4e}. Returned "
            "unprojected -- projecting would change the estimate and hide that it needed rescuing."
        ),
    }


def compare_with_analytic(channel: Channel, name: str, strength: float = 0.0) -> dict[str, Any]:
    """Check a reconstruction against an independently written analytic PTM."""
    reconstructed = pauli_transfer_matrix(channel)
    reference = analytic_ptm(name, strength)
    difference = float(np.abs(reconstructed - reference).max())
    return {
        "channel": name,
        "strength": strength,
        "max_entry_difference": difference,
        "agrees": difference < 1e-9,
        "reconstructed": reconstructed.tolist(),
        "analytic": reference.tolist(),
    }


def multi_qubit_state_tomography(state: Sequence[complex], qubits: int) -> dict[str, Any]:
    """Reconstruct a multi-qubit density matrix from Pauli expectation values.

    The generalisation of the single-qubit case: a 2^n x 2^n density matrix is
    determined by the 4^n Pauli expectation values, and reconstructed as
    rho = sum_P <P> P / 2^n.

    Physicality is reported rather than enforced, as in the single-qubit case, and
    it matters more here: the number of Pauli terms grows as 4^n while the number
    of shots does not, so an unphysical reconstruction becomes *more* likely as the
    system grows, not less.
    """
    if qubits < 1:
        raise ProcessTomographyError(f"Tomography needs at least one qubit, not {qubits}.")
    size = 1 << qubits
    vector = np.asarray(state, dtype=complex)
    if vector.shape != (size,):
        raise ProcessTomographyError(f"A {qubits}-qubit state needs {size} amplitudes, got {vector.shape}.")

    density = np.outer(vector, vector.conj())

    # Every n-fold tensor product of Paulis, in odometer order.
    labels: list[str] = []
    expectations: list[float] = []
    reconstructed = np.zeros((size, size), dtype=complex)
    for index in range(4**qubits):
        operator = np.array([[1.0 + 0j]])
        label = ""
        remaining = index
        for _ in range(qubits):
            name, matrix = PAULI_BASIS[remaining % 4]
            operator = np.kron(operator, matrix)
            label += name
            remaining //= 4
        value = np.trace(operator @ density)
        if abs(value.imag) > 1e-9:
            raise ProcessTomographyError(
                f"Pauli expectation for {label} is not real ({value.imag:.2e}); the input is not a "
                "valid density matrix."
            )
        labels.append(label)
        expectations.append(float(value.real))
        reconstructed += value.real * operator / size

    eigenvalues = np.linalg.eigvalsh(reconstructed)
    smallest = float(eigenvalues.min())
    physical = smallest >= -COMPLETE_POSITIVITY_TOLERANCE

    return {
        "qubits": qubits,
        "pauli_terms": len(labels),
        "pauli_labels": labels,
        "expectations": expectations,
        "density_matrix_real": reconstructed.real.tolist(),
        "density_matrix_imaginary": reconstructed.imag.tolist(),
        "trace": float(np.trace(reconstructed).real),
        "purity": float(np.trace(reconstructed @ reconstructed).real),
        "smallest_eigenvalue": smallest,
        "physical": physical,
        "reconstruction_error": float(np.abs(reconstructed - density).max()),
        "note": (
            f"Reconstructed from all {len(labels)} Pauli expectation values. The term count grows as "
            "4^n while shot budgets do not, so an unphysical reconstruction becomes more likely as the "
            "system grows -- it is reported, never projected."
        ),
    }
