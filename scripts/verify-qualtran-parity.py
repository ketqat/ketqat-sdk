#!/usr/bin/env python3
"""Differential test: this project's surface-code model against Qualtran's.

Item 5 asks for resource estimates "using Qualtran/PennyLane/QDK models". Qualtran is
Python and this project's estimator is TypeScript, so it cannot be called at runtime
from the web app. What *can* be done -- and is worth more -- is pinning the two
implementations against each other, so a change to either is caught rather than
discovered later as an unexplained discrepancy.

Three things are checked, and the third is the reason this file exists.

1.  **The functional form.** Both use p_L = A (p/p_th)^((d+1)/2). Verified by evaluating
    Qualtran's `logical_error_rate` against the closed form directly.

2.  **Physical qubits per logical qubit.** Both use 2d^2. Exact agreement expected.

3.  **The inversion.** Given a budget, which distance? Qualtran inverts analytically and
    ceils; this project searches odd distances and evaluates the inequality. These agree
    everywhere except when the budget lands *exactly* on an achievable p_L, where the
    two differ over whether the budget is inclusive. This project treats it as
    inclusive (`<=`); Qualtran's docstring says "keeps one below", i.e. exclusive. That
    is a convention, not a bug in either, and the test asserts the disagreement is
    confined to exact equality rather than papering over it.

What is deliberately *not* asserted: that the prefactor agrees. It does not -- this
project defaults to 0.03 and Qualtran's gidney_fowler model to 0.1 -- and neither is
more correct. Qualtran's own source says of the prefactor: "The pre-factor $a$ has no
clear provenance." The disagreement is quantified and reported instead, because it moves
the answer by a full distance step and therefore the qubit count by up to ~1.6x.

Run: python scripts/verify-qualtran-parity.py
Requires: qualtran, and `npm run build` to have produced dist/.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# `--require` turns an absent Qualtran into a failure. CI passes it, because a check
# that skips reads as a pass in the log and this one would then never have run: the job
# that executes `npm test` has no Python at all, so chaining it there guaranteed a
# permanent silent skip. Locally the skip stays, so a contributor without the extra can
# still run the suite.
REQUIRE = "--require" in sys.argv

try:
    from qualtran.surface_code import QECScheme
except ImportError:
    message = (
        "qualtran is not installed. `pip install -e \"python[resources]\"` to run this check."
    )
    if REQUIRE:
        print(f"FAIL: {message}")
        print("      Invoked with --require, so a skip is not an acceptable outcome here.")
        sys.exit(1)
    print(f"SKIP: {message}")
    sys.exit(0)

THRESHOLD = 0.01
ERROR_RATES = [3e-3, 1e-3, 5e-4, 1e-4]
BUDGETS = [1e-6, 1e-9, 1e-12, 1e-15]
PREFACTORS = [0.03, 0.1]

failures: list[str] = []
notes: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def ts_distances() -> list[dict]:
    """Ask the built TypeScript estimator for its answers."""
    script = """
import { requiredCodeDistance, logicalErrorPerCycle, DEFAULT_FT_ASSUMPTIONS,
         PREFACTOR_MODELS } from "./dist/engine/fault-tolerant.js"
const rows = []
for (const p of %(rates)s) for (const budget of %(budgets)s) for (const prefactor of %(prefs)s) {
  const a = { ...DEFAULT_FT_ASSUMPTIONS, physical_error_rate: p, error_budget: budget, prefactor }
  const d = requiredCodeDistance(1, 1, a)
  rows.push({ p, budget, prefactor, d, pL: d === null ? null : logicalErrorPerCycle(d, a) })
}
console.log(JSON.stringify({ rows, models: PREFACTOR_MODELS,
  qubitsPerLogicalDSquared: DEFAULT_FT_ASSUMPTIONS.qubits_per_logical_d_squared,
  defaultPrefactor: DEFAULT_FT_ASSUMPTIONS.prefactor,
  threshold: DEFAULT_FT_ASSUMPTIONS.threshold }))
""" % {
        "rates": json.dumps(ERROR_RATES),
        "budgets": json.dumps(BUDGETS),
        "prefs": json.dumps(PREFACTORS),
    }
    path = ROOT / ".qualtran-parity-probe.mjs"
    path.write_text(script)
    try:
        out = subprocess.run(
            ["node", str(path)], cwd=ROOT, capture_output=True, text=True, check=True
        )
    finally:
        path.unlink(missing_ok=True)
    return json.loads(out.stdout)


print("Differential test: ketqat surface-code model vs Qualtran\n")

payload = ts_distances()
rows = payload["rows"]
# Read from the TypeScript build, never hardcoded here: the point is to pin *its* value.
DEFAULT_QUBITS_PER_LOGICAL_D_SQUARED = payload["qubitsPerLogicalDSquared"]
check(
    payload["threshold"] == THRESHOLD,
    f'threshold drifted: TypeScript says {payload["threshold"]}, this check assumes {THRESHOLD}',
)
check(
    payload["defaultPrefactor"] in PREFACTORS,
    f'default prefactor {payload["defaultPrefactor"]} is not among the values compared here',
)
if not rows:
    print("FAIL: the TypeScript probe returned no rows -- was `npm run build` run?")
    sys.exit(1)

# ---------------------------------------------------------------- 1. functional form
print("1. Logical error rate formula")
form_checked = 0
for prefactor in PREFACTORS:
    scheme = QECScheme(error_rate_scaler=prefactor, error_rate_threshold=THRESHOLD)
    for p in ERROR_RATES:
        for d in (3, 7, 15, 27):
            mine = prefactor * (p / THRESHOLD) ** ((d + 1) / 2)
            theirs = scheme.logical_error_rate(d, p)
            check(
                math.isclose(mine, theirs, rel_tol=1e-12),
                f"formula mismatch at A={prefactor} p={p} d={d}: {mine!r} vs {theirs!r}",
            )
            form_checked += 1
print(f"   {form_checked} points agree to 1e-12 relative. Same functional form.\n")

# ------------------------------------------------------------- 2. physical qubits
print("2. Physical qubits per logical qubit")
scheme = QECScheme.make_gidney_fowler()
# The first version of this check compared 2*d*d against 2*d*d -- true by construction
# and therefore asserting nothing. It has to call Qualtran.
ours_multiplier = DEFAULT_QUBITS_PER_LOGICAL_D_SQUARED
qubit_checked = 0
for d in (3, 5, 11, 15, 21, 27, 51):
    theirs = scheme.physical_qubits(d)
    mine = ours_multiplier * d * d
    check(mine == theirs, f"qubit count mismatch at d={d}: ours {mine}, Qualtran {theirs}")
    qubit_checked += 1
print(
    f"   {qubit_checked} distances agree: ours {ours_multiplier}d^2 == Qualtran's "
    f"physical_qubits(d) (rotated surface code, data plus measurement qubits).\n"
)

# ------------------------------------------------------------------ 3. inversion
print("3. Distance from an error budget")
agree = 0
boundary_disagreements = []
real_disagreements = []
for row in rows:
    scheme = QECScheme(error_rate_scaler=row["prefactor"], error_rate_threshold=THRESHOLD)
    theirs = scheme.code_distance_from_budget(row["p"], row["budget"])
    mine = row["d"]
    if mine == theirs:
        agree += 1
        continue
    # Is the budget exactly the logical error rate at my distance? Then the two differ
    # only over whether the budget is inclusive.
    at_boundary = mine is not None and math.isclose(
        scheme.logical_error_rate(mine, row["p"]), row["budget"], rel_tol=1e-9
    )
    (boundary_disagreements if at_boundary else real_disagreements).append(
        (row["prefactor"], row["p"], row["budget"], mine, theirs)
    )

print(f"   {agree}/{len(rows)} agree exactly.")
for prefactor, p, budget, mine, theirs in boundary_disagreements:
    print(
        f"   inclusive-vs-exclusive at A={prefactor} p={p:.0e} budget={budget:.0e}: "
        f"ours d={mine} (p_L == budget, accepted), Qualtran d={theirs} (requires strictly below)"
    )
    notes.append(
        f"budget exactly on a boundary at A={prefactor}, p={p:.0e}: ours {mine}, Qualtran {theirs}"
    )

# A disagreement that is NOT at a boundary would be a real modelling difference.
check(
    not real_disagreements,
    "distance disagreements away from an exact boundary: "
    + "; ".join(
        f"A={a} p={p:.0e} budget={b:.0e}: ours {m}, theirs {t}"
        for a, p, b, m, t in real_disagreements
    ),
)
if not real_disagreements:
    print("   No disagreement away from an exact boundary.\n")

# ------------------------------------------------- 4. quantify the prefactor spread
print("4. What the prefactor choice costs (reported, not asserted)")
by_case: dict[tuple[float, float], dict[float, int | None]] = {}
for row in rows:
    by_case.setdefault((row["p"], row["budget"]), {})[row["prefactor"]] = row["d"]
shifted = 0
worst = 1.0
for (p, budget), per_prefactor in sorted(by_case.items()):
    low, high = per_prefactor.get(0.03), per_prefactor.get(0.1)
    if low and high and low != high:
        shifted += 1
        worst = max(worst, (high * high) / (low * low))
print(
    f"   {shifted}/{len(by_case)} cases shift distance when A moves 0.03 -> 0.1; "
    f"worst physical-qubit ratio {worst:.2f}x."
)
print("   Neither value is more correct; Qualtran calls the prefactor unprovenanced.\n")

# ------------------------------------------------------------------------- verdict
if failures:
    print("FAIL")
    for line in failures:
        print("  -", line)
    sys.exit(1)

print("PASS: the two models agree on form, qubit count, and inversion away from")
print("      exact budget boundaries. Prefactor difference quantified above.")
if notes:
    print("\nRecorded conventions:")
    for line in notes:
        print("  -", line)
