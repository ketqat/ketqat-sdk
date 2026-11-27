"""Markdown report of a threshold study."""
from __future__ import annotations

from typing import Any


def _fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}g}"
    return str(value)


def to_markdown(result: dict[str, Any]) -> str:
    lines = ["# Surface-code threshold study", "",
             f"- Code: {result['code']}, memory {result['memory_basis'].upper()}, decoder {result['decoder']} "
             f"({result['decoder_implementation']} {result['decoder_version']})",
             f"- Noise model: {result['noise_model']}",
             f"- Distances: {result['distances']} with rounds {result['rounds']}",
             f"- Physical error rates: {result['physical_error_rates']}",
             f"- Shots per point: {result['shots_per_point']}; seed {result['seed']}", "",
             "## Logical error rate per point", "",
             "| d | p | failures | p_L | 95% Wilson |", "|---|---|---|---|---|"]
    for point in result["points"]:
        ci = point["confidence_interval"]
        flag = " (upper bound only)" if point["is_upper_bound_only"] else ""
        lines.append(f"| {point['distance']} | {_fmt(point['physical_error_rate'])} | {point['logical_failures']} / {point['shots']} | "
                     f"{_fmt(point['logical_error_rate'])} | [{_fmt(ci['lower'], 3)}, {_fmt(ci['upper'], 3)}]{flag} |")

    lines += ["", "## Suppression factors between successive distances", "",
              "| p | d -> d' | Lambda = p_L(d) / p_L(d') | 95% interval |", "|---|---|---|---|"]
    for row in result["suppression_factors"]:
        interval = f"[{_fmt(row['lower'], 3)}, {_fmt(row['upper'], 3)}]" if row["lower"] is not None else row.get("note", "n/a")
        lines.append(f"| {_fmt(row['physical_error_rate'])} | {row['lower_distance']} -> {row['higher_distance']} | {_fmt(row['value'])} | {interval} |")

    estimate = result["threshold_estimate"]
    lines += ["", "## Threshold estimate", ""]
    if estimate["inconclusive"]:
        lines.append(f"- Inconclusive: {estimate['reason']}")
    else:
        boot = estimate["bootstrap"]
        interval = f"[{_fmt(boot['lower'])}, {_fmt(boot['upper'])}]" if boot["lower"] is not None else "not available"
        lines.append(f"- p_th = {_fmt(estimate['value'])} (mean of neighbouring-pair crossings; spread between pairs {_fmt(estimate.get('pair_spread'))})")
        lines.append(f"- {int(boot['level'] * 100)}% bootstrap interval {interval} from {boot['resamples_with_all_crossings']} of {boot['resamples']} resamples with every pair crossing")
    for pair in estimate["pairs"]:
        boot = pair["bootstrap"]
        interval = f"[{_fmt(boot['lower'])}, {_fmt(boot['upper'])}]" if boot["lower"] is not None else "n/a"
        value = _fmt(pair["crossing"]) if pair["crossing"] is not None else f"none ({pair['reason']})"
        lines.append(f"- d={pair['lower_distance']} vs d={pair['higher_distance']}: crossing {value}, bootstrap {interval} ({boot['resamples_with_crossing']} resamples crossed)")
    lines.append(f"- Method: {estimate['method']}")
    lines.append(f"- Uncertainty scope: {estimate['uncertainty_scope']}")

    collapse = result["finite_size_collapse"]
    lines += ["", "## Finite-size collapse", ""]
    if collapse["available"]:
        lines += [f"- Ansatz: {collapse['ansatz']}",
                  f"- Best collapse at p_th = {_fmt(collapse['threshold'])}, nu = {_fmt(collapse['nu'], 3)}",
                  f"- Collapse quality: reduced chi-square {_fmt(collapse['chi_square_reduced'], 3)} over {collapse['points_used']} points "
                  f"({collapse['degrees_of_freedom']} degrees of freedom); R^2 = {_fmt(collapse['r_squared'], 4)}",
                  f"- {collapse['note']}"]
    else:
        lines.append(f"- Not available: {collapse['reason']}")

    lines += ["", "## Caveats", "",
              "- One noise model (depolarizing after every Clifford gate, no measurement or idle errors); a threshold here is not a hardware prediction.",
              "- Rates are per memory experiment of the given rounds, not per round.",
              "- Points with no observed failure enter the tables as upper bounds; points with fewer than 5 failures at either distance are excluded from the crossing search, and points with none from the collapse fit.",
              "- Bootstrap intervals carry shot noise only; finite-size drift between distance pairs is visible as the pair spread."]
    return "\n".join(lines) + "\n"
