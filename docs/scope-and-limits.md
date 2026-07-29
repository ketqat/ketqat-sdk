# What KetQat covers, and what it does not

Every figure here was read from the code, not from memory. Where a number is
small, it is stated rather than rounded up.

The reason this file exists: the site presents a **decoder leaderboard**, and
until someone publishes a second decoder's results it shows one entrant.
Someone evaluating whether to trust a comparison should learn where the limits
are here, rather than by counting rows.

## Decoders

Two, and they are different in kind rather than two settings of one thing:

| Decoder | Method | Defining limit |
|---|---|---|
| `pymatching` | minimum-weight perfect matching | the standard matching decoder; assumes a matchable error model |
| `ketqat-lookup` | exact maximum likelihood, truncated | enumerates fault combinations up to `max_fault_weight`; a syndrome needing more is an **abstention**, counted separately from a wrong answer |

That second distinction matters. "Did not decode" and "decoded incorrectly" are
different failures, and merging them flatters or penalises a decoder depending
on which way you squint.

`ketqat run decoder-comparison` benchmarks both **on identical samples** — the
same shots at the same coordinate seed, because re-sampling per decoder would
compare luck as much as decoders. A real run, d=3 at p=0.01 over 2000 shots:

```
pymatching       51/2000   0.0255   95% CI [0.0194, 0.0334]
ketqat-lookup    56/2000   0.0280   95% CI [0.0216, 0.0362]
```

Those intervals overlap substantially, so the honest reading is that **this data
does not distinguish the two decoders** — which is what the comparison reports
rather than ranking them.

That result is about the *noise model*, not about the decoders. Under
readout-dominated noise they separate clearly. `ketqat run
readout-limited-memory`, d=3 at 100,000 shots:

```
                     gate noise only              readout-dominated
pymatching     0.00027 [0.00019, 0.00039]   0.00484 [0.00443, 0.00529]
ketqat-lookup  0.00044 [0.00033, 0.00059]   0.01161 [0.01096, 0.01229]
                     intervals overlap            disjoint, 2.4x apart
```

The cause is the truncation. `ketqat-lookup` enumerates faults up to
`max_fault_weight` and abstains beyond it, and unreliable measurement produces
more syndromes past that bound. Gate noise alone never exercises it.

Two things follow, and both are easy to get wrong. A comparison under one noise
model is not a general ranking. And a shot budget too small to resolve a
difference reports "no difference" with exactly the same confidence as a real
null — at 2,000 shots those two right-hand intervals still overlap.

The public leaderboard currently shows one decoder because only the
single-decoder baselines have been published to it. That is a publishing gap,
not a capability gap.

More decoders are still the most useful contribution available, and
[`contrib/templates/decoder.yaml`](../contrib/templates/decoder.yaml) exists for
exactly that.

## QEC codes

Four families, each executed by a real Stim circuit generator:

- rotated surface code (memory X and Z)
- unrotated surface code (memory X)
- repetition code (memory)
- color code (memory XYZ)

An unknown family is **rejected by name**, never defaulted, so a manifest cannot
ask for one code and silently measure another.

## Noise

One model: **depolarizing**, applied as Monte Carlo Pauli trajectories — errors
sampled after each gate, the trajectory simulated exactly, averaged over shots.

That is a real approximation with a real cost, and it is not a stand-in for
device noise. There is no amplitude damping, no crosstalk, no leakage, no
correlated or time-dependent noise, and no measurement-induced dephasing. A
threshold estimated under depolarizing noise is a statement about depolarizing
noise.

Rates are named `one_qubit_error`, `two_qubit_error`, `readout_error`, and a
misspelling is **refused rather than ignored** — an earlier version accepted an
unknown key and produced a maximally noisy circuit reported as the run you asked
for (ketqat-sdk#99).

### The QEC path is separate, and has four channels

The paragraphs above describe the statevector engine. QEC runs go through Stim
instead, and until ketqat-sdk#110 they applied exactly **one** channel —
depolarization after each Clifford. A manifest could name a readout error rate
and the run would ignore it, then publish a result labelled as though readout
error had been modelled.

Five channels are now applied:

| Manifest field | Stim parameter | What it models |
|---|---|---|
| `physical_error_rates` | `after_clifford_depolarization` | gate error (swept) |
| `readout_error_rate` | `before_measure_flip_probability` | measurement flips |
| `reset_error_rate` | `after_reset_flip_probability` | imperfect reset |
| `idle_error_rate` | `before_round_data_depolarization` | idling on data qubits |
| `crosstalk_error_rate` | injected `DEPOLARIZE2` | correlated error between idling neighbours |

Readout error matters more than its position in that list suggests: on real
superconducting devices it is frequently the *dominant* error, and it separates
decoders that pure gate noise cannot, because matching and maximum-likelihood
degrade differently when the syndrome itself is unreliable.

**Absent is not zero.** A run that did not model a channel records it as absent,
not as a device with perfect measurement. The three optional channels are also
part of the comparability key, so a run at 5% readout error is not ranked
against a run that never modelled it — those are two experiments, not one
comparison.

What is still missing divides into two kinds, and an earlier version of this
document got the division wrong — it claimed correlated noise was inexpressible in
Stim, which is false. Stim has `CORRELATED_ERROR`, and `DEPOLARIZE2` on
non-interacting qubits is correlated noise. That claim is why the crosstalk
channel above now exists (ketqat-sdk#112).

**Genuinely inexpressible**, because the stabilizer formalism cannot represent
them: amplitude damping and phase damping are not Pauli channels, and leakage
leaves the qubit subspace entirely. These need a density-matrix or higher-level
simulator, not a further parameter, and no work on this path will produce them.
Approximating a damping channel by a Pauli twirl and running it under the
original name would be a different experiment reported as the requested one.

**Expressible but not implemented**: time-dependent noise and drift. Stim can
carry a different error rate per round; the generated circuits here use one
`REPEAT` block with fixed rates, so every round is identical. That is a limit of
this runner, not of the simulator, and it is tracked rather than dismissed.

The distinction matters because the two get fixed by completely different work,
and calling the second kind impossible is how a tractable gap stays open.

## Simulation

- Exact statevector, **24 qubits maximum**. Above that it refuses rather than
  approximating.
- Stim for stabilizer/QEC sampling, which is where the qubit counts are large.
- Every result is recorded as `SIMULATION`, on the page, in the record, and
  inside the downloaded bundle.

## Hardware

**None.** No result in this project has touched a quantum device.

The provider adapters use the official IBM and Braket SDKs and execute only via
`run_on_fake_backend` and `run_on_local_simulator`. **No function submits to
hardware**, and there is no automatic fallback from hardware to simulation
anywhere — if a provider were unavailable, a run would fail rather than quietly
produce a simulated number.

They *can* read from a live service with a credential: listing backends and
reading their properties, which is how a dated calibration snapshot is taken.
Reading produces no result and spends no quota, and compiling against a real
coupling map and error rates is the point of having a snapshot. Executing
against one is still a simulation, recorded as `SIMULATION`.

Hardware profiles used by the transpiler are **synthetic topologies** for
exploring routing. They are not observations of any real device, and the
Workbench says so where they are offered.

## Statistics

- Logical error rates carry a Wilson score interval, chosen because it stays
  sensible at zero observed failures, which is where QEC results usually live.
- A run with no observed failures is reported as an **upper bound**, never as a
  rate of zero — in the record, the CLI, the leaderboard, and the run page.
- Reported uncertainty is **statistical only**. It is shot noise. It does not
  include systematic error, and for the mitigation path it does not include the
  error from the extrapolation model being wrong, which is usually larger.

## Reproducibility

- The same experiment run twice produces the same hash. That was not true until
  ketqat-sdk#89; duration measurements were inside the hashed payload.
- Hashing rules are versioned, so a hash published under version 1 still
  verifies under version 1.
- TypeScript and Python produce byte-identical hashes, enforced by shared
  fixtures pinning both versions.

## Adoption

Published at [ketqat.com/metrics](https://ketqat.com/metrics), generated by a
script in this repository, reporting unmeasured values as unknown rather than
zero. At the last collection: one external contributor, most recently 173 days
ago; nothing published to npm or PyPI; no releases; one star.

## Not implemented

Stated plainly so nobody has to infer it from absence:

- decoder cancellation against a live provider (ketqat-sdk#84)
- the Braket density-matrix simulator (ketqat-sdk#86)
- PyPI download metrics, which need a published package (ketqat-sdk#85)
- zod 4, which needs a schema generator that understands it (ketqat-sdk#96)
- any web contribution path — the web application is a private repository
