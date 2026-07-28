"""Human-readable summary of a finished run.

`ketqat run` wrote its JSON and printed nothing at all -- exit 0, empty stdout,
empty stderr. The first command in the quickstart, the one a new user types
before they know anything about the project, produced no output whatsoever.
To learn what happened they had to open a JSON file and know which of a dozen
fields mattered.

That is a usability problem, and underneath it a scientific one. The most
important thing about a QEC run that observed no logical failures is that its
error rate is an **upper bound, not zero** -- and that fact lived only in
`metric_points[0]["metadata"]["interpretation"]`, four levels deep in a file
nobody was told to open. The honest number was present and unread.

So this prints what the run found, in the terms the result should be quoted in.
"""
from __future__ import annotations

from typing import Any


def _format_number(value: Any) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return str(value)
    if value == 0:
        return "0"
    if abs(value) < 1e-3 or abs(value) >= 1e5:
        return f"{value:.3e}"
    return f"{value:.6g}"


def format_run_summary(result: dict[str, Any], output_path: str) -> str:
    """A short report of what a run produced, for a terminal."""
    lines: list[str] = []

    name = result.get("name", "unnamed run")
    suite = result.get("benchmark_suite", "unknown suite")
    version = result.get("benchmark_suite_version", "")
    lines.append(f"{name}  [{result.get('status', 'UNKNOWN')}]")
    lines.append(f"  suite       {suite}{f' {version}' if version else ''}")
    lines.append(f"  domain      {result.get('domain', 'unknown')}")

    points = result.get("metric_points") or []
    lines.append(f"  points      {len(points)}")

    # The scientific content, stated the way it should be quoted.
    for point in points:
        metadata = point.get("metadata") or {}
        metric = point.get("metric", "metric")

        if metric == "logical_error_rate":
            distance = point.get("code_distance")
            physical = point.get("physical_error_rate")
            shots = point.get("shots")
            failures = point.get("logical_failures")
            condition = []
            if distance is not None:
                condition.append(f"d={distance}")
            if physical is not None:
                condition.append(f"p={_format_number(physical)}")
            prefix = f"  {', '.join(condition)}" if condition else "  "

            # A run with no observed failures has bounded the rate, not measured
            # it. This is the single most important line the tool prints, and it
            # was previously not printed at all.
            if metadata.get("is_upper_bound_only"):
                upper = metadata.get("confidence_interval_upper")
                if isinstance(upper, (int, float)) and not isinstance(upper, bool):
                    lines.append(
                        f"{prefix}  logical error rate < {_format_number(upper)} "
                        f"(upper bound, 95% confidence)"
                    )
                else:
                    # No interval was recorded. The result is still a bound, but
                    # there is no number to state, and inventing one would be
                    # worse than saying it is missing.
                    lines.append(
                        f"{prefix}  logical error rate: upper bound only, interval not recorded"
                    )
                lines.append(
                    f"      No logical failures in {shots} shots. This bounds the rate; "
                    "it does not show it is zero."
                )
            else:
                rate = point.get("logical_error_rate")
                lower = metadata.get("confidence_interval_lower")
                upper = metadata.get("confidence_interval_upper")
                interval = (
                    f"  95% CI [{_format_number(lower)}, {_format_number(upper)}]"
                    if lower is not None and upper is not None
                    else ""
                )
                lines.append(
                    f"{prefix}  logical error rate {_format_number(rate)}{interval}"
                )
                if failures is not None and shots is not None:
                    lines.append(f"      {failures} logical failures in {shots} shots")

        elif metric == "success_probability":
            value = point.get("success_probability")
            shots = point.get("shots")
            detail = f" over {shots} shots" if shots else ""
            lines.append(f"    success probability {_format_number(value)}{detail}")

    backends = {
        (point.get("metadata") or {}).get("backend")
        for point in points
        if (point.get("metadata") or {}).get("backend")
    }
    if backends:
        lines.append(f"  backend     {', '.join(sorted(backends))}")

    # Simulation is never allowed to be mistaken for hardware, so the class is
    # printed rather than assumed from context.
    execution_class = result.get("execution_class")
    if execution_class:
        lines.append(f"  execution   {execution_class}")

    if result.get("is_demo"):
        lines.append("  NOTE        This is a demo record. It is not a scientific measurement.")

    lines.append(f"  hash        {result.get('reproducibility_hash', 'not computed')}")
    lines.append(f"  written to  {output_path}")
    lines.append("")
    lines.append("Quote the hash when reporting a problem: it identifies the exact inputs.")
    return "\n".join(lines)
