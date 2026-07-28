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

`transpile`, `estimate_resources`, `optimize_zx`, and `check_equivalence` have
no example yet — see [ketqat-sdk#88](https://github.com/ketqat/ketqat-sdk/issues/88).
One well-explained example is worth more than four thin ones, so they are left
open rather than filled in quickly.

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
uncertainty 0.0078
```

The noise is scaled by unitary folding — replacing each gate `G` with `G G† G`,
which is mathematically the identity substitution but physically three times the
exposure. Fitting those three points back to zero noise recovers 0.9925 against
a true value of 1.0.

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
