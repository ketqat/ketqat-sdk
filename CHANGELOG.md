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

  Eight properties are structural rather than documented:

  - **A number in a report is a node in a graph.** A `ResearchPackage` reads every result
    row's value out of an `EvidenceNode` it carries, and that node has to carry a value: a row
    naming a claim or a reference has no number to read out. A claim's cited evidence has to be
    joined to it by a `supports` or `contradicts` edge the package carries — the edge is where
    the relation is asserted, with its rationale and its asserter — so a claim citing itself,
    or citing a node no edge connects to it, fails with a named code instead of a warning, at
    build and again at verification. What is *not* checked is whether the evidence supports the
    conclusion: the edges are the study's own assertions, checked for being present, joined up
    and attributed, never for being right.
  - **A confirmation names one plan revision by its hash.** `StudyPlan` revisions are
    immutable and content-addressed, so editing a plan moves its hash and the old
    confirmation stops applying by construction. `verifyPlanConfirmation` recomputes:
    a plan edited by hand and re-stamped with its previous hash is refused.
  - **History is hash-chained, and the chain is honest about its limit.** Each `StudyEvent`
    names its predecessor's hash and its own sequence number, so reordering, splicing, replay
    and a rewritten middle event are all detectable offline by `verifyStudyEventChain` rather
    than only by database discipline. Truncation is not: a trail cut short is a shorter valid
    chain, and `Study.status` and the `latest_*` pointers are excluded from the study's hash
    by design, so no record anchors the head. `verifyStudyEventChain` therefore takes an
    optional expected head hash from the caller, which is what makes a dropped suffix — or an
    event fabricated onto one — detectable offline.
  - **The family names its own hash rules, and nothing is inferred.** Study records carry
    `hash_rules_id: "study-v1"` and are refused without it. This is a *different field* from
    `reproducibility_hash_version` on purpose: the legacy marker reads as version 1 for any
    non-integer value, so a rules id written there would have verified silently under the
    wrong rules — a wrong answer where a refusal belongs. The registry of known rule sets is a
    `Map`, not an object literal, so `hash_rules_id: "toString"` is an unknown id rather than
    `Function.prototype.toString` arriving where an exclusion set was expected.
  - **A record's hash is over the record as it appears in the file.** Builders write exactly
    what they hashed; `verifyExecutionCapsule` and `verifyResearchPackage` hash exactly what
    they read, normalising nothing. Schema validation stays a separate, reported step, because
    a validator that filled in a container before hashing would answer about a record the file
    does not contain — and disagree with the Python verifier, which reads the same bytes and
    fills in nothing. **No study schema carries a `.default()`**: `StudyCitationSchema`
    requires the author list the shared `CitationSchema` defaults, which was the last one left
    and the last way the build path and the verify path could address two different records for
    one file. A producer with nothing to record writes `[]`.
  - **No key in a study record is data.** A study record's environment is
    `StudyEnvironment`, not the shared `Environment`: the same four scalars, and then
    `packages: { name, version }[]` and `hardware: { name, value }[]` where the shared
    contract has two free-form maps. A map's keys arrive at run time and are declared by
    nobody, so a digest built from declared fields would have to read the map wholesale —
    reopening the question of what a key called `__proto__` means — or refuse it entirely. A
    list of `{name, value}` pairs is neither: every key in it is a field name the schema
    declares, and every dependency name is a value, which is where data belongs. Both lists
    are required and neither is defaulted. The shared `Environment` in
    `ketqat-sdk/contracts` is unchanged, and so is every hash computed under it.
  - **An undeclared key is refused, not stripped.** Every object in the family is
    `.strict()`. Zod's default is to strip, while the generated JSON Schemas have always
    emitted `additionalProperties: false`, so the two validators gave two answers for one
    file: a package carrying an undeclared root key parsed in TypeScript and was refused in
    Python. Stripping is the worse half of that, because these verifiers hash the record as
    written — a key the parser discards is a key the digest still sees. The row metadata a
    store wraps around a record (`id`, `slug`, `owner_username`, `visibility`, `updated_at`
    and the rest) is therefore not part of a study record, as the schemas already said.
    That now includes the objects the family embeds and does not own: `src/study/common.ts`
    derives `StudyQuantitySchema`, `StudyUncertaintySchema` and `StudyCitationSchema` from the
    shared ones, so a `smuggled_note` inside an `expected_credits` envelope can no longer be
    stripped by the parse and hashed by the digest. `src/intelligence` and `src/contracts` are
    unchanged, and no schema outside the study family changes.
  - **The digest is a typed projection, serialized with RFC 8785 (JCS).** `study-v1` does not
    decide what to leave out by looking at a key's name. Each record kind declares every field
    it has as `SEMANTIC`, `RECORD_ONLY`, `RECEIPT_ONLY` or `DERIVED`, and the digest is built
    from those declarations: a key nobody declared is never read, and is refused rather than
    skipped, at any nesting depth. Free maps, `__proto__` and "is this object an embedded
    record?" stop being special cases because they stop being questions. The known cost of an
    allowlist — a new semantic field silently staying out of the digest — is held shut by
    `tests/study-field-completeness.test.mjs`, which walks each Zod schema and fails on any
    field the tables do not classify, in either direction.

    Serialization is RFC 8785, implemented against the RFC in both languages and pinned to
    the RFC's own test vectors, so cross-language byte agreement is conformance to a
    published spec rather than a coincidence maintained by hand.

  - **Four digests, four questions.** `semanticHash` ("is this the same scientific
    content?"), `recordHash` ("was this file edited after it was written?"), `receiptHash`
    ("did this server observe this action, in this order?") and `artifactHash` ("are these
    the bytes that were produced?"). Each is taken over a NUL-separated preimage header —
    organisation, record kind, hash purpose, schema version, hash rules id — so two record
    kinds that project to the same body never share a namespace. A matching hash is never
    described as "authentic", "signed" or "scientifically correct"; `attestation_level` stays
    `hash_only`.

  - **Numbers carry a contract per field, not a bound per number.** A measurement is a
    `finite_float`; a count that cannot reach 2^53 is a `safe_integer`; a 64-bit seed, a
    shot count, a byte count and an external 64-bit identifier are `exact_integer_string` —
    validated decimal digits, so both languages hash what was written rather than two
    roundings of it. Above 2^53 a JSON number is a double in JavaScript and an
    arbitrary-precision integer in Python, and near 4.2e21 one double stands for 524287
    distinct integers; recording the digits is what makes those two values two records.
    `ExecutionCapsule.seed` and `resource_limits.max_memory_bytes` are strings for this
    reason. A non-finite number and a lone surrogate are refused outright, as RFC 8785
    requires, and `readStudyFileBytes` refuses an integer *literal* outside ±2^53 at the byte
    level, before a parse throws that information away.

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
