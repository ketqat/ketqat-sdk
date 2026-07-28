# Contribution Pack

Templates and a validator for contributing a benchmark, a decoder, or a
reproduction report.

The aim is that a contribution can be checked **without anyone running your
code**. Everything here is data: a manifest describing what you ran, and a
result describing what you got. CI validates the data. It does not execute
what you submitted.

## Why CI does not run your code

A benchmark contribution arrives as a pull request from an account nobody
vouches for, and pull-request workflows run with repository credentials. A CI
job that executed contributed code would run a stranger's program with those
credentials on every submission.

So the boundary is: **you run the experiment, we validate the record.** Your
numbers are accepted as *reported*, not as *verified*, and the registry says
which is which — see [`docs/verification-levels.md`](../docs/verification-levels.md).
An independent reproduction is a separate contribution, made by someone else.

That is also why a reproduction is worth more here than a first result. Anyone
can report a number; only a second person can corroborate it.

## What to submit

| You have | Use | Becomes |
| --- | --- | --- |
| A benchmark you ran | `templates/benchmark-result.yaml` | A run, status `UNVERIFIED` |
| A new decoder | `templates/decoder.yaml` | An artifact, plus a run if you benchmarked it |
| A re-run of someone else's result | `templates/reproduction-report.yaml` | Verification evidence on their run |

## Validate before opening a pull request

```bash
npm run validate:contribution -- contrib/my-submission.yaml
```

It checks structure, required provenance, and internal consistency, and it
tells you which field is wrong rather than that something is. Run it locally;
CI runs the same command, so a green local run means a green CI run.

## What is required, and why

**An immutable source reference.** A commit SHA, not a branch name. A branch
moves, and a result that points at a moving target cannot be reproduced later.

**A seed, where the experiment is stochastic.** Without it nobody can obtain
your numbers again, including you.

**The environment as it was.** Interpreter version and resolved package
versions, captured by the runner rather than typed in. `stim` and `pymatching`
change decoder behaviour between versions; a result without them is a number
without a method.

**A licence for what you contribute**, compatible with Apache-2.0.

**Whether the result is measured or demonstrative.** `is_demo: true` marks a
record produced to show the tooling works. Demo records are never ranked
against measured ones and never presented as scientific results. Marking a real
result as demo is harmless; the reverse is not, so mark it demo if unsure.

## What will be rejected

- A result whose recorded hash does not match its payload
- A stochastic result with no seed
- A source reference that is a branch or tag rather than a commit
- Metrics the benchmark suite does not declare, or missing ones it does
- A comparison across domains, schema versions, or non-overlapping metric
  coordinates — the compatibility rules refuse these, and the refusal is the
  feature
- Anything asserting `REPRODUCED` for your own result. That status is for a
  reproduction by someone else

## Threat model

What a malicious contribution could attempt, and what stops it:

| Attempt | Control |
| --- | --- |
| Execute code in CI | No CI path runs contributed code. Validation parses data and never evaluates it |
| Smuggle code through a manifest | A manifest names an approved operation and supplies validated parameters. There is no field for a script, package, image, or command, and a forbidden field is rejected at any depth |
| Overstate verification | Status and evidence kind are validated together. `REPRODUCED` requires an evidence URL, a hash, and a command or commit |
| Fabricate a result | Not prevented, and not claimed to be. A reported result is `UNVERIFIED` until someone else reproduces it. The defence is the verification level, not the submission gate |
| Exhaust CI | Validation is bounded parsing with size limits and no network access |

The fourth row is the honest one. Nothing here stops someone reporting numbers
they made up. What the platform provides is a record showing that nobody has
corroborated them.
