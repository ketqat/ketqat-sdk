"""kq.qinfo.channel-analysis 1.0.0 and 1.1.0: channel metrics from Kraus operators.

Both versions run this code. 1.0.0 was first distributed outside this
repository; 1.1.0 is the same implementation released here under Apache-2.0,
so the same parameters and seed give the same resultSha256 under either
version (python/tests/test_catalog_version_compat.py checks recorded hashes).

The catalog definition's inputs are this module's interface: the SDK checks
names, types and declared constraints before calling `run(params, seed)`. This
adapter loads the user's files, enforces the remaining constraints and renames
the analysis fields to the declared outputs; `analysis.analyze_channel` does the
work. The seed is recorded but unused: the analysis is deterministic.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .analysis import analyze_channel
from .channels import kraus_to_choi

INPUTS = ("kraus_file", "target_unitary_file", "report_format", "tolerance")
ALLOWED_DIMENSIONS = (2, 4, 8)
REPORT_FORMATS = ("json", "markdown")
MAX_TOLERANCE = 1e-3


def _complex(spec, what: str) -> np.ndarray:
    if not isinstance(spec, dict) or set(spec) != {"real", "imag"}:
        raise ValueError(f"{what} must be {{\"real\": [[...]], \"imag\": [[...]]}}")
    real = np.asarray(spec["real"], dtype=float)
    imag = np.asarray(spec["imag"], dtype=float)
    if real.shape != imag.shape:
        raise ValueError(f"{what}: real and imag parts have different shapes {real.shape} and {imag.shape}")
    return real + 1j * imag


def _path(value, name: str) -> Path:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be a path to a .npy or .json file")
    path = Path(value).expanduser()
    if path.suffix.lower() not in (".npy", ".json"):
        raise ValueError(f"{name} must end in .npy or .json, got {path.name!r}")
    if not path.is_file():
        raise ValueError(f"{name}: no such file {str(path)!r}")
    return path


def load_kraus(value) -> np.ndarray:
    path = _path(value, "kraus_file")
    if path.suffix.lower() == ".npy":
        ops = np.load(path, allow_pickle=False)
    else:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or set(data) != {"kraus"} or not isinstance(data["kraus"], list) or not data["kraus"]:
            raise ValueError('kraus_file JSON must be {"kraus": [{"real": ..., "imag": ...}, ...]}')
        ops = np.stack([_complex(m, f"kraus[{i}]") for i, m in enumerate(data["kraus"])])
    ops = np.asarray(ops, dtype=complex)
    if ops.ndim != 3 or ops.shape[1] != ops.shape[2]:
        raise ValueError(f"kraus_file must hold an array of shape (k, d, d), got {ops.shape}")
    if ops.shape[1] not in ALLOWED_DIMENSIONS:
        raise ValueError(f"d must be 2, 4 or 8 (1 to 3 qubits), got d={ops.shape[1]}")
    if not np.all(np.isfinite(ops)):
        raise ValueError("kraus_file contains NaN or infinite entries")
    return ops


def load_unitary(value, d: int) -> np.ndarray | None:
    if value is None:
        return None
    path = _path(value, "target_unitary_file")
    if path.suffix.lower() == ".npy":
        u = np.asarray(np.load(path, allow_pickle=False), dtype=complex)
    else:
        u = _complex(json.loads(path.read_text(encoding="utf-8")), "target_unitary_file")
    if u.shape != (d, d):
        raise ValueError(f"target_unitary_file must be {d} x {d} to match the Kraus operators, got {u.shape}")
    return u


def run(params: dict, seed: int | None = None) -> dict:
    unknown = set(params) - set(INPUTS)
    if unknown:
        raise ValueError(f"unsupported parameters: {sorted(unknown)}; accepted: {list(INPUTS)}")
    if params.get("kraus_file") is None:
        raise ValueError("kraus_file is required")
    report_format = params.get("report_format") or "json"
    if report_format not in REPORT_FORMATS:
        raise ValueError(f"report_format must be one of {REPORT_FORMATS}")
    tolerance = float(params["tolerance"]) if params.get("tolerance") is not None else 1e-8
    if not 0 < tolerance <= MAX_TOLERANCE:
        raise ValueError(f"tolerance must be in (0, {MAX_TOLERANCE}]")

    kraus = load_kraus(params["kraus_file"])
    d = kraus.shape[1]
    target = load_unitary(params.get("target_unitary_file"), d)
    base = analyze_channel(list(kraus), target, tolerance)

    choi = kraus_to_choi(list(kraus)) / d  # normalised: unit trace for a trace-preserving channel
    fidelity = base["fidelity"] or {}
    result = {
        "schema": base["schema"],
        "dimensions": base["dimensions"],
        "kraus_operators": base["kraus_operators"],
        "target": "identity" if target is None else "target_unitary_file",
        "cptp": base["cptp"],
        "choi_matrix": {
            "normalisation": "J / d_in (trace 1 for a trace-preserving channel)",
            "real": np.round(choi.real, 12).tolist(),
            "imag": np.round(choi.imag, 12).tolist(),
        },
        "pauli_transfer_matrix": base["ptm"],
        "average_gate_fidelity": fidelity.get("average_gate"),
        "entanglement_fidelity": fidelity.get("entanglement"),
        "unitarity": base["unitarity"],
        "diamond_distance": base["diamond_distance"],
        "notes": base["notes"],
        "seed": seed,
    }
    if report_format == "markdown":
        result["report"] = base["report_markdown"]
    return result


__all__ = ["run", "INPUTS"]
