# Governance

How decisions get made in `ketqat-sdk`. Who makes them is in
[MAINTAINERS.md](MAINTAINERS.md).

This describes what actually happens today in a project with one maintainer. It
is deliberately not a structure borrowed from a larger project; a governance
document that describes a body which does not exist is worse than none, because
a contributor relies on it and finds nobody there.

## Decision model

**Benevolent dictator, one maintainer.** The project lead decides. In practice
most decisions are uncontested because there is currently nobody to contest
them, which is a description of the project's size rather than a claim about the
quality of its decisions.

## Authority by area

- **Ordinary changes** — reviewed in the pull request and merged when CI is
  green.
- **Scientific contracts** — schemas, reproducibility hashing, compatibility
  rules. A change here is a compatibility event, not a refactor: it alters every
  future hash and can silently invalidate comparison with stored runs. Requires
  an ADR in `ketqat-planning` and a schema version bump.
- **Security** — see [SECURITY.md](SECURITY.md). Vulnerabilities are handled
  privately until a fix exists.
- **Releases** — human-gated. No release exists yet; the first publication
  follows `docs/first-release-checklist.md`.

## RFCs and ADRs

Proposals under discussion are RFCs; accepted architecture and scientific
decisions are ADRs. Both live in `ketqat-planning`.

An ADR is never edited to reverse its decision. A new ADR supersedes it, and both
say so. The record of what was believed at the time is part of the point.

## Versioning

Semantic versioning, with one addition specific to this project: **a change to
canonical serialization, the hash exclusion set, or number formatting is
breaking even when no type signature changes.** It alters every future hash. Such
a change requires a schema version bump and an ADR, and cross-language parity
fixtures covering it in both TypeScript and Python.

## Deprecation

A deprecated contract field keeps working for at least one minor version, warns
in that period, and is removed only on a major. Nothing has been deprecated yet,
so this policy is untested; it will be refined the first time it is used.

## What is deliberately absent

No technical steering committee, no voting procedure, no code of conduct
enforcement team. Each would be a body of one. When there are enough maintainers
for any of them to mean something, they get written then — with the people who
will actually staff them.
