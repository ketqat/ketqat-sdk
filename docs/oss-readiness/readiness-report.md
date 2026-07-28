# Claude for Open Source — readiness report

**Verified: 2026-07-29 (Asia/Tokyo).** Supersedes the snapshot in
[`claude-for-oss-readiness-audit.md`](claude-for-oss-readiness-audit.md), which
remains as the 2026-07-13 baseline.

This report is not an application, and it is not a claim that KetQat qualifies
for, has applied to, or has been accepted into the Claude for Open Source
program. It exists to record honestly where the project stands.

**Conclusion: KetQat does not currently qualify on any maintainer-track route,
and is not close on any of them.** The gap is adoption, not engineering. That
distinction is the useful content of this report.

---

## 1. Program criteria, re-verified today

Fetched 2026-07-29 from
[anthropic.com/claude-for-oss-terms](https://www.anthropic.com/claude-for-oss-terms).
**Unchanged from the 2026-07-13 check.**

A maintainer-track applicant must meet **at least one** of:

| # | Route | Threshold |
|---|---|---|
| 1 | Dependent repositories | 500 or more |
| 2 | Dependent packages | 100 or more |
| 3 | Monthly downloads | 200,000 or more, any public registry |
| 4 | Foundation status | listed committer or maintainer of a recognized foundation or language project |
| 5 | Merged pull requests | 100 or more, into public repositories you do not own, preceding 12 months |
| 6 | External contributors | 20 or more unique, with merged PRs, preceding 12 months |
| 7 | OpenSSF criticality | 0.4 or higher |

General requirements: a natural person, 18 or older, resident where Claude.ai is
available and not subject to US export restrictions, a GitHub account at least
two years old and in good standing, public OSS activity within the preceding 90
days, and contribution to a project under an OSI-approved licence. Anthropic
employees and their households are excluded.

Meeting a threshold does not guarantee selection. Trivial, automated,
duplicative, or manipulated activity may be disregarded.

## 2. Assessment against each route

Figures from `scripts/collect-oss-metrics.mjs`, collected 2026-07-28, published
at [ketqat.com/metrics](https://ketqat.com/metrics). Unknown means the source
could not answer; it is not a measurement of zero.

| # | Route | Required | KetQat | Qualifies |
|---|---|---|---|---|
| 1 | Dependent repositories | 500 | unknown — nothing published, so nothing can depend on it | **No** |
| 2 | Dependent packages | 100 | unknown, same reason | **No** |
| 3 | Monthly downloads | 200,000 | unknown — absent from npm and PyPI | **No** |
| 4 | Foundation committer | listed status | none | **No** |
| 5 | Merged PRs in others' repos | 100 | not measured; the applicant's personal history is not a project metric and this report does not estimate it | **Not assessed** |
| 6 | Unique external contributors | 20 | **1**, most recent contribution 173 days ago | **No** |
| 7 | OpenSSF criticality | 0.4 | not computed | **No** |

Route 6 is the nearest, and it is not near: one external contributor against a
threshold of twenty, with nothing in the last 173 days. Route 3 is
unreachable until first publication, and would then need 200,000 monthly
downloads.

Route 5 is the only one that could plausibly be met by a person rather than by
this project, and it is a fact about an individual's contribution history that
this repository has no standing to assert. It is listed as not assessed rather
than as failed.

**The ecosystem-impact track** is discretionary and requires evidence that the
open-source ecosystem meaningfully depends on the project. Nothing depends on
KetQat today. It does not qualify there either.

## 3. Evidence

| Claim | Source |
|---|---|
| Public SDK repository | https://github.com/ketqat/ketqat-sdk — `7e62ded7` |
| Organization health files | https://github.com/ketqat/.github — `eae454b5` |
| Adoption metrics | https://ketqat.com/metrics |
| Contribution routes | https://ketqat.com/contribute |
| Licence | Apache-2.0, OSI-approved, verified byte-identical to canonical text in CI |
| Recent public activity | continuous; last public push within 24 hours |
| Security policy | https://github.com/ketqat/ketqat-sdk/security/policy |
| Citation metadata | `CITATION.cff`, validated in CI, no DOI claimed |

## 4. What the project does have

None of this substitutes for adoption. It is recorded because it is what a
reviewer would be assessing if the adoption thresholds were met.

- **Real QEC execution.** Stim sampling and PyMatching decoding through the
  official packages. No synthetic fallback: without them a run fails and names
  what to install.
- **Cross-language contract.** Zod schemas generate JSON Schemas consumed by
  both the TypeScript SDK and the Python runner, with byte-parity enforced in
  CI, and a generator that now refuses to emit a schema that would validate
  anything.
- **Uncertainty handled correctly.** A run observing no logical failures is
  reported as an upper bound with its Wilson interval — in the record, in the
  CLI, on the leaderboard, and on the run page. Never as zero.
- **Refusals.** Runs differing in distance, rounds, physical error rate, noise
  model, stopping rule, or decoder version are not ranked together; the refusal
  names the differing fields.
- **Provenance.** Every run carries a reproducibility hash the server
  independently recalculates on import.
- **Supply chain.** All six workflows pin every action to a commit SHA and
  declare explicit permissions, enforced by a test. CodeQL on JavaScript,
  TypeScript, and Python with no open alerts.
- **Honest metrics.** The collector reports unknown as unknown, labels
  estimates, and carries a source URL for every number.

## 5. Open defects a reviewer would find

Listed because a readiness report that omits them is not a readiness report.

| Issue | Severity | Status |
|---|---|---|
| [ketqat-sdk#89](https://github.com/ketqat/ketqat-sdk/issues/89) — the same experiment run twice produces different reproducibility hashes | **P0** | Open. Duration measurements are inside the hashed payload. Fix is breaking; ADR 0006 is Proposed and awaiting a decision. |
| [ketqat-sdk#92](https://github.com/ketqat/ketqat-sdk/issues/92) — `summary_metrics` reports an unqualified `logical_error_rate` of 0 | P2 | Open. Inside the hashed payload, so it needs the same decision. No page displays it. |
| [ketqat-sdk#96](https://github.com/ketqat/ketqat-sdk/issues/96) — zod 4 cannot be adopted until the schema generator supports it | P3 | Open, not urgent; no advisory against zod 3. |

#89 is the significant one. The project's headline property is reproducibility,
and reproducibility does not currently hold. It is disclosed here, in the
outreach templates, and on the issue tracker rather than left to be discovered.

## 6. Blockers, and who owns them

**Not blocked by engineering.** Every route fails on adoption, and adoption is
not something the codebase can produce.

Human actions, in the order they unblock things:

1. **First package publication** to npm and PyPI. Nothing can depend on, download,
   or score a package that does not exist. This gates routes 1, 2, 3, and 7.
2. **Decide ADR 0006** (the #89 hash fix). Breaking, so it needs an owner's
   decision, not a patch.
3. **Enable branch protection** on `ketqat-sdk` — the last OpenSSF Scorecard
   criterion; the command is on ketqat-planning#47.
4. **Mint a Zenodo DOI** and supply real names and ORCIDs for `CITATION.cff`.
5. **Decide whether to open-source the web application.** It is closed today,
   which blocks a whole category of contribution and is stated on `/contribute`.
6. **Outreach.** The templates are in `docs/outreach/`; sending is human-only.

Only after (1) and (6) have run for some months does any threshold become
reachable. This report should be regenerated then, with the criteria
re-verified again.

## 7. Application draft

**Do not send this yet.** KetQat does not meet any threshold, and submitting an
application that fails on every route wastes a reviewer's time and spends
credibility the project will want later.

Kept here so it is ready when the numbers support it, and so the claims it makes
can be checked against this report.

> KetQat is an Apache-2.0, vendor-neutral registry for quantum error-correction
> and quantum-algorithm benchmarks. It runs surface-code memory experiments with
> real Stim sampling and PyMatching decoding, records a reproducibility hash the
> server independently recalculates, and refuses to compare runs whose
> experimental conditions differ.
>
> The design principle is that the registry should refuse rather than guess. A
> run that observed no logical failures is reported as an upper bound with its
> confidence interval, never as an error rate of zero. A benchmark import that
> would require a metric the operation cannot measure is declined rather than
> filled in. There is no automatic fallback from a real decoder to a simpler
> simulation.
>
> Adoption metrics are published at ketqat.com/metrics, generated by a script in
> the repository, reporting unmeasured values as unknown rather than zero.
>
> [Qualifying route and evidence — to be completed when a threshold is actually
> met. Do not submit before then.]

## 8. How to update this report

1. Re-fetch the criteria from the terms page. **Do not carry them forward
   unverified**; they can change, and a report asserting stale thresholds is
   worse than none.
2. Regenerate metrics: `node scripts/collect-oss-metrics.mjs --json`.
3. Refresh the committed snapshot the metrics page reads, in `ketqat-web`.
4. Update section 2 route by route, and section 5 from the issue tracker.
5. Change the Verified date, and say plainly if the answer is still no.
