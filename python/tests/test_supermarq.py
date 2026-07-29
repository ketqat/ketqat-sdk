"""Tests for the SupermarQ importer (ketqat-sdk#174).

Skipped rather than mocked when supermarq is absent: a mocked upstream would
prove the mock works, and driving the real generator is the point.
"""

from __future__ import annotations

import pytest

pytest.importorskip("supermarq", reason="supermarq is an optional [benchmarks] extra")
pytest.importorskip("cirq", reason="cirq is an optional [benchmarks] extra")

from ketqat_runner.supermarq import (  # noqa: E402
    COMPARABILITY_FIELDS,
    SUITE_SPECIFIC_METRICS,
    SUPERMARQ_BENCHMARKS,
    SupermarqError,
    assert_comparable,
    available_benchmarks,
    comparability_key,
    import_benchmark,
    upstream_version,
)


def test_every_benchmark_imports_from_the_real_generator() -> None:
    """All eight, driven by supermarq itself rather than fixtures."""
    assert len(available_benchmarks()) == 8
    for name in available_benchmarks():
        record = import_benchmark(name, qubits=3)
        assert record["suite"] == "supermarq"
        assert record["supermarq_version"] == upstream_version()
        assert len(record["circuits"]) >= 1
        for entry in record["circuits"]:
            assert "OPENQASM 2" in entry["openqasm2"]
            assert entry["operation_count"] > 0


def test_multi_circuit_benchmarks_keep_every_circuit() -> None:
    """VQEProxy defines two circuits; collapsing them would drop half the benchmark."""
    assert len(import_benchmark("vqe", qubits=3)["circuits"]) == 2


def test_the_source_dialect_is_recorded_as_openqasm_2() -> None:
    """Cirq emits OpenQASM 2, which KetQat reads through a compatibility path.

    Worth recording because a round trip emits OpenQASM 3, so the declared version
    changes. This was also the reason every SupermarQ circuit failed before: the
    adapter rejected the version line while already carrying OpenQASM 2 shims for
    `qreg`/`creg` and `measure a -> b`.
    """
    assert import_benchmark("ghz", qubits=3)["source_dialect"] == "OpenQASM 2"


def test_bit_ordering_disagreement_is_stated() -> None:
    """Cirq and KetQat order amplitudes oppositely, and it looks like a wrong answer.

    Six of the nine SupermarQ circuits agree either way because their states are
    symmetric under bit reversal; three do not. Recording the convention is the
    difference between an interoperability note and a bug report.
    """
    ordering = import_benchmark("mermin_bell", qubits=3)["bit_ordering"]
    assert "most significant" in ordering["cirq"]
    assert "least significant" in ordering["ketqat"]
    assert "Reverse the bit order" in ordering["note"]


def test_scoring_is_declared_but_not_computed() -> None:
    """SupermarQ's figure of merit needs a run, so it is not invented at import.

    Recording a score without executing the circuit would be presenting a
    placeholder as a measurement.
    """
    scoring = import_benchmark("ghz", qubits=3)["scoring"]
    assert scoring["defines_own_score"] is True
    assert scoring["computed_here"] is False
    assert "requires a run" in scoring["note"]
    assert "supermarq_score" in SUITE_SPECIFIC_METRICS


def test_cross_suite_comparison_is_refused() -> None:
    """The gate item 9 asks for, on the case that matters most.

    A SupermarQ score is defined by its own benchmark and shares no scale with an
    MQT Bench depth. Tabulating them together produces a number nobody can
    interpret -- the same failure as a one-entry comparison in different clothes.
    """
    supermarq_record = import_benchmark("ghz", qubits=3)
    with pytest.raises(SupermarqError, match="different suites"):
        assert_comparable([supermarq_record, {"suite": "mqt-bench", "benchmark": "ghz"}])


def test_within_suite_differences_are_also_refused() -> None:
    """Same suite is not enough: size and version must match too."""
    three = import_benchmark("ghz", qubits=3)
    with pytest.raises(SupermarqError, match="qubits differ"):
        assert_comparable([three, import_benchmark("ghz", qubits=4)])
    assert_comparable([three, import_benchmark("ghz", qubits=3)])


def test_comparability_key_includes_version_and_shape() -> None:
    """Without the upstream version an import cannot be reproduced."""
    assert "supermarq_version" in COMPARABILITY_FIELDS
    assert "qubits" in COMPARABILITY_FIELDS
    key = comparability_key(import_benchmark("ghz", qubits=3))
    assert key[0] == "supermarq"


def test_constructor_arguments_are_declared_per_benchmark() -> None:
    """The constructors genuinely differ, so a reflective loader would have to guess.

    bit_code and phase_code take rounds and an initial state; vqe takes layers.
    """
    assert SUPERMARQ_BENCHMARKS["bit_code"]["args"] == ("qubits", "rounds", "initial_state")
    assert SUPERMARQ_BENCHMARKS["vqe"]["args"] == ("qubits", "layers")
    assert SUPERMARQ_BENCHMARKS["ghz"]["args"] == ("qubits",)

    # The per-benchmark fields are None when the benchmark does not take them,
    # rather than carrying a default that was never used.
    ghz = import_benchmark("ghz", qubits=3)
    assert ghz["rounds"] is None and ghz["layers"] is None
    assert import_benchmark("vqe", qubits=3, layers=1)["layers"] == 1
    assert import_benchmark("bit_code", qubits=3, rounds=2)["rounds"] == 2


def test_rejects_bad_requests() -> None:
    with pytest.raises(SupermarqError, match="not a SupermarQ benchmark"):
        import_benchmark("no_such_benchmark")
    with pytest.raises(SupermarqError, match="at least two qubits"):
        import_benchmark("ghz", qubits=1)
