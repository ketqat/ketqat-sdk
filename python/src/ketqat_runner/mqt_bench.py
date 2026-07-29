"""Import benchmarks from MQT Bench (ketqat-sdk#166).

Item 9 asks for MQT Bench imports. MQT Bench does not distribute static circuit
files: it *generates* them, at four abstraction levels, from the `mqt.bench`
package. So this module drives the real upstream generator rather than shipping
a copied snapshot that would silently go stale.

The abstraction level is the whole story
----------------------------------------
MQT Bench's defining feature is that the same benchmark exists at four levels:
algorithmic, target-independent, native-gates, and mapped. Those are not minor
variations. Measured here for `qft` at logical size 4:

    ALG          4 qubits, depth  2,   6 operations,  0 two-qubit
    INDEP        4 qubits, depth  8,  15 operations,  6 two-qubit
    MAPPED     127 qubits, depth 69, 123 operations, 18 two-qubit

Twenty times the depth, and a qubit count set by the device rather than the
problem. **Comparing a result at one level against a result at another is
meaningless**, and it is an easy mistake because both records say "qft, size 4".

So the level is part of the comparability key, not a tag alongside it, and
`assert_comparable` refuses a mixed set naming exactly what differs. That is the
comparability gate item 9 asks for, applied where the difference is largest.

What is recorded, and why
-------------------------
Provenance is captured at import: benchmark name, level, requested size, the
device or gateset for target-dependent levels, and the upstream package version.
Without the version an import cannot be reproduced -- MQT Bench's generators
change, and a circuit regenerated later may differ from the one measured.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

#: The four levels, with what each one fixes. Ordered from most abstract.
MQT_BENCH_LEVELS: dict[str, str] = {
    "ALG": "Algorithmic. The circuit as the algorithm defines it, no gate-set or hardware assumptions.",
    "INDEP": "Target-independent. Synthesised to a generic gate set, still unmapped to any device.",
    "NATIVEGATES": "Target-dependent native gates. Translated to one device's gate set, still unmapped.",
    "MAPPED": "Target-dependent mapped. Routed onto a specific device's connectivity and qubit count.",
}

#: Levels that require a target, because they are defined relative to hardware.
TARGET_DEPENDENT_LEVELS = ("NATIVEGATES", "MAPPED")

#: Fields that must agree before two imported benchmarks may be compared.
#:
#: `level` is here rather than in a description because it changes depth and gate
#: count by more than an order of magnitude; `target` is here because a mapped
#: circuit's qubit count is the device's, not the problem's.
COMPARABILITY_FIELDS = ("benchmark", "level", "requested_size", "target", "mqt_bench_version")


class MqtBenchError(RuntimeError):
    """An import that could not be performed as specified."""


def _require_mqt() -> Any:
    try:
        import mqt.bench as module
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise MqtBenchError(
            "mqt.bench is not installed. Install it with `pip install mqt.bench`. This module drives "
            "the real generator rather than shipping copied circuits, so the package is required."
        ) from exc
    return module


def upstream_version() -> str:
    """The installed mqt.bench version, recorded so an import can be reproduced."""
    try:
        from importlib.metadata import version

        return version("mqt.bench")
    except Exception:  # pragma: no cover - environment dependent
        return "unknown"


def available_benchmarks() -> list[str]:
    """Benchmark names the installed MQT Bench offers."""
    _require_mqt()
    from mqt.bench.benchmarks import get_available_benchmark_names

    return sorted(get_available_benchmark_names())


def available_devices() -> list[str]:
    _require_mqt()
    from mqt.bench.targets import get_available_device_names

    return sorted(get_available_device_names())


def available_gatesets() -> list[str]:
    _require_mqt()
    from mqt.bench.targets import get_available_gateset_names

    return sorted(get_available_gateset_names())


def import_benchmark(
    benchmark: str,
    *,
    level: str = "INDEP",
    size: int = 4,
    device: str | None = None,
    gateset: str | None = None,
    optimization_level: int = 2,
) -> dict[str, Any]:
    """Generate one MQT Bench circuit and record it with its provenance.

    Returns OpenQASM 3 alongside measured properties and everything needed to
    regenerate the same circuit. The measurements are taken from the generated
    circuit rather than predicted, so they describe what was actually produced.
    """
    _require_mqt()
    from mqt.bench import BenchmarkLevel, get_benchmark

    if level not in MQT_BENCH_LEVELS:
        raise MqtBenchError(
            f"{level!r} is not an MQT Bench level. Expected one of {', '.join(MQT_BENCH_LEVELS)}."
        )
    if size < 1:
        raise MqtBenchError(f"Circuit size must be at least 1, not {size}.")

    target_name: str | None = None
    kwargs: dict[str, Any] = {
        "benchmark": benchmark,
        "level": BenchmarkLevel[level],
        "circuit_size": size,
        "opt_level": optimization_level,
    }

    if level in TARGET_DEPENDENT_LEVELS:
        from mqt.bench.targets import get_device, get_target_for_gateset

        if level == "MAPPED":
            if not device:
                raise MqtBenchError(
                    "The MAPPED level routes onto a specific device, so a device is required. "
                    f"Available: {', '.join(available_devices())}."
                )
            kwargs["target"] = get_device(device)
            target_name = device
        else:
            if not gateset:
                raise MqtBenchError(
                    "The NATIVEGATES level translates to one device's gate set, so a gateset is "
                    f"required. Available: {', '.join(available_gatesets())}."
                )
            kwargs["target"] = get_target_for_gateset(gateset, num_qubits=size)
            target_name = gateset
    elif device or gateset:
        raise MqtBenchError(
            f"The {level} level is target-independent, so a device or gateset would be ignored. "
            "Passing one suggests a level was chosen by mistake, so it is refused rather than dropped."
        )

    try:
        circuit = get_benchmark(**kwargs)
    except Exception as exc:
        raise MqtBenchError(
            f"MQT Bench could not generate {benchmark!r} at level {level} size {size}: {exc}"
        ) from exc

    try:
        from qiskit import qasm3

        openqasm = qasm3.dumps(circuit)
    except Exception as exc:
        raise MqtBenchError(f"The generated circuit could not be exported as OpenQASM 3: {exc}") from exc

    two_qubit = sum(1 for instruction in circuit.data if len(instruction.qubits) == 2)
    multi_qubit = sum(1 for instruction in circuit.data if len(instruction.qubits) > 2)

    return {
        "suite": "mqt-bench",
        "benchmark": benchmark,
        "level": level,
        "level_meaning": MQT_BENCH_LEVELS[level],
        "requested_size": size,
        "target": target_name,
        "mqt_bench_version": upstream_version(),
        "optimization_level": optimization_level,
        "openqasm3": openqasm,
        # Measured from the generated circuit, not predicted from the request.
        # At MAPPED the qubit count is the device's, which is why it is reported
        # separately from requested_size rather than assumed equal to it.
        "qubit_count": circuit.num_qubits,
        "depth": circuit.depth(),
        "operation_count": len(circuit.data),
        "two_qubit_operation_count": two_qubit,
        "multi_qubit_operation_count": multi_qubit,
        "size_matches_request": circuit.num_qubits == size,
        # Recorded per import: this is the loss/equivalence report item 2 asks
        # for, at the point where the information exists.
        "ketqat_importability": assess_importability(openqasm),
    }


def comparability_key(record: dict[str, Any], fields: Sequence[str] = COMPARABILITY_FIELDS) -> tuple:
    """The tuple two records must share to be comparable."""
    return tuple(record.get(field) for field in fields)


def assert_comparable(records: Iterable[dict[str, Any]]) -> None:
    """Refuse a set of records that cannot be meaningfully compared.

    The gate that matters. Two records can both read "qft, size 4" and differ by
    twenty times in depth because one is algorithmic and the other is mapped to a
    127-qubit device. Refusing names the fields that differ, so the caller can see
    whether the difference is the thing they meant to study or an accident.
    """
    listed = list(records)
    if len(listed) < 2:
        return

    first = comparability_key(listed[0])
    for index, record in enumerate(listed[1:], start=1):
        key = comparability_key(record)
        if key == first:
            continue
        differing = [
            field
            for field in COMPARABILITY_FIELDS
            if listed[0].get(field) != record.get(field)
        ]
        # `level` is called out by name because it is the one that changes results
        # by orders of magnitude while leaving both records looking alike.
        emphasis = (
            " The abstraction level differs, which changes depth and gate count by more than an "
            "order of magnitude -- these measure different circuits."
            if "level" in differing
            else ""
        )
        raise MqtBenchError(
            f"Records 0 and {index} are not comparable: {', '.join(differing)} differ.{emphasis}"
        )


def compare_levels(benchmark: str, size: int, levels: Sequence[str] = ("ALG", "INDEP")) -> dict[str, Any]:
    """Import one benchmark at several levels to show how much the level matters.

    Deliberately *not* presented as a comparison of results. It is a comparison of
    how differently the same algorithm is expressed, which is the argument for the
    comparability gate rather than a violation of it.
    """
    imported = [import_benchmark(benchmark, level=level, size=size) for level in levels]
    return {
        "benchmark": benchmark,
        "size": size,
        "levels": [
            {
                "level": record["level"],
                "qubit_count": record["qubit_count"],
                "depth": record["depth"],
                "operation_count": record["operation_count"],
                "two_qubit_operation_count": record["two_qubit_operation_count"],
            }
            for record in imported
        ],
        "note": (
            "These are the same algorithm at different abstraction levels, not competing results. "
            "The spread is the reason `assert_comparable` treats level as part of the identity of a "
            "measurement rather than as a label beside it."
        ),
    }


#: OpenQASM 3 constructs Qiskit emits that KetQat's parser does not accept.
#:
#: Measured, not guessed. Of 23 MQT Bench benchmarks that generate at INDEP size
#: 3 (mqt.bench 2.2.3), KetQat's parser accepts 20. Only one group remains, and
#: the pattern below was derived from the parser's own error rather than from
#: reading a specification:
#:
#:     3 fail on conditional forms the adapter does not support
#:
#: Two groups have been closed since this was first measured: hardware qubit
#: syntax ($n) in ketqat-sdk#168, and custom `gate` definitions in #170. Their
#: patterns were removed rather than left to predict failures that no longer
#: happen -- a stale pessimistic predictor is as wrong as an optimistic one.
#: Detected at import so a record carries its own importability, instead of the
#: suite claiming to work and failing later on two thirds of its contents.
DIALECT_RISKS: tuple[tuple[str, str, str], ...] = (
    (
        "classical_condition",
        "if (",
        "Contains a classical condition. KetQat accepts only equality conditions on a whole "
        "classical register, so some forms are rejected.",
    ),
)


def assess_importability(openqasm: str) -> dict[str, Any]:
    """Whether KetQat's OpenQASM 3 parser is expected to accept this circuit.

    A prediction, and labelled as one -- the authority is the parser itself. It
    exists so an import records its own limitations at the point of import rather
    than discovering them downstream, and it is verified against the real parser
    in the test suite rather than trusted.
    """
    found = []
    for name, marker, explanation in DIALECT_RISKS:
        if marker in openqasm:
            found.append({"construct": name, "explanation": explanation})
    return {
        "expected_to_parse": len(found) == 0,
        "blocking_constructs": found,
        "authority": (
            "Predicted by pattern from constructs the parser is known to reject. The parser is the "
            "authority; this is recorded so a failure is anticipated rather than discovered later."
        ),
    }
