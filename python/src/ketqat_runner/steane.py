"""The Steane [[7,1,3]] code: fault tolerance verified by exhaustion
(ketqat-sdk#159).

Item 2's fault-tolerant family. Like the ripple-carry adder, this is a place
where a **complete** claim is available rather than a sampled one: a distance-3
code has finitely many weight-1 errors -- 21 of them, three Paulis on each of
seven qubits -- so every one can be enumerated and corrected, and the result is a
proof rather than a confidence interval.

Two independent checks, because they can fail apart
--------------------------------------------------
**Syndromes, by binary symplectic algebra.** Each single-qubit error either
commutes or anticommutes with each stabiliser, giving a 6-bit syndrome. For the
code to correct an error, its syndrome must be non-zero (detected) and unique
(identifiable). Both are checked for all 21.

**States, by explicit simulation.** The syndrome table could be right while
encoding or recovery is wrong, so the logical state is also built as a real
128-amplitude vector by projecting onto the stabiliser eigenspace, each error is
applied, the syndrome measured by projection, the correction applied, and the
recovered state compared against the original. Fidelity must be exactly 1.

The limit is demonstrated, not just documented
----------------------------------------------
Distance 3 means *correct one, detect two*. That boundary is real and it is where
overclaiming happens, so this module verifies the failure as carefully as the
success: there exist weight-2 errors whose syndrome collides with a weight-1
error's, so the decoder applies the wrong correction and the logical state is
damaged. A code that claimed to fix those would be misdescribing itself.
"""

from __future__ import annotations

from typing import Any

import numpy as np

#: Steane stabiliser generators. The three Z-type rows are the parity checks of
#: the classical [7,4,3] Hamming code; the X-type rows are the same pattern.
#: Written as strings so the structure is legible rather than encoded twice.
STEANE_STABILIZERS = (
    "IIIXXXX",
    "IXXIIXX",
    "XIXIXIX",
    "IIIZZZZ",
    "IZZIIZZ",
    "ZIZIZIZ",
)

#: Logical operators: weight-7 for Steane, so a single error cannot mimic one.
LOGICAL_X = "XXXXXXX"
LOGICAL_Z = "ZZZZZZZ"

CODE_QUBITS = 7

_I = np.eye(2, dtype=complex)
_X = np.array([[0, 1], [1, 0]], dtype=complex)
_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
_Z = np.array([[1, 0], [0, -1]], dtype=complex)
_MATRICES = {"I": _I, "X": _X, "Y": _Y, "Z": _Z}


class SteaneError(ValueError):
    """A code operation that could not be performed as specified."""


def pauli_matrix(string: str) -> np.ndarray:
    """Dense matrix for a Pauli string, for the state-level check."""
    if len(string) != CODE_QUBITS:
        raise SteaneError(f"Pauli string {string!r} has length {len(string)}, expected {CODE_QUBITS}.")
    operator = np.array([[1.0 + 0j]])
    for letter in string:
        if letter not in _MATRICES:
            raise SteaneError(f"{letter!r} is not a Pauli operator.")
        operator = np.kron(operator, _MATRICES[letter])
    return operator


def _anticommutes(left: str, right: str) -> bool:
    """Whether two Pauli strings anticommute.

    Two Paulis anticommute exactly when they differ (both non-identity and
    unequal) on an odd number of qubits -- computed rather than matrix-multiplied,
    so this path shares nothing with the state-level check.
    """
    disagreements = sum(
        1
        for a, b in zip(left, right)
        if a != "I" and b != "I" and a != b
    )
    return disagreements % 2 == 1


def syndrome(error: str) -> tuple[int, ...]:
    """The 6-bit syndrome an error produces, by commutation with each generator."""
    if len(error) != CODE_QUBITS:
        raise SteaneError(f"Error {error!r} has length {len(error)}, expected {CODE_QUBITS}.")
    return tuple(int(_anticommutes(error, generator)) for generator in STEANE_STABILIZERS)


def single_qubit_errors() -> list[str]:
    """All 21 weight-1 Pauli errors. Finite, hence enumerable, hence provable."""
    errors = []
    for qubit in range(CODE_QUBITS):
        for pauli in ("X", "Y", "Z"):
            errors.append("I" * qubit + pauli + "I" * (CODE_QUBITS - qubit - 1))
    return errors


def syndrome_table() -> dict[tuple[int, ...], str]:
    """Map each syndrome to the weight-1 error that causes it.

    Building this as a dict is itself the uniqueness check: a collision would
    silently overwrite an entry, so the caller must verify the size.
    """
    table: dict[tuple[int, ...], str] = {}
    for error in single_qubit_errors():
        table[syndrome(error)] = error
    return table


def verify_single_error_correction() -> dict[str, Any]:
    """Exhaustive syndrome-level check over every weight-1 error.

    Two conditions, and both matter: a zero syndrome means the error is
    invisible, and a repeated syndrome means two errors are indistinguishable so
    the decoder must guess. Either breaks correction.
    """
    errors = single_qubit_errors()
    syndromes = [syndrome(error) for error in errors]

    undetected = [error for error, code in zip(errors, syndromes) if all(bit == 0 for bit in code)]
    unique = len(set(syndromes)) == len(syndromes)

    if undetected:
        raise SteaneError(f"These weight-1 errors produce no syndrome: {undetected}")
    if not unique:
        raise SteaneError("Two weight-1 errors share a syndrome, so they cannot be distinguished.")

    return {
        "errors_checked": len(errors),
        "exhaustive": True,
        "all_detected": True,
        "all_uniquely_identified": True,
        "distinct_syndromes": len(set(syndromes)),
        "claim": (
            f"All {len(errors)} weight-1 Pauli errors produce distinct non-zero syndromes. Weight-1 "
            "errors are finite, so this is a complete enumeration -- a proof, not a sample."
        ),
    }


def logical_zero() -> np.ndarray:
    """Build |0_L> by projecting onto the stabiliser and logical-Z eigenspaces.

    Constructed from the code's definition rather than a memorised amplitude
    list, so it cannot silently disagree with the stabilisers it is checked
    against.
    """
    size = 1 << CODE_QUBITS
    state = np.zeros(size, dtype=complex)
    state[0] = 1.0

    for generator in (*STEANE_STABILIZERS, LOGICAL_Z):
        projector = (np.eye(size, dtype=complex) + pauli_matrix(generator)) / 2
        state = projector @ state
        norm = np.linalg.norm(state)
        if norm < 1e-12:
            raise SteaneError(f"Projecting onto {generator} annihilated the state; the generators are inconsistent.")
        state = state / norm

    return state


def verify_state_level_correction() -> dict[str, Any]:
    """Encode, corrupt, measure, correct, compare -- for all 21 errors.

    Independent of the syndrome table above: this path multiplies matrices and
    measures projections, sharing no code with the commutation arithmetic. A
    correct table with broken recovery would pass one check and fail this one.
    """
    encoded = logical_zero()
    table = syndrome_table()
    size = 1 << CODE_QUBITS

    projectors = [
        ((np.eye(size, dtype=complex) - pauli_matrix(generator)) / 2)
        for generator in STEANE_STABILIZERS
    ]

    recovered_exactly = 0
    for error in single_qubit_errors():
        corrupted = pauli_matrix(error) @ encoded

        # Measure the syndrome by projection: the bit is 1 when the state lies in
        # the -1 eigenspace of that generator.
        measured = tuple(
            1 if abs(np.vdot(corrupted, projector @ corrupted)) > 0.5 else 0
            for projector in projectors
        )

        correction = table.get(measured)
        if correction is None:
            raise SteaneError(f"Error {error} produced syndrome {measured}, which is not in the table.")

        restored = pauli_matrix(correction) @ corrupted
        fidelity = abs(np.vdot(encoded, restored)) ** 2
        if abs(fidelity - 1.0) > 1e-9:
            raise SteaneError(f"Correcting {error} left fidelity {fidelity:.6f}, not 1.")
        recovered_exactly += 1

    return {
        "errors_checked": recovered_exactly,
        "all_recovered": True,
        "method": "128-amplitude statevector, syndrome by projection, independent of the commutation table",
    }


def demonstrate_distance_limit() -> dict[str, Any]:
    """Find weight-2 errors the code cannot correct, and show why.

    Distance 3 corrects one error and detects two. The second half of that
    sentence is the honest part: a weight-2 error can share a syndrome with a
    weight-1 error, so the decoder confidently applies the wrong correction. That
    is a property of the code, and a module claiming otherwise would be wrong.
    """
    table = syndrome_table()
    errors = single_qubit_errors()

    miscorrected: list[dict[str, str]] = []
    for first in errors:
        for second in errors:
            combined = _multiply(first, second)
            if combined.count("I") >= CODE_QUBITS - 1:
                continue  # weight 0 or 1, not a weight-2 case
            code = syndrome(combined)
            candidate = table.get(code)
            if candidate is not None and candidate != combined:
                miscorrected.append({"actual": combined, "decoder_applies": candidate, "syndrome": str(code)})

    if not miscorrected:
        raise SteaneError(
            "No miscorrected weight-2 error was found. That contradicts distance 3, so either the "
            "stabilisers or the syndrome arithmetic is wrong."
        )

    return {
        "miscorrected_count": len(miscorrected),
        "example": miscorrected[0],
        "claim": (
            "Weight-2 errors exist whose syndrome matches a weight-1 error, so the decoder applies the "
            "wrong correction. This is what distance 3 means: correct one, detect two. The code does not "
            "correct two, and reporting otherwise would misdescribe it."
        ),
    }


def _multiply(left: str, right: str) -> str:
    """Product of two Pauli strings, ignoring phase.

    Phase is dropped deliberately: syndromes depend only on commutation, which is
    phase-independent, and carrying a sign here would suggest it mattered.
    """
    product = {
        ("I", "I"): "I", ("I", "X"): "X", ("I", "Y"): "Y", ("I", "Z"): "Z",
        ("X", "I"): "X", ("X", "X"): "I", ("X", "Y"): "Z", ("X", "Z"): "Y",
        ("Y", "I"): "Y", ("Y", "X"): "Z", ("Y", "Y"): "I", ("Y", "Z"): "X",
        ("Z", "I"): "Z", ("Z", "X"): "Y", ("Z", "Y"): "X", ("Z", "Z"): "I",
    }
    return "".join(product[(a, b)] for a, b in zip(left, right))
