"""Tests for the MQT Bench importer (ketqat-sdk#166).

Skipped rather than mocked when mqt.bench is absent. A mocked upstream would
prove the mock works; the point of this module is that it drives the real
generator, so with no generator there is nothing here worth asserting.
"""

from __future__ import annotations

import pytest

mqt = pytest.importorskip("mqt.bench", reason="mqt.bench is an optional [benchmarks] extra")

from ketqat_runner.mqt_bench import (  # noqa: E402
    COMPARABILITY_FIELDS,
    DIALECT_RISKS,
    MQT_BENCH_LEVELS,
    MqtBenchError,
    assert_comparable,
    assess_importability,
    available_benchmarks,
    available_devices,
    available_gatesets,
    compare_levels,
    import_benchmark,
    upstream_version,
)


def test_imports_a_real_circuit_from_the_real_generator() -> None:
    """No fixtures: this drives mqt.bench itself, so a stale copy cannot pass."""
    record = import_benchmark("ghz", level="INDEP", size=3)
    assert record["suite"] == "mqt-bench"
    assert record["qubit_count"] == 3
    assert record["operation_count"] > 0
    assert "OPENQASM 3" in record["openqasm3"]
    # Without the upstream version an import cannot be reproduced: MQT Bench's
    # generators change, and a circuit regenerated later may differ.
    assert record["mqt_bench_version"] == upstream_version()


def test_the_abstraction_level_changes_the_circuit_by_orders_of_magnitude() -> None:
    """The measurement that justifies treating level as part of a record's identity.

    Same benchmark, same requested size. At MAPPED the qubit count is the
    device's, not the problem's, and depth grows by more than an order of
    magnitude -- while both records still read "qft, size 4".
    """
    algorithmic = import_benchmark("qft", level="ALG", size=4)
    mapped = import_benchmark("qft", level="MAPPED", size=4, device="ibm_eagle_127")

    assert mapped["depth"] > algorithmic["depth"] * 10
    assert mapped["qubit_count"] > algorithmic["qubit_count"]
    # Flagged explicitly, because a reader comparing "size 4" records would
    # otherwise never see that one of them is on 127 qubits.
    assert algorithmic["size_matches_request"] is True
    assert mapped["size_matches_request"] is False


def test_cross_level_records_are_refused_as_incomparable() -> None:
    """The comparability gate, on the difference that matters most."""
    indep = import_benchmark("qft", level="INDEP", size=4)
    mapped = import_benchmark("qft", level="MAPPED", size=4, device="ibm_eagle_127")

    with pytest.raises(MqtBenchError, match="order of magnitude"):
        assert_comparable([indep, mapped])

    # Same level, size and target: allowed.
    assert_comparable([indep, import_benchmark("qft", level="INDEP", size=4)])


def test_level_is_part_of_the_comparability_key() -> None:
    """Not a label beside the key, or the gate above could not work."""
    assert "level" in COMPARABILITY_FIELDS
    assert "target" in COMPARABILITY_FIELDS
    assert "mqt_bench_version" in COMPARABILITY_FIELDS


def test_all_four_levels_are_supported() -> None:
    assert set(MQT_BENCH_LEVELS) == {"ALG", "INDEP", "NATIVEGATES", "MAPPED"}
    native = import_benchmark("qft", level="NATIVEGATES", size=4, gateset="ibm_eagle")
    assert native["target"] == "ibm_eagle"
    assert native["operation_count"] > 0


def test_target_dependent_levels_require_a_target() -> None:
    """Refused rather than defaulted: a silent default would produce a record
    labelled MAPPED without saying which device it was mapped to."""
    with pytest.raises(MqtBenchError, match="a device is required"):
        import_benchmark("ghz", level="MAPPED", size=3)
    with pytest.raises(MqtBenchError, match="a gateset is required"):
        import_benchmark("ghz", level="NATIVEGATES", size=3)


def test_target_on_an_independent_level_is_refused_not_ignored() -> None:
    """Passing one suggests the level was chosen by mistake, so it is not dropped."""
    with pytest.raises(MqtBenchError, match="would be ignored"):
        import_benchmark("ghz", level="INDEP", size=3, device="ibm_eagle_127")


def test_importability_is_recorded_per_import() -> None:
    """Each record carries its own loss report, at the point the information exists.

    ghz parses; qft does not, because Qiskit emits hardware qubit syntax for it.
    Recording this at import means a failure is anticipated rather than met
    downstream.
    """
    ghz = import_benchmark("ghz", level="INDEP", size=3)
    assert ghz["ketqat_importability"]["expected_to_parse"] is True
    assert ghz["ketqat_importability"]["blocking_constructs"] == []

    # `dj` declares custom gates, which the OpenQASM 3 subset adapter does not
    # support. This used to assert on `qft` and hardware qubit syntax; that is no
    # longer a blocker (ketqat-sdk#168), so the test moved to a construct that
    # still is rather than being loosened to keep passing.
    dj = import_benchmark("dj", level="INDEP", size=3)
    assert dj["ketqat_importability"]["expected_to_parse"] is False
    constructs = [entry["construct"] for entry in dj["ketqat_importability"]["blocking_constructs"]]
    assert "custom_gate_definition" in constructs

    # And qft, which used to fail, now parses.
    qft = import_benchmark("qft", level="INDEP", size=3)
    assert qft["ketqat_importability"]["expected_to_parse"] is True


def test_importability_names_the_parser_as_the_authority() -> None:
    """It is a prediction and says so; the parser decides.

    Verified against the real parser separately -- prediction and parser agree on
    all 23 benchmarks that generate at INDEP size 3, both before and after
    hardware qubit support landed (10/23 then, 14/23 now).
    """
    assessment = assess_importability("OPENQASM 3.0;\nqubit[2] q;\n")
    assert assessment["expected_to_parse"] is True
    assert "authority" in assessment
    assert "parser is the authority" in assessment["authority"]


def test_every_dialect_risk_carries_an_explanation() -> None:
    """A flag without a reason is not actionable."""
    for name, marker, explanation in DIALECT_RISKS:
        assert name and marker and len(explanation) > 40


def test_compare_levels_is_labelled_as_not_a_result_comparison() -> None:
    """It shows why the gate exists; it must not read as competing measurements."""
    report = compare_levels("qft", size=4, levels=("ALG", "INDEP"))
    assert len(report["levels"]) == 2
    assert "not competing results" in report["note"]


def test_upstream_catalogue_is_read_from_the_package() -> None:
    """Counts come from the installed package, never a hardcoded list that would
    silently go stale when MQT Bench adds benchmarks."""
    assert len(available_benchmarks()) > 10
    assert len(available_devices()) > 1
    assert len(available_gatesets()) > 1
    assert "ghz" in available_benchmarks()


def test_rejects_bad_requests() -> None:
    with pytest.raises(MqtBenchError, match="not an MQT Bench level"):
        import_benchmark("ghz", level="NONSENSE", size=3)
    with pytest.raises(MqtBenchError, match="at least 1"):
        import_benchmark("ghz", level="INDEP", size=0)
    with pytest.raises(MqtBenchError, match="could not generate"):
        import_benchmark("no_such_benchmark", level="INDEP", size=3)
