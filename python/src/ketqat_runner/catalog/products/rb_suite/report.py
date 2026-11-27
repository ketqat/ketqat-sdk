"""Markdown report of a randomized benchmarking suite run."""
from __future__ import annotations

from typing import Any


def _fmt(value: Any, digits: int = 5) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}g}"
    return str(value)


def _interval(block: dict[str, Any] | None) -> str:
    if not block or block.get("lower") is None:
        return "n/a"
    return f"[{_fmt(block['lower'])}, {_fmt(block['upper'])}]"


def _points_table(points: list[dict[str, Any]]) -> list[str]:
    lines = ["| m | survival | standard error (sequences) |", "|---|---|---|"]
    for p in points:
        lines.append(f"| {p['sequence_length']} | {_fmt(p['survival_probability'])} | {_fmt(p['standard_error'])} |")
    return lines


def _fit_lines(fit: dict[str, Any], boot: dict[str, Any] | None) -> list[str]:
    if fit["inconclusive"]:
        return [f"- Fit inconclusive: {fit['reason']}"]
    lines = [f"- Decay parameter lambda = {_fmt(fit['decay_parameter'], 7)}" + (f", 95% bootstrap {_interval(boot['decay_parameter'])}" if boot else ""),
             f"- Error per Clifford r = {_fmt(fit['error_per_clifford'], 6)}" + (f", 95% bootstrap {_interval(boot['error_per_clifford'])}" if boot else ""),
             f"- Amplitude A = {_fmt(fit['amplitude'])}, asymptote 1/d = {_fmt(fit['asymptote'])} (fixed); reduced chi-square {_fmt(fit['chi_square_reduced'], 3)}"]
    return lines


def to_markdown(result: dict[str, Any]) -> str:
    lines = ["# Randomized benchmarking suite", "",
             f"- Protocol: {result['protocol']}",
             f"- Qubits: {result['qubits']} (d = {result['dimension']}); depolarizing rate {result['depolarizing_rate']}",
             f"- Sequence lengths: {result['sequence_lengths']}; {result['sequences_per_length']} sequences per length; {result['shots']} shots; seed {result['seed']}",
             f"- Noise model: {result['noise_model']}", "",
             "## Standard RB", ""]
    standard = result["standard"]
    lines += _points_table(standard["points"]) + [""] + _fit_lines(standard["fit"], standard["bootstrap"])
    expected = standard["analytic_expectation"]
    lines.append(f"- Expected for this noise model: lambda = {_fmt(expected['decay_parameter'], 7)}, r = {_fmt(expected['error_per_clifford'], 6)}"
                 + (f" (fit deviates by {_fmt(expected['deviation_in_bootstrap_sigma'], 3)} bootstrap sigma)" if expected["deviation_in_bootstrap_sigma"] is not None else ""))
    linear = standard["linearized_fit"]
    if not linear["inconclusive"]:
        lines.append(f"- Open SDK linearized fit for comparison: lambda = {_fmt(linear['decay_parameter'], 7)}, r = {_fmt(linear['error_per_clifford'], 6)}")

    interleaved = result["interleaved"]
    lines += ["", "## Interleaved RB", ""]
    if interleaved is None:
        lines.append("- Not requested.")
    else:
        lines.append(f"- Interleaved gate: {interleaved['gate']} (Stim {interleaved['stim_gate']}), gate depolarizing rate {interleaved['gate_depolarizing_rate']}")
        lines += [""] + _points_table(interleaved["points"]) + [""] + _fit_lines(interleaved["fit"], interleaved["bootstrap"])
        estimate = interleaved["gate_error"]
        if estimate["inconclusive"]:
            lines.append(f"- Gate error inconclusive: {estimate['reason']}")
        else:
            lines += [f"- Interleaved gate error r_gate = {_fmt(estimate['gate_error'], 6)}, 95% bootstrap {_interval(interleaved['gate_error_bootstrap'])}",
                      f"- Systematic bound (Magesan et al. 2012): +/-{_fmt(estimate['systematic_bound'], 6)}",
                      f"- {estimate['interpretation']}"]
        lines.append(f"- Expected for this noise model: r_gate = {_fmt(interleaved['analytic_expectation']['gate_error'], 6)}")

    simultaneous = result["simultaneous"]
    lines += ["", "## Simultaneous RB (addressability)", ""]
    if simultaneous is None:
        lines.append("- Not requested.")
    else:
        lines.append(f"- Crosstalk rate {simultaneous['crosstalk_rate']}; {simultaneous['protocol']}")
        for q in simultaneous["per_qubit"]:
            est = q["addressability"]
            if est["inconclusive"]:
                lines.append(f"- Qubit {q['qubit']}: inconclusive ({est['reason']})")
            else:
                lines.append(f"- Qubit {q['qubit']}: alone r = {_fmt(est['isolated_error_per_clifford'], 6)}, together r = {_fmt(est['simultaneous_error_per_clifford'], 6)}, "
                             f"addressability error {_fmt(est['addressability_error'], 6)}, 95% bootstrap {_interval(q['addressability_bootstrap'])}")
        lines.append(f"- Mean addressability error {_fmt(simultaneous['mean_addressability_error'], 6)}; expected for this noise model "
                     f"{_fmt(simultaneous['analytic_expectation']['addressability_error'], 6)}")

    lines += ["", "## Caveats", "",
              "- Gate-independent depolarizing noise is simulated; the analytic expectations hold for that model only and are not hardware predictions.",
              "- Bootstrap intervals are statistical (resampling sequences); they exclude error from the single-exponential model being wrong.",
              "- Interleaved RB bounds the gate error by the systematic bound; when the bound is comparable to the estimate the gate error is bounded, not resolved.",
              "- An addressability error consistent with zero means the qubits are independent at this noise level, not that crosstalk is impossible."]
    return "\n".join(lines) + "\n"
