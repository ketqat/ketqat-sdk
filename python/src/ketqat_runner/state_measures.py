"""Quantum state measures on density matrices, in NumPy.

Everything here is the textbook definition evaluated by eigen- or singular-value
decomposition of Hermitian matrices. Nothing is fitted, sampled or approximated
beyond floating-point arithmetic, so each function has an analytic value on
known states (Bell, GHZ, Werner, product states) that the tests check against.

Conventions, stated because the literature uses more than one:

- Logarithms are base 2, so entropies and the logarithmic negativity are in
  bits.
- Fidelity is the *squared* Uhlmann-Jozsa fidelity,
  F(rho, sigma) = (Tr sqrt(sqrt(rho) sigma sqrt(rho)))^2, in [0, 1]. For pure
  states it is |<psi|phi>|^2.
- Trace distance is D(rho, sigma) = 1/2 ||rho - sigma||_1, in [0, 1].
- Subsystems are ordered as in a Kronecker product: for dims [dA, dB] the basis
  index is a * dB + b.

Input is validated, never repaired. A matrix that is not Hermitian, not
positive semidefinite, or not unit trace (each within `tolerance`) is rejected
with the violated condition and its size. Projecting onto the nearest valid
state would change the answer while hiding that it had.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

#: Default tolerance for Hermiticity, positivity and trace checks.
DEFAULT_TOLERANCE = 1e-8
#: Eigenvalues below this count as zero in entropies (0 log 0 = 0).
EIGENVALUE_FLOOR = 1e-12
#: Largest Hilbert-space dimension accepted. 1024 x 1024 complex128 is 16 MiB,
#: and every measure here diagonalises a matrix of that size.
MAX_DIMENSION = 1024


class StateMeasureError(ValueError):
    """Input that does not describe a valid state, or a measure that does not apply."""


def _numpy() -> Any:
    try:
        import numpy as np
    except ImportError as exc:  # pragma: no cover - exercised in clean installs
        raise RuntimeError(
            'This product needs NumPy. Install it with: pip install "ketqat[qinfo]"'
        ) from exc
    return np


# --------------------------------------------------------------------------- input


def as_matrix(value: Any) -> Any:
    np = _numpy()
    matrix = np.asarray(value, dtype=np.complex128)
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        raise StateMeasureError(f"A density matrix must be square; got shape {matrix.shape}.")
    if matrix.shape[0] < 1:
        raise StateMeasureError("A density matrix must be at least 1 x 1.")
    if matrix.shape[0] > MAX_DIMENSION:
        raise StateMeasureError(
            f"Dimension {matrix.shape[0]} exceeds the supported maximum of {MAX_DIMENSION}."
        )
    if not np.all(np.isfinite(matrix)):
        raise StateMeasureError("The matrix contains NaN or infinite entries.")
    return matrix


def density_matrix(statevector: Any, tolerance: float = DEFAULT_TOLERANCE) -> Any:
    """|psi><psi| for a normalised state vector. An unnormalised vector is rejected."""
    np = _numpy()
    vector = np.asarray(statevector, dtype=np.complex128).reshape(-1)
    if vector.size < 1 or vector.size > MAX_DIMENSION:
        raise StateMeasureError(
            f"A state vector must have between 1 and {MAX_DIMENSION} amplitudes; got {vector.size}."
        )
    if not np.all(np.isfinite(vector)):
        raise StateMeasureError("The state vector contains NaN or infinite entries.")
    norm = float(np.vdot(vector, vector).real)
    if abs(norm - 1.0) > tolerance:
        raise StateMeasureError(
            f"The state vector has squared norm {norm:.12g}, not 1 (tolerance {tolerance:g}). "
            "Normalise it explicitly; it is not renormalised here."
        )
    return np.outer(vector, vector.conj())


def validate_density_matrix(rho: Any, tolerance: float = DEFAULT_TOLERANCE) -> Any:
    """Return `rho` as a complex array if it is a valid state, otherwise raise."""
    np = _numpy()
    matrix = as_matrix(rho)
    hermitian_error = float(np.max(np.abs(matrix - matrix.conj().T)))
    if hermitian_error > tolerance:
        raise StateMeasureError(
            f"The matrix is not Hermitian: max |rho - rho^dagger| = {hermitian_error:.3e} "
            f"exceeds tolerance {tolerance:g}."
        )
    trace = complex(np.trace(matrix))
    if abs(trace - 1.0) > tolerance:
        raise StateMeasureError(
            f"The matrix has trace {trace.real:.12g}{trace.imag:+.3g}j, not 1 "
            f"(tolerance {tolerance:g})."
        )
    hermitian = (matrix + matrix.conj().T) / 2
    smallest = float(np.linalg.eigvalsh(hermitian)[0])
    if smallest < -tolerance:
        raise StateMeasureError(
            f"The matrix is not positive semidefinite: smallest eigenvalue {smallest:.3e} "
            f"is below -{tolerance:g}."
        )
    return hermitian


def validate_dims(dims: Sequence[int], dimension: int) -> list[int]:
    cleaned: list[int] = []
    for value in dims:
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise StateMeasureError(f"Subsystem dimensions must be positive integers; got {value!r}.")
        cleaned.append(value)
    if not cleaned:
        raise StateMeasureError("At least one subsystem dimension is required.")
    if math.prod(cleaned) != dimension:
        raise StateMeasureError(
            f"Subsystem dimensions {cleaned} multiply to {math.prod(cleaned)}, "
            f"but the matrix is {dimension} x {dimension}."
        )
    return cleaned


def _validate_subsystems(subsystems: Sequence[int], count: int, label: str) -> list[int]:
    cleaned = []
    for value in subsystems:
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value < count:
            raise StateMeasureError(
                f"{label} entries must be subsystem indices in [0, {count - 1}]; got {value!r}."
            )
        cleaned.append(value)
    if len(set(cleaned)) != len(cleaned):
        raise StateMeasureError(f"{label} entries must be distinct.")
    return sorted(cleaned)


# ------------------------------------------------------------------ linear algebra


def _hermitian_eigenvalues(matrix: Any) -> Any:
    np = _numpy()
    return np.linalg.eigvalsh((matrix + matrix.conj().T) / 2)


def _without_roundoff(values: Any) -> Any:
    """Eigenvalues with those indistinguishable from round-off set to zero.

    A Hermitian eigensolver resolves eigenvalues only to about
    dimension x machine epsilon x the largest eigenvalue. Below that a "zero"
    eigenvalue comes back as +-1e-17, and its square root (3e-9) would enter a
    fidelity as if it were signal. Zeroing what cannot be resolved is not a
    repair of the input: those values carry no information either way.
    """
    np = _numpy()
    scale = max(float(np.max(np.abs(values))) if values.size else 0.0, 1.0)
    threshold = 8 * values.size * np.finfo(float).eps * scale
    return np.where(values < threshold, 0.0, values)


def _psd_sqrt(matrix: Any) -> Any:
    """Square root of a Hermitian PSD matrix by eigendecomposition."""
    np = _numpy()
    values, vectors = np.linalg.eigh((matrix + matrix.conj().T) / 2)
    roots = np.sqrt(_without_roundoff(values))
    return (vectors * roots) @ vectors.conj().T


def partial_trace(rho: Any, dims: Sequence[int], keep: Sequence[int]) -> Any:
    """Trace out every subsystem not in `keep`. Kept subsystems stay in order."""
    np = _numpy()
    matrix = as_matrix(rho)
    dims = validate_dims(dims, matrix.shape[0])
    keep = _validate_subsystems(keep, len(dims), "keep")
    count = len(dims)
    tensor = matrix.reshape(dims + dims)
    # Trace out from the highest index down so earlier axis numbers stay valid.
    traced = [index for index in range(count) if index not in keep]
    current = count
    for index in sorted(traced, reverse=True):
        tensor = np.trace(tensor, axis1=index, axis2=index + current)
        current -= 1
    kept_dimension = math.prod(dims[index] for index in keep) if keep else 1
    return tensor.reshape(kept_dimension, kept_dimension)


def partial_transpose(rho: Any, dims: Sequence[int], transpose: Sequence[int]) -> Any:
    """Transpose the listed subsystems' indices."""
    np = _numpy()
    matrix = as_matrix(rho)
    dims = validate_dims(dims, matrix.shape[0])
    transpose = _validate_subsystems(transpose, len(dims), "transpose")
    count = len(dims)
    tensor = matrix.reshape(dims + dims)
    axes = list(range(2 * count))
    for index in transpose:
        axes[index], axes[index + count] = axes[index + count], axes[index]
    return tensor.transpose(axes).reshape(matrix.shape)


# ------------------------------------------------------------------------ measures


def von_neumann_entropy(rho: Any) -> float:
    """S(rho) = -Tr rho log2 rho, in bits."""
    np = _numpy()
    values = _hermitian_eigenvalues(as_matrix(rho))
    values = values[values > EIGENVALUE_FLOOR]
    return max(0.0, float(-np.sum(values * np.log2(values))))


def renyi_entropy(rho: Any, alpha: float) -> float:
    """S_alpha(rho) = log2(Tr rho^alpha) / (1 - alpha), in bits. alpha = 1 is von Neumann."""
    np = _numpy()
    if isinstance(alpha, bool) or not isinstance(alpha, (int, float)) or not math.isfinite(alpha) or alpha <= 0:
        raise StateMeasureError(f"The Renyi order alpha must be a positive finite number; got {alpha!r}.")
    if alpha == 1:
        return von_neumann_entropy(rho)
    values = _hermitian_eigenvalues(as_matrix(rho))
    values = values[values > EIGENVALUE_FLOOR]
    return max(0.0, float(np.log2(np.sum(values**alpha)) / (1 - alpha)))


def purity(rho: Any) -> float:
    """Tr rho^2."""
    np = _numpy()
    matrix = as_matrix(rho)
    return float(np.real(np.trace(matrix @ matrix)))


def fidelity(rho: Any, sigma: Any, method: str = "svd") -> float:
    """Squared Uhlmann fidelity.

    `method="svd"`: F = ||sqrt(rho) sqrt(sigma)||_1^2, the nuclear norm from
    singular values. `method="sqrtm"`: F = (Tr sqrt(sqrt(rho) sigma sqrt(rho)))^2,
    from the eigenvalues of the Hermitian middle matrix. The two are equal in
    exact arithmetic and are computed by different decompositions, which is
    what lets a test check one against the other.
    """
    np = _numpy()
    a = as_matrix(rho)
    b = as_matrix(sigma)
    if a.shape != b.shape:
        raise StateMeasureError(f"Fidelity needs states of equal dimension; got {a.shape} and {b.shape}.")
    root_a = _psd_sqrt(a)
    if method == "svd":
        value = float(np.sum(np.linalg.svd(root_a @ _psd_sqrt(b), compute_uv=False))) ** 2
    elif method == "sqrtm":
        middle = root_a @ b @ root_a
        value = float(np.sum(np.sqrt(_without_roundoff(_hermitian_eigenvalues(middle))))) ** 2
    else:
        raise StateMeasureError(f"Unknown fidelity method {method!r}; use 'svd' or 'sqrtm'.")
    return min(1.0, max(0.0, value))


def trace_distance(rho: Any, sigma: Any) -> float:
    """D = 1/2 ||rho - sigma||_1 from the eigenvalues of the Hermitian difference."""
    np = _numpy()
    a = as_matrix(rho)
    b = as_matrix(sigma)
    if a.shape != b.shape:
        raise StateMeasureError(
            f"Trace distance needs states of equal dimension; got {a.shape} and {b.shape}."
        )
    return min(1.0, max(0.0, float(0.5 * np.sum(np.abs(_hermitian_eigenvalues(a - b))))))


def helstrom_success_probability(rho: Any, sigma: Any) -> float:
    """Optimal one-shot discrimination of rho and sigma with equal priors.

    Evaluated directly from the Helstrom measurement (projector onto the
    positive eigenspace of rho - sigma), not from the trace distance, so the
    identity P = (1 + D) / 2 is a check rather than a definition.
    """
    np = _numpy()
    a = as_matrix(rho)
    b = as_matrix(sigma)
    values, vectors = np.linalg.eigh(((a - b) + (a - b).conj().T) / 2)
    positive = vectors[:, values > 0]
    projector = positive @ positive.conj().T
    identity = np.eye(a.shape[0])
    return float(0.5 * np.real(np.trace(projector @ a) + np.trace((identity - projector) @ b)))


def mutual_information(rho: Any, dims: Sequence[int], subsystem_a: Sequence[int]) -> float:
    """I(A:B) = S(A) + S(B) - S(AB), with B every subsystem not in A."""
    matrix = as_matrix(rho)
    dims = validate_dims(dims, matrix.shape[0])
    a = _validate_subsystems(subsystem_a, len(dims), "subsystem_a")
    b = [index for index in range(len(dims)) if index not in a]
    if not a or not b:
        raise StateMeasureError("Mutual information needs a non-trivial bipartition.")
    value = (
        von_neumann_entropy(partial_trace(matrix, dims, a))
        + von_neumann_entropy(partial_trace(matrix, dims, b))
        - von_neumann_entropy(matrix)
    )
    return max(0.0, value)


def concurrence(rho: Any) -> float:
    """Wootters concurrence of a two-qubit state.

    C = max(0, l1 - l2 - l3 - l4), with l_i the decreasing square roots of the
    eigenvalues of rho (Y x Y) rho^* (Y x Y). They are computed from the
    Hermitian matrix sqrt(rho) rho~ sqrt(rho), which has the same spectrum and
    avoids a non-Hermitian eigensolver.
    """
    np = _numpy()
    matrix = as_matrix(rho)
    if matrix.shape != (4, 4):
        raise StateMeasureError(
            f"Concurrence (Wootters) is defined here for two qubits only; got dimension {matrix.shape[0]}."
        )
    yy = np.array([[0, 0, 0, -1], [0, 0, 1, 0], [0, 1, 0, 0], [-1, 0, 0, 0]], dtype=np.complex128)
    tilde = yy @ matrix.conj() @ yy
    root = _psd_sqrt(matrix)
    values = np.sqrt(_without_roundoff(_hermitian_eigenvalues(root @ tilde @ root)))
    values = np.sort(values)[::-1]
    return max(0.0, float(values[0] - values[1] - values[2] - values[3]))


def trace_norm_of_partial_transpose(rho: Any, dims: Sequence[int], subsystem_b: Sequence[int]) -> float:
    np = _numpy()
    transposed = partial_transpose(rho, dims, subsystem_b)
    return float(np.sum(np.abs(_hermitian_eigenvalues(transposed))))


def logarithmic_negativity(rho: Any, dims: Sequence[int], subsystem_a: Sequence[int]) -> float:
    """E_N = log2 ||rho^{T_B}||_1, in bits, with B every subsystem not in A."""
    np = _numpy()
    matrix = as_matrix(rho)
    dims = validate_dims(dims, matrix.shape[0])
    a = _validate_subsystems(subsystem_a, len(dims), "subsystem_a")
    b = [index for index in range(len(dims)) if index not in a]
    if not a or not b:
        raise StateMeasureError("Logarithmic negativity needs a non-trivial bipartition.")
    return max(0.0, float(np.log2(trace_norm_of_partial_transpose(matrix, dims, b))))


def negativity(rho: Any, dims: Sequence[int], subsystem_a: Sequence[int]) -> float:
    """N = (||rho^{T_B}||_1 - 1) / 2."""
    matrix = as_matrix(rho)
    dims = validate_dims(dims, matrix.shape[0])
    a = _validate_subsystems(subsystem_a, len(dims), "subsystem_a")
    b = [index for index in range(len(dims)) if index not in a]
    if not a or not b:
        raise StateMeasureError("Negativity needs a non-trivial bipartition.")
    return max(0.0, (trace_norm_of_partial_transpose(matrix, dims, b) - 1) / 2)


# ------------------------------------------------------------------------- presets


def bell_state() -> Any:
    """|Phi+> = (|00> + |11>) / sqrt(2)."""
    np = _numpy()
    vector = np.zeros(4, dtype=np.complex128)
    vector[0] = vector[3] = 1 / math.sqrt(2)
    return density_matrix(vector)


def singlet_state() -> Any:
    """|Psi-> = (|01> - |10>) / sqrt(2)."""
    np = _numpy()
    vector = np.zeros(4, dtype=np.complex128)
    vector[1] = 1 / math.sqrt(2)
    vector[2] = -1 / math.sqrt(2)
    return density_matrix(vector)


def ghz_state(qubits: int) -> Any:
    """(|0...0> + |1...1>) / sqrt(2)."""
    np = _numpy()
    if isinstance(qubits, bool) or not isinstance(qubits, int) or qubits < 2:
        raise StateMeasureError("A GHZ state needs at least 2 qubits.")
    if (1 << qubits) > MAX_DIMENSION:
        raise StateMeasureError(f"A {qubits}-qubit GHZ state exceeds dimension {MAX_DIMENSION}.")
    vector = np.zeros(1 << qubits, dtype=np.complex128)
    vector[0] = vector[-1] = 1 / math.sqrt(2)
    return density_matrix(vector)


def werner_state(p: float) -> Any:
    """p |Psi-><Psi-| + (1 - p) I/4, the two-qubit Werner state with singlet weight p."""
    np = _numpy()
    if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0 <= p <= 1:
        raise StateMeasureError(f"The Werner parameter p must lie in [0, 1]; got {p!r}.")
    return p * singlet_state() + (1 - p) * np.eye(4, dtype=np.complex128) / 4


def maximally_mixed(dimension: int) -> Any:
    np = _numpy()
    return np.eye(dimension, dtype=np.complex128) / dimension


def zero_state(dimension: int) -> Any:
    np = _numpy()
    matrix = np.zeros((dimension, dimension), dtype=np.complex128)
    matrix[0, 0] = 1
    return matrix
