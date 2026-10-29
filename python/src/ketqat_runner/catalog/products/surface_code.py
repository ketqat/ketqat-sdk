"""kq.qec.surface-code-memory 1.0.0.

Wraps the runner's existing rotated surface-code memory experiment
(`runner._sample_surface_code_memory`): Stim generates and samples the noisy
circuit, PyMatching decodes it, and the logical error rate is reported with a
Wilson score interval (`qec_statistics.logical_error_rate_summary`).

The coordinate seed is derived exactly as `ketqat run` derives it for the
`surface-code-memory-mwpm` 0.1.0 benchmark, so the same distance, rate and
seed give the same samples here as in a manifest run. Timings are measured by
the sampler but left out of the result: they differ between runs and would
make `resultSha256` irreproducible.
"""

from __future__ import annotations

from typing import Any

from ..params import ParameterError

BENCHMARK_VERSION = "0.1.0"
#: Stim returns one byte per detector per shot. Above this the run is refused
#: with the estimate rather than left to exhaust memory.
MAX_SAMPLE_BYTES = 2 * 1024**3
CODE_FAMILIES = {"x": "rotated-surface-code-memory-x", "z": "rotated-surface-code-memory-z"}


def validate(params: dict[str, Any]) -> None:
    distance = params["distance"]
    if distance % 2 == 0:
        raise ParameterError(f"Parameter 'distance' must be odd; got {distance}.")
    rounds = params["rounds"]
    if rounds is not None and rounds < 1:
        raise ParameterError("Parameter 'rounds' must be a positive integer or null (= distance).")
    resolved_rounds = rounds if rounds is not None else distance
    # (d^2 - 1) stabilizers measured every round plus the final readout: an upper estimate
    # of the detector count, which is what the sampled array holds per shot.
    detectors = (distance * distance - 1) * (resolved_rounds + 1)
    estimate = detectors * params["shots"]
    if estimate > MAX_SAMPLE_BYTES:
        raise ParameterError(
            f"distance={distance}, rounds={resolved_rounds}, shots={params['shots']} would hold about "
            f"{estimate / 1024**3:.1f} GiB of detector samples in memory (limit "
            f"{MAX_SAMPLE_BYTES / 1024**3:.0f} GiB). Use fewer shots and repeat with different seeds."
        )


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    from ...qec_statistics import logical_error_rate_summary
    from ...runner import _sample_surface_code_memory

    distance = params["distance"]
    rounds = params["rounds"] if params["rounds"] is not None else distance
    shots = params["shots"]
    family = CODE_FAMILIES[params["basis"]]
    physical_error_rate = float(params["physical_error_rate"])

    sample = _sample_surface_code_memory(
        benchmark_version=BENCHMARK_VERSION,
        distance=distance,
        physical_error_rate=physical_error_rate,
        rounds=rounds,
        shots=shots,
        seed=seed,
        decoder_configs=[{"name": params["decoder"]}],
        code_family=family,
    )
    decoded = sample["decoders"][0]
    summary = logical_error_rate_summary(decoded["logical_failures"], shots)
    result: dict[str, Any] = {
        "code": "rotated surface code",
        "memory_basis": params["basis"],
        "distance": distance,
        "rounds": rounds,
        "physical_error_rate": physical_error_rate,
        "noise_model": "uniform depolarizing after every Clifford gate (Stim after_clifford_depolarization)",
        "shots": shots,
        "decoder": decoded["decoder"],
        "decoder_version": decoded["decoder_version"],
        "logical_failures": summary["logical_failures"],
        "logical_error_rate": summary["logical_error_rate"],
        "confidence_interval": {
            "lower": summary["confidence_interval_lower"],
            "upper": summary["confidence_interval_upper"],
            "level": summary["confidence_level"],
            "method": summary["interval_method"],
        },
        "is_upper_bound_only": bool(summary.get("is_upper_bound_only", False)),
        "stim_generator": sample["generator"],
        "coordinate_seed": sample["coordinate_seed"],
        "seed_derivation": sample["seed_derivation"],
        "execution": "Stim circuit sampling decoded by PyMatching",
    }
    if "interpretation" in summary:
        result["interpretation"] = summary["interpretation"]
    return result
