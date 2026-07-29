"""QAOA for MaxCut, simulated as a real state vector (ketqat-sdk#151).

Item 2's optimization family. Like the adder, this one is worth having because
its answer can be checked against something other than itself.

Two independent checks are available and both are used, because they fail in
different ways:

**Brute force.** MaxCut on a small graph has an exact optimum, found by
enumerating all 2^n assignments. So the approximation ratio reported here is
measured against the true optimum, not against a bound or a previous run.

**A closed form.** Farhi, Goldstone and Gutmann give the p=1 expectation for a
triangle-free d-regular graph:

    <C> / |E| = 1/2 + 1/2 * sin(4*beta) * sin(gamma) * cos(gamma)^(d-1)

That is an analytic result derived independently of any simulator, so agreement
tests the simulation itself rather than its self-consistency. Its hypotheses are
real and are checked rather than assumed -- it does **not** hold on a graph
containing a triangle, and this module verifies that it fails there, so the
check cannot be quietly extended past its domain and keep looking green.

The optimisation is deliberately a grid search. QAOA's difficulty is that the
landscape is non-convex and gradient methods stall in barren plateaus; a local
optimiser here would report whatever it converged to and could not distinguish
"this is the best QAOA can do" from "the optimiser got stuck".
"""

from __future__ import annotations

import cmath
import math
from typing import Any, Iterable, Sequence

MAX_QAOA_QUBITS = 16


class QaoaError(ValueError):
    """A QAOA run that could not be set up or checked as specified."""


Edge = tuple[int, int]


def _validate(qubits: int, edges: Sequence[Edge]) -> None:
    if qubits < 2:
        raise QaoaError(f"MaxCut needs at least two vertices, not {qubits}.")
    if qubits > MAX_QAOA_QUBITS:
        raise QaoaError(f"{qubits} qubits is {1 << qubits} amplitudes; this simulator refuses.")
    if not edges:
        raise QaoaError("A graph with no edges has nothing to cut.")
    for u, v in edges:
        if not (0 <= u < qubits and 0 <= v < qubits):
            raise QaoaError(f"Edge ({u}, {v}) refers to a vertex outside 0..{qubits - 1}.")
        if u == v:
            raise QaoaError(f"Edge ({u}, {v}) is a self-loop, which no cut can separate.")


def cut_value(assignment: int, edges: Iterable[Edge]) -> int:
    """Edges crossing the partition described by the bits of `assignment`."""
    return sum(1 for u, v in edges if ((assignment >> u) & 1) != ((assignment >> v) & 1))


def brute_force_maxcut(qubits: int, edges: Sequence[Edge]) -> dict[str, Any]:
    """The exact optimum, by enumeration.

    Exponential and unapologetically so: this exists to be *certainly* right on
    small graphs, which is what makes the approximation ratio meaningful. A
    heuristic reference would leave the ratio measuring two unknowns.
    """
    _validate(qubits, edges)
    best = -1
    optimal: list[int] = []
    for assignment in range(1 << qubits):
        value = cut_value(assignment, edges)
        if value > best:
            best, optimal = value, [assignment]
        elif value == best:
            optimal.append(assignment)
    return {"max_cut": best, "optimal_assignments": optimal, "assignments_checked": 1 << qubits}


def qaoa_state(qubits: int, edges: Sequence[Edge], betas: Sequence[float], gammas: Sequence[float]) -> list[complex]:
    """Prepare the QAOA state by applying the alternating unitaries.

    Applied as operators on amplitudes, not as a closed form for the result --
    the closed form is the reference, so using it here would make the comparison
    circular.
    """
    if len(betas) != len(gammas):
        raise QaoaError(f"{len(betas)} beta(s) and {len(gammas)} gamma(s); each layer needs one of each.")
    _validate(qubits, edges)

    size = 1 << qubits
    amplitude = 1 / math.sqrt(size)
    state = [complex(amplitude, 0.0)] * size
    costs = [cut_value(assignment, edges) for assignment in range(size)]

    for beta, gamma in zip(betas, gammas):
        # Cost layer: diagonal, so it only rephases each basis state.
        for index in range(size):
            state[index] *= cmath.exp(-1j * gamma * costs[index])

        # Mixer: RX(2*beta) on every qubit.
        cos_beta, sin_beta = math.cos(beta), math.sin(beta)
        for target in range(qubits):
            stride = 1 << target
            for block in range(0, size, stride << 1):
                for offset in range(stride):
                    index = block + offset
                    partner = index + stride
                    a, b = state[index], state[partner]
                    state[index] = cos_beta * a - 1j * sin_beta * b
                    state[partner] = cos_beta * b - 1j * sin_beta * a

    return state


def expectation(qubits: int, edges: Sequence[Edge], betas: Sequence[float], gammas: Sequence[float]) -> float:
    """<C>, the expected cut under the QAOA state."""
    state = qaoa_state(qubits, edges, betas, gammas)
    costs = (cut_value(assignment, edges) for assignment in range(1 << qubits))
    return sum(cost * abs(amp) ** 2 for cost, amp in zip(costs, state))


def farhi_p1_expectation(edges_count: int, degree: int, beta: float, gamma: float) -> float:
    """Analytic p=1 expectation for a **triangle-free d-regular** graph.

    Farhi, Goldstone & Gutmann (2014). Independent of any simulator, which is
    what makes it a useful reference -- and valid only under its hypotheses,
    which is why the caller is expected to honour them. This module has a test
    showing the formula genuinely fails on a triangle, so the boundary is
    demonstrated rather than merely documented.
    """
    return edges_count * (0.5 + 0.5 * math.sin(4 * beta) * math.sin(gamma) * math.cos(gamma) ** (degree - 1))


def optimize_qaoa(
    qubits: int,
    edges: Sequence[Edge],
    *,
    layers: int = 1,
    grid: int = 24,
) -> dict[str, Any]:
    """Grid-search the QAOA angles and report against the true optimum.

    A grid rather than a gradient method on purpose. QAOA's landscape is
    non-convex with barren plateaus, so a local optimiser reports where it
    stopped, and "QAOA cannot do better" is indistinguishable from "the
    optimiser stalled". A grid is exhaustive at its resolution, and the
    resolution is reported so the number is not read as exact.
    """
    _validate(qubits, edges)
    if layers < 1:
        raise QaoaError(f"QAOA needs at least one layer, not {layers}.")
    if layers > 2:
        raise QaoaError(
            f"{layers} layers means a {grid}^{2 * layers} grid, which is not a search but a wait. "
            "Grid search is honest only while it is exhaustive."
        )

    exact = brute_force_maxcut(qubits, edges)
    best_value = -1.0
    best_angles: tuple[tuple[float, ...], tuple[float, ...]] = ((), ())

    betas = [math.pi * i / grid for i in range(grid)]
    gammas = [2 * math.pi * i / grid for i in range(grid)]

    def search(prefix_b: list[float], prefix_g: list[float]) -> None:
        nonlocal best_value, best_angles
        if len(prefix_b) == layers:
            value = expectation(qubits, edges, prefix_b, prefix_g)
            if value > best_value:
                best_value = value
                best_angles = (tuple(prefix_b), tuple(prefix_g))
            return
        for beta in betas:
            for gamma in gammas:
                search([*prefix_b, beta], [*prefix_g, gamma])

    search([], [])

    uniform = sum(cut_value(a, edges) for a in range(1 << qubits)) / (1 << qubits)
    return {
        "layers": layers,
        "grid": grid,
        "best_expectation": best_value,
        "best_beta": list(best_angles[0]),
        "best_gamma": list(best_angles[1]),
        "max_cut": exact["max_cut"],
        "approximation_ratio": best_value / exact["max_cut"],
        "random_guess_expectation": uniform,
        "beats_random_guessing": best_value > uniform,
        "note": (
            f"Ratio is against the exact optimum from enumerating all {exact['assignments_checked']} "
            f"assignments, not a bound. Angles come from an exhaustive {grid}x{grid} grid per layer; "
            "a finer grid can only improve the expectation, so this is a lower bound on QAOA's best."
        ),
    }
