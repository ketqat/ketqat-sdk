"""Statistics and comparability rules for QEC benchmarking (RFC 0006).

Two failure modes this module exists to prevent:

1. **Reporting a logical error rate without an interval.** A point estimate
   cannot be compared with another point estimate. Every rate here carries a
   Wilson score interval, which stays inside [0, 1] and remains sensible at
   zero observed failures -- exactly where the normal approximation is worst
   and where QEC results most often live.

2. **Ranking runs that measured different things.** Two decoders benchmarked at
   different distances, rounds, error rates, noise models, or stopping rules are
   not competitors. :func:`comparability_key` makes that explicit, and
   :func:`runs_are_comparable` refuses the comparison rather than producing a
   misleading ordering.
"""
from __future__ import annotations

import math
from typing import Any

#: 97.5th percentile of the standard normal, for a two-sided 95% interval.
Z_95 = 1.959963984540054


def wilson_interval(failures: int, shots: int, z: float = Z_95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion.

    Chosen over the normal approximation because QEC benchmarks routinely
    observe zero or very few logical failures, where the normal interval is
    degenerate: it collapses to a point at zero failures, implying a certainty
    the data does not support.
    """
    if shots <= 0:
        raise ValueError("shots must be positive to form a confidence interval.")
    if failures < 0 or failures > shots:
        raise ValueError("failures must lie between 0 and shots.")

    proportion = failures / shots
    denominator = 1 + z * z / shots
    centre = (proportion + z * z / (2 * shots)) / denominator
    spread = (z / denominator) * math.sqrt(
        proportion * (1 - proportion) / shots + z * z / (4 * shots * shots)
    )
    # Clamp so the interval always brackets the point estimate. Without this,
    # floating-point error leaves the upper bound a hair below 1.0 at
    # failures == shots, which would make a downstream "rate lies inside its
    # interval" check fail for a perfectly ordinary result.
    lower = min(max(0.0, centre - spread), proportion)
    upper = max(min(1.0, centre + spread), proportion)
    return lower, upper


def logical_error_rate_summary(failures: int, shots: int, z: float = Z_95) -> dict[str, Any]:
    """Summarize a logical error rate honestly.

    Zero observed failures is reported as an **upper bound**, never as a rate of
    zero. A run that saw no failure has not shown the error rate is zero; it has
    bounded it above at the shot count used, and saying otherwise is the single
    most common way a QEC result becomes a false claim.
    """
    lower, upper = wilson_interval(failures, shots, z)
    rate = failures / shots
    summary: dict[str, Any] = {
        "logical_failures": failures,
        "shots": shots,
        "logical_error_rate": rate,
        "confidence_interval_lower": lower,
        "confidence_interval_upper": upper,
        "confidence_level": 0.95,
        "interval_method": "wilson_score",
        "standard_error": math.sqrt(rate * (1 - rate) / shots),
    }
    if failures == 0:
        summary["is_upper_bound_only"] = True
        summary["interpretation"] = (
            f"No logical failures were observed in {shots} shots. The logical error rate is "
            f"bounded above by {upper:.3e} at 95% confidence; it is not zero."
        )
    else:
        summary["is_upper_bound_only"] = False
    return summary


def suppression_factor(
    lower_distance_rate: float,
    higher_distance_rate: float,
) -> float | None:
    """Ratio of logical error rates between adjacent code distances.

    Returns ``None`` when the higher-distance rate is zero, because a
    suppression factor computed against an unobserved failure count is an
    artifact of the shot budget rather than a measurement.
    """
    if higher_distance_rate <= 0:
        return None
    return lower_distance_rate / higher_distance_rate


#: Fields that must match before two runs may appear in one ranking (RFC 0006).
COMPARABILITY_FIELDS = (
    "benchmark_suite",
    "benchmark_suite_version",
    "code_family",
    "code_distance",
    "rounds",
    "physical_error_rate",
    "noise_model",
    # Each noise channel is its own field, because `noise_model` carries only
    # the model *name*. Two runs at different readout error rates would
    # otherwise produce identical comparability keys and be ranked together --
    # a comparison between two different experiments, presented as one.
    #
    # A run that did not model a channel has None here, so runs predating these
    # fields still compare with each other and with new runs that also omit
    # them. Only runs that actually differ are separated.
    "readout_error_rate",
    "reset_error_rate",
    "idle_error_rate",
    "stopping_rule",
    "decoder_version",
)

#: Fields that additionally must match before *latency* may be compared.
#: Latency is a property of the machine as much as the decoder, so a faster
#: host is not a better decoder.
LATENCY_COMPARABILITY_FIELDS = (
    "cpu",
    "thread_count",
    "gpu",
)


def comparability_key(record: dict[str, Any]) -> tuple[Any, ...]:
    """The tuple two runs must share to be ranked together."""
    return tuple(record.get(field) for field in COMPARABILITY_FIELDS)


def runs_are_comparable(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """Whether two runs may share a ranking, and why not when they may not."""
    reasons: list[str] = []
    for field in COMPARABILITY_FIELDS:
        if left.get(field) != right.get(field):
            reasons.append(
                f"{field} differs ({left.get(field)!r} vs {right.get(field)!r}); "
                "these runs measured different experiments."
            )
    return {"comparable": not reasons, "reasons": reasons}


def latency_comparable(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """Whether decoder *latency* may be compared across two runs."""
    base = runs_are_comparable(left, right)
    reasons = list(base["reasons"])
    for field in LATENCY_COMPARABILITY_FIELDS:
        if left.get(field) != right.get(field):
            reasons.append(
                f"{field} differs ({left.get(field)!r} vs {right.get(field)!r}); latency is a "
                "property of the machine as much as the decoder, so this comparison would not "
                "measure decoder speed."
            )
    return {"comparable": not reasons, "reasons": reasons}


def latency_percentiles(samples_ms: list[float]) -> dict[str, float]:
    """p50/p95/p99 latency.

    Percentiles rather than a mean, because decoder latency distributions have
    tails that matter for real-time decoding and a mean hides them.
    """
    if not samples_ms:
        return {}
    ordered = sorted(samples_ms)

    def percentile(fraction: float) -> float:
        if len(ordered) == 1:
            return ordered[0]
        position = fraction * (len(ordered) - 1)
        lower_index = math.floor(position)
        upper_index = math.ceil(position)
        weight = position - lower_index
        return ordered[lower_index] * (1 - weight) + ordered[upper_index] * weight

    return {
        "p50_ms": percentile(0.50),
        "p95_ms": percentile(0.95),
        "p99_ms": percentile(0.99),
        "min_ms": ordered[0],
        "max_ms": ordered[-1],
    }
