# ketqat-sdk

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

KetQat SDK is the shared research contract layer for KetQat: an open-source research infrastructure for reproducible quantum error-correction and quantum-algorithm experiments.

Version `0.2.0` intentionally removes the previous hardware-access catalog API. Marketplace, credential, availability, billing, and commercial execution exports are outside the SDK scope.

## Project context

- Central planning and current context live in [`ketqat/ketqat-planning`](https://github.com/ketqat/ketqat-planning).
- Organization roadmap status belongs in the KetQat Roadmap Project once project scopes are available.
- Repository-specific operating rules are in [AGENTS.md](AGENTS.md).
- SDK bugs and feature requests should be opened as Issues in this repository.
- Cross-repository proposals, RFCs, ADRs, and initiatives belong in `ketqat-planning`.
- Substantial pull requests should link an Issue and describe schema, reproducibility, scientific-validity, and security impact.

## Scope

The SDK owns:

- QEC and quantum-algorithm artifact contracts
- Experiment manifests and benchmark-result contracts
- Zod runtime validators and generated JSON Schemas
- Deterministic reproducibility hashing
- Scientific compatibility helpers
- A framework-independent REST client
- Demo fixtures that are visibly marked with `is_demo: true`
- A local Python runner package under `python/`

The web app owns persistence, UI, APIs, authorization, charts, and deployment.

## Install

```bash
npm install ketqat-sdk
```

During coordinated development, the web app should consume a released package, exact Git commit dependency, or generated package tarball. Do not use the old vendored `lib/ketqat-sdk` copy.

## Public Exports

```ts
import {
  ArtifactSchema,
  BenchmarkResultSchema,
  BenchmarkSuiteSchema,
  ExperimentManifestSchema,
  ReproducibilityBundleSchema,
  VerificationEvidenceSchema,
  calculateReproducibilityHash,
  compareRunCompatibility,
} from "ketqat-sdk"

import { KetQatClient } from "ketqat-sdk/client"
import { demoArtifacts, demoBenchmarkSuites, demoRuns } from "ketqat-sdk/demo"
```

Subpath exports are available for:

- `ketqat-sdk/contracts`
- `ketqat-sdk/schemas`
- `ketqat-sdk/reproducibility`
- `ketqat-sdk/compatibility`
- `ketqat-sdk/client`
- `ketqat-sdk/demo`

## Schema Versioning

The npm package version and research schema version are separate. `SDK_VERSION` is currently `0.2.0`; `SCHEMA_VERSION` is currently `0.1`.

Generated JSON Schemas are committed in `schemas/` for:

- artifacts
- benchmark suites
- QEC experiment manifests
- algorithm experiment manifests
- QEC benchmark results
- algorithm benchmark results
- verification evidence
- reproducibility bundles

Regenerate them with:

```bash
npm run build
```

## Runner

The local runner lives in `python/` and exposes:

```bash
ketqat run examples/algorithms/grover-search.yaml --output output/run.json
ketqat run examples/qec/surface-code-memory.yaml --output output/run.json
```

Optional dependency groups:

```bash
pip install "ketqat-runner[qec]"
pip install "ketqat-runner[algorithms]"
pip install "ketqat-runner[all]"
```

Normal QEC execution requires NumPy, Stim, and PyMatching. If those packages are missing, the runner exits non-zero and does not write a successful result file. There is no automatic synthetic fallback.

The MVP runner supports small local experiments only:

- QEC: rotated surface-code memory experiments using real Stim detector sampling and PyMatching decoding
- Algorithms: Grover search on small marked-state problems using local deterministic shot simulation

QEC coordinate seeds are derived deterministically from the global seed, benchmark-suite version, code distance, and physical error rate. Decoder latency is reported as total batch decode latency in milliseconds, with per-shot latency and component timings in metric metadata.

It does not execute arbitrary user source code and does not submit jobs to QPUs.

## Reproducibility Hashing

`calculateReproducibilityHash(input)` uses deterministic SHA-256 hashing over canonical JSON. It includes schema version, domain, benchmark identity, configuration, source reference, software versions, and environment information. It excludes run IDs, timestamps, database IDs, submission timestamps, UI metadata, and the stored hash itself.

Cross-language parity fixtures live in `fixtures/reproducibility/` and are tested from both TypeScript and Python.

Verification evidence is modeled as a separate contract. It records schema validation, hash verification, review notes, and reproduction evidence without becoming part of existing benchmark-result hash inputs. Hash verification alone is not accepted as `REPRODUCED`; independent reproduction evidence must include a durable evidence URL, the verified reproducibility hash, and a command or immutable source commit.

Registry records may include `owner_username` and `visibility` when returned by the multi-user Web platform. These fields are access-control and attribution metadata. They are intentionally accepted by artifact, benchmark-suite, and benchmark-result contracts, but they are excluded from reproducibility hash inputs.

`ReproducibilityBundleSchema` validates the JSON returned by the Web run bundle endpoint. A bundle carries the stored benchmark result, benchmark-suite definition, environment, benchmark-run verification evidence, citation, and reproduction instructions. The bundle `experiment_manifest` field is the stored run configuration exactly as submitted; it is intentionally an open record and is not required to satisfy `ExperimentManifestSchema`, because imported runs persist arbitrary configuration snapshots. The bundle-level `reproducibility_hash` must match the enclosed benchmark result hash, but bundle verification evidence remains outside benchmark-result hash inputs.

Typed clients can parse bundles directly:

```ts
const client = new KetQatClient({ baseUrl: "https://ketqat.com" })
const bundle = await client.runs.getBundle("surface-code-mwpm-baseline-4aefa985")
```

Use `client.runs.downloadBundle(slug)` when raw download behavior is required.

## Compatibility

Use:

- `compareRunCompatibility(left, right, suites)`
- `findComparableMetricCoordinates(left, right)`
- `compareExactReproductionConfiguration(left, right)`

Cross-domain comparison is rejected. Runs are comparable only when benchmark suite, benchmark version, schema version, and required metric coordinates align. Runs with disjoint coordinate sets, such as different QEC `(metric, code_distance, physical_error_rate)` points or different algorithm qubit counts, are incompatible.

## Development

```bash
npm install
npm run build
npm test
python3.11 -m pip install -e "python[qec]" pytest
python3.11 -m pytest python/tests
```

## Scientific Limitations

Demo data is synthetic and marked with `is_demo: true`. It must not be read as performance evidence, popularity ranking, or scientific verification. Real local QEC runs are still small software simulations, not QPU evidence. Threshold claims require real benchmark methodology and review outside this MVP.

## Security Limitations

The SDK validates research contracts and computes hashes. It does not authenticate users, store secrets, execute uploaded code, or manage provider credentials.

## License

Apache License 2.0, see [LICENSE](LICENSE).
