"""The suite: standard, interleaved and simultaneous RB with fits, bootstrap intervals and analytic expectations."""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from ....randomized_benchmarking import addressability_error, fit_decay as linearized_fit_decay, interleaved_gate_error

from .fitting import bootstrap_rng, fit_decay, percentile_interval, resample_points
from .report import to_markdown
from .sampling import collect_interleaved, collect_isolated, collect_simultaneous, collect_standard, interleavable_gates

#: Result schema identifier. It is part of the hashed result, so it keeps the name it had
#: when this product was first released (1.0.0): changing it would change every resultSha256.
SCHEMA = "ketqat.pro.randomized-benchmarking-suite/v1"
DEFAULT_SEQUENCE_LENGTHS = [1, 2, 4, 8, 16, 32, 64]
BOOTSTRAP_RESAMPLES = 200
NOISE_MODEL = ("DEPOLARIZE1 (one qubit) or DEPOLARIZE2 (two qubits) at the depolarizing rate after every Clifford; "
               "the interleaved gate carries its own rate; simultaneous RB adds DEPOLARIZE2 at the crosstalk rate per step")


def analytic_decay(rate: float, dimension: int) -> float:
    """Depolarizing parameter of DEPOLARIZE(p) on d dimensions: 1 - p d^2 / (d^2 - 1)."""
    return 1 - rate * dimension**2 / (dimension**2 - 1)


def analytic_error_per_clifford(rate: float, dimension: int) -> float:
    """(d-1)/d (1 - lambda) for the depolarizing model: p d / (d + 1)."""
    return rate * dimension / (dimension + 1)


def plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        if math.isnan(number):
            return None
        if not math.isfinite(number):
            raise ValueError("an infinite number reached the result")
        return float(round(number, 12))
    if value is None or isinstance(value, str):
        return value
    raise TypeError(f"unsupported result value of type {type(value).__name__}")


def _public_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in p.items() if k != "per_sequence"} for p in points]


def _decay_block(points: list[dict[str, Any]], dimension: int, rate: float, resamples: int, rng: np.random.Generator) -> dict[str, Any]:
    fit = fit_decay(points, dimension)
    decays: list[float] = []
    epcs: list[float] = []
    for _ in range(resamples):
        refit = fit_decay(resample_points(points, rng), dimension)
        if not refit["inconclusive"]:
            decays.append(refit["decay_parameter"])
            epcs.append(refit["error_per_clifford"])
    expected_decay = analytic_decay(rate, dimension)
    expected_epc = analytic_error_per_clifford(rate, dimension)
    epc_interval = percentile_interval(epcs)
    deviation = None
    if not fit["inconclusive"] and epc_interval["standard_deviation"]:
        deviation = (fit["error_per_clifford"] - expected_epc) / epc_interval["standard_deviation"]
    return {
        "points": _public_points(points),
        "fit": fit,
        "bootstrap": {"method": "non-parametric over sequences at every length", "resamples": resamples,
                      "decay_parameter": percentile_interval(decays), "error_per_clifford": epc_interval},
        "linearized_fit": linearized_fit_decay([{k: v for k, v in p.items() if k != "per_sequence"} for p in points], int(math.log2(dimension))),
        "analytic_expectation": {"decay_parameter": expected_decay, "error_per_clifford": expected_epc,
                                 "deviation_in_bootstrap_sigma": deviation,
                                 "model": "depolarizing: lambda = 1 - p d^2/(d^2-1), r = p d/(d+1); valid only for this simulated noise"},
    }


def run_suite(*, qubits: int, sequence_lengths: list[int], sequences_per_length: int, depolarizing_rate: float, shots: int, seed: int,
              interleaved_gate: str | None = None, interleaved_gate_depolarizing_rate: float | None = None,
              simultaneous_crosstalk_rate: float | None = None, bootstrap_resamples: int = BOOTSTRAP_RESAMPLES) -> dict[str, Any]:
    dimension = 2**qubits
    lengths = sorted(int(m) for m in sequence_lengths)
    common = {"lengths": lengths, "sequences": sequences_per_length, "rate": depolarizing_rate, "shots": shots, "seed": seed}

    standard_points = collect_standard(qubits=qubits, **common)
    standard = _decay_block(standard_points, dimension, depolarizing_rate, bootstrap_resamples, bootstrap_rng(seed, "standard"))

    interleaved: dict[str, Any] | None = None
    if interleaved_gate is not None:
        gate_rate = depolarizing_rate if interleaved_gate_depolarizing_rate is None else float(interleaved_gate_depolarizing_rate)
        interleaved_points = collect_interleaved(qubits=qubits, gate=interleaved_gate, gate_rate=gate_rate, **common)
        block = _decay_block(interleaved_points, dimension, depolarizing_rate, bootstrap_resamples, bootstrap_rng(seed, "interleaved"))
        del block["analytic_expectation"]  # the interleaved decay is lambda_C * lambda_gate, reported below
        estimate: dict[str, Any] = {"inconclusive": True, "reason": "the reference or interleaved decay could not be fitted"}
        if not standard["fit"]["inconclusive"] and not block["fit"]["inconclusive"]:
            estimate = interleaved_gate_error(standard["fit"]["decay_parameter"], block["fit"]["decay_parameter"], qubits)
        rng = bootstrap_rng(seed, "interleaved-gate-error")
        gate_errors: list[float] = []
        for _ in range(bootstrap_resamples):
            ref = fit_decay(resample_points(standard_points, rng), dimension)
            inter = fit_decay(resample_points(interleaved_points, rng), dimension)
            if not ref["inconclusive"] and not inter["inconclusive"]:
                value = interleaved_gate_error(ref["decay_parameter"], inter["decay_parameter"], qubits)
                if not value["inconclusive"]:
                    gate_errors.append(value["gate_error"])
        expected = analytic_error_per_clifford(gate_rate, dimension)
        interleaved = {
            "gate": interleaved_gate,
            "stim_gate": interleavable_gates(qubits)[interleaved_gate],
            "gate_depolarizing_rate": gate_rate,
            **block,
            "gate_error": estimate,
            "gate_error_bootstrap": percentile_interval(gate_errors),
            "analytic_expectation": {"gate_error": expected, "interleaved_decay": analytic_decay(depolarizing_rate, dimension) * analytic_decay(gate_rate, dimension),
                                     "model": "depolarizing: r_gate = q d/(d+1) for the gate's own rate q"},
        }

    simultaneous: dict[str, Any] | None = None
    if simultaneous_crosstalk_rate is not None:
        crosstalk = float(simultaneous_crosstalk_rate)
        together = collect_simultaneous(crosstalk_rate=crosstalk, **common)
        per_qubit = []
        rng = bootstrap_rng(seed, "simultaneous")
        for qubit in (0, 1):
            alone_points = collect_isolated(qubit=qubit, **common)
            alone_fit = fit_decay(alone_points, 2)
            together_fit = fit_decay(together[qubit], 2)
            estimate = {"inconclusive": True, "reason": "an isolated or simultaneous decay could not be fitted"}
            if not alone_fit["inconclusive"] and not together_fit["inconclusive"]:
                estimate = {"inconclusive": False, **addressability_error(alone_fit["decay_parameter"], together_fit["decay_parameter"])}
            values: list[float] = []
            for _ in range(bootstrap_resamples):
                a = fit_decay(resample_points(alone_points, rng), 2)
                t = fit_decay(resample_points(together[qubit], rng), 2)
                if not a["inconclusive"] and not t["inconclusive"]:
                    values.append(addressability_error(a["decay_parameter"], t["decay_parameter"])["addressability_error"])
            per_qubit.append({"qubit": qubit, "isolated": {"points": _public_points(alone_points), "fit": alone_fit},
                              "simultaneous": {"points": _public_points(together[qubit]), "fit": together_fit},
                              "addressability": estimate, "addressability_bootstrap": percentile_interval(values)})
        measured = [q["addressability"]["addressability_error"] for q in per_qubit if not q["addressability"]["inconclusive"]]
        # DEPOLARIZE2(c) seen from one qubit is a depolarizing channel with lambda = 1 - 16c/15.
        expected = 0.5 * analytic_decay(depolarizing_rate, 2) * (16 * crosstalk / 15)
        simultaneous = {
            "crosstalk_rate": crosstalk,
            "protocol": "two independent single-qubit RB sequences driven together, each compared with the same sequence run alone",
            "per_qubit": per_qubit,
            "mean_addressability_error": float(np.mean(measured)) if measured else None,
            "analytic_expectation": {"addressability_error": expected,
                                     "model": "the marginal of DEPOLARIZE2(c) is depolarizing with lambda = 1 - 16c/15, so the added error is lambda_alone * 8c/15"},
        }

    result: dict[str, Any] = {
        "schema": SCHEMA,
        "protocol": "Clifford randomized benchmarking (standard; interleaved and simultaneous when requested)",
        "qubits": qubits,
        "dimension": dimension,
        "noise_model": NOISE_MODEL,
        "depolarizing_rate": depolarizing_rate,
        "sequence_lengths": lengths,
        "sequences_per_length": sequences_per_length,
        "shots": shots,
        "seed": seed,
        "sequence_seed_derivation": "sha256(global_seed,sequence_length,sequence_index) (as the open SDK)",
        "bootstrap_resamples": bootstrap_resamples,
        "decay_parameter": None if standard["fit"]["inconclusive"] else standard["fit"]["decay_parameter"],
        "error_per_clifford": None if standard["fit"]["inconclusive"] else standard["fit"]["error_per_clifford"],
        "standard": standard,
        "interleaved": interleaved,
        "simultaneous": simultaneous,
    }
    result = plain(result)
    result["report"] = to_markdown(result)
    return result
