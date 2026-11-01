"""kq.qinfo.state-tomography 1.0.0: state tomography by linear inversion.

A known pure state (a preset, a Bloch-sphere point, a Bell or GHZ state, or a
seeded random state) is "measured" in every Pauli basis: for each Pauli
string the +1/-1 outcome counts are sampled from the exact Born probabilities
with the requested number of shots, or taken exactly when exact=true. The
density matrix is then reconstructed by linear inversion.

One qubit goes through `ketqat_runner.tomography` (`bloch_from_counts`,
`reconstruct_state`, `fidelity_with_pure_state`). Several qubits use the Pauli
basis and ordering of `ketqat_runner.process_tomography`, whose
`multi_qubit_state_tomography` provides the exact, infinite-shot reconstruction
the sampled one is compared against.

Physicality is reported, never repaired: a finite-shot reconstruction with a
negative eigenvalue is returned as it is, with the eigenvalue, because
projecting it onto the state space would hide how far the data landed outside.
"""

from __future__ import annotations

import cmath
import math
from typing import Any

from ...process_tomography import (
    COMPLETE_POSITIVITY_TOLERANCE,
    PAULI_BASIS,
    ProcessTomographyError,
    multi_qubit_state_tomography,
)
from ...tomography import bloch_from_counts, fidelity_with_pure_state, reconstruct_state
from ..params import ParameterError

MAX_QUBITS = 4
SINGLE_QUBIT_PRESETS = {
    "zero": (0.0, 0.0, "|0>"),
    "one": (math.pi, 0.0, "|1>"),
    "plus": (math.pi / 2, 0.0, "|+> = (|0> + |1>)/sqrt(2)"),
    "minus": (math.pi / 2, math.pi, "|-> = (|0> - |1>)/sqrt(2)"),
    "i-plus": (math.pi / 2, math.pi / 2, "|+i> = (|0> + i|1>)/sqrt(2)"),
}


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def validate(params: dict[str, Any]) -> None:
    preset = params["preset"]
    if preset in ("bell", "ghz", "random"):
        qubits = params["qubits"]
        if preset == "bell" and qubits not in (None, 2):
            raise ParameterError("preset=bell is a 2-qubit state; leave 'qubits' null or set it to 2.")
        if qubits is not None and qubits > MAX_QUBITS:
            raise ParameterError(f"qubits={qubits} exceeds the {MAX_QUBITS}-qubit ceiling (4^n Pauli settings).")
        if preset == "ghz" and qubits is not None and qubits < 2:
            raise ParameterError("preset=ghz needs at least 2 qubits.")
    elif params["qubits"] is not None:
        raise ParameterError("'qubits' applies only to preset=ghz and preset=random; the other presets are one qubit.")


def _target(params: dict[str, Any], rng: Any) -> tuple[Any, int, dict[str, Any]]:
    import numpy as np

    preset = params["preset"]
    if preset in SINGLE_QUBIT_PRESETS or preset == "bloch":
        if preset == "bloch":
            theta, phi = float(params["theta"]), float(params["phi"])
            description = "cos(theta/2)|0> + exp(i phi) sin(theta/2)|1>"
        else:
            theta, phi, description = SINGLE_QUBIT_PRESETS[preset]
        state = np.array([math.cos(theta / 2), cmath.exp(1j * phi) * math.sin(theta / 2)], dtype=complex)
        return state, 1, {"preset": preset, "qubits": 1, "description": description, "theta": _round(theta), "phi": _round(phi)}
    if preset == "bell":
        state = np.zeros(4, dtype=complex)
        state[0] = state[3] = 1 / math.sqrt(2)
        return state, 2, {"preset": preset, "qubits": 2, "description": "|Phi+> = (|00> + |11>)/sqrt(2)"}
    if preset == "ghz":
        qubits = params["qubits"] if params["qubits"] is not None else 3
        state = np.zeros(1 << qubits, dtype=complex)
        state[0] = state[-1] = 1 / math.sqrt(2)
        return state, qubits, {"preset": preset, "qubits": qubits, "description": "(|0...0> + |1...1>)/sqrt(2)"}
    qubits = params["qubits"] if params["qubits"] is not None else 2
    vector = rng.normal(size=1 << qubits) + 1j * rng.normal(size=1 << qubits)
    vector /= np.linalg.norm(vector)
    return vector, qubits, {"preset": preset, "qubits": qubits, "description": "seeded Haar-random pure state"}


def _pauli_operator(label: str) -> Any:
    import numpy as np

    matrices = dict(PAULI_BASIS)
    operator = np.array([[1.0 + 0j]])
    for letter in label:
        operator = np.kron(operator, matrices[letter])
    return operator


def _sample_expectation(exact: float, shots: int | None, rng: Any) -> tuple[float, float, dict[str, int] | None]:
    """Estimate <P> from `shots` two-outcome measurements; exact when shots is null."""
    if shots is None:
        return exact, 0.0, None
    p_plus = min(1.0, max(0.0, (1 + exact) / 2))
    plus = int(rng.binomial(shots, p_plus))
    minus = shots - plus
    estimate = (plus - minus) / shots
    error = math.sqrt(max(0.0, 1 - estimate * estimate) / shots)
    return estimate, error, {"plus": plus, "minus": minus}


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    import numpy as np

    rng = np.random.default_rng(seed)
    state, qubits, target = _target(params, rng)
    shots = None if params["exact"] else params["shots"]
    density = np.outer(state, state.conj())

    try:
        exact_report = multi_qubit_state_tomography(state, qubits)
    except ProcessTomographyError as exc:
        raise ParameterError(str(exc)) from exc
    labels, exact_values = exact_report["pauli_labels"], exact_report["expectations"]

    estimates: list[dict[str, Any]] = []
    sampled_counts: dict[str, dict[str, int]] = {}
    estimated: dict[str, float] = {}
    for label, exact in zip(labels, exact_values):
        if set(label) == {"I"}:
            estimate, error, counts = 1.0, 0.0, None
        else:
            estimate, error, counts = _sample_expectation(float(exact), shots, rng)
        estimated[label] = estimate
        if counts is not None:
            sampled_counts[label] = counts
        estimates.append(
            {"pauli": label, "estimate": _round(estimate), "standard_error": _round(error), "exact": _round(exact)}
        )
    max_error = max(abs(entry["estimate"] - entry["exact"]) for entry in estimates)

    size = 1 << qubits
    result: dict[str, Any] = {
        "target": target,
        "qubits": qubits,
        "shots_per_setting": shots,
        "measurement": (
            "each Pauli string measured as a +1/-1 observable; outcome counts sampled from the exact Born probabilities"
            if shots is not None
            else "exact expectation values (infinite-shot limit)"
        ),
        "estimator": "linear inversion: rho = sum_P <P> P / 2^n",
        "pauli_settings": len(labels),
        "expectations": estimates,
        "max_expectation_error": _round(max_error),
    }

    if qubits == 1:
        bloch = {"x": estimated["X"], "y": estimated["Y"], "z": estimated["Z"]}
        if shots is not None:
            bloch = bloch_from_counts(
                (sampled_counts["X"]["plus"], sampled_counts["X"]["minus"]),
                (sampled_counts["Y"]["plus"], sampled_counts["Y"]["minus"]),
                (sampled_counts["Z"]["plus"], sampled_counts["Z"]["minus"]),
            )
        else:
            bloch.update({"x_standard_error": 0.0, "y_standard_error": 0.0, "z_standard_error": 0.0})
        reconstruction = reconstruct_state(bloch)
        target_bloch = (float(exact_values[labels.index("X")]), float(exact_values[labels.index("Y")]), float(exact_values[labels.index("Z")]))
        fidelity = fidelity_with_pure_state(bloch, target_bloch)
        rho = np.array(reconstruction["density_matrix"])
        result["bloch_vector"] = {key: _round(value) for key, value in bloch.items()}
        result["target_bloch_vector"] = [_round(value) for value in target_bloch]
        result["bloch_length"] = _round(reconstruction["bloch_length"])
        result["eigenvalues"] = [_round(value) for value in sorted(reconstruction["eigenvalues"])]
        result["purity"] = _round(reconstruction["purity"])
        result["physical"] = bool(reconstruction["physical"])
        result["physicality_note"] = reconstruction.get("reason", "Physical: the Bloch vector lies inside the unit ball.")
    else:
        rho = np.zeros((size, size), dtype=complex)
        for label in labels:
            rho += estimated[label] * _pauli_operator(label) / size
        eigenvalues = np.linalg.eigvalsh(rho)
        smallest = float(eigenvalues.min())
        physical = smallest >= -COMPLETE_POSITIVITY_TOLERANCE
        fidelity = float(np.real(np.vdot(state, rho @ state)))
        result["eigenvalues"] = [_round(value) for value in eigenvalues]
        result["purity"] = _round(float(np.trace(rho @ rho).real))
        result["physical"] = bool(physical)
        result["physicality_note"] = (
            "Physical within tolerance: every eigenvalue is non-negative."
            if physical
            else f"NOT physical: smallest eigenvalue {smallest:.4e}. Linear inversion from finite statistics "
            "routinely lands outside the state space; the estimate is returned unprojected."
        )

    result["trace"] = _round(float(np.trace(rho).real))
    result["density_matrix_real"] = [[_round(value) for value in row] for row in rho.real.tolist()]
    result["density_matrix_imaginary"] = [[_round(value) for value in row] for row in rho.imag.tolist()]
    result["fidelity_with_target"] = _round(fidelity)
    result["reconstruction_error"] = _round(float(np.abs(rho - density).max()))
    result["exact_reconstruction"] = {
        "reconstruction_error": _round(exact_report["reconstruction_error"]),
        "purity": _round(exact_report["purity"]),
        "physical": bool(exact_report["physical"]),
        "note": "linear inversion from exact expectation values (multi_qubit_state_tomography)",
    }
    result["execution"] = "exact Born probabilities from the target state vector; seeded binomial sampling; dense linear algebra"
    return result
