"""kq.algorithms.quantum-fourier-transform 1.0.0.

Wraps `ketqat_runner.fourier`: the QFT applied as its gate sequence (Hadamards,
controlled phase rotations, final swaps) to a basis, uniform or seeded random
state, compared against an independent reference -- the DFT column written
from its definition for a basis state, the known |0...0> output for the
uniform state, and the full DFT matrix product for a random state when the
register is small enough for the O(N^2) product. The inverse transform is then
applied and the round-trip error reported.
"""

from __future__ import annotations

import cmath
import math
from typing import Any

from ...fourier import MAX_QFT_QUBITS, FourierError, apply_dft, apply_qft
from ..params import ParameterError

#: The O(N^2) matrix reference is applied up to this width (about 0.5 s at 10).
MAX_MATRIX_REFERENCE_QUBITS = 10
#: Amplitudes are listed in the result up to this width.
MAX_LISTED_QUBITS = 5
TOP_OUTCOMES = 8


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def validate(params: dict[str, Any]) -> None:
    n = params["n_qubits"]
    if n > MAX_QFT_QUBITS:
        raise ParameterError(f"n_qubits={n} exceeds the {MAX_QFT_QUBITS}-qubit ceiling of this simulation.")
    if params["input_state"] == "basis" and params["basis_index"] >= (1 << n):
        raise ParameterError(f"basis_index={params['basis_index']} is outside the {n}-qubit register (0..{(1 << n) - 1}).")


def _prepare(params: dict[str, Any], rng: Any) -> tuple[list[complex], str]:
    n = params["n_qubits"]
    size = 1 << n
    kind = params["input_state"]
    if kind == "basis":
        state = [0j] * size
        state[params["basis_index"]] = 1 + 0j
        return state, f"|{params['basis_index']}> = |{format(params['basis_index'], f'0{n}b')}>"
    if kind == "uniform":
        return [complex(1 / math.sqrt(size))] * size, "uniform superposition (1/sqrt(N)) sum_j |j>"
    real = rng.normal(size=size)
    imag = rng.normal(size=size)
    norm = math.sqrt(float((real * real + imag * imag).sum()))
    return [complex(float(a) / norm, float(b) / norm) for a, b in zip(real, imag)], "seeded random state (complex Gaussian amplitudes, normalised)"


def _reference(params: dict[str, Any], state: list[complex]) -> tuple[list[complex] | None, str]:
    n = params["n_qubits"]
    size = 1 << n
    sign = -1.0 if params["inverse"] else 1.0
    if params["input_state"] == "basis":
        j = params["basis_index"]
        scale = 1 / math.sqrt(size)
        column = [scale * cmath.exp(sign * 2j * math.pi * j * k / size) for k in range(size)]
        return column, "DFT column (1/sqrt(N)) exp(+-2 pi i j k / N), written from the definition"
    if params["input_state"] == "uniform":
        reference = [0j] * size
        reference[0] = 1 + 0j
        return reference, "the uniform state transforms to |0...0> (DFT of a constant)"
    if n <= MAX_MATRIX_REFERENCE_QUBITS:
        return apply_dft(state, inverse=params["inverse"]), "full DFT matrix product (dft_matrix), O(N^2)"
    return None, f"not computed: the O(N^2) DFT matrix product is applied only up to {MAX_MATRIX_REFERENCE_QUBITS} qubits"


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    import numpy as np

    n = params["n_qubits"]
    size = 1 << n
    inverse = params["inverse"]
    rng = np.random.default_rng(seed)
    state, description = _prepare(params, rng)

    output = list(state)
    try:
        apply_qft(output, n, inverse=inverse)
        back = list(output)
        apply_qft(back, n, inverse=not inverse)
    except FourierError as exc:
        raise ParameterError(str(exc)) from exc

    reference, reference_label = _reference(params, state)
    deviation = max(abs(a - b) for a, b in zip(output, reference)) if reference is not None else None
    round_trip = max(abs(a - b) for a, b in zip(back, state))
    probabilities = np.array([abs(amplitude) ** 2 for amplitude in output])
    norm = float(probabilities.sum())
    probabilities /= norm

    draws = rng.choice(size, size=params["shots"], p=probabilities)
    tally = np.bincount(draws, minlength=size)
    counts = {format(index, f"0{n}b"): int(tally[index]) for index in range(size) if tally[index]}
    ranked = sorted(range(size), key=lambda index: (-probabilities[index], index))[:TOP_OUTCOMES]

    result: dict[str, Any] = {
        "n_qubits": n,
        "dimension": size,
        "inverse": inverse,
        "convention": "QFT|j> = (1/sqrt(N)) sum_k exp(+2 pi i j k / N)|k>, little-endian (qubit 0 is the least significant bit); the inverse carries the opposite sign",
        "input_state": {"kind": params["input_state"], "description": description},
        "output_norm": _round(math.sqrt(norm)),
        "reference": reference_label,
        "max_deviation_from_reference": _round(deviation) if deviation is not None else None,
        "round_trip_error": _round(round_trip),
        "top_outcomes": [
            {"integer": index, "bitstring": format(index, f"0{n}b"), "probability": _round(probabilities[index])}
            for index in ranked
        ],
        "shots": params["shots"],
        "counts": counts,
        "distinct_outcomes": len(counts),
        "execution": "statevector simulation of the gate sequence (pure Python), seeded sampling of the output",
    }
    if params["input_state"] == "basis":
        flat = 1 / math.sqrt(size)
        result["max_magnitude_deviation_from_flat"] = _round(max(abs(abs(amplitude) - flat) for amplitude in output))
    if n <= MAX_LISTED_QUBITS:
        result["output_amplitudes"] = [[_round(amplitude.real), _round(amplitude.imag)] for amplitude in output]
    else:
        result["output_amplitudes"] = None
        result["output_amplitudes_note"] = f"listed only up to {MAX_LISTED_QUBITS} qubits"
    return result
