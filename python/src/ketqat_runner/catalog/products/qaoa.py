"""kq.algorithms.qaoa-maxcut 1.0.0: QAOA for MaxCut by exhaustive grid search.

Wraps `ketqat_runner.qaoa`: the QAOA state is prepared as a state vector by
applying the cost and mixer layers as operators, the angles come from an
exhaustive grid, and the expected cut is reported against the exact optimum
from enumerating every assignment. Where Farhi, Goldstone and Gutmann's p=1
closed form applies (a triangle-free regular graph) it is evaluated at the
chosen angles and reported beside the simulation.
"""

from __future__ import annotations

import math
from typing import Any

from ...qaoa import (
    MAX_QAOA_QUBITS,
    QaoaError,
    brute_force_maxcut,
    cut_value,
    farhi_p1_expectation,
    optimize_qaoa,
    qaoa_state,
)
from ..params import ParameterError

MAX_VERTICES = 12
#: One unit is one amplitude update in one gate layer. Measured at roughly
#: 0.3-0.45 microseconds each in pure Python on a 2024 laptop.
MAX_WORK_UNITS = 60_000_000
SECONDS_PER_UNIT = 4e-7


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def _parse_edge(text: str) -> tuple[int, int]:
    left, separator, right = text.partition("-")
    if not separator or not left.strip().isdigit() or not right.strip().isdigit():
        raise ParameterError(f"Edge {text!r} must be written as 'u-v' with non-negative integers, e.g. '0-1'.")
    return int(left), int(right)


def build_edges(params: dict[str, Any]) -> list[tuple[int, int]]:
    graph = params["graph"]
    n = params["n_vertices"]
    if graph == "custom":
        if params["edges"] is None:
            raise ParameterError("graph=custom needs 'edges', a list of 'u-v' strings.")
        edges = [_parse_edge(text) for text in params["edges"]]
    else:
        if params["edges"] is not None:
            raise ParameterError("'edges' applies only to graph=custom; the other graphs are built from n_vertices.")
        if graph == "ring":
            edges = [(0, 1)] if n == 2 else [(i, (i + 1) % n) for i in range(n)]
        elif graph == "path":
            edges = [(i, i + 1) for i in range(n - 1)]
        else:  # complete
            edges = [(i, j) for i in range(n) for j in range(i + 1, n)]
    seen: set[tuple[int, int]] = set()
    for u, v in edges:
        if not (0 <= u < n and 0 <= v < n):
            raise ParameterError(f"Edge ({u}, {v}) refers to a vertex outside 0..{n - 1}.")
        if u == v:
            raise ParameterError(f"Edge ({u}, {v}) is a self-loop, which no cut can separate.")
        key = (min(u, v), max(u, v))
        if key in seen:
            raise ParameterError(f"Edge ({u}, {v}) is listed more than once.")
        seen.add(key)
    if not edges:
        raise ParameterError("The graph has no edges, so there is nothing to cut.")
    return edges


def work_units(n: int, layers: int, grid: int) -> int:
    return grid ** (2 * layers) * layers * (1 << n) * (n + 2)


def validate(params: dict[str, Any]) -> None:
    n = params["n_vertices"]
    if n > min(MAX_VERTICES, MAX_QAOA_QUBITS):
        raise ParameterError(f"n_vertices={n} exceeds the {MAX_VERTICES}-vertex ceiling of this product.")
    build_edges(params)
    units = work_units(n, params["layers"], params["grid"])
    if units > MAX_WORK_UNITS:
        raise ParameterError(
            f"n_vertices={n}, layers={params['layers']}, grid={params['grid']} means "
            f"{params['grid'] ** (2 * params['layers'])} expectation evaluations on {1 << n} amplitudes, about "
            f"{units * SECONDS_PER_UNIT:.0f} s of pure-Python simulation (limit about "
            f"{MAX_WORK_UNITS * SECONDS_PER_UNIT:.0f} s). Use a coarser grid, fewer layers or a smaller graph."
        )


def _graph_structure(n: int, edges: list[tuple[int, int]]) -> tuple[int | None, bool]:
    neighbours: list[set[int]] = [set() for _ in range(n)]
    for u, v in edges:
        neighbours[u].add(v)
        neighbours[v].add(u)
    degrees = {len(block) for block in neighbours}
    regular = degrees.pop() if len(degrees) == 1 else None
    triangle_free = all(not (neighbours[u] & neighbours[v]) for u, v in edges)
    return regular, triangle_free


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    import numpy as np

    n = params["n_vertices"]
    edges = build_edges(params)
    layers, grid, shots = params["layers"], params["grid"], params["shots"]
    try:
        report = optimize_qaoa(n, edges, layers=layers, grid=grid)
        exact = brute_force_maxcut(n, edges)
        state = qaoa_state(n, edges, report["best_beta"], report["best_gamma"])
    except QaoaError as exc:
        raise ParameterError(str(exc)) from exc

    size = 1 << n
    probabilities = np.array([abs(amplitude) ** 2 for amplitude in state])
    probabilities /= probabilities.sum()
    cuts = np.array([cut_value(assignment, edges) for assignment in range(size)])
    max_cut = exact["max_cut"]
    optimal_mask = cuts == max_cut

    rng = np.random.default_rng(seed)
    draws = rng.choice(size, size=shots, p=probabilities)
    tally = np.bincount(draws, minlength=size)
    counts = {format(index, f"0{n}b"): int(tally[index]) for index in range(size) if tally[index]}
    sampled_cuts = cuts[draws]

    degree, triangle_free = _graph_structure(n, edges)
    analytic_applies = layers == 1 and degree is not None and triangle_free
    analytic = (
        farhi_p1_expectation(len(edges), degree, report["best_beta"][0], report["best_gamma"][0])
        if analytic_applies
        else None
    )

    return {
        "graph": {
            "kind": params["graph"],
            "n_vertices": n,
            "edges": [[u, v] for u, v in edges],
            "regular_degree": degree,
            "triangle_free": triangle_free,
        },
        "layers": layers,
        "grid": grid,
        "best_beta": [_round(angle) for angle in report["best_beta"]],
        "best_gamma": [_round(angle) for angle in report["best_gamma"]],
        "best_expectation": _round(report["best_expectation"]),
        "max_cut": max_cut,
        "optimal_assignments": [format(assignment, f"0{n}b") for assignment in exact["optimal_assignments"]],
        "approximation_ratio": _round(report["approximation_ratio"]),
        "random_guess_expectation": _round(report["random_guess_expectation"]),
        "beats_random_guessing": bool(report["beats_random_guessing"]),
        "probability_of_optimal_cut": _round(float(probabilities[optimal_mask].sum())),
        "analytic_p1_applies": analytic_applies,
        "analytic_p1_expectation": _round(analytic) if analytic is not None else None,
        "analytic_p1_note": (
            "Farhi-Goldstone-Gutmann p=1 closed form |E| (1/2 + 1/2 sin(4 beta) sin(gamma) cos(gamma)^(d-1)) "
            "evaluated at the chosen angles; it holds for triangle-free d-regular graphs."
            if analytic_applies
            else "The p=1 closed form applies only to triangle-free regular graphs at layers=1; not evaluated."
        ),
        "shots": shots,
        "counts": counts,
        "bit_order": "vertex 0 is the rightmost character of each assignment string",
        "sampled_cut_mean": _round(float(sampled_cuts.mean())),
        "best_sampled_cut": int(sampled_cuts.max()),
        "observed_optimal_fraction": _round(float(np.mean(sampled_cuts == max_cut))),
        "note": report["note"],
        "execution": "statevector simulation of the QAOA layers; angles from an exhaustive grid; optimum by enumeration",
    }
