import assert from "node:assert/strict"
import fs from "node:fs"
import {
  AlgorithmExperimentManifestSchema,
  BenchmarkResultSchema,
  ArtifactSchema,
  QecExperimentManifestSchema,
  QecBenchmarkResultSchema,
  VerificationEvidenceSchema,
  calculateReproducibilityHash,
  compareRunCompatibility,
  demoArtifacts,
  demoBenchmarkSuites,
  demoRuns,
  findComparableMetricCoordinates,
} from "../dist/index.js"

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url), "utf8"))

for (const artifact of demoArtifacts) {
  assert.equal(ArtifactSchema.parse(artifact).is_demo, true)
}

QecExperimentManifestSchema.parse({
  schema_version: "0.1",
  domain: "QEC",
  benchmark: { suite: "surface-code-memory-mwpm", version: "0.1.0" },
  experiment: { name: "surface-code-mwpm-baseline" },
  source: { repository_url: "https://github.com/example/repository" },
  qec: {
    experiment_type: "memory",
    code: { family: "rotated-surface-code", distances: [3], rounds: "distance" },
    noise: { model: "circuit-level-depolarizing", physical_error_rates: [0.001] },
    decoder: { name: "pymatching", version: "auto" },
  },
  sampling: { shots: 10, seed: 42 },
  metrics: ["logical_error_rate"],
})

assert.throws(() =>
  QecExperimentManifestSchema.parse({
    schema_version: "0.1",
    domain: "QEC",
    benchmark: { suite: "surface-code-memory-mwpm", version: "0.1.0" },
    experiment: { name: "bad-even-distance" },
    qec: {
      experiment_type: "memory",
      code: { family: "rotated-surface-code", distances: [0], rounds: "distance" },
      noise: { model: "circuit-level-depolarizing", physical_error_rates: [0.001] },
      decoder: { name: "pymatching" },
    },
    sampling: { shots: 10, seed: 42 },
    metrics: ["logical_error_rate"],
  }),
)

AlgorithmExperimentManifestSchema.parse({
  schema_version: "0.1",
  domain: "ALGORITHM",
  benchmark: { suite: "grover-search-local", version: "0.1.0" },
  experiment: { name: "grover-search-baseline" },
  algorithm: {
    family: "grover-search",
    problem: { type: "marked-state-search", qubit_counts: [2], marked_state: "all-ones" },
    execution: { engine: "ketqat-runner", method: "shot-based" },
  },
  sampling: { shots: 16, seed: 7 },
  metrics: ["success_probability"],
})

assert.throws(() =>
  AlgorithmExperimentManifestSchema.parse({
    schema_version: "0.1",
    domain: "ALGORITHM",
    benchmark: { suite: "grover-search-local", version: "0.1.0" },
    experiment: { name: "bad" },
    qec: {},
    sampling: { shots: 16, seed: 7 },
    metrics: ["success_probability"],
  }),
)

const [qecRun, algorithmRun] = demoRuns
assert.ok(qecRun)
assert.ok(algorithmRun)
BenchmarkResultSchema.parse(qecRun)
BenchmarkResultSchema.parse(algorithmRun)
assert.equal(calculateReproducibilityHash(qecRun), qecRun.reproducibility_hash)
assert.equal(compareRunCompatibility(qecRun, algorithmRun, demoBenchmarkSuites).compatible, false)
assert.deepEqual(findComparableMetricCoordinates(qecRun, algorithmRun), [])
assert.equal(compareRunCompatibility(qecRun, { ...qecRun, name: "copy" }, demoBenchmarkSuites).compatible, true)

const expectedHashes = fixture("expected-hashes.json")
const qecManifest = fixture("qec-manifest.json")
const qecResult = fixture("qec-result-before-hash.json")
const algorithmResult = fixture("algorithm-result-before-hash.json")

assert.equal(calculateReproducibilityHash(qecManifest), expectedHashes.qec_manifest)
assert.equal(calculateReproducibilityHash(qecResult), expectedHashes.qec_result)
assert.equal(calculateReproducibilityHash(algorithmResult), expectedHashes.algorithm_result)

const reorderedQecResult = {
  ...qecResult,
  configuration: {
    ...qecResult.configuration,
    sampling: qecResult.configuration.sampling,
    benchmark: qecResult.configuration.benchmark,
  },
}
assert.equal(calculateReproducibilityHash(reorderedQecResult), expectedHashes.qec_result)

assert.equal(
  calculateReproducibilityHash({
    ...qecResult,
    id: "changed-id",
    slug: "changed-slug",
    started_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:01.000Z",
  }),
  expectedHashes.qec_result,
)

assert.notEqual(
  calculateReproducibilityHash({
    ...qecResult,
    metric_points: [{ ...qecResult.metric_points[0], physical_error_rate: 0.002 }],
  }),
  expectedHashes.qec_result,
)
assert.notEqual(
  calculateReproducibilityHash({
    ...qecResult,
    metric_points: [{ ...qecResult.metric_points[0], code_distance: 5 }],
  }),
  expectedHashes.qec_result,
)
assert.notEqual(calculateReproducibilityHash({ ...qecResult, benchmark_suite_version: "0.1.1" }), expectedHashes.qec_result)
assert.notEqual(calculateReproducibilityHash({ ...qecResult, sdk_version: "0.2.1" }), expectedHashes.qec_result)

QecBenchmarkResultSchema.parse({ ...qecResult, reproducibility_hash: expectedHashes.qec_result })

VerificationEvidenceSchema.parse({
  schema_version: "0.1",
  subject: {
    type: "BENCHMARK_RUN",
    slug: "surface-code-memory-parity",
  },
  status: "VALIDATED_SCHEMA",
  evidence_kind: "HASH_VERIFICATION",
  summary: "The imported run payload matched its recalculated reproducibility hash.",
  reproducibility_hash: expectedHashes.qec_result,
  checked_at: "2026-06-26T10:00:00.000Z",
})

VerificationEvidenceSchema.parse({
  schema_version: "0.1",
  subject: {
    type: "BENCHMARK_RUN",
    slug: "surface-code-memory-parity",
  },
  status: "REPRODUCED",
  evidence_kind: "INDEPENDENT_REPRODUCTION",
  summary: "A reviewer reran the recorded manifest and matched the stored result hash.",
  evidence_url: "https://github.com/ketqat/ketqat-sdk/actions/runs/123",
  reproducibility_hash: expectedHashes.qec_result,
  source: {
    repository_url: "https://github.com/ketqat/ketqat-sdk",
    commit_sha: "df986b2afc8ee31e564d9efc6df08c119c172bf4",
    command: "ketqat run examples/qec/surface-code-memory.yaml --output run.json",
    runner: "ketqat-runner",
  },
  environment: {
    python_version: "3.11",
    packages: {
      stim: "1.15.0",
      pymatching: "2.3.0",
      numpy: "2.0.0",
    },
    hardware: {},
  },
  checked_at: "2026-06-26T10:00:00.000Z",
})

assert.throws(() =>
  VerificationEvidenceSchema.parse({
    schema_version: "0.1",
    subject: {
      type: "BENCHMARK_RUN",
      slug: "surface-code-memory-parity",
    },
    status: "REPRODUCED",
    evidence_kind: "HASH_VERIFICATION",
    summary: "Hash matched.",
    evidence_url: "https://github.com/ketqat/ketqat-sdk/actions/runs/123",
    reproducibility_hash: expectedHashes.qec_result,
    source: {
      command: "ketqat run examples/qec/surface-code-memory.yaml --output run.json",
    },
    checked_at: "2026-06-26T10:00:00.000Z",
  }),
)

assert.throws(() =>
  VerificationEvidenceSchema.parse({
    schema_version: "0.1",
    subject: {
      type: "BENCHMARK_RUN",
      slug: "surface-code-memory-parity",
    },
    status: "REPRODUCED",
    evidence_kind: "DEMO_FIXTURE_REPRODUCTION",
    summary: "Demo fixture was rerun.",
    evidence_url: "https://github.com/ketqat/ketqat-sdk/actions/runs/123",
    reproducibility_hash: expectedHashes.qec_result,
    source: {
      command: "npm test",
    },
    checked_at: "2026-06-26T10:00:00.000Z",
  }),
)

assert.equal(calculateReproducibilityHash(qecResult), expectedHashes.qec_result)

const compatibleCoordinates = findComparableMetricCoordinates(
  qecResult,
  {
    ...qecResult,
    name: "surface-code-memory-parity-copy",
    reproducibility_hash: "different",
    metric_points: [
      { ...qecResult.metric_points[0], logical_error_rate: 0.03 },
      { ...qecResult.metric_points[0], physical_error_rate: 0.002 },
    ],
  },
)
assert.deepEqual(compatibleCoordinates, ["logical_error_rate|distance=3|p=0.001"])

assert.equal(
  compareRunCompatibility(qecResult, { ...qecResult, benchmark_suite_version: "0.2.0" }, demoBenchmarkSuites).compatible,
  false,
)

const noOverlapWithoutSuite = compareRunCompatibility(
  qecResult,
  {
    ...qecResult,
    name: "surface-code-memory-disjoint-copy",
    reproducibility_hash: "different",
    metric_points: [{ ...qecResult.metric_points[0], physical_error_rate: 0.002 }],
  },
)
assert.equal(noOverlapWithoutSuite.compatible, false)
assert.deepEqual(noOverlapWithoutSuite.reasons, [
  {
    code: "NO_COMPARABLE_METRIC_COORDINATES",
    message: "Runs do not share any comparable metric coordinates.",
    path: "metric_points",
  },
])

const noOverlapForRequiredQecMetrics = compareRunCompatibility(
  qecRun,
  {
    ...qecRun,
    name: "surface-code-mwpm-demo-run-distance-5",
    reproducibility_hash: "different",
    metric_points: qecRun.metric_points.map((point) =>
      "code_distance" in point ? { ...point, code_distance: 5 } : point,
    ),
  },
  demoBenchmarkSuites,
)
assert.equal(noOverlapForRequiredQecMetrics.compatible, false)
assert.deepEqual(noOverlapForRequiredQecMetrics.reasons, [
  {
    code: "METRIC_COORDINATE_MISMATCH",
    message: "Required metric 'logical_error_rate' has no overlapping comparable coordinates.",
    path: "metric_points",
  },
  {
    code: "METRIC_COORDINATE_MISMATCH",
    message: "Required metric 'decoder_latency_ms' has no overlapping comparable coordinates.",
    path: "metric_points",
  },
])
