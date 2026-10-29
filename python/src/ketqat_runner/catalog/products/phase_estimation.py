"""kq.algorithms.quantum-phase-estimation 1.0.0.

Wraps `ketqat_runner.phase_estimation`, the runner's existing statevector
simulation of textbook phase estimation (Hadamards, the controlled-U^(2^j)
phase kickback against an eigenstate, inverse QFT). Pure Python: no extra is
needed.
"""

from __future__ import annotations

import random
from typing import Any

from ...phase_estimation import MAX_COUNTING_QUBITS, estimate_phase
from ..params import ParameterError

#: Outcomes listed in the result, most probable first. The full distribution
#: has 2^n entries and is not copied into every record.
TOP_OUTCOMES = 8


def validate(params: dict[str, Any]) -> None:
    phase = params["phase"]
    if not 0 <= phase < 1:
        raise ParameterError(f"Parameter 'phase' must lie in [0, 1); got {phase}.")
    if params["counting_qubits"] > MAX_COUNTING_QUBITS:
        raise ParameterError(
            f"counting_qubits={params['counting_qubits']} exceeds the "
            f"{MAX_COUNTING_QUBITS}-qubit ceiling of this simulation."
        )


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    phase = float(params["phase"])
    counting = params["counting_qubits"]
    shots = params["shots"]
    estimate = estimate_phase(phase, counting)
    distribution = estimate["distribution"]
    size = 1 << counting

    rng = random.Random(seed)
    draws = rng.choices(range(size), weights=distribution, k=shots)
    tally: dict[int, int] = {}
    for outcome in draws:
        tally[outcome] = tally.get(outcome, 0) + 1
    counts = {format(outcome, f"0{counting}b"): tally[outcome] for outcome in sorted(tally)}
    most_frequent = max(sorted(tally), key=lambda outcome: tally[outcome])

    ranked = sorted(range(size), key=lambda index: (-distribution[index], index))[:TOP_OUTCOMES]
    return {
        "counting_qubits": counting,
        "true_phase": phase,
        "estimated_phase": estimate["estimated_phase"],
        "measured_integer": estimate["measured_integer"],
        "success_probability": estimate["success_probability"],
        "phase_error": estimate["phase_error"],
        "resolution": estimate["resolution"],
        "phase_is_representable": estimate["phase_is_representable"],
        "top_outcomes": [
            {
                "integer": index,
                "bitstring": format(index, f"0{counting}b"),
                "phase": index / size,
                "probability": distribution[index],
            }
            for index in ranked
        ],
        "shots": shots,
        "counts": counts,
        "most_frequent_integer": most_frequent,
        "sampled_phase_estimate": most_frequent / size,
        "backend": "ketqat-statevector-python",
        "execution": "statevector simulation of the gate sequence",
    }
