"""kq.qec.repetition-code-memory 1.0.0.

Wraps `ketqat_runner.repetition_code`: seeded Monte Carlo of the n-qubit
bit-flip repetition code under independent bit flips, decoded from the
Z_i Z_{i+1} syndrome by minimum weight (majority vote), with a Wilson interval
around the logical error rate and the exact binomial value beside it.
"""

from __future__ import annotations

from typing import Any

from ...repetition_code import (
    MAX_SAMPLED_BITS,
    SECONDS_PER_SAMPLED_BIT,
    RepetitionCodeError,
    repetition_code_memory,
)
from ..params import ParameterError


def validate(params: dict[str, Any]) -> None:
    n = params["n"]
    if n % 2 == 0:
        raise ParameterError(f"Parameter 'n' must be odd so that majority vote is defined; got {n}.")
    bits = n * params["shots"]
    if bits > MAX_SAMPLED_BITS:
        raise ParameterError(
            f"n={n} with shots={params['shots']} samples {bits:.2e} qubit flips, about "
            f"{bits * SECONDS_PER_SAMPLED_BIT:.0f} s (limit {MAX_SAMPLED_BITS:.0e} flips, about "
            f"{MAX_SAMPLED_BITS * SECONDS_PER_SAMPLED_BIT:.0f} s). Use fewer shots and repeat with other seeds."
        )


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    try:
        result = repetition_code_memory(params["n"], float(params["physical_error_rate"]), params["shots"], seed)
    except RepetitionCodeError as exc:
        raise ParameterError(str(exc)) from exc
    result["execution"] = "seeded NumPy Monte Carlo of per-qubit bit flips, syndrome extraction and majority-vote decoding"
    return result
