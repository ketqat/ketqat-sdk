"""Finite-shot heavy-output sampling of quantum volume model circuits.

`ketqat_runner.quantum_volume` computes each circuit's exact (infinite-shot) heavy-output
probability from its statevector. The protocol as run on a device measures a
finite number of shots per circuit and counts heavy outcomes, so this module
samples outcomes from the noisy distribution and records both: the exact value
for reference and the sampled heavy count the certification is made from.
"""
from __future__ import annotations

import hashlib
from typing import Any

import numpy as np

from ....quantum_volume import heavy_output_probability, quantum_volume_circuit_probabilities


def circuit_seed(seed: int, width: int, index: int) -> int:
    """One seed per (width, circuit index): adding a width never changes another width's circuits."""
    payload = f"{seed}|{width}|{index}".encode("utf-8")
    return int.from_bytes(hashlib.sha256(payload).digest()[:8], "big") % (2**32)


def shot_seed(seed: int, width: int, index: int) -> int:
    payload = f"shots|{seed}|{width}|{index}".encode("utf-8")
    return int.from_bytes(hashlib.sha256(payload).digest()[:8], "big") % (2**32)


def sample_width(*, width: int, circuits: int, shots: int, depolarizing_rate: float, seed: int) -> list[dict[str, Any]]:
    """Per circuit: ideal and exact noisy heavy-output probability, and the sampled heavy count."""
    if not 0 <= depolarizing_rate <= 1:
        raise ValueError("depolarizing_rate must lie in [0, 1]")
    uniform = 1.0 / (1 << width)
    out: list[dict[str, Any]] = []
    for index in range(circuits):
        cseed = circuit_seed(seed, width, index)
        ideal = quantum_volume_circuit_probabilities(width, cseed)
        # Heaviness is defined by the ideal distribution (strictly above its median), as in quantum_volume.py.
        heavy = ideal > float(np.median(ideal))
        noisy = (1 - depolarizing_rate) * ideal + depolarizing_rate * uniform if depolarizing_rate > 0 else ideal
        noisy = noisy / noisy.sum()
        counts = np.random.default_rng(shot_seed(seed, width, index)).multinomial(shots, noisy)
        heavy_count = int(counts[heavy].sum())
        out.append({
            "index": index,
            "circuit_seed": cseed,
            "ideal_heavy_output_probability": heavy_output_probability(ideal),
            "exact_noisy_heavy_output_probability": float(noisy[heavy].sum()),
            "heavy_count": heavy_count,
            "heavy_fraction": heavy_count / shots,
        })
    return out
