"""kq.algorithms.quantum-teleportation 1.0.0.

Wraps `ketqat_runner.teleportation`: the three-qubit protocol as a state
vector, every measurement branch projected out exactly, Bob's corrections
applied, and the fidelity with the input state reported per branch. The seed
chooses the input state when none is given and samples which branch occurred.
"""

from __future__ import annotations

from typing import Any

from ...teleportation import (
    BELL_PAIR,
    OUTCOMES,
    TeleportationError,
    bloch_state,
    random_state,
    teleportation_report,
)
from ..params import ParameterError


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def validate(params: dict[str, Any]) -> None:
    if (params["theta"] is None) != (params["phi"] is None):
        raise ParameterError("Give both 'theta' and 'phi' for a chosen input state, or neither for a seeded random one.")


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    import numpy as np

    if params["theta"] is None:
        state = random_state(np.random.default_rng(seed))
        source = "random (Haar-distributed pure state drawn from the seed)"
    else:
        state = bloch_state(float(params["theta"]), float(params["phi"]))
        source = "given: cos(theta/2)|0> + exp(i phi) sin(theta/2)|1>"
    try:
        report = teleportation_report(state, shots=params["shots"], seed=seed)
    except TeleportationError as exc:
        raise ParameterError(str(exc)) from exc

    input_state = report["input_state"]
    return {
        "protocol": "Alice: CNOT(message -> her Bell half), H(message), measure both; Bob: X if Alice's bit is 1, then Z if the message bit is 1",
        "bell_pair": BELL_PAIR,
        "qubit_order": "qubit 0 message, qubit 1 Alice's half, qubit 2 Bob's half (little-endian)",
        "input_state": {
            "source": source,
            "theta": _round(input_state["theta"]),
            "phi": _round(input_state["phi"]),
            "bloch_vector": [_round(value) for value in input_state["bloch_vector"]],
            "amplitudes": [[_round(part) for part in amplitude] for amplitude in input_state["amplitudes"]],
        },
        "outcome_labels": "m0 m1: m0 is the message qubit's bit after the Hadamard (controls Z), m1 is Alice's half of the pair (controls X)",
        "branches": [
            {
                "outcome": branch["outcome"],
                "probability": _round(branch["probability"]),
                "correction": branch["correction"],
                "fidelity": _round(branch["fidelity"]),
                "fidelity_without_correction": _round(branch["fidelity_without_correction"]),
            }
            for branch in report["branches"]
        ],
        "min_fidelity": _round(report["min_fidelity"]),
        "max_fidelity": _round(report["max_fidelity"]),
        "average_fidelity_without_correction": _round(report["average_fidelity_without_correction"]),
        "expected_outcome_probability": 0.25,
        "shots": params["shots"],
        "counts": {label: report["counts"][label] for label in OUTCOMES},
        "observed_frequencies": {label: _round(report["observed_frequencies"][label]) for label in OUTCOMES},
        "execution": "exact three-qubit statevector simulation; shots sample only which measurement outcome occurred",
    }
