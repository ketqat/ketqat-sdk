"""Run every Free product's `example.code` verbatim in a clean virtualenv.

For each Free product this creates a fresh virtual environment, installs the
package from this checkout with exactly that product's extras (and nothing
else), runs the example code unchanged with `KETQAT_HOME` pointed at a temporary
directory, and checks that the JSON object the example prints last contains
`example.expectedOutputSubset`.

It installs real dependencies, so it is slow and needs network access to the
package index. It runs only when `KETQAT_RUN_SLOW_TESTS=1` (CI sets it in the
`catalog-examples` job):

    KETQAT_RUN_SLOW_TESTS=1 python -m pytest -m slow python/tests/test_catalog_examples.py

`KETQAT_EXAMPLE_PYTHON` selects the interpreter for the virtualenvs (default:
the one running pytest).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PRODUCTS = sorted((REPO_ROOT / "catalog" / "products").glob("*.json"))

pytestmark = [
    pytest.mark.slow,
    pytest.mark.skipif(
        os.environ.get("KETQAT_RUN_SLOW_TESTS") != "1",
        reason="clean-virtualenv example runs are slow; set KETQAT_RUN_SLOW_TESTS=1",
    ),
]


def _free_products() -> list[dict]:
    definitions = [json.loads(path.read_text(encoding="utf-8")) for path in PRODUCTS]
    return [definition for definition in definitions if definition["tier"] == "free"]


def is_subset(expected, actual) -> bool:
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            key in actual and is_subset(value, actual[key]) for key, value in expected.items()
        )
    if isinstance(expected, list):
        return isinstance(actual, list) and len(expected) == len(actual) and all(
            is_subset(e, a) for e, a in zip(expected, actual)
        )
    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected is actual
    return expected == actual


def test_subset_comparison_is_strict() -> None:
    assert is_subset({"a": 1, "b": {"c": [1, 2]}}, {"a": 1, "b": {"c": [1, 2], "d": 0}, "e": 2})
    assert not is_subset({"a": 1}, {"a": 2})
    assert not is_subset({"a": True}, {"a": 1})
    assert not is_subset({"a": {"b": 1}}, {"a": {}})


@pytest.mark.parametrize("definition", _free_products(), ids=lambda definition: definition["slug"])
def test_free_example_runs_verbatim_in_a_clean_virtualenv(definition: dict, tmp_path: Path) -> None:
    python = os.environ.get("KETQAT_EXAMPLE_PYTHON", sys.executable)
    venv = tmp_path / "venv"
    subprocess.run([python, "-m", "venv", str(venv)], check=True)
    venv_python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    subprocess.run(
        [str(venv_python), "-m", "pip", "install", "--quiet", "--upgrade", "pip"],
        check=True,
    )
    extras = definition["versions"][0]["extras"]
    requirement = str(REPO_ROOT / "python") + (f"[{','.join(extras)}]" if extras else "")
    subprocess.run([str(venv_python), "-m", "pip", "install", "--quiet", requirement], check=True)

    workdir = tmp_path / "work"
    workdir.mkdir()
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("KETQAT_", "PYTHON"))
    }
    environment["KETQAT_HOME"] = str(tmp_path / "home")
    completed = subprocess.run(
        [str(venv_python), "-I", "-c", definition["example"]["code"]],
        cwd=workdir,
        env=environment,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert completed.returncode == 0, completed.stderr
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    printed = json.loads(lines[-1])
    expected = definition["example"]["expectedOutputSubset"]
    assert is_subset(expected, printed), f"expected subset {expected}, printed {printed}"
    records = list((tmp_path / "home" / "runs").glob("*/record.json"))
    assert len(records) == 1, "the example must write exactly one run record"
