"""kq.qec.surface-code-threshold-study 1.0.0 and 1.1.0: a surface-code threshold study.

Both versions run this code. 1.0.0 was first distributed outside this
repository; 1.1.0 is the same implementation released here under Apache-2.0,
so the same parameters and seed give the same resultSha256 under either
version (python/tests/test_catalog_version_compat.py checks recorded hashes).

The catalog definition's inputs are this module's interface: the SDK checks
names, types and declared constraints before calling `validate(params)` and
then `run(params, seed)`. Cross-field rules the definition cannot express (odd
distances, the sample-memory ceiling) live in `validate` and raise
ParameterError, so no run record is written.

The circuits, sampling and decoding are those of the surface-code-memory
product (Stim + PyMatching via `runner._sample_surface_code_memory`). This
package adds the study on top: the sweep orchestration, per-point Wilson
intervals, suppression factors with intervals, the neighbouring-distance
crossing estimator with a parametric bootstrap, the finite-size collapse
quality and the Markdown report.
"""
from __future__ import annotations

from ...params import ParameterError
from .study import run_study
from .sweep import DECODERS

INPUTS = ("distances", "physical_error_rates", "shots_per_point", "rounds", "decoder")
OUTPUTS = ("points", "suppression_factors", "threshold_estimate", "finite_size_collapse", "decoder_version", "report")
#: Stim returns one byte per detector per shot; one point above this is refused, as in surface-code-memory.
MAX_POINT_SAMPLE_BYTES = 2 * 1024**3
#: The whole sweep, summed over points, stays within this many detector samples.
MAX_TOTAL_SAMPLE_BYTES = 4 * 1024**3


def validate(params: dict) -> None:
    unknown = set(params) - set(INPUTS)
    if unknown:
        raise ParameterError(f"unsupported parameters: {sorted(unknown)}; accepted: {list(INPUTS)}")
    distances = params.get("distances")
    rates = params.get("physical_error_rates")
    shots = params.get("shots_per_point")
    rounds = params.get("rounds")
    decoder = params.get("decoder", "mwpm")
    if not isinstance(distances, list) or len(distances) < 2:
        raise ParameterError("Parameter 'distances' must list at least two distances.")
    for d in distances:
        if isinstance(d, bool) or not isinstance(d, int) or d < 3 or d % 2 == 0:
            raise ParameterError(f"Parameter 'distances' must contain odd integers >= 3; got {d!r}.")
    if len(set(distances)) != len(distances):
        raise ParameterError("Parameter 'distances' must not repeat a distance.")
    if not isinstance(rates, list) or len(rates) < 2:
        raise ParameterError("Parameter 'physical_error_rates' must list at least two rates.")
    if len({float(p) for p in rates}) != len(rates):
        raise ParameterError("Parameter 'physical_error_rates' must not repeat a rate.")
    if isinstance(shots, bool) or not isinstance(shots, int) or shots < 1:
        raise ParameterError("Parameter 'shots_per_point' must be a positive integer.")
    if rounds is not None and (isinstance(rounds, bool) or not isinstance(rounds, int) or rounds < 1):
        raise ParameterError("Parameter 'rounds' must be a positive integer or null (= distance).")
    if decoder not in DECODERS:
        raise ParameterError(f"Parameter 'decoder' must be one of {sorted(DECODERS)}.")
    total = 0
    for d in distances:
        resolved_rounds = rounds if rounds is not None else d
        estimate = (d * d - 1) * (resolved_rounds + 1) * shots
        if estimate > MAX_POINT_SAMPLE_BYTES:
            raise ParameterError(
                f"distance={d}, rounds={resolved_rounds}, shots_per_point={shots} would hold about {estimate / 1024**3:.1f} GiB "
                f"of detector samples for one point (limit {MAX_POINT_SAMPLE_BYTES / 1024**3:.0f} GiB). Use fewer shots per point."
            )
        total += estimate * len(rates)
    if total > MAX_TOTAL_SAMPLE_BYTES:
        raise ParameterError(
            f"The sweep would sample about {total / 1024**3:.1f} GiB of detectors in total (limit {MAX_TOTAL_SAMPLE_BYTES / 1024**3:.0f} GiB). "
            "Use fewer shots per point, fewer rates or smaller distances."
        )


def run(params: dict, seed: int | None = None) -> dict:
    validate(params)
    result = run_study(distances=params["distances"], physical_error_rates=params["physical_error_rates"],
                       shots_per_point=params["shots_per_point"], rounds=params.get("rounds"),
                       decoder=params.get("decoder", "mwpm"), seed=0 if seed is None else int(seed))
    missing = [name for name in OUTPUTS if name not in result]
    if missing:
        raise RuntimeError(f"result lacks declared outputs {missing}")
    return result


__all__ = ["run", "validate", "INPUTS", "OUTPUTS"]
