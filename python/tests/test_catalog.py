"""The catalog's files, loader, parameters, run records, CLI and import boundaries."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from ketqat_runner import catalog
from ketqat_runner.catalog import build, records
from ketqat_runner.catalog.loader import load_catalog, validate_definition

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_DIR = REPO_ROOT / "catalog"
PACKAGED_DIR = REPO_ROOT / "python/src/ketqat_runner/catalog/data"
PRODUCT_FILES = sorted((CATALOG_DIR / "products").glob("*.json"))

EXPECTED_PRODUCTS = {
    "kq.algorithms.grover-search": ("grover-search", "free"),
    "kq.algorithms.quantum-phase-estimation": ("quantum-phase-estimation", "free"),
    "kq.qec.surface-code-memory": ("surface-code-memory", "free"),
    "kq.qinfo.state-measures": ("quantum-state-measures", "free"),
    "kq.qinfo.channel-analysis": ("quantum-channel-analysis", "pro"),
}


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))
    for name in ("KETQAT_API_TOKEN", "KETQAT_TOKEN", "KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS"):
        monkeypatch.delenv(name, raising=False)


# ---------------------------------------------------------------- files and schema


@pytest.mark.parametrize("path", PRODUCT_FILES, ids=lambda path: path.stem)
def test_every_product_file_validates_against_the_schema(path: Path) -> None:
    schema = json.loads((CATALOG_DIR / "schema/product.schema.json").read_text())
    definition = json.loads(path.read_text())
    assert validate_definition(definition, schema) == []
    assert path.stem == definition["id"]


def test_the_catalog_holds_exactly_the_five_launch_products() -> None:
    found = {p.id: (p.slug, p.tier) for p in load_catalog().products}
    assert found == EXPECTED_PRODUCTS
    for product in load_catalog().products:
        assert product.current_version["version"] == "1.0.0"
        assert product.current_version["date"] == "2026-10-29"


def test_the_generated_catalog_and_packaged_copy_are_current() -> None:
    root = build.find_root(REPO_ROOT)
    outputs = build.expected_files(root)
    assert build.stale_paths(root, outputs) == [], "run: python -m ketqat_runner.catalog.build"


def test_the_packaged_copy_is_byte_identical() -> None:
    for source in sorted(CATALOG_DIR.rglob("*.json")):
        relative = source.relative_to(CATALOG_DIR)
        assert (PACKAGED_DIR / relative).read_bytes() == source.read_bytes(), relative
    packaged = {path.relative_to(PACKAGED_DIR) for path in PACKAGED_DIR.rglob("*.json")}
    source = {path.relative_to(CATALOG_DIR) for path in CATALOG_DIR.rglob("*.json")}
    assert packaged == source


def test_index_hashes_match_the_product_files() -> None:
    index = json.loads((CATALOG_DIR / "catalog.json").read_text())
    assert [entry["id"] for entry in index["products"]] == sorted(entry["id"] for entry in index["products"])
    for entry in index["products"]:
        raw = (CATALOG_DIR / entry["path"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]


def test_build_check_fails_when_a_product_changes(tmp_path: Path) -> None:
    copy = tmp_path / "repo"
    (copy / "python").mkdir(parents=True)
    (copy / "python/pyproject.toml").write_text("")
    for path in CATALOG_DIR.rglob("*"):
        if path.is_file():
            target = copy / "catalog" / path.relative_to(CATALOG_DIR)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
    for path in PACKAGED_DIR.rglob("*"):
        if path.is_file():
            target = copy / build.PACKAGE_DATA / path.relative_to(PACKAGED_DIR)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
    # Validation tests are resolved against the root, so give the copy the test files too.
    (copy / "python/tests").mkdir(parents=True)
    for name in ("test_catalog_products.py", "test_catalog_examples.py"):
        (copy / "python/tests" / name).write_bytes((REPO_ROOT / "python/tests" / name).read_bytes())

    assert build.main(["--check", "--root", str(copy)]) == 0
    product = copy / "catalog/products/kq.algorithms.grover-search.json"
    definition = json.loads(product.read_text())
    definition["summary"] = "Edited without rebuilding."
    product.write_text(json.dumps(definition, indent=2) + "\n")
    assert build.main(["--check", "--root", str(copy)]) == 1
    assert build.main(["--root", str(copy)]) == 0
    assert build.main(["--check", "--root", str(copy)]) == 0


def test_build_rejects_a_verified_product_without_an_executed_example(tmp_path: Path) -> None:
    schema = json.loads((CATALOG_DIR / "schema/product.schema.json").read_text())
    definition = json.loads((CATALOG_DIR / "products/kq.algorithms.grover-search.json").read_text())
    definition["implementationStatus"] = "verified"
    definition["example"]["verified"] = None
    assert validate_definition(definition, schema), "the schema must refuse verified without an executed example"


def test_schema_enforces_tier_rules() -> None:
    schema = json.loads((CATALOG_DIR / "schema/product.schema.json").read_text())
    free = json.loads((CATALOG_DIR / "products/kq.algorithms.grover-search.json").read_text())
    pro = json.loads((CATALOG_DIR / "products/kq.qinfo.channel-analysis.json").read_text())
    assert validate_definition({**free, "license": "LicenseRef-KetQat-Pro"}, schema)
    assert validate_definition({**free, "pro": pro["pro"]}, schema)
    without_pro = {key: value for key, value in pro.items() if key != "pro"}
    assert validate_definition(without_pro, schema)
    assert validate_definition({**free, "subcategory": "decoding"}, schema)


def test_every_product_states_its_origin_references_and_license() -> None:
    for product in load_catalog().products:
        d = product.definition
        assert "did not invent" in d["origin"]["statement"]
        assert d["references"] and d["contributors"]
        assert d["science"]["limitations"]
        assert d["license"] == ("Apache-2.0" if d["tier"] == "free" else "LicenseRef-KetQat-Pro")
        assert "ketqat-sdk@<commit>#subdirectory=python" in d["install"]


# ----------------------------------------------------------------- search and run


def test_search_and_lookup() -> None:
    assert [p.slug for p in catalog.search("entropy")] == ["quantum-state-measures"]
    assert {p.slug for p in catalog.search(tier="pro")} == {"quantum-channel-analysis"}
    assert {p.slug for p in catalog.search(category="quantum-algorithms")} == {
        "grover-search",
        "quantum-phase-estimation",
    }
    assert catalog.get_product("kq.qec.surface-code-memory").slug == "surface-code-memory"
    with pytest.raises(catalog.ProductNotFoundError):
        catalog.get_product("shor")


def test_unknown_parameters_versions_and_products_are_refused_without_a_record(tmp_path) -> None:
    with pytest.raises(catalog.ParameterError, match="does not accept parameter"):
        catalog.run("quantum-phase-estimation", phase=0.25, qubits=3)
    with pytest.raises(catalog.ParameterError, match="requires parameter 'phase'"):
        catalog.run("quantum-phase-estimation")
    with pytest.raises(catalog.ParameterError, match="must be of type integer"):
        catalog.run("quantum-phase-estimation", phase=0.25, counting_qubits="4")
    with pytest.raises(catalog.VersionNotFoundError, match="no version 9.9.9"):
        catalog.run("quantum-phase-estimation@9.9.9", phase=0.25)
    with pytest.raises(catalog.CatalogError, match="Conflicting versions"):
        catalog.run("quantum-phase-estimation@1.0.0", version="1.0.1", phase=0.25)
    with pytest.raises(catalog.ProductNotFoundError):
        catalog.run("not-a-product")
    assert not (records.runs_directory()).exists()


def test_run_record_contents_and_reproducible_hash() -> None:
    first = catalog.run("quantum-phase-estimation@1.0.0", seed=3, phase=0.3, counting_qubits=6, shots=200)
    second = catalog.run("kq.algorithms.quantum-phase-estimation", version="1.0.0", seed=3, phase=0.3, counting_qubits=6, shots=200)
    assert first.result_sha256 == second.result_sha256
    assert first.run_id != second.run_id and first.client_report_id != second.client_report_id
    different = catalog.run("quantum-phase-estimation", seed=4, phase=0.3, counting_qubits=6, shots=200)
    assert different.result_sha256 != first.result_sha256

    data = json.loads(first.path.read_text())
    assert first.path == records.ketqat_home() / "runs" / first.run_id / "record.json"
    assert set(data) == {
        "schema", "runId", "productId", "productVersion", "parameters", "seed", "sdkVersion",
        "environment", "startedAt", "finishedAt", "status", "result", "resultSha256", "clientReportId",
    }
    assert data["schema"] == "ketqat.run-record/v1"
    assert data["parameters"] == {"phase": 0.3, "counting_qubits": 6, "shots": 200}
    assert data["status"] == "succeeded"
    assert set(data["environment"]) == {"python", "platform", "packages"}
    assert records.load_record(first.run_id).verify_result_hash()
    assert [r.run_id for r in catalog.list_records()][0] in {first.run_id, second.run_id, different.run_id}


def test_a_seed_is_chosen_and_recorded_when_omitted() -> None:
    record = catalog.run("quantum-phase-estimation", phase=0.5, counting_qubits=2, shots=10)
    assert isinstance(record.seed, int)
    again = catalog.run("quantum-phase-estimation", seed=record.seed, phase=0.5, counting_qubits=2, shots=10)
    assert again.result_sha256 == record.result_sha256


def test_tampered_record_is_detected() -> None:
    record = catalog.run("quantum-phase-estimation", seed=1, phase=0.5, counting_qubits=2, shots=10)
    data = json.loads(record.path.read_text())
    data["result"]["estimated_phase"] = 0.25
    record.path.write_text(json.dumps(data))
    assert not records.load_record(record.run_id).verify_result_hash()


def test_run_ids_cannot_escape_the_runs_directory() -> None:
    with pytest.raises(records.RunRecordError, match="not a run ID"):
        records.load_record("../../etc/passwd")


def test_canonical_json_matches_the_reproducibility_encoding() -> None:
    from ketqat_runner.hashing import canonical_json, canonical_research_json

    value = {"b": [1.0, 0.5, 1e-7], "a": {"id": "kept", "z": None}}
    assert canonical_json(value) == '{"a":{"id":"kept","z":null},"b":[1,0.5,1e-7]}'
    # The research form drops identity keys; the catalog form must not.
    assert '"id"' not in canonical_research_json(value)
    with pytest.raises(ValueError, match="non-finite"):
        canonical_json({"x": float("nan")})


# ----------------------------------------------------------------------- the CLI


def _cli(*args: str, env: dict | None = None, stdin: str | None = None) -> subprocess.CompletedProcess:
    environment = {**os.environ, **(env or {})}
    return subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", *args],
        capture_output=True,
        text=True,
        env=environment,
        input=stdin,
        timeout=300,
    )


def test_cli_search_show_run_and_runs(tmp_path) -> None:
    home = {"KETQAT_HOME": str(tmp_path / "cli-home")}
    listed = _cli("catalog", "search", "--json", env=home)
    assert listed.returncode == 0
    assert {entry["slug"] for entry in json.loads(listed.stdout)} == {slug for slug, _ in EXPECTED_PRODUCTS.values()}

    shown = _cli("catalog", "show", "grover-search", env=home)
    assert shown.returncode == 0
    assert "did not invent" in shown.stdout and "pip install" in shown.stdout

    ran = _cli(
        "catalog", "run", "quantum-phase-estimation@1.0.0",
        "--param", "phase=0.25", "--param", "counting_qubits=3", "--seed", "5",
        "--output", str(tmp_path / "out"), "--json",
        env=home,
    )
    assert ran.returncode == 0, ran.stderr
    record = json.loads(ran.stdout)
    assert record["result"]["measured_integer"] == 2
    assert (tmp_path / "out" / f"{record['runId']}.json").is_file()

    runs = _cli("runs", "list", "--json", env=home)
    assert [entry["runId"] for entry in json.loads(runs.stdout)] == [record["runId"]]
    show = _cli("runs", "show", record["runId"], env=home)
    assert show.returncode == 0 and json.loads(show.stdout)["runId"] == record["runId"]

    grover = _cli("catalog", "run", "grover-search", "-p", "n_qubits=3", "-p", "marked=1,6", "--seed", "1", env=home)
    assert grover.returncode == 0, grover.stderr
    assert "success_probability" in grover.stdout


def test_cli_rejects_unknown_parameters_and_versions_with_nonzero_exit(tmp_path) -> None:
    home = {"KETQAT_HOME": str(tmp_path / "cli-home")}
    unknown = _cli("catalog", "run", "quantum-phase-estimation", "-p", "phase=0.25", "-p", "bogus=1", env=home)
    assert unknown.returncode == 2 and "bogus" in unknown.stderr
    version = _cli("catalog", "run", "quantum-phase-estimation@2.0.0", "-p", "phase=0.25", env=home)
    assert version.returncode == 2 and "no version 2.0.0" in version.stderr
    product = _cli("catalog", "run", "shor", env=home)
    assert product.returncode == 2
    assert not (tmp_path / "cli-home" / "runs").exists()


def test_cli_install_prints_the_pip_command_and_asks(tmp_path) -> None:
    home = {"KETQAT_HOME": str(tmp_path / "cli-home")}
    none_needed = _cli("catalog", "install", "quantum-phase-estimation", env=home)
    assert none_needed.returncode == 0 and "needs no extras" in none_needed.stdout
    # Not a terminal and no --yes: prints the command, installs nothing.
    refused = _cli("catalog", "install", "grover-search", env=home, stdin="")
    assert refused.returncode == 2
    assert "pip install" in refused.stdout and "[algorithms]" in refused.stdout
    assert "Nothing was installed" in refused.stderr


# ------------------------------------------------------------- import boundaries

FORBIDDEN_AFTER_FREE_RUN = (
    "ketqat_runner.catalog.pro",
    "ketqat_runner.catalog.pro.entitlement",
    "ketqat_runner.catalog.pro.signing",
    "ketqat_runner.catalog.pro.bundle",
    "ketqat_runner.catalog.net",
    "ketqat_runner.catalog.report",
    "ketqat_runner.publish",
    "ketqat_runner.jobs",
    "cryptography",
    "urllib.request",
    "http.client",
)


@pytest.mark.parametrize(
    "call",
    [
        'catalog.run("quantum-phase-estimation", seed=1, phase=0.25, counting_qubits=3, shots=5)',
        'catalog.run("grover-search", seed=1, n_qubits=3, marked=[1], shots=5)',
        'catalog.run("quantum-state-measures", preset="bell")',
        'catalog.run("surface-code-memory", seed=1, distance=3, physical_error_rate=0.001, shots=50)',
    ],
)
def test_free_runs_import_no_entitlement_or_network_code(call: str, tmp_path) -> None:
    if "surface-code" in call:
        pytest.importorskip("stim")
    if "grover" in call or "state-measures" in call or "surface" in call:
        pytest.importorskip("numpy")
    script = (
        "import json, sys\n"
        "from ketqat_runner import catalog\n"
        f"record = {call}\n"
        f"print(json.dumps([name for name in {list(FORBIDDEN_AFTER_FREE_RUN)!r} if name in sys.modules]))\n"
    )
    completed = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env={**os.environ, "KETQAT_HOME": str(tmp_path / "home")},
        timeout=300,
    )
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout.strip().splitlines()[-1]) == []


def test_the_cli_free_run_path_imports_no_entitlement_or_network_code(tmp_path) -> None:
    script = (
        "import json, sys\n"
        "from ketqat_runner.cli import main\n"
        "sys.argv = ['ketqat', 'catalog', 'run', 'quantum-phase-estimation', '-p', 'phase=0.5', '--seed', '1']\n"
        "code = main()\n"
        f"print(json.dumps([code, [name for name in {list(FORBIDDEN_AFTER_FREE_RUN)!r} if name in sys.modules]]))\n"
    )
    completed = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env={**os.environ, "KETQAT_HOME": str(tmp_path / "home")},
        timeout=300,
    )
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout.strip().splitlines()[-1]) == [0, []]
