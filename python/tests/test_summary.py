"""The run summary is where a first-time user learns what their result means.

Before this existed, `ketqat run surface-code-memory --output result.json`
printed nothing: exit 0, empty stdout, empty stderr. The most important fact
about a zero-failure QEC run -- that its error rate is an upper bound and not
zero -- was four levels deep in a JSON file the user was never told to open.

These tests are about that fact reaching the terminal.
"""
from __future__ import annotations

from ketqat_runner.summary import format_run_summary


def _qec_result(*, failures: int, shots: int, upper: float | None) -> dict:
    metadata: dict = {"backend": "stim-pymatching"}
    if upper is not None:
        metadata.update(
            {
                "confidence_interval_lower": 0.0,
                "confidence_interval_upper": upper,
                "is_upper_bound_only": failures == 0,
                "interval_method": "wilson_score",
            }
        )
    return {
        "name": "surface-code-mwpm-baseline",
        "status": "COMPLETED",
        "domain": "QEC",
        "benchmark_suite": "surface-code-memory-mwpm",
        "benchmark_suite_version": "0.1.0",
        "is_demo": False,
        "reproducibility_hash": "a" * 64,
        "metric_points": [
            {
                "metric": "logical_error_rate",
                "code_distance": 3,
                "physical_error_rate": 0.001,
                "logical_failures": failures,
                "logical_error_rate": failures / shots,
                "shots": shots,
                "metadata": metadata,
            }
        ],
    }


def test_zero_failures_is_reported_as_a_bound_and_never_as_zero() -> None:
    text = format_run_summary(_qec_result(failures=0, shots=10000, upper=3.84e-4), "out.json")

    assert "upper bound" in text
    assert "3.840e-04" in text
    assert "does not show it is zero" in text
    # The specific false claim. A line reading "logical error rate 0" is the
    # thing this whole module exists to prevent reaching a user.
    assert "logical error rate 0" not in text


def test_an_observed_rate_is_reported_as_a_measurement() -> None:
    text = format_run_summary(_qec_result(failures=221, shots=10000, upper=0.025), "out.json")

    assert "0.0221" in text
    assert "221 logical failures in 10000 shots" in text
    # A run that observed failures measured a rate. Calling it a bound would be
    # a different way of misdescribing the same result.
    assert "upper bound" not in text


def test_a_demo_record_says_so() -> None:
    result = _qec_result(failures=0, shots=100, upper=0.036)
    result["is_demo"] = True
    text = format_run_summary(result, "out.json")

    assert "demo record" in text
    assert "not a scientific measurement" in text


def test_the_execution_class_is_printed_when_present() -> None:
    result = _qec_result(failures=1, shots=100, upper=0.05)
    result["execution_class"] = "SIMULATION"
    text = format_run_summary(result, "out.json")

    # Simulation must never be mistaken for hardware, so the class is stated
    # rather than left to be inferred from context.
    assert "SIMULATION" in text


def test_the_hash_is_printed_so_a_report_can_identify_its_inputs() -> None:
    text = format_run_summary(_qec_result(failures=0, shots=100, upper=0.036), "out.json")

    assert "a" * 64 in text
    assert "Quote the hash" in text
    assert "out.json" in text


def test_a_missing_interval_does_not_invent_one() -> None:
    # A record with no recorded interval still observed zero failures, so it is
    # still a bound -- but there is no number to state, and making one up would
    # be worse than admitting it is absent.
    result = _qec_result(failures=0, shots=100, upper=None)
    result["metric_points"][0]["metadata"]["is_upper_bound_only"] = True
    text = format_run_summary(result, "out.json")

    assert "upper bound" in text
    assert "None" not in text


def test_algorithm_runs_report_their_success_probability() -> None:
    result = {
        "name": "grover-search-baseline",
        "status": "COMPLETED",
        "domain": "ALGORITHM",
        "benchmark_suite": "grover-search-local",
        "benchmark_suite_version": "0.1.0",
        "is_demo": False,
        "reproducibility_hash": "b" * 64,
        "metric_points": [
            {"metric": "success_probability", "success_probability": 0.9609375, "shots": 256, "metadata": {}}
        ],
    }
    text = format_run_summary(result, "out.json")

    assert "success probability" in text
    assert "0.960938" in text
    assert "256 shots" in text
