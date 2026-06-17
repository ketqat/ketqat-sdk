from __future__ import annotations

import json
from importlib import resources
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator

SUPPORTED_SCHEMA_VERSION = "0.1"
SUPPORTED_QEC_BENCHMARKS = {("surface-code-memory-mwpm", "0.1.0")}


class KetQatValidationError(ValueError):
    pass


def _schema_path(name: str) -> Path | None:
    package_path = resources.files("ketqat_runner").joinpath("schemas", name)
    if package_path.is_file():
        with resources.as_file(package_path) as path:
            return path

    for parent in Path(__file__).resolve().parents:
        candidate = parent / "schemas" / name
        if candidate.is_file():
            return candidate
    return None


def load_schema(name: str) -> dict[str, Any]:
    path = _schema_path(name)
    if path is None:
        raise KetQatValidationError(f"Unable to locate JSON Schema: {name}")
    return json.loads(path.read_text())


def validate_with_schema(value: dict[str, Any], schema_name: str, subject: str) -> None:
    schema = load_schema(schema_name)
    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(value), key=lambda error: list(error.path))
    if not errors:
        return

    formatted = []
    for error in errors:
        path = "$" + "".join(f"[{part!r}]" if isinstance(part, int) else f".{part}" for part in error.path)
        formatted.append(f"{path}: {error.message}")
    raise KetQatValidationError(f"Invalid {subject}:\n" + "\n".join(formatted))


def validate_manifest(manifest: dict[str, Any]) -> None:
    domain = manifest.get("domain")
    if manifest.get("schema_version") != SUPPORTED_SCHEMA_VERSION:
        raise KetQatValidationError(
            f"Unsupported schema_version {manifest.get('schema_version')!r}; expected {SUPPORTED_SCHEMA_VERSION!r}."
        )

    if domain == "QEC":
        validate_with_schema(manifest, "qec-experiment-manifest.schema.json", "QEC manifest")
        _validate_qec_contract(manifest)
        return
    if domain == "ALGORITHM":
        validate_with_schema(manifest, "algorithm-experiment-manifest.schema.json", "algorithm manifest")
        return
    raise KetQatValidationError(f"Unsupported KetQat domain: {domain!r}")


def validate_result(result: dict[str, Any]) -> None:
    domain = result.get("domain")
    if result.get("schema_version") != SUPPORTED_SCHEMA_VERSION:
        raise KetQatValidationError(
            f"Unsupported result schema_version {result.get('schema_version')!r}; expected {SUPPORTED_SCHEMA_VERSION!r}."
        )
    if domain == "QEC":
        validate_with_schema(result, "qec-benchmark-result.schema.json", "QEC result")
        return
    if domain == "ALGORITHM":
        validate_with_schema(result, "algorithm-benchmark-result.schema.json", "algorithm result")
        return
    raise KetQatValidationError(f"Unsupported result domain: {domain!r}")


def _validate_qec_contract(manifest: dict[str, Any]) -> None:
    benchmark = (manifest["benchmark"]["suite"], manifest["benchmark"]["version"])
    if benchmark not in SUPPORTED_QEC_BENCHMARKS:
        raise KetQatValidationError(
            f"Unsupported QEC benchmark suite/version: {benchmark[0]} {benchmark[1]}."
        )

    qec = manifest["qec"]
    if qec["experiment_type"] != "memory":
        raise KetQatValidationError("Only QEC memory experiments are supported by this runner.")
    if qec["code"]["family"] != "rotated-surface-code":
        raise KetQatValidationError("Only rotated-surface-code experiments are supported by this runner.")
    if qec["noise"]["model"] != "circuit-level-depolarizing":
        raise KetQatValidationError("Only circuit-level-depolarizing noise is supported by this runner.")
    if qec["decoder"]["name"] != "pymatching":
        raise KetQatValidationError("Only the pymatching decoder is supported by this runner.")

    for distance in qec["code"]["distances"]:
        if int(distance) <= 0 or int(distance) % 2 == 0:
            raise KetQatValidationError("QEC distances must be positive odd integers.")
