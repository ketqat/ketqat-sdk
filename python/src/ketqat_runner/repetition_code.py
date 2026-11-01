"""The bit-flip repetition code under i.i.d. bit flips, decoded by majority vote.

The simplest quantum error-correcting code: n physical qubits hold one logical
qubit as |0_L> = |0...0>, |1_L> = |1...1>. Under independent bit flips of
probability p on each qubit, the parity checks Z_i Z_{i+1} locate the flips and
the minimum-weight correction is equivalent to a majority vote; the logical
qubit fails exactly when more than n/2 qubits flipped.

That exactness is why the code is in the catalog. The logical error rate has a
closed form,

    P_L(n, p) = sum_{k > n/2} C(n, k) p^k (1 - p)^(n - k),

so the Monte Carlo estimate produced here can be checked against an analytic
value instead of against another simulation. The product reports both, with a
Wilson interval around the estimate, and says whether the exact value lies
inside it.

The Monte Carlo samples each qubit's flip, measures the syndrome and runs the
decoder; it does not sample the number of flips directly, so the decoder is
exercised rather than bypassed. Shots are processed in fixed-size chunks so
memory stays bounded; the chunk size is a constant so that a seed reproduces
the same samples on any machine with the same NumPy version.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from .qec_statistics import logical_error_rate_summary

#: Random numbers drawn per chunk. Fixed, because changing it changes which
#: samples a seed produces.
CHUNK_BITS = 1 << 22
#: Largest n x shots the product will attempt (about 15 s on a 2024 laptop).
#: Refused above with the estimate.
MAX_SAMPLED_BITS = 1_000_000_000
#: Measured: 10^8 sampled bits in about 1.4 s, decoder included.
SECONDS_PER_SAMPLED_BIT = 1.5e-8


class RepetitionCodeError(ValueError):
    """A memory experiment that cannot be set up as specified."""


def validate_code(n: int, p: float) -> None:
    if n < 1 or n % 2 == 0:
        raise RepetitionCodeError(f"The repetition code needs an odd number of qubits so majority vote is defined; got n={n}.")
    if not 0 <= p <= 1:
        raise RepetitionCodeError(f"The bit-flip probability must lie in [0, 1]; got {p}.")


def exact_logical_error_rate(n: int, p: float) -> float:
    """sum_{k > n/2} C(n, k) p^k (1-p)^(n-k), evaluated directly."""
    validate_code(n, p)
    return float(sum(math.comb(n, k) * p**k * (1 - p) ** (n - k) for k in range(n // 2 + 1, n + 1)))


def decode_majority(flips: np.ndarray) -> np.ndarray:
    """Syndrome-based decoding of a (shots, n) array of bit flips.

    The syndrome s_i = e_i xor e_{i+1} determines the error up to the logical
    operator (every qubit flipped). Both candidates are reconstructed from the
    syndrome alone and the lighter one is chosen, which is majority vote. Returns
    a boolean per shot: True when the chosen correction differs from the actual
    error, i.e. the logical qubit was flipped.
    """
    n = flips.shape[1]
    if n == 1:
        return flips[:, 0].astype(bool)
    syndrome = flips[:, :-1] ^ flips[:, 1:]
    # Candidate with e_0 = 0: a running xor of the syndrome.
    candidate = np.zeros_like(flips)
    candidate[:, 1:] = np.cumsum(syndrome, axis=1) & 1
    weight = candidate.sum(axis=1)
    # The other candidate is the complement; pick the lighter one.
    choose_complement = weight > n // 2
    correction = candidate ^ choose_complement[:, None]
    residual = correction ^ flips
    # The residual has zero syndrome, so it is either nothing or the logical flip.
    return residual[:, 0].astype(bool)


def sample_logical_failures(n: int, p: float, shots: int, seed: int) -> dict[str, Any]:
    """Seeded Monte Carlo: sample flips, decode, count logical failures."""
    validate_code(n, p)
    if shots < 1:
        raise RepetitionCodeError(f"shots must be positive, got {shots}.")
    rng = np.random.default_rng(seed)
    per_chunk = max(1, CHUNK_BITS // n)
    failures = 0
    majority_failures = 0
    remaining = shots
    while remaining > 0:
        count = min(per_chunk, remaining)
        flips = (rng.random((count, n)) < p).astype(np.uint8)
        failures += int(np.count_nonzero(decode_majority(flips)))
        # Direct majority vote on the flips, as a cross-check of the decoder.
        majority_failures += int(np.count_nonzero(flips.sum(axis=1) > n // 2))
        remaining -= count
    if failures != majority_failures:
        raise RepetitionCodeError(
            f"The syndrome decoder reported {failures} failures but direct majority vote {majority_failures}."
        )
    return {"logical_failures": failures, "shots": shots}


def repetition_code_memory(n: int, p: float, shots: int, seed: int) -> dict[str, Any]:
    """Monte Carlo logical error rate with a Wilson interval, beside the exact value."""
    sampled = sample_logical_failures(n, p, shots, seed)
    summary = logical_error_rate_summary(sampled["logical_failures"], shots)
    exact = exact_logical_error_rate(n, p)
    lower, upper = summary["confidence_interval_lower"], summary["confidence_interval_upper"]
    result: dict[str, Any] = {
        "code": "bit-flip repetition code",
        "n": n,
        "distance": n,
        "physical_error_rate": p,
        "noise_model": "independent bit flip with probability p on each data qubit, one round, perfect syndrome measurement",
        "decoder": "majority vote (minimum-weight correction from the Z_i Z_{i+1} syndrome)",
        "shots": shots,
        "logical_failures": summary["logical_failures"],
        "logical_error_rate": summary["logical_error_rate"],
        "confidence_interval": {
            "lower": lower,
            "upper": upper,
            "level": summary["confidence_level"],
            "method": summary["interval_method"],
        },
        "is_upper_bound_only": bool(summary.get("is_upper_bound_only", False)),
        "exact_logical_error_rate": exact,
        "exact_formula": "sum_{k > n/2} C(n, k) p^k (1 - p)^(n - k)",
        "exact_within_interval": bool(lower <= exact <= upper),
        "below_pseudothreshold": bool(exact < p) if n > 1 else False,
    }
    if "interpretation" in summary:
        result["interpretation"] = summary["interpretation"]
    return result
