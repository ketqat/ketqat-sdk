#!/usr/bin/env python3
"""Verify the contents and metadata of KetQat Python release artifacts."""

from __future__ import annotations

import argparse
import json
import re
import tarfile
import tomllib
import zipfile
from email.parser import Parser
from pathlib import Path


MAX_ARTIFACT_BYTES = 2_000_000
REQUIRED_SCHEMAS = {
    "algorithm-benchmark-result.schema.json",
    "algorithm-experiment-manifest.schema.json",
    "qec-benchmark-result.schema.json",
    "qec-experiment-manifest.schema.json",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def read_assignment(path: Path, name: str) -> str:
    match = re.search(rf'^\s*{re.escape(name)}\s*=\s*["\']([^"\']+)["\']', path.read_text(), re.MULTILINE)
    if not match:
        fail(f"Could not read {name} from {path}")
    return match.group(1)


def reject_generated_or_test_files(names: set[str], artifact: Path) -> None:
    forbidden = re.compile(r"(^|/)(tests?|\.pytest_cache|__pycache__)(/|$)|\.(?:py[co]|log|tmp)$", re.IGNORECASE)
    matches = sorted(name for name in names if forbidden.search(name))
    if matches:
        fail(f"{artifact.name} contains forbidden files: {matches}")


def verify_wheel(wheel: Path, version: str) -> None:
    if wheel.stat().st_size > MAX_ARTIFACT_BYTES:
        fail(f"{wheel.name} exceeds the 2 MB artifact limit")

    dist_info = f"ketqat-{version}.dist-info"
    with zipfile.ZipFile(wheel) as archive:
        names = set(archive.namelist())
        required = {
            "ketqat_runner/__init__.py",
            "ketqat_runner/cli.py",
            "ketqat_runner/runner.py",
            "ketqat_runner/validation.py",
            f"{dist_info}/METADATA",
            f"{dist_info}/WHEEL",
            f"{dist_info}/entry_points.txt",
            f"{dist_info}/RECORD",
        }
        required.update(f"ketqat_runner/schemas/{name}" for name in REQUIRED_SCHEMAS)
        missing = sorted(required - names)
        if missing:
            fail(f"{wheel.name} is missing required files: {missing}")
        if not any(name.endswith(".dist-info/licenses/LICENSE") for name in names):
            fail(f"{wheel.name} does not contain an Apache-2.0 LICENSE file")
        reject_generated_or_test_files(names, wheel)

        metadata = Parser().parsestr(archive.read(f"{dist_info}/METADATA").decode())
        expected = {
            "Name": "ketqat",
            "Version": version,
            "Requires-Python": ">=3.10",
            "License-Expression": "Apache-2.0",
            "Description-Content-Type": "text/markdown",
        }
        for key, value in expected.items():
            if metadata.get(key) != value:
                fail(f"Wheel metadata {key} is {metadata.get(key)!r}; expected {value!r}")


def verify_sdist(sdist: Path, version: str) -> None:
    if sdist.stat().st_size > MAX_ARTIFACT_BYTES:
        fail(f"{sdist.name} exceeds the 2 MB artifact limit")

    prefix = f"ketqat-{version}/"
    with tarfile.open(sdist, mode="r:gz") as archive:
        names = set(archive.getnames())
        required = {
            f"{prefix}LICENSE",
            f"{prefix}README.md",
            f"{prefix}pyproject.toml",
            f"{prefix}PKG-INFO",
            f"{prefix}src/ketqat_runner/__init__.py",
            f"{prefix}src/ketqat_runner/cli.py",
            f"{prefix}src/ketqat_runner/runner.py",
        }
        required.update(f"{prefix}src/ketqat_runner/schemas/{name}" for name in REQUIRED_SCHEMAS)
        missing = sorted(required - names)
        if missing:
            fail(f"{sdist.name} is missing required files: {missing}")
        reject_generated_or_test_files(names, sdist)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dist", type=Path, help="Directory containing one wheel and one sdist")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    package_json = json.loads((root / "package.json").read_text())
    pyproject = tomllib.loads((root / "python/pyproject.toml").read_text())
    versions = {
        "package.json": package_json["version"],
        "pyproject.toml": pyproject["project"]["version"],
        "ketqat_runner.__version__": read_assignment(root / "python/src/ketqat_runner/__init__.py", "__version__"),
        "runner SDK_VERSION": read_assignment(root / "python/src/ketqat_runner/runner_version.py", "SDK_VERSION"),
    }
    if len(set(versions.values())) != 1:
        fail(f"Release versions do not match: {versions}")
    version = next(iter(versions.values()))

    wheels = sorted(args.dist.glob("*.whl"))
    sdists = sorted(args.dist.glob("*.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1:
        fail(f"Expected one wheel and one sdist in {args.dist}; found {wheels} and {sdists}")

    verify_wheel(wheels[0], version)
    verify_sdist(sdists[0], version)
    print(f"Verified Python distributions for ketqat {version}: {wheels[0].name}, {sdists[0].name}")


if __name__ == "__main__":
    main()
