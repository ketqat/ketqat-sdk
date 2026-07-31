"""Density-matrix noise, proved against closed forms (ketqat-sdk#212)."""
from __future__ import annotations

import math

import pytest

from ketqat_runner.noise_channels import (
    DENSITY_MATRIX_ONLY,
    NonPauliChannelError,
    STIM_REPRESENTABLE,
    assert_stim_representable,
)

braket = pytest.importorskip("braket", reason="braket extra not installed")
from ketqat_runner.noise_channels import simulate_damping  # noqa: E402


def test_stim_never_sees_a_damping_channel() -> None:
    # The structural rule: routing damping through Stim yields numbers for some other
    # channel, which looks like a result and is not one.
    for channel in DENSITY_MATRIX_ONLY:
        with pytest.raises(NonPauliChannelError, match="stabilizer"):
            assert_stim_representable(channel)
    for channel in STIM_REPRESENTABLE:
        assert_stim_representable(channel)  # must not raise
    with pytest.raises(NonPauliChannelError, match="Unknown channel"):
        assert_stim_representable("nonesuch")


def test_amplitude_damping_changes_populations_by_exactly_gamma() -> None:
    # |1> under AD(gamma): P(0) = gamma. shots=0 gives exact density-matrix
    # probabilities, so this is equality to a closed form, not a statistical claim.
    for gamma in (0.0, 0.25, 0.5, 0.9):
        out = simulate_damping("amplitude_damping", gamma, prepare="one")
        assert out["exact"] is True
        assert out["p0"] == pytest.approx(gamma, abs=1e-9)
        assert out["p1"] == pytest.approx(1 - gamma, abs=1e-9)
    # And the noiseless case really is the gamma=0 row: noise changed the outcome.
    assert simulate_damping("amplitude_damping", 0.6, prepare="one")["p0"] != pytest.approx(0.0)


def test_amplitude_damping_is_asymmetric() -> None:
    # On |0> amplitude damping does nothing -- decay has nowhere to go. This asymmetry
    # is what a symmetric channel (depolarizing, phase) cannot reproduce.
    out = simulate_damping("amplitude_damping", 0.7, prepare="zero")
    assert out["p0"] == pytest.approx(1.0, abs=1e-9)


def test_phase_damping_destroys_coherence_without_changing_populations() -> None:
    gamma = 0.64
    # (a) Populations: |+> under PD, measured directly -- exactly 1/2 each, independent
    # of gamma. Phase damping moves no population.
    populations = simulate_damping("phase_damping", gamma, prepare="plus")
    assert populations["p0"] == pytest.approx(0.5, abs=1e-9)
    assert populations["p1"] == pytest.approx(0.5, abs=1e-9)
    # (b) Coherence: close the interferometer with a second H. Coherence scales by
    # sqrt(1-gamma), so P(0) = (1 + sqrt(1-gamma))/2 -- 0.8 for gamma=0.64, against
    # 1.0 noiseless. The interference loss is the noise changing the outcome.
    interference = simulate_damping("phase_damping", gamma, prepare="plus", interfere=True)
    assert interference["p0"] == pytest.approx((1 + math.sqrt(1 - gamma)) / 2, abs=1e-9)
    noiseless = simulate_damping("phase_damping", 0.0, prepare="plus", interfere=True)
    assert noiseless["p0"] == pytest.approx(1.0, abs=1e-9)


def test_the_two_channels_are_distinguishable() -> None:
    # The trap the issue names: a test that cannot tell amplitude from phase damping
    # has tested neither. Same gamma, same preparation |1>, measured directly:
    # amplitude damping moves population (P0 = gamma); phase damping moves none.
    gamma = 0.5
    amplitude = simulate_damping("amplitude_damping", gamma, prepare="one")
    phase = simulate_damping("phase_damping", gamma, prepare="one")
    assert amplitude["p0"] == pytest.approx(gamma, abs=1e-9)
    assert phase["p0"] == pytest.approx(0.0, abs=1e-9)
    assert amplitude["p0"] != pytest.approx(phase["p0"])


def test_invalid_inputs_are_refused() -> None:
    with pytest.raises(ValueError, match="gamma"):
        simulate_damping("amplitude_damping", 1.5)
    with pytest.raises(ValueError, match="handles"):
        simulate_damping("depolarizing", 0.1)
