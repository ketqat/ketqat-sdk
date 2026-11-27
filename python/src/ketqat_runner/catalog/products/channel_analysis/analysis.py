"""Full channel report: CPTP check, PTM, fidelities, unitarity, diamond distance; JSON + Markdown."""
from __future__ import annotations

import numpy as np

from .channels import as_kraus, cptp_check, dims, is_qubit_dimension, kraus_to_ptm
from .measures import average_gate_fidelity, diamond_distance, entanglement_fidelity, unitarity

#: Result schema identifier. It is part of the hashed result, so it keeps the name it had
#: when this product was first released (1.0.0): changing it would change every resultSha256.
SCHEMA = "ketqat.pro.channel-analysis/v1"


def _r(x: float) -> float:
    return float(np.round(x, 12))


def analyze_channel(kraus, target_unitary=None, tolerance: float = 1e-9) -> dict:
    ops = as_kraus(kraus)
    d_in, d_out = dims(ops)
    target = np.eye(d_in, dtype=complex) if target_unitary is None else np.asarray(target_unitary, dtype=complex)
    cptp = cptp_check(ops, tolerance)
    result: dict = {
        "schema": SCHEMA,
        "dimensions": {"input": d_in, "output": d_out},
        "kraus_operators": len(ops),
        "cptp": cptp,
        "ptm": None,
        "fidelity": None,
        "unitarity": None,
        "diamond_distance": None,
        "notes": [],
    }
    if not (cptp["completely_positive"] and cptp["trace_preserving"]):
        result["notes"].append("Not CPTP within tolerance: fidelities, unitarity and diamond distance are not reported.")
    elif d_in != d_out:
        result["notes"].append("Non-square channel: only the CPTP check applies.")
    else:
        if np.linalg.norm(target.conj().T @ target - np.eye(d_in), ord=2) > 1e-9:
            raise ValueError("target_unitary is not unitary")
        result["fidelity"] = {"entanglement": _r(entanglement_fidelity(ops, target)), "average_gate": _r(average_gate_fidelity(ops, target)),
                              "relation": "F_avg = (d F_e + 1) / (d + 1)"}
        result["unitarity"] = _r(unitarity(ops))
        dd = diamond_distance(ops, target, tolerance)
        for key in ("value", "lower", "upper"):
            if key in dd:
                dd[key] = _r(dd[key])
        result["diamond_distance"] = dd
        if is_qubit_dimension(d_in):
            labels, ptm = kraus_to_ptm(ops)
            result["ptm"] = {"basis": labels, "matrix": [[_r(v) for v in row] for row in ptm]}
        else:
            result["notes"].append("PTM omitted: dimension is not a power of two.")
    result["report_markdown"] = to_markdown(result)
    return result


def to_markdown(result: dict) -> str:
    lines = ["# Quantum channel analysis", "",
             f"- Dimensions: {result['dimensions']['input']} -> {result['dimensions']['output']}",
             f"- Kraus operators: {result['kraus_operators']}",
             f"- Completely positive: {result['cptp']['completely_positive']} (min Choi eigenvalue {result['cptp']['min_choi_eigenvalue']:.3e})",
             f"- Trace preserving: {result['cptp']['trace_preserving']} (deviation {result['cptp']['trace_preservation_deviation']:.3e}, tolerance {result['cptp']['tolerance']:.1e})"]
    if result["fidelity"]:
        f = result["fidelity"]
        lines += [f"- Entanglement fidelity: {f['entanglement']:.12f}", f"- Average gate fidelity: {f['average_gate']:.12f}",
                  f"- Unitarity: {result['unitarity']:.12f}"]
        dd = result["diamond_distance"]
        if dd["kind"] == "exact":
            lines.append(f"- Diamond distance (exact, {dd['method']}): {dd['value']:.12f}")
        else:
            lines.append(f"- Diamond distance bounds ({dd['method']}): [{dd['lower']:.12f}, {dd['upper']:.12f}]")
        lines += ["", f"Convention: {dd['convention']}"]
    for note in result["notes"]:
        lines.append(f"- Note: {note}")
    return "\n".join(lines) + "\n"
