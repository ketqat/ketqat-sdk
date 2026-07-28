# Verification levels

What KetQat means when it says a result is verified, and — more importantly —
what it does not mean.

The registry's whole proposition is that a reader can tell corroborated work
from uncorroborated work at a glance. That only holds if each level is a claim
somebody actually earned.

## The levels

| Status | Evidence kind | What was actually checked |
| --- | --- | --- |
| `UNVERIFIED` | any | Nothing beyond the record existing. The default. |
| `VALIDATED_SCHEMA` | `SCHEMA_VALIDATION` | The payload parses against the published JSON Schema. Says nothing about whether the numbers are right. |
| `VALIDATED_SCHEMA` | `HASH_VERIFICATION` | The recorded reproducibility hash matches a recomputation of the payload. Proves the record has not been altered since it was hashed. **It does not prove the experiment ran**, and the contract explicitly refuses to let hash verification alone reach `REPRODUCED`. |
| `REPRODUCED` | `DEMO_FIXTURE_REPRODUCTION` | A demo fixture was re-run and matched. This is a self-consistency check of synthetic data. It is evidence the tooling works, not that a scientific claim holds. |
| `REPRODUCED` | `INDEPENDENT_REPRODUCTION` | Someone other than the submitter re-ran the experiment and obtained a matching hash. Requires a durable evidence URL and either a command or an immutable commit. |
| any | `REVIEW_NOTE` | A human recorded an assessment. Carries a named reviewer. |

## Two distinctions worth stating plainly

**A matching hash is not a reproduction.** It proves the bytes are unchanged. A
fabricated result hashes just as consistently as a real one. The contract
enforces this: `HASH_VERIFICATION` with status `REPRODUCED` is rejected.

**A demo-fixture reproduction is not independent corroboration.** Both share the
status `REPRODUCED`, so the status alone cannot tell them apart — the evidence
kind can. Any interface presenting verification must branch on the kind. The web
UI got this wrong until 2026-07-28: it labelled every `REPRODUCED` record
"Independently reproduced", including reproductions of synthetic fixtures.

## What is deliberately absent

There is no `INDEPENDENTLY_REPRODUCED` status and no `REVIEWED` status, even
though the phase brief lists them. Adding statuses that duplicate information
already carried by `evidence_kind` would create two sources of truth for the
same fact, and the failure above came from a reader trusting one of them alone.

The distinction is expressed once, in `evidence_kind`, and every consumer reads
it there. If that proves insufficient, the change is a schema version bump and a
planning ADR, not a quiet enum addition.

## Recording evidence

Evidence is a separate contract from the result it describes. It is never part
of a reproducibility hash input, so recording evidence about a run cannot change
that run's hash — which is what allows evidence to accumulate over time without
invalidating anything.

See `src/contracts/verification-evidence.ts` for the validation rules, and
`docs/provenance.md` for what is recorded about where a result came from.
