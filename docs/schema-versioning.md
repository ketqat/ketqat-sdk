# Schema and hash versioning policy

What may change in a published contract, what may not, and what a change costs.

This is the policy `ketqat-planning#46` asks for. It exists because the usual way a
scientific registry loses its comparability is not a dramatic redesign — it is a field
added in a routine pull request, by someone who had no reason to think it was a
compatibility event.

## The one rule that decides everything

**Anything that changes the canonical form of a hashed payload is breaking**, regardless of
how the diff looks.

`src/reproducibility/index.ts` and `python/src/ketqat_runner/hashing.py` must produce
byte-identical canonical JSON, and therefore identical SHA-256 digests, for every input.
Change what goes into that canonical form and every future hash differs from every stored
one — so a run published tomorrow can no longer be compared with one published today, and
nothing fails loudly when it happens. The runs simply stop matching.

Breaking, in that sense:

- adding or removing a field **inside** a hashed payload
- changing the exclusion set **of an existing hash version** (see below — there is a safe
  way to change it, and this is not it)
- changing key ordering, number formatting, or the treatment of `undefined`, explicit
  `null`, whole-number floats or negative zero
- changing which level of a nested object the exclusion set is applied at

Not breaking:

- adding an **optional** field that is absent by default. An absent optional field is
  dropped by canonicalization, so stored hashes are untouched. This is why
  `execution_class` is `.optional()` and deliberately has **no** `.default(...)`: a default
  would materialize the field on every payload and change every hash.
- adding a new enum member that no existing record uses
- documentation, tests, error messages, and anything outside the canonical form

## The exclusion set is versioned, and that is the escape hatch

`src/reproducibility/index.ts` keeps an exclusion set **per hash version**, and every record
records which version produced its hash in `reproducibility_hash_version`. A record with no
marker predates versioning and is version 1 by definition — defaulting to the current
version instead would report every historical record as a mismatch, which is the opposite
of what versioning is for.

That is what makes changing the rules possible at all. Version 2 exists because the same
experiment, run twice from the same seed, produced different hashes — not because any
logical error rate, shot count or decoder verdict differed, but because the run took a
different number of milliseconds ([ketqat-sdk#89](https://github.com/ketqat/ketqat-sdk/issues/89)).
A hash that changes when nothing scientific changed is not a reproducibility hash: it made
`REPRODUCED` evidence unobtainable except by copying a hash you had not computed, and import
deduplication impossible.

So the safe way to change what is hashed is:

1. Add a **new** version number with its own exclusion set. Leave the old sets untouched.
2. Raise `CURRENT_HASH_VERSION`. New hashes use the new rules; every published hash still
   verifies under the rules it was written with.
3. Rewrite nothing. No stored record changes, and no existing evidence is invalidated.

Editing an existing version's set is the breaking case, because it silently changes what a
stored hash *should* have been.

One detail worth copying rather than re-deriving: the timing keys are **enumerated, not
pattern-matched**. A rule like "anything ending in `_seconds`" would swallow a future field
that genuinely belongs in the hash — a duration that is the *result* of an experiment rather
than an artifact of running it — and that failure would be invisible. Every excluded timing
key was found by running the same experiment twice and diffing the payloads, not by reading
the schema.

## A second rule set, for a family that has no history: `study-v1`

The escape hatch above adds a version to one registry. The `study` contract family
([ketqat-sdk#259](https://github.com/ketqat/ketqat-sdk/issues/259)) instead declares a
**separate** rule set, `study-v1`, in `src/study/` and `python/src/ketqat_runner/study_*.py`.
The legacy registry, its exclusion sets and `hashVersionOf` are untouched, so every published
hash still verifies under the rules it was written with, and the frozen fixture corpus is
byte-identical.

**`study-v1` does not have an exclusion set at all**, and that is the substantive difference
from everything above. The legacy registry decides what to leave out by matching key names at
every nesting level. That rule has to be right about every name that can ever appear at every
depth, including names an attacker picks, and five rounds of probing found five holes in it —
a nested `slug`, a nested `content_hash`, a free-map key chosen by whatever captured an
environment, unguarded numbers, `__proto__`. They are one bug reported five times.

So each study record kind declares every field it has as `SEMANTIC`, `RECORD_ONLY`,
`RECEIPT_ONLY` or `DERIVED` (`src/study/registry.ts`), and the digest is built from those
declarations rather than from the record's keys. A key nobody declared is never read, and is
refused rather than skipped. `tests/study-field-completeness.test.mjs` walks each Zod schema
against the tables and fails on any field they do not classify, in either direction, so a new
field is a decision a reviewer sees in a diff rather than a silent default.

Three more differences from the versioned registry, all deliberate:

- **The marker is a different field.** A study record names its rules in `hash_rules_id`,
  not in `reproducibility_hash_version`. The legacy inference reports version 1 for any
  marker that is not an integer, so writing `"study-v1"` into the legacy field would not
  fail — it would verify the record under version 1 rules and report success. A silent
  wrong answer is the one outcome worth adding a field to avoid.
- **Nothing is inferred.** "No marker means version 1" is right for records that predate
  versioning. This family has none, so a record without a rules id is not old but
  malformed, and it is refused rather than defaulted. An unknown id is refused too, never
  treated as the current one.
- **The canonical form is a published specification.** RFC 8785 (JCS), implemented against
  the RFC in each language and pinned to the RFC's own vectors in
  `fixtures/jcs/rfc8785-vectors.json`, so a divergence fails against the spec rather than
  against the other implementation.

Which of the four digests a record kind writes into its own hash field is declared per kind,
in the same tables. `Study` and `StudyTask` carry denormalized state that moves under them —
a status, the pointers at the newest revisions — so their `content_hash` is the *semantic*
digest and does not move when that state does. Every other kind is immutable once written, so
its self-hash is the *record* digest and answers "was this file edited after it was written",
which is the question its verifier actually reports on.

**`study-v1` changed once, before publication, and that is why it kept its name.** Nothing has
ever been released under it — npm 404, PyPI 404, no GitHub releases, no study surface in the
live API — so there is no stored digest to be compatible with. The rules behind the name were
replaced rather than versioned around. A future change, once anything is published, is a new
id and never a reinterpretation of this one.

Study pins live in `fixtures/reproducibility/study-expected-hashes.json`, a separate sidecar,
so `expected-hashes.json` stays part of the frozen corpus. Each entry names the record kind
its digest was taken under, because the kind is a preimage header component and there is no
hash of an object in the abstract. Both languages reproduce every entry.

## What a breaking change requires

1. A planning ADR recording why the incompatibility is worth its cost.
2. A `schema_version` bump on the affected contract.
3. Parity fixtures in `fixtures/reproducibility/` covering the new behaviour **in both
   languages**. Known sharp edges already covered: explicit `null` versus an absent key,
   whole-number floats, negative zero.
4. A `CHANGELOG.md` entry under **Breaking**, whatever the semantic-version arithmetic
   suggests. A registry's users care about hash compatibility, not about whether the
   maintainer classified it as a minor release.

## Versions in play, and why they are separate

| Version | What it identifies | Who bumps it |
|---|---|---|
| `schema_version` on a record | the shape of that contract | a contract change |
| `reproducibility_hash_version` | which exclusion set and canonical form produced the hash | a hashing change; adding a version is safe, editing one is not |
| `hash_rules_id` on a `study` record | which rule set produced the hash, stated rather than inferred | a new rule set in the study family; the legacy registry is untouched |
| package version (`ketqat-sdk`, `ketqat`) | the release | every release |
| benchmark suite version | the experiment definition a run is compared under | a change to what is measured |

They are separate because they change for different reasons and at different rates. The one
most easily confused is the last: a **suite** version is not a package version. A suite
definition is what runs are compared under, so editing one in place would silently change
what every existing run means. `POST /api/benchmarks/import` therefore returns an existing
`(slug, version)` unchanged rather than updating it — a correction is a new version, never
an edit.

## Deprecating a field

Fields are removed in two releases, never one:

1. Mark it optional and stop writing it. Readers keep accepting it. No hash changes,
   because an absent optional field is dropped.
2. Remove it from the contract in a later release, with the ADR and the version bump above.

A field removed in one step breaks every stored record that still carries it, and the
breakage surfaces as a validation error on data nobody can go back and fix.

## What is not versioned, on purpose

**Verification evidence is not part of any hashed payload.** Evidence about a run can
therefore accumulate over time — a schema validation today, an independent reproduction next
year — without invalidating the run's hash. See [`verification-levels.md`](verification-levels.md).

**Popularity, view counts and similar signals are not in contracts at all**, so they cannot
version, cannot be hashed, and cannot contribute to a ranking.
