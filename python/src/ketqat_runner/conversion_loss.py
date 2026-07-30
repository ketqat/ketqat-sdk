"""What a cross-framework conversion actually loses (ketqat-sdk#210).

Item 2 requires recording loss and equivalence for framework conversion. Two halves of
that existed and were never joined: the TypeScript emitter produces a `lossReport` for
OpenQASM 3 -> 2, and `framework_interop.FRAMEWORK_DIALECTS` records which frameworks read
only 2.0. Nothing said that exporting to pytket or PennyLane therefore *inherits* every
OpenQASM 2 restriction, so a conversion to those targets reported nothing lost.

Everything here is **probed against the installed library**, never declared. That
distinction is the point of the module: a hand-written loss table is a claim that rots
silently as libraries change, and the failure mode is a conversion that reports no loss
because nobody re-checked.

Writing it caught two of my own measurement errors, both recorded in the tests so the
next person does not repeat them:

**Qiskit's `qasm2.loads` cannot resolve `qelib1.inc` by default.** Called plainly it
reports `'swap' is not defined in this scope` for most of the standard library, which
looks exactly like a portability finding and is not. `LEGACY_INCLUDE_PATH` and
`LEGACY_CUSTOM_INSTRUCTIONS` are required, and with them 33 of 34 gates are accepted.

**An absent framework is not a refusing framework.** `ModuleNotFoundError` means the probe
could not run; reporting it as a dialect restriction would invent loss out of an
uninstalled package.
"""

from __future__ import annotations

from typing import Any, Callable

from .framework_interop import FRAMEWORK_DIALECTS

#: Gates this project's OpenQASM 2 emitter is willing to write.
#: Kept here as the list to *probe*, not as a claim about what is portable.
EMITTED_QELIB1_GATES: dict[str, tuple[int, int]] = {
    "u3": (1, 3), "u": (1, 3), "p": (1, 1), "id": (1, 0),
    "x": (1, 0), "y": (1, 0), "z": (1, 0), "h": (1, 0),
    "s": (1, 0), "sdg": (1, 0), "t": (1, 0), "tdg": (1, 0),
    "rx": (1, 1), "ry": (1, 1), "rz": (1, 1), "sx": (1, 0), "sxdg": (1, 0),
    "cx": (2, 0), "cz": (2, 0), "cy": (2, 0), "swap": (2, 0), "ch": (2, 0),
    "crx": (2, 1), "cry": (2, 1), "crz": (2, 1), "cu1": (2, 1), "cp": (2, 1),
    "cu3": (2, 3), "csx": (2, 0), "cu": (2, 4), "rxx": (2, 1), "rzz": (2, 1),
    "ccx": (3, 0), "cswap": (3, 0),
}


class ProbeUnavailable(Exception):
    """The framework is not installed, so nothing about it can be measured."""


def _qasm2_for(gate: str, qubits: int, parameters: int) -> str:
    arguments = "(" + ",".join(["0.1"] * parameters) + ")" if parameters else ""
    operands = ",".join(f"q[{index}]" for index in range(qubits))
    return (
        'OPENQASM 2.0;\ninclude "qelib1.inc";\n'
        f"qreg q[{max(qubits, 1)}];\n{gate}{arguments} {operands};\n"
    )


def _qiskit_reader() -> Callable[[str], None]:
    """Qiskit's OpenQASM 2 reader, configured the way qelib1 requires.

    `loads(source)` alone cannot find `qelib1.inc` and reports almost the whole standard
    library as undefined. That looks like a portability finding and is a configuration
    mistake, so the legacy include path is not optional here.
    """
    from qiskit.qasm2 import LEGACY_CUSTOM_INSTRUCTIONS, LEGACY_INCLUDE_PATH, loads

    def read(source: str) -> None:
        loads(source, include_path=LEGACY_INCLUDE_PATH, custom_instructions=LEGACY_CUSTOM_INSTRUCTIONS)

    return read


def _qiskit_qasm3_reader() -> Callable[[str], None]:
    """Qiskit's OpenQASM *3* reader, which is a different entry point entirely.

    Probing OpenQASM 3 through `qasm2.loads` would fail by construction and report a loss
    Qiskit does not have. The first version of this module did exactly that.
    """
    from qiskit.qasm3 import loads

    def read(source: str) -> None:
        loads(source)

    return read


def _cirq_reader() -> Callable[[str], None]:
    import cirq.contrib.qasm_import as importer

    def read(source: str) -> None:
        importer.circuit_from_qasm(source)

    return read


def _pytket_reader() -> Callable[[str], None]:
    from pytket.qasm import circuit_from_qasm_str

    def read(source: str) -> None:
        circuit_from_qasm_str(source)

    return read


def _pennylane_reader() -> Callable[[str], None]:
    import pennylane as qml

    def read(source: str) -> None:
        qml.from_qasm(source)

    return read


#: OpenQASM 3 readers, where a framework has one distinct from its OpenQASM 2 reader.
#: A framework absent here is probed with its OpenQASM 2 reader, which is correct for a
#: framework that has no OpenQASM 3 support -- but wrong for one that does, which is why
#: Qiskit is listed.
QASM3_READERS: dict[str, Callable[[], Callable[[str], None]]] = {
    "qiskit": _qiskit_qasm3_reader,
}

READERS: dict[str, Callable[[], Callable[[str], None]]] = {
    "qiskit": _qiskit_reader,
    "cirq": _cirq_reader,
    "pytket": _pytket_reader,
    "pennylane": _pennylane_reader,
}


def reader_for(framework: str) -> Callable[[str], None]:
    if framework not in READERS:
        raise ValueError(f"No OpenQASM reader recorded for {framework!r}.")
    try:
        return READERS[framework]()
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise ProbeUnavailable(
            f"{framework} is not installed, so its conversion loss cannot be measured. "
            "An absent framework is not a refusing framework."
        ) from exc


def unreadable_gates(framework: str) -> list[str]:
    """Gates this project can emit that `framework` will not read.

    Measured one gate at a time against the installed library. A gate appearing here is a
    conversion that would produce a file the target cannot open, which is loss even though
    nothing was dropped on the way out.
    """
    read = reader_for(framework)
    refused: list[str] = []
    for gate, (qubits, parameters) in EMITTED_QELIB1_GATES.items():
        try:
            read(_qasm2_for(gate, qubits, parameters))
        except Exception:  # noqa: BLE001 - any reader error means the gate is unusable here
            refused.append(gate)
    return sorted(refused)


def accepts_openqasm3(framework: str) -> dict[str, Any]:
    """Whether `framework` reads OpenQASM 3, and whether it only appears to.

    The distinction matters more than the answer. cirq accepts a `OPENQASM 3.0;` header
    and parses the body as OpenQASM 2, so a 3.0 file using only 2.0-expressible
    constructs is read without complaint -- while genuinely 3.0-only syntax is refused.
    A reader that takes the header without supporting the language invites the belief
    that the conversion was lossless.
    """
    # The framework's OpenQASM 3 reader when it has one. Using its OpenQASM 2 reader here
    # would guarantee a refusal and invent a loss.
    factory = QASM3_READERS.get(framework)
    if factory is None:
        read = reader_for(framework)
    else:
        try:
            read = factory()
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise ProbeUnavailable(
                f"{framework}'s OpenQASM 3 reader is not installed, so its OpenQASM 3 support "
                "cannot be measured. Absent is not refusing."
            ) from exc
    expressible_in_two = (
        'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n'
    )
    # A single-bit condition, which OpenQASM 2 cannot express -- its `if` compares a whole
    # classical register. Written as `c[0] == true` because `c[0] == 1` compares a bit to an
    # int, which Qiskit rejects with "conditions must be 'bit == const bool' or
    # 'bitarray == const int'". That refusal is about the comparison, not about single-bit
    # conditions, and an earlier version of this probe mistook one for the other.
    three_only = (
        'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nbit[2] c;\n'
        "h q[0];\nc[0] = measure q[0];\nif (c[0] == true) { x q[1]; }\n"
    )

    def accepted(source: str) -> bool:
        try:
            read(source)
            return True
        except Exception:  # noqa: BLE001
            return False

    header_accepted = accepted(expressible_in_two)
    language_accepted = accepted(three_only)
    return {
        "framework": framework,
        "accepts_version_header": header_accepted,
        "accepts_openqasm3_only_syntax": language_accepted,
        # The dangerous combination: takes the header, does not support the language.
        "lenient_about_the_header": header_accepted and not language_accepted,
    }


def conversion_loss(framework: str) -> dict[str, Any]:
    """Everything measurably lost converting to `framework`.

    Each entry says how it was established. `probed` entries were measured against the
    installed library just now; `recorded` entries come from
    `framework_interop.FRAMEWORK_DIALECTS` and are properties of the reader's documented
    dialect rather than of this run.
    """
    dialect = FRAMEWORK_DIALECTS.get(framework, {})
    losses: list[dict[str, Any]] = []

    refused = unreadable_gates(framework)
    if refused:
        losses.append(
            {
                "feature": "unreadable_gates",
                "basis": "probed",
                "detail": (
                    f"{framework} will not read {', '.join(refused)} from OpenQASM 2, so a circuit "
                    "using them converts to a file it cannot open."
                ),
                "gates": refused,
            }
        )

    three = accepts_openqasm3(framework)
    if not three["accepts_openqasm3_only_syntax"]:
        losses.append(
            {
                "feature": "openqasm3_constructs",
                "basis": "probed",
                "detail": (
                    f"{framework} refuses OpenQASM 3-only syntax, so conversion goes through "
                    "OpenQASM 2 and inherits every restriction of that dialect -- single-bit "
                    "conditions and hardware qubits among them."
                    + (
                        " It nonetheless accepts a `OPENQASM 3.0;` header on a file it parses as "
                        "OpenQASM 2, which can look like OpenQASM 3 support."
                        if three["lenient_about_the_header"]
                        else ""
                    )
                ),
            }
        )

    ordering = FRAMEWORK_DIALECTS.get(framework, {})
    if dialect.get("note"):
        losses.append({"feature": "reader_caveat", "basis": "recorded", "detail": dialect["note"]})
    if not ordering.get("writes"):
        losses.append(
            {
                "feature": "no_export_path",
                "basis": "recorded",
                "detail": (
                    f"{framework} has no recorded OpenQASM writer, so a round trip back out of it "
                    "is not available through this route."
                ),
            }
        )

    return {
        "framework": framework,
        "reads": dialect.get("reads", []),
        "writes": dialect.get("writes", []),
        "losses": losses,
        # An empty list is a measured claim here, not a default.
        "lossless": not losses,
    }
