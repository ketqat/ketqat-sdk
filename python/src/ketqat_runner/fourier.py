"""The quantum Fourier transform as a reusable, separately checkable primitive
(ketqat-sdk#149).

An inverse QFT already existed, but private to `phase_estimation`, where it is
only ever exercised through phase estimation's own output. That is a weak place
to test it: phase estimation can look right while the transform is subtly wrong,
because the two errors that matter most -- a sign convention and a bit order --
are invisible when the input is a phase-kickback state and the output is read as
"the most likely integer".

Pulling it out allows the check that actually pins it down. **The QFT is the
discrete Fourier transform**, so the circuit can be compared against a DFT matrix
built directly from its definition. That is a differential test against an
independent implementation, not self-consistency: the circuit is a sequence of
Hadamards and controlled rotations, the matrix is one line of arithmetic, and
there is no shared code or shared assumption that could make both wrong the same
way.

The convention here is fixed and verified rather than assumed, because it is the
detail that silently breaks callers:

    QFT |j> = (1/sqrt(N)) * sum_k exp(+2*pi*i*j*k/N) |k>

little-endian, so qubit 0 carries the least significant bit -- matching the rest
of this package. The inverse carries the opposite sign.
"""

from __future__ import annotations

import cmath
import math

MAX_QFT_QUBITS = 16


class FourierError(ValueError):
    """A transform that could not be applied as specified."""


def _bit_reverse(state: list[complex], qubits: int) -> None:
    """Reverse qubit order in place.

    The bare QFT circuit leaves its output with the bits reversed. Applying the
    swaps here rather than leaving them to the caller is what makes this
    primitive match the DFT definition -- the single most common way a
    hand-rolled QFT ends up transposed.
    """
    for qubit in range(qubits // 2):
        partner = qubits - 1 - qubit
        for index in range(1 << qubits):
            mirrored = index ^ ((1 << qubit) | (1 << partner))
            if index < mirrored and (((index >> qubit) & 1) != ((index >> partner) & 1)):
                state[index], state[mirrored] = state[mirrored], state[index]


def apply_qft(state: list[complex], qubits: int, *, inverse: bool = False) -> None:
    """Apply the QFT (or its inverse) to `state` in place, as gates.

    Applied as the real gate sequence rather than by multiplying a precomputed
    matrix, so what runs here is the circuit a device would run. The matrix in
    `dft_matrix` exists to check this, not to replace it.
    """
    if qubits < 1:
        raise FourierError(f"A transform needs at least one qubit, not {qubits}.")
    if qubits > MAX_QFT_QUBITS:
        raise FourierError(
            f"{qubits} qubits is {1 << qubits} amplitudes; this simulator refuses rather than approximating."
        )
    if len(state) != 1 << qubits:
        raise FourierError(f"A {qubits}-qubit state needs {1 << qubits} amplitudes, got {len(state)}.")

    sign = -1.0 if inverse else 1.0
    inverse_root_two = 1 / math.sqrt(2)

    # Forward runs high qubit to low; the inverse runs low to high. An inverse
    # is the adjoint gates in the *opposite order*, not merely the same order
    # with negated angles -- and negating the angles alone produces a transform
    # that is still exactly right on one qubit and wrong on every wider input,
    # which is precisely how this error survives a narrow test.
    order = range(qubits) if inverse else range(qubits - 1, -1, -1)

    if inverse:
        _bit_reverse(state, qubits)

    for target in order:
        controls = range(target) if inverse else range(target)
        if inverse:
            for control in controls:
                angle = sign * math.pi / (1 << (target - control))
                factor = cmath.exp(1j * angle)
                control_bit, target_bit = 1 << control, 1 << target
                for index in range(1 << qubits):
                    if (index & control_bit) and (index & target_bit):
                        state[index] *= factor

        stride = 1 << target
        for block in range(0, 1 << qubits, stride << 1):
            for offset in range(stride):
                index = block + offset
                partner = index + stride
                a, b = state[index], state[partner]
                state[index] = (a + b) * inverse_root_two
                state[partner] = (a - b) * inverse_root_two

        if not inverse:
            for control in controls:
                angle = sign * math.pi / (1 << (target - control))
                factor = cmath.exp(1j * angle)
                control_bit, target_bit = 1 << control, 1 << target
                for index in range(1 << qubits):
                    if (index & control_bit) and (index & target_bit):
                        state[index] *= factor

    if not inverse:
        _bit_reverse(state, qubits)


def dft_matrix(size: int, *, inverse: bool = False) -> list[list[complex]]:
    """The discrete Fourier transform, straight from its definition.

    Deliberately naive and deliberately shares nothing with `apply_qft`. Its
    only job is to be obviously correct, so that agreement between the two is
    evidence about the circuit rather than about a shared helper.
    """
    sign = -1.0 if inverse else 1.0
    scale = 1 / math.sqrt(size)
    return [
        [scale * cmath.exp(sign * 2j * math.pi * row * column / size) for column in range(size)]
        for row in range(size)
    ]


def apply_dft(state: list[complex], *, inverse: bool = False) -> list[complex]:
    """Reference transform by direct matrix multiplication."""
    matrix = dft_matrix(len(state), inverse=inverse)
    return [sum(matrix[row][column] * state[column] for column in range(len(state))) for row in range(len(state))]
