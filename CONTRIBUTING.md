# Contributing to ketqat-sdk

Thank you for contributing to KetQat SDK, the shared contract layer for reproducible quantum error-correction and quantum-algorithm research.

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Project Boundaries

This repository owns public research contracts, validators, generated JSON Schemas, reproducibility hashing, compatibility helpers, demo fixtures, a typed REST client, and the local runner package.

It must not contain web UI code, Prisma models, deployment configuration, hardware-access catalogs, QPU credential handling, availability checks, pricing logic, or commercial QPU execution integrations.

## Where to start

Issues labelled [`good first issue`](https://github.com/ketqat/ketqat-sdk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are scoped so you can finish them without needing to understand the whole
project. Each names the likely files, what "done" looks like, and what tests to
add.

Issues labelled `needs:decision` are **not** good starting points, whatever
their size. They are open because nobody has settled what the right behaviour
is, and a pull request implementing one guess is likely to be closed through no
fault of yours.

You do not need permission to start. Comment on the issue so two people do not
duplicate work, and open a draft pull request early if you would like feedback
before finishing.

## Development

### TypeScript

```bash
npm ci
npm run build      # tsc, then regenerate JSON Schemas from the Zod contracts
npm test           # build, tests, package contents, licence, citation, workflows
```

`npm run build` regenerates `schemas/` from the TypeScript contracts. Never
hand-edit a generated schema: change the contract and rebuild. Review both the
contract diff and the schema diff, because the second is what other people
consume.

### Python runner

Needs Python 3.10 or later. The QEC extra pulls in real NumPy, Stim, and
PyMatching — there is no synthetic fallback, by design, so a missing dependency
fails loudly rather than producing invented numbers.

```bash
python3 -m venv .venv && source .venv/bin/activate
python -m pip install -e "python[qec]" pytest
pytest python/tests
ketqat run surface-code-memory --output /tmp/run.json
```

The provider adapters are separate extras, because Qiskit and the Braket SDK are
large and most contributions do not need them:

```bash
python -m pip install -e "python[ibm,braket]"
pytest python/tests/test_providers.py
```

### Reproducing CI locally

CI runs the same commands. If `npm test` and `pytest python/tests` pass
locally, CI will agree — with one exception: the `worker-image` job builds the
worker container and runs a job through it, which needs Docker.

```bash
npm run verify:worker-image   # skips loudly if Docker is unavailable
```

## What "done" looks like

A change is ready for review when:

- `npm test` and, if you touched Python, `pytest python/tests` pass
- New behaviour has a test that **fails without your change**. Please check
  this rather than assuming; several tests in this repository were found to be
  passing for the wrong reason
- A contract or schema change says so in the pull request, with its
  compatibility impact
- Anything you could not verify is stated as unverified rather than omitted

## Review

One maintainer reviews, and the project currently has one — see
[MAINTAINERS.md](MAINTAINERS.md). Expect a first response within about a week.
If it has been longer, the message was missed rather than ignored; a comment on
the pull request is the right nudge.

Review is about the change, not the contributor. If a review comment reads as
curt, it is brevity rather than displeasure. Ask if anything is unclear.

## Scientific integrity

These are not stylistic preferences. Breaking one produces a wrong scientific
claim, which is the failure this project is least able to absorb.

- **Report what was not run as not run.** "Not verified" and "verified false"
  are different statements and are stored differently.
- **A matching hash is not a reproduction.** It proves the bytes are unchanged;
  a fabricated result hashes just as consistently. See
  [docs/verification-levels.md](docs/verification-levels.md).
- **Never reintroduce a synthetic fallback** for missing QEC dependencies.
  Failing loudly is the feature.
- **Do not loosen a compatibility refusal** to make a comparison work. The
  refusals exist because a leaderboard that silently compares incomparable runs
  produces a ranking that looks authoritative and means nothing.

## Research Data Expectations

Demo records must be marked with `is_demo: true`. Do not add fabricated stars, downloads, dates, author claims, benchmark claims, threshold claims, or performance claims. Real benchmark data should include enough configuration, environment, source, and metric detail for reproducibility hashing and compatibility checks.

## Pull Requests

Use focused pull requests. Include:

- the research contract or runner behavior that changed
- generated schema changes
- compatibility or hashing impact
- commands used for validation
- scientific limitations or assumptions

By contributing, you agree that your contribution is licensed under Apache-2.0.
