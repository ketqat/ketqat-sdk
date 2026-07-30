"""Emit QIR from a KetQat circuit (ketqat-sdk#186).

The last named format in item 2. QIR is not another circuit language -- it is
LLVM IR with a quantum intrinsic library -- so this is a genuinely different
target from the OpenQASM work, and the constraints are different too.

Two real constraints, both enforced rather than worked around
------------------------------------------------------------
**The QIS gate set is small.** pyqir's `BasicQisBuilder` provides exactly
h, x, y, z, s, s_adj, t, t_adj, rx, ry, rz, cx, cz, mz, reset and if_result.
KetQat's gate set is larger -- swap, ccx, sx, u3 and others have no QIS
intrinsic. Those are **refused, naming the profile**, rather than decomposed
silently. A swap is exactly three CX and could be substituted, but doing so
changes gate count and depth, and those numbers feed the resource estimates
elsewhere in this package; a caller who asked for a faithful conversion and got a
tripled two-qubit count has been misled even though the unitary is identical. If
decomposition is wanted it should be an explicit, separately-recorded step.

**Profiles are a hard boundary, not a hint.** The QIR Base Profile forbids using
a measurement result to control later operations; that requires the Adaptive
Profile. A circuit with a classical conditional is therefore not Base Profile, and
labelling it as one would produce IR that a Base-Profile backend must reject. The
profile is determined from the circuit and reported, never assumed.

Verification is a round trip through pyqir's own parser: the emitted IR is read
back and the recovered intrinsic calls compared against what was requested. That
checks the emission against an external implementation rather than against the
emitter's own idea of what it wrote.
"""

from __future__ import annotations

from typing import Any, Sequence

#: KetQat gate name -> BasicQisBuilder method. Only exact correspondences.
QIS_GATE_MAP: dict[str, str] = {
    "h": "h",
    "x": "x",
    "y": "y",
    "z": "z",
    "s": "s",
    "sdg": "s_adj",
    "t": "t",
    "tdg": "t_adj",
    "rx": "rx",
    "ry": "ry",
    "rz": "rz",
    "cx": "cx",
    "cnot": "cx",
    "cz": "cz",
    "i": None,
    "id": None,
}

#: Gates with no QIS intrinsic, and what a caller would have to do about each.
#:
#: Listed rather than left to a generic error so the message can say whether the
#: gate is decomposable at all.
NO_QIS_EQUIVALENT: dict[str, str] = {
    "swap": "exactly three CX gates, which triples the two-qubit count",
    "ccx": "six CX plus single-qubit rotations, which changes depth substantially",
    "toffoli": "six CX plus single-qubit rotations, which changes depth substantially",
    "cswap": "a CCX plus two CX, compounding both changes",
    "sx": "rx(pi/2) up to a global phase",
    "sxdg": "rx(-pi/2) up to a global phase",
    "u": "three rotations, whose decomposition convention varies between tools",
    "u3": "three rotations, whose decomposition convention varies between tools",
    "u2": "two rotations, whose decomposition convention varies between tools",
    "u1": "an rz up to a global phase",
    "p": "an rz up to a global phase",
    "cy": "a cx conjugated by s gates",
    "ch": "a cx conjugated by rotations",
}

QIR_PROFILES = ("base", "adaptive")


class QirError(RuntimeError):
    """A conversion that could not be performed as specified."""


def _require() -> Any:
    try:
        import pyqir
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise QirError(
            "pyqir is not installed. Install it with `pip install pyqir`. This module emits real QIR "
            "through pyqir rather than assembling LLVM text by hand, so the package is required."
        ) from exc
    return pyqir


def upstream_version() -> str:
    try:
        from importlib.metadata import version

        return version("pyqir")
    except Exception:  # pragma: no cover - environment dependent
        return "unknown"


def required_profile(operations: Sequence[dict[str, Any]]) -> str:
    """Which QIR profile a circuit needs.

    A classical conditional means a measurement result controls a later operation,
    which the Base Profile forbids. Determined rather than assumed: emitting
    Base-Profile-labelled IR containing a branch produces something a
    Base-Profile backend must reject.
    """
    for operation in operations:
        if operation.get("kind") == "conditional":
            return "adaptive"
    return "base"


def _flat_index(bit: dict[str, Any], registers: Sequence[dict[str, Any]]) -> int:
    """Position of a bit in the flattened register layout QIR uses.

    QIR addresses qubits by a single integer, so multiple named registers have to
    be laid out end to end. The order follows the circuit's declaration order.
    """
    offset = 0
    for register in registers:
        if register["name"] == bit["register"]:
            if bit["index"] >= register["size"]:
                raise QirError(
                    f"Index {bit['index']} is out of range for register '{register['name']}' of size "
                    f"{register['size']}."
                )
            return offset + int(bit["index"])
        offset += int(register["size"])
    raise QirError(f"Unknown register '{bit['register']}'.")


def circuit_to_qir(circuit: dict[str, Any], *, name: str = "ketqat") -> dict[str, Any]:
    """Emit QIR for a KetQat circuit graph, refusing what QIS cannot express.

    Takes the circuit as a dict -- the shape `parseQasm3` produces -- so no second
    parser is needed on this side.
    """
    pyqir = _require()
    from pyqir import BasicQisBuilder, SimpleModule

    operations = circuit.get("operations") or []
    qubit_registers = circuit.get("qubit_registers") or []
    clbit_registers = circuit.get("clbit_registers") or []

    qubit_count = sum(int(register["size"]) for register in qubit_registers)
    result_count = sum(int(register["size"]) for register in clbit_registers)
    if qubit_count == 0:
        raise QirError("This circuit declares no qubits, so there is nothing to emit.")

    profile = required_profile(operations)
    if profile == "adaptive":
        raise QirError(
            "This circuit uses a measurement result to control a later operation, which requires the "
            "QIR Adaptive Profile. Only the Base Profile is emitted here, and labelling this as Base "
            "Profile would produce IR that a Base-Profile backend must reject."
        )

    module = SimpleModule(name, num_qubits=qubit_count, num_results=max(result_count, 1))
    builder = BasicQisBuilder(module.builder)

    emitted: list[str] = []
    for operation in operations:
        kind = operation.get("kind")
        if kind == "gate":
            gate = str(operation["name"]).lower()
            if gate in NO_QIS_EQUIVALENT:
                raise QirError(
                    f"'{gate}' has no QIR QIS intrinsic. It is {NO_QIS_EQUIVALENT[gate]}, and "
                    "substituting that silently would change the gate count and depth this package "
                    "reports elsewhere. Decompose explicitly first if that is what you want."
                )
            if gate not in QIS_GATE_MAP:
                raise QirError(
                    f"'{gate}' is not in the QIR QIS instruction set. Supported: "
                    f"{', '.join(sorted(key for key, value in QIS_GATE_MAP.items() if value))}."
                )
            method_name = QIS_GATE_MAP[gate]
            if method_name is None:
                # Identity has no intrinsic and needs none; recorded so the count
                # of emitted calls matches what a reader sees in the IR.
                continue

            targets = [_flat_index(bit, qubit_registers) for bit in operation["qubits"]]
            parameters = operation.get("parameters") or []
            method = getattr(builder, method_name)

            if method_name in ("rx", "ry", "rz"):
                if len(parameters) != 1:
                    raise QirError(f"'{gate}' needs exactly one angle, got {len(parameters)}.")
                angle = parameters[0]
                if not isinstance(angle, (int, float)):
                    raise QirError(
                        f"'{gate}' has a symbolic angle ({angle!r}). QIR needs a concrete value, so "
                        "resolve parameters before converting."
                    )
                method(float(angle), module.qubits[targets[0]])
            elif method_name in ("cx", "cz"):
                method(module.qubits[targets[0]], module.qubits[targets[1]])
            else:
                method(module.qubits[targets[0]])
            emitted.append(method_name)

        elif kind == "measure":
            qubit = _flat_index(operation["qubit"], qubit_registers)
            result = _flat_index(operation["clbit"], clbit_registers)
            builder.mz(module.qubits[qubit], module.results[result])
            emitted.append("mz")

        elif kind == "reset":
            builder.reset(module.qubits[_flat_index(operation["qubit"], qubit_registers)])
            emitted.append("reset")

        elif kind == "barrier":
            # A barrier is a compiler hint with no QIR intrinsic. Dropping it does
            # not change the program's meaning, unlike dropping a gate, so it is
            # recorded rather than refused.
            continue

        else:
            raise QirError(f"'{kind}' has no QIR representation.")

    return {
        "qir": module.ir(),
        "profile": profile,
        "pyqir_version": upstream_version(),
        "qubit_count": qubit_count,
        "result_count": result_count,
        "emitted_calls": emitted,
        "loss_report": [
            {
                "feature": "barrier_dropped",
                "severity": "cosmetic",
                "action": "dropped",
                "detail": "Barriers are compiler hints with no QIR intrinsic; dropping one does not change the program.",
            }
        ]
        if any(operation.get("kind") == "barrier" for operation in operations)
        else [],
    }


def verify_round_trip(result: dict[str, Any]) -> dict[str, Any]:
    """Read the emitted IR back with pyqir and compare the recovered calls.

    Checks the emission against pyqir's own parser rather than against this
    module's idea of what it wrote -- the same reason the MCP transport is tested
    with the official client.
    """
    pyqir = _require()
    from pyqir import Context, Module

    try:
        parsed = Module.from_ir(Context(), result["qir"])
    except Exception as exc:
        raise QirError(f"pyqir could not parse the IR this module emitted: {exc}") from exc

    recovered: list[str] = []
    for function in parsed.functions:
        for block in function.basic_blocks:
            for instruction in block.instructions:
                callee = getattr(getattr(instruction, "callee", None), "name", None)
                if callee and "__quantum__qis__" in callee:
                    # __quantum__qis__h__body -> h
                    recovered.append(callee.split("__quantum__qis__")[1].split("__")[0])

    expected = [
        # pyqir names the CX intrinsic 'cnot' in the IR while the builder method is
        # 'cx'; mapping here rather than loosening the comparison.
        "cnot" if call == "cx" else call
        for call in result["emitted_calls"]
    ]
    return {
        "parsed": True,
        "recovered_calls": recovered,
        "expected_calls": expected,
        "matches": recovered == expected,
    }
