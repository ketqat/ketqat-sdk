"""Tests for the Steane [[7,1,3]] code (ketqat-sdk#159)."""

from __future__ import annotations

import numpy as np
import pytest

from ketqat_runner.steane import (
    CODE_QUBITS,
    LOGICAL_X,
    LOGICAL_Z,
    STEANE_STABILIZERS,
    SteaneError,
    demonstrate_distance_limit,
    logical_zero,
    pauli_matrix,
    single_qubit_errors,
    syndrome,
    syndrome_table,
    verify_single_error_correction,
    verify_state_level_correction,
)


def test_every_single_error_is_uniquely_identified() -> None:
    """A complete claim, not a sampled one.

    Weight-1 errors on 7 qubits number exactly 21, so all of them can be checked
    and the result is a proof. Both conditions matter: a zero syndrome means the
    error is invisible, a shared syndrome means two errors are indistinguishable.
    """
    report = verify_single_error_correction()
    assert report["errors_checked"] == 21
    assert report["distinct_syndromes"] == 21
    assert report["exhaustive"] is True


def test_correction_verified_at_the_state_level() -> None:
    """An independent path: matrices and projections, not commutation arithmetic.

    The syndrome table could be correct while encoding or recovery is broken.
    This encodes |0_L>, applies each of the 21 errors, measures the syndrome by
    projection, corrects, and requires fidelity exactly 1.
    """
    report = verify_state_level_correction()
    assert report["errors_checked"] == 21
    assert report["all_recovered"] is True


def test_distance_three_limit_is_demonstrated() -> None:
    """Distance 3 corrects one error and detects two -- the second half matters.

    Weight-2 errors exist whose syndrome collides with a weight-1 error's, so the
    decoder applies the wrong correction. Asserting that these exist keeps the
    module from implying a stronger code than Steane is.
    """
    report = demonstrate_distance_limit()
    assert report["miscorrected_count"] > 0
    assert report["example"]["actual"] != report["example"]["decoder_applies"]


def test_stabilizers_commute_with_each_other() -> None:
    """A stabiliser group requires it; without it there is no joint +1 eigenspace."""
    for first in STEANE_STABILIZERS:
        for second in STEANE_STABILIZERS:
            left, right = pauli_matrix(first), pauli_matrix(second)
            assert np.allclose(left @ right, right @ left)


def test_logical_operators_commute_with_all_stabilizers() -> None:
    """Logical operators must preserve the code space, or they are not logical."""
    for logical in (LOGICAL_X, LOGICAL_Z):
        matrix = pauli_matrix(logical)
        for generator in STEANE_STABILIZERS:
            stabilizer = pauli_matrix(generator)
            assert np.allclose(matrix @ stabilizer, stabilizer @ matrix)


def test_logical_operators_anticommute_with_each_other() -> None:
    """X_L and Z_L must anticommute, exactly as single-qubit X and Z do.

    This is what makes the encoded qubit a qubit rather than a classical bit.
    """
    x_logical, z_logical = pauli_matrix(LOGICAL_X), pauli_matrix(LOGICAL_Z)
    assert np.allclose(x_logical @ z_logical, -(z_logical @ x_logical))


def test_logical_zero_is_stabilized() -> None:
    """|0_L> must be a +1 eigenstate of every generator and of Z_L."""
    state = logical_zero()
    assert abs(np.linalg.norm(state) - 1.0) < 1e-12
    for generator in (*STEANE_STABILIZERS, LOGICAL_Z):
        assert np.allclose(pauli_matrix(generator) @ state, state)


def test_logical_x_flips_the_logical_state() -> None:
    """X_L must map |0_L> to a state orthogonal to it, and stay in the code space."""
    zero = logical_zero()
    one = pauli_matrix(LOGICAL_X) @ zero
    assert abs(np.vdot(zero, one)) < 1e-12
    for generator in STEANE_STABILIZERS:
        assert np.allclose(pauli_matrix(generator) @ one, one)


def test_logical_zero_has_eight_basis_states() -> None:
    """Steane's |0_L> is the superposition of the 8 even-weight Hamming codewords.

    Pinned because the count is a structural fingerprint of the code -- a wrong
    stabiliser set would almost certainly change it.
    """
    assert int(np.sum(np.abs(logical_zero()) > 1e-9)) == 8


def test_single_errors_cannot_mimic_a_logical_operator() -> None:
    """Logical operators are weight 7, so no weight-1 error can act as one.

    This is why the code protects anything at all: the shortest undetectable
    operation is longer than the errors it is built to survive.
    """
    assert all(letter != "I" for letter in LOGICAL_X)
    assert all(letter != "I" for letter in LOGICAL_Z)
    for error in single_qubit_errors():
        assert any(bit for bit in syndrome(error)), f"{error} is undetectable"


def test_syndrome_table_is_complete() -> None:
    """21 errors must yield 21 entries; a collision would silently overwrite one."""
    assert len(syndrome_table()) == 21


def test_rejects_malformed_paulis() -> None:
    with pytest.raises(SteaneError, match="expected 7"):
        syndrome("XX")
    with pytest.raises(SteaneError, match="not a Pauli operator"):
        pauli_matrix("XXXXXXQ")
    with pytest.raises(SteaneError, match="expected 7"):
        pauli_matrix("X")


def test_error_count_matches_the_code_size() -> None:
    assert len(single_qubit_errors()) == 3 * CODE_QUBITS
