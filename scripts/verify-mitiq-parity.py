#!/usr/bin/env python3
"""Differential test: this project's ZNE extrapolators against Mitiq's factories.

Item 7 asks for mitigation "via Mitiq-compatible pipelines". All six methods were
implemented, but nothing checked that the extrapolation agreed with Mitiq -- the
capability matrix recorded this as a gap with **0 references**, and "compatible" was a
claim rather than a measurement.

What is compared is the piece that decides the answer: given expectation values at a set
of noise scale factors, what is the value extrapolated to zero noise. Mitiq's
`RichardsonFactory` and `LinearFactory` compute the same quantity, so agreement is
checkable.

Both extrapolators had to be exported to make this possible. They were private, which
left the one piece of arithmetic that determines every mitigated value unreachable by any
test that could compare it with a reference implementation -- the same shape of problem
as the resource-model layout check, where four mutations survived because the check
reimplemented the formula instead of reading it from the build.

What is deliberately *not* claimed: that the whole pipeline matches Mitiq. Folding,
sampling, and noise models differ, and asserting agreement there would be asserting that
two different simulators produce the same shots. The extrapolation is the part with one
right answer, and that is the part checked.

Run: python scripts/verify-mitiq-parity.py [--require]
Requires: mitiq, and `npm run build` to have produced dist/.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# `--require` turns an absent Mitiq into a failure, for CI. A check that skips reads as a
# pass in the log; locally the skip stays so the suite runs without the extra.
REQUIRE = "--require" in sys.argv

try:
    from mitiq.zne.inference import LinearFactory, RichardsonFactory
except ImportError:
    message = 'mitiq is not installed. `pip install -e "python[mitigation]"` to run this check.'
    if REQUIRE:
        print(f"FAIL: {message}")
        print("      Invoked with --require, so a skip is not an acceptable outcome here.")
        sys.exit(1)
    print(f"SKIP: {message}")
    sys.exit(0)

#: Cases chosen to separate the two extrapolators rather than flatter them.
#: A perfectly linear signal makes Richardson and linear agree, so it cannot show a
#: Richardson bug; the curved cases can, and the non-uniform spacing exercises the
#: weights rather than a happy accident of evenly spaced scales.
CASES = [
    {"scales": [1, 2, 3], "values": [0.95, 0.90, 0.85]},   # exactly linear
    {"scales": [1, 3], "values": [0.95, 0.85]},            # two points only
    {"scales": [1, 3, 5], "values": [0.90, 0.78, 0.62]},   # curved: the two must differ
    {"scales": [1, 2, 3], "values": [1.0, 1.0, 1.0]},      # flat: zero-noise is 1
    {"scales": [1, 3, 5], "values": [0.80, 0.50, 0.20]},   # steep but linear
    {"scales": [1, 2, 4], "values": [0.72, 0.55, 0.31]},   # non-uniform spacing
]

TOLERANCE = 1e-9

failures: list[str] = []


def ours() -> list[dict]:
    """Ask the built TypeScript extrapolators, rather than reimplementing them here."""
    script = """
import { linearExtrapolateToZero, richardsonExtrapolateToZero } from "./dist/engine/mitigation.js"
const cases = %s
console.log(JSON.stringify(cases.map((c) => {
  const points = c.scales.map((s, i) => ({ scale: s, value: c.values[i] }))
  return { linear: linearExtrapolateToZero(points), richardson: richardsonExtrapolateToZero(points) }
})))
""" % json.dumps(CASES)
    path = ROOT / ".mitiq-parity-probe.mjs"
    path.write_text(script)
    try:
        completed = subprocess.run(
            ["node", str(path)], cwd=ROOT, capture_output=True, text=True, check=True
        )
    finally:
        path.unlink(missing_ok=True)
    return json.loads(completed.stdout)


def mitiq_values(scales: list[float], values: list[float]) -> tuple[float, float]:
    richardson = RichardsonFactory(scale_factors=scales)
    linear = LinearFactory(scale_factors=scales)
    for scale, value in zip(scales, values):
        richardson.push({"scale_factor": scale}, value)
        linear.push({"scale_factor": scale}, value)
    return richardson.reduce(), linear.reduce()


print("Differential test: ketqat ZNE extrapolation vs Mitiq\n")

computed = ours()
if len(computed) != len(CASES):
    print("FAIL: the TypeScript probe returned the wrong number of rows -- was `npm run build` run?")
    sys.exit(1)

worst = 0.0
separated = 0
for case, mine in zip(CASES, computed):
    scales = [float(s) for s in case["scales"]]
    m_richardson, m_linear = mitiq_values(scales, case["values"])

    for label, theirs, value in (
        ("richardson", m_richardson, mine["richardson"]),
        ("linear", m_linear, mine["linear"]),
    ):
        difference = abs(theirs - value)
        worst = max(worst, difference)
        if difference > TOLERANCE:
            failures.append(
                f"{label} disagrees at scales={case['scales']} values={case['values']}: "
                f"ours {value!r}, mitiq {theirs!r}, difference {difference:.3e}"
            )
    if abs(mine["richardson"] - mine["linear"]) > 1e-6:
        separated += 1
    print(
        f"  scales={case['scales']!s:<12} richardson {mine['richardson']:.12f}  "
        f"linear {mine['linear']:.12f}"
    )

print()
print(f"  {len(CASES)} cases, {2 * len(CASES)} comparisons, worst difference {worst:.3e}")

# If the two extrapolators never disagreed, the suite could not distinguish them and a
# Richardson bug would hide behind the linear fit.
if separated == 0:
    failures.append(
        "no case separates Richardson from the linear fit, so the cases cannot detect a "
        "Richardson-specific error"
    )
else:
    print(f"  {separated} case(s) separate Richardson from the linear fit, so both are exercised")

if failures:
    print("\nFAIL")
    for line in failures:
        print("  -", line)
    sys.exit(1)

print("\nPASS: both extrapolators agree with Mitiq's factories to floating point.")
print("      Folding, sampling and noise models are not compared: those differ between")
print("      simulators, and claiming agreement there would be claiming two different")
print("      simulators produce the same shots.")
