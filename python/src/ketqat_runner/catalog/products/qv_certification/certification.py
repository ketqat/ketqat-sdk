"""The pass rule of Cross, Bishop, Sheldon, Nation and Gambetta (2019) and per-width intervals.

The protocol estimates the heavy-output probability h_d as the mean over n_c
circuits of each circuit's heavy fraction, and requires

    h_d - 2 sqrt(h_d (1 - h_d) / n_c) > 2/3,

a one-sided bound two standard deviations below the mean with the binomial
variance over circuits. That exact rule is `certify`; it is what the achieved
quantum volume is decided from. Two further intervals are reported for
comparison and are not part of the rule: a 2-sigma bound from the empirical
spread across circuits (what `quantum_volume.measure_quantum_volume` uses) and
a bootstrap percentile interval over circuits.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from ....quantum_volume import HEAVY_OUTPUT_THRESHOLD, IDEAL_HEAVY_OUTPUT_PROBABILITY

Z_RULE = 2.0
Z_95 = 1.959963984540054
#: Cross et al. run at least 100 circuits per width; fewer is reported as below the protocol's minimum.
PROTOCOL_MINIMUM_CIRCUITS = 100


def certify(heavy_fractions: list[float]) -> dict[str, Any]:
    """Apply the pass rule to per-circuit heavy fractions."""
    n = len(heavy_fractions)
    if n < 2:
        return {"passed": False, "circuits": n, "heavy_output_probability": float(np.mean(heavy_fractions)) if n else None,
                "reason": "the rule needs at least two circuits", "threshold": HEAVY_OUTPUT_THRESHOLD}
    h = float(np.mean(heavy_fractions))
    sigma = math.sqrt(h * (1 - h) / n)
    lower = h - Z_RULE * sigma
    return {
        "rule": "h - 2 sqrt(h (1 - h) / n_c) > 2/3 (Cross et al. 2019)",
        "circuits": n,
        "heavy_output_probability": h,
        "binomial_sigma": sigma,
        "two_sigma_lower_bound": lower,
        "threshold": HEAVY_OUTPUT_THRESHOLD,
        "passed": bool(lower > HEAVY_OUTPUT_THRESHOLD),
        "meets_protocol_minimum_circuits": n >= PROTOCOL_MINIMUM_CIRCUITS,
        "ideal_reference": IDEAL_HEAVY_OUTPUT_PROBABILITY,
    }


def empirical_intervals(heavy_fractions: list[float]) -> dict[str, Any]:
    """Intervals from the spread across circuits: 2-sigma one-sided and 95% two-sided."""
    n = len(heavy_fractions)
    h = float(np.mean(heavy_fractions))
    if n < 2:
        return {"standard_error": None, "two_sigma_lower_bound": None, "lower": None, "upper": None, "level": 0.95}
    se = float(np.std(heavy_fractions, ddof=1) / math.sqrt(n))
    return {"method": "standard error of the mean across circuits", "standard_error": se, "two_sigma_lower_bound": h - Z_RULE * se,
            "lower": max(0.0, h - Z_95 * se), "upper": min(1.0, h + Z_95 * se), "level": 0.95}


def bootstrap_interval(heavy_fractions: list[float], resamples: int, rng: np.random.Generator, level: float = 0.95) -> dict[str, Any]:
    values = np.asarray(heavy_fractions, dtype=float)
    n = len(values)
    if n < 2:
        return {"lower": None, "upper": None, "resamples": 0, "level": level, "fraction_passing": None}
    means = np.array([values[rng.integers(0, n, size=n)].mean() for _ in range(resamples)])
    alpha = (1 - level) / 2
    return {"method": "percentile bootstrap over circuits", "lower": float(np.quantile(means, alpha)), "upper": float(np.quantile(means, 1 - alpha)),
            "resamples": resamples, "level": level,
            "fraction_passing": float(np.mean([certify(list(values[rng.integers(0, n, size=n)]))["passed"] for _ in range(resamples)]))}


def achieved_quantum_volume(per_width: list[dict[str, Any]]) -> dict[str, Any]:
    """2^(largest passing width), with a flag saying whether every smaller tested width also passed."""
    widths = sorted(entry["width"] for entry in per_width)
    passed = {entry["width"]: bool(entry["certification"]["passed"]) for entry in per_width}
    passing = [w for w in widths if passed[w]]
    if not passing:
        return {"achieved_quantum_volume": None, "max_passing_width": None, "passing_widths": [], "failing_widths": widths,
                "all_smaller_widths_pass": None, "tested_widths": widths,
                "interpretation": "No tested width passes the rule; no quantum volume is claimed."}
    best = max(passing)
    smaller = [w for w in widths if w < best]
    monotone = all(passed[w] for w in smaller)
    return {
        "achieved_quantum_volume": 1 << best,
        "max_passing_width": best,
        "passing_widths": passing,
        "failing_widths": [w for w in widths if not passed[w]],
        "all_smaller_widths_pass": monotone,
        "tested_widths": widths,
        "interpretation": (
            f"Quantum volume {1 << best} from width {best}, the largest tested width that passes"
            + ("; every smaller tested width also passes." if monotone else
               f"; a smaller tested width fails ({[w for w in smaller if not passed[w]]}), so the claim is not monotone and should be read with care.")
            + (" Widths were not tested consecutively from 2; untested widths are not claimed." if widths != list(range(2, widths[-1] + 1)) else "")
        ),
    }
