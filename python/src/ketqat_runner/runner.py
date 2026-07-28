from __future__ import annotations

import math
import random
import re
import hashlib
import time
from pathlib import Path
from typing import Any

from .decoders import DecoderError, resolve_decoder
from .environment import capture_environment
from .hashing import CURRENT_HASH_VERSION, HASH_VERSION_KEY, calculate_reproducibility_hash
from .qec_statistics import (
    COMPARABILITY_FIELDS,
    comparability_key,
    logical_error_rate_summary,
)
from .runner_version import SDK_VERSION
from .validation import KetQatValidationError, validate_manifest, validate_result


QEC_DEPENDENCY_MESSAGE = """The QEC benchmark requires the `qec` dependency group.
Install it with:

pip install "ketqat[qec]"
"""


def run_experiment(manifest: dict[str, Any]) -> dict[str, Any]:
    validate_manifest(manifest)
    domain = manifest.get("domain")
    if domain == "QEC":
        return _run_qec(manifest)
    if domain == "ALGORITHM":
        return _run_algorithm(manifest)
    raise ValueError(f"Unsupported KetQat domain: {domain!r}")


def _run_qec(manifest: dict[str, Any]) -> dict[str, Any]:
    qec = manifest["qec"]
    shots = int(manifest["sampling"]["shots"])
    seed = int(manifest["sampling"]["seed"])
    metric_points: list[dict[str, Any]] = []
    start = time.perf_counter_ns()

    # `decoders` supersedes `decoder` when present. Every decoder sees the same
    # shots at the same coordinate seed -- decoders benchmarked on different
    # samples are not competitors (RFC 0006).
    decoder_configs = qec.get("decoders") or [qec["decoder"]]

    for distance in qec["code"]["distances"]:
        if int(distance) < 1 or int(distance) % 2 == 0:
            raise KetQatValidationError("QEC distances must be positive odd integers.")
        for physical_error_rate in qec["noise"]["physical_error_rates"]:
            if not 0 <= float(physical_error_rate) <= 1:
                raise KetQatValidationError("Physical error rates must be in [0, 1].")
            sample = _sample_surface_code_memory(
                benchmark_version=manifest["benchmark"]["version"],
                distance=int(distance),
                physical_error_rate=float(physical_error_rate),
                rounds=_resolve_rounds(qec["code"]["rounds"], int(distance)),
                shots=shots,
                seed=seed,
                decoder_configs=decoder_configs,
                code_family=qec["code"]["family"],
            )
            for decoder_result in sample["decoders"]:
                summary = logical_error_rate_summary(decoder_result["logical_failures"], shots)
                metric_points.append(
                    {
                        "metric": "logical_error_rate",
                        "code_distance": int(distance),
                        "physical_error_rate": float(physical_error_rate),
                        "logical_failures": summary["logical_failures"],
                        "logical_error_rate": summary["logical_error_rate"],
                        "standard_error": summary["standard_error"],
                        "decoder_latency_ms": decoder_result["decoder_latency_ms"],
                        "sampling_runtime_seconds": sample["sampling_runtime_seconds"],
                        "runtime_seconds": decoder_result["total_runtime_seconds"],
                        "shots": shots,
                        "seed": sample["coordinate_seed"],
                        "metadata": {
                            "runner": "ketqat-runner",
                            "backend": f"stim-{decoder_result['decoder']}",
                            "decoder": decoder_result["decoder"],
                            "decoder_version": decoder_result["decoder_version"],
                            "decoder_assumptions": decoder_result["assumptions"],
                            "circuit_rounds": sample["rounds"],
                            "circuit_generation_seconds": sample["circuit_generation_seconds"],
                            "decoder_construction_seconds": decoder_result["construction_seconds"],
                            # Model preparation is reported apart from inference,
                            # so a decoder that precomputes is not charged for it
                            # as though it were decoding time.
                            "decoder_preparation_seconds": decoder_result["preparation_seconds"],
                            "decode_runtime_seconds": decoder_result["decode_seconds"],
                            "decoder_latency_unit": "milliseconds_total_batch",
                            "decoder_latency_ms_per_shot": decoder_result["decoder_latency_ms_per_shot"],
                            "confidence_interval_lower": summary["confidence_interval_lower"],
                            "confidence_interval_upper": summary["confidence_interval_upper"],
                            "confidence_level": summary["confidence_level"],
                            "interval_method": summary["interval_method"],
                            "is_upper_bound_only": summary["is_upper_bound_only"],
                            **(
                                {"interpretation": summary["interpretation"]}
                                if "interpretation" in summary
                                else {}
                            ),
                            "comparability_key_fields": list(COMPARABILITY_FIELDS),
                            "comparability_key": list(
                                comparability_key(
                                    {
                                        "benchmark_suite": manifest["benchmark"]["suite"],
                                        "benchmark_suite_version": manifest["benchmark"]["version"],
                                        "code_family": qec["code"]["family"],
                                        "code_distance": int(distance),
                                        "rounds": sample["rounds"],
                                        "physical_error_rate": float(physical_error_rate),
                                        "noise_model": qec["noise"]["model"],
                                        "stopping_rule": f"fixed_shots={shots}",
                                        "decoder_version": decoder_result["decoder_version"],
                                    }
                                )
                            ),
                            "seed_derivation": "sha256(global_seed,benchmark_version,code_distance,physical_error_rate)",
                        },
                    }
                )

    return _finish_result(manifest, metric_points, (time.perf_counter_ns() - start) / 1_000_000_000)


def _sample_surface_code_memory(
    *,
    benchmark_version: str,
    distance: int,
    physical_error_rate: float,
    rounds: int,
    shots: int,
    seed: int,
    decoder_configs: list[dict[str, Any]],
    code_family: str,
) -> dict[str, Any]:
    try:
        import numpy as np
        import stim
    except ImportError as exc:
        raise RuntimeError(QEC_DEPENDENCY_MESSAGE) from exc

    coordinate_seed = _derive_coordinate_seed(seed, benchmark_version, distance, physical_error_rate)
    generator = _stim_generator_for(code_family)

    circuit_start = time.perf_counter_ns()
    circuit = stim.Circuit.generated(
        generator,
        distance=distance,
        rounds=rounds,
        after_clifford_depolarization=physical_error_rate,
    )
    sampler = circuit.compile_detector_sampler(seed=coordinate_seed)
    circuit_generation_seconds = (time.perf_counter_ns() - circuit_start) / 1_000_000_000

    sampling_start = time.perf_counter_ns()
    detector_samples, observable_samples = sampler.sample(shots=shots, separate_observables=True)
    sampling_runtime_seconds = (time.perf_counter_ns() - sampling_start) / 1_000_000_000

    # Every decoder decodes these identical samples. Re-sampling per decoder
    # would make the comparison a comparison of luck as much as of decoders.
    decoder_results: list[dict[str, Any]] = []
    for config in decoder_configs:
        decoder = resolve_decoder(config["name"], config.get("options"))
        outcome = decoder.decode(circuit, detector_samples)
        predictions = outcome.predictions
        failures = int(np.count_nonzero(np.any(predictions != observable_samples, axis=1)))
        decoder_latency_ms = outcome.decode_seconds * 1000
        decoder_results.append(
            {
                "decoder": decoder.name,
                "decoder_version": decoder.version,
                "logical_failures": failures,
                "construction_seconds": outcome.construction_seconds,
                "preparation_seconds": outcome.preparation_seconds,
                "decode_seconds": outcome.decode_seconds,
                "decoder_latency_ms": decoder_latency_ms,
                "decoder_latency_ms_per_shot": decoder_latency_ms / shots,
                "assumptions": outcome.assumptions,
                "total_runtime_seconds": circuit_generation_seconds
                + sampling_runtime_seconds
                + outcome.construction_seconds
                + outcome.preparation_seconds
                + outcome.decode_seconds,
            }
        )

    return {
        "coordinate_seed": coordinate_seed,
        "rounds": rounds,
        "generator": generator,
        "circuit_generation_seconds": circuit_generation_seconds,
        "sampling_runtime_seconds": sampling_runtime_seconds,
        "decoders": decoder_results,
    }


#: Code family to Stim circuit generator. An unknown family is rejected rather
#: than defaulted, so a manifest cannot ask for one code and silently measure
#: another.
_STIM_GENERATORS: dict[str, str] = {
    "rotated-surface-code": "surface_code:rotated_memory_x",
    "rotated-surface-code-memory-x": "surface_code:rotated_memory_x",
    "rotated-surface-code-memory-z": "surface_code:rotated_memory_z",
    "unrotated-surface-code": "surface_code:unrotated_memory_x",
    "unrotated-surface-code-memory-x": "surface_code:unrotated_memory_x",
    "repetition-code": "repetition_code:memory",
    "repetition-code-memory": "repetition_code:memory",
    "color-code": "color_code:memory_xyz",
    "color-code-memory-xyz": "color_code:memory_xyz",
}


def _stim_generator_for(code_family: str) -> str:
    generator = _STIM_GENERATORS.get(code_family.lower())
    if generator is None:
        known = ", ".join(sorted(_STIM_GENERATORS))
        raise KetQatValidationError(
            f"Unknown QEC code family {code_family!r}. Known families: {known}."
        )
    return generator


def _resolve_rounds(rounds: int | str, distance: int) -> int:
    if rounds == "distance":
        return distance
    resolved = int(rounds)
    if resolved <= 0:
        raise KetQatValidationError("QEC rounds must be a positive integer or 'distance'.")
    return resolved


def _derive_coordinate_seed(global_seed: int, benchmark_version: str, distance: int, physical_error_rate: float) -> int:
    payload = f"{global_seed}|{benchmark_version}|{distance}|{physical_error_rate:.17g}"
    return int.from_bytes(hashlib.sha256(payload.encode("utf-8")).digest()[:8], "big") % (2**32)


def _run_algorithm(manifest: dict[str, Any]) -> dict[str, Any]:
    algorithm = manifest["algorithm"]
    if algorithm["family"] != "grover-search":
        raise ValueError("Only the grover-search algorithm family is supported by the MVP runner.")

    shots = int(manifest["sampling"]["shots"])
    seed = int(manifest["sampling"]["seed"])
    rng = random.Random(seed)
    metric_points: list[dict[str, Any]] = []
    start = time.perf_counter()

    for qubit_count in algorithm["problem"]["qubit_counts"]:
        n = int(qubit_count)
        if n < 1:
            raise ValueError("Qubit counts must be positive.")
        marked_state = "1" * n if algorithm["problem"].get("marked_state") == "all-ones" else str(algorithm["problem"].get("marked_state", "1" * n))
        iterations = max(1, round((math.pi / 4) * math.sqrt(2**n)))
        theta = math.asin(1 / math.sqrt(2**n))
        success_probability = math.sin((2 * iterations + 1) * theta) ** 2
        successes = sum(1 for _ in range(shots) if rng.random() < success_probability)
        metric_points.append(
            {
                "metric": "success_probability",
                "qubit_count": n,
                "success_probability": successes / shots,
                "circuit_depth": 2 * iterations + 1,
                "gate_count": n * (2 * iterations + 1),
                "two_qubit_gate_count": max(0, (n - 1) * iterations),
                "simulation_runtime_seconds": 0.0,
                "runtime_seconds": 0.0,
                "shots": shots,
                "seed": seed,
                "metadata": {
                    "runner": "ketqat-runner",
                    "marked_state": marked_state,
                    "grover_iterations": iterations,
                },
            }
        )

    return _finish_result(manifest, metric_points, time.perf_counter() - start)


def _finish_result(manifest: dict[str, Any], metric_points: list[dict[str, Any]], runtime: float) -> dict[str, Any]:
    configured_environment = manifest.get("environment") or {}
    captured_environment = capture_environment(Path.cwd())
    environment = {**captured_environment, **configured_environment}
    environment["packages"] = {
        **captured_environment.get("packages", {}),
        **configured_environment.get("packages", {}),
    }
    environment["hardware"] = {
        **captured_environment.get("hardware", {}),
        **configured_environment.get("hardware", {}),
    }

    result: dict[str, Any] = {
        "name": manifest["experiment"]["name"],
        "domain": manifest["domain"],
        "status": "COMPLETED",
        "benchmark_suite": manifest["benchmark"]["suite"],
        "benchmark_suite_version": manifest["benchmark"]["version"],
        "schema_version": manifest["schema_version"],
        "sdk_version": SDK_VERSION,
        "configuration": manifest,
        "environment": environment,
        "summary_metrics": _summarize(metric_points),
        "metric_points": metric_points,
        "is_demo": False,
    }
    if manifest.get("source", {}).get("commit_sha"):
        result["commit_sha"] = manifest["source"]["commit_sha"]
    if manifest.get("source", {}).get("repository_url"):
        result["source_repository_url"] = manifest["source"]["repository_url"]
    result["summary_metrics"]["runtime_seconds"] = runtime
    # Stamp which rules produced the hash before computing it. The marker is
    # itself excluded from hashing, so recording it does not change the value --
    # and without it a reader cannot tell whether a hash predates the ketqat-sdk#89
    # fix, which is the whole point of versioning rather than rewriting.
    result[HASH_VERSION_KEY] = CURRENT_HASH_VERSION
    result["reproducibility_hash"] = calculate_reproducibility_hash(result)
    result["slug"] = _slugify(f"{result['name']}-{result['reproducibility_hash'][:8]}")
    validate_result(result)
    return result


def _summarize(metric_points: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for point in metric_points:
        metric = point["metric"]
        if metric in point:
            summary[metric] = point[metric]
    return summary


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "ketqat-run"
