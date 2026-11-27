"""kq.qinfo.quantum-volume-certification 1.0.0 and 1.1.0: the quantum volume protocol, certified.

Both versions run this code. 1.0.0 was first distributed outside this
repository; 1.1.0 is the same implementation released here under Apache-2.0,
so the same parameters and seed give the same resultSha256 under either
version (python/tests/test_catalog_version_compat.py checks recorded hashes).

The catalog definition's inputs are this module's interface: the SDK checks
names, types and declared constraints before calling `validate(params)` and
then `run(params, seed)`. The work ceiling lives in `validate` and raises
ParameterError, so no run record is written.

The model circuits, their ideal output distributions and the heavy-output
definition are those of `ketqat_runner.quantum_volume`. This package adds the
certification workflow: finite-shot sampling of heavy outcomes per circuit, the
pass rule of Cross, Bishop, Sheldon, Nation and Gambetta (2019) with its
2-sigma one-sided bound, per-width confidence intervals (binomial, empirical and
bootstrap), the achieved quantum volume across widths with its monotonicity
flag, and a Markdown report.
"""
from __future__ import annotations

from ....quantum_volume import MAX_QV_WIDTH
from ...params import ParameterError
from .study import run_certification

INPUTS = ("widths", "circuits_per_width", "shots", "depolarizing_rate")
OUTPUTS = ("achieved_quantum_volume", "certification", "per_width", "meets_protocol_minimum_circuits", "report")
#: circuits x sum(2^width) amplitudes simulated; keeps a run to minutes at most.
MAX_AMPLITUDE_WORK = 4_000_000


def validate(params: dict) -> None:
    unknown = set(params) - set(INPUTS)
    if unknown:
        raise ParameterError(f"unsupported parameters: {sorted(unknown)}; accepted: {list(INPUTS)}")
    widths = params.get("widths")
    if not isinstance(widths, list) or not widths:
        raise ParameterError("Parameter 'widths' must list at least one width.")
    for w in widths:
        if isinstance(w, bool) or not isinstance(w, int) or not 2 <= w <= MAX_QV_WIDTH:
            raise ParameterError(f"Parameter 'widths' must contain integers in [2, {MAX_QV_WIDTH}]; got {w!r}.")
    if len(set(widths)) != len(widths):
        raise ParameterError("Parameter 'widths' must not repeat a width.")
    circuits = params.get("circuits_per_width")
    if isinstance(circuits, bool) or not isinstance(circuits, int) or circuits < 2:
        raise ParameterError("Parameter 'circuits_per_width' must be an integer >= 2.")
    shots = params.get("shots")
    if isinstance(shots, bool) or not isinstance(shots, int) or shots < 1:
        raise ParameterError("Parameter 'shots' must be a positive integer.")
    rate = params.get("depolarizing_rate")
    if isinstance(rate, bool) or not isinstance(rate, (int, float)) or not 0 <= rate <= 1:
        raise ParameterError("Parameter 'depolarizing_rate' must lie in [0, 1].")
    work = circuits * sum(1 << w for w in widths)
    if work > MAX_AMPLITUDE_WORK:
        raise ParameterError(
            f"circuits_per_width x sum(2^width) = {work} exceeds the limit of {MAX_AMPLITUDE_WORK}. Use fewer circuits or smaller widths."
        )


def run(params: dict, seed: int | None = None) -> dict:
    validate(params)
    result = run_certification(widths=params["widths"], circuits_per_width=params["circuits_per_width"], shots=params["shots"],
                               depolarizing_rate=float(params["depolarizing_rate"]), seed=0 if seed is None else int(seed))
    missing = [name for name in OUTPUTS if name not in result]
    if missing:
        raise RuntimeError(f"result lacks declared outputs {missing}")
    return result


__all__ = ["run", "validate", "INPUTS", "OUTPUTS"]
