from __future__ import annotations

import json
from pathlib import Path

from ketqat_runner.hashing import calculate_reproducibility_hash


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "reproducibility"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text())


def test_python_hash_matches_shared_expected_fixtures() -> None:
    """Both versions, against hashes the TypeScript implementation produced.

    The v1 block is the load-bearing half. Those are the hashes that were
    published before ketqat-sdk#89 was fixed, and if any of them moved, records
    already in the registry would stop verifying. Pinning them is what makes the
    fix additive rather than a rewrite of history.
    """
    expected = _fixture("expected-hashes.json")
    inputs = {
        "qec_manifest": "qec-manifest.json",
        "qec_result": "qec-result-before-hash.json",
        "qec_result_null_metadata": "qec-result-null-metadata.json",
        "algorithm_result": "algorithm-result-before-hash.json",
        "qec_result_float_edge_cases": "qec-result-float-edge-cases.json",
    }
    for version_key, version in (("v1", 1), ("v2", 2)):
        for key, filename in inputs.items():
            assert calculate_reproducibility_hash(_fixture(filename), version) == expected[version_key][key], (
                f"{version_key} hash drifted for {key}"
            )

    assert expected["v2"]["qec_result_null_metadata"] != expected["v2"]["qec_result"]

    # The fix must actually change something, or it did nothing.
    assert expected["v1"]["qec_result"] != expected["v2"]["qec_result"]
    # And it must not touch a payload with no timing fields in it.
    assert expected["v1"]["qec_manifest"] == expected["v2"]["qec_manifest"]


def test_volatile_fields_are_excluded_but_scientific_fields_are_not() -> None:
    expected = _fixture("expected-hashes.json")
    result = _fixture("qec-result-before-hash.json")

    volatile_changed = {
        **result,
        "id": "changed",
        "slug": "changed",
        "updated_at": "2026-02-01T00:00:00.000Z",
    }
    assert calculate_reproducibility_hash(volatile_changed) == expected["v2"]["qec_result"]

    scientific_changed = {
        **result,
        "metric_points": [{**result["metric_points"][0], "code_distance": 5}],
    }
    assert calculate_reproducibility_hash(scientific_changed) != expected["v2"]["qec_result"]

    # A duration is not science. Changing one must not change the hash, which is
    # the entire content of ketqat-sdk#89.
    timing_changed = {
        **result,
        "metric_points": [{**result["metric_points"][0], "runtime_seconds": 999.5}],
    }
    assert calculate_reproducibility_hash(timing_changed) == expected["v2"]["qec_result"]
    assert calculate_reproducibility_hash(timing_changed, 1) != expected["v1"]["qec_result"]


def test_float_formatting_matches_javascript_across_notation_boundaries() -> None:
    # Regression: Python's repr()/json.dumps() and JavaScript's Number.toString()
    # disagree on scientific-notation thresholds (Python switches below 1e-4, JS
    # below 1e-6) and on whole-number floats (Python keeps "3.0", JS renders "3").
    # A prior version of this module used Python's native float formatting
    # directly, which produced a different reproducibility hash than the
    # TypeScript SDK for the exact same data -- this fixture pins values at
    # those boundaries (a whole-number float, a small float below Python's
    # notation threshold but above JS's, a small float below both thresholds,
    # and negative zero) against a hash computed by the TypeScript reference
    # implementation.
    expected = _fixture("expected-hashes.json")
    result = _fixture("qec-result-float-edge-cases.json")
    assert calculate_reproducibility_hash(result) == expected["v2"]["qec_result_float_edge_cases"]
