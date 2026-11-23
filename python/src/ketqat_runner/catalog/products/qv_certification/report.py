"""Markdown report of a quantum volume certification run."""
from __future__ import annotations

from typing import Any


def _fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def to_markdown(result: dict[str, Any]) -> str:
    summary = result["certification"]
    lines = ["# Quantum volume certification", "",
             f"- Protocol: {result['protocol']}",
             f"- Noise model: {result['noise_model']}; depolarizing rate {result['depolarizing_rate']}",
             f"- Widths {result['widths']}; {result['circuits_per_width']} circuits per width; {result['shots']} shots per circuit; seed {result['seed']}",
             f"- Circuits per width {'meet' if result['meets_protocol_minimum_circuits'] else 'are below'} the protocol's minimum of {result['protocol_minimum_circuits']}",
             "", "## Result", "",
             f"- Achieved quantum volume: {summary['achieved_quantum_volume'] if summary['achieved_quantum_volume'] is not None else 'none'}",
             f"- {summary['interpretation']}",
             "", "## Per width", "",
             "| width | heavy-output probability | 2-sigma lower bound (rule) | passed | empirical 95% | bootstrap 95% | ideal mean | exact noisy mean |",
             "|---|---|---|---|---|---|---|---|"]
    for entry in result["per_width"]:
        cert = entry["certification"]
        emp = entry["empirical_interval"]
        boot = entry["bootstrap_interval"]
        lines.append(f"| {entry['width']} | {_fmt(cert['heavy_output_probability'])} | {_fmt(cert.get('two_sigma_lower_bound'))} | "
                     f"{'yes' if cert['passed'] else 'no'} | [{_fmt(emp['lower'])}, {_fmt(emp['upper'])}] | [{_fmt(boot['lower'])}, {_fmt(boot['upper'])}] | "
                     f"{_fmt(entry['mean_ideal_heavy_output_probability'])} | {_fmt(entry['mean_exact_noisy_heavy_output_probability'])} |")
    lines += ["", f"- Rule: {result['per_width'][0]['certification'].get('rule', 'n/a')}; threshold 2/3",
              "- The ideal heavy-output probability tends to (1 + ln 2)/2 = 0.8466 only for large width; small widths sit lower.",
              "", "## Caveats", "",
              "- Global depolarizing toward the uniform distribution is simulated; a device's noise is not of this form, so this is a check of the protocol, not a hardware claim.",
              "- Quantum volume is claimed only for tested widths; the achieved value is 2^(largest tested width that passes), and the report says whether every smaller tested width also passes.",
              "- The certification uses the binomial 2-sigma rule of the protocol; the empirical and bootstrap intervals are reported for comparison and do not decide the pass."]
    return "\n".join(lines) + "\n"
