"""The study: sweep, statistics, collapse and report in one JSON-serialisable result."""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from .collapse import finite_size_collapse
from .report import to_markdown
from .statistics import estimate_threshold, suppression_table
from .sweep import DECODERS, MEMORY_BASIS, NOISE_MODEL, sweep

#: Result schema identifier. It is part of the hashed result, so it keeps the name it had
#: when this product was first released (1.0.0): changing it would change every resultSha256.
SCHEMA = "ketqat.pro.surface-code-threshold-study/v1"
DEFAULT_DISTANCES = [3, 5, 7]
DEFAULT_PHYSICAL_ERROR_RATES = [0.003, 0.005, 0.007, 0.009, 0.011, 0.013]
BOOTSTRAP_RESAMPLES = 200


def plain(value: Any) -> Any:
    """Plain JSON types only: numpy scalars unwrapped, floats rounded to 12 decimals, nothing non-finite."""
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


def run_study(*, distances: list[int], physical_error_rates: list[float], shots_per_point: int, rounds: int | None,
              decoder: str, seed: int, bootstrap_resamples: int = BOOTSTRAP_RESAMPLES) -> dict[str, Any]:
    distances = sorted(int(d) for d in distances)
    rates = sorted(float(p) for p in physical_error_rates)
    points = sweep(distances=distances, physical_error_rates=rates, rounds=rounds, shots=shots_per_point, seed=seed, decoder=decoder)
    decoder_version = points[0]["_decoder_version"]
    generator = points[0]["_generator"]
    seed_derivation = points[0]["_seed_derivation"]
    public_points = [{k: v for k, v in p.items() if not k.startswith("_")} for p in points]

    threshold = estimate_threshold(public_points, resamples=bootstrap_resamples, seed=seed)
    collapse = finite_size_collapse(public_points, rate_bounds=(rates[0], rates[-1]))
    result: dict[str, Any] = {
        "schema": SCHEMA,
        "code": "rotated surface code",
        "memory_basis": MEMORY_BASIS,
        "noise_model": NOISE_MODEL,
        "decoder": decoder,
        "decoder_implementation": DECODERS[decoder],
        "decoder_version": decoder_version,
        "stim_generator": generator,
        "seed": seed,
        "seed_derivation": seed_derivation,
        "distances": distances,
        "rounds": [rounds if rounds is not None else d for d in distances],
        "physical_error_rates": rates,
        "shots_per_point": shots_per_point,
        "points": public_points,
        "suppression_factors": suppression_table(public_points),
        "threshold_estimate": threshold,
        "finite_size_collapse": collapse,
    }
    result = plain(result)
    result["report"] = to_markdown(result)
    return result
