"""Tests for QIR emission (ketqat-sdk#186)."""

from __future__ import annotations

import pytest

pytest.importorskip("pyqir", reason="pyqir is an optional [benchmarks] extra")

from ketqat_runner.qir import (  # noqa: E402
    NO_QIS_EQUIVALENT,
    QIS_GATE_MAP,
    QirError,
    circuit_to_qir,
    required_profile,
    upstream_version,
    verify_round_trip,
)


def _circuit(operations, qubits=2, clbits=2):
    return {
        "qubit_registers": [{"name": "q", "size": qubits}],
        "clbit_registers": [{"name": "c", "size": clbits}],
        "operations": operations,
    }


def _gate(name, indices, parameters=None):
    return {
        "kind": "gate",
        "name": name,
        "parameters": parameters or [],
        "qubits": [{"register": "q", "index": index} for index in indices],
    }


BELL = _circuit(
    [
        _gate("h", [0]),
        _gate("cx", [0, 1]),
        {"kind": "measure", "qubit": {"register": "q", "index": 0}, "clbit": {"register": "c", "index": 0}},
        {"kind": "measure", "qubit": {"register": "q", "index": 1}, "clbit": {"register": "c", "index": 1}},
    ]
)


def test_emitted_qir_round_trips_through_pyqirs_own_parser() -> None:
    """The load-bearing check: verified against an external implementation.

    Reading the IR back with pyqir and comparing the recovered intrinsic calls
    checks the emission against pyqir rather than against this module's own idea
    of what it wrote -- the same reason the MCP transport is tested with the
    official client.
    """
    result = circuit_to_qir(BELL, name="bell")
    assert "__quantum__qis__h__body" in result["qir"]
    assert result["pyqir_version"] == upstream_version()

    verified = verify_round_trip(result)
    assert verified["parsed"] is True
    assert verified["matches"], f"{verified['recovered_calls']} != {verified['expected_calls']}"


def test_profile_is_determined_not_assumed() -> None:
    """A conditional needs the Adaptive Profile, and Base-labelled IR with a branch
    is something a Base-Profile backend must reject."""
    assert required_profile(BELL["operations"]) == "base"
    conditional = [
        {
            "kind": "conditional",
            "register": "c",
            "equals": 1,
            "body": _gate("x", [0]),
        }
    ]
    assert required_profile(conditional) == "adaptive"
    with pytest.raises(QirError, match="Adaptive Profile"):
        circuit_to_qir(_circuit(conditional))


def test_gates_without_a_qis_intrinsic_are_refused_not_decomposed() -> None:
    """Refused deliberately, and the message says what the substitution would cost.

    A swap is exactly three CX and could be substituted, but that triples the
    two-qubit count -- and those numbers feed the resource estimates elsewhere in
    this package. A caller who asked for a faithful conversion and got a tripled
    count has been misled even though the unitary is identical.
    """
    for gate, arity in (("swap", [0, 1]), ("ccx", [0, 1]), ("u3", [0]), ("sx", [0])):
        with pytest.raises(QirError, match="no QIR QIS intrinsic"):
            circuit_to_qir(_circuit([_gate(gate, arity)]))

    # Every refusal explains the cost rather than just declining.
    for explanation in NO_QIS_EQUIVALENT.values():
        assert len(explanation) > 15


def test_unknown_gates_list_what_is_supported() -> None:
    with pytest.raises(QirError, match="not in the QIR QIS instruction set"):
        circuit_to_qir(_circuit([_gate("mystery_gate", [0])]))


def test_rotations_need_a_concrete_angle() -> None:
    """QIR has no symbolic parameters, so a symbolic angle is refused with the reason."""
    assert circuit_to_qir(_circuit([_gate("rz", [0], [0.5])]))["emitted_calls"] == ["rz"]
    with pytest.raises(QirError, match="symbolic angle"):
        circuit_to_qir(_circuit([_gate("rz", [0], ["theta"])]))
    with pytest.raises(QirError, match="exactly one angle"):
        circuit_to_qir(_circuit([_gate("rz", [0], [])]))


def test_identity_emits_nothing_and_barriers_are_recorded() -> None:
    """Identity needs no intrinsic; a barrier is a hint whose loss is recorded.

    Dropping a barrier does not change the program, unlike dropping a gate, which
    is why one is recorded and the other refused.
    """
    identity = circuit_to_qir(_circuit([_gate("id", [0]), _gate("h", [0])]))
    assert identity["emitted_calls"] == ["h"]

    with_barrier = circuit_to_qir(
        _circuit(
            [
                _gate("h", [0]),
                {"kind": "barrier", "qubits": [{"register": "q", "index": 0}]},
                _gate("x", [0]),
            ]
        )
    )
    assert with_barrier["emitted_calls"] == ["h", "x"]
    assert any(entry["feature"] == "barrier_dropped" for entry in with_barrier["loss_report"])
    assert verify_round_trip(with_barrier)["matches"]


def test_multiple_registers_are_flattened_in_declaration_order() -> None:
    """QIR addresses qubits by one integer, so named registers lie end to end."""
    circuit = {
        "qubit_registers": [{"name": "a", "size": 2}, {"name": "b", "size": 1}],
        "clbit_registers": [{"name": "c", "size": 1}],
        "operations": [
            {"kind": "gate", "name": "h", "parameters": [], "qubits": [{"register": "b", "index": 0}]},
            {
                "kind": "measure",
                "qubit": {"register": "b", "index": 0},
                "clbit": {"register": "c", "index": 0},
            },
        ],
    }
    result = circuit_to_qir(circuit)
    assert result["qubit_count"] == 3
    # b[0] is flat index 2, so the h acts on qubit 2 rather than 0.
    assert "inttoptr (i64 2 to ptr)" in result["qir"]
    assert verify_round_trip(result)["matches"]


def test_rejects_malformed_circuits() -> None:
    with pytest.raises(QirError, match="declares no qubits"):
        circuit_to_qir({"qubit_registers": [], "clbit_registers": [], "operations": []})
    with pytest.raises(QirError, match="Unknown register"):
        circuit_to_qir(
            _circuit([{"kind": "gate", "name": "h", "parameters": [], "qubits": [{"register": "z", "index": 0}]}])
        )
    with pytest.raises(QirError, match="out of range"):
        circuit_to_qir(_circuit([_gate("h", [9])]))
    with pytest.raises(QirError, match="no QIR representation"):
        circuit_to_qir(_circuit([{"kind": "mystery_kind"}]))


def test_the_supported_gate_set_is_the_qis_one() -> None:
    """Documented as a mapping so a reader can see the boundary, not infer it."""
    supported = {key for key, value in QIS_GATE_MAP.items() if value}
    assert {"h", "x", "y", "z", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "cx", "cz"} <= supported
    # And the excluded ones are excluded on purpose, with reasons.
    assert "swap" not in supported and "swap" in NO_QIS_EQUIVALENT
    assert "ccx" not in supported and "ccx" in NO_QIS_EQUIVALENT
