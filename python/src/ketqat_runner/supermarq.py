"""Import benchmarks from SupermarQ (ketqat-sdk#174).

Item 9's second suite. SupermarQ is built on Cirq, so this import path is also
the first real exercise of Cirq interoperability, and it turned out to be the
first honest test of whether the OpenQASM work done for MQT Bench generalised.

It did not. Cirq emits **OpenQASM 2**, and the adapter rejected it at the version
line -- so all nine SupermarQ circuits failed on line 3, despite the adapter
already carrying OpenQASM 2 compatibility for `qreg`/`creg` and
`measure a -> b`. Those shims existed and were unreachable. Fixed in the same
change; coverage went 0/9 to 9/9.

Two things this suite makes unavoidable, both recorded per import:

**Bit ordering is a convention, and the two frameworks disagree.** Cirq orders
statevector amplitudes with its first qubit most significant; KetQat orders them
least significant. Six of the nine circuits agree either way because their states
are symmetric under bit reversal -- GHZ is the obvious one -- and three do not.
A user comparing KetQat output against Cirq output will hit this, and it looks
exactly like a wrong answer. So it is stated rather than left to be discovered.

**SupermarQ is a scoring suite, not a circuit dump.** Each benchmark defines its
own figure of merit through `score()`, computed from measured counts. That score
is what the suite is for, and it is *not* interchangeable with a depth or a gate
count. `assert_comparable` refuses to put a SupermarQ score beside a structural
metric from another suite, which is the cross-suite gate item 9 asks for.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

#: The eight SupermarQ benchmarks, with the constructor arguments each needs.
#:
#: Recorded as data rather than discovered by reflection, because the
#: constructors differ: some take a qubit count, the code benchmarks also take a
#: number of rounds and an initial state, and VQEProxy takes a layer count. A
#: reflective loader would have to guess those.
SUPERMARQ_BENCHMARKS: dict[str, dict[str, Any]] = {
    "ghz": {"module": "supermarq.benchmarks.ghz", "cls": "GHZ", "args": ("qubits",)},
    "mermin_bell": {"module": "supermarq.benchmarks.mermin_bell", "cls": "MerminBell", "args": ("qubits",)},
    "bit_code": {
        "module": "supermarq.benchmarks.bit_code",
        "cls": "BitCode",
        "args": ("qubits", "rounds", "initial_state"),
    },
    "phase_code": {
        "module": "supermarq.benchmarks.phase_code",
        "cls": "PhaseCode",
        "args": ("qubits", "rounds", "initial_state"),
    },
    "hamiltonian_simulation": {
        "module": "supermarq.benchmarks.hamiltonian_simulation",
        "cls": "HamiltonianSimulation",
        "args": ("qubits",),
    },
    "qaoa_vanilla": {
        "module": "supermarq.benchmarks.qaoa_vanilla_proxy",
        "cls": "QAOAVanillaProxy",
        "args": ("qubits",),
    },
    "qaoa_fermionic": {
        "module": "supermarq.benchmarks.qaoa_fermionic_swap_proxy",
        "cls": "QAOAFermionicSwapProxy",
        "args": ("qubits",),
    },
    "vqe": {"module": "supermarq.benchmarks.vqe_proxy", "cls": "VQEProxy", "args": ("qubits", "layers")},
}

#: Fields that must agree before two SupermarQ imports may be compared.
COMPARABILITY_FIELDS = ("suite", "benchmark", "qubits", "rounds", "layers", "supermarq_version")

#: Metrics that are only meaningful within the suite that defines them.
#:
#: A SupermarQ score is defined by its own benchmark -- fidelity against an ideal
#: distribution, or a Hamiltonian expectation -- and has no common scale with a
#: circuit depth. Putting them in one table would produce a number nobody can
#: interpret, which is the "one-entry comparison" failure in a different costume.
SUITE_SPECIFIC_METRICS = ("supermarq_score",)


class SupermarqError(RuntimeError):
    """An import that could not be performed as specified."""


def _require() -> None:
    try:
        import supermarq  # noqa: F401
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise SupermarqError(
            "supermarq is not installed. Install it with `pip install supermarq`. This module drives "
            "the real generator rather than shipping copied circuits, so the package is required."
        ) from exc


def upstream_version() -> str:
    try:
        from importlib.metadata import version

        return version("supermarq")
    except Exception:  # pragma: no cover - environment dependent
        return "unknown"


def available_benchmarks() -> list[str]:
    return sorted(SUPERMARQ_BENCHMARKS)


def import_benchmark(
    benchmark: str,
    *,
    qubits: int = 3,
    rounds: int = 2,
    layers: int = 1,
) -> dict[str, Any]:
    """Generate one SupermarQ benchmark and record it with its provenance.

    Returns every circuit the benchmark defines. VQEProxy returns two, and
    collapsing them to one would silently drop half the benchmark.
    """
    _require()
    if benchmark not in SUPERMARQ_BENCHMARKS:
        raise SupermarqError(
            f"{benchmark!r} is not a SupermarQ benchmark. Available: {', '.join(available_benchmarks())}."
        )
    if qubits < 2:
        raise SupermarqError(f"SupermarQ benchmarks need at least two qubits, not {qubits}.")

    spec = SUPERMARQ_BENCHMARKS[benchmark]
    module = __import__(spec["module"], fromlist=[spec["cls"]])
    constructor = getattr(module, spec["cls"])

    supplied = {"qubits": qubits, "rounds": rounds, "layers": layers, "initial_state": [1] * qubits}
    try:
        instance = constructor(*(supplied[name] for name in spec["args"]))
    except Exception as exc:
        raise SupermarqError(f"SupermarQ could not construct {benchmark!r}: {exc}") from exc

    import cirq

    produced = instance.circuit()
    circuits = list(produced) if isinstance(produced, (list, tuple)) else [produced]

    entries = []
    for index, circuit in enumerate(circuits):
        try:
            openqasm = cirq.qasm(circuit)
        except Exception as exc:
            raise SupermarqError(f"Cirq could not export {benchmark!r} circuit {index} as OpenQASM: {exc}") from exc
        operations = list(circuit.all_operations())
        entries.append(
            {
                "index": index,
                "openqasm2": openqasm,
                "qubit_count": len(circuit.all_qubits()),
                "operation_count": len(operations),
                "two_qubit_operation_count": sum(1 for op in operations if len(op.qubits) == 2),
                "moment_count": len(circuit),
            }
        )

    return {
        "suite": "supermarq",
        "benchmark": benchmark,
        "qubits": qubits,
        "rounds": rounds if "rounds" in spec["args"] else None,
        "layers": layers if "layers" in spec["args"] else None,
        "supermarq_version": upstream_version(),
        "cirq_version": cirq.__version__,
        "circuits": entries,
        # Cirq emits OpenQASM 2, which KetQat reads through a compatibility path.
        # Recorded because a round trip produces OpenQASM 3, so the version
        # declaration changes.
        "source_dialect": "OpenQASM 2",
        "bit_ordering": {
            "cirq": "first qubit most significant",
            "ketqat": "first qubit least significant",
            "note": (
                "The two conventions disagree. States symmetric under bit reversal -- GHZ among them -- "
                "agree either way; asymmetric ones do not, and the difference looks exactly like a "
                "wrong answer. Reverse the bit order before comparing amplitudes or bitstrings across "
                "the two."
            ),
        },
        "scoring": {
            "defines_own_score": True,
            "computed_here": False,
            "note": (
                "SupermarQ defines a per-benchmark figure of merit via score(), computed from measured "
                "counts. It is not computed at import: a score requires a run, and recording one here "
                "without executing the circuit would be presenting a placeholder as a measurement."
            ),
        },
    }


def comparability_key(record: dict[str, Any], fields: Sequence[str] = COMPARABILITY_FIELDS) -> tuple:
    return tuple(record.get(field) for field in fields)


def assert_comparable(records: Iterable[dict[str, Any]]) -> None:
    """Refuse records that cannot be meaningfully compared, within or across suites.

    Cross-suite is the case worth naming. A SupermarQ score is defined by its own
    benchmark and shares no scale with an MQT Bench depth; putting them in one
    table produces a number nobody can interpret. That is the same failure as a
    one-entry comparison, wearing different clothes.
    """
    listed = list(records)
    if len(listed) < 2:
        return

    suites = {record.get("suite") for record in listed}
    if len(suites) > 1:
        raise SupermarqError(
            f"These records come from different suites ({', '.join(sorted(str(s) for s in suites))}). "
            "Benchmark suites define their own figures of merit and their own circuit families, so a "
            "score from one is not comparable with a metric from another. Compare within a suite, or "
            "compare a quantity both suites define the same way."
        )

    first = comparability_key(listed[0])
    for index, record in enumerate(listed[1:], start=1):
        if comparability_key(record) == first:
            continue
        differing = [
            field for field in COMPARABILITY_FIELDS if listed[0].get(field) != record.get(field)
        ]
        raise SupermarqError(f"Records 0 and {index} are not comparable: {', '.join(differing)} differ.")
