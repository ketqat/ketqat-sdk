"""Scientific validation of kq.qinfo.channel-analysis (quantum-channel-analysis).

Tests named in the product definition's `validation` list compare against
closed forms derived by hand (depolarizing, amplitude damping, Pauli and
unitary channels) or against an independent computation (sampled inputs for
the diamond-norm bounds), never against a copy of the formula under test.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")

from ketqat_runner import catalog  # noqa: E402
from ketqat_runner.catalog.products import channel_analysis  # noqa: E402
from ketqat_runner.catalog.products.channel_analysis import presets  # noqa: E402
from ketqat_runner.catalog.products.channel_analysis.analysis import analyze_channel  # noqa: E402
from ketqat_runner.catalog.products.channel_analysis.channels import (  # noqa: E402
    cptp_check,
    kraus_to_choi,
    kraus_to_ptm,
    pauli_channel_probabilities,
)
from ketqat_runner.catalog.products.channel_analysis.measures import (  # noqa: E402
    average_gate_fidelity,
    diamond_distance,
    entanglement_fidelity,
    trace_norm,
    unitarity,
)

I2 = np.eye(2, dtype=complex)
TOL = 1e-10


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))


def _write_kraus_json(path: Path, kraus) -> str:
    path.write_text(json.dumps({"kraus": [{"real": np.real(k).tolist(), "imag": np.imag(k).tolist()} for k in kraus]}))
    return str(path)


# ----------------------------------------------------------------- closed forms


@pytest.mark.parametrize("p", [0.0, 0.05, 0.3, 1.0])
def test_depolarizing_closed_forms(p) -> None:
    kraus = presets.depolarizing(p)
    d = 2
    assert cptp_check(kraus)["completely_positive"] and cptp_check(kraus)["trace_preserving"]
    fe = 1 - p + p / d**2
    assert entanglement_fidelity(kraus, I2) == pytest.approx(fe, abs=TOL)
    assert average_gate_fidelity(kraus, I2) == pytest.approx(1 - p * (d - 1) / d, abs=TOL)
    assert average_gate_fidelity(kraus, I2) == pytest.approx((d * fe + 1) / (d + 1), abs=TOL)
    assert unitarity(kraus) == pytest.approx((1 - p) ** 2, abs=TOL)
    labels, ptm = kraus_to_ptm(kraus)
    assert labels == ["I", "X", "Y", "Z"]
    assert np.allclose(ptm, np.diag([1, 1 - p, 1 - p, 1 - p]), atol=TOL)
    dd = diamond_distance(kraus, I2)
    assert dd["kind"] == "exact" and dd["method"] == "pauli-channel-l1"
    # ||Dep_p - id||_diamond = 2 p (d^2 - 1) / d^2 = 3p/2 for one qubit.
    assert dd["value"] == pytest.approx(1.5 * p, abs=TOL)


def test_two_qubit_depolarizing() -> None:
    p = 0.2
    kraus = presets.depolarizing(p, 2)
    d = 4
    assert entanglement_fidelity(kraus, np.eye(4)) == pytest.approx(1 - p + p / 16, abs=TOL)
    assert unitarity(kraus) == pytest.approx((1 - p) ** 2, abs=TOL)
    assert diamond_distance(kraus, np.eye(4))["value"] == pytest.approx(2 * p * (d * d - 1) / (d * d), abs=TOL)


@pytest.mark.parametrize("gamma", [0.0, 0.1, 0.5, 1.0])
def test_amplitude_damping_closed_forms(gamma) -> None:
    kraus = presets.amplitude_damping(gamma)
    check = cptp_check(kraus)
    assert check["completely_positive"] and check["trace_preserving"]
    s = math.sqrt(1 - gamma)
    fe = (1 + s) ** 2 / 4
    assert entanglement_fidelity(kraus, I2) == pytest.approx(fe, abs=TOL)
    assert average_gate_fidelity(kraus, I2) == pytest.approx((2 * fe + 1) / 3, abs=TOL)
    _, ptm = kraus_to_ptm(kraus)
    expected = np.array([[1, 0, 0, 0], [0, s, 0, 0], [0, 0, s, 0], [gamma, 0, 0, 1 - gamma]])
    assert np.allclose(ptm, expected, atol=TOL)
    assert unitarity(kraus) == pytest.approx((2 * (1 - gamma) + (1 - gamma) ** 2) / 3, abs=TOL)
    dd = diamond_distance(kraus, I2)
    if gamma == 0:
        assert dd["kind"] == "exact" and dd["value"] == pytest.approx(0, abs=TOL)
    else:
        assert dd["kind"] == "bounds"
        assert dd["lower"] <= dd["upper"] + TOL


@pytest.mark.parametrize("px,py,pz", [(0.01, 0.02, 0.03), (0.1, 0.0, 0.0), (0.0, 0.0, 0.5), (0.25, 0.25, 0.25)])
def test_pauli_channel_exact_diamond_and_probabilities(px, py, pz) -> None:
    kraus = presets.pauli_channel(px, py, pz)
    probs = pauli_channel_probabilities(kraus)
    assert probs == pytest.approx({"I": 1 - px - py - pz, "X": px, "Y": py, "Z": pz}, abs=TOL)
    dd = diamond_distance(kraus, I2)
    assert dd["kind"] == "exact"
    assert dd["value"] == pytest.approx(2 * (px + py + pz), abs=TOL)  # 2 (1 - p_I)
    # The exact value respects the general Choi bounds.
    assert dd["choi_bounds"]["lower"] - TOL <= dd["value"] <= dd["choi_bounds"]["upper"] + TOL
    # For a Pauli channel the maximally entangled input is optimal: the lower bound is tight.
    assert dd["choi_bounds"]["lower"] == pytest.approx(dd["value"], abs=1e-9)
    # Against a Pauli target: ||Phi_p - X.X||_diamond = 2 (1 - p_X).
    x = np.array([[0, 1], [1, 0]], dtype=complex)
    assert diamond_distance(kraus, x)["value"] == pytest.approx(2 * (1 - px), abs=TOL)


@pytest.mark.parametrize("theta", [0.0, 0.3, 1.0, math.pi / 2, 2.5])
def test_unitary_channels(theta) -> None:
    u = presets.rotation("z", theta)
    kraus = [u]
    assert entanglement_fidelity(kraus, u) == pytest.approx(1, abs=TOL)
    assert unitarity(kraus) == pytest.approx(1, abs=TOL)
    # F_e(Rz(theta), I) = |Tr Rz|^2 / 4 = cos^2(theta/2).
    assert entanglement_fidelity(kraus, I2) == pytest.approx(math.cos(theta / 2) ** 2, abs=TOL)
    dd = diamond_distance(kraus, I2)
    assert dd["kind"] == "exact"
    # ||Rz(theta) - I||_diamond = 2 sin(theta/2) for 0 <= theta <= pi.
    assert dd["value"] == pytest.approx(2 * math.sin(theta / 2), abs=1e-9)
    assert dd["choi_bounds"]["lower"] - 1e-9 <= dd["value"] <= dd["choi_bounds"]["upper"] + 1e-9
    assert diamond_distance(kraus, u)["value"] == pytest.approx(0, abs=1e-9)


def test_unitary_global_phase_is_irrelevant() -> None:
    u = presets.rotation("x", 0.7)
    assert diamond_distance([np.exp(0.4j) * u], u)["value"] == pytest.approx(0, abs=1e-9)
    assert entanglement_fidelity([np.exp(0.4j) * u], u) == pytest.approx(1, abs=TOL)


def _random_pure_input(rng, d):
    v = rng.normal(size=d * d) + 1j * rng.normal(size=d * d)
    v /= np.linalg.norm(v)
    return np.outer(v, v.conj())


def test_choi_bounds_contain_sampled_values_for_non_pauli_channel() -> None:
    """Every sampled input gives a value <= diamond <= upper; the lower bound is itself attained."""
    rng = np.random.default_rng(7)
    kraus = presets.amplitude_damping(0.3)
    dd = diamond_distance(kraus, I2)
    d = 2
    best = 0.0
    for _ in range(2000):
        rho = _random_pure_input(rng, d)  # ordering: reference (x) system, matching the Choi convention
        out = sum(np.kron(I2, k) @ rho @ np.kron(I2, k).conj().T for k in kraus) - rho
        best = max(best, trace_norm(out))
    assert best <= dd["upper"] + 1e-9
    # The maximally entangled input realises exactly the lower bound.
    phi = np.eye(d).reshape(-1) / math.sqrt(d)
    rho = np.outer(phi, phi.conj())
    out = sum(np.kron(I2, k) @ rho @ np.kron(I2, k).conj().T for k in kraus) - rho
    assert trace_norm(out) == pytest.approx(dd["lower"], abs=1e-12)


def test_choi_normalisation_convention() -> None:
    kraus = presets.amplitude_damping(0.2)
    j = kraus_to_choi(kraus)
    assert np.trace(j).real == pytest.approx(2, abs=TOL)  # unnormalized: Tr J = d_in


def test_non_cptp_is_detected_and_not_scored() -> None:
    bad = [np.array([[1, 0], [0, 1.1]], dtype=complex)]
    result = analyze_channel(bad)
    assert cptp_check(bad)["trace_preserving"] is False
    assert result["fidelity"] is None and result["diamond_distance"] is None
    # Tolerance handling on a channel that is trace preserving only up to ~2e-12.
    near = [k * (1 + 1e-12) for k in presets.amplitude_damping(0.1)]
    assert cptp_check(near, tolerance=1e-9)["trace_preserving"] is True
    assert cptp_check(near, tolerance=1e-15)["trace_preserving"] is False


# ------------------------------------------------------- the catalog product


def test_catalog_definition_matches_the_module_interface(tmp_path) -> None:
    """The definition is the contract; the SDK checks parameter names against it before calling run."""
    definition = catalog.get_product("quantum-channel-analysis").definition
    assert tuple(field["name"] for field in definition["inputs"]) == channel_analysis.INPUTS
    record = catalog.run(
        "quantum-channel-analysis@1.1.0",
        seed=1,
        kraus_file=_write_kraus_json(tmp_path / "k.json", presets.depolarizing(0.1)),
        report_format="markdown",
    )
    declared = {field["name"] for field in definition["outputs"]}
    assert declared <= set(record.result), sorted(declared - set(record.result))


@pytest.mark.parametrize("p", [0.0, 0.1, 0.5])
def test_catalog_run_depolarizing_from_file_matches_closed_forms(tmp_path, p) -> None:
    record = catalog.run("quantum-channel-analysis@1.1.0", seed=0, kraus_file=_write_kraus_json(tmp_path / "k.json", presets.depolarizing(p)))
    result = record.result
    assert record.status == "succeeded"
    assert result["cptp"]["completely_positive"] and result["cptp"]["trace_preserving"]
    assert math.isclose(result["entanglement_fidelity"], 1 - 3 * p / 4, abs_tol=1e-10)
    assert math.isclose(result["average_gate_fidelity"], 1 - p / 2, abs_tol=1e-10)
    assert math.isclose(result["unitarity"], (1 - p) ** 2, abs_tol=1e-10)
    dd = result["diamond_distance"]
    assert dd["kind"] == "exact" and math.isclose(dd["value"], 1.5 * p, abs_tol=1e-10)
    choi = np.asarray(result["choi_matrix"]["real"]) + 1j * np.asarray(result["choi_matrix"]["imag"])
    assert math.isclose(np.trace(choi).real, 1.0, abs_tol=1e-10)  # normalised Choi of a TP channel
    assert "report" not in result


def test_catalog_run_is_reproducible_and_reads_complex_json(tmp_path) -> None:
    kraus_file = _write_kraus_json(tmp_path / "k.json", presets.depolarizing(0.1))
    first = catalog.run("quantum-channel-analysis", seed=3, kraus_file=kraus_file, report_format="markdown")
    second = catalog.run("quantum-channel-analysis", seed=3, kraus_file=kraus_file, report_format="markdown")
    assert first.result_sha256 == second.result_sha256
    assert first.result["schema"] == "ketqat.pro.channel-analysis/v1"  # historical identifier, kept for hash parity
    assert first.result["diamond_distance"]["value"] == pytest.approx(0.15, abs=TOL)
    assert first.result["report"].startswith("# Quantum channel analysis")
    # diag(1, i) is unitary, so the distance to the identity is exact.
    spec = tmp_path / "s.json"
    spec.write_text(json.dumps({"kraus": [{"real": [[1, 0], [0, 0]], "imag": [[0, 0], [0, 1]]}]}))
    assert catalog.run("quantum-channel-analysis", seed=0, kraus_file=str(spec)).result["diamond_distance"]["kind"] == "exact"


def test_catalog_run_reads_npy_and_target_unitary(tmp_path) -> None:
    x = np.array([[0, 1], [1, 0]], dtype=complex)
    np.save(tmp_path / "k.npy", np.stack([x]))
    np.save(tmp_path / "u.npy", x)
    record = catalog.run(
        "quantum-channel-analysis",
        seed=0,
        kraus_file=str(tmp_path / "k.npy"),
        target_unitary_file=str(tmp_path / "u.npy"),
        report_format="markdown",
    )
    assert math.isclose(record.result["average_gate_fidelity"], 1.0, abs_tol=1e-12)
    assert record.result["target"] == "target_unitary_file"
    assert record.result["report"].startswith("# Quantum channel analysis")


def test_out_of_contract_input_is_rejected(tmp_path) -> None:
    k3 = tmp_path / "k3.npy"
    np.save(k3, np.stack([np.eye(3, dtype=complex)]))
    with pytest.raises(ValueError, match="d must be 2, 4 or 8"):
        channel_analysis.run({"kraus_file": str(k3)})
    with pytest.raises(ValueError, match="unsupported parameters"):
        channel_analysis.run({"kraus_file": str(k3), "channel": {}})
    good = _write_kraus_json(tmp_path / "k.json", presets.depolarizing(0.1))
    with pytest.raises(ValueError, match="report_format"):
        channel_analysis.run({"kraus_file": good, "report_format": "html"})
    with pytest.raises(ValueError, match="no such file"):
        channel_analysis.run({"kraus_file": str(tmp_path / "missing.json")})
    with pytest.raises(ValueError, match="tolerance"):
        channel_analysis.run({"kraus_file": good, "tolerance": 0.5})
    # Through the catalog, the declared constraints are checked before anything runs.
    with pytest.raises(catalog.ParameterError):
        catalog.run("quantum-channel-analysis", kraus_file=good, tolerance=0.5)
    # A file the module cannot use fails the run and leaves a failed record, as in 1.0.0.
    with pytest.raises(catalog.ProductRunError, match="d must be 2, 4 or 8"):
        catalog.run("quantum-channel-analysis", kraus_file=str(k3))
