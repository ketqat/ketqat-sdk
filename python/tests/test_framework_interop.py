"""Tests for framework interoperability and bit ordering (ketqat-sdk#184)."""

from __future__ import annotations

import math

import pytest

from ketqat_runner.framework_interop import (
    FRAMEWORK_BIT_ORDERING,
    FRAMEWORK_DIALECTS,
    FrameworkInteropError,
    FrameworkUnavailableError,
    compare_statevectors,
    is_symmetric_under_bit_reversal,
    reverse_bit_order,
    verify_bit_ordering,
)

ROOT_HALF = 1 / math.sqrt(2)


def test_ketqat_is_in_the_minority_on_bit_ordering() -> None:
    """Only Qiskit shares KetQat's convention; three frameworks use the opposite.

    Worth asserting rather than noting, because it inverts the natural assumption
    that one's own convention is the common one.
    """
    assert FRAMEWORK_BIT_ORDERING["ketqat"] == "least_significant"
    assert FRAMEWORK_BIT_ORDERING["qiskit"] == "least_significant"
    for framework in ("cirq", "pennylane", "pytket"):
        assert FRAMEWORK_BIT_ORDERING[framework] == "most_significant"


@pytest.mark.parametrize("framework", ["pennylane", "pytket"])
def test_recorded_conventions_are_verified_against_the_installed_library(framework: str) -> None:
    """The table is checked, not trusted.

    Conventions change quietly between versions, so a stale table would be worse
    than none. The probe is `h q[0]` on two qubits, chosen because a symmetric
    circuit could not distinguish the conventions at all.
    """
    pytest.importorskip(framework, reason=f"{framework} is an optional extra")
    # Installed is not the same as usable. PennyLane reads OpenQASM only through the
    # separate pennylane-qiskit plugin, so `import pennylane` can succeed while every
    # circuit load fails -- which is the state the `resources` extra produces, since
    # qualtran depends on pennylane and not on the plugin. That yields no measurement,
    # so it is skipped. A genuine convention mismatch still raises and still fails.
    try:
        report = verify_bit_ordering(framework)
    except FrameworkUnavailableError as exc:
        pytest.skip(f"{framework} cannot read OpenQASM here, so the convention is unverifiable: {exc}")
    else:
        # `else` rather than falling through. `pytest.skip` raises, so the fall-through
        # was correct -- but only because of a fact about pytest that nothing here states,
        # and CodeQL reads it as a possibly-unbound `report` (py/uninitialized-local-variable).
        # If the skip were ever softened to a log, the asserts below would raise NameError
        # and the test would fail for a reason unrelated to bit ordering.
        assert report["matches_record"], (
            f"{framework} measured {report['measured']}, table says {report['recorded']}"
        )
        assert report["agrees_with_ketqat"] is False
        assert report["occupied_indices"] == [0, 2]


def test_a_framework_without_a_probe_is_refused_rather_than_trusted() -> None:
    """Having a table entry is not evidence; a framework needs a probe."""
    with pytest.raises(FrameworkInteropError, match="no probe here"):
        verify_bit_ordering("qiskit")
    with pytest.raises(FrameworkInteropError, match="No recorded convention"):
        verify_bit_ordering("no_such_framework")


def test_symmetric_states_hide_ordering_mismatches() -> None:
    """The reason this trap survives early testing.

    GHZ and |00> are symmetric under bit reversal, so both conventions agree on
    them -- and they are the first circuits anyone tests. A mismatch surfaces later
    on an asymmetric state, looking like a wrong answer.
    """
    assert is_symmetric_under_bit_reversal([ROOT_HALF, 0, 0, ROOT_HALF], 2) is True
    assert is_symmetric_under_bit_reversal([1, 0, 0, 0], 2) is True
    assert is_symmetric_under_bit_reversal([ROOT_HALF, ROOT_HALF, 0, 0], 2) is False
    assert is_symmetric_under_bit_reversal([0, 1, 0, 0], 2) is False


def test_comparison_says_which_convention_matched() -> None:
    """Not "they agree" -- which agreement, and whether it proves anything.

    A state that agrees only after reversal means the caller's downstream code
    needs the same reversal. A state that agrees either way proves nothing about
    the convention, and saying so is the difference between a check and a
    reassurance. This is the mistake made in sdk#183: three symmetric fixtures
    reported exact agreement and could not have detected a mismatch.
    """
    symmetric = [ROOT_HALF, 0, 0, ROOT_HALF]
    either = compare_statevectors(symmetric, symmetric, 2, "pytket")
    assert either["verdict"] == "agrees_either_way"
    assert "cannot confirm the convention" in either["note"]

    ours = [ROOT_HALF, ROOT_HALF, 0, 0]
    theirs = [ROOT_HALF, 0, ROOT_HALF, 0]
    reversed_case = compare_statevectors(ours, theirs, 2, "pytket")
    assert reversed_case["verdict"] == "agrees_after_reversal"
    assert reversed_case["expected_to_need_reversal"] is True
    assert "Downstream code" in reversed_case["note"]

    direct = compare_statevectors(ours, ours, 2, "qiskit")
    assert direct["verdict"] == "agrees_directly"

    unrelated = compare_statevectors(ours, [0, 0, 1, 0], 2, "pytket")
    assert unrelated["verdict"] == "disagrees"
    assert "not an ordering issue" in unrelated["note"]


def test_reversal_is_an_involution() -> None:
    """Applying it twice must return the original, or the direction is wrong."""
    original = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    assert reverse_bit_order(reverse_bit_order(original, 3), 3) == pytest.approx(original)
    # And it genuinely permutes: index 1 (001) becomes 4 (100) on three qubits.
    assert reverse_bit_order([0, 1, 0, 0, 0, 0, 0, 0], 3)[4] == 1


def test_reversal_refuses_a_mismatched_width() -> None:
    with pytest.raises(FrameworkInteropError, match="amplitudes"):
        reverse_bit_order([1, 0, 0], 2)


def test_dialect_support_records_openqasm_3_as_the_minority() -> None:
    """Both pytket and PennyLane read only OpenQASM 2, which is why emitting it mattered.

    KetQat writes both, so it can reach every framework here; before OpenQASM 2
    emission existed (sdk#182) it could reach only Qiskit.
    """
    assert FRAMEWORK_DIALECTS["pytket"]["reads"] == ["2.0"]
    assert FRAMEWORK_DIALECTS["pennylane"]["reads"] == ["2.0"]
    assert "2.0" in FRAMEWORK_DIALECTS["ketqat"]["writes"]
    assert "3.0" in FRAMEWORK_DIALECTS["ketqat"]["writes"]
    # PennyLane's OpenQASM support is not built in, which reads as a bad circuit
    # if you do not know it.
    assert "pennylane-qiskit" in FRAMEWORK_DIALECTS["pennylane"]["note"]
    assert "stdgates" in FRAMEWORK_DIALECTS["pytket"]["note"]
