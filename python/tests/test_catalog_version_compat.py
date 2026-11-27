"""Versions 1.0.0 and 1.1.0 of the relicensed products reproduce the 1.0.0 results.

Four products (channel analysis, surface-code threshold study, randomized
benchmarking suite, quantum volume certification) were distributed outside
this repository as version 1.0.0 until SDK 0.4.0, when their code was
released here under Apache-2.0 as 1.1.0. The implementation did not change,
and the catalog promises that the same parameters and seed reproduce a 1.0.0
run's resultSha256.

`fixtures/catalog/relicensed-products-1.0.0.json` holds hashes recorded once,
on 2026-11-23, by running the 1.0.0 code as distributed. It holds parameters,
seeds, digests and a few scalars, no code. Stim's sampler and floating-point
linear algebra are not guaranteed to be bit-identical across package versions
and platforms, so the exact-hash comparison runs where the stack matches the
one the fixture was recorded on and is skipped, with the reason, elsewhere.
The deterministic channel-analysis metrics are compared everywhere within a
tolerance.
"""

from __future__ import annotations

import json
import platform
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import pytest

pytest.importorskip("numpy")
pytest.importorskip("stim")
pytest.importorskip("pymatching")

from ketqat_runner import catalog  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((REPO_ROOT / "fixtures/catalog/relicensed-products-1.0.0.json").read_text())
SLUGS = {
    "kq.qinfo.channel-analysis": "quantum-channel-analysis",
    "kq.qec.surface-code-threshold-study": "surface-code-threshold-study",
    "kq.qinfo.randomized-benchmarking-suite": "randomized-benchmarking-suite",
    "kq.qinfo.quantum-volume-certification": "quantum-volume-certification",
}
CASES = [(product_id, case) for product_id, cases in FIXTURE["products"].items() for case in cases]


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))


def _installed(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "not-installed"


def _stack_difference() -> list[str]:
    recorded = FIXTURE["recordedWith"]
    differences = [
        f"{name} {_installed(name)} (fixture: {expected})"
        for name, expected in recorded["packages"].items()
        if _installed(name) != expected
    ]
    if (platform.system(), platform.machine()) != (recorded["system"], recorded["machine"]):
        differences.append(f"{platform.system()}/{platform.machine()} (fixture: {recorded['system']}/{recorded['machine']})")
    return differences


def _parameters(case: dict, tmp_path: Path) -> dict:
    params = dict(case["parameters"])
    if "kraus" in case:
        kraus_file = tmp_path / "kraus.json"
        kraus_file.write_text(json.dumps({"kraus": case["kraus"]}))
        params["kraus_file"] = str(kraus_file)
        if case["target_unitary"] is not None:
            target_file = tmp_path / "target.json"
            target_file.write_text(json.dumps(case["target_unitary"]))
            params["target_unitary_file"] = str(target_file)
    return params


def test_the_fixture_covers_every_relicensed_product_and_holds_no_code() -> None:
    assert set(FIXTURE["products"]) == set(SLUGS)
    assert all(len(cases) >= 2 for cases in FIXTURE["products"].values())
    text = json.dumps(FIXTURE)
    for marker in ("def ", "import ", "KQPRO", "LicenseRef-"):
        assert marker not in text


@pytest.mark.parametrize("product_id,case", CASES, ids=lambda value: value if isinstance(value, str) else f"seed{value['seed']}")
def test_versions_1_0_0_and_1_1_0_reproduce_the_recorded_1_0_0_hash(product_id: str, case: dict, tmp_path: Path) -> None:
    params = _parameters(case, tmp_path)
    old = catalog.run(f"{SLUGS[product_id]}@1.0.0", seed=case["seed"], **params)
    new = catalog.run(f"{SLUGS[product_id]}@1.1.0", seed=case["seed"], **params)
    # Same code under both versions: identical on any stack.
    assert old.result_sha256 == new.result_sha256
    if product_id == "kq.qinfo.channel-analysis":
        # Deterministic linear algebra: the metrics agree everywhere, to round-off.
        for name in ("average_gate_fidelity", "entanglement_fidelity", "unitarity"):
            assert new.result[name] == pytest.approx(case["scalars"][name], abs=1e-9)
        assert new.result["diamond_distance"]["kind"] == case["scalars"]["diamond_distance"]["kind"]
    differences = _stack_difference()
    if differences:
        pytest.skip("exact hash recorded on a different stack: " + "; ".join(differences))
    assert new.result_sha256 == case["result_sha256"]
