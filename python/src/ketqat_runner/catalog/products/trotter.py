"""kq.algorithms.trotter-ising-dynamics 1.0.0.

Wraps `ketqat_runner.trotter`: first- or second-order product-formula
evolution of the transverse-field Ising chain, applied gate by gate on
amplitudes, against exp(-iHt)|0...0> computed exactly by eigendecomposition of
the dense Hamiltonian. Reports the fidelity between the two, two observables
on both states, and (optionally) the fitted exponent of the Trotter error
against the step count, which theory fixes at -2 (first order) and -4 (second
order) for the infidelity.
"""

from __future__ import annotations

from typing import Any

from ...trotter import (
    TrotterError,
    error_scaling,
    exact_evolution,
    ising_hamiltonian,
    trotter_evolution,
    trotter_report,
)
from ..params import ParameterError

#: Dense 2^n x 2^n Hamiltonians: 10 qubits is 16 MiB and about 1.6 s per
#: eigendecomposition on a 2024 laptop; 12 qubits would be 256 MiB and ~1 GB of
#: eigendecomposition workspace.
MAX_QUBITS = 10
MAX_SECONDS = 30.0
EIGH_SECONDS_AT_10 = 1.6
TROTTER_SECONDS_PER_UNIT = 1e-7


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def estimate_seconds(params: dict[str, Any]) -> float:
    n = params["qubits"]
    eigh = EIGH_SECONDS_AT_10 * 8.0 ** (n - 10)
    decompositions = 1 + (1 + len(params["scaling_step_counts"]) if params["fit_scaling"] else 0)
    steps = params["steps"] + (sum(params["scaling_step_counts"]) if params["fit_scaling"] else 0)
    return decompositions * eigh + steps * n * (1 << n) * TROTTER_SECONDS_PER_UNIT


def validate(params: dict[str, Any]) -> None:
    n = params["qubits"]
    if n > MAX_QUBITS:
        bytes_needed = (1 << n) ** 2 * 16
        raise ParameterError(
            f"qubits={n} needs a dense {1 << n}x{1 << n} Hamiltonian of {bytes_needed / 1024**2:.0f} MiB and "
            f"several times that to diagonalise (limit {MAX_QUBITS} qubits, {(1 << MAX_QUBITS) ** 2 * 16 / 1024**2:.0f} MiB)."
        )
    seconds = estimate_seconds(params)
    if seconds > MAX_SECONDS:
        raise ParameterError(
            f"This request would take about {seconds:.0f} s (limit {MAX_SECONDS:.0f} s): "
            f"{params['steps']} steps plus the scaling fit on {n} qubits. Use fewer steps, fewer "
            "scaling step counts, fit_scaling=false or fewer qubits."
        )


def _magnetization(state: Any, n: int) -> float:
    import numpy as np

    probabilities = np.abs(state) ** 2
    total = 0.0
    for qubit in range(n):
        signs = np.array([1 - 2 * ((basis >> qubit) & 1) for basis in range(1 << n)])
        total += float(np.dot(probabilities, signs))
    return total / n


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:  # noqa: ARG001 - deterministic
    import numpy as np

    n = params["qubits"]
    common = {
        "coupling": float(params["coupling"]),
        "field": float(params["field"]),
        "periodic": params["periodic"],
    }
    try:
        report = trotter_report(n, time=float(params["time"]), steps=params["steps"], order=params["order"], **common)
        hamiltonian = ising_hamiltonian(n, **common)
        initial = np.zeros(1 << n, dtype=complex)
        initial[0] = 1.0
        exact = exact_evolution(hamiltonian, float(params["time"]), initial)
        approximate = trotter_evolution(
            n, time=float(params["time"]), steps=params["steps"], order=params["order"], **common
        )
    except TrotterError as exc:
        raise ParameterError(str(exc)) from exc

    scaling: dict[str, Any] | None = None
    scaling_note = None
    if params["fit_scaling"]:
        try:
            fit = error_scaling(
                n,
                time=float(params["time"]),
                order=params["order"],
                step_counts=list(params["scaling_step_counts"]),
                **common,
            )
            scaling = {
                "step_counts": fit["step_counts"],
                "infidelities": [_round(value) for value in fit["infidelities"]],
                "slope": _round(fit["slope"]),
                "expected_slope": fit["expected_slope"],
                "intercept": _round(fit["intercept"]),
                "note": fit["note"],
            }
        except TrotterError as exc:
            scaling_note = str(exc)

    return {
        "model": "H = -J sum_<i,j> Z_i Z_j - h sum_i X_i",
        "qubits": n,
        "coupling": common["coupling"],
        "field": common["field"],
        "periodic": params["periodic"],
        "time": float(params["time"]),
        "steps": params["steps"],
        "order": params["order"],
        "splitting": "first-order Lie-Trotter: exp(-iH_ZZ dt) exp(-iH_X dt) per step"
        if params["order"] == 1
        else "second-order Strang (Suzuki) splitting: exp(-iH_X dt/2) exp(-iH_ZZ dt) exp(-iH_X dt/2) per step",
        "initial_state": "|0...0> (all spins up along Z)",
        "fidelity": _round(report["fidelity"]),
        "infidelity": _round(report["infidelity"]),
        "state_distance": _round(report["state_distance"]),
        "observables": {
            "survival_probability": {
                "trotter": _round(abs(approximate[0]) ** 2),
                "exact": _round(abs(exact[0]) ** 2),
            },
            "average_magnetization_z": {
                "trotter": _round(_magnetization(approximate, n)),
                "exact": _round(_magnetization(exact, n)),
            },
        },
        "scaling": scaling,
        "scaling_note": scaling_note,
        "reference": report["reference"],
        "execution": "statevector simulation of the Trotter circuit; exact reference by dense eigendecomposition",
    }
