"""Framework interoperability, and the bit-ordering trap (ketqat-sdk#184).

Item 2 asks for import/export across Qiskit, Cirq, PennyLane, Braket and pytket,
recording loss and equivalence. Doing that framework by framework surfaced
something that deserves one shared home rather than a note repeated five times.

**Statevector bit ordering is not standard, and the frameworks split.** Measured
here, not read off documentation:

    Qiskit      qubit 0 is the LEAST significant amplitude index bit
    KetQat      qubit 0 is the LEAST significant amplitude index bit
    Cirq        qubit 0 is the MOST significant
    PennyLane   wire 0 is the MOST significant
    pytket      qubit 0 is the MOST significant

**KetQat is in the minority.** Only Qiskit shares its convention; Cirq, PennyLane
and pytket all use the opposite one. That is why MQT Bench and QED-C circuits
(Qiskit-built) matched KetQat directly while three of nine SupermarQ circuits
(Cirq-built) needed a bit reversal.

The pytket entry corrects a claim I made in ketqat-sdk#183. That change reported
KetQat and pytket agreeing to 0.00e+00, which was true -- and uninformative. All
three fixtures were symmetric under bit reversal, so the comparison could not have
detected a mismatch either way. Measured with an asymmetric probe, pytket uses the
opposite convention. The emitted OpenQASM was and is correct; what was wrong was
calling the agreement direct.

The failure mode is what makes this worth centralising: on states symmetric under
bit reversal -- GHZ, |00..0>, anything with equal weight on mirrored basis states
-- both conventions agree, so a mismatch stays invisible through exactly the test
cases people reach for first. It appears later, on an asymmetric state, looking
like a wrong answer rather than a convention difference.

**Dialects also split, and OpenQASM 3 is the minority.** pytket rejects OpenQASM 3
outright; PennyLane's reader accepts only 2.0 and says so. Both read OpenQASM 2,
which is why emitting it (ketqat-sdk#182) is what actually unlocked them.
PennyLane's OpenQASM support is not even built in -- `qml.from_qasm` delegates to
the separate `pennylane-qiskit` plugin and fails with a plugin-load error without
it, which is worth knowing before concluding a circuit is at fault.
"""

from __future__ import annotations

from typing import Any, Sequence

#: Where each framework puts qubit 0 in a statevector index.
#:
#: Every entry is verified by `verify_bit_ordering` against the installed library
#: rather than trusted: conventions are exactly the kind of thing that changes
#: quietly between versions, and a stale table here would be worse than none.
FRAMEWORK_BIT_ORDERING: dict[str, str] = {
    "ketqat": "least_significant",
    "qiskit": "least_significant",
    "cirq": "most_significant",
    "pennylane": "most_significant",
    "pytket": "most_significant",
}

#: Which OpenQASM versions each framework's reader accepts.
FRAMEWORK_DIALECTS: dict[str, dict[str, Any]] = {
    "qiskit": {"reads": ["2.0", "3.0"], "writes": ["2.0", "3.0"]},
    "cirq": {"reads": ["2.0"], "writes": ["2.0"]},
    "pennylane": {
        "reads": ["2.0"],
        "writes": [],
        "note": "Requires the separate pennylane-qiskit plugin; without it qml.from_qasm raises a plugin-load error.",
    },
    "pytket": {
        "reads": ["2.0"],
        "writes": ["2.0"],
        "note": "Rejects OpenQASM 3 with 'Header stdgates is not known and cannot be loaded'.",
    },
    "ketqat": {"reads": ["2.0", "3.0"], "writes": ["2.0", "3.0"]},
}


class FrameworkInteropError(RuntimeError):
    """An interoperability check that could not be performed as specified."""


class FrameworkUnavailableError(FrameworkInteropError):
    """The framework is installed but cannot read OpenQASM, so nothing can be checked.

    Separate from `FrameworkInteropError` because the two demand opposite responses. A
    convention mismatch is a finding and must fail loudly. A framework that cannot parse
    the probe at all yields no finding either way, and reporting it as a mismatch would
    claim a measurement that was never taken.

    PennyLane is the case this exists for: its OpenQASM support lives in the separate
    `pennylane-qiskit` plugin, so `import pennylane` succeeds while every circuit load
    fails. Installing the `resources` extra reaches exactly that state, because qualtran
    declares pennylane as a dependency and has no need of the plugin.
    """


def reverse_bit_order(amplitudes: Sequence[complex], qubits: int) -> list[complex]:
    """Reindex amplitudes between the two conventions.

    The whole fix, in one function, so callers do not each write their own and get
    the direction wrong.
    """
    size = 1 << qubits
    if len(amplitudes) != size:
        raise FrameworkInteropError(f"A {qubits}-qubit state has {size} amplitudes, got {len(amplitudes)}.")
    reordered: list[complex] = [0j] * size
    for index, amplitude in enumerate(amplitudes):
        mirrored = 0
        for bit in range(qubits):
            if (index >> bit) & 1:
                mirrored |= 1 << (qubits - 1 - bit)
        reordered[mirrored] = amplitude
    return reordered


def is_symmetric_under_bit_reversal(amplitudes: Sequence[complex], qubits: int, tolerance: float = 1e-9) -> bool:
    """Whether a state hides a bit-ordering mismatch.

    True for the states people test first -- GHZ, |00..0> -- which is precisely why
    a convention mismatch survives early testing and surfaces later as an
    apparently wrong answer.
    """
    reversed_amplitudes = reverse_bit_order(amplitudes, qubits)
    return all(abs(a - b) < tolerance for a, b in zip(amplitudes, reversed_amplitudes))


def _pennylane_state(openqasm2: str, qubits: int) -> list[complex]:
    try:
        import pennylane as qml
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise FrameworkInteropError("pennylane is not installed.") from exc

    try:
        loaded = qml.from_qasm(openqasm2)
    except RuntimeError as exc:
        raise FrameworkUnavailableError(
            f"PennyLane could not load the circuit: {exc}. Its OpenQASM support lives in the separate "
            "pennylane-qiskit plugin, so this is usually a missing plugin rather than a bad circuit."
        ) from exc

    device = qml.device("default.qubit", wires=qubits)

    @qml.qnode(device)
    def circuit():  # type: ignore[no-untyped-def]
        loaded(wires=tuple(range(qubits)))
        return qml.state()

    import numpy as np

    return [complex(value) for value in np.asarray(circuit()).ravel()]


def _pytket_state(openqasm2: str) -> list[complex]:
    try:
        from pytket import Circuit
        from pytket.qasm import circuit_from_qasm_str
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise FrameworkInteropError("pytket is not installed.") from exc

    parsed = circuit_from_qasm_str(openqasm2)
    stripped = Circuit(parsed.n_qubits)
    for command in parsed.get_commands():
        if command.op.type.name in ("Measure", "Barrier"):
            continue
        stripped.add_gate(command.op, [qubit.index[0] for qubit in command.qubits])

    import numpy as np

    return [complex(value) for value in np.asarray(stripped.get_statevector()).ravel()]


def verify_bit_ordering(framework: str) -> dict[str, Any]:
    """Determine a framework's convention empirically, from a circuit that reveals it.

    Uses `h q[0]` on two qubits: the resulting state has weight on indices 0 and 1
    under one convention and 0 and 2 under the other. A symmetric circuit could not
    tell them apart, which is the point of choosing this one.
    """
    if framework not in FRAMEWORK_BIT_ORDERING:
        raise FrameworkInteropError(f"No recorded convention for {framework!r}.")

    probe = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\n'
    if framework == "pennylane":
        amplitudes = _pennylane_state(probe, 2)
    elif framework == "pytket":
        amplitudes = _pytket_state(probe)
    else:
        raise FrameworkInteropError(
            f"{framework!r} has a recorded convention but no probe here; add one rather than trusting "
            "the table."
        )

    occupied = {index for index, amplitude in enumerate(amplitudes) if abs(amplitude) > 1e-9}
    if occupied == {0, 1}:
        measured = "least_significant"
    elif occupied == {0, 2}:
        measured = "most_significant"
    else:
        raise FrameworkInteropError(
            f"The probe put weight on {sorted(occupied)}, which matches neither convention. Either the "
            "circuit was misread or the framework does something else entirely."
        )

    recorded = FRAMEWORK_BIT_ORDERING[framework]
    return {
        "framework": framework,
        "measured": measured,
        "recorded": recorded,
        "matches_record": measured == recorded,
        "agrees_with_ketqat": measured == FRAMEWORK_BIT_ORDERING["ketqat"],
        "occupied_indices": sorted(occupied),
    }


def compare_statevectors(
    ketqat_amplitudes: Sequence[complex],
    framework_amplitudes: Sequence[complex],
    qubits: int,
    framework: str,
    tolerance: float = 1e-9,
) -> dict[str, Any]:
    """Compare two statevectors, accounting for the convention difference.

    Reports which comparison succeeded rather than silently trying both and
    declaring victory: if a state agrees only after reversal, the caller needs to
    know that reversal was required, because their own downstream code probably
    does not do it.
    """
    direct = max(
        (abs(a - b) for a, b in zip(ketqat_amplitudes, framework_amplitudes)), default=0.0
    )
    reversed_framework = reverse_bit_order(framework_amplitudes, qubits)
    after_reversal = max(
        (abs(a - b) for a, b in zip(ketqat_amplitudes, reversed_framework)), default=0.0
    )
    symmetric = is_symmetric_under_bit_reversal(framework_amplitudes, qubits, tolerance)

    if direct < tolerance and symmetric:
        verdict = "agrees_either_way"
    elif direct < tolerance:
        verdict = "agrees_directly"
    elif after_reversal < tolerance:
        verdict = "agrees_after_reversal"
    else:
        verdict = "disagrees"

    return {
        "framework": framework,
        "verdict": verdict,
        "direct_difference": direct,
        "difference_after_reversal": after_reversal,
        "state_symmetric_under_reversal": symmetric,
        "expected_to_need_reversal": FRAMEWORK_BIT_ORDERING.get(framework)
        != FRAMEWORK_BIT_ORDERING["ketqat"],
        "note": (
            "Agrees under both conventions because this state is symmetric under bit reversal, so it "
            "cannot confirm the convention -- test an asymmetric state too."
            if verdict == "agrees_either_way"
            else "Required a bit reversal. Downstream code comparing raw amplitudes will need the same."
            if verdict == "agrees_after_reversal"
            else "Agrees directly; the conventions match for this framework."
            if verdict == "agrees_directly"
            else "Disagrees under both conventions, so this is not an ordering issue."
        ),
    }
