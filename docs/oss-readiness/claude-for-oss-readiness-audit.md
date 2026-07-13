# Claude for OSS readiness audit

Verified: 2026-07-13 (Asia/Tokyo)

This audit records KetQat's current, evidence-backed OSS baseline. It is not a claim that KetQat qualifies for, has applied to, or has been accepted into the Claude for Open Source program. Unknown values remain unknown; they are not converted to zero.

Tracking:

- [Program parent issue](https://github.com/ketqat/ketqat-planning/issues/40)
- [Phase 0 planning issue](https://github.com/ketqat/ketqat-planning/issues/41)
- [Public implementation issue](https://github.com/ketqat/ketqat-sdk/issues/24)

## Executive assessment

KetQat has a credible technical nucleus: public TypeScript contracts and JSON Schemas, a Python runner, real Stim/PyMatching QEC execution, deterministic cross-language hashing, comparison guards, verification-evidence contracts, examples, tests, and an operational Web application. Its scientific-integrity rules correctly distinguish demo records, simulations, hash checks, review evidence, and independent reproduction.

KetQat is not yet a mature public OSS project. The Web and Planning repositories are private, neither package is present in its public registry, there are no tags or GitHub Releases, the clone-free quickstart cannot work, contributor and governance material is incomplete, and the public SDK lacks required branch checks/reviews and common OpenSSF workflows. The available evidence does not show that KetQat currently meets a Claude for Open Source maintainer-track threshold.

## Official program baseline

The official [Claude for Open Source application page](https://claude.com/contact-sales/claude-for-oss) and [terms](https://www.anthropic.com/claude-for-oss-terms) were checked on 2026-07-13. A maintainer-track applicant must meet at least one of these routes:

- 500 dependent repositories;
- 100 dependent packages;
- 200,000 combined monthly downloads across public registries;
- listed committer or maintainer status in a recognized foundation or language project;
- 100 merged pull requests authored in public repositories the applicant does not own during the preceding 12 months;
- 20 unique external contributors with merged pull requests in a maintained repository during the preceding 12 months; or
- an OpenSSF criticality score of at least 0.4 for a maintained repository.

The ecosystem-impact track is discretionary and requires evidence that the open-source ecosystem meaningfully depends on the project. General requirements include a natural-person applicant, an eligible age and location, a GitHub account at least two years old, public OSS activity in the preceding 90 days, and contribution to a project under an OSI-approved license. Meeting a numeric threshold does not guarantee selection, and trivial, automated, duplicative, or manipulated activity may be disregarded.

The observed organization administrator and primary public contributor, [`dorakingx`](https://github.com/dorakingx), has a GitHub account created on 2022-12-14 and public activity in the last 90 days. This does not verify the final applicant's age, residency, sanctions status, employment relationship, or other personal eligibility requirements; those remain human checks.

## Repository inventory and boundaries

| Repository | Visibility | Default-branch snapshot | Responsibility | Readiness note |
| --- | --- | --- | --- | --- |
| [`ketqat/ketqat-sdk`](https://github.com/ketqat/ketqat-sdk) | Public | `602d585a63b0352cd1a3b54e377035246962b486` | Scientific contracts, schemas, hashing, compatibility, typed client, examples, fixtures, and local runner | The only public implementation repository; suitable as the current public evidence home. |
| `ketqat/ketqat-web` | Private | `e6112c0c66b4e5b6c00d062463d1f99f62e53eda` | Next.js UI/API, PostgreSQL/Prisma, authorization, imports, bundles, and deployment | External users cannot inspect, report against, or contribute to the Web implementation. |
| `ketqat/ketqat-planning` | Private | `b8991ae82e548d3654a8c9510a2a12b6915906cc` | Vision, scope, roadmap, ADRs, RFCs, governance, and cross-repository coordination | Public documentation links point to material that external contributors cannot read. |
| [`ketqat/.github`](https://github.com/ketqat/.github) | Public | `c36a4527fdf0f7dff50bf46b75a023ef1b9acd2b` | Organization profile and default community health files | Provides a basic public profile, issue forms, PR template, security policy, support, and governance. |

The documented responsibility split is coherent. The Web package consumes an immutable SDK source archive rather than a vendored `lib/ketqat-sdk` copy. Current trees did not show a second SDK implementation. Planning snapshots are stale relative to the commits above and need routine refresh without treating planning prose as canonical implementation evidence.

Changing a repository from private to public is not a documentation-only operation. A maintainer must first review history, secrets, licenses, deployment details, incident data, and third-party material. Until that review is complete, private visibility remains a direct blocker for external Web and planning contributions.

## Completed capabilities

### TypeScript SDK

- Package metadata identifies `ketqat-sdk` version `0.2.0`, Apache-2.0 licensing, source, issue tracker, keywords, ESM exports, types, subpath exports, side-effect behavior, and included files.
- Public exports include artifact, benchmark-result, benchmark-suite, experiment-manifest, reproducibility-bundle, and verification-evidence schemas plus hashing, compatibility, demo, and client modules.
- `npm test` rebuilds TypeScript, regenerates committed JSON Schemas, and runs SDK regression tests.
- `npm pack --dry-run` succeeds locally.

### Python runner

- Distribution metadata identifies `ketqat` version `0.2.0`, Python 3.10+, Apache-2.0 licensing, project URLs, CLI entry point, and `qec`, `algorithms`, and `all` extras.
- Real QEC execution uses NumPy, Stim, and PyMatching. Missing QEC dependencies fail non-zero; no normal-execution synthetic fallback exists.
- Algorithm and QEC example manifests are committed.
- Python tests cover schemas, runner behavior, missing dependencies, deterministic seeds, real QEC smoke execution, and TypeScript/Python hash parity fixtures.

### Web and reproducibility behavior

- Web read paths use Prisma/PostgreSQL and mutations use session, per-user token, or legacy automation-token actor resolution.
- Imported runs are schema-validated, server-rehashed, immutable, visibility-filtered, and exported in validated reproducibility bundles.
- Demo data is marked `is_demo: true`; production CI must not turn demo records into scientific performance evidence.
- Compatibility checks reject cross-domain or coordinate-disjoint comparisons.
- Verification evidence is outside benchmark-result hash inputs, and hash verification alone is not treated as reproduction.

### Existing collaboration assets

- The SDK has README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, two issue forms, CI, and initial release instructions.
- The organization `.github` repository supplies default bug, documentation, feature, and research issue forms; a PR template; and basic CODE_OF_CONDUCT, CONTRIBUTING, GOVERNANCE, SECURITY, and SUPPORT files.
- Common area, type, priority, blocked, decision, research, good-first-issue, and help-wanted labels exist in the three working repositories.

## Package and release audit

| Check | Verified result |
| --- | --- |
| PyPI `ketqat` project | `404 Not Found` from `https://pypi.org/pypi/ketqat/json` |
| npm `ketqat-sdk` project | `404 Not Found` from `https://registry.npmjs.org/ketqat-sdk` |
| npm last-month downloads | Unavailable because the package endpoint returns 404 |
| PyPI downloads | Unavailable because the project does not exist |
| Git tags | None found in the four local repository clones |
| GitHub Releases | None found in the four organization repositories |
| TypeScript package version | `0.2.0` |
| Python package version | `0.2.0` |
| npm dry-run pack | Succeeds, but includes cache/bytecode files under `python/` |
| Python wheel/sdist build | Configuration exists; clean artifact and install verification are not in CI |

Closed [SDK issue #19](https://github.com/ketqat/ketqat-sdk/issues/19) and merged [PR #20](https://github.com/ketqat/ketqat-sdk/pull/20) prepared package metadata and a tag-triggered publishing workflow. The workflow is not sufficient evidence of publication. It uses a long-lived npm token, PyPI OIDC, version/tag checks, and package-specific tests, but it does not create a GitHub Release, prove clean installation, check both package versions before either publish job begins, prevent an avoidable partial release, generate attestations/SBOMs, or verify registry readback. Release actions are version-tag pinned rather than commit-SHA pinned.

The npm package's broad `"files": ["python"]` entry currently includes local `.pytest_cache` and `__pycache__/*.pyc` files in the dry-run tarball. These generated files are not required by users and must be excluded before publication.

## Developer-experience audit

The current first-run path is clone-based and labeled as a ten-minute quickstart. The README simultaneously says registry releases are being prepared and shows future `pip install`/`npm install` commands, which can mislead users because both registry names currently return 404.

Current verified developer commands include:

```bash
npm ci
npm test
python3.11 -m pip install -e "python[qec]" pytest
python3.11 -m pytest python/tests
ketqat run examples/qec/surface-code-memory.yaml --output /tmp/ketqat-qec-run.json
ketqat run examples/algorithms/grover-search.yaml --output /tmp/ketqat-algorithm-run.json
```

Gaps:

- CI covers only Ubuntu, Node 20, and Python 3.11; package metadata promises Python 3.10+.
- `package.json` has no Node `engines` declaration or stated minimum/LTS policy.
- Python CI installs the repository editably, not from a built wheel or sdist.
- No clean temporary npm project imports all documented exports.
- No clone-free three-minute quickstart can pass before the packages are published.
- The CLI provides `run`; example generation, validation, inspection, verification, authentication, and publish ergonomics are not implemented.
- Publishing still requires a token plus handwritten `curl`, and the SDK's open [issue #17](https://github.com/ketqat/ketqat-sdk/issues/17) / [PR #18](https://github.com/ketqat/ketqat-sdk/pull/18) only addresses typed private-import options.
- Web setup needs Node, PostgreSQL, Prisma migrations, and auth configuration; there is no public contributor setup path while its repository remains private.
- Troubleshooting, architecture, security model, glossary, benchmark/decoder contribution, and scientific-limit documentation are split or incomplete.

## Community and governance audit

Present:

- Apache-2.0 license text in the SDK, Planning, and organization-health repositories;
- basic README, contribution, conduct, support, security, governance, issue-form, and PR-template material;
- GitHub-native issues, ADRs, RFCs, and repository ownership rules;
- an explicit automation-review policy in private Planning documents.

Missing or incomplete:

- public ROADMAP, MAINTAINERS, AUTHORS, CITATION.cff, CHANGELOG, and release history;
- a public decision-making, release-authority, scientific-review, security-response, inactive-maintainer, contributor-progression, deprecation, and schema-evolution policy;
- CODEOWNERS;
- a 15-minute setup and repository-routing guide available to all external contributors;
- benchmark, decoder, reproduction, scientific-validity concern, performance, accessibility, and integration issue forms;
- difficulty/effort/needs-design label taxonomy and a maintained set of substantive beginner issues;
- GitHub Discussions (disabled in all audited repositories);
- an explicit support-response expectation;
- public Web and Planning issue trackers.

The project must not create low-value issues or PRs merely to raise contributor counts. Beginner issues need bounded, useful work and scientific/security review notes.

## Security audit

Completed controls:

- Default GitHub Actions workflow permissions are read-only, and workflows cannot approve pull requests.
- Secret scanning and push protection are enabled on the public SDK and `.github` repositories.
- SDK behavior does not store QPU credentials or execute uploaded arbitrary code.
- Web mutations and visibility rules are tested; production migrations gate deployment; content-aware production smoke tests exist.
- A Web dependency-watch workflow tracks the known Next/PostCSS advisory without applying an unsafe downgrade.

Gaps:

- Public SDK branch protection has no required status checks and no required pull-request review.
- Private Web and Planning repositories report that branch protection requires a plan upgrade or public visibility.
- GitHub Actions use mutable major-version tags such as `actions/checkout@v4` rather than commit SHAs.
- No CodeQL, dependency-review, Scorecard, SBOM, artifact attestation, or package-audit workflow was found.
- No Dependabot configuration file was found, despite SDK security updates being enabled at repository level.
- The SDK release workflow relies on a long-lived npm token and has no protected GitHub Environment in the repository definition.
- The organization security policy does not state supported versions, a concrete private reporting channel, disclosure expectations, response targets, or a research-integrity concern path.
- GitHub license detection reports `NOASSERTION` for repositories containing Apache-2.0 text; package metadata says Apache-2.0. Detection and attribution should be corrected or explained before relying on automated compliance evidence.

## Scientific-integrity audit

Strong controls already exist around deterministic hashing, cross-language fixtures, schema validation, demo labeling, real dependency use, comparison compatibility, immutable runs, and separation of verification evidence from result hashes.

Remaining work:

- publish benchmark methodology and data-provenance policies;
- define versioned verification levels without treating `HASH_VERIFIED` as `REPRODUCED`;
- add public contribution templates that record citation, license, immutable source, environment, seed, expected-output meaning, and demo/measured/QPU status;
- validate contribution packs without automatically executing untrusted contributor code;
- add schema/hash compatibility checks to release gating and clean-package smoke tests;
- document that local QEC and algorithm runs are simulations unless a result explicitly contains reviewed hardware evidence.

## Measurable baseline

| Metric | Value | Interpretation |
| --- | ---: | --- |
| Public implementation repositories | 1 | `ketqat-sdk`; `.github` is public but is organization metadata rather than product implementation. |
| SDK stars | 1 | Context only; stars are not a current program threshold. |
| SDK forks | 2 | Context only; a fork is not adoption evidence by itself. |
| Unique external contributors with merged SDK PRs, trailing 12 months | 1 | `raunavm`; bots and the repository owner are excluded. |
| External merged SDK PRs, trailing 12 months | 3 | PRs #1, #2, and #3; quantity is not treated as current scientific adoption. |
| Active public human contributors, trailing 90 days | 1 | `dorakingx`; contributor endpoint and recent public commits were checked. |
| Published PyPI releases | 0 | Registry project does not exist. |
| Published npm releases | 0 | Registry package does not exist. |
| PyPI downloads, trailing 30 days | unknown | No PyPI project exists. |
| npm downloads, trailing 30 days | unknown | No npm package exists. |
| Dependent repositories/packages | unknown | No authoritative value was available in the audited API responses. |
| OpenSSF criticality score | unknown | No verified score was found; do not substitute a Scorecard score. |
| Public non-demo benchmark runs | unknown | No audited public metrics endpoint/report exists. |
| Independent reproduction reports | unknown | No structured public reporting system exists. |
| External organizations represented | unknown | No evidence-backed organization mapping exists. |

## Claude for OSS qualification status

| Route | Current status |
| --- | --- |
| 500 dependent repositories / 100 dependent packages | Not demonstrated; authoritative counts are unknown. |
| 200,000 monthly registry downloads | Not met through KetQat packages because neither registry package exists. |
| Recognized foundation/language project maintainer | Not demonstrated by KetQat repository evidence. |
| 100 merged PRs into public repositories not owned by applicant | Applicant-specific and not established by this project audit. |
| 20 unique external merged contributors in 12 months | Not met; verified KetQat SDK count is 1. |
| OpenSSF criticality score >= 0.4 | Not demonstrated; score is unknown. |
| Ecosystem-impact track | Not demonstrated; there is no audited downstream/adoption evidence yet. |

Conclusion: KetQat does not currently have evidence of satisfying a maintainer-track threshold. The correct near-term goal is genuine public utility, safe distribution, contributor accessibility, and accurate evidence collection—not metric optimization.

## Blocking issues

1. Web and Planning are private, preventing normal external inspection and contribution.
2. Python and TypeScript packages are not published, so the promised install path and clone-free quickstart fail.
3. Release workflows lack clean-install, provenance, attestation, GitHub Release, and partial-release protection.
4. Required branch checks/reviews and several baseline security workflows are absent.
5. Public contribution, governance, citation, and research metadata are incomplete.
6. There is no auditable metrics system for dependents, downloads, non-demo use, or independent reproduction.
7. Current planning snapshots contain stale commit/state claims.

## Priorities and dependencies

### P0

1. Harden both package artifacts and clean-install tests; exclude generated cache/bytecode files.
2. Finish release automation and human registry setup, then publish an intentionally versioned first release.
3. Replace the clone-based first run with a CI-tested three-minute package quickstart.
4. Expand contributor documentation and the security policy.
5. Protect schema/hash parity in the release matrix.
6. Decide whether and how to make Planning and Web public after history/security/license review.

### P1

1. Add complete issue/PR templates, labels, and substantive beginner work.
2. Implement safe benchmark/decoder/reproduction contribution packs.
3. Add citation/provenance metadata, auditable metrics, and public contribution routes.
4. Add CodeQL, dependency review, Scorecard, SBOM, provenance, and attestations.

### P2

1. Complete governance and maintainer progression.
2. Publish honest community outreach material.
3. Add advanced E2E, accessibility, and integration coverage.
4. Produce the application-ready evidence report only after re-verifying official requirements.

Package publication depends on registry ownership and trusted-publisher setup. The clone-free quickstart depends on publication. Download and dependent metrics depend on real releases and downstream use. External-contributor growth depends on public repositories, usable setup, valuable issues, and responsive review. Application readiness depends on genuine evidence rather than repository cosmetics.

## Human-only actions

- Confirm the natural-person applicant and personal eligibility requirements.
- Review full Git history, secrets, licenses, incident details, and deployment material before changing repository visibility.
- Verify PyPI and npm identities, package ownership, trusted publishing, and protected release environments.
- Configure organization/repository rulesets, required reviews/checks, private vulnerability reporting, and any paid security features that cannot be applied by repository code.
- Connect GitHub Releases to Zenodo; never invent a DOI.
- Make legal judgments about copyright, trademarks, licenses, privacy, and terms.
- Contact real researchers/maintainers, post announcements, and submit the final application.

Each human-action issue should explain why a human is required, prerequisites, exact UI values and steps, verification, rollback, security cautions, and workflows to rerun.

## Risks

- Publishing both packages from independent jobs can produce a partial release if one publish succeeds and the other fails.
- A private-to-public visibility change can disclose history that has not been reviewed.
- Generated package caches can leak irrelevant local artifacts and reduce supply-chain confidence.
- Broad release permissions or mutable actions can weaken provenance.
- Incomplete compatibility review can break stored schemas or cross-language hashes.
- Contributor-count pressure can incentivize low-value work; this is explicitly prohibited.
- Demo or local simulation results can be mistaken for independent or QPU evidence without durable labels and methodology.
- Program terms may change; every application report needs a new verification date.

## Acceptance criteria for Phase 0

- [x] Organization repositories, visibility, responsibilities, packages, releases, issues, PRs, workflows, labels, and principal settings were read-only audited.
- [x] Official program criteria were re-verified against primary Anthropic sources.
- [x] A parent issue and Phase 0-12 tracking issues exist.
- [x] A public implementation issue exists for this audit.
- [x] Unknown metrics remain unknown and demo/scientific states are distinguished.
- [ ] This public audit is reviewed and merged.
- [ ] Owning-repository issues are created for the first package, quickstart, release, security, and contributor-documentation slices.
- [ ] Stale Planning snapshots are refreshed after the audit is accepted.

## Evidence commands

The audit used read-only forms of these commands and endpoints:

```bash
gh repo view ketqat/ketqat-sdk --json visibility,defaultBranchRef,licenseInfo
gh issue list -R ketqat/ketqat-sdk --state all --limit 100
gh pr list -R ketqat/ketqat-sdk --state all --limit 100
gh api repos/ketqat/ketqat-sdk/branches/main/protection
gh api repos/ketqat/ketqat-sdk/actions/permissions/workflow
gh api repos/ketqat/ketqat-sdk/contributors
gh release list -R ketqat/ketqat-sdk
curl -i https://pypi.org/pypi/ketqat/json
curl -i https://registry.npmjs.org/ketqat-sdk
npm pack --dry-run --json
```

Primary public evidence:

- [Claude for Open Source application](https://claude.com/contact-sales/claude-for-oss)
- [Claude for Open Source terms](https://www.anthropic.com/claude-for-oss-terms)
- [KetQat SDK](https://github.com/ketqat/ketqat-sdk)
- [SDK actions](https://github.com/ketqat/ketqat-sdk/actions)
- [SDK issues](https://github.com/ketqat/ketqat-sdk/issues)
- [SDK pull requests](https://github.com/ketqat/ketqat-sdk/pulls)
- [KetQat organization profile](https://github.com/ketqat)
