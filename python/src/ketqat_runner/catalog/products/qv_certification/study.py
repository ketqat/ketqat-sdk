"""The certification run across widths, as one JSON-serialisable result."""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from .certification import PROTOCOL_MINIMUM_CIRCUITS, achieved_quantum_volume, bootstrap_interval, certify, empirical_intervals
from .protocol import sample_width
from .report import to_markdown

#: Result schema identifier. It is part of the hashed result, so it keeps the name it had
#: when this product was first released (1.0.0): changing it would change every resultSha256.
SCHEMA = "ketqat.pro.quantum-volume-certification/v1"
DEFAULT_WIDTHS = [2, 3, 4]
BOOTSTRAP_RESAMPLES = 200
NOISE_MODEL = "each circuit's ideal output distribution mixed toward uniform with weight depolarizing_rate (global depolarizing), then sampled with finite shots"


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
        if not math.isfinite(number):
            raise ValueError("a non-finite number reached the result")
        return float(round(number, 12))
    if value is None or isinstance(value, str):
        return value
    raise TypeError(f"unsupported result value of type {type(value).__name__}")


def run_certification(*, widths: list[int], circuits_per_width: int, shots: int, depolarizing_rate: float, seed: int,
                      bootstrap_resamples: int = BOOTSTRAP_RESAMPLES) -> dict[str, Any]:
    widths = sorted(int(w) for w in widths)
    per_width: list[dict[str, Any]] = []
    for width in widths:
        circuits = sample_width(width=width, circuits=circuits_per_width, shots=shots, depolarizing_rate=depolarizing_rate, seed=seed)
        fractions = [c["heavy_fraction"] for c in circuits]
        rng = np.random.default_rng((seed * 1_000_003 + 7 * width) % (2**32))
        per_width.append({
            "width": width,
            "circuits": circuits_per_width,
            "shots": shots,
            "depth": width,
            "certification": certify(fractions),
            "empirical_interval": empirical_intervals(fractions),
            "bootstrap_interval": bootstrap_interval(fractions, bootstrap_resamples, rng),
            "mean_ideal_heavy_output_probability": float(np.mean([c["ideal_heavy_output_probability"] for c in circuits])),
            "mean_exact_noisy_heavy_output_probability": float(np.mean([c["exact_noisy_heavy_output_probability"] for c in circuits])),
            "total_heavy_count": int(sum(c["heavy_count"] for c in circuits)),
            "per_circuit": circuits,
        })
    summary = achieved_quantum_volume(per_width)
    result: dict[str, Any] = {
        "schema": SCHEMA,
        "protocol": "quantum volume (Cross, Bishop, Sheldon, Nation and Gambetta 2019): square model circuits of Haar-random SU(4) layers",
        "noise_model": NOISE_MODEL,
        "widths": widths,
        "circuits_per_width": circuits_per_width,
        "shots": shots,
        "depolarizing_rate": depolarizing_rate,
        "seed": seed,
        "seed_derivation": "circuit: sha256(seed,width,index); shots: sha256('shots',seed,width,index)",
        "bootstrap_resamples": bootstrap_resamples,
        "meets_protocol_minimum_circuits": circuits_per_width >= PROTOCOL_MINIMUM_CIRCUITS,
        "protocol_minimum_circuits": PROTOCOL_MINIMUM_CIRCUITS,
        "achieved_quantum_volume": summary["achieved_quantum_volume"],
        "certification": summary,
        "per_width": per_width,
    }
    result = plain(result)
    result["report"] = to_markdown(result)
    return result
