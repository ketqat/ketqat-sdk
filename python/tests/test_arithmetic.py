"""Tests for the ripple-carry adder (ketqat-sdk#147)."""

from __future__ import annotations

import pytest

from ketqat_runner.arithmetic import (
    AdderError,
    apply_basis,
    ripple_carry_adder_gates,
    verify_adder,
)


@pytest.mark.parametrize("bits", [1, 2, 3, 4])
def test_adder_is_correct_on_every_input(bits: int) -> None:
    """The whole point of this circuit: correctness is proved, not sampled.

    Every gate is a permutation of the computational basis, so agreement on all
    2^(2*bits) input pairs is agreement on every input state by linearity.
    """
    report = verify_adder(bits)
    assert report["inputs_checked"] == (1 << bits) ** 2
    assert report["exhaustive"] is True


def test_toffoli_count_is_two_per_bit() -> None:
    """Toffolis are the expensive gate under a fault-tolerant cost model.

    Cuccaro's construction uses exactly two per bit -- one in MAJ, one in UMA.
    Pinned because a "simplification" that quietly adds Toffolis raises the
    fault-tolerant cost of every circuit built on this one.
    """
    for bits in (1, 2, 3, 8):
        assert verify_adder(bits)["toffoli_count"] == 2 * bits


def test_input_register_survives() -> None:
    """`b += a` must leave `a` alone.

    A circuit can compute the right sum while destroying an operand, which only
    shows up when it is used inside something larger. Checked directly.
    """
    gates = ripple_carry_adder_gates(3)
    # a = 5 (qubits 1,5), b = 6 (qubits 4,6)
    state = (1 << 1) | (1 << 5) | (1 << 4) | (1 << 6)
    out = apply_basis(gates, state)
    a_out = sum(((out >> (1 + 2 * i)) & 1) << i for i in range(3))
    assert a_out == 5


def test_ancilla_returns_to_zero() -> None:
    """The carry-in ancilla must come back clean.

    A dirty ancilla stays entangled with the result, so the adder cannot be used
    coherently inside a larger algorithm -- the failure a caller would only find
    much later, as an inexplicable loss of interference.
    """
    gates = ripple_carry_adder_gates(3)
    for a in range(8):
        for b in range(8):
            state = 0
            for index in range(3):
                if (a >> index) & 1:
                    state |= 1 << (1 + 2 * index)
                if (b >> index) & 1:
                    state |= 1 << (2 + 2 * index)
            assert (apply_basis(gates, state) >> 0) & 1 == 0


def test_reversibility() -> None:
    """A permutation circuit must be injective: no two inputs may collide.

    This is a property of the construction rather than of the arithmetic, and it
    would fail for any circuit that discarded information -- which is exactly
    what an adder built without the UMA unwind would do.
    """
    gates = ripple_carry_adder_gates(2)
    outputs = {apply_basis(gates, state) for state in range(1 << 6)}
    assert len(outputs) == 1 << 6


def test_carry_out_is_used() -> None:
    """The top carry must land somewhere; without it the sum wraps.

    3 + 3 on 2 bits is 6, which does not fit in 2 bits. If the carry-out were
    dropped this would silently read as 2.
    """
    gates = ripple_carry_adder_gates(2)
    state = (1 << 1) | (1 << 3) | (1 << 2) | (1 << 4)  # a = 3, b = 3
    out = apply_basis(gates, state)
    total = sum(((out >> (2 + 2 * i)) & 1) << i for i in range(2)) + (((out >> 5) & 1) << 2)
    assert total == 6


def test_rejects_zero_width() -> None:
    with pytest.raises(AdderError, match="at least one bit"):
        ripple_carry_adder_gates(0)


def test_simulator_refuses_non_permutation_gates() -> None:
    """This simulator is exact only because every gate permutes basis states.

    An `h` here would make the exhaustive check meaningless rather than wrong,
    which is the more dangerous failure -- so it raises instead of ignoring.
    """
    with pytest.raises(AdderError, match="not a permutation gate"):
        apply_basis([("h", (0,))], 0)


def test_maj_leading_cx_pair_commutes() -> None:
    """MAJ's first two CX share a control, so their order does not matter.

    Recorded because it looked like a missed mutation: swapping them changes
    nothing, and the reason is that CX gates with a common control commute --
    each applies X to a different target under the same condition. Pinning it
    documents that a scheduler reordering this pair is safe, and distinguishes a
    genuine no-op from a test that failed to notice a change.
    """
    gates = ripple_carry_adder_gates(2)
    assert gates[0][0] == "cx" and gates[1][0] == "cx"
    assert gates[0][1][0] == gates[1][1][0], "the shared control is what makes them commute"

    swapped = list(gates)
    swapped[0], swapped[1] = swapped[1], swapped[0]
    assert all(apply_basis(gates, state) == apply_basis(swapped, state) for state in range(1 << 6))
