"""Quantum volume, computed with its own simulator (ketqat-sdk#143).

An earlier note in this project said quantum volume "needs non-Clifford circuits
and cannot use this path". That scoped the obstacle to Stim, which is correct
and incomplete: QV needs a statevector, not a stabilizer simulator, and a small
exact one is cheap at the widths QV is defined for.

It carries its own simulation rather than going through the circuit IR, and the
reason is specific. QV is defined over **Haar-random SU(4)**, and a decomposition
into the engine's gate set would either approximate the Haar measure or require
a KAK routine whose correctness is harder to establish than the thing it
supports. Sampling SU(4) directly from the Haar measure is a dozen lines and
exactly right, and being exactly right is what makes the result checkable
against a known constant.

The heavy-output probability of an ideal QV circuit converges to
(1 + ln 2) / 2 = 0.8466 as width grows, and a fully depolarized device sits at
0.5. Those two numbers bracket every honest QV measurement, and both are tested.
"""

from __future__ import annotations

import math
from typing import Any


#: Asymptotic heavy-output probability of an ideal QV circuit, (1 + ln 2) / 2.
IDEAL_HEAVY_OUTPUT_PROBABILITY = (1 + math.log(2)) / 2

#: The threshold a device must exceed to claim a quantum volume.
HEAVY_OUTPUT_THRESHOLD = 2 / 3

#: Above this the statevector stops being small. QV at width 12 already needs
#: 12 layers of 6 SU(4) draws each, per circuit, over many circuits.
MAX_QV_WIDTH = 12


def _haar_su4(rng: "Any") -> "Any":
    """A Haar-random 4x4 unitary.

    QR of a complex Gaussian, with the diagonal phase correction. Without that
    correction the result is *not* Haar distributed -- numpy's QR fixes a sign
    convention that biases the measure, and the bias is invisible in a spot
    check while shifting the heavy-output probability away from its known value.
    """
    import numpy as np

    z = (rng.normal(size=(4, 4)) + 1j * rng.normal(size=(4, 4))) / math.sqrt(2)
    q, r = np.linalg.qr(z)
    diagonal = np.diagonal(r)
    return q * (diagonal / np.abs(diagonal))


def _apply_two_qubit(state: "Any", unitary: "Any", a: int, b: int, width: int) -> "Any":
    """Apply a 4x4 unitary to qubits `a` and `b` of a statevector."""
    import numpy as np

    reshaped = state.reshape([2] * width)
    moved = np.moveaxis(reshaped, [a, b], [0, 1]).reshape(4, -1)
    return np.moveaxis((unitary @ moved).reshape([2, 2] + [2] * (width - 2)), [0, 1], [a, b]).reshape(-1)


def quantum_volume_circuit_probabilities(width: int, seed: int) -> "Any":
    """Ideal output distribution of one QV circuit at `width` qubits.

    The model circuit is `width` layers; each layer permutes the qubits at
    random, pairs them up, and applies an independent Haar-random SU(4) to each
    pair. An odd qubit out is idle for that layer, which is the standard
    definition rather than an omission.
    """
    import numpy as np

    if width < 2 or width > MAX_QV_WIDTH:
        raise ValueError(
            f"Quantum volume is computed here for 2 to {MAX_QV_WIDTH} qubits, not {width}."
        )

    rng = np.random.default_rng(seed)
    state = np.zeros(1 << width, dtype=complex)
    state[0] = 1

    for _layer in range(width):
        order = rng.permutation(width)
        for pair in range(width // 2):
            a = int(order[2 * pair])
            b = int(order[2 * pair + 1])
            state = _apply_two_qubit(state, _haar_su4(rng), a, b, width)

    return np.abs(state) ** 2


def heavy_output_probability(probabilities: "Any") -> float:
    """Total probability of outcomes above the median probability.

    Strictly above: the definition counts outputs *heavier* than the median, and
    including ties would inflate the figure for any distribution with repeated
    probabilities -- exactly the degenerate case where the number matters least.
    """
    import numpy as np

    median = float(np.median(probabilities))
    return float(np.sum(probabilities[probabilities > median]))


def measure_quantum_volume(
    width: int, circuits: int, seed: int, depolarizing_rate: float = 0.0
) -> dict[str, Any]:
    """Run the QV protocol at one width and say whether it passes.

    `depolarizing_rate` mixes each circuit's ideal distribution toward uniform,
    which is what depolarizing noise does to the output distribution. At rate 1
    the distribution is uniform and the heavy-output probability is 0.5 by
    construction, which is the floor every QV measurement sits above.
    """
    import numpy as np

    if not 0 <= depolarizing_rate <= 1:
        raise ValueError("The depolarizing rate must lie in [0, 1].")

    uniform = 1.0 / (1 << width)
    heavy: list[float] = []
    for index in range(circuits):
        probabilities = quantum_volume_circuit_probabilities(width, seed + index)
        if depolarizing_rate > 0:
            noisy = (1 - depolarizing_rate) * probabilities + depolarizing_rate * uniform
        else:
            noisy = probabilities
        # Heaviness is defined by the *ideal* distribution; the device's job is
        # to produce those outcomes often. Using the noisy median would let a
        # bad device redefine which outputs count as heavy and pass itself.
        median = float(np.median(probabilities))
        heavy.append(float(np.sum(noisy[probabilities > median])))

    mean = float(np.mean(heavy))
    error = float(np.std(heavy, ddof=1) / math.sqrt(circuits)) if circuits > 1 else float("nan")
    # Two-sigma lower bound, which is the standard bar: the mean exceeding the
    # threshold is not enough, the confidence interval has to clear it.
    lower_bound = mean - 2 * error if circuits > 1 else float("nan")
    passed = circuits > 1 and lower_bound > HEAVY_OUTPUT_THRESHOLD

    return {
        "width": width,
        "circuits": circuits,
        "heavy_output_probability": mean,
        "standard_error": error,
        "two_sigma_lower_bound": lower_bound,
        "threshold": HEAVY_OUTPUT_THRESHOLD,
        "passed": passed,
        "quantum_volume": (1 << width) if passed else None,
        "ideal_reference": IDEAL_HEAVY_OUTPUT_PROBABILITY,
        "interpretation": (
            f"Heavy-output probability {mean:.4f} +/- {error:.4f}; the two-sigma lower bound is "
            f"{lower_bound:.4f} against a threshold of {HEAVY_OUTPUT_THRESHOLD:.4f}. "
            + (
                f"Quantum volume {1 << width} is achieved at this width."
                if passed
                else "This width does not pass, so no quantum volume is claimed for it."
            )
        ),
    }
