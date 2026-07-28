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

`id`, `slug`, `started_at`, `finished_at`, `created_at`, `updated_at`,
`submitted_at`, `ui_metadata`, `reproducibility_hash`, `owner_username`,
`visibility`.

These are identity, timing, presentation, and access-control metadata. Two
identical experiments run an hour apart by different people must hash the same,
or the hash stops being a statement about the science.

Changing this set changes **every future hash** and silently breaks comparison
with every stored run. It is a breaking contract change requiring a schema
version bump and a planning ADR.

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
