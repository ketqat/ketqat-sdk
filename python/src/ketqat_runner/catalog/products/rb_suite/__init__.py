"""kq.qinfo.randomized-benchmarking-suite 1.0.0 and 1.1.0: standard, interleaved and simultaneous RB.

Both versions run this code. 1.0.0 was first distributed outside this
repository; 1.1.0 is the same implementation released here under Apache-2.0,
so the same parameters and seed give the same resultSha256 under either
version (python/tests/test_catalog_version_compat.py checks recorded hashes).

The catalog definition's inputs are this module's interface: the SDK checks
names, types and declared constraints before calling `validate(params)` and
then `run(params, seed)`. Cross-field rules the definition cannot express (a
two-qubit gate on one qubit, the work ceiling) live in `validate` and raise
ParameterError, so no run record is written.

The Clifford group enumeration, the sequence builders and the interleaved and
addressability estimators are those of `ketqat_runner.randomized_benchmarking`.
This package adds the suite: standard, interleaved and simultaneous RB in one
workflow with per-sequence data, a weighted nonlinear decay fit, bootstrap
confidence intervals over sequences, a separate noise rate for the interleaved
gate, analytic expectations for the depolarizing model, and a Markdown report.
"""
from __future__ import annotations

from ...params import ParameterError
from .analysis import run_suite
from .sampling import interleavable_gates

INPUTS = ("qubits", "sequence_lengths", "sequences_per_length", "depolarizing_rate", "shots", "interleaved_gate",
          "interleaved_gate_depolarizing_rate", "simultaneous_crosstalk_rate")
OUTPUTS = ("decay_parameter", "error_per_clifford", "standard", "interleaved", "simultaneous", "report")
#: Clifford applications per RB variant (sum of lengths x sequences); keeps a run to minutes at most.
MAX_CLIFFORD_APPLICATIONS = 500_000
MAX_RATE = 0.5


def _rate(params: dict, name: str, required: bool) -> None:
    value = params.get(name)
    if value is None:
        if required:
            raise ParameterError(f"Parameter {name!r} is required.")
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= MAX_RATE:
        raise ParameterError(f"Parameter {name!r} must lie in [0, {MAX_RATE}]; got {value!r}.")


def validate(params: dict) -> None:
    unknown = set(params) - set(INPUTS)
    if unknown:
        raise ParameterError(f"unsupported parameters: {sorted(unknown)}; accepted: {list(INPUTS)}")
    qubits = params.get("qubits")
    if isinstance(qubits, bool) or qubits not in (1, 2):
        raise ParameterError("Parameter 'qubits' must be 1 or 2.")
    lengths = params.get("sequence_lengths")
    if not isinstance(lengths, list) or len(lengths) < 3:
        raise ParameterError("Parameter 'sequence_lengths' must list at least three lengths.")
    for m in lengths:
        if isinstance(m, bool) or not isinstance(m, int) or m < 1:
            raise ParameterError(f"Parameter 'sequence_lengths' must contain positive integers; got {m!r}.")
    if len(set(lengths)) != len(lengths):
        raise ParameterError("Parameter 'sequence_lengths' must not repeat a length.")
    sequences = params.get("sequences_per_length")
    if isinstance(sequences, bool) or not isinstance(sequences, int) or sequences < 2:
        raise ParameterError("Parameter 'sequences_per_length' must be an integer >= 2.")
    shots = params.get("shots")
    if isinstance(shots, bool) or not isinstance(shots, int) or shots < 1:
        raise ParameterError("Parameter 'shots' must be a positive integer.")
    _rate(params, "depolarizing_rate", required=True)
    _rate(params, "interleaved_gate_depolarizing_rate", required=False)
    _rate(params, "simultaneous_crosstalk_rate", required=False)
    gate = params.get("interleaved_gate")
    if gate is not None and gate not in interleavable_gates(qubits):
        raise ParameterError(f"Parameter 'interleaved_gate' must be one of {sorted(interleavable_gates(qubits))} for {qubits} qubit(s); got {gate!r}.")
    if params.get("interleaved_gate_depolarizing_rate") is not None and gate is None:
        raise ParameterError("Parameter 'interleaved_gate_depolarizing_rate' needs an 'interleaved_gate'.")
    work = sum(lengths) * sequences
    if work > MAX_CLIFFORD_APPLICATIONS:
        raise ParameterError(
            f"sum(sequence_lengths) x sequences_per_length = {work} Clifford applications per variant exceeds the limit of "
            f"{MAX_CLIFFORD_APPLICATIONS}. Use fewer or shorter sequences."
        )


def run(params: dict, seed: int | None = None) -> dict:
    validate(params)
    result = run_suite(
        qubits=params["qubits"],
        sequence_lengths=params["sequence_lengths"],
        sequences_per_length=params["sequences_per_length"],
        depolarizing_rate=float(params["depolarizing_rate"]),
        shots=params["shots"],
        seed=0 if seed is None else int(seed),
        interleaved_gate=params.get("interleaved_gate"),
        interleaved_gate_depolarizing_rate=params.get("interleaved_gate_depolarizing_rate"),
        simultaneous_crosstalk_rate=params.get("simultaneous_crosstalk_rate"),
    )
    missing = [name for name in OUTPUTS if name not in result]
    if missing:
        raise RuntimeError(f"result lacks declared outputs {missing}")
    return result


__all__ = ["run", "validate", "INPUTS", "OUTPUTS"]
