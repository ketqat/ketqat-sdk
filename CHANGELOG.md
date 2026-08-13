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

## Unreleased

Nothing has been published. `ketqat-sdk` on npm and `ketqat` on PyPI both return 404, and
first publication is gated by [`docs/first-release-checklist.md`](docs/first-release-checklist.md),
which is a human decision.

### Added

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
