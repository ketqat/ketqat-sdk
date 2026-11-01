"""kq.qec.steane-code-fault-tolerance 1.0.0.

Wraps `ketqat_runner.steane`: the [[7,1,3]] code's syndrome table from
binary symplectic arithmetic, an independent state-level check that every
weight-1 Pauli error on |0_L> is corrected (128-amplitude state vector,
syndrome by projection), and the demonstration that distance 3 corrects one
error and only detects two. Optionally applies one Pauli error of your choice
to a chosen logical state and reports what the decoder does with it.
"""

from __future__ import annotations

import math
from itertools import combinations, product
from typing import Any

import numpy as np

from ...steane import (
    CODE_QUBITS,
    LOGICAL_X,
    LOGICAL_Z,
    STEANE_STABILIZERS,
    SteaneError,
    demonstrate_distance_limit,
    logical_zero,
    pauli_matrix,
    single_qubit_errors,
    syndrome,
    syndrome_table,
    verify_single_error_correction,
    verify_state_level_correction,
)
from ..params import ParameterError

PAULI_LETTERS = "IXYZ"
IDENTITY = "I" * CODE_QUBITS
_PRODUCT = {
    ("I", "I"): "I", ("I", "X"): "X", ("I", "Y"): "Y", ("I", "Z"): "Z",
    ("X", "I"): "X", ("X", "X"): "I", ("X", "Y"): "Z", ("X", "Z"): "Y",
    ("Y", "I"): "Y", ("Y", "X"): "Z", ("Y", "Y"): "I", ("Y", "Z"): "X",
    ("Z", "I"): "Z", ("Z", "X"): "Y", ("Z", "Y"): "X", ("Z", "Z"): "I",
}


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def _multiply(left: str, right: str) -> str:
    return "".join(_PRODUCT[(a, b)] for a, b in zip(left, right))


def _anticommutes(left: str, right: str) -> bool:
    return sum(1 for a, b in zip(left, right) if a != "I" and b != "I" and a != b) % 2 == 1


def _weight(error: str) -> int:
    return sum(1 for letter in error if letter != "I")


def validate(params: dict[str, Any]) -> None:
    error = params["error"]
    if error is not None and (len(error) != CODE_QUBITS or set(error) - set(PAULI_LETTERS)):
        raise ParameterError(f"'error' must be a {CODE_QUBITS}-letter string over I, X, Y, Z, e.g. 'IIXIIII'; got {error!r}.")
    if not params["exhaustive"] and error is None:
        raise ParameterError("With exhaustive=false, give an 'error' to apply; otherwise there is nothing to do.")


def _logical_state(name: str) -> np.ndarray:
    zero = logical_zero()
    if name == "zero":
        return zero
    one = pauli_matrix(LOGICAL_X) @ zero
    if name == "one":
        return one
    return (zero + one) / math.sqrt(2)


def _weight_two_summary(table: dict[tuple[int, ...], str]) -> dict[str, Any]:
    """Every weight-2 Pauli error, classified by what the single-qubit syndrome table does with it.

    Three outcomes are possible and all three are counted: the syndrome is zero
    (undetected; distance 3 forbids this), the syndrome belongs to a weight-1
    error (the decoder applies that correction and the residual is a logical
    operator), or the syndrome belongs to no weight-1 error (detected and
    flagged as uncorrectable; nothing is applied).
    """
    count = detected = miscorrected = flagged = 0
    example: dict[str, str] | None = None
    for left, right in combinations(range(CODE_QUBITS), 2):
        for a, b in product("XYZ", repeat=2):
            error = list(IDENTITY)
            error[left], error[right] = a, b
            text = "".join(error)
            count += 1
            code = syndrome(text)
            if not any(code):
                continue
            detected += 1
            correction = table.get(code)
            if correction is None:
                flagged += 1
                continue
            residual = _multiply(text, correction)
            if any(_anticommutes(residual, logical) for logical in (LOGICAL_X, LOGICAL_Z)):
                miscorrected += 1
                if example is None:
                    example = {"error": text, "decoder_applies": correction, "residual": residual}
    return {
        "count": count,
        "detected": detected,
        "all_detected": detected == count,
        "syndrome_matches_a_single_qubit_error": miscorrected,
        "miscorrected_to_a_logical_error": miscorrected,
        "flagged_uncorrectable": flagged,
        "example_miscorrection": example,
        "note": (
            "Distance 3: every weight-2 error is detected. When its syndrome coincides with a weight-1 error's "
            "the decoder applies that weight-1 correction and the residual is a weight-3 logical operator; "
            "when it matches no weight-1 error the decoder applies nothing and reports an uncorrectable error."
        ),
    }


def _apply_error(name: str, error: str, table: dict[tuple[int, ...], str]) -> dict[str, Any]:
    state = _logical_state(name)
    corrupted = pauli_matrix(error) @ state
    size = 1 << CODE_QUBITS
    measured = tuple(
        1 if abs(np.vdot(corrupted, ((np.eye(size, dtype=complex) - pauli_matrix(generator)) / 2) @ corrupted)) > 0.5 else 0
        for generator in STEANE_STABILIZERS
    )
    by_commutation = syndrome(error)
    in_table = measured in table or not any(measured)
    correction = table.get(measured, IDENTITY)
    restored = pauli_matrix(correction) @ corrupted
    fidelity = float(abs(np.vdot(state, restored)) ** 2)
    residual = _multiply(error, correction)
    residual_syndrome = syndrome(residual)
    action: str | None = None
    if not any(residual_syndrome):
        x_part = _anticommutes(residual, LOGICAL_Z)
        z_part = _anticommutes(residual, LOGICAL_X)
        action = {(False, False): "I", (True, False): "X", (False, True): "Z", (True, True): "Y"}[(x_part, z_part)]
    return {
        "logical_state": name,
        "error": error,
        "weight": _weight(error),
        "syndrome_by_commutation": "".join(str(bit) for bit in by_commutation),
        "syndrome_by_projection": "".join(str(bit) for bit in measured),
        "syndromes_agree": measured == by_commutation,
        "detected": any(measured),
        "syndrome_matches_a_single_qubit_error": in_table and any(measured),
        "decoder_applies": correction if in_table else None,
        "flagged_uncorrectable": not in_table,
        "residual": residual,
        "residual_logical_action": action,
        "fidelity_after_correction": _round(fidelity),
        "corrected": abs(fidelity - 1) < 1e-9,
        "note": (
            "The residual is the actual error times the applied correction. When its syndrome is zero it is a "
            "stabiliser ('I', state restored) or acts as the logical operator named, which damages the logical "
            "state unless the state is its eigenstate (Z_L leaves |0_L> and |1_L> unchanged). When the syndrome "
            "matches no single-qubit error the decoder applies nothing and flags the error as uncorrectable."
        ),
    }


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:  # noqa: ARG001 - deterministic
    try:
        table = syndrome_table()
        result: dict[str, Any] = {
            "code": "Steane [[7,1,3]] CSS code",
            "stabilizers": list(STEANE_STABILIZERS),
            "logical_operators": {"X": LOGICAL_X, "Z": LOGICAL_Z},
            "syndrome_table": {"".join(str(bit) for bit in code): error for code, error in sorted(table.items())},
        }
        if params["exhaustive"]:
            syndromes = verify_single_error_correction()
            states = verify_state_level_correction()
            limit = demonstrate_distance_limit()
            result["single_qubit_errors"] = {
                "count": syndromes["errors_checked"],
                "distinct_syndromes": syndromes["distinct_syndromes"],
                "all_detected": syndromes["all_detected"],
                "all_uniquely_identified": syndromes["all_uniquely_identified"],
                "state_level_recovered": states["errors_checked"],
                "all_recovered": states["all_recovered"],
                "state_level_method": states["method"],
                "claim": syndromes["claim"],
            }
            result["weight_two_errors"] = _weight_two_summary(table)
            result["distance_limit"] = {
                "miscorrected_ordered_pairs": limit["miscorrected_count"],
                "example": limit["example"],
                "claim": limit["claim"],
            }
        if params["error"] is not None:
            result["applied_error"] = _apply_error(params["logical_state"], params["error"], table)
    except SteaneError as exc:
        raise ParameterError(str(exc)) from exc
    result["errors_enumerated"] = len(single_qubit_errors())
    result["execution"] = "syndromes by binary symplectic arithmetic; state-level checks on a 128-amplitude state vector"
    return result
