"""Surface-code threshold estimation from a distance/error-rate sweep.

The runner already sweeps code distance and physical error rate, so the data a
threshold estimate needs was being produced and thrown away. What was missing is
the estimate -- and, more importantly, the refusal (ketqat-sdk#127).

A threshold is where the curves for different code distances **cross**: below
it, more distance suppresses logical error; above it, more distance makes things
worse. If a sweep does not contain that crossing, there is no threshold in the
data, and any number produced from it is an extrapolation dressed as a
measurement.

That is the failure this module is built around. `estimate_threshold` returns
`inconclusive` with a reason far more readily than it returns a number, because
a confident threshold from a sweep that never crossed is the single most
misleading thing this codebase could publish. A threshold is the headline figure
of a QEC paper.
"""

from __future__ import annotations

from typing import Any


#: A crossing needs at least two distances to cross, and at least three rates
#: for the ordering to change *within* the sweep rather than at its edge.
MIN_DISTANCES = 2
MIN_RATES = 3


def _curves(points: list[dict[str, Any]]) -> dict[int, list[tuple[float, float]]]:
    """Group (physical rate, logical rate) by code distance, sorted by rate."""
    curves: dict[int, list[tuple[float, float]]] = {}
    for point in points:
        distance = point.get("code_distance")
        physical = point.get("physical_error_rate")
        logical = point.get("logical_error_rate")
        if distance is None or physical is None or logical is None:
            continue
        curves.setdefault(int(distance), []).append((float(physical), float(logical)))
    for distance in curves:
        curves[distance].sort(key=lambda entry: entry[0])
    return curves


def _interpolate(curve: list[tuple[float, float]], rate: float) -> float | None:
    """Linear interpolation of a curve at `rate`, or None outside its range."""
    if not curve:
        return None
    if rate < curve[0][0] or rate > curve[-1][0]:
        return None
    for index in range(len(curve) - 1):
        left_rate, left_value = curve[index]
        right_rate, right_value = curve[index + 1]
        if left_rate <= rate <= right_rate:
            if right_rate == left_rate:
                return left_value
            weight = (rate - left_rate) / (right_rate - left_rate)
            return left_value + weight * (right_value - left_value)
    return curve[-1][1]


def _crossing(
    low: list[tuple[float, float]], high: list[tuple[float, float]]
) -> float | None:
    """Physical rate where a lower-distance curve is overtaken by a higher one.

    Below threshold the higher distance sits *below* the lower one. Above it,
    above. The crossing is where that difference changes sign, found by bisection
    on the interpolated difference rather than by fitting a model -- a two-point
    fit to a handful of noisy points invents a precision the data does not carry.
    """
    shared = [rate for rate, _ in low if _interpolate(high, rate) is not None]
    if len(shared) < 2:
        return None

    def difference(rate: float) -> float | None:
        left = _interpolate(low, rate)
        right = _interpolate(high, rate)
        if left is None or right is None:
            return None
        # Positive when the higher distance is doing better, as expected below
        # threshold.
        return left - right

    signs = [(rate, difference(rate)) for rate in shared]
    signs = [(rate, value) for rate, value in signs if value is not None]
    if len(signs) < 2:
        return None

    for index in range(len(signs) - 1):
        left_rate, left_value = signs[index]
        right_rate, right_value = signs[index + 1]
        if left_value == 0:
            return left_rate
        if left_value > 0 > right_value or left_value < 0 < right_value:
            span = left_value - right_value
            if span == 0:
                return left_rate
            return left_rate + (right_rate - left_rate) * (left_value / span)
    return None


def estimate_threshold(points: list[dict[str, Any]]) -> dict[str, Any]:
    """Estimate the threshold, or explain why the data cannot support one.

    Every refusal names what was missing. "Inconclusive" without a reason is
    indistinguishable from a bug, and a reader cannot tell whether to add
    distances, add rates, or widen the sweep.
    """
    curves = _curves(points)
    distances = sorted(curves)

    if len(distances) < MIN_DISTANCES:
        return {
            "inconclusive": True,
            "reason": (
                f"A threshold is where curves for different code distances cross, so it needs at "
                f"least {MIN_DISTANCES} distances. This sweep has {len(distances)}."
            ),
            "distances": distances,
        }

    rate_counts = {distance: len(curves[distance]) for distance in distances}
    if min(rate_counts.values()) < MIN_RATES:
        return {
            "inconclusive": True,
            "reason": (
                f"Every distance needs at least {MIN_RATES} physical error rates for a crossing to "
                f"fall inside the sweep rather than at its edge. Smallest here: "
                f"{min(rate_counts.values())}."
            ),
            "distances": distances,
        }

    crossings: list[dict[str, Any]] = []
    for index, low in enumerate(distances):
        for high in distances[index + 1 :]:
            rate = _crossing(curves[low], curves[high])
            if rate is not None:
                crossings.append({"lower_distance": low, "higher_distance": high, "crossing": rate})

    if not crossings:
        # The most important branch in this module.
        return {
            "inconclusive": True,
            "reason": (
                "No pair of distance curves crosses anywhere in this sweep. Below threshold a "
                "larger distance always does better, so the ordering never changes and there is no "
                "threshold in this data. Widen the physical error rate range until the larger "
                "distance starts doing worse. Any number reported from this sweep would be an "
                "extrapolation, not a measurement."
            ),
            "distances": distances,
            "crossings": [],
        }

    values = sorted(entry["crossing"] for entry in crossings)
    middle = len(values) // 2
    estimate = values[middle] if len(values) % 2 else (values[middle - 1] + values[middle]) / 2

    return {
        "inconclusive": False,
        "threshold_estimate": estimate,
        # The spread across distance pairs, which is the honest uncertainty
        # here: a fitted confidence interval would imply a model this does not
        # assume.
        "crossing_spread": (values[-1] - values[0]) if len(values) > 1 else 0.0,
        "crossings": crossings,
        "distances": distances,
        "method": "pairwise curve crossing, median across distance pairs",
        "uncertainty_scope": (
            "The spread is between distance pairs, not a confidence interval. It excludes shot "
            "noise on each point and excludes finite-size effects, which at these distances are "
            "usually the larger term. A threshold from three distances is an estimate, not a "
            "measurement of the code's asymptotic threshold."
        ),
    }
