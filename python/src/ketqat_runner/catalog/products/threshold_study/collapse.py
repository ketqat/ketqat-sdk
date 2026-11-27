"""Finite-size scaling collapse quality.

Near threshold the logical error rate of a code of distance d is a function of
one scaled variable, x = (p - p_th) d^(1/nu) (Wang, Harrington and Preskill
2003 use exactly this ansatz for the surface code). This module fits
log p_L = A + B x + C x^2 to every point with observed failures over a grid of
(p_th, nu) and reports the best pair with the reduced chi-square of that fit as
the *collapse quality*: about 1 means the points of every distance fall on one
curve within shot noise; well above 1 means they do not.

The weights are the observed failure counts, which is 1 / Var(log p_hat) for a
binomial count at low rate. With three distances nu is weakly constrained and
the reported p_th from the collapse is a second estimate to compare with the
crossing estimate, not a replacement for it.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

ANSATZ = "log p_L = A + B x + C x^2 with x = (p - p_th) d^(1/nu)"
MIN_POINTS = 6
P_GRID = 121
NU_GRID = np.linspace(0.5, 2.5, 41)


def _fit(x: np.ndarray, y: np.ndarray, weights: np.ndarray) -> tuple[float, float]:
    """Weighted quadratic fit; returns (weighted chi-square, unweighted residual sum of squares)."""
    design = np.vstack([np.ones_like(x), x, x * x]).T
    sqrt_w = np.sqrt(weights)
    coefficients, *_ = np.linalg.lstsq(design * sqrt_w[:, None], y * sqrt_w, rcond=None)
    residuals = y - design @ coefficients
    return float(np.sum(weights * residuals**2)), float(np.sum(residuals**2))


def finite_size_collapse(points: list[dict[str, Any]], rate_bounds: tuple[float, float] | None = None) -> dict[str, Any]:
    usable = [p for p in points if p["logical_failures"] > 0]
    if len(usable) < MIN_POINTS or len({p["distance"] for p in usable}) < 2:
        return {"available": False, "reason": f"the collapse fit needs at least {MIN_POINTS} points with observed failures at two or more distances; "
                                              f"{len(usable)} available", "ansatz": ANSATZ}
    d = np.array([p["distance"] for p in usable], dtype=float)
    p = np.array([p["physical_error_rate"] for p in usable], dtype=float)
    y = np.log(np.array([p_["logical_failures"] / p_["shots"] for p_ in usable], dtype=float))
    w = np.array([p_["logical_failures"] for p_ in usable], dtype=float)

    low, high = rate_bounds if rate_bounds else (float(p.min()), float(p.max()))
    best: tuple[float, float, float, float] | None = None  # (chi2, rss, p_th, nu)
    for p_th in np.linspace(low, high, P_GRID):
        for nu in NU_GRID:
            x = (p - p_th) * d ** (1.0 / nu)
            chi2, rss = _fit(x, y, w)
            if best is None or chi2 < best[0]:
                best = (chi2, rss, float(p_th), float(nu))
    assert best is not None
    chi2, rss, p_th, nu = best
    dof = len(usable) - 3
    total = float(np.sum((y - y.mean()) ** 2))
    return {
        "available": True,
        "ansatz": ANSATZ,
        "threshold": p_th,
        "nu": nu,
        "chi_square_reduced": chi2 / dof if dof > 0 else None,
        "r_squared": 1 - rss / total if total > 0 else None,
        "points_used": len(usable),
        "degrees_of_freedom": dof,
        "grid": {"p_th_points": P_GRID, "p_th_range": [low, high], "nu_range": [float(NU_GRID[0]), float(NU_GRID[-1])], "nu_points": int(len(NU_GRID))},
        "weights": "observed failure counts (1 / Var(log p_hat) for a binomial at low rate)",
        "note": (
            "A reduced chi-square near 1 means every distance falls on one scaling curve within shot noise. "
            "nu is weakly constrained by a few distances; the collapse p_th is a cross-check of the crossing estimate."
        ),
    }


def is_finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(value)
