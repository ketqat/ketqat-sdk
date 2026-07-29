# Examples

Runnable examples for the operations the engine exposes. Each one demonstrates
the tool. **None of them is a scientific finding**, and the prose says what each
result does not mean, which is the part that matters.

| Example | Operation | Runs with |
|---|---|---|
| [`qec/surface-code-memory.yaml`](qec/surface-code-memory.yaml) | QEC benchmark | `ketqat run surface-code-memory` |
| [`qec/decoder-comparison.yaml`](qec/decoder-comparison.yaml) | QEC, two decoders | `ketqat run qec/decoder-comparison` |
| [`algorithms/grover-search.yaml`](algorithms/grover-search.yaml) | algorithm benchmark | `ketqat run grover-search` |
| [`mitigation/zero-noise-extrapolation.json`](mitigation/zero-noise-extrapolation.json) | `mitigate_zne` | execution plane, below |
| [`equivalence/cx-decomposition.json`](equivalence/cx-decomposition.json) | `check_equivalence` | execution plane, below |
| [`resources/t-count-with-toffoli.json`](resources/t-count-with-toffoli.json) | `estimate_resources` | execution plane, below |
| [`transpile/routing-on-a-line.json`](transpile/routing-on-a-line.json) | `transpile` | execution plane, below |
| [`optimization/cancelling-gates.json`](optimization/cancelling-gates.json) | `optimize_zx` | execution plane, below |

All six operations now have a worked example.

---

## Zero-noise extrapolation

```bash
ketqat-engine job submit examples/mitigation/zero-noise-extrapolation.json \
  --registry https://ketqat.com --wait
```

The circuit is `h q[0]; h q[0];` — two Hadamards, which compose to the identity.
The ideal answer is therefore known exactly: **⟨Z⟩ = 1.0**. That is the whole
point of choosing it. A mitigation example on a circuit whose true value nobody
knows cannot show you whether the mitigation worked.

### What it produces

At 5% depolarizing error per gate, seed 42, 4000 shots per scale factor:

```
scale 1:  0.872
scale 3:  0.661
scale 5:  0.492

raw         0.8715
mitigated   0.9925      (ideal 1.0)
uncertainty 0.0214      (raw shot noise 0.0078, amplified 2.8x)
```

The noise is scaled by unitary folding — replacing each gate `G` with `G G† G`,
which is mathematically the identity substitution but physically three times the
exposure. Fitting those three points back to zero noise recovers 0.9925 against
a true value of 1.0.

Note what mitigation cost. The raw point carries shot noise of 0.0078; the
extrapolated value carries **0.0214**, because the weights that cancel the noise
term also combine the input variances with coefficients larger than one. The
mitigated estimate is closer to the truth *and* less precisely resolved, and
both halves of that are worth knowing before quoting it.

That uncertainty is still statistical only. It does not include the error from
the extrapolation model being wrong, which is usually the larger term and which
no amount of shots reduces.

### What this does not mean

**The mitigated value is an estimate under a model, not a measurement.** The
result says so in its own `assumptions` field, and that is not boilerplate:

- Noise is assumed to scale approximately linearly with circuit depth under
  folding. Real device noise does not, and folded circuits experience different
  crosstalk and idling than the original.
- The extrapolation model (Richardson by default) is a choice. A different
  model fits the same three points to a different answer.
- The reported uncertainty is **statistical only** — it is the shot noise on the
  fit. It does not include the error from the model being wrong, which is
  usually larger and is not quantified here.

**A closer number is not a better experiment.** Run the same example at 1%
error instead:

```
scale 1:  0.974
scale 3:  0.924
scale 5:  0.889

raw         0.9735
mitigated   1.0031      <-- outside the physical range
```

⟨Z⟩ cannot exceed 1. The extrapolation overshot, and the result carries a
warning saying so rather than clamping it to a plausible-looking 1.0:

> Extrapolated value 1.003063 lies outside the physical range [-1, 1]. This
> indicates the extrapolation model does not fit the data, not a measurement.

That is the most useful thing this example teaches. Mitigation can move a number
toward the right answer and past it, and the only way to notice is to check
whether the output is physically possible. On a real experiment, where the true
value is unknown, an unphysical result is often the only signal you get that the
model was wrong.

### Getting the noise model right

The rates are named `one_qubit_error`, `two_qubit_error`, and `readout_error`.
Anything else is rejected by name — a misspelled rate used to produce a
maximally noisy circuit reported as the run you asked for
([#99](https://github.com/ketqat/ketqat-sdk/issues/99)), so the schema now
refuses unknown keys rather than ignoring them.

### Simulation, not hardware

This runs on the statevector simulator with Monte Carlo Pauli trajectories.
Every result the execution plane produces is recorded as `SIMULATION`, in the
record, on the page, and inside the downloaded bundle. Nothing here reaches a
quantum device, and no number from it describes one.

---

## Checking that two circuits are the same

```bash
ketqat-engine job submit examples/equivalence/cx-decomposition.json \
  --registry https://ketqat.com --wait
```

The two circuits are `cx q[0], q[1]` and its standard decomposition
`h q[1]; cz q[0], q[1]; h q[1]`. They are a well-known identity, so the expected
answer is known before the tool runs — which is what makes the example able to
show whether the check works.

### What it produces

```json
{
  "level": "NUMERICALLY_CHECKED",
  "method": "statevector",
  "tolerance": 1e-9,
  "global_phase_ignored": true,
  "qubit_count": 2
}
```

### `NUMERICALLY_CHECKED` does not mean proven

This is the part worth reading twice. The level is not `PROVEN`, and the
difference is not modesty:

- The circuits were compared by **simulating both exactly and comparing
  amplitudes**, at a tolerance of `1e-9`, on this specific input state.
- It is a numerical result on a 2-qubit state space, not an algebraic proof of
  unitary equality.
- **Global phase was ignored.** Two circuits differing only by an overall phase
  are reported as equivalent, which is usually what you want and is occasionally
  not — a controlled version of a phase-differing circuit is *not* equivalent.

Quoting this as "the compiler proved my optimisation correct" overstates it. It
checked, exactly, at a tolerance, on this many qubits, up to global phase.

### The other three answers

**A real difference**, `x q[0]` against `z q[0]`:

```json
{
  "level": "FAILED",
  "counterexample": "Maximum amplitude difference 1.000e+0 exceeds tolerance 1.000e-9 (state fidelity 0.000000000000)."
}
```

A `FAILED` verdict names the discrepancy rather than only reporting a verdict,
so you can tell a genuine semantic difference from a tolerance that is too tight.

**A structural mismatch** — different qubit counts:

```json
{ "level": "FAILED", "counterexample": "Circuits act on different numbers of qubits: 2 and 3." }
```

**Too large to check** — beyond the exact-simulation limit:

```json
{
  "level": "INCONCLUSIVE",
  "qubit_count": 26,
  "reason": "Exact comparison needs 2^26 amplitudes, above the 24-qubit limit. Not attempted; this is not evidence that the circuits differ."
}
```

`INCONCLUSIVE` is the answer that matters most, and it is the one most likely to
be misread. It does **not** mean the circuits differ, and it does not mean they
match. It means the question was not answered. Treating it as either is how a
transpiler bug survives review: nobody checked, and the record said something
that looked like a check.

---

## Counting the cost of a circuit

```bash
ketqat-engine job submit examples/resources/t-count-with-toffoli.json \
  --registry https://ketqat.com --wait
```

### What it produces

```json
"fault_tolerant": {
  "t_count": 3,
  "clifford_count": 2,
  "toffoli_count": 1,
  "unsupported_for_ft_count": 0
}
```

### The number you must not quote on its own

**`t_count: 3` is not this circuit's T-count.**

T-count is the usual proxy for fault-tolerant cost, because magic-state distillation
dominates the resource budget. So `t_count` is exactly the field a reader lifts
into a slide. Here it is an undercount by more than a factor of three, and the
reason is sitting next to it: `toffoli_count: 1`.

A Toffoli is not a Clifford gate. Decomposed into the Clifford+T basis it costs
**seven T gates**. This circuit therefore needs roughly `3 + 7 = 10` T gates once
it is expressed in a basis a fault-tolerant machine can execute — not 3.

The estimator is not wrong; it says what it did:

```json
"notes": [
  "Static count over the circuit as written. No synthesis, decomposition, or optimization is applied.",
  ...
]
```

**A static count over the circuit as written.** Toffolis are reported in their own
field precisely so the gap is visible rather than folded silently into a single
number. Counting them as one gate each and calling the total a T-count would be
the misleading version, and it would look tidier.

### What else it declines to estimate

```json
"Duration not estimated: the hardware snapshot does not characterize every gate used.",
"Success probability not estimated: the hardware snapshot does not characterize every gate used.",
"No hardware snapshot supplied, so duration and fidelity are not estimated."
```

Runtime and success probability are absent rather than defaulted. Both depend on
per-gate durations and error rates that only a hardware profile supplies, and a
plausible-looking number derived from nothing is worse than no number — it is
indistinguishable from a measurement until someone tries to reproduce it.

Pass `hardware_profile` to get those estimates, and they will then be estimates
*under that profile*, not properties of the circuit.

### What this is not

- **Not a compilation.** Nothing was synthesised, decomposed, routed, or
  optimised. A real toolchain will change every one of these counts.
- **Not a lower bound.** Optimisation can reduce T-count; decomposition
  increases it. The number moves in both directions.
- **Not hardware-specific.** No connectivity, no native gate set, no calibration
  data entered into it.

---

## Routing a circuit onto real connectivity

```bash
ketqat-engine job submit examples/transpile/routing-on-a-line.json \
  --registry https://ketqat.com --wait
```

The circuit entangles `q[0]` with `q[4]` and `q[3]`. The target is a five-qubit
**line**, where `q[0]` and `q[4]` are four hops apart and cannot interact
directly. Something has to move.

### What it costs

```
before   3 gates, 2 two-qubit, depth 4
after    6 gates, 2 two-qubit, depth 7,  swap_count 3
```

Three SWAPs, double the gates, and depth from 4 to 7 — for a circuit that was
already only three gates long. **That is the price of connectivity**, and it is
why a gate count taken before routing tells you very little about what a device
will actually run.

### The field you must not ignore

```json
"initial_layout": [0, 1, 2, 3, 4],
"final_layout":   [3, 0, 1, 2, 4]
```

The qubits **moved**. Logical `q[0]` ends up on physical qubit 3. Reading the
output bitstring as though bit 0 were still logical qubit 0 gives a wrong answer
that looks entirely plausible — the histogram will be well-formed, the shot
count correct, and the assignment scrambled.

### Equivalence is asserted, not verified

```json
"equivalence": {
  "level": "NOT_CHECKED",
  "method": "SWAP routing preserves the circuit up to the recorded final_layout permutation."
}
```

`NOT_CHECKED` is honest. The router did not simulate both circuits and compare
them; it relies on the argument that SWAP insertion preserves semantics **up to
the permutation it recorded**. That argument is sound and it is not a
verification. If you want one, run `check_equivalence` — and remember it will
disagree unless you account for the layout.

---

## Cancelling gates with ZX rewrites

```bash
ketqat-engine job submit examples/optimization/cancelling-gates.json \
  --registry https://ketqat.com --wait
```

Three `h` gates on one qubit and two `z` gates on another. Two of each cancel.

```json
"before": { "gate_count": 6, "depth": 6 },
"after":  { "gate_count": 2, "depth": 2 },
"rewrites": [
  { "rewrite": "hadamard_pair_cancellation", "count": 1 },
  { "rewrite": "self_inverse_cancellation",  "count": 1 }
]
```

Each rewrite is **named and counted** rather than reported as a single
"optimized" flag, so the reduction can be audited rather than trusted.

### The optimisation is checked, and here is when it is not

```json
"equivalence": { "level": "NUMERICALLY_CHECKED", "method": "statevector",
                 "tolerance": 1e-9, "global_phase_ignored": true }
```

The same circuit **with measurements appended** produces the identical rewrites
and a different verdict:

```json
"equivalence": {
  "level": "INCONCLUSIVE",
  "reason": "Could not simulate both circuits: A circuit with measurement requires a positive shot count."
}
```

Same reduction, same gates removed — and no verification, because a circuit
containing measurement cannot be compared as a statevector.

That pairing is the lesson. **"Optimised" and "verified equivalent" are separate
claims**, and the second is the one that fails quietly. An optimiser that
reported only "6 gates → 2 gates" would look identical in both cases while being
checked in one and unchecked in the other.
