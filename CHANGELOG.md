# Changelog

Notable changes to `ketqat-sdk` (npm) and `ketqat` (PyPI), which are versioned together.

The two packages share a version because they share a contract: the reproducibility hash,
the canonical serialization and the schemas must agree byte for byte across the two
languages. A release where they disagreed would be a release where the same run produced
two different hashes, so there is no version in which one is ahead of the other.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with one addition specific to
this project: **any change to hashed payloads, the exclusion set, the canonical form or
number formatting is breaking**, whatever it looks like in the diff. It changes every
future hash and silently breaks comparison with every stored run.

## Unreleased — will be 0.3.0

Nothing has been published. `ketqat-sdk` on npm and `ketqat` on PyPI both return 404, and
first publication is gated by [`docs/first-release-checklist.md`](docs/first-release-checklist.md),
which is a human decision.

The version files say 0.3.0 because that is the version this release *will* carry; the heading
still says Unreleased because it has not been released. Both statements are true at once, and
collapsing them into a dated heading would be the untrue one.

**Why 0.3.0 and not 1.0.0** is recorded in [`docs/release/versioning.md`](docs/release/versioning.md).
Briefly: 1.0.0 promises API stability, and a contract with one internal consumer and no external
feedback has no evidence it can keep that promise. Two of the entries below are corrections to
scientific output, which is exactly the class of change that keeps appearing early in a contract's
life.

### Added

- **The `study` contract family and the Evidence Graph**
  ([#259](https://github.com/ketqat/ketqat-sdk/issues/259)). A new `ketqat-sdk/study`
  export: `Study` and its append-only `StudyEvent` trail, `ProblemSpecification` and
  `StudyPlan` as immutable revisions, `StudyTask`, `EvidenceNode`, `EvidenceEdge`,
  `ExecutionCapsule` and `ResearchPackage`, with nine generated JSON Schemas.

  Additive throughout. No existing contract gains a field, no exclusion set is edited, and
  `fixtures/reproducibility/expected-hashes.json` is byte-identical — the family's own pins
  live in a separate `study-expected-hashes.json` sidecar.

  Four properties are structural rather than documented:

  - **A number in a report is a node in a graph.** A `ResearchPackage` reads every result
    row's value out of an `EvidenceNode` it carries, so a figure with nothing behind it is
    unrepresentable rather than discouraged. Export **refuses** — a claim with no evidence
    node, a row naming a node the package does not contain, or an edge with a dangling
    endpoint fails the build with a named code instead of a warning.
  - **A confirmation names one plan revision by its hash.** `StudyPlan` revisions are
    immutable and content-addressed, so editing a plan moves its hash and the old
    confirmation stops applying by construction. `verifyPlanConfirmation` recomputes:
    a plan edited by hand and re-stamped with its previous hash is refused.
  - **History is hash-chained.** Each `StudyEvent` names its predecessor's hash and its own
    sequence number, so a rewritten middle event is detectable offline by
    `verifyStudyEventChain` rather than only by database discipline.
  - **The family names its own hash rules, and nothing is inferred.** Study records carry
    `hash_rules_id: "study-v1"` and are refused without it. This is a *different field* from
    `reproducibility_hash_version` on purpose: the legacy marker reads as version 1 for any
    non-integer value, so a rules id written there would have verified silently under the
    wrong rules — a wrong answer where a refusal belongs.

  What is verified in Python is validation, hashing and structural resolution of the claim
  map and graph. It does not recompute the science, and `verify_research_package` reports
  that in its result rather than only in prose.

- **Quantum Resource Intelligence: contracts, threshold engine, decision assessment and
  reproducible bundles** ([#236](https://github.com/ketqat/ketqat-sdk/issues/236)).
  A new `ketqat-sdk/intelligence` export, additive throughout: no existing schema, hash,
  or contract semantic changes.

  The engine already computed code distances, footprints and distillation costs. What was
  missing was everything that turns those into something a decision can rest on. This adds
  it: `QuantumWorkload`, `ClassicalBaseline`, `ResourceScenario`, `HardwareModelSnapshot`,
  `QecModelSnapshot`, `EconomicModel`, `ResourceEstimateSnapshot`, `AdvantageThreshold`,
  `DecisionAssessment` and `ResourceIntelligenceBundle`, with ten generated JSON Schemas.

  Four properties are structural rather than documented:

  - **Every decision-bearing number wears an envelope.** A bare `number` is not
    representable. Each carries its unit, evidence class, bound kind, source, model and
    version, assumptions, sensitivity and limitations. A quantity with no value is forced
    to declare `UNKNOWN`; a quantity declaring `UNKNOWN` cannot carry a number.
  - **Economic conclusions are gated on evidence.** `POTENTIALLY_ECONOMIC` and
    `ECONOMICALLY_COMPETITIVE_UNDER_ASSUMPTIONS` are unreachable unless a classical
    baseline *and* a quantum cost model are both present. With neither, the assessment
    says `Insufficient evidence for economic comparison` and names the missing input. No
    price for quantum machine time is invented anywhere in the module.
  - **Three footprints stay apart.** The algorithm's own patches, the routing space a
    lattice-surgery layout needs, and the magic-state factory are computed and reported
    separately. If distillation cannot reach its target error the factory is not sized, so
    the *total* is `UNKNOWN` rather than the algorithm figure under a label implying the
    whole.
  - **Thresholds are conditions, not dates.** "A surface-code cycle below 250 ns would be
    required to beat the supplied classical runtime" is checkable and stays true whatever
    any vendor ships. No calendar-year projection is produced.

  Runtime is costed twice -- once limited by logical cycles, once by magic-state
  throughput -- because which one binds is the actionable output, and reporting only the
  first attributes a factory bottleneck to the wrong subsystem.

- **`ketqat-engine intelligence` commands**: `validate`, `estimate`, `compare`, `report`
  and `verify`. `verify` recomputes the estimates, thresholds *and* decision assessments
  from the bundle's own inputs, not merely its hash: a bundle whose conclusions were edited
  by hand and then re-hashed passes a hash check and fails this one, with a non-zero exit.

  Assessment documents are read as JSON or as a **declared subset of YAML**, parsed in
  repository so the runtime dependency set stays `zod` alone. Anchors, aliases, tags, flow
  collections and multi-document files are refused by name rather than mis-parsed.

- **Three read-only MCP tools**: `estimate_resource_intelligence`,
  `compare_resource_scenarios`, `verify_resource_intelligence_bundle`. They are in
  `src/mcp/index.ts` because they genuinely change nothing -- no remote write, no queued
  job, no purchased device time.

- **Cross-language hash parity for bundles.** `fixtures/reproducibility/resource-intelligence-bundle.json`
  is hashed by both implementations in CI. The bundle reuses the existing version 2
  exclusion set rather than extending it, which is why every timestamp in the module is
  called `created_at` -- a key the canonicalizer has dropped at every level since version 1.
  Extending the exclusion set would have been a new hash version, and a new hash version
  invalidates comparison with every record already stored.

### Changed

- The npm package size policy moved again, from 2.5 MB to 2.8 MB, for the study family
  above. The measured cost was ~287 KB against a 2.40 MB baseline, with the nine schemas
  already emitted as in-document `$ref`s and each large record given a hand-written
  interface so its declarations stay flat. The reason is recorded next to the constant in
  `scripts/verify-package-contents.mjs`; the limit is a guard against accidental bloat, and
  it moves with a measurement rather than silently.
- The npm package size policy moved from 2 MB to 2.5 MB, with the reason recorded in
  `scripts/verify-package-contents.mjs`. The measured cost of #236 was ~510 KB against a
  1.68 MB baseline, after two reductions made while adding it: naming the `Quantity` type
  so declarations reference it instead of expanding it structurally (413 KB of
  `bundle.d.ts` became 6 KB), and emitting the new schemas with in-document `$ref`s
  instead of full inlining (216 KB became 61 KB). The same treatment applied to
  `dist/contracts` and `dist/engine`, plus the ~490 KB of source maps that point at files
  the package does not ship, is [#237](https://github.com/ketqat/ketqat-sdk/issues/237).


- **Release artifacts are built and checked without being published.**
  `npm run build:release` produces the npm tarball, the Python wheel and sdist, CycloneDX
  SBOMs for both, `SHA256SUMS`, provenance and reproducibility evidence in `dist-release/`.
  Every artifact is built **twice** into separate directories and the digests compared, so
  reproducibility is measured rather than asserted. `npm run verify:release` gates on the
  contents of those files rather than on a manifest describing them.
- **`CITATION.cff` now ships inside every artifact.** It was in the repository and in none
  of the three artifacts, so an installed copy could not be cited — and `pip install` never
  sees the repository. `python/CITATION.cff` is a byte-identical copy of the canonical file,
  and `npm run verify:citation` fails when the two differ. A symlink was tried first and
  does not work: sdists and wheels store a symlink as a symlink, and the packaged file
  resolved to nothing.
- **A clean-room workflow** installs only the built artifacts into fresh environments and
  runs an algorithm and a three-decoder QEC comparison there, with the checkout nowhere on
  the path.

### Fixed

- **The TypeScript CLI accepts `KETQAT_API_TOKEN`** ([#218](https://github.com/ketqat/ketqat-sdk/issues/218)).
  It read `KETQAT_TOKEN` while the Settings page that mints the token, this README, the
  quickstart and the Python CLI all said `KETQAT_API_TOKEN`, so following the documentation
  produced "No API token" with the token already exported. Both names now resolve in both
  languages; two different values are refused rather than resolved, because a job and its
  results are owned and choosing one files an immutable record under an identity the user
  did not pick.

### Security

- **Branch protection on `main`** now requires a pull request, requires all 14 CI contexts,
  enforces linear history, applies to administrators, and forbids force pushes and
  deletions. Required signed commits were enabled, measured to block every merge this
  project can make, and switched off again — the record of that is in
  [ketqat-planning#47](https://github.com/ketqat/ketqat-planning/issues/47).
- CodeQL, Scorecard and dependency review actions pinned to the CodeQL v4 line
  ([#116](https://github.com/ketqat/ketqat-sdk/pull/116)).

## 0.2.0 — unreleased

The version both packages currently declare. It has never been published, so there is no
release entry for it; the work it contains is recorded in the issues and pull requests of
this repository and in `ketqat-planning`.
