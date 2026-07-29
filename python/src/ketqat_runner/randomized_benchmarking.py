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


# --- Interleaved RB (ketqat-sdk#133) ----------------------------------------
#
# Interleaved RB isolates one gate's error by running RB twice: once normally,
# once with the target gate inserted after every random Clifford. The reference
# decay cancels the Cliffords' error, and the ratio leaves the target.
#
# One thing must be said plainly about what it can show *here*. This engine's
# noise model applies the same depolarizing channel to every gate, so every gate
# has identical error by construction. Interleaved RB therefore returns the same
# value whichever gate is interleaved -- verified across i, x, y, z, h and s,
# which agree to within fit noise.
#
# That makes this a check of the protocol, not a way to find a bad gate: there
# are no bad gates in this noise model to find. It becomes diagnostic the moment
# a per-gate noise model exists, and the implementation needs no change for
# that. Measured against the analytic per-application error (d-1)/d * (1 -
# lambda), it agrees to within 2 percent at p=0.01, widening to 12 percent at
# p=0.002 where shot noise dominates.


#: Gates that can be interleaved, as Stim circuit instructions.
#:
#: Restricted to Cliffords: interleaved RB requires the interleaved gate to be
#: in the group being benchmarked, or the sequence no longer inverts and the
#: protocol measures nothing.
INTERLEAVABLE_GATES: dict[str, str] = {
    "i": "I",
    "x": "X",
    "y": "Y",
    "z": "Z",
    "h": "H",
    "s": "S",
}


def build_interleaved_sequence(
    qubits: int, length: int, depolarizing_rate: float, seed: int, gate: str
) -> "Any":
    """An RB sequence with `gate` interleaved after every random Clifford.

    The inverse is computed from the composed tableau *including* the
    interleaved gates, so the sequence still returns to the initial state
    exactly. Inverting only the random Cliffords would leave the interleaved
    gates uncancelled, and the decay would measure that residue rather than the
    gate's error.
    """
    import numpy as np
    import stim

    if gate not in INTERLEAVABLE_GATES:
        raise ValueError(
            f"{gate!r} is not interleavable here. Interleaved RB requires the gate to be in the "
            f"group being benchmarked; available: {', '.join(sorted(INTERLEAVABLE_GATES))}."
        )

    group = clifford_group(qubits)
    rng = np.random.default_rng(seed)
    circuit = stim.Circuit()
    composed = stim.Tableau(qubits)
    channel = "DEPOLARIZE1" if qubits == 1 else "DEPOLARIZE2"

    interleaved_name = INTERLEAVABLE_GATES[gate]
    interleaved_circuit = stim.Circuit()
    interleaved_circuit.append(interleaved_name, list(range(qubits)))
    interleaved_tableau = stim.Tableau.from_circuit(interleaved_circuit)

    for index in rng.integers(0, len(group), size=length):
        element = group[int(index)]
        composed = composed.then(element)
        circuit += element.to_circuit(method="elimination")
        if depolarizing_rate > 0:
            circuit.append(channel, list(range(qubits)), depolarizing_rate)

        composed = composed.then(interleaved_tableau)
        circuit += interleaved_circuit
        if depolarizing_rate > 0:
            circuit.append(channel, list(range(qubits)), depolarizing_rate)

    circuit += (composed**-1).to_circuit(method="elimination")
    circuit.append("M", list(range(qubits)))
    return circuit


def interleaved_survival(
    *,
    qubits: int,
    length: int,
    depolarizing_rate: float,
    sequences: int,
    shots: int,
    seed: int,
    gate: str,
) -> dict[str, Any]:
    """Survival for the interleaved variant, averaged over sequences."""
    import numpy as np

    per_sequence: list[float] = []
    for index in range(sequences):
        sequence_seed = _derive_sequence_seed(seed, length, index)
        circuit = build_interleaved_sequence(qubits, length, depolarizing_rate, sequence_seed, gate)
        samples = circuit.compile_sampler(seed=sequence_seed).sample(shots=shots)
        per_sequence.append(float(np.mean(~np.any(samples, axis=1))))

    mean = float(np.mean(per_sequence))
    standard_error = (
        float(np.std(per_sequence, ddof=1) / math.sqrt(sequences)) if sequences > 1 else float("nan")
    )
    return {
        "sequence_length": length,
        "survival_probability": mean,
        "standard_error": standard_error,
        "sequences": sequences,
        "shots": shots,
    }


def interleaved_gate_error(
    reference_decay: float, interleaved_decay: float, qubits: int
) -> dict[str, Any]:
    """Isolate one gate's error from the two decays.

    r = (d-1)/d * (1 - lambda_interleaved / lambda_reference). The reference
    cancels the error of the random Cliffords, leaving the interleaved gate.

    The systematic bound is reported and is not decoration. Interleaved RB is
    known to carry a systematic uncertainty that can be comparable to the
    estimate itself when the gate error is small, because the protocol assumes
    the noise is gate-independent and it never exactly is. An estimate quoted
    without it looks far more precise than the method supports.
    """
    dimension = 2**qubits
    if reference_decay <= 0:
        return {
            "inconclusive": True,
            "reason": "The reference decay is not positive, so the ratio it anchors is undefined.",
        }

    ratio = interleaved_decay / reference_decay
    error = (dimension - 1) / dimension * (1 - ratio)

    # Magesan et al.'s systematic bound on the interleaved estimate.
    bound = min(
        (dimension - 1)
        * (abs(reference_decay - ratio * reference_decay) + (1 - reference_decay))
        / dimension,
        2 * (dimension * dimension - 1) * (1 - reference_decay) / (reference_decay * dimension * dimension)
        + 4 * math.sqrt(1 - reference_decay) * math.sqrt(dimension * dimension - 1) / reference_decay,
    )

    return {
        "inconclusive": False,
        "gate_error": error,
        "decay_ratio": ratio,
        "reference_decay": reference_decay,
        "interleaved_decay": interleaved_decay,
        "systematic_bound": bound,
        # Said plainly, because this is the number that gets quoted alone.
        "interpretation": (
            f"Gate error {error:.6f}, with a systematic bound of +/-{bound:.6f} from the "
            "gate-independence assumption. When the bound is comparable to the estimate, this "
            "protocol has not resolved the gate error -- it has bounded it."
        ),
    }


# --- Simultaneous RB (ketqat-sdk#137) ---------------------------------------
#
# Interleaved RB could not distinguish gates here, because this engine gives
# every gate the same error. Simultaneous RB can show a real difference, because
# the thing it measures -- addressability -- is a property of running two qubits
# *together*, and the crosstalk channel from ketqat-sdk#112 creates exactly that.
#
# Each qubit runs its own independent RB sequence. Run alone, a qubit sees only
# its own gate error. Run alongside a neighbour, it also sees whatever the
# neighbour's activity does to it. The difference in decay is the addressability
# error, and it is zero when the qubits are genuinely independent.


def _append_on_qubit(circuit: "Any", source: "Any", qubit: int) -> None:
    """Copy a single-qubit circuit onto `qubit`, respecting Stim's fusion.

    `to_circuit` fuses repeated gates: `S` with three targets means S applied
    three times, emitted as one instruction. Appending once per *instruction*
    rather than once per *target* silently drops the repeats, and the sequence
    then fails to invert -- while still producing a plausible decay. This is the
    same fusion that made counting DEPOLARIZE2 instructions undercount by 12x in
    ketqat-sdk#112.
    """
    for instruction in source:
        # Once per target, because the target count *is* the repetition count
        # under Stim's fusion. Written as a range rather than a loop over the
        # targets themselves: the targets are all qubit 0 and carry no
        # information here, only their number does.
        for _ in range(len(instruction.targets_copy())):
            circuit.append(instruction.name, [qubit])


def build_simultaneous_sequence(
    length: int, depolarizing_rate: float, seed: int, crosstalk_rate: float = 0.0
) -> "Any":
    """Two independent single-qubit RB sequences, run at the same time.

    Independent is the operative word: each qubit draws its own Cliffords and
    its own inverse. Driving both with the same sequence would make them
    correlated and the comparison meaningless -- any difference would then be
    the correlation, not the crosstalk.
    """
    import numpy as np
    import stim

    group = clifford_group(1)
    circuit = stim.Circuit()
    composed = [stim.Tableau(1), stim.Tableau(1)]
    # Separate generators per qubit, so neither sequence depends on the other's
    # draws and adding a qubit does not renumber the first one's.
    rngs = [np.random.default_rng(seed), np.random.default_rng(seed ^ 0x9E3779B9)]

    for step in range(length):
        for qubit in (0, 1):
            index = int(rngs[qubit].integers(0, len(group)))
            element = group[index]
            composed[qubit] = composed[qubit].then(element)
            # `to_circuit` emits on qubit 0; shift it onto the target.
            _append_on_qubit(circuit, element.to_circuit(method="elimination"), qubit)
        if depolarizing_rate > 0:
            circuit.append("DEPOLARIZE1", [0, 1], depolarizing_rate)
        if crosstalk_rate > 0:
            # Correlated error between the two qubits while both are driven.
            # This is what "addressability" means: acting on one disturbs the
            # other.
            circuit.append("DEPOLARIZE2", [0, 1], crosstalk_rate)

    for qubit in (0, 1):
        _append_on_qubit(circuit, (composed[qubit] ** -1).to_circuit(method="elimination"), qubit)
    circuit.append("M", [0, 1])
    return circuit


def build_isolated_sequence(
    length: int, depolarizing_rate: float, seed: int, qubit: int
) -> "Any":
    """One qubit's sequence from the simultaneous pair, run on its own.

    Uses the same draws as `build_simultaneous_sequence` for that qubit, so the
    comparison isolates the neighbour's presence rather than a different random
    sequence. Comparing against a freshly drawn sequence would fold sequence
    variation into the addressability estimate.
    """
    import numpy as np
    import stim

    group = clifford_group(1)
    circuit = stim.Circuit()
    composed = stim.Tableau(1)
    rng = np.random.default_rng(seed if qubit == 0 else seed ^ 0x9E3779B9)

    for _ in range(length):
        element = group[int(rng.integers(0, len(group)))]
        composed = composed.then(element)
        circuit += element.to_circuit(method="elimination")
        if depolarizing_rate > 0:
            circuit.append("DEPOLARIZE1", [0], depolarizing_rate)

    circuit += (composed**-1).to_circuit(method="elimination")
    circuit.append("M", [0])
    return circuit


def simultaneous_survival(
    *,
    length: int,
    depolarizing_rate: float,
    sequences: int,
    shots: int,
    seed: int,
    crosstalk_rate: float = 0.0,
) -> dict[str, Any]:
    """Per-qubit survival when both qubits are driven together."""
    import numpy as np

    per_qubit: list[list[float]] = [[], []]
    for index in range(sequences):
        sequence_seed = _derive_sequence_seed(seed, length, index)
        circuit = build_simultaneous_sequence(length, depolarizing_rate, sequence_seed, crosstalk_rate)
        samples = circuit.compile_sampler(seed=sequence_seed).sample(shots=shots)
        for qubit in (0, 1):
            per_qubit[qubit].append(float(np.mean(~samples[:, qubit])))

    return {
        "sequence_length": length,
        "survival_probability": float(np.mean([np.mean(q) for q in per_qubit])),
        "per_qubit": [float(np.mean(q)) for q in per_qubit],
        "sequences": sequences,
        "shots": shots,
    }


def isolated_survival(
    *, length: int, depolarizing_rate: float, sequences: int, shots: int, seed: int, qubit: int
) -> dict[str, Any]:
    """The same qubit's survival with its neighbour idle."""
    import numpy as np

    values: list[float] = []
    for index in range(sequences):
        sequence_seed = _derive_sequence_seed(seed, length, index)
        circuit = build_isolated_sequence(length, depolarizing_rate, sequence_seed, qubit)
        samples = circuit.compile_sampler(seed=sequence_seed).sample(shots=shots)
        values.append(float(np.mean(~samples[:, 0])))

    return {
        "sequence_length": length,
        "survival_probability": float(np.mean(values)),
        "sequences": sequences,
        "shots": shots,
    }


def addressability_error(isolated_decay: float, simultaneous_decay: float) -> dict[str, Any]:
    """How much worse a qubit does because its neighbour is being driven.

    Zero when the qubits are genuinely independent, which is the property that
    makes a non-zero value mean something. Reported as a difference in error
    rather than a ratio, because the quantity of interest is the *added* error
    and a ratio hides how large it is relative to the gate error itself.
    """
    isolated_error = 0.5 * (1 - isolated_decay)
    simultaneous_error = 0.5 * (1 - simultaneous_decay)
    added = simultaneous_error - isolated_error

    return {
        "isolated_error_per_clifford": isolated_error,
        "simultaneous_error_per_clifford": simultaneous_error,
        "addressability_error": added,
        "interpretation": (
            f"Driving the neighbour adds {added:.6f} error per Clifford "
            f"({isolated_error:.6f} alone, {simultaneous_error:.6f} together). "
            "A value consistent with zero means the qubits are independent at this noise level, "
            "not that crosstalk is impossible."
        ),
    }
