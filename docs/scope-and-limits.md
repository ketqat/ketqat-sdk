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
