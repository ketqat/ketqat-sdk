#!/usr/bin/env python3
"""Regenerate the PyZX differential fixtures (ketqat-sdk#192).

The ZX rewrites in this package were verified against our own matrix evaluator,
which establishes internal consistency and nothing about whether the rules are the
ones the literature defines. PyZX is the reference implementation of exactly these
rewrites, so agreeing with it is a stronger claim.

The fixtures are **golden files**: evidence from PyZX at generation time, not a
live check. That is a real limitation and the reason this script exists -- anyone
can regenerate them against a current PyZX and see whether the agreement holds.
The PyZX version is recorded in each file so a stale fixture is visible rather
than silent.

    python scripts/generate-pyzx-fixtures.py
"""

from __future__ import annotations

import json
import random
from fractions import Fraction
from pathlib import Path

import numpy as np
import pyzx as zx
from pyzx.graph import Graph

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
CASES_PER_RULE = 40


def build(phases, edges, first_boundary, last_boundary):
    """Construct the diagram in PyZX: Z-spiders, Hadamard edges, simple boundaries.

    Matches this package's graph-like representation, where an "input spider" is a
    Z-spider joined to a boundary vertex by a simple edge.
    """
    graph = Graph()
    spiders = [
        graph.add_vertex(zx.VertexType.Z, index, 1, phase=Fraction(int(phase * 4), 4))
        for index, phase in enumerate(phases)
    ]
    entry = graph.add_vertex(zx.VertexType.BOUNDARY, -1, 0)
    exit_vertex = graph.add_vertex(zx.VertexType.BOUNDARY, len(phases), 0)
    graph.add_edge((entry, spiders[first_boundary]), zx.EdgeType.SIMPLE)
    graph.add_edge((spiders[last_boundary], exit_vertex), zx.EdgeType.SIMPLE)
    for a, b in edges:
        graph.add_edge((spiders[a], spiders[b]), zx.EdgeType.HADAMARD)
    graph.set_inputs((entry,))
    graph.set_outputs((exit_vertex,))
    return graph, spiders


def flatten(graph):
    return [[complex(value).real, complex(value).imag] for value in np.asarray(zx.tensorfy(graph)).ravel()]


def generate_lcomp():
    random.seed(4242)
    cases = []
    for _trial in range(4000):
        width = random.choice([4, 5])
        phases = [random.choice([0, 0.25, 0.5, 1, 1.5]) for _ in range(width)]
        edges = [(a, b) for a in range(width) for b in range(a + 1, width) if random.random() < 0.55]
        if not edges:
            continue
        for target in range(width):
            if target in (0, width - 1):
                continue
            graph, spiders = build(phases, edges, 0, width - 1)
            if not zx.check_lcomp(graph, spiders[target]):
                continue
            try:
                zx.lcomp(graph, spiders[target])
                after = flatten(graph)
            except Exception:
                continue
            cases.append(
                {"phases": phases, "edges": edges, "in": 0, "out": width - 1, "target": target, "pyzx_after": after}
            )
            break
        if len(cases) >= CASES_PER_RULE:
            break
    return cases


def generate_pivot():
    random.seed(777)
    cases = []
    for _trial in range(6000):
        width = random.choice([5, 6])
        phases = [
            random.choice([0, 1]) if random.random() < 0.6 else random.choice([0.25, 0.5])
            for _ in range(width)
        ]
        edges = [(a, b) for a in range(width) for b in range(a + 1, width) if random.random() < 0.55]
        if not edges:
            continue
        for a, b in edges:
            if a in (0, width - 1) or b in (0, width - 1):
                continue
            graph, spiders = build(phases, edges, 0, width - 1)
            try:
                if not zx.check_pivot(graph, spiders[a], spiders[b]):
                    continue
                zx.pivot(graph, spiders[a], spiders[b])
                after = flatten(graph)
            except Exception:
                continue
            cases.append(
                {"phases": phases, "edges": edges, "in": 0, "out": width - 1, "u": a, "v": b, "pyzx_after": after}
            )
            break
        if len(cases) >= CASES_PER_RULE:
            break
    return cases


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    version = getattr(zx, "__version__", "unknown")
    for name, cases in (("pyzx-lcomp.json", generate_lcomp()), ("pyzx-pivot.json", generate_pivot())):
        if len(cases) < CASES_PER_RULE:
            raise SystemExit(f"Only generated {len(cases)} cases for {name}; expected {CASES_PER_RULE}.")
        payload = {
            "generated_by": "scripts/generate-pyzx-fixtures.py",
            "pyzx_version": version,
            "note": (
                "Golden reference from PyZX, the reference implementation of these rewrites. Evidence "
                "from generation time rather than a live check -- regenerate with the script to confirm "
                "the agreement still holds against a current PyZX."
            ),
            "cases": cases,
        }
        (FIXTURES / name).write_text(json.dumps(payload, indent=2) + "\n")
        print(f"wrote {name}: {len(cases)} cases from pyzx {version}")


if __name__ == "__main__":
    main()
