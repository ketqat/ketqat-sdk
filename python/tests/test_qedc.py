"""Tests for the QED-C importer (ketqat-sdk#176).

Skipped rather than mocked when qedcbench is absent: driving the real generator
is the point, and a mocked upstream would only prove the mock works.
"""

from __future__ import annotations

import pytest

pytest.importorskip("qedcbench", reason="qedcbench is an optional [benchmarks] extra")

from ketqat_runner.qedc import (  # noqa: E402
    COMPARABILITY_FIELDS,
    QEDC_BENCHMARKS,
    QedcError,
    assert_comparable,
    available_benchmarks,
    benchmark_availability,
    comparability_key,
    import_sweep,
    upstream_version,
)

#: Above every benchmark's minimum width, so a decline is a real failure.
PROBE_WIDTH = 6


def test_the_sweep_is_the_unit_of_measurement() -> None:
    """QED-C plots fidelity against width, so a sweep is what a benchmark is.

    Importing one width discards what is being measured, which is why the default
    is a range and the widths are recorded.
    """
    record = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=8)
    assert record["suite"] == "qedc"
    assert record["sweep"]["is_sweep"] is True
    assert record["sweep"]["widths"] == [6, 7, 8]
    assert len(record["circuits"]) == 3
    # Width really varies; a sweep that produced identical circuits would be a bug.
    assert len({entry["qubit_count"] for entry in record["circuits"]}) == 3


def test_differing_width_is_comparable_here_unlike_supermarq() -> None:
    """The comparability rule is the opposite of SupermarQ's, deliberately.

    QED-C exists to compare across width, so a gate that rejected differing width
    would forbid the suite's own purpose. A comparability gate has to encode what
    a particular suite means by a comparison, not one project-wide notion of
    sameness.
    """
    narrow = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=6)
    wide = import_sweep("bernstein_vazirani", min_qubits=8, max_qubits=8)
    assert_comparable([narrow, wide])

    assert "qubits" not in COMPARABILITY_FIELDS
    assert "benchmark" in COMPARABILITY_FIELDS
    assert "qedc_version" in COMPARABILITY_FIELDS


def test_differing_benchmark_or_suite_is_refused() -> None:
    narrow = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=6)
    with pytest.raises(QedcError, match="benchmark differ"):
        assert_comparable([narrow, import_sweep("hidden_shift", min_qubits=6, max_qubits=6)])
    with pytest.raises(QedcError, match="different suites"):
        assert_comparable([narrow, {"suite": "supermarq"}])


def test_method_is_recorded_only_when_the_generator_accepts_it() -> None:
    """The signatures genuinely differ: only five of nine take `method`.

    Passing it unconditionally raised a TypeError on deutsch_jozsa, so what is
    accepted is read from the signature. It is recorded as None when unused rather
    than as a value that never reached the generator -- otherwise two records could
    differ in a field with no effect.
    """
    with_method = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=6, method=1)
    assert with_method["accepts_method"] is True
    assert with_method["method"] == 1

    without = import_sweep("deutsch_jozsa", min_qubits=6, max_qubits=6, method=1)
    assert without["accepts_method"] is False
    assert without["method"] is None


def test_availability_is_probed_not_declared() -> None:
    """Measured against the installed versions rather than hardcoded.

    In qedcbench 2.0.8 `monte_carlo` calls `numpy.math`, removed in numpy 2.0, so
    it raises at any width. A hardcoded exclusion would go stale when upstream
    fixes it, or hide a different failure behind the same name.
    """
    report = benchmark_availability(probe_width=PROBE_WIDTH)
    assert set(report) == set(available_benchmarks())
    assert sum(1 for entry in report.values() if entry["available"]) >= 7

    for name, entry in report.items():
        if entry["available"]:
            assert entry["circuits"] > 0 and entry["reason"] is None
        else:
            # Every unavailable benchmark carries a reason and a classified cause,
            # distinguishing upstream breakage from a higher minimum width.
            assert entry["reason"]
            assert entry["cause"] in {"minimum_width", "upstream_error"}


def test_minimum_width_declines_are_named_rather_than_generic() -> None:
    """Below its minimum, a QED-C benchmark returns nothing instead of raising.

    A generic "no circuits" message sent me looking in the wrong place, so the
    error names the likely cause.
    """
    with pytest.raises(QedcError, match="per-benchmark minimum widths"):
        import_sweep("monte_carlo", min_qubits=4, max_qubits=4)


def test_the_dialect_is_recorded_as_the_same_path_as_mqt_bench() -> None:
    """QED-C builds Qiskit circuits, so this adds suite breadth, not dialect breadth.

    Recorded because I expected a third independent toolchain and was wrong: all
    nine circuits parsed on the first attempt, unlike SupermarQ's Cirq output.
    """
    record = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=6)
    assert "same path as MQT Bench" in record["source_dialect"]


def test_fidelity_is_declared_but_not_computed() -> None:
    """QED-C's figure of merit needs a run, so it is not invented at import."""
    scoring = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=6)["scoring"]
    assert scoring["defines_own_score"] is True
    assert scoring["computed_here"] is False
    assert "without executing" in scoring["note"]


def test_provenance_and_catalogue() -> None:
    record = import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=6)
    assert record["qedc_version"] == upstream_version()
    assert comparability_key(record)[0] == "qedc"
    assert len(QEDC_BENCHMARKS) == 9
    assert all("OPENQASM 3" in entry["openqasm3"] for entry in record["circuits"])


def test_rejects_bad_requests() -> None:
    with pytest.raises(QedcError, match="not a QED-C benchmark"):
        import_sweep("no_such_benchmark")
    with pytest.raises(QedcError, match="at least two qubits"):
        import_sweep("bernstein_vazirani", min_qubits=1)
    with pytest.raises(QedcError, match="below min_qubits"):
        import_sweep("bernstein_vazirani", min_qubits=6, max_qubits=4)
