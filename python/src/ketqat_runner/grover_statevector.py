"""Grover search, executed as a statevector simulation.

The runner's older `grover-search` family (`runner._run_algorithm`) does not
simulate anything: it evaluates the textbook success probability
sin^2((2k+1) theta) and draws shots from it. That is disclosed where it lives,
and it is not what the catalog product `kq.algorithms.grover-search` runs.

This module applies the algorithm's operators to a state vector:

1. prepare the uniform superposition H^n |0...0>;
2. repeat k times: the phase oracle O = I - 2 sum_m |m><m| over the marked
   set, then the diffusion operator D = H^n (2|0><0| - I) H^n;
3. read the Born-rule distribution off the final vector.

`D` is applied in its closed form, D = 2|s><s| - I with |s> the uniform
superposition, which is the same operator (H^n is its own inverse and maps
|0...0> to |s>). The closed form costs O(N) per iteration where the gate
sequence costs O(N log N); at 20 qubits and ~800 iterations that is the
difference between seconds and minutes. `apply_diffusion_by_gates` keeps the
gate-level construction so a test can check the two agree amplitude by
amplitude.

The success probability reported is the sum of |amplitude|^2 over the marked
states of the simulated vector. It is compared against the analytic formula in
the tests, not computed from it.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

#: The largest register this module will allocate. 2^20 complex128 amplitudes
#: is 16 MiB; the next qubit doubles it, and the ceiling is a product decision
#: stated in the catalog definition rather than a hardware limit.
MAX_QUBITS = 20
MIN_QUBITS = 2
#: Bytes per amplitude (complex128).
BYTES_PER_AMPLITUDE = 16


class GroverParameterError(ValueError):
    """A Grover request that cannot be simulated as stated."""


def _numpy() -> Any:
    try:
        import numpy as np
    except ImportError as exc:  # pragma: no cover - exercised in clean installs
        raise RuntimeError(
            'This product needs NumPy. Install it with: pip install "ketqat[algorithms]"'
        ) from exc
    return np


def statevector_bytes(n_qubits: int) -> int:
    """Memory one state vector of `n_qubits` needs, in bytes."""
    return (1 << n_qubits) * BYTES_PER_AMPLITUDE


def _human_bytes(count: int) -> str:
    value = float(count)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB", "PiB"):
        if value < 1024 or unit == "PiB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} PiB"  # pragma: no cover


def optimal_iterations(n_qubits: int, marked_count: int) -> int:
    """floor(pi/4 * sqrt(N/M)), the textbook iteration count."""
    size = 1 << n_qubits
    return math.floor(math.pi / 4 * math.sqrt(size / marked_count))


def analytic_success_probability(n_qubits: int, marked_count: int, iterations: int) -> float:
    """sin^2((2k+1) theta) with sin(theta) = sqrt(M/N). For tests and cross-checks."""
    size = 1 << n_qubits
    theta = math.asin(math.sqrt(marked_count / size))
    return math.sin((2 * iterations + 1) * theta) ** 2


def validate_request(n_qubits: int, marked: Sequence[int], iterations: int | None) -> list[int]:
    if isinstance(n_qubits, bool) or not isinstance(n_qubits, int):
        raise GroverParameterError("n_qubits must be an integer.")
    if n_qubits < MIN_QUBITS:
        raise GroverParameterError(f"n_qubits must be at least {MIN_QUBITS}, got {n_qubits}.")
    if n_qubits > MAX_QUBITS:
        raise GroverParameterError(
            f"n_qubits={n_qubits} would need a 2^{n_qubits}-amplitude state vector "
            f"({_human_bytes(statevector_bytes(n_qubits))} at complex128, before working copies). "
            f"This product simulates at most {MAX_QUBITS} qubits "
            f"({_human_bytes(statevector_bytes(MAX_QUBITS))}) and refuses rather than approximating."
        )
    size = 1 << n_qubits
    if not marked:
        raise GroverParameterError("marked must list at least one basis state.")
    cleaned: list[int] = []
    for value in marked:
        if isinstance(value, bool) or not isinstance(value, int):
            raise GroverParameterError(f"marked entries must be integers, got {value!r}.")
        if not 0 <= value < size:
            raise GroverParameterError(
                f"marked entry {value} is outside the {n_qubits}-qubit register [0, {size - 1}]."
            )
        cleaned.append(value)
    if len(set(cleaned)) != len(cleaned):
        raise GroverParameterError("marked entries must be distinct.")
    if len(cleaned) >= size:
        raise GroverParameterError(
            "Every basis state is marked; there is nothing to search for."
        )
    if iterations is not None:
        if isinstance(iterations, bool) or not isinstance(iterations, int) or iterations < 0:
            raise GroverParameterError("iterations must be a non-negative integer.")
    return sorted(cleaned)


def apply_diffusion(state: Any) -> Any:
    """D = 2|s><s| - I, in place. Equal to H^n (2|0><0| - I) H^n."""
    mean = state.mean()
    state *= -1
    state += 2 * mean
    return state


def apply_diffusion_by_gates(state: Any, n_qubits: int) -> Any:
    """The same operator built from H^n, a phase flip about |0...0>, and H^n.

    Kept for verification only: it is O(N log N) per call.
    """
    np = _numpy()
    hadamard = np.array([[1, 1], [1, -1]], dtype=complex) / math.sqrt(2)

    def h_all(vector: Any) -> Any:
        tensor = vector.reshape([2] * n_qubits)
        for axis in range(n_qubits):
            tensor = np.moveaxis(np.tensordot(hadamard, tensor, axes=([1], [axis])), 0, axis)
        return tensor.reshape(-1)

    out = h_all(state)
    out = -out
    out[0] = -out[0]
    return h_all(out)


def grover_statevector(n_qubits: int, marked: Sequence[int], iterations: int) -> Any:
    """Final state vector after `iterations` Grover iterations."""
    np = _numpy()
    marked_indices = np.asarray(validate_request(n_qubits, marked, iterations), dtype=np.int64)
    size = 1 << n_qubits
    state = np.full(size, 1 / math.sqrt(size), dtype=np.complex128)
    for _ in range(iterations):
        state[marked_indices] *= -1  # phase oracle
        apply_diffusion(state)
    return state


def run_grover(
    *,
    n_qubits: int,
    marked: Sequence[int],
    iterations: int | None,
    shots: int,
    seed: int,
) -> dict[str, Any]:
    """Simulate, sample `shots` measurements, and summarise.

    The result carries the exact probability from the vector and the sampled
    counts separately, so a reader can tell the algorithm's answer from the
    shot noise around it.
    """
    np = _numpy()
    cleaned = validate_request(n_qubits, marked, iterations)
    if isinstance(shots, bool) or not isinstance(shots, int) or shots < 1:
        raise GroverParameterError("shots must be a positive integer.")
    marked_count = len(cleaned)
    resolved_iterations = (
        optimal_iterations(n_qubits, marked_count) if iterations is None else iterations
    )

    state = grover_statevector(n_qubits, cleaned, resolved_iterations)
    probabilities = np.abs(state) ** 2
    norm = float(probabilities.sum())
    success_probability = float(probabilities[np.asarray(cleaned)].sum())

    rng = np.random.default_rng(seed)
    sampled = rng.multinomial(shots, probabilities / norm)
    nonzero = np.flatnonzero(sampled)
    counts = {format(int(index), f"0{n_qubits}b"): int(sampled[index]) for index in nonzero}
    marked_hits = int(sampled[np.asarray(cleaned)].sum())

    analytic = analytic_success_probability(n_qubits, marked_count, resolved_iterations)
    return {
        "n_qubits": n_qubits,
        "search_space_size": 1 << n_qubits,
        "marked": cleaned,
        "marked_bitstrings": [format(value, f"0{n_qubits}b") for value in cleaned],
        "iterations": resolved_iterations,
        "iterations_rule": "user" if iterations is not None else "floor(pi/4*sqrt(N/M))",
        "success_probability": success_probability,
        "analytic_success_probability": analytic,
        "statevector_norm_deviation": abs(norm - 1.0),
        "shots": shots,
        "counts": counts,
        "observed_success_count": marked_hits,
        "observed_success_fraction": marked_hits / shots,
        "backend": "ketqat-numpy-statevector",
        "execution": "statevector simulation of the oracle and diffusion operators",
    }
