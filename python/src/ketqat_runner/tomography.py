"""Single-qubit state tomography by linear inversion (ketqat-sdk#145).

Reconstructing a state from measurements is the last named piece of item 9, and
it is the one where the honest answer is most often "this reconstruction is not
a state".

Linear inversion is the textbook estimator: measure <X>, <Y> and <Z>, and build
`rho = (I + <X>X + <Y>Y + <Z>Z) / 2`. It is unbiased and it has a defect that
matters more than its bias: **from finite statistics it routinely returns a
matrix with a negative eigenvalue**, which is not a density matrix and cannot
describe any physical system.

That happens most often exactly where tomography is most interesting -- near a
pure state, where the true Bloch vector has length 1 and shot noise pushes the
estimate past it. A reconstruction of a near-pure state is *more* likely to be
unphysical than one of a mixed state, not less.

So this reports physicality rather than quietly projecting onto the nearest
valid state. Projection is a defensible choice, but it is a choice that changes
the estimate, and a caller told only the projected matrix cannot tell a clean
measurement from one that needed rescuing.
"""

from __future__ import annotations

import math
from typing import Any


#: Bloch vectors longer than this cannot come from a physical state.
PHYSICAL_LENGTH_TOLERANCE = 1e-9


def bloch_from_counts(
    x_counts: tuple[int, int], y_counts: tuple[int, int], z_counts: tuple[int, int]
) -> dict[str, float]:
    """Bloch components from (zeros, ones) counts in each measurement basis.

    Each expectation is `(n0 - n1) / (n0 + n1)`, and its standard error is the
    binomial one. Reporting the error alongside is what lets a caller tell an
    unphysical *estimate* from an unphysical *state*: the first is shot noise
    and the second would be a broken experiment.
    """
    def expectation(counts: tuple[int, int]) -> tuple[float, float]:
        zeros, ones = counts
        total = zeros + ones
        if total <= 0:
            raise ValueError("A measurement basis with no shots cannot be inverted.")
        value = (zeros - ones) / total
        # Standard error of a +/-1 valued mean from `total` samples.
        variance = max(0.0, 1 - value * value) / total
        return value, math.sqrt(variance)

    x, x_error = expectation(x_counts)
    y, y_error = expectation(y_counts)
    z, z_error = expectation(z_counts)

    return {
        "x": x,
        "y": y,
        "z": z,
        "x_standard_error": x_error,
        "y_standard_error": y_error,
        "z_standard_error": z_error,
    }


def reconstruct_state(bloch: dict[str, float]) -> dict[str, Any]:
    """Build the density matrix and say whether it is one.

    Returns the raw linear-inversion estimate always, and a physicality verdict
    beside it. The raw estimate is kept even when unphysical because discarding
    it would hide how far outside the state space the data landed, which is the
    quantity that tells someone whether to take more shots.
    """
    x = bloch["x"]
    y = bloch["y"]
    z = bloch["z"]
    length = math.sqrt(x * x + y * y + z * z)

    # rho = (I + x X + y Y + z Z) / 2, written out.
    rho = [
        [complex((1 + z) / 2, 0), complex(x / 2, -y / 2)],
        [complex(x / 2, y / 2), complex((1 - z) / 2, 0)],
    ]

    # Eigenvalues of a one-qubit density matrix are (1 +/- |r|) / 2.
    eigenvalues = [(1 + length) / 2, (1 - length) / 2]
    physical = length <= 1 + PHYSICAL_LENGTH_TOLERANCE
    purity = (1 + length * length) / 2

    result: dict[str, Any] = {
        "density_matrix": rho,
        "bloch_length": length,
        "eigenvalues": eigenvalues,
        "purity": purity,
        "physical": physical,
        "trace": rho[0][0].real + rho[1][1].real,
    }

    if not physical:
        result["reason"] = (
            f"The reconstructed Bloch vector has length {length:.6f}, which exceeds 1, so the "
            f"smaller eigenvalue is {eigenvalues[1]:.6f} and the matrix is not a density matrix. "
            "Linear inversion does this routinely near a pure state, where shot noise pushes the "
            "estimate past the state space. It is a statement about the estimator and the shot "
            "count, not about the device -- take more shots, or use a maximum-likelihood estimator "
            "that is constrained to physical states. The raw estimate is returned unchanged rather "
            "than projected, so the size of the excursion stays visible."
        )

    return result


def fidelity_with_pure_state(
    bloch: dict[str, float], target: tuple[float, float, float]
) -> float:
    """Fidelity between the reconstruction and a pure target Bloch vector.

    For one qubit, F = (1 + r . t) / 2 when the target is pure. Exactly 1 when
    the reconstruction equals the target, which is the property the tests anchor
    on -- a tomography routine that could not recover a state it was handed
    would be measuring something else.
    """
    length = math.sqrt(sum(component * component for component in target))
    if abs(length - 1) > 1e-9:
        raise ValueError(f"The target must be a pure state, but its Bloch length is {length}.")

    overlap = bloch["x"] * target[0] + bloch["y"] * target[1] + bloch["z"] * target[2]
    return (1 + overlap) / 2
