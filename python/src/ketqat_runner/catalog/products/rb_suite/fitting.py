"""Weighted nonlinear decay fit and bootstrap over sequences.

Model: S(m) = A lambda^m + 1/d, with the asymptote fixed at the depolarized
value as in `randomized_benchmarking.fit_decay`. Unlike that fit, which linearises
log(S - 1/d), this one minimises the weighted squared residual in survival
space: for a fixed lambda the amplitude is linear, so the problem reduces to a
one-dimensional profile over lambda in (0, 1], scanned on a grid and refined by
golden section. Working in survival space keeps points at or below the floor
usable, handles the noiseless case (lambda exactly 1) and does not inflate the
influence of points near the floor.

Uncertainty is a non-parametric bootstrap over sequences at every length,
which is the quantity RB averages over; shot noise within a sequence is
included through the sequence means.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

MODEL = "S(m) = A * lambda^m + 1/d, with 1/d fixed"
METHOD = "weighted least squares in survival space, profile over lambda on a grid with golden-section refinement"
GRID_POINTS = 2001
GOLDEN = (math.sqrt(5) - 1) / 2
MIN_POINTS = 3


def _profile(lams: np.ndarray, m: np.ndarray, excess: np.ndarray, weights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Residual and best amplitude for every lambda in `lams`."""
    powers = lams[:, None] ** m[None, :]
    numerator = (powers * (weights * excess)[None, :]).sum(axis=1)
    denominator = (powers * powers * weights[None, :]).sum(axis=1)
    amplitude = numerator / denominator
    residual = (((excess[None, :] - amplitude[:, None] * powers) ** 2) * weights[None, :]).sum(axis=1)
    return residual, amplitude


def fit_decay(points: list[dict[str, Any]], dimension: int) -> dict[str, Any]:
    """Fit the decay to per-length means; `points` carry sequence_length, survival_probability, standard_error."""
    if len(points) < MIN_POINTS:
        return {"inconclusive": True, "reason": f"a decay fit needs at least {MIN_POINTS} sequence lengths, got {len(points)}"}
    asymptote = 1.0 / dimension
    m = np.array([p["sequence_length"] for p in points], dtype=float)
    survival = np.array([p["survival_probability"] for p in points], dtype=float)
    errors = [p.get("standard_error") for p in points]
    if all(e is not None and e > 0 for e in errors):
        weights = 1.0 / np.array(errors, dtype=float) ** 2
        weighting = "1 / standard_error^2 across sequences"
    else:
        weights = np.ones_like(m)
        weighting = "uniform (a sequence length had zero spread across sequences)"
    excess = survival - asymptote

    if np.all(survival == 1.0):
        decay, amplitude, residual = 1.0, 1.0 - asymptote, 0.0
    else:
        grid = np.linspace(1e-6, 1.0, GRID_POINTS)
        residuals, _ = _profile(grid, m, excess, weights)
        best = int(np.argmin(residuals))
        lo = grid[max(best - 1, 0)]
        hi = grid[min(best + 1, GRID_POINTS - 1)]
        # Golden-section search on the unimodal bracket around the best grid point.
        a, b = lo, hi
        c = b - GOLDEN * (b - a)
        d = a + GOLDEN * (b - a)
        fc = _profile(np.array([c]), m, excess, weights)[0][0]
        fd = _profile(np.array([d]), m, excess, weights)[0][0]
        for _ in range(80):
            if fc < fd:
                b, d, fd = d, c, fc
                c = b - GOLDEN * (b - a)
                fc = _profile(np.array([c]), m, excess, weights)[0][0]
            else:
                a, c, fc = c, d, fd
                d = a + GOLDEN * (b - a)
                fd = _profile(np.array([d]), m, excess, weights)[0][0]
            if b - a < 1e-13:
                break
        decay = float((a + b) / 2)
        if residuals[best] <= min(fc, fd):
            decay = float(grid[best])
        if decay > 1 - 1e-12:
            decay = 1.0
        residual, amplitude = (float(v[0]) for v in _profile(np.array([decay]), m, excess, weights))

    if decay <= 1e-3 or amplitude <= 0:
        return {"inconclusive": True, "reason": "no decay can be fitted: the survival data sit at the depolarized floor"}
    dof = len(points) - 2
    return {
        "inconclusive": False,
        "decay_parameter": decay,
        "amplitude": float(amplitude),
        "asymptote": asymptote,
        "asymptote_is_fixed": True,
        "error_per_clifford": (dimension - 1) / dimension * (1 - decay),
        "chi_square": float(residual),
        "chi_square_reduced": float(residual) / dof if dof > 0 and weighting.startswith("1 /") else None,
        "degrees_of_freedom": dof,
        "fitted_points": len(points),
        "weighting": weighting,
        "model": MODEL,
        "method": METHOD,
    }


def resample_points(points: list[dict[str, Any]], rng: np.random.Generator) -> list[dict[str, Any]]:
    """Resample sequences with replacement at every length."""
    out = []
    for p in points:
        values = np.asarray(p["per_sequence"], dtype=float)
        n = len(values)
        drawn = values[rng.integers(0, n, size=n)]
        error = float(np.std(drawn, ddof=1) / math.sqrt(n)) if n > 1 else None
        out.append({"sequence_length": p["sequence_length"], "survival_probability": float(np.mean(drawn)),
                    "standard_error": error if error and error > 0 else None})
    return out


def percentile_interval(values: list[float], level: float = 0.95) -> dict[str, Any]:
    if len(values) < 2:
        return {"lower": None, "upper": None, "standard_deviation": None, "resamples": len(values), "level": level}
    alpha = (1 - level) / 2
    return {"lower": float(np.quantile(values, alpha)), "upper": float(np.quantile(values, 1 - alpha)),
            "standard_deviation": float(np.std(values, ddof=1)), "resamples": len(values), "level": level}


def bootstrap_rng(seed: int, label: str) -> np.random.Generator:
    """One generator per bootstrap, derived from the run seed and a label; deterministic."""
    payload = sum((i + 1) * ord(ch) for i, ch in enumerate(label))
    return np.random.default_rng((seed * 2_654_435_761 + payload) % (2**32))
