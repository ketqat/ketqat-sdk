"""Tests for QAOA on MaxCut (ketqat-sdk#151)."""

from __future__ import annotations

import math

import pytest

from ketqat_runner.qaoa import (
    QaoaError,
    brute_force_maxcut,
    cut_value,
    expectation,
    farhi_p1_expectation,
    optimize_qaoa,
    qaoa_state,
)

RING_4 = [(0, 1), (1, 2), (2, 3), (3, 0)]
RING_6 = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0)]
TRIANGLE = [(0, 1), (1, 2), (2, 0)]


@pytest.mark.parametrize(
    "qubits,edges,degree",
    [(2, [(0, 1)], 1), (4, RING_4, 2), (6, RING_6, 2)],
)
def test_simulation_matches_the_analytic_p1_expectation(qubits, edges, degree) -> None:
    """The load-bearing check: agreement with a closed form derived without a simulator.

    Farhi, Goldstone & Gutmann give <C>/|E| = 1/2 + 1/2 sin(4b) sin(g) cos(g)^(d-1)
    for triangle-free d-regular graphs. Nothing in the simulation knows this
    formula, so agreement tests the simulation rather than its self-consistency.
    """
    for beta in (0.1, 0.4, 0.7, 1.1):
        for gamma in (0.2, 0.6, 1.3, 2.1):
            simulated = expectation(qubits, edges, [beta], [gamma])
            analytic = farhi_p1_expectation(len(edges), degree, beta, gamma)
            assert abs(simulated - analytic) < 1e-12


def test_the_closed_form_fails_on_a_triangle() -> None:
    """The formula's hypothesis is real, and is demonstrated rather than documented.

    "Triangle-free" is not decoration: on a 3-cycle the derivation's assumption
    that neighbourhoods are trees breaks. Showing the disagreement keeps the
    check above from being quietly reused outside its domain -- where it would
    keep passing for the wrong reason.
    """
    worst = max(
        abs(expectation(3, TRIANGLE, [beta], [gamma]) - farhi_p1_expectation(3, 2, beta, gamma))
        for beta in (0.4, 0.7)
        for gamma in (0.6, 1.3)
    )
    assert worst > 0.1, "if this agreed, the triangle-free hypothesis would be doing no work"


def test_ring_reaches_the_known_p1_optimum() -> None:
    """QAOA at p=1 on a triangle-free 2-regular graph cannot beat 3/4.

    max over angles of 1/2 + 1/2 sin(4b) sin(g) cos(g) is 1/2 + 1/4, since
    sin(g)cos(g) peaks at 1/2. The grid search finds exactly that, on two
    different ring sizes -- an independent arrival at a known ceiling.
    """
    for qubits, edges in ((4, RING_4), (6, RING_6)):
        report = optimize_qaoa(qubits, edges, layers=1, grid=16)
        assert report["approximation_ratio"] == pytest.approx(0.75, abs=1e-9)


def test_more_layers_never_hurt() -> None:
    """p=2 must be at least as good as p=1: p=1 is a special case of it.

    Setting the second layer's angles to zero reduces p=2 to p=1, so a p=2
    result below p=1 would mean the search or the simulation is wrong.
    """
    for qubits, edges in ((4, RING_4), (3, TRIANGLE)):
        one = optimize_qaoa(qubits, edges, layers=1, grid=12)["best_expectation"]
        two = optimize_qaoa(qubits, edges, layers=2, grid=12)["best_expectation"]
        assert two >= one - 1e-9


def test_ring_4_is_solved_exactly_at_p2() -> None:
    """QAOA reaches the true optimum on the 4-cycle at depth 2."""
    report = optimize_qaoa(4, RING_4, layers=2, grid=16)
    assert report["approximation_ratio"] == pytest.approx(1.0, abs=1e-9)


def test_zero_angles_give_uniform_superposition() -> None:
    """With no evolution the state is uniform, so <C> is the random-guess average.

    The baseline any optimiser must beat, computed rather than assumed.
    """
    for qubits, edges in ((4, RING_4), (3, TRIANGLE)):
        value = expectation(qubits, edges, [0.0], [0.0])
        uniform = sum(cut_value(a, edges) for a in range(1 << qubits)) / (1 << qubits)
        assert value == pytest.approx(uniform, abs=1e-12)


def test_state_stays_normalised() -> None:
    """Both layers are unitary, so probability is conserved."""
    state = qaoa_state(4, RING_4, [0.3, 0.9], [1.1, 2.4])
    assert abs(sum(abs(a) ** 2 for a in state) - 1.0) < 1e-12


def test_brute_force_optimum_is_exact() -> None:
    """The reference the ratio is measured against, checked on known graphs.

    A ring of even length is bipartite, so every edge can be cut. A triangle is
    odd, so one edge must always survive -- 2 of 3.
    """
    assert brute_force_maxcut(4, RING_4)["max_cut"] == 4
    assert brute_force_maxcut(6, RING_6)["max_cut"] == 6
    assert brute_force_maxcut(3, TRIANGLE)["max_cut"] == 2


def test_rejects_impossible_graphs() -> None:
    with pytest.raises(QaoaError, match="self-loop"):
        brute_force_maxcut(3, [(1, 1)])
    with pytest.raises(QaoaError, match="nothing to cut"):
        brute_force_maxcut(3, [])
    with pytest.raises(QaoaError, match="outside"):
        brute_force_maxcut(3, [(0, 7)])
    with pytest.raises(QaoaError, match="at least two vertices"):
        brute_force_maxcut(1, [(0, 0)])


def test_refuses_a_grid_that_is_not_a_search() -> None:
    """Grid search is honest only while exhaustive; beyond p=2 it is neither."""
    with pytest.raises(QaoaError, match="not a search but a wait"):
        optimize_qaoa(4, RING_4, layers=3, grid=24)


def test_mismatched_angle_counts_are_refused() -> None:
    with pytest.raises(QaoaError, match="each layer needs one of each"):
        qaoa_state(4, RING_4, [0.1, 0.2], [0.3])
