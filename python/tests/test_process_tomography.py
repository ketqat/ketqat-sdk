"""Tests for process and multi-qubit state tomography (ketqat-sdk#178)."""

from __future__ import annotations

import numpy as np
import pytest

from ketqat_runner.process_tomography import (
    COMPLETE_POSITIVITY_TOLERANCE,
    PAULI_BASIS,
    ProcessTomographyError,
    amplitude_damping_channel,
    analytic_ptm,
    choi_from_channel,
    compare_with_analytic,
    depolarizing_channel,
    describe_channel,
    multi_qubit_state_tomography,
    pauli_transfer_matrix,
    unitary_channel,
)

HADAMARD = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
PAULI_X = np.array([[0, 1], [1, 0]], dtype=complex)


@pytest.mark.parametrize(
    "name,channel,strength",
    [
        ("identity", unitary_channel(np.eye(2, dtype=complex)), 0.0),
        ("x", unitary_channel(PAULI_X), 0.0),
        ("z", unitary_channel(np.diag([1, -1]).astype(complex)), 0.0),
        ("hadamard", unitary_channel(HADAMARD), 0.0),
        ("depolarizing", depolarizing_channel(0.0), 0.0),
        ("depolarizing", depolarizing_channel(0.1), 0.1),
        ("depolarizing", depolarizing_channel(0.5), 0.5),
        ("depolarizing", depolarizing_channel(1.0), 1.0),
        ("amplitude_damping", amplitude_damping_channel(0.2), 0.2),
        ("amplitude_damping", amplitude_damping_channel(0.7), 0.7),
    ],
)
def test_reconstruction_matches_the_analytic_transfer_matrix(name, channel, strength) -> None:
    """The load-bearing check: agreement with an independently written reference.

    `analytic_ptm` is written from the channel definitions and shares no code with
    `pauli_transfer_matrix`, so agreement is evidence about the reconstruction
    rather than about a common helper. The damping channels are supplied in Kraus
    form specifically so the reconstruction is not handed the matrix it is
    compared against.
    """
    report = compare_with_analytic(channel, name, strength)
    assert report["agrees"], f"{name} differs by {report['max_entry_difference']}"


def test_unitality_distinguishes_depolarizing_from_damping() -> None:
    """A real physical difference the transfer matrix exposes.

    Depolarizing leaves the maximally mixed state alone; amplitude damping pulls
    it toward |0>. Fidelity alone cannot tell these apart -- both simply look
    "worse than 1" -- so the distinction is worth reporting.
    """
    depolarizing = describe_channel(depolarizing_channel(0.3))
    damping = describe_channel(amplitude_damping_channel(0.4))

    assert depolarizing["unital"] is True
    assert damping["unital"] is False
    # Both are physical and trace-preserving, so unitality is the discriminator.
    assert depolarizing["trace_preserving"] and damping["trace_preserving"]
    assert depolarizing["completely_positive"] and damping["completely_positive"]


def test_average_fidelity_matches_the_closed_form() -> None:
    """Checked against the analytic value, not a previous run.

    For depolarizing strength p the average fidelity is 1 - p/2.
    """
    for strength in (0.0, 0.1, 0.3, 0.5):
        report = describe_channel(depolarizing_channel(strength))
        assert report["average_fidelity_with_identity"] == pytest.approx(1 - strength / 2, abs=1e-12)


def test_transpose_map_is_caught_as_not_completely_positive() -> None:
    """The textbook positive-but-not-completely-positive map.

    Transposition preserves trace and positivity of any single density matrix, yet
    is not a physical channel. Its Choi matrix has eigenvalue exactly -1, so this
    is an exact check rather than a threshold one -- and it proves the physicality
    test is doing real work rather than passing everything.
    """
    report = describe_channel(lambda rho: rho.T)
    assert report["completely_positive"] is False
    assert report["smallest_choi_eigenvalue"] == pytest.approx(-1.0, abs=1e-9)
    assert "NOT completely positive" in report["physicality_note"]
    assert "unprojected" in report["physicality_note"]


def test_unphysical_results_are_returned_unprojected() -> None:
    """Reported, not repaired.

    Projecting onto the nearest valid channel changes the estimate, and a caller
    told only the projected result cannot distinguish a clean measurement from a
    rescued one. The transfer matrix is still returned in full.
    """
    report = describe_channel(lambda rho: 1.4 * rho - 0.4 * np.trace(rho) * np.eye(2, dtype=complex) / 2)
    assert report["completely_positive"] is False
    assert report["smallest_choi_eigenvalue"] < -COMPLETE_POSITIVITY_TOLERANCE
    # The matrix is intact, not replaced by a projected one.
    assert len(report["pauli_transfer_matrix"]) == 4


def test_choi_matrix_is_hermitian() -> None:
    """A property of the construction, holding whether or not the channel is physical."""
    for channel in (depolarizing_channel(0.3), amplitude_damping_channel(0.4), lambda rho: rho.T):
        choi = choi_from_channel(channel)
        assert np.allclose(choi, choi.conj().T)


def test_a_non_hermiticity_preserving_map_is_refused() -> None:
    """The transfer matrix of such a map is not real, and that is said explicitly."""
    with pytest.raises(ProcessTomographyError, match="not real|imaginary part"):
        pauli_transfer_matrix(lambda rho: 1j * rho)


@pytest.mark.parametrize(
    "state,qubits,purity",
    [
        ([1, 0, 0, 0], 2, 1.0),
        ([1 / np.sqrt(2), 0, 0, 1 / np.sqrt(2)], 2, 1.0),
        ([0.5, -0.5, 0.5, -0.5], 2, 1.0),
        ([1 / np.sqrt(2)] + [0] * 6 + [1 / np.sqrt(2)], 3, 1.0),
    ],
)
def test_multi_qubit_reconstruction_is_exact(state, qubits, purity) -> None:
    """From all 4^n Pauli expectations, reconstruction of a pure state is exact.

    Trace 1 and purity 1 are properties of the estimator here, and the
    reconstruction error against the true density matrix is the direct check.
    """
    report = multi_qubit_state_tomography(state, qubits)
    assert report["pauli_terms"] == 4**qubits
    assert report["trace"] == pytest.approx(1.0, abs=1e-12)
    assert report["purity"] == pytest.approx(purity, abs=1e-12)
    assert report["reconstruction_error"] < 1e-12
    assert report["physical"] is True


def test_the_growth_in_pauli_terms_is_stated() -> None:
    """4^n terms against a fixed shot budget, so unphysicality gets more likely with n.

    Worth saying because the intuition runs the other way -- more data usually
    means a better estimate.
    """
    note = multi_qubit_state_tomography([1, 0, 0, 0], 2)["note"]
    assert "4^n" in note and "never projected" in note


def test_pauli_basis_order_is_fixed() -> None:
    """The row and column order of the transfer matrix depends on it."""
    assert [name for name, _ in PAULI_BASIS] == ["I", "X", "Y", "Z"]


def test_rejects_bad_input() -> None:
    with pytest.raises(ProcessTomographyError, match="No analytic PTM"):
        analytic_ptm("no_such_channel")
    with pytest.raises(ProcessTomographyError, match=r"must be in \[0, 1\]"):
        analytic_ptm("depolarizing", 1.5)
    with pytest.raises(ProcessTomographyError, match="at least one qubit"):
        multi_qubit_state_tomography([1, 0], 0)
    with pytest.raises(ProcessTomographyError, match="amplitudes"):
        multi_qubit_state_tomography([1, 0], 2)
    with pytest.raises(ProcessTomographyError, match="must return 2x2"):
        pauli_transfer_matrix(lambda rho: np.eye(4, dtype=complex))
