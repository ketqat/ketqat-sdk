"""The (distance, physical error rate) sweep, sampled exactly as surface-code-memory.

Every point calls `runner._sample_surface_code_memory` with the same
benchmark version, code family (rotated surface code, memory Z) and seed
derivation as `kq.qec.surface-code-memory`, so a point here reproduces that
product's failure count for the same distance, rate, rounds, shots and seed.
Timings returned by the sampler are dropped: the result must be reproducible
from version, parameters and seed alone.
"""
from __future__ import annotations

from typing import Any

from ....qec_statistics import logical_error_rate_summary
from ....runner import _sample_surface_code_memory

BENCHMARK_VERSION = "0.1.0"
CODE_FAMILY = "rotated-surface-code-memory-z"
MEMORY_BASIS = "z"
NOISE_MODEL = "uniform depolarizing after every Clifford gate (Stim after_clifford_depolarization)"
#: Public decoder name -> the runner's decoder registry name.
DECODERS = {"mwpm": "pymatching"}


def sample_point(*, distance: int, physical_error_rate: float, rounds: int, shots: int, seed: int, decoder: str) -> dict[str, Any]:
    """One (d, p) point: failures, rate and Wilson interval; no timings."""
    sample = _sample_surface_code_memory(
        benchmark_version=BENCHMARK_VERSION,
        distance=distance,
        physical_error_rate=physical_error_rate,
        rounds=rounds,
        shots=shots,
        seed=seed,
        decoder_configs=[{"name": DECODERS[decoder]}],
        code_family=CODE_FAMILY,
    )
    decoded = sample["decoders"][0]
    summary = logical_error_rate_summary(decoded["logical_failures"], shots)
    return {
        "distance": distance,
        "physical_error_rate": physical_error_rate,
        "rounds": rounds,
        "shots": shots,
        "logical_failures": summary["logical_failures"],
        "logical_error_rate": summary["logical_error_rate"],
        "confidence_interval": {
            "lower": summary["confidence_interval_lower"],
            "upper": summary["confidence_interval_upper"],
            "level": summary["confidence_level"],
            "method": summary["interval_method"],
        },
        "is_upper_bound_only": bool(summary.get("is_upper_bound_only", False)),
        "coordinate_seed": sample["coordinate_seed"],
        "_decoder_version": decoded["decoder_version"],
        "_generator": sample["generator"],
        "_seed_derivation": sample["seed_derivation"],
    }


def sweep(*, distances: list[int], physical_error_rates: list[float], rounds: int | None, shots: int, seed: int, decoder: str) -> list[dict[str, Any]]:
    """Every (d, p) point, distances ascending then rates ascending."""
    points: list[dict[str, Any]] = []
    for distance in sorted(distances):
        resolved_rounds = rounds if rounds is not None else distance
        for rate in sorted(physical_error_rates):
            points.append(sample_point(distance=distance, physical_error_rate=float(rate), rounds=resolved_rounds,
                                       shots=shots, seed=seed, decoder=decoder))
    return points
