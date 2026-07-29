"""Clifford randomized benchmarking, executed exactly with Stim.

RB is a Clifford-only protocol, which is why it belongs on this stack at all:
Stim simulates Clifford circuits exactly and in polynomial time, so these are
not approximations of RB but the protocol itself, run on a simulated device.

What RB reports is a *decay parameter* fitted across sequence lengths, not a
success probability at one setting. That is why it is its own domain rather
than an algorithm family -- an algorithm result has nowhere to put a fit or its
uncertainty.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any


#: Sequence lengths must span enough decay to fit. A set clustered at short
#: lengths fits a line to shot noise and reports a confident wrong answer.
MIN_DISTINCT_POINTS_FOR_FIT = 3


def _derive_sequence_seed(global_seed: int, length: int, index: int) -> int:
    """One seed per (length, sequence index).

    Derived rather than sequential so that adding a sequence length to a
    manifest does not renumber the sequences at every other length, which would
    silently change results that were meant to be untouched.
    """
    payload = f"{global_seed}|{length}|{index}"
    return int.from_bytes(hashlib.sha256(payload.encode("utf-8")).digest()[:8], "big") % (2**32)


#: Known orders of the Clifford group modulo global phase. Enumeration is
#: checked against these, which is a real correctness test and not a formality:
#: a wrong generator set or a wrong composition almost never lands on the exact
#: order by accident.
CLIFFORD_GROUP_ORDERS: dict[int, int] = {1: 24, 2: 11520}

_GROUP_CACHE: dict[int, list["Any"]] = {}


def clifford_group(qubits: int) -> list["Any"]:
    """Every Clifford on `qubits` qubits, enumerated once and cached.

    RB requires *uniform* sampling from the Clifford group. `stim.Tableau.random`
    cannot be used for it here: it takes no seed and draws from global state, so
    two runs of the same manifest produced different results and different
    reproducibility hashes. Sampling an index into the enumerated group with a
    seeded generator is both exactly uniform and reproducible.

    Building a "random" Clifford from a fixed-depth product of generators would
    be neither -- that distribution is not uniform over the group, and RB's
    theory rests on the uniformity.
    """
    import stim

    cached = _GROUP_CACHE.get(qubits)
    if cached is not None:
        return cached

    if qubits not in CLIFFORD_GROUP_ORDERS:
        raise ValueError(f"Clifford enumeration is defined for 1 and 2 qubits, not {qubits}.")

    def generator(build: "Any") -> "Any":
        circuit = stim.Circuit()
        build(circuit)
        # Force the tableau to span every qubit; a single-qubit gate otherwise
        # yields a one-qubit tableau that cannot compose with the rest.
        circuit.append("I", [qubits - 1])
        return stim.Tableau.from_circuit(circuit)

    generators = []
    for qubit in range(qubits):
        for name in ("H", "S"):
            generators.append(generator(lambda c, n=name, q=qubit: c.append(n, [q])))
    for control in range(qubits):
        for target in range(qubits):
            if control != target:
                generators.append(
                    generator(lambda c, a=control, b=target: c.append("CX", [a, b]))
                )

    identity = stim.Tableau(qubits)
    seen = {str(identity): identity}
    frontier = [identity]
    while frontier:
        nxt = []
        for element in frontier:
            for gate in generators:
                product = element.then(gate)
                key = str(product)
                if key not in seen:
                    seen[key] = product
                    nxt.append(product)
        frontier = nxt

    group = list(seen.values())
    expected = CLIFFORD_GROUP_ORDERS[qubits]
    if len(group) != expected:
        raise RuntimeError(
            f"Clifford enumeration produced {len(group)} elements for {qubits} qubit(s), "
            f"expected {expected}. The sampling would not be uniform."
        )

    # Sorted so the index-to-element mapping does not depend on set iteration
    # order, which would make seeds mean different things across runs.
    group.sort(key=str)
    _GROUP_CACHE[qubits] = group
    return group


def build_sequence(qubits: int, length: int, depolarizing_rate: float, seed: int) -> "Any":
    """One RB sequence: `length` uniform random Cliffords, then the exact inverse.

    The inverse is computed from the composed tableau rather than by inverting
    each gate in reverse, which is the same thing mathematically and far less
    error-prone in practice.

    With no noise this returns the initial state with probability 1 exactly, not
    approximately -- which is the property the noiseless test pins.
    """
    import numpy as np
    import stim

    group = clifford_group(qubits)
    rng = np.random.default_rng(seed)
    circuit = stim.Circuit()
    composed = stim.Tableau(qubits)
    channel = "DEPOLARIZE1" if qubits == 1 else "DEPOLARIZE2"

    for index in rng.integers(0, len(group), size=length):
        gate = group[int(index)]
        composed = composed.then(gate)
        circuit += gate.to_circuit(method="elimination")
        if depolarizing_rate > 0:
            circuit.append(channel, list(range(qubits)), depolarizing_rate)

    circuit += (composed**-1).to_circuit(method="elimination")
    circuit.append("M", list(range(qubits)))
    return circuit


def survival_probability(
    *, qubits: int, length: int, depolarizing_rate: float, sequences: int, shots: int, seed: int
) -> dict[str, Any]:
    """Average survival over independent random sequences.

    RB averages over sequences *and* shots. Shots alone measure one particular
    sequence very precisely, which is not the quantity RB is defined to report:
    the average over the Clifford group. The standard error therefore combines
    both, taken across sequence means rather than across raw shots.
    """
    import numpy as np

    per_sequence: list[float] = []
    for index in range(sequences):
        circuit = build_sequence(
            qubits, length, depolarizing_rate, _derive_sequence_seed(seed, length, index)
        )
        samples = circuit.compile_sampler(
            seed=_derive_sequence_seed(seed, length, index)
        ).sample(shots=shots)
        # Survival means every measured qubit returned 0.
        per_sequence.append(float(np.mean(~np.any(samples, axis=1))))

    mean = float(np.mean(per_sequence))
    if sequences > 1:
        standard_error = float(np.std(per_sequence, ddof=1) / math.sqrt(sequences))
    else:
        # One sequence carries no sequence-to-sequence information. Reporting
        # the shot-noise error alone would understate the uncertainty of the
        # quantity RB actually defines.
        standard_error = float("nan")

    return {
        "sequence_length": length,
        "survival_probability": mean,
        "standard_error": standard_error,
        "sequences": sequences,
        "shots": shots,
    }


def fit_decay(points: list[dict[str, Any]], qubits: int) -> dict[str, Any]:
    """Fit S(m) = A*lambda^m + B with B fixed at 1/d.

    B is fixed rather than fitted because a three-parameter fit to a handful of
    noisy points is underdetermined and will happily return a decay parameter
    with no physical meaning. Fixing the asymptote at the fully depolarized
    value is the standard choice and is stated here rather than assumed.

    Returns `inconclusive` rather than a number when the data cannot support a
    fit. A protocol that always returns an error rate is more dangerous than one
    that sometimes declines to.
    """
    import numpy as np

    dimension = 2**qubits
    asymptote = 1.0 / dimension

    usable = [p for p in points if p["survival_probability"] > asymptote]
    if len(usable) < MIN_DISTINCT_POINTS_FOR_FIT:
        return {
            "inconclusive": True,
            "reason": (
                f"only {len(usable)} of {len(points)} sequence lengths stayed above the "
                f"depolarized floor of {asymptote:.4f}; a decay cannot be fitted through them"
            ),
        }

    lengths = np.array([p["sequence_length"] for p in usable], dtype=float)
    excess = np.array([p["survival_probability"] - asymptote for p in usable], dtype=float)

    # Linearise: log(S - B) = log A + m log(lambda). Weighted by the excess,
    # because the log transform inflates the influence of points near the floor
    # where the relative error is largest.
    weights = excess**2
    log_excess = np.log(excess)
    design = np.vstack([np.ones_like(lengths), lengths]).T
    weighted = design * weights[:, None]
    coefficients, *_ = np.linalg.lstsq(weighted.T @ design, weighted.T @ log_excess, rcond=None)
    intercept, slope = float(coefficients[0]), float(coefficients[1])

    decay = math.exp(slope)
    if not 0 < decay < 1:
        return {
            "inconclusive": True,
            "reason": f"fitted decay parameter {decay:.6g} is outside (0, 1) and is not a decay",
        }

    residuals = log_excess - design @ coefficients
    degrees_of_freedom = len(usable) - 2
    if degrees_of_freedom > 0:
        variance = float(np.sum(weights * residuals**2) / np.sum(weights)) * (
            len(usable) / degrees_of_freedom
        )
        spread = float(np.sqrt(np.sum(weights * (lengths - np.average(lengths, weights=weights)) ** 2)))
        slope_error = math.sqrt(variance) / spread if spread > 0 else float("nan")
    else:
        slope_error = float("nan")

    error_per_clifford = (dimension - 1) / dimension * (1 - decay)

    return {
        "inconclusive": False,
        "decay_parameter": decay,
        "decay_parameter_standard_error": decay * slope_error if slope_error == slope_error else None,
        "error_per_clifford": error_per_clifford,
        "error_per_clifford_standard_error": (
            (dimension - 1) / dimension * decay * slope_error if slope_error == slope_error else None
        ),
        "amplitude": math.exp(intercept),
        "asymptote": asymptote,
        "asymptote_is_fixed": True,
        "fitted_points": len(usable),
        "excluded_points": len(points) - len(usable),
        "model": "S(m) = A * lambda^m + 1/d, with 1/d fixed",
        # Stated because it is the most common way to over-read an RB number.
        "uncertainty_scope": (
            "statistical only; excludes error from the single-exponential model being wrong, "
            "which dominates when gate errors are not gate-independent"
        ),
    }
