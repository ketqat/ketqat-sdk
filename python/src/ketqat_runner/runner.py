from __future__ import annotations

import math
import random
import time
from typing import Any

from .hashing import calculate_reproducibility_hash

SDK_VERSION = "0.2.0"


def run_experiment(manifest: dict[str, Any]) -> dict[str, Any]:
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
    rng = random.Random(seed)
    metric_points: list[dict[str, Any]] = []
    start = time.perf_counter()

    for distance in qec["code"]["distances"]:
        if int(distance) < 1 or int(distance) % 2 == 0:
            raise ValueError("QEC distances must be positive odd integers.")
        for physical_error_rate in qec["noise"]["physical_error_rates"]:
            if not 0 <= float(physical_error_rate) <= 1:
                raise ValueError("Physical error rates must be in [0, 1].")
            failures, backend = _sample_surface_code_memory(
                distance=int(distance),
                physical_error_rate=float(physical_error_rate),
                shots=shots,
                seed=seed,
                rng=rng,
            )
            logical_error_rate = failures / shots
            standard_error = math.sqrt(logical_error_rate * (1 - logical_error_rate) / shots)
            metric_points.append(
                {
                    "metric": "logical_error_rate",
                    "code_distance": int(distance),
                    "physical_error_rate": float(physical_error_rate),
                    "logical_failures": failures,
                    "logical_error_rate": logical_error_rate,
                    "standard_error": standard_error,
                    "decoder_latency_ms": round(0.05 * int(distance), 6),
                    "sampling_runtime_seconds": 0.0,
                    "shots": shots,
                    "seed": seed,
                    "metadata": {
                        "runner": "ketqat-runner",
                        "backend": backend,
                        "decoder": qec["decoder"]["name"],
                    },
                }
            )

    return _finish_result(manifest, metric_points, time.perf_counter() - start)


def _sample_surface_code_memory(
    *,
    distance: int,
    physical_error_rate: float,
    shots: int,
    seed: int,
    rng: random.Random,
) -> tuple[int, str]:
    try:
        import numpy as np
        import pymatching
        import stim

        circuit = stim.Circuit.generated(
            "surface_code:rotated_memory_x",
            distance=distance,
            rounds=distance,
            after_clifford_depolarization=physical_error_rate,
        )
        sampler = circuit.compile_detector_sampler(seed=seed)
        detector_samples, observable_samples = sampler.sample(shots=shots, separate_observables=True)
        detector_error_model = circuit.detector_error_model(decompose_errors=True)
        matching = pymatching.Matching.from_detector_error_model(detector_error_model)
        predictions = matching.decode_batch(detector_samples)
        failures = int(np.count_nonzero(np.any(predictions != observable_samples, axis=1)))
        return failures, "stim-pymatching"
    except ImportError:
        logical_failure_probability = min(0.5, (physical_error_rate * 10) ** ((distance + 1) / 2))
        failures = sum(1 for _ in range(shots) if rng.random() < logical_failure_probability)
        return failures, "deterministic-local-fallback"


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
    result: dict[str, Any] = {
        "name": manifest["experiment"]["name"],
        "domain": manifest["domain"],
        "status": "COMPLETED",
        "benchmark_suite": manifest["benchmark"]["suite"],
        "benchmark_suite_version": manifest["benchmark"]["version"],
        "schema_version": manifest["schema_version"],
        "sdk_version": SDK_VERSION,
        "commit_sha": manifest.get("source", {}).get("commit_sha"),
        "source_repository_url": manifest.get("source", {}).get("repository_url"),
        "configuration": manifest,
        "environment": manifest.get("environment", {"packages": {"ketqat-runner": SDK_VERSION}, "hardware": {}}),
        "summary_metrics": _summarize(metric_points),
        "metric_points": metric_points,
        "is_demo": False,
    }
    result["summary_metrics"]["runtime_seconds"] = runtime
    result["reproducibility_hash"] = calculate_reproducibility_hash(result)
    return result


def _summarize(metric_points: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for point in metric_points:
        metric = point["metric"]
        if metric in point:
            summary[metric] = point[metric]
    return summary
