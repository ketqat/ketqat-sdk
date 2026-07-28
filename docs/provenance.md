# Provenance

What KetQat records about where a result came from, and what it refuses to
infer.

## What every run carries

- **Reproducibility hash** — SHA-256 over a canonical serialization of the
  manifest, environment, configuration, and results. Byte-identical across the
  TypeScript and Python implementations; parity is enforced by fixtures in both
  languages.
- **Environment** — operating system, architecture, interpreter version, and
  resolved package versions, captured at run time rather than declared.
- **Source** — repository URL and commit SHA when supplied. A run without them
  is still accepted, and is simply less reproducible; it is not silently
  annotated with a guess.
- **Execution class** — `SIMULATION`, `HARDWARE`, `ANALYTICAL`, or `DEMO`. Never
  inferred from context. A result whose class is unknown records no class rather
  than a plausible one.

## Fields excluded from the hash, and why

The rules are versioned. A record carries `reproducibility_hash_version`, and a
verifier recomputes under the version the record was written with — so a hash
published under older rules still verifies, and fixing the rules never
invalidates existing evidence.

### Version 1 — identity and presentation

`id`, `slug`, `started_at`, `finished_at`, `created_at`, `updated_at`,
`submitted_at`, `ui_metadata`, `reproducibility_hash`, `owner_username`,
`visibility`, `reproducibility_hash_version`.

Identity, timestamps, presentation, and access-control metadata. Two identical
experiments run an hour apart by different people must hash the same, or the
hash stops being a statement about the science.

### Version 2 — also duration measurements

Everything in version 1, plus `runtime_seconds`, `decoder_latency_ms`,
`decoder_latency_ms_per_shot`, `sampling_runtime_seconds`,
`circuit_generation_seconds`, `decode_runtime_seconds`, and
`decoder_construction_seconds`.

Version 1 hashed these, and the consequence was that **the same experiment run
twice produced different hashes** (ketqat-sdk#89). Not because the science
differed — every logical error rate, shot count, and decoder verdict was
identical — but because the second run took a different number of milliseconds.
The hash fingerprinted machine speed.

That made `REPRODUCED` evidence unobtainable except by copying a hash you had
not computed, and made import deduplication impossible.

The list is enumerated rather than pattern-matched. A rule like "anything ending
in `_seconds`" would silently swallow a future field that genuinely belongs in
the hash — a duration that is the *result* of an experiment rather than an
artifact of running it — and that failure would be invisible.

### Changing the set

Add a new version; do not edit an existing one. Editing version 1 would change
hashes already published and break every stored run. Adding version 3 changes
nothing that exists. The shared fixtures in `fixtures/reproducibility/` pin
every version's output in both languages, so a drift in either is a test
failure.

## What is never inferred

- A missing commit SHA is not backfilled from the current checkout.
- A missing environment is not reconstructed from the machine reading the file.
- A demo record is never promoted to a real one, and carries `is_demo: true`.
- Absent provider credentials produce a not-run record, never a fixture that
  resembles an executed result.
- A result that could not be produced is recorded as not run. "Not verified" and
  "verified false" are different statements and are stored differently.

## Comparability

Runs are refused for comparison across domains, differing suite or schema
versions, missing required metrics, and non-overlapping metric coordinates. The
refusal is deliberate: a leaderboard that silently compares incomparable runs
produces a ranking that looks authoritative and means nothing.

See `docs/verification-levels.md` for what "verified" means at each level.
