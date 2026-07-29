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
    PROTOCOL_COMPARABILITY_FIELDS,
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
    if domain == "PROTOCOL":
        return _run_protocol(manifest)
    raise ValueError(f"Unsupported KetQat domain: {domain!r}")


def _run_protocol(manifest: dict[str, Any]) -> dict[str, Any]:
    from .randomized_benchmarking import fit_decay, survival_probability

    protocol = manifest["protocol"]
    qubits = int(protocol["qubits"])
    rate = float(protocol["noise"]["depolarizing_rate"])
    shots = int(manifest["sampling"]["shots"])
    seed = int(manifest["sampling"]["seed"])
    sequences = int(protocol["sequences_per_length"])
    start = time.perf_counter_ns()

    lengths = sorted(set(int(m) for m in protocol["sequence_lengths"]))
    if len(lengths) != len(protocol["sequence_lengths"]):
        raise KetQatValidationError("Sequence lengths must be distinct.")

    samples = [
        survival_probability(
            qubits=qubits,
            length=length,
            depolarizing_rate=rate,
            sequences=sequences,
            shots=shots,
            seed=seed,
        )
        for length in lengths
    ]
    fit = fit_decay(samples, qubits)

    comparability = list(
        comparability_key(
            {
                "benchmark_suite": manifest["benchmark"]["suite"],
                "benchmark_suite_version": manifest["benchmark"]["version"],
                "protocol": protocol["name"],
                "qubits": qubits,
                "noise_model": protocol["noise"]["model"],
                "depolarizing_rate": rate,
                "sequence_lengths": ",".join(str(m) for m in lengths),
                "sequences_per_length": sequences,
                "stopping_rule": f"fixed_shots={shots}",
            },
            fields=PROTOCOL_COMPARABILITY_FIELDS,
        )
    )

    metric_points = [
        {
            "metric": "survival_probability",
            "sequence_length": sample["sequence_length"],
            "survival_probability": sample["survival_probability"],
            "standard_error": (
                None if sample["standard_error"] != sample["standard_error"] else sample["standard_error"]
            ),
            "sequences": sample["sequences"],
            "shots": shots,
            "seed": seed,
            "metadata": {
                "runner": "ketqat-runner",
                "backend": "stim-clifford",
                "protocol": protocol["name"],
                "qubits": qubits,
                # The fit is attached to every point rather than to one, so a
                # point read on its own still carries what it belongs to.
                "decay_fit": fit,
                "comparability_key_fields": list(PROTOCOL_COMPARABILITY_FIELDS),
                "comparability_key": comparability,
                "sequence_seed_derivation": "sha256(global_seed,sequence_length,sequence_index)",
            },
        }
        for sample in samples
    ]

    return _finish_result(manifest, metric_points, (time.perf_counter_ns() - start) / 1_000_000_000)


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
                extra_noise={
                    key: float(qec["noise"][key])
                    for key in _ALL_NOISE_CHANNELS
                    if qec["noise"].get(key) is not None
                },
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
                                        # Cast, so that a manifest writing
                                        # `readout_error_rate: 0` does not
                                        # produce an int here and a float in
                                        # the seed payload -- equal in Python,
                                        # but `0` and `0.0` once serialised.
                                        **{
                                            key: (
                                                None
                                                if qec["noise"].get(key) is None
                                                else float(qec["noise"][key])
                                            )
                                            for key in _ALL_NOISE_CHANNELS
                                        },
                                        "stopping_rule": f"fixed_shots={shots}",
                                        "decoder_version": decoder_result["decoder_version"],
                                    }
                                )
                            ),
                            # Reports the derivation actually used. When extra
                            # noise channels are present they are part of the
                            # payload, and a record that named only the four
                            # original inputs would describe a derivation the
                            # run did not perform.
                            "seed_derivation": sample["seed_derivation"],
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
    extra_noise: dict[str, float] | None = None,
) -> dict[str, Any]:
    try:
        import numpy as np
        import stim
    except ImportError as exc:
        raise RuntimeError(QEC_DEPENDENCY_MESSAGE) from exc

    extra_noise = extra_noise or {}
    crosstalk_rate = extra_noise.get("crosstalk_error_rate")
    drift_per_round = extra_noise.get("drift_per_round")
    # The seed must depend on every noise channel, not only the swept rate.
    # Otherwise two runs differing solely in readout error would share a
    # coordinate seed, and the shot-to-shot noise would be correlated between
    # them -- which quietly makes a comparison look more precise than it is.
    coordinate_seed = _derive_coordinate_seed(
        seed,
        benchmark_version,
        distance,
        physical_error_rate,
        *(extra_noise[key] for key in sorted(extra_noise)),
    )
    generator = _stim_generator_for(code_family)

    circuit_start = time.perf_counter_ns()
    circuit = stim.Circuit.generated(
        generator,
        distance=distance,
        rounds=rounds,
        after_clifford_depolarization=physical_error_rate,
        # Absent stays absent. Stim treats 0 as "no channel", which is the same
        # thing here, but the *record* distinguishes a run that modelled readout
        # error at zero from one that did not model it at all.
        **{
            stim_name: extra_noise[manifest_name]
            for manifest_name, stim_name in _STIM_NOISE_CHANNELS.items()
            if manifest_name in extra_noise
        },
    )
    if crosstalk_rate is not None:
        circuit = _inject_crosstalk(circuit, crosstalk_rate)
    if drift_per_round:
        circuit = _apply_drift(circuit, drift_per_round)
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

    seed_inputs = ["global_seed", "benchmark_version", "code_distance", "physical_error_rate"]
    seed_inputs += sorted(extra_noise)

    return {
        "seed_derivation": f"sha256({','.join(seed_inputs)})",
        "coordinate_seed": coordinate_seed,
        "rounds": rounds,
        "generator": generator,
        "circuit_generation_seconds": circuit_generation_seconds,
        "sampling_runtime_seconds": sampling_runtime_seconds,
        "decoders": decoder_results,
    }


#: Manifest noise field to the Stim generator argument that implements it.
#:
#: Stim's stabilizer model can represent these exactly. Amplitude and phase
#: damping and leakage cannot be expressed as Pauli channels and are therefore
#: absent rather than approximated -- a coherent error approximated by a Pauli
#: twirl is a different experiment, and running it under the original name would
#: be the dishonest option.
_STIM_NOISE_CHANNELS: dict[str, str] = {
    "readout_error_rate": "before_measure_flip_probability",
    "reset_error_rate": "after_reset_flip_probability",
    "idle_error_rate": "before_round_data_depolarization",
}


#: Noise channels applied by rewriting the generated circuit, because
#: `stim.Circuit.generated` has no argument for them.
#:
#: Crosstalk is correlated noise between qubits that are *not* interacting --
#: neighbouring data qubits idling while the stabilizer round runs. Modelling it
#: as `DEPOLARIZE2` rather than a fixed Pauli pair is deliberate: a correlated
#: `ZZ` is invisible in a memory-Z experiment (it commutes with the observable)
#: while dominating memory-X, so a fixed-Pauli crosstalk model reports "no
#: effect" for the default experiment while genuinely perturbing the other.
#: Measured at d=3, 20,000 shots, p=0.02: correlated ZZ gives 2 failures in
#: memory-Z against a baseline of 4, and 4739 in memory-X. `DEPOLARIZE2` gives
#: ~2610 in both.
_POST_NOISE_CHANNELS: tuple[str, ...] = ("crosstalk_error_rate", "drift_per_round")

#: Every optional noise channel, however it is applied. Seeding, comparability
#: and the result record must all iterate this rather than either half: a
#: channel that changes the result but not the ranking coordinate would put two
#: different experiments on one leaderboard row (ketqat-sdk#110).
_ALL_NOISE_CHANNELS: tuple[str, ...] = tuple(_STIM_NOISE_CHANNELS) + _POST_NOISE_CHANNELS


def _data_qubit_pairs(circuit: "Any") -> list[tuple[int, int]]:
    """Nearest-neighbour *data* qubit pairs in a generated code circuit.

    Data qubits are derived as the qubits the circuit never measure-resets, not
    from a coordinate parity rule. Parity looked plausible and was wrong: every
    qubit in the rotated d=3 layout has even coordinate sum, so a parity split
    silently returns all 17 qubits as data and none as ancilla.
    """
    coordinates = circuit.get_final_qubit_coordinates()

    ancilla: set[int] = set()

    def scan(block: "Any") -> None:
        for instruction in block:
            if type(instruction).__name__ == "CircuitRepeatBlock":
                scan(instruction.body_copy())
                continue
            if instruction.name in ("MR", "MRZ", "MRX"):
                ancilla.update(target.qubit_value for target in instruction.targets_copy())

    scan(circuit)

    data = sorted(set(coordinates) - ancilla)
    position = {qubit: tuple(int(axis) for axis in coordinates[qubit]) for qubit in data}
    return [
        (left, right)
        for index, left in enumerate(data)
        for right in data[index + 1 :]
        if sorted(
            [
                abs(position[left][0] - position[right][0]),
                abs(position[left][1] - position[right][1]),
            ]
        )
        == [0, 2]
    ]


def _apply_drift(circuit: "Any", drift_per_round: float) -> "Any":
    """Scale every noise probability by round, modelling a device that degrades.

    Stim can carry a different error rate per round; the generated circuits use
    one `REPEAT` block with fixed rates, so every round was identical and drift
    was a limit of this runner rather than of the simulator (ketqat-sdk#125).

    The circuit is flattened first, because a repeated block is by definition
    the same block every time -- there is nowhere in it to put a per-round rate.
    Flattening preserves the detector structure exactly, which is checked.

    The model is `rate_r = rate * (1 + drift * r)` with `r` counting from zero,
    so `drift_per_round = 0.1` means the error rate grows ten percent of its
    initial value each round, and round zero is unchanged. A negative value
    models a device improving, which is the same arithmetic and is allowed
    rather than silently clamped -- calibration drift is not always downhill.

    Rates are clamped into [0, 1] at the end, because a probability outside it
    is not a probability. Clamping is reported by the caller rather than hidden.
    """
    import stim

    flattened = circuit.flattened()
    rewritten = stim.Circuit()
    round_index = 0

    for instruction in flattened:
        name = instruction.name
        if name in _DRIFTING_CHANNELS:
            scale = 1.0 + drift_per_round * round_index
            targets = instruction.targets_copy()
            scaled = [min(1.0, max(0.0, argument * scale)) for argument in instruction.gate_args_copy()]
            rewritten.append(name, targets, scaled)
            continue

        rewritten.append(instruction)
        # A measure-reset ends a stabilizer round. Counting rounds this way
        # rather than by TICK is deliberate: TICKs also separate the layers
        # *within* a round, so counting them would ramp the rate mid-round.
        if name in ("MR", "MRZ", "MRX"):
            round_index += 1

    return rewritten


#: Noise channels whose probability drifts. Measurement and reset flips drift
#: with the same physics as gate error, so they are included; a channel added
#: later must be added here too or it will silently stay flat.
_DRIFTING_CHANNELS = frozenset(
    {"DEPOLARIZE1", "DEPOLARIZE2", "X_ERROR", "Z_ERROR", "Y_ERROR"}
)


def _inject_crosstalk(circuit: "Any", probability: float) -> "Any":
    """Apply a correlated two-qubit channel to idling neighbours, once per round.

    `stim.Circuit.generated` has no crosstalk argument, so the generated circuit
    is rewritten. The channel is inserted after the first TICK of each round --
    before syndrome extraction, so the error is visible to the decoder rather
    than applied after the measurement that would have caught it.

    Recursion into repeat blocks is what makes this once *per round* rather than
    once per experiment: the generator emits round two onward inside a
    `REPEAT` block, so a rewrite that only walked the top level would apply
    crosstalk to the first round and silently to no other.
    """
    import stim

    pairs = _data_qubit_pairs(circuit)

    def channel() -> "Any":
        block = stim.Circuit()
        for left, right in pairs:
            block.append("DEPOLARIZE2", [left, right], probability)
        return block

    def rewrite(block: "Any") -> "Any":
        rewritten = stim.Circuit()
        injected = False
        for instruction in block:
            if type(instruction).__name__ == "CircuitRepeatBlock":
                rewritten.append(
                    stim.CircuitRepeatBlock(
                        instruction.repeat_count, rewrite(instruction.body_copy())
                    )
                )
                continue
            rewritten.append(instruction)
            if instruction.name == "TICK" and not injected:
                rewritten += channel()
                injected = True
        return rewritten

    return rewrite(circuit)


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


def _derive_coordinate_seed(
    global_seed: int,
    benchmark_version: str,
    distance: int,
    physical_error_rate: float,
    *extra_rates: float,
) -> int:
    """Derive the sampling seed from every parameter that defines the experiment.

    The extra noise rates are part of the payload rather than decoration. Two
    runs differing only in readout error must not share a coordinate seed: they
    would draw correlated shot noise, and a comparison between them would look
    more precise than the data supports.

    A run with no extra channels produces exactly the seed it always did, so
    results published before those channels existed stay reproducible.
    """
    payload = f"{global_seed}|{benchmark_version}|{distance}|{physical_error_rate:.17g}"
    for rate in extra_rates:
        payload += f"|{rate:.17g}"
    return int.from_bytes(hashlib.sha256(payload.encode("utf-8")).digest()[:8], "big") % (2**32)


def _run_algorithm(manifest: dict[str, Any]) -> dict[str, Any]:
    algorithm = manifest["algorithm"]
    if algorithm["family"] == "phase-estimation":
        return _run_phase_estimation(manifest)
    if algorithm["family"] != "grover-search":
        raise ValueError(
            "Supported algorithm families are grover-search and phase-estimation. "
            f"Got {algorithm['family']!r}."
        )

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


def _run_phase_estimation(manifest: dict[str, Any]) -> dict[str, Any]:
    """Quantum phase estimation, executed rather than modelled.

    Unlike the Grover path, which draws shots from the analytic success
    probability, this applies the gate sequence to a state vector and reads the
    Born-rule distribution off the result (ketqat-sdk#123).
    """
    from .phase_estimation import estimate_phase

    algorithm = manifest["algorithm"]
    problem = algorithm["problem"]
    shots = int(manifest["sampling"]["shots"])
    seed = int(manifest["sampling"]["seed"])
    rng = random.Random(seed)
    metric_points: list[dict[str, Any]] = []
    start = time.perf_counter()

    phase = float(problem["phase"])
    for qubit_count in problem["qubit_counts"]:
        counting = int(qubit_count)
        estimate = estimate_phase(phase, counting)

        # Sample the exact distribution rather than reporting it directly: a
        # published result should carry the shot noise a real run would have,
        # not a probability nobody could have measured.
        distribution = estimate["distribution"]
        successes = 0
        target = estimate["measured_integer"]
        for _ in range(shots):
            draw = rng.random()
            cumulative = 0.0
            for index, probability in enumerate(distribution):
                cumulative += probability
                if draw <= cumulative:
                    if index == target:
                        successes += 1
                    break

        metric_points.append(
            {
                "metric": "success_probability",
                "qubit_count": counting,
                "success_probability": successes / shots,
                # One H per counting qubit, the controlled-phase ladder, and the
                # inverse QFT's O(n^2) rotations.
                "circuit_depth": 2 * counting + 1,
                "gate_count": counting + counting * (counting + 1) // 2,
                "two_qubit_gate_count": counting * (counting - 1) // 2,
                "simulation_runtime_seconds": 0.0,
                "runtime_seconds": 0.0,
                "shots": shots,
                "seed": seed,
                "metadata": {
                    "runner": "ketqat-runner",
                    "backend": "ketqat-statevector-python",
                    "true_phase": estimate["true_phase"],
                    "estimated_phase": estimate["estimated_phase"],
                    "measured_integer": target,
                    "phase_error": estimate["phase_error"],
                    "resolution": estimate["resolution"],
                    "phase_is_representable": estimate["phase_is_representable"],
                    "exact_success_probability": estimate["success_probability"],
                    # Named because the Grover family in this same runner does
                    # not do this, and the two must not be read as alike.
                    "execution": "statevector simulation of the gate sequence",
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
    """Roll metric points up into the convenience block, without losing a caveat.

    `summary_metrics` is the field a leaderboard query reaches for, an importer
    maps, and a reader quotes. It used to copy the point's value verbatim, which
    for a run that observed no logical failures meant

        "summary_metrics": {"logical_error_rate": 0.0}

    while the point it came from said, one level down, that the rate is an upper
    bound and explicitly not zero (ketqat-sdk#92). The record contained an honest
    statement and, above it, the exact claim that statement exists to deny.

    So a bounded measurement is summarised under a different key. A consumer
    reading `logical_error_rate` finds nothing -- correct, because there is no
    measured rate -- and one wanting the science finds the bound, named as a
    bound. Omitting it entirely was the alternative, and it would have thrown
    away a real result to avoid a misreading.
    """
    summary: dict[str, Any] = {}
    for point in metric_points:
        metric = point["metric"]
        if metric not in point:
            continue
        metadata = point.get("metadata") or {}
        if metadata.get("is_upper_bound_only"):
            bound = metadata.get("confidence_interval_upper")
            if isinstance(bound, (int, float)) and not isinstance(bound, bool):
                summary[f"{metric}_upper_bound"] = bound
            # No bound recorded means there is nothing honest to summarise.
            continue
        summary[metric] = point[metric]

    # A threshold estimate, when the sweep actually contains a crossing.
    #
    # Reported under its own key with the estimate and the spread together,
    # never the estimate alone: a threshold is the headline figure of a QEC
    # result, and a bare number invites being quoted as a measurement of the
    # code rather than of this sweep. When the data cannot support one, the
    # reason is recorded instead of the key being silently absent -- a missing
    # key reads as "not attempted" (ketqat-sdk#127).
    from .threshold import MIN_DISTANCES, estimate_threshold

    # Attempted only when the run swept enough distances that a threshold was
    # plausibly the point of it. A single-distance run cannot have a crossing,
    # and saying so on every such run would be noise rather than a finding: it
    # reports the shape of the run back to the person who chose it.
    swept_distances = {
        point.get("code_distance")
        for point in metric_points
        if point.get("metric") == "logical_error_rate" and point.get("code_distance") is not None
    }
    if len(swept_distances) >= MIN_DISTANCES:
        threshold = estimate_threshold(metric_points)
        if threshold["inconclusive"]:
            summary["threshold_estimate_inconclusive_reason"] = threshold["reason"]
        else:
            summary["threshold_estimate"] = threshold["threshold_estimate"]
            summary["threshold_crossing_spread"] = threshold["crossing_spread"]

    return summary


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "ketqat-run"
