from __future__ import annotations

import builtins
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from ketqat_runner.examples import list_example_manifests, read_example_manifest
from ketqat_runner.runner import QEC_DEPENDENCY_MESSAGE, _derive_coordinate_seed, run_experiment
from ketqat_runner.validation import KetQatValidationError, validate_manifest, validate_result


REPO_ROOT = Path(__file__).resolve().parents[2]


def _manifest() -> dict:
    manifest = yaml.safe_load((REPO_ROOT / "examples" / "qec" / "surface-code-memory.yaml").read_text())
    manifest["sampling"]["shots"] = 8
    manifest["qec"]["noise"]["physical_error_rates"] = [0.001]
    return manifest


def test_manifest_schema_validation_rejects_bad_values() -> None:
    manifest = _manifest()
    validate_manifest(manifest)

    invalid_probability = _manifest()
    invalid_probability["qec"]["noise"]["physical_error_rates"] = [1.2]
    with pytest.raises(KetQatValidationError, match="physical_error_rates"):
        validate_manifest(invalid_probability)

    even_distance = _manifest()
    even_distance["qec"]["code"]["distances"] = [4]
    with pytest.raises(KetQatValidationError, match="positive odd"):
        validate_manifest(even_distance)

    zero_shots = _manifest()
    zero_shots["sampling"]["shots"] = 0
    with pytest.raises(KetQatValidationError, match="shots"):
        validate_manifest(zero_shots)

    unsupported_family = _manifest()
    unsupported_family["qec"]["code"]["family"] = "other-code"
    with pytest.raises(KetQatValidationError, match="rotated-surface-code"):
        validate_manifest(unsupported_family)

    unsupported_version = _manifest()
    unsupported_version["benchmark"]["version"] = "9.9.9"
    with pytest.raises(KetQatValidationError, match="Unsupported QEC benchmark"):
        validate_manifest(unsupported_version)


def test_missing_qec_dependency_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    original_import = builtins.__import__

    def fake_import(name: str, *args, **kwargs):
        if name == "stim":
            raise ImportError("stim unavailable")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(RuntimeError, match="ketqat\\[qec\\]"):
        run_experiment(_manifest())

    assert "deterministic-local-fallback" not in QEC_DEPENDENCY_MESSAGE


def test_real_small_qec_execution_validates_result_and_records_real_timings() -> None:
    result = run_experiment(_manifest())
    validate_result(result)

    assert result["domain"] == "QEC"
    assert result["is_demo"] is False
    assert result["metric_points"][0]["metadata"]["backend"] == "stim-pymatching"
    assert result["metric_points"][0]["sampling_runtime_seconds"] >= 0
    assert result["metric_points"][0]["decoder_latency_ms"] >= 0
    assert result["metric_points"][0]["metadata"]["decode_runtime_seconds"] >= 0
    assert "stim" in result["environment"]["packages"]
    assert "pymatching" in result["environment"]["packages"]


def test_coordinate_seed_is_deterministic_and_coordinate_specific() -> None:
    first = _derive_coordinate_seed(42, "0.1.0", 3, 0.001)
    second = _derive_coordinate_seed(42, "0.1.0", 3, 0.001)
    changed_probability = _derive_coordinate_seed(42, "0.1.0", 3, 0.002)
    changed_distance = _derive_coordinate_seed(42, "0.1.0", 5, 0.001)

    assert first == second
    assert first != changed_probability
    assert first != changed_distance


def test_cli_rejects_malformed_yaml_without_writing_output(tmp_path: Path) -> None:
    manifest = tmp_path / "bad.yaml"
    output = tmp_path / "run.json"
    manifest.write_text("domain: [")

    completed = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "run", str(manifest), "--output", str(output)],
        capture_output=True,
        text=True,
    )

    assert completed.returncode != 0
    assert "Invalid YAML manifest" in completed.stderr
    assert not output.exists()


def test_cli_lists_and_copies_packaged_examples(tmp_path: Path) -> None:
    listed = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "examples", "list"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "surface-code-memory" in listed.stdout
    assert "grover-search" in listed.stdout

    destination = tmp_path / "grover.yaml"
    copied = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "examples", "copy", "grover-search", "--output", str(destination)],
        capture_output=True,
        text=True,
        check=True,
    )

    assert "Wrote" in copied.stdout
    assert yaml.safe_load(destination.read_text())["domain"] == "ALGORITHM"


def test_cli_runs_packaged_algorithm_example_by_name(tmp_path: Path) -> None:
    output = tmp_path / "algorithm.json"
    completed = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "run", "grover-search", "--output", str(output)],
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    data = json.loads(output.read_text())
    assert data["domain"] == "ALGORITHM"
    assert data["is_demo"] is False
    assert data["reproducibility_hash"]


def test_packaged_examples_are_readable_resources() -> None:
    names = {example.name for example in list_example_manifests()}

    assert names == {"surface-code-memory", "grover-search"}
    assert yaml.safe_load(read_example_manifest("qec/surface-code-memory"))["domain"] == "QEC"
    assert yaml.safe_load(read_example_manifest("examples/algorithms/grover-search.yaml"))["domain"] == "ALGORITHM"


def test_packaged_examples_match_repository_examples() -> None:
    for example in list_example_manifests():
        repository_copy = REPO_ROOT / example.package_path
        assert read_example_manifest(example.name) == repository_copy.read_text()


def test_result_schema_validation_rejects_malformed_result() -> None:
    result = run_experiment(_manifest())
    result["metric_points"][0]["logical_error_rate"] = 2

    with pytest.raises(KetQatValidationError, match="logical_error_rate"):
        validate_result(result)
