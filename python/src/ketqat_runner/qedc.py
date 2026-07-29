"""Import benchmarks from the QED-C application-oriented suite (ketqat-sdk#176).

The other half of item 9's QED-C/SupermarQ row.

**A prediction of mine that was wrong, recorded because it shaped the plan.** I
expected QED-C to be a third independent toolchain after Qiskit/OpenQASM 3 (MQT
Bench) and Cirq/OpenQASM 2 (SupermarQ), and therefore a fresh test of whether the
parser generalises. It is not: QED-C builds Qiskit circuits, the same dialect as
MQT Bench, and all nine circuits parsed on the first attempt. So this adds *suite*
breadth, not *dialect* breadth, and the generalisation value I claimed for it does
not exist.

What QED-C does add is a different notion of what a benchmark is
-------------------------------------------------------------------
MQT Bench varies the abstraction level. SupermarQ scores a fixed circuit. QED-C
**sweeps circuit width** and reports fidelity against width and depth -- the
volumetric plots the suite is known for. The sweep is the benchmark, so importing
a single width discards the thing being measured.

That inverts a comparability rule. For SupermarQ, two records of different width
are not comparable: they are different measurements. For QED-C, comparing across
width is the entire point, and the gate must instead insist that everything
*except* width matches -- same benchmark, same method, same suite version. Copying
SupermarQ's rule here would forbid exactly the comparison the suite exists to make.

Fidelity, as with SupermarQ, needs a run and is not invented at import.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

#: QED-C benchmarks and the module each lives in.
#:
#: Listed explicitly rather than discovered, because the module names do not
#: follow one rule -- `bv_benchmark`, `dj_benchmark`, `hamiltonian_simulation_
#: benchmark` -- and a reflective loader would have to guess.
QEDC_BENCHMARKS: dict[str, str] = {
    "bernstein_vazirani": "qedcbench.bernstein_vazirani.bv_benchmark",
    "deutsch_jozsa": "qedcbench.deutsch_jozsa.dj_benchmark",
    "quantum_fourier_transform": "qedcbench.quantum_fourier_transform.qft_benchmark",
    "grovers": "qedcbench.grovers.grovers_benchmark",
    "hidden_shift": "qedcbench.hidden_shift.hs_benchmark",
    "phase_estimation": "qedcbench.phase_estimation.pe_benchmark",
    "amplitude_estimation": "qedcbench.amplitude_estimation.ae_benchmark",
    "monte_carlo": "qedcbench.monte_carlo.mc_benchmark",
    "hamiltonian_simulation": "qedcbench.hamiltonian_simulation.hamiltonian_simulation_benchmark",
}

#: Fields that must agree for two QED-C records to be comparable.
#:
#: `qubits` is deliberately absent. QED-C sweeps width and plots fidelity against
#: it, so requiring equal width would forbid the comparison the suite exists to
#: make. Everything that would make two widths incomparable -- a different
#: benchmark, method, or suite version -- is required instead.
COMPARABILITY_FIELDS = ("suite", "benchmark", "method", "qedc_version")


class QedcError(RuntimeError):
    """An import that could not be performed as specified."""


def _require() -> None:
    try:
        import qedcbench  # noqa: F401
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise QedcError(
            "qedcbench is not installed. Install it with `pip install qedcbench`. This module drives "
            "the real generator rather than shipping copied circuits, so the package is required."
        ) from exc


def upstream_version() -> str:
    try:
        from importlib.metadata import version

        return version("qedcbench")
    except Exception:  # pragma: no cover - environment dependent
        return "unknown"


def available_benchmarks() -> list[str]:
    return sorted(QEDC_BENCHMARKS)


def import_sweep(
    benchmark: str,
    *,
    min_qubits: int = 4,
    max_qubits: int = 6,
    max_circuits: int = 1,
    method: int = 1,
) -> dict[str, Any]:
    """Import a QED-C width sweep, which is the unit the suite measures.

    Returns one entry per width. A single-width import is available by setting
    min and max equal, but the default is a sweep because that is what the
    benchmark is.
    """
    _require()
    if benchmark not in QEDC_BENCHMARKS:
        raise QedcError(
            f"{benchmark!r} is not a QED-C benchmark. Available: {', '.join(available_benchmarks())}."
        )
    if min_qubits < 2:
        raise QedcError(f"QED-C benchmarks need at least two qubits, not {min_qubits}.")
    if max_qubits < min_qubits:
        raise QedcError(f"max_qubits ({max_qubits}) is below min_qubits ({min_qubits}).")

    import importlib

    from qiskit import qasm3

    module = importlib.import_module(QEDC_BENCHMARKS[benchmark])
    if not hasattr(module, "get_circuits"):
        raise QedcError(f"{benchmark!r} exposes no get_circuits entry point in this qedcbench version.")

    # The signatures genuinely differ across benchmarks: only five of the nine
    # accept `method`, and others take `use_mcx_shim`, `num_state_qubits` or
    # `init_phase` instead. Passing `method` unconditionally raised a TypeError on
    # deutsch_jozsa, so what is accepted is read from the signature rather than
    # assumed uniform.
    import inspect

    accepted = set(inspect.signature(module.get_circuits).parameters)
    arguments: dict[str, Any] = {
        "min_qubits": min_qubits,
        "max_qubits": max_qubits,
        "max_circuits": max_circuits,
    }
    method_applied = "method" in accepted
    if method_applied:
        arguments["method"] = method

    try:
        produced = module.get_circuits(**arguments)
    except Exception as exc:
        raise QedcError(f"QED-C could not generate {benchmark!r}: {exc}") from exc

    # get_circuits returns (circuits, metadata); older versions returned circuits
    # alone, so both shapes are accepted rather than assumed.
    circuits = produced[0] if isinstance(produced, tuple) else produced
    if not isinstance(circuits, dict):
        raise QedcError(
            f"Expected a width-keyed mapping of circuits from {benchmark!r}, got {type(circuits).__name__}."
        )

    entries: list[dict[str, Any]] = []
    for width, by_id in sorted(circuits.items(), key=lambda item: int(item[0])):
        for circuit_id, circuit in sorted(by_id.items(), key=lambda item: str(item[0])):
            try:
                openqasm = qasm3.dumps(circuit)
            except Exception as exc:
                raise QedcError(
                    f"Could not export {benchmark!r} width {width} circuit {circuit_id} as OpenQASM 3: {exc}"
                ) from exc
            entries.append(
                {
                    "requested_width": int(width),
                    "circuit_id": str(circuit_id),
                    "openqasm3": openqasm,
                    "qubit_count": circuit.num_qubits,
                    "depth": circuit.depth(),
                    "operation_count": len(circuit.data),
                    "two_qubit_operation_count": sum(1 for item in circuit.data if len(item.qubits) == 2),
                }
            )

    if not entries:
        # QED-C benchmarks have per-benchmark minimum widths -- monte_carlo method 1
        # needs at least 5 qubits, for instance -- and below them the generator
        # returns an empty mapping rather than raising. A generic "no circuits"
        # message sent me looking in the wrong place, so the likely cause is named.
        raise QedcError(
            f"{benchmark!r} produced no circuits for widths {min_qubits}..{max_qubits}. QED-C "
            "benchmarks have per-benchmark minimum widths and return nothing below them rather than "
            "raising; try a larger min_qubits. The generator prints its own minimum when it declines."
        )

    return {
        "suite": "qedc",
        "benchmark": benchmark,
        # None when this benchmark takes no `method`, rather than a value that was
        # silently ignored -- otherwise two records could differ in a field that
        # never reached the generator.
        "method": method if method_applied else None,
        "accepts_method": method_applied,
        "qedc_version": upstream_version(),
        "min_qubits": min_qubits,
        "max_qubits": max_qubits,
        "circuits": entries,
        # Same dialect as MQT Bench: QED-C builds Qiskit circuits. Recorded so the
        # breadth this import adds is not mistaken for dialect coverage.
        "source_dialect": "OpenQASM 3 (via Qiskit, same path as MQT Bench)",
        "sweep": {
            "is_sweep": len(entries) > 1,
            "widths": sorted({entry["requested_width"] for entry in entries}),
            "note": (
                "QED-C reports fidelity against circuit width and depth -- the volumetric plots the "
                "suite is known for -- so the sweep is the benchmark. Importing one width discards "
                "what is being measured, which is why comparability here permits differing width and "
                "requires everything else to match."
            ),
        },
        "scoring": {
            "defines_own_score": True,
            "computed_here": False,
            "note": (
                "QED-C's figure of merit is a normalised fidelity against the ideal distribution, "
                "computed from a run. It is not computed at import: recording a fidelity without "
                "executing the circuit would present a placeholder as a measurement."
            ),
        },
    }


def comparability_key(record: dict[str, Any], fields: Sequence[str] = COMPARABILITY_FIELDS) -> tuple:
    return tuple(record.get(field) for field in fields)


def assert_comparable(records: Iterable[dict[str, Any]]) -> None:
    """Refuse records that cannot be meaningfully compared.

    Note what is *not* refused: differing width. QED-C exists to compare across
    width, so a gate that rejected it would forbid the suite's own purpose. This
    is the opposite of the SupermarQ rule, and the difference is deliberate --
    a comparability gate has to encode what a particular suite means by a
    comparison, not one project-wide notion of sameness.
    """
    listed = list(records)
    if len(listed) < 2:
        return

    suites = {record.get("suite") for record in listed}
    if len(suites) > 1:
        raise QedcError(
            f"These records come from different suites ({', '.join(sorted(str(s) for s in suites))}). "
            "Each suite defines its own figure of merit and its own circuit families, so metrics from "
            "different suites share no scale."
        )

    first = comparability_key(listed[0])
    for index, record in enumerate(listed[1:], start=1):
        if comparability_key(record) == first:
            continue
        differing = [field for field in COMPARABILITY_FIELDS if listed[0].get(field) != record.get(field)]
        raise QedcError(
            f"Records 0 and {index} are not comparable: {', '.join(differing)} differ. "
            "Differing circuit width is fine here -- QED-C sweeps width by design -- but the benchmark, "
            "method and suite version must match."
        )


def benchmark_availability(*, probe_width: int = 6) -> dict[str, dict[str, Any]]:
    """Probe every benchmark and report which actually work here.

    Measured rather than declared. `monte_carlo` in qedcbench 2.0.8 calls
    `numpy.math`, removed in numpy 2.0, so it raises on any width -- and a
    hardcoded exclusion list would either go stale when upstream fixes it or hide
    a different failure behind the same name. Probing reports what is true of the
    installed versions.

    Distinguishes two failure modes that look alike from the outside: a benchmark
    that declines a width because it has a higher minimum, and one that is broken.
    """
    _require()
    report: dict[str, dict[str, Any]] = {}
    for name in available_benchmarks():
        try:
            imported = import_sweep(name, min_qubits=probe_width, max_qubits=probe_width)
            report[name] = {
                "available": True,
                "circuits": len(imported["circuits"]),
                "reason": None,
            }
        except QedcError as error:
            message = str(error)
            report[name] = {
                "available": False,
                "circuits": 0,
                "reason": message,
                "cause": "minimum_width" if "minimum widths" in message else "upstream_error",
            }
    return report
