"""Per-sequence survival collection for standard, interleaved, simultaneous and isolated RB.

The sequences are those of `ketqat_runner.randomized_benchmarking`
(`build_sequence`, `build_simultaneous_sequence`, `build_isolated_sequence` and
`clifford_group`) with the same per-(length, index) seed derivation, so every
per-length mean here equals `randomized_benchmarking.survival_probability` for
the same seed. What those functions do not expose, and this module keeps, is
every individual sequence's survival: the bootstrap resamples sequences and
needs them.

This module has its own interleaved builder because it adds one thing
`randomized_benchmarking.build_interleaved_sequence` has not: a separate
depolarizing rate after the interleaved gate, so the gate under test can be
better or worse than the Cliffords around it. With equal rates it emits exactly
that builder's circuit (tested).
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import stim

from ....randomized_benchmarking import (
    INTERLEAVABLE_GATES,
    _derive_sequence_seed,
    build_isolated_sequence,
    build_sequence,
    build_simultaneous_sequence,
    clifford_group,
)

#: Two-qubit gates that may be interleaved when qubits == 2 (control 0, target 1).
TWO_QUBIT_GATES = {"cx": "CX"}


def interleavable_gates(qubits: int) -> dict[str, str]:
    names = dict(INTERLEAVABLE_GATES)
    if qubits == 2:
        names.update(TWO_QUBIT_GATES)
    return names


def sequence_seed(seed: int, length: int, index: int) -> int:
    """The derivation of `randomized_benchmarking`: sha256(global_seed, sequence_length, sequence_index)."""
    return _derive_sequence_seed(seed, length, index)


def build_interleaved_sequence(qubits: int, length: int, clifford_rate: float, seed: int, gate: str, gate_rate: float) -> stim.Circuit:
    """An RB sequence with `gate` after every random Clifford; noise at `gate_rate` after the gate.

    Same draws and layout as `randomized_benchmarking.build_interleaved_sequence`;
    only the rate after the interleaved gate differs. The inverse is computed from the composed tableau
    including the interleaved gates, so the sequence returns exactly to |0...0>
    without noise.
    """
    names = interleavable_gates(qubits)
    if gate not in names:
        raise ValueError(f"{gate!r} is not interleavable on {qubits} qubit(s); available: {', '.join(sorted(names))}")
    group = clifford_group(qubits)
    rng = np.random.default_rng(seed)
    circuit = stim.Circuit()
    composed = stim.Tableau(qubits)
    channel = "DEPOLARIZE1" if qubits == 1 else "DEPOLARIZE2"
    interleaved_circuit = stim.Circuit()
    interleaved_circuit.append(names[gate], [0, 1] if gate in TWO_QUBIT_GATES else list(range(qubits)))
    interleaved_tableau = stim.Tableau.from_circuit(interleaved_circuit)
    for index in rng.integers(0, len(group), size=length):
        element = group[int(index)]
        composed = composed.then(element)
        circuit += element.to_circuit(method="elimination")
        if clifford_rate > 0:
            circuit.append(channel, list(range(qubits)), clifford_rate)
        composed = composed.then(interleaved_tableau)
        circuit += interleaved_circuit
        if gate_rate > 0:
            circuit.append(channel, list(range(qubits)), gate_rate)
    circuit += (composed**-1).to_circuit(method="elimination")
    circuit.append("M", list(range(qubits)))
    return circuit


def _sample(circuit: stim.Circuit, seed: int, shots: int) -> np.ndarray:
    return circuit.compile_sampler(seed=seed).sample(shots=shots)


def point(length: int, per_sequence: list[float], shots: int) -> dict[str, Any]:
    """One sequence length: the mean over sequences and its standard error across sequences."""
    n = len(per_sequence)
    mean = float(np.mean(per_sequence))
    error = float(np.std(per_sequence, ddof=1) / math.sqrt(n)) if n > 1 else None
    return {"sequence_length": length, "survival_probability": mean, "standard_error": error, "sequences": n, "shots": shots,
            "per_sequence": [float(v) for v in per_sequence]}


def collect_standard(*, qubits: int, lengths: list[int], sequences: int, rate: float, shots: int, seed: int) -> list[dict[str, Any]]:
    points = []
    for length in lengths:
        per_sequence = []
        for index in range(sequences):
            s = sequence_seed(seed, length, index)
            samples = _sample(build_sequence(qubits, length, rate, s), s, shots)
            per_sequence.append(float(np.mean(~np.any(samples, axis=1))))
        points.append(point(length, per_sequence, shots))
    return points


def collect_interleaved(*, qubits: int, lengths: list[int], sequences: int, rate: float, shots: int, seed: int, gate: str,
                        gate_rate: float) -> list[dict[str, Any]]:
    points = []
    for length in lengths:
        per_sequence = []
        for index in range(sequences):
            s = sequence_seed(seed, length, index)
            samples = _sample(build_interleaved_sequence(qubits, length, rate, s, gate, gate_rate), s, shots)
            per_sequence.append(float(np.mean(~np.any(samples, axis=1))))
        points.append(point(length, per_sequence, shots))
    return points


def collect_simultaneous(*, lengths: list[int], sequences: int, rate: float, shots: int, seed: int, crosstalk_rate: float) -> list[list[dict[str, Any]]]:
    """Both qubits driven together; returns [points for qubit 0, points for qubit 1]."""
    per_qubit: list[list[dict[str, Any]]] = [[], []]
    for length in lengths:
        per_sequence: list[list[float]] = [[], []]
        for index in range(sequences):
            s = sequence_seed(seed, length, index)
            samples = _sample(build_simultaneous_sequence(length, rate, s, crosstalk_rate), s, shots)
            for qubit in (0, 1):
                per_sequence[qubit].append(float(np.mean(~samples[:, qubit])))
        for qubit in (0, 1):
            per_qubit[qubit].append(point(length, per_sequence[qubit], shots))
    return per_qubit


def collect_isolated(*, lengths: list[int], sequences: int, rate: float, shots: int, seed: int, qubit: int) -> list[dict[str, Any]]:
    """The same qubit's sequences with its neighbour idle (same draws as the simultaneous run)."""
    points = []
    for length in lengths:
        per_sequence = []
        for index in range(sequences):
            s = sequence_seed(seed, length, index)
            samples = _sample(build_isolated_sequence(length, rate, s, qubit), s, shots)
            per_sequence.append(float(np.mean(~samples[:, 0])))
        points.append(point(length, per_sequence, shots))
    return points
