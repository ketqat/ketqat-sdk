"""Non-Pauli noise via a density-matrix path (ketqat-sdk#212).

Two rules, both structural rather than advisory.

**Stim never sees a non-Pauli channel.** Stim is a stabilizer simulator; it is fast
precisely because it tracks Pauli frames, and amplitude damping is not a Pauli channel
-- it cannot be represented in that formalism at all. Code that routed damping through
Stim would still produce numbers, and they would be the numbers for some *other*
channel, which is worse than an error because it looks like a result.
:func:`assert_stim_representable` is the gate, and the Braket path below is the only
way this package simulates damping.

**Noise must be proved to change outcomes, not merely be configured.** The tests run
the Braket local density-matrix simulator at ``shots=0``, which returns exact
probabilities from the density matrix -- no sampling error to hide behind -- and
compare them to the closed forms:

* amplitude damping ``gamma`` on ``|1>``: ``P(0) = gamma`` (population decays toward
  ``|0>``, and the channel is *asymmetric*: on ``|0>`` it does nothing);
* phase damping ``gamma`` between two Hadamards: ``P(0) = (1 + sqrt(1-gamma)) / 2``
  (coherence shrinks by ``sqrt(1-gamma)``) while the *populations* before the second
  Hadamard stay exactly 1/2 -- phase damping destroys interference without moving
  population, which is precisely what distinguishes it from amplitude damping. A test
  that cannot tell those two apart has tested neither.

Leakage is **deliberately absent**. A leaked qubit occupies a third level outside the
two-level space this simulator and these codes describe; a two-level density matrix
cannot represent it, and approximating it with a channel that is not leakage would be a
fabricated model. That blocker stands until a defensible qutrit-level model is chosen.
"""

from __future__ import annotations

from typing import Any

#: Channels a stabilizer simulator can represent: probabilistic Pauli errors.
STIM_REPRESENTABLE = frozenset({
    "depolarizing", "bit_flip", "phase_flip", "bit_phase_flip",
    "pauli_channel", "two_qubit_depolarizing",
})

#: Channels that require a density-matrix simulation and must never reach Stim.
DENSITY_MATRIX_ONLY = frozenset({"amplitude_damping", "phase_damping", "generalized_amplitude_damping"})


class NonPauliChannelError(ValueError):
    """A non-Pauli channel was about to enter a stabilizer-simulator path."""


def assert_stim_representable(channel: str) -> None:
    """The gate between noise configuration and the Stim path.

    Raises for damping channels with a message that says what to use instead, because
    the silent alternative -- Stim producing numbers for some other channel -- looks
    like a result and is not one.
    """
    name = channel.lower()
    if name in DENSITY_MATRIX_ONLY:
        raise NonPauliChannelError(
            f"{channel} is not a Pauli channel and cannot be represented by a stabilizer "
            "simulator. Stim would not model it; it would silently model something else. "
            "Use simulate_damping(), which runs Braket's local density-matrix simulator."
        )
    if name not in STIM_REPRESENTABLE:
        raise NonPauliChannelError(
            f"Unknown channel {channel!r}. Stim-representable: {sorted(STIM_REPRESENTABLE)}; "
            f"density-matrix only: {sorted(DENSITY_MATRIX_ONLY)}."
        )


def _require_braket():
    try:
        from braket.circuits import Circuit
        from braket.devices import LocalSimulator
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise ImportError(
            'The Braket density-matrix path needs the "braket" extra: '
            'pip install -e "python[braket]"'
        ) from exc
    return Circuit, LocalSimulator


def simulate_damping(
    channel: str,
    gamma: float,
    *,
    prepare: str = "one",
    interfere: bool = False,
) -> dict[str, Any]:
    """Exact single-qubit damping outcome from the density-matrix simulator.

    ``shots=0`` returns probabilities computed from the density matrix itself, so the
    comparison against the closed form is exact rather than statistical.

    ``prepare="one"`` starts in ``|1>`` (populations visible); ``prepare="plus"`` starts
    in ``|+>``; ``interfere=True`` appends a second Hadamard so phase damage becomes
    visible as lost interference.
    """
    if channel not in DENSITY_MATRIX_ONLY:
        raise ValueError(f"simulate_damping handles {sorted(DENSITY_MATRIX_ONLY)}, not {channel!r}.")
    if not 0.0 <= gamma <= 1.0:
        raise ValueError(f"gamma must be in [0, 1], got {gamma}.")
    Circuit, LocalSimulator = _require_braket()

    circuit = Circuit()
    if prepare == "one":
        circuit.x(0)
    elif prepare == "plus":
        circuit.h(0)
    elif prepare != "zero":
        raise ValueError(f"prepare must be one/plus/zero, got {prepare!r}.")

    if channel == "amplitude_damping":
        circuit.amplitude_damping(0, gamma=gamma)
    elif channel == "phase_damping":
        circuit.phase_damping(0, gamma=gamma)
    else:
        raise ValueError(f"{channel} is recognised but has no builder here yet.")

    if interfere:
        circuit.h(0)
    circuit.probability()

    device = LocalSimulator("braket_dm")
    result = device.run(circuit, shots=0).result()
    probabilities = [float(x) for x in result.values[0]]
    return {
        "channel": channel,
        "gamma": gamma,
        "prepare": prepare,
        "interfere": interfere,
        "simulator": "braket_dm (local density matrix)",
        "shots": 0,
        "exact": True,
        "p0": probabilities[0],
        "p1": probabilities[1],
    }
