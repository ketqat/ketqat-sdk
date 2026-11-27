"""Suppression factors and the neighbouring-distance crossing estimator with bootstrap.

A threshold is where the logical error rate curves of two code distances
cross. Below it the larger distance does better, above it worse. The estimator
here takes each pair of *neighbouring* distances (d, d+2), interpolates both
curves linearly in (log p, log p_L), and reports the rate where the larger
distance stops doing better. The uncertainty is a parametric bootstrap: every
point's failure count is redrawn from Binomial(shots, failures/shots) and the
crossing is recomputed, which carries the shot noise of every point into the
threshold estimate. It does not carry finite-size effects, which are reported
separately by the collapse fit and stated as a limitation.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from ....qec_statistics import Z_95, suppression_factor

Point = dict[str, Any]

#: A point takes part in the crossing search only when both distances observed
#: at least this many failures. One or two failures cannot order two curves:
#: their Wilson intervals span an order of magnitude, and a 1-vs-1 tie is not
#: a crossing. Such points still appear in the tables as what they are.
MIN_FAILURES_FOR_ORDERING = 5


def suppression_with_interval(lower_failures: int, higher_failures: int, shots: int, z: float = Z_95) -> dict[str, Any]:
    """Lambda = p_L(d) / p_L(d+2) with a delta-method interval on log Lambda.

    None (as `qec_statistics.suppression_factor`) when the higher distance saw
    no failure: a ratio against an unobserved count is an artifact of the shot
    budget, not a measurement. The interval also needs a failure at the lower
    distance; otherwise only the point value (0) is reported.
    """
    lower_rate = lower_failures / shots
    higher_rate = higher_failures / shots
    value = suppression_factor(lower_rate, higher_rate)
    out: dict[str, Any] = {"value": value, "lower": None, "upper": None, "method": "delta-method interval on log(Lambda)"}
    if value is None:
        out["note"] = "no failure observed at the higher distance; the ratio is not defined by this shot budget"
        return out
    if lower_failures == 0:
        out["note"] = "no failure observed at the lower distance; no interval"
        return out
    variance = (1 - lower_rate) / (shots * lower_rate) + (1 - higher_rate) / (shots * higher_rate)
    spread = z * math.sqrt(variance)
    out["lower"] = value * math.exp(-spread)
    out["upper"] = value * math.exp(spread)
    return out


def curve_crossing(rates: list[float], lower_distance_rates: list[float], higher_distance_rates: list[float],
                   usable: list[bool] | None = None) -> dict[str, Any]:
    """Rate where the higher-distance curve stops lying below the lower-distance curve.

    `rates` ascending; the logical rates are aligned with it. Points where either
    distance observed no failure are skipped (log is undefined; they are deep
    below threshold where the crossing is not), as are points `usable` marks
    False (too few failures to order the curves). Only a below-to-above change
    (larger distance better, then worse) counts as the threshold crossing; the
    reverse ordering change is shot noise and is ignored.
    """
    flags = usable if usable is not None else [True] * len(rates)
    usable_points = [(p, a, b) for p, a, b, ok in zip(rates, lower_distance_rates, higher_distance_rates, flags) if ok and a > 0 and b > 0]
    if len(usable_points) < 2:
        return {"crossing": None, "reason": f"fewer than two rates with at least {MIN_FAILURES_FOR_ORDERING} failures at both distances"}
    log_p = [math.log(p) for p, _, _ in usable_points]
    # Positive when the higher distance is doing worse (above threshold).
    gap = [math.log(b) - math.log(a) for _, a, b in usable_points]
    for i in range(len(usable_points) - 1):
        g0, g1 = gap[i], gap[i + 1]
        if g0 <= 0 <= g1 and (g0 != 0 or g1 != 0):
            t = -g0 / (g1 - g0)
            return {"crossing": math.exp(log_p[i] + t * (log_p[i + 1] - log_p[i])), "reason": None}
    if all(g < 0 for g in gap):
        return {"crossing": None, "reason": "the larger distance is better at every rate with observed failures; the crossing lies above the largest rate"}
    if all(g > 0 for g in gap):
        return {"crossing": None, "reason": "the larger distance is worse at every rate with observed failures; the crossing lies below the smallest rate"}
    return {"crossing": None, "reason": "the ordering of the two distances changes only from worse to better, which is shot noise rather than a threshold crossing"}


def _by_distance(points: list[Point]) -> dict[int, list[Point]]:
    curves: dict[int, list[Point]] = {}
    for point in points:
        curves.setdefault(int(point["distance"]), []).append(point)
    for curve in curves.values():
        curve.sort(key=lambda p: p["physical_error_rate"])
    return curves


def _pair_crossing(low: list[Point], high: list[Point], failures: dict[tuple[int, float], int]) -> dict[str, Any]:
    rates = [p["physical_error_rate"] for p in low]
    if rates != [p["physical_error_rate"] for p in high]:
        raise ValueError("every distance must be sampled at the same physical error rates")
    lower_counts = [failures[(p["distance"], p["physical_error_rate"])] for p in low]
    higher_counts = [failures[(p["distance"], p["physical_error_rate"])] for p in high]
    usable = [a >= MIN_FAILURES_FOR_ORDERING and b >= MIN_FAILURES_FOR_ORDERING for a, b in zip(lower_counts, higher_counts)]
    return curve_crossing(rates, [c / p["shots"] for c, p in zip(lower_counts, low)], [c / p["shots"] for c, p in zip(higher_counts, high)], usable)


def estimate_threshold(points: list[Point], resamples: int, seed: int, level: float = 0.95) -> dict[str, Any]:
    """Neighbouring-pair crossings, their mean, and a parametric bootstrap interval.

    The combined estimate is the mean of the neighbouring-pair crossings. A
    bootstrap resample contributes to the combined interval only when every
    pair crosses in it; per-pair intervals use every resample where that pair
    crosses. The fractions are reported so a reader can see how often the
    resampled data supported a crossing at all.
    """
    curves = _by_distance(points)
    distances = sorted(curves)
    if len(distances) < 2:
        return {"inconclusive": True, "reason": "a crossing needs at least two distances", "value": None, "pairs": []}
    observed = {(int(p["distance"]), p["physical_error_rate"]): int(p["logical_failures"]) for p in points}
    pairs: list[dict[str, Any]] = []
    for low, high in zip(distances, distances[1:]):
        found = _pair_crossing(curves[low], curves[high], observed)
        pairs.append({"lower_distance": low, "higher_distance": high, "crossing": found["crossing"], "reason": found["reason"],
                      "bootstrap": {"lower": None, "upper": None, "resamples_with_crossing": 0}})

    # Parametric bootstrap: redraw every failure count from its binomial.
    rng = np.random.default_rng((seed * 1_000_003 + 17) % (2**32))
    shots_by_key = {(int(p["distance"]), p["physical_error_rate"]): int(p["shots"]) for p in points}
    keys = list(observed)
    shots = np.array([shots_by_key[k] for k in keys])
    rates = np.array([observed[k] / shots_by_key[k] for k in keys])
    per_pair: list[list[float]] = [[] for _ in pairs]
    combined: list[float] = []
    for _ in range(resamples):
        drawn = rng.binomial(shots, rates)
        resampled = {k: int(v) for k, v in zip(keys, drawn)}
        values = []
        for index, pair in enumerate(pairs):
            found = _pair_crossing(curves[pair["lower_distance"]], curves[pair["higher_distance"]], resampled)["crossing"]
            if found is not None:
                per_pair[index].append(found)
            values.append(found)
        if all(v is not None for v in values):
            combined.append(float(np.mean(values)))

    alpha = (1 - level) / 2
    for index, pair in enumerate(pairs):
        sample = per_pair[index]
        pair["bootstrap"]["resamples_with_crossing"] = len(sample)
        if len(sample) >= 2:
            pair["bootstrap"]["lower"] = float(np.quantile(sample, alpha))
            pair["bootstrap"]["upper"] = float(np.quantile(sample, 1 - alpha))

    result: dict[str, Any] = {
        "method": (f"crossing of neighbouring-distance curves interpolated linearly in (log p, log p_L), using points with at least "
                   f"{MIN_FAILURES_FOR_ORDERING} failures at both distances; mean over pairs"),
        "pairs": pairs,
        "bootstrap": {
            "method": "parametric: failure counts redrawn from Binomial(shots, observed rate) per point",
            "resamples": resamples,
            "resamples_with_all_crossings": len(combined),
            "level": level,
            "lower": float(np.quantile(combined, alpha)) if len(combined) >= 2 else None,
            "upper": float(np.quantile(combined, 1 - alpha)) if len(combined) >= 2 else None,
        },
        "uncertainty_scope": (
            "The bootstrap interval carries the shot noise of every point. It excludes finite-size effects: "
            "neighbouring-pair crossings drift with distance, and the spread between pairs is the visible part of that. "
            "It also excludes the choice of interpolation."
        ),
    }
    missing = [p for p in pairs if p["crossing"] is None]
    if missing:
        result["inconclusive"] = True
        result["value"] = None
        result["reason"] = "; ".join(f"d={p['lower_distance']} vs d={p['higher_distance']}: {p['reason']}" for p in missing)
    else:
        result["inconclusive"] = False
        result["value"] = float(np.mean([p["crossing"] for p in pairs]))
        result["pair_spread"] = float(max(p["crossing"] for p in pairs) - min(p["crossing"] for p in pairs))
    return result


def suppression_table(points: list[Point]) -> list[dict[str, Any]]:
    """Lambda between successive distances at every physical error rate."""
    curves = _by_distance(points)
    distances = sorted(curves)
    rows: list[dict[str, Any]] = []
    for low, high in zip(distances, distances[1:]):
        by_rate_low = {p["physical_error_rate"]: p for p in curves[low]}
        by_rate_high = {p["physical_error_rate"]: p for p in curves[high]}
        for rate in sorted(by_rate_low):
            a, b = by_rate_low[rate], by_rate_high[rate]
            if a["shots"] != b["shots"]:
                raise ValueError("suppression factors need the same shot count at both distances")
            row = {"physical_error_rate": rate, "lower_distance": low, "higher_distance": high,
                   "lower_failures": a["logical_failures"], "higher_failures": b["logical_failures"], "shots": a["shots"]}
            row.update(suppression_with_interval(a["logical_failures"], b["logical_failures"], a["shots"]))
            rows.append(row)
    return rows
