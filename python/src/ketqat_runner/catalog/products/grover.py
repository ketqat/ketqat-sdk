"""kq.algorithms.grover-search 1.0.0: statevector Grover search."""

from __future__ import annotations

from typing import Any

from ...grover_statevector import GroverParameterError, run_grover, validate_request
from ..params import ParameterError


def validate(params: dict[str, Any]) -> None:
    try:
        validate_request(params["n_qubits"], params["marked"], params["iterations"])
    except GroverParameterError as exc:
        raise ParameterError(str(exc)) from exc


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    return run_grover(
        n_qubits=params["n_qubits"],
        marked=params["marked"],
        iterations=params["iterations"],
        shots=params["shots"],
        seed=seed,
    )
