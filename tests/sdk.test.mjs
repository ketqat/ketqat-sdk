import assert from "node:assert/strict"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import {
  AlgorithmExperimentManifestSchema,
  ArtifactRelationSchema,
  ArtifactTypeSchema,
  BenchmarkResultSchema,
  BenchmarkSuiteSchema,
  ArtifactSchema,
  EquivalenceEvidenceSchema,
  QecExperimentManifestSchema,
  QecBenchmarkResultSchema,
  QuantumCardSchema,
  ReproducibilityBundleSchema,
  TRUST_LEVEL_ORDER,
  TransformationChainSchema,
  VerificationEvidenceSchema,
  KetQatClient,
  calculateReproducibilityHash,
  chainHasSemanticLoss,
  compareRunCompatibility,
  compareTrustLevels,
  demoArtifacts,
  demoBenchmarkSuites,
  demoRuns,
  findComparableMetricCoordinates,
  isEvidencedRelation,
  LossReportEntrySchema,
  QuantumCircuitSchema,
  Qasm3ParseError,
  emitQasm3,
  gateCount,
  parseQasm3,
  totalQubits,
  twoQubitGateCount,
  usesClassicalControl,
  usesMidCircuitMeasurement,
  usesReset,
  CircuitTransformationSchema,
  HardwareProfileSchema,
  NormalizedResourceEstimateSchema,
  RESOURCE_ESTIMATOR,
  checkCircuitEquivalence,
  compareShotResults,
  couplingAdjacency,
  estimateResources,
  evaluateParameter,
  linearTopology,
  resourceEstimatesComparable,
  shortestPath,
  simulateStatevector,
  transpileForHardware,
  SUPPORTED_REWRITES,
  optimizeWithZx,
  expectationFromCounts,
  foldCircuit,
  mitigateReadout,
  zeroNoiseExtrapolation,
  verifyReproducibilityHash,
  JobParametersSchema,
  callTool,
  listTools,
  runCli,
  FORBIDDEN_JOB_FIELDS,
  JobRejectedError,
  JobResultSchema,
  assertWithinLimits,
  enforceResultSize,
  executeJob,
  validateJob,
  NotRunRecordSchema,
  ProviderSubmissionSchema,
  REFERENCE_PROVIDER,
  redactCredentials,
  resolveProvider,
} from "../dist/index.js"

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url), "utf8"))

for (const artifact of demoArtifacts) {
  assert.equal(ArtifactSchema.parse(artifact).is_demo, true)
}

ArtifactSchema.parse({
  ...demoArtifacts[0],
  owner_username: "alice",
  visibility: "PRIVATE",
})

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
BenchmarkResultSchema.parse({ ...qecRun, owner_username: "alice", visibility: "PUBLIC" })
demoBenchmarkSuites[0] && BenchmarkSuiteSchema.parse({ ...demoBenchmarkSuites[0], owner_username: null, visibility: "PUBLIC" })
assert.equal(calculateReproducibilityHash(qecRun), qecRun.reproducibility_hash)
assert.equal(calculateReproducibilityHash({ ...qecRun, owner_username: "alice", visibility: "PRIVATE" }), qecRun.reproducibility_hash)
assert.equal(compareRunCompatibility(qecRun, algorithmRun, demoBenchmarkSuites).compatible, false)
assert.deepEqual(findComparableMetricCoordinates(qecRun, algorithmRun), [])
assert.equal(compareRunCompatibility(qecRun, { ...qecRun, name: "copy" }, demoBenchmarkSuites).compatible, true)

const expectedHashes = fixture("expected-hashes.json")
const qecManifest = fixture("qec-manifest.json")
const qecResult = fixture("qec-result-before-hash.json")
const qecResultNullMetadata = fixture("qec-result-null-metadata.json")
const algorithmResult = fixture("algorithm-result-before-hash.json")

// Both hash versions, pinned. The v1 block is the load-bearing half: those are
// the hashes published before ketqat-sdk#89 was fixed, and if any moved, records
// already in the registry would stop verifying. Pinning them is what makes the
// fix additive rather than a rewrite of history.
for (const [versionKey, version] of [["v1", 1], ["v2", 2]]) {
  assert.equal(calculateReproducibilityHash(qecManifest, version), expectedHashes[versionKey].qec_manifest)
  assert.equal(calculateReproducibilityHash(qecResult, version), expectedHashes[versionKey].qec_result)
  assert.equal(
    calculateReproducibilityHash(qecResultNullMetadata, version),
    expectedHashes[versionKey].qec_result_null_metadata,
  )
  assert.equal(calculateReproducibilityHash(algorithmResult, version), expectedHashes[versionKey].algorithm_result)
}
assert.notEqual(expectedHashes.v2.qec_result_null_metadata, expectedHashes.v2.qec_result)

// The fix must change something, and must not touch a payload with no timing in it.
assert.notEqual(expectedHashes.v1.qec_result, expectedHashes.v2.qec_result)
assert.equal(expectedHashes.v1.qec_manifest, expectedHashes.v2.qec_manifest)

// A duration is not science: changing one must not change the hash. That is the
// entire content of ketqat-sdk#89, and under v1 it did change it.
const slowerRun = {
  ...qecResult,
  metric_points: [{ ...qecResult.metric_points[0], runtime_seconds: 999.5 }],
}
assert.equal(calculateReproducibilityHash(slowerRun, 2), expectedHashes.v2.qec_result)
assert.notEqual(calculateReproducibilityHash(slowerRun, 1), expectedHashes.v1.qec_result)

// A record picks the rules it was written under, so an old record still verifies.
const legacyRecord = { ...qecResult, reproducibility_hash: expectedHashes.v1.qec_result }
assert.equal(verifyReproducibilityHash(legacyRecord).valid, true, "a pre-versioning record must still verify")
assert.equal(verifyReproducibilityHash(legacyRecord).version, 1)

const modernRecord = {
  ...qecResult,
  reproducibility_hash_version: 2,
  reproducibility_hash: calculateReproducibilityHash({ ...qecResult, reproducibility_hash_version: 2 }, 2),
}
assert.equal(verifyReproducibilityHash(modernRecord).valid, true)
assert.equal(verifyReproducibilityHash(modernRecord).version, 2)

// An unknown version is refused rather than silently treated as current.
assert.throws(() => calculateReproducibilityHash(qecResult, 99), /Unknown reproducibility hash version/)

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
QecBenchmarkResultSchema.parse({
  ...qecResultNullMetadata,
  reproducibility_hash: expectedHashes.qec_result_null_metadata,
})

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

const reproducibilityBundle = {
  bundle_version: "0.2",
  experiment_manifest: qecResult.configuration,
  benchmark_result: { ...qecResult, reproducibility_hash: expectedHashes.qec_result },
  benchmark_suite_definition: { metrics: ["logical_error_rate"] },
  verification_evidence: [{
    schema_version: "0.1",
    subject: { type: "BENCHMARK_RUN", slug: "surface-code-memory-parity" },
    status: "VALIDATED_SCHEMA",
    evidence_kind: "HASH_VERIFICATION",
    summary: "The imported run payload matched its recalculated reproducibility hash.",
    reproducibility_hash: expectedHashes.qec_result,
    checked_at: "2026-06-26T10:00:00.000Z",
  }],
  artifact_metadata: null,
  environment: qecResult.environment,
  source_repository: qecResult.source_repository_url ?? "unspecified",
  commit_sha: qecResult.commit_sha ?? "unspecified",
  reproducibility_hash: expectedHashes.qec_result,
  citation: "KetQat reproducibility bundle. Cite the original artifact and benchmark suite where applicable.",
  reproduction_instructions: {
    command: "ketqat run experiment.yaml --output run.json",
    notes: "This bundle records the submitted result and manifest. It is not itself a reproduction record.",
  },
}

ReproducibilityBundleSchema.parse(reproducibilityBundle)

assert.throws(() =>
  ReproducibilityBundleSchema.parse({
    ...reproducibilityBundle,
    reproducibility_hash: "different",
  }),
)

const bundleClient = new KetQatClient({
  baseUrl: "https://ketqat.example/",
  fetch: async (url) => {
    assert.equal(url, "https://ketqat.example/api/runs/surface-code-memory-parity/bundle")
    return new Response(JSON.stringify(reproducibilityBundle), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  },
})
assert.equal((await bundleClient.runs.getBundle("surface-code-memory-parity")).reproducibility_hash, expectedHashes.qec_result)

const wrappedBundleClient = new KetQatClient({
  baseUrl: "https://ketqat.example/",
  fetch: async () =>
    new Response(JSON.stringify({ bundle: reproducibilityBundle }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
})
assert.equal((await wrappedBundleClient.runs.getBundle("surface-code-memory-parity")).reproducibility_hash, expectedHashes.qec_result)

const importClient = new KetQatClient({
  baseUrl: "https://ketqat.example/",
  token: "kq_test_token",
  fetch: async (url, init) => {
    assert.equal(url, "https://ketqat.example/api/runs/import")
    assert.equal(init.method, "POST")
    assert.equal(init.headers.get("authorization"), "Bearer kq_test_token")
    assert.equal(init.headers.get("content-type"), "application/json")
    assert.deepEqual(JSON.parse(init.body), { result: qecRun, visibility: "PRIVATE" })
    return new Response(JSON.stringify({ run: { ...qecRun, visibility: "PRIVATE" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    })
  },
})
assert.equal((await importClient.runs.import(qecRun, { visibility: "PRIVATE" })).visibility, "PRIVATE")

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

// ---------------------------------------------------------------------------
// Platform 2.0 contract additions (RFC 0002, RFC 0003, RFC 0004)
// ---------------------------------------------------------------------------

// Backward-compatibility gate. Extending the schemas must not move a single
// stored hash, so the frozen fixture corpus is re-asserted here after the
// extension. If any of these fail, every stored run's comparability is broken.
assert.equal(calculateReproducibilityHash(qecManifest), expectedHashes.qec_manifest)
assert.equal(calculateReproducibilityHash(qecResult), expectedHashes.qec_result)
assert.equal(calculateReproducibilityHash(algorithmResult), expectedHashes.algorithm_result)
assert.equal(
  calculateReproducibilityHash(fixture("qec-result-float-edge-cases.json")),
  expectedHashes.qec_result_float_edge_cases,
)

// Parsing must not inject the new fields. A `.default(...)` on any of them
// would make the parsed object hash differently from the raw one, which is the
// exact failure this asserts against.
const parsedQecResult = QecBenchmarkResultSchema.parse({
  ...qecResult,
  reproducibility_hash: expectedHashes.qec_result,
})
assert.equal(Object.hasOwn(parsedQecResult, "execution_class"), false)
assert.equal(Object.hasOwn(parsedQecResult, "transformation_chain"), false)
assert.equal(calculateReproducibilityHash(parsedQecResult), expectedHashes.qec_result)

const parsedArtifact = ArtifactSchema.parse(demoArtifacts[0])
assert.equal(Object.hasOwn(parsedArtifact, "artifact_type"), false)
assert.equal(Object.hasOwn(parsedArtifact, "quantum_card"), false)

// An absent optional field leaves the hash alone; an explicit null does not.
// This is why RFC 0003 requires new fields to be optional-and-absent.
assert.equal(calculateReproducibilityHash({ ...qecResult, execution_class: undefined }), expectedHashes.qec_result)
assert.notEqual(calculateReproducibilityHash({ ...qecResult, execution_class: null }), expectedHashes.qec_result)
assert.notEqual(
  calculateReproducibilityHash({ ...qecResult, execution_class: "SIMULATION" }),
  expectedHashes.qec_result,
)

// Artifact type and Quantum Card
assert.equal(ArtifactTypeSchema.parse("DECODER"), "DECODER")
assert.throws(() => ArtifactTypeSchema.parse("NOT_A_TYPE"))

const validCard = {
  schema_version: "0.1",
  name: "Surface code memory",
  slug: "surface-code-memory",
  version: "0.1.0",
  artifact_type: "QEC_CODE",
  description: "Rotated surface code memory experiment.",
  problem_definition: "Preserve one logical qubit for d rounds under circuit-level noise.",
  provenance: {
    license: "Apache-2.0",
    authors: ["A. Researcher"],
  },
  assumptions: {
    noise: ["Uniform circuit-level depolarizing noise"],
  },
  known_limitations: ["None identified"],
}
const parsedCard = QuantumCardSchema.parse(validCard)
assert.equal(parsedCard.verification_status, "UNVERIFIED")
assert.deepEqual(parsedCard.assumptions.hardware, [])

// Assumptions and limitations are required on purpose: an artifact whose
// assumptions are unstated cannot be validly compared.
assert.throws(() => QuantumCardSchema.parse({ ...validCard, known_limitations: [] }))
assert.throws(() => QuantumCardSchema.parse({ ...validCard, known_limitations: undefined }))
assert.throws(() => QuantumCardSchema.parse({ ...validCard, assumptions: undefined }))
assert.throws(() => QuantumCardSchema.parse({ ...validCard, provenance: { license: "Apache-2.0", authors: [] } }))
assert.throws(() =>
  QuantumCardSchema.parse({ ...validCard, applicability: { qubit_range: { minimum: 10, maximum: 4 } } }),
)

// An artifact may carry a card without disturbing existing records.
ArtifactSchema.parse({ ...demoArtifacts[0], artifact_type: "QEC_CODE", quantum_card: validCard })

// Equivalence evidence: FAILED and INCONCLUSIVE are not interchangeable.
assert.throws(
  () => EquivalenceEvidenceSchema.parse({ level: "FAILED" }),
  /counterexample/,
  "FAILED without a counterexample must be rejected -- failing to prove equality is not proving inequality",
)
EquivalenceEvidenceSchema.parse({ level: "FAILED", counterexample: "|01> amplitude differs by 0.5" })
assert.throws(() => EquivalenceEvidenceSchema.parse({ level: "INCONCLUSIVE" }), /reason/)
EquivalenceEvidenceSchema.parse({ level: "INCONCLUSIVE", reason: "full_reduce did not reach the identity" })
assert.throws(() => EquivalenceEvidenceSchema.parse({ level: "NUMERICALLY_CHECKED" }), /tolerance/)
EquivalenceEvidenceSchema.parse({ level: "NUMERICALLY_CHECKED", tolerance: 1e-9, global_phase_ignored: true })
EquivalenceEvidenceSchema.parse({ level: "NOT_CHECKED" })

// Transformation chains and semantic loss
const lossyStep = {
  kind: "CONVERSION",
  adapter: "example-adapter",
  adapter_version: "0.1.0",
  loss_report: [
    {
      feature: "mid_circuit_measurement",
      severity: "semantic",
      action: "dropped",
      detail: "target backend has no mid-circuit measurement",
    },
  ],
}
const cosmeticStep = {
  kind: "EXPORT",
  adapter: "openqasm3",
  adapter_version: "0.1.0",
  loss_report: [
    { feature: "comments", severity: "cosmetic", action: "dropped", detail: "comments are not preserved" },
  ],
}
assert.equal(chainHasSemanticLoss(TransformationChainSchema.parse([lossyStep])), true)
assert.equal(chainHasSemanticLoss(TransformationChainSchema.parse([cosmeticStep])), false)
assert.equal(chainHasSemanticLoss(TransformationChainSchema.parse([])), false)

// Compatibility: mixed execution classes are not ranked against each other.
const simulatedRun = { ...qecRun, execution_class: "SIMULATION" }
const hardwareRun = { ...qecRun, execution_class: "HARDWARE" }
const mixedClass = compareRunCompatibility(simulatedRun, hardwareRun)
assert.equal(mixedClass.compatible, false)
assert.ok(mixedClass.reasons.some((entry) => entry.code === "EXECUTION_CLASS_MISMATCH"))

// The escape hatch exists for explicitly labelled comparisons.
assert.equal(
  compareRunCompatibility(simulatedRun, hardwareRun, [], { allowMixedExecutionClasses: true }).compatible,
  true,
)

// Same class compares normally, and runs recorded before the field existed are
// unaffected -- absence means "not recorded", never a guessed value.
assert.equal(compareRunCompatibility(simulatedRun, { ...qecRun, execution_class: "SIMULATION" }).compatible, true)
assert.equal(compareRunCompatibility(qecRun, hardwareRun).compatible, true)
assert.equal(compareRunCompatibility(qecRun, qecRun).compatible, true)

// Compatibility: a semantically lossy circuit is not silently comparable.
const lossyRun = { ...qecRun, transformation_chain: [lossyStep] }
const lossyComparison = compareRunCompatibility(lossyRun, qecRun)
assert.equal(lossyComparison.compatible, false)
assert.ok(lossyComparison.reasons.some((entry) => entry.code === "SEMANTIC_TRANSFORMATION_LOSS"))
assert.equal(
  compareRunCompatibility(lossyRun, qecRun, [], { allowSemanticTransformationLoss: true }).compatible,
  true,
)
assert.equal(compareRunCompatibility({ ...qecRun, transformation_chain: [cosmeticStep] }, qecRun).compatible, true)

// Trust ladder ordering
assert.ok(compareTrustLevels("UNVERIFIED", "REVIEWED") < 0)
assert.ok(compareTrustLevels("REPRODUCED", "HASH_VERIFIED") > 0)
assert.equal(compareTrustLevels("SOURCE_VERIFIED", "SOURCE_VERIFIED"), 0)
assert.equal(TRUST_LEVEL_ORDER.length, 8)

// Relations carry an asserter, and evidence is what separates a supported claim
// from an attributed assertion.
const relation = ArtifactRelationSchema.parse({
  schema_version: "0.1",
  relation: "compatible_with",
  from_artifact_slug: "surface-code-memory",
  to_artifact_slug: "pymatching-decoder",
  asserted_by: "a-researcher",
})
assert.equal(isEvidencedRelation(relation), false)
assert.equal(
  isEvidencedRelation({ ...relation, evidence: { summary: "Both assume circuit-level depolarizing noise." } }),
  true,
)
assert.throws(() => ArtifactRelationSchema.parse({ ...relation, asserted_by: undefined }))
assert.throws(() => ArtifactRelationSchema.parse({ ...relation, relation: "vaguely_similar_to" }))

// ---------------------------------------------------------------------------
// Circuit graph and OpenQASM 3 adapter (RFC 0002)
// ---------------------------------------------------------------------------

const roundTripCorpus = {
  bell: `OPENQASM 3;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`,
  parameterized: `OPENQASM 3;
include "stdgates.inc";
qubit[2] q;
rz(0.5) q[0];
rx(pi/2) q[1];
u(0.1, 0.2, 0.3) q[0];
cp(-1.5e-3) q[0], q[1];
`,
  midCircuitAndFeedForward: `OPENQASM 3;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
c[0] = measure q[0];
reset q[0];
if (c == 1) x q[1];
barrier q[0], q[1];
c[1] = measure q[1];
`,
  blockCondition: `OPENQASM 3;
include "stdgates.inc";
qubit[2] q;
bit[1] c;
c[0] = measure q[0];
if (c == 1) { x q[1]; }
`,
  barrierAll: `OPENQASM 3;
qubit[2] q;
barrier;
`,
}

// Round-trip is semantic, not textual: parse -> emit -> parse must reach the
// same structure. Formatting, declaration order, and normalized syntax may
// differ; the circuit may not.
for (const [name, source] of Object.entries(roundTripCorpus)) {
  const first = parseQasm3(source)
  const second = parseQasm3(emitQasm3(first.circuit))
  assert.deepEqual(second.circuit, first.circuit, `round-trip changed the circuit for '${name}'`)
  QuantumCircuitSchema.parse(first.circuit)
}

// Structure of the Bell fixture
const bell = parseQasm3(roundTripCorpus.bell).circuit
assert.deepEqual(bell.qubit_registers, [{ name: "q", size: 2 }])
assert.deepEqual(bell.clbit_registers, [{ name: "c", size: 2 }])
assert.equal(gateCount(bell), 2)
assert.equal(twoQubitGateCount(bell), 1)
assert.equal(totalQubits(bell), 2)
assert.equal(usesMidCircuitMeasurement(bell), false)

// Parameters keep their written form. Evaluating `pi/2` to a float here would
// silently rewrite the program on emit.
const parameterized = parseQasm3(roundTripCorpus.parameterized).circuit
assert.deepEqual(parameterized.operations[0].parameters, [0.5])
assert.deepEqual(parameterized.operations[1].parameters, ["pi/2"])
assert.deepEqual(parameterized.operations[2].parameters, [0.1, 0.2, 0.3])
assert.deepEqual(parameterized.operations[3].parameters, [-0.0015])

// Mid-circuit measurement, reset, and feed-forward survive intact.
const dynamic = parseQasm3(roundTripCorpus.midCircuitAndFeedForward).circuit
assert.equal(usesMidCircuitMeasurement(dynamic), true)
assert.equal(usesClassicalControl(dynamic), true)
assert.equal(usesReset(dynamic), true)
const conditional = dynamic.operations.find((operation) => operation.kind === "conditional")
assert.equal(conditional.register, "c")
assert.equal(conditional.equals, 1)
assert.equal(conditional.body.kind, "gate")
assert.equal(conditional.body.name, "x")

// Braced condition bodies parse to the same structure as unbraced ones.
const braced = parseQasm3(roundTripCorpus.blockCondition).circuit
assert.equal(braced.operations.filter((operation) => operation.kind === "conditional").length, 1)

// `barrier;` with no operands means all qubits, and stays that way.
assert.deepEqual(parseQasm3(roundTripCorpus.barrierAll).circuit.operations, [{ kind: "barrier", qubits: [] }])

// Register broadcast expands to one operation per index.
const broadcast = parseQasm3(`OPENQASM 3;
qubit[3] q;
h q;
`).circuit
assert.equal(broadcast.operations.length, 3)
assert.deepEqual(
  broadcast.operations.map((operation) => operation.qubits[0].index),
  [0, 1, 2],
)

// Unsupported constructs are rejected by name, never silently dropped. This is
// the invariant RFC 0002 exists to enforce: a parser that ignores what it does
// not understand is how the circuit that ran stops being the circuit written.
const rejections = [
  ["gate mygate a, b { cx a, b; }", "custom_gate_definition"],
  ["def helper(int n) { }", "subroutine_definition"],
  ["for int i in [0:3] { h q[i]; }", "control_flow_loop"],
  ["while (c == 0) { h q[0]; }", "control_flow_loop"],
  ["defcal x $0 { }", "pulse_calibration"],
  ["delay[100ns] q[0];", "explicit_timing"],
  ["box { h q[0]; }", "box_scoping"],
  ["ctrl @ x q[0], q[1];", "gate_modifier"],
  ["input float theta;", "io_declaration"],
  ["array[int, 4] values;", "array_declaration"],
]
for (const [snippet, expectedFeature] of rejections) {
  const source = `OPENQASM 3;\nqubit[2] q;\nbit[2] c;\n${snippet}\n`
  assert.throws(
    () => parseQasm3(source),
    (error) => {
      assert.ok(error instanceof Qasm3ParseError, `expected Qasm3ParseError for '${snippet}'`)
      assert.equal(error.feature, expectedFeature, `wrong feature reported for '${snippet}'`)
      return true
    },
    `'${snippet}' must be rejected, not silently ignored`,
  )
}

// A non-equality classical condition is rejected rather than approximated.
assert.throws(
  () => parseQasm3(`OPENQASM 3;\nqubit[1] q;\nbit[2] c;\nif (c > 1) x q[0];\n`),
  (error) => error.feature === "classical_condition_general",
)

// Unresolvable includes and wrong versions are rejected.
assert.throws(() => parseQasm3(`OPENQASM 3;\ninclude "other.inc";\n`), (error) => error.feature === "include_resolution")
assert.throws(() => parseQasm3(`OPENQASM 2.0;\nqreg q[1];\n`), (error) => error.feature === "version_declaration")

// Out-of-range and undeclared operands fail loudly.
assert.throws(() => parseQasm3(`OPENQASM 3;\nqubit[2] q;\nh q[5];\n`), Qasm3ParseError)
assert.throws(() => parseQasm3(`OPENQASM 3;\nqubit[2] q;\nh r[0];\n`), Qasm3ParseError)

// Deprecated OpenQASM 2 syntax is accepted but reported as a cosmetic loss,
// because the emitted program will not be byte-identical to the input.
const legacy = parseQasm3(`OPENQASM 3;
qreg q[2];
creg c[2];
h q[0];
measure q[0] -> c[0];
`)
assert.equal(legacy.circuit.qubit_registers[0].size, 2)
const legacyFeatures = legacy.loss_report.map((entry) => entry.feature)
assert.ok(legacyFeatures.includes("openqasm2_register_syntax"))
assert.ok(legacyFeatures.includes("openqasm2_measure_syntax"))
assert.ok(legacy.loss_report.every((entry) => entry.severity === "cosmetic"))
// Cosmetic loss must not make runs incomparable.
assert.equal(chainHasSemanticLoss([{ kind: "IMPORT", adapter: "x", adapter_version: "1", loss_report: legacy.loss_report, options: {} }]), false)

// A missing version header is recorded rather than assumed silently.
assert.ok(parseQasm3(`qubit[1] q;\nh q[0];\n`).loss_report.some((entry) => entry.feature === "version_declaration"))

// Comments do not become part of the circuit.
const commented = parseQasm3(`OPENQASM 3;
// leading comment
qubit[1] q; // trailing comment
/* block
   comment */
h q[0];
`).circuit
assert.equal(commented.operations.length, 1)

// Loss reports produced by this adapter validate against the shared contract.
for (const entry of legacy.loss_report) {
  LossReportEntrySchema.parse(entry)
}

// ---------------------------------------------------------------------------
// Engine: statevector simulation, routing, resources (RFC 0001)
// ---------------------------------------------------------------------------

const close = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance

// Parameter expressions are evaluated by a hand-written parser, never eval.
assert.equal(evaluateParameter(0.5), 0.5)
assert.ok(close(evaluateParameter("pi"), Math.PI))
assert.ok(close(evaluateParameter("pi/2"), Math.PI / 2))
assert.ok(close(evaluateParameter("-pi/4"), -Math.PI / 4))
assert.ok(close(evaluateParameter("2*pi"), 2 * Math.PI))
assert.ok(close(evaluateParameter("(1+2)*3"), 9))
assert.ok(close(evaluateParameter("2**3"), 8))
assert.ok(close(evaluateParameter("sqrt(4)"), 2))
assert.ok(close(evaluateParameter("cos(0)"), 1))
assert.throws(() => evaluateParameter("theta"), /no value/)
assert.throws(() => evaluateParameter("1/0"), /Division by zero/)
assert.throws(() => evaluateParameter("nope(1)"), /Unknown function/)
// Anything resembling code execution must be rejected, not evaluated.
assert.throws(() => evaluateParameter("process.exit(1)"))
assert.throws(() => evaluateParameter("(()=>1)()"))

// --- Known-circuit physics -------------------------------------------------

// Bell state: (|00> + |11>)/sqrt(2)
const bellCircuit = parseQasm3(`OPENQASM 3;
qubit[2] q;
h q[0];
cx q[0], q[1];
`).circuit
const bellState = simulateStatevector(bellCircuit)
assert.ok(close(bellState.statevector.real[0], Math.SQRT1_2))
assert.ok(close(bellState.statevector.real[1], 0))
assert.ok(close(bellState.statevector.real[2], 0))
assert.ok(close(bellState.statevector.real[3], Math.SQRT1_2))
assert.ok(bellState.statevector.imaginary.every((value) => close(value, 0)))

// GHZ state on three qubits: (|000> + |111>)/sqrt(2)
const ghzState = simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[3] q;
h q[0];
cx q[0], q[1];
cx q[1], q[2];
`).circuit)
assert.ok(close(ghzState.statevector.real[0], Math.SQRT1_2))
assert.ok(close(ghzState.statevector.real[7], Math.SQRT1_2))
assert.ok(close(ghzState.statevector.real.reduce((sum, value) => sum + value * value, 0), 1))

// Normalization holds for a nontrivial parameterized circuit.
const parameterizedState = simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[3] q;
h q[0];
rx(pi/3) q[1];
ry(0.7) q[2];
cx q[0], q[1];
rz(pi/5) q[2];
cx q[1], q[2];
t q[0];
`).circuit)
const norm = parameterizedState.statevector.real.reduce(
  (sum, value, index) => sum + value * value + parameterizedState.statevector.imaginary[index] ** 2,
  0,
)
assert.ok(close(norm, 1), `statevector must stay normalized, got ${norm}`)

// X gate flips |0> to |1>; little-endian means index 1 is q0 = 1.
const flipped = simulateStatevector(parseQasm3(`OPENQASM 3;\nqubit[1] q;\nx q[0];\n`).circuit)
assert.ok(close(flipped.statevector.real[1], 1))

// rz is a phase gate: it must not change measurement probabilities of |0>.
const rzState = simulateStatevector(parseQasm3(`OPENQASM 3;\nqubit[1] q;\nrz(0.9) q[0];\n`).circuit)
assert.ok(close(Math.hypot(rzState.statevector.real[0], rzState.statevector.imaginary[0]), 1))

// H then H is the identity.
assert.equal(
  checkCircuitEquivalence(
    parseQasm3(`OPENQASM 3;\nqubit[1] q;\nh q[0];\nh q[0];\n`).circuit,
    parseQasm3(`OPENQASM 3;\nqubit[1] q;\nid q[0];\n`).circuit,
  ).level,
  "NUMERICALLY_CHECKED",
)

// X and Z do not commute into each other: a real counterexample, so FAILED.
const notEquivalent = checkCircuitEquivalence(
  parseQasm3(`OPENQASM 3;\nqubit[1] q;\nx q[0];\n`).circuit,
  parseQasm3(`OPENQASM 3;\nqubit[1] q;\nz q[0];\n`).circuit,
)
assert.equal(notEquivalent.level, "FAILED")
assert.ok(notEquivalent.counterexample)

// Global phase is unobservable, so circuits differing only by one are equivalent.
assert.equal(
  checkCircuitEquivalence(
    parseQasm3(`OPENQASM 3;\nqubit[1] q;\nz q[0];\n`).circuit,
    parseQasm3(`OPENQASM 3;\nqubit[1] q;\nrz(pi) q[0];\n`).circuit,
  ).level,
  "NUMERICALLY_CHECKED",
)
// ... and are NOT equivalent once global phase is taken seriously.
assert.equal(
  checkCircuitEquivalence(
    parseQasm3(`OPENQASM 3;\nqubit[1] q;\nz q[0];\n`).circuit,
    parseQasm3(`OPENQASM 3;\nqubit[1] q;\nrz(pi) q[0];\n`).circuit,
    { ignoreGlobalPhase: false },
  ).level,
  "FAILED",
)

// A check that cannot run reports INCONCLUSIVE with a reason -- never FAILED.
const tooWide = checkCircuitEquivalence(
  parseQasm3(`OPENQASM 3;\nqubit[4] q;\nh q[0];\n`).circuit,
  parseQasm3(`OPENQASM 3;\nqubit[4] q;\nx q[0];\n`).circuit,
  { maxQubits: 2 },
)
assert.equal(tooWide.level, "INCONCLUSIVE")
assert.match(tooWide.reason, /not evidence that the circuits differ/)
EquivalenceEvidenceSchema.parse(tooWide)

// Measurement is simulated on the state, so a Bell pair is perfectly correlated:
// "01" and "10" must never appear.
const bellCounts = simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`).circuit, { shots: 2000, seed: 7 })
assert.equal(bellCounts.deterministic, true)
assert.equal(Object.keys(bellCounts.counts).sort().join(","), "00,11")
assert.equal(bellCounts.counts["00"] + bellCounts.counts["11"], 2000)
assert.ok(Math.abs(bellCounts.counts["00"] / 2000 - 0.5) < 0.05)

// Same seed reproduces exactly; a different seed generally does not.
const repeat = simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`).circuit, { shots: 2000, seed: 7 })
assert.deepEqual(repeat.counts, bellCounts.counts)
// An unseeded run is honest about not being reproducible.
assert.equal(simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[1] q;
bit[1] c;
h q[0];
c[0] = measure q[0];
`).circuit, { shots: 10 }).deterministic, false)

// Mid-circuit measurement and feed-forward actually branch.
// q0 is flipped to |1>, measured, and the condition then flips q1.
const feedForward = simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[2] q;
bit[1] c;
x q[0];
c[0] = measure q[0];
if (c == 1) x q[1];
`).circuit, { shots: 50, seed: 3 })
assert.equal(Object.keys(feedForward.counts).length, 1)
assert.equal(Object.keys(feedForward.counts)[0], "1")

// Reset returns a qubit to |0> regardless of what preceded it.
const afterReset = simulateStatevector(parseQasm3(`OPENQASM 3;
qubit[1] q;
bit[1] c;
x q[0];
reset q[0];
c[0] = measure q[0];
`).circuit, { shots: 100, seed: 11 })
assert.deepEqual(Object.keys(afterReset.counts), ["0"])

// Unsupported gates are rejected, not approximated into something else.
assert.throws(
  () => simulateStatevector(parseQasm3(`OPENQASM 3;\nqubit[1] q;\niswap q[0];\n`).circuit),
  /not supported by the statevector backend/,
)

// --- Differential verification --------------------------------------------

const agreeing = compareShotResults(
  { backend: "a", counts: { "00": 500, "11": 500 }, shots: 1000 },
  { backend: "b", counts: { "00": 510, "11": 490 }, shots: 1000 },
)
assert.equal(agreeing.agreed, true)
const disagreeing = compareShotResults(
  { backend: "a", counts: { "00": 1000 }, shots: 1000 },
  { backend: "b", counts: { "11": 1000 }, shots: 1000 },
)
assert.equal(disagreeing.agreed, false)
// A disagreement is recorded as a disagreement, not as a verdict on either side.
assert.match(disagreeing.detail, /does not establish which backend is correct/)

// --- Hardware profiles and routing ----------------------------------------

const linearDevice = HardwareProfileSchema.parse({
  schema_version: "0.1",
  provider: "simulator",
  backend: "linear-5",
  snapshot_id: "2026-07-28T00:00:00Z",
  modality: "SIMULATED",
  qubit_count: 5,
  native_gates: ["h", "x", "rz", "cx", "swap"],
  basis_two_qubit_gate: "cx",
  couplings: linearTopology(5),
  qubits: Array.from({ length: 5 }, (_unused, index) => ({ index, operational: true })),
  capabilities: { mid_circuit_measurement: true, feed_forward: true, reset: true },
  retrieved_at: "2026-07-28T00:00:00Z",
  source: "synthetic topology for tests",
})

const adjacency = couplingAdjacency(linearDevice)
assert.deepEqual([...(adjacency.get(0) ?? [])], [1])
assert.deepEqual([...(adjacency.get(2) ?? [])].sort(), [1, 3])
assert.deepEqual(shortestPath(adjacency, 0, 4), [0, 1, 2, 3, 4])
assert.equal(shortestPath(adjacency, 0, 0).length, 1)

// A gate between distant qubits must gain SWAPs on a line.
const distant = parseQasm3(`OPENQASM 3;\nqubit[5] q;\ncx q[0], q[4];\n`).circuit
const routed = transpileForHardware(distant, linearDevice)
assert.ok(routed.swap_count >= 3, `expected SWAPs on a line, got ${routed.swap_count}`)
assert.equal(routed.two_qubit_gate_count, 1)

// Every two-qubit gate in the routed circuit acts on a coupled pair -- the
// property routing exists to establish.
for (const operation of routed.circuit.operations) {
  if (operation.kind === "gate" && operation.qubits.length === 2) {
    const [a, b] = operation.qubits.map((bit) => bit.index)
    assert.ok(adjacency.get(a)?.has(b), `gate ${operation.name} on uncoupled pair ${a},${b}`)
  }
}

// An already-adjacent gate needs no routing at all.
assert.equal(transpileForHardware(parseQasm3(`OPENQASM 3;\nqubit[2] q;\ncx q[0], q[1];\n`).circuit, linearDevice).swap_count, 0)

// Routing preserves the circuit up to the recorded permutation, and says so
// rather than claiming a proof it has not performed.
assert.equal(routed.transformation.equivalence.level, "NOT_CHECKED")
CircuitTransformationSchema.parse(routed.transformation)

// A circuit too wide for the device is refused.
assert.throws(
  () => transpileForHardware(parseQasm3(`OPENQASM 3;\nqubit[9] q;\nh q[0];\n`).circuit, linearDevice),
  /has 5/,
)

// A device without feed-forward records a semantic loss rather than dropping
// the condition and emitting the body unconditionally.
const noFeedForward = HardwareProfileSchema.parse({
  ...linearDevice,
  backend: "no-feedforward",
  capabilities: { mid_circuit_measurement: false, feed_forward: false, reset: false },
})
const conditionalCircuit = parseQasm3(`OPENQASM 3;
qubit[2] q;
bit[1] c;
c[0] = measure q[0];
if (c == 1) x q[1];
`).circuit
const withLoss = transpileForHardware(conditionalCircuit, noFeedForward)
assert.ok(withLoss.loss_report.some((entry) => entry.feature === "classical_feed_forward" && entry.severity === "semantic"))
assert.equal(chainHasSemanticLoss([withLoss.transformation]), true)
// The same circuit on a capable device carries no semantic loss.
assert.equal(chainHasSemanticLoss([transpileForHardware(conditionalCircuit, linearDevice).transformation]), false)

// --- Resource estimation ---------------------------------------------------

const resourceCircuit = parseQasm3(`OPENQASM 3;
qubit[3] q;
bit[1] c;
h q[0];
t q[1];
cx q[0], q[1];
ccx q[0], q[1], q[2];
reset q[2];
barrier q[0], q[1];
c[0] = measure q[0];
`).circuit
const estimate = estimateResources(resourceCircuit)
NormalizedResourceEstimateSchema.parse(estimate)
assert.equal(estimate.nisq.logical_qubits, 3)
assert.equal(estimate.nisq.two_qubit_gate_count, 1)
assert.equal(estimate.nisq.measurement_count, 1)
assert.equal(estimate.nisq.reset_count, 1)
assert.equal(estimate.nisq.barrier_count, 1)
assert.equal(estimate.fault_tolerant.t_count, 1)
assert.equal(estimate.fault_tolerant.toffoli_count, 1)
assert.ok(estimate.nisq.circuit_depth > 0)
// Assumptions travel with the numbers.
assert.equal(estimate.assumptions.estimator, RESOURCE_ESTIMATOR)
assert.ok(estimate.assumptions.gate_set.includes("ccx"))
assert.ok(estimate.assumptions.notes.some((note) => /No hardware snapshot/.test(note)))
// Without characterized errors, fidelity and duration are absent rather than guessed.
assert.equal(estimate.nisq.estimated_success_probability, undefined)
assert.equal(estimate.nisq.estimated_duration_ns, undefined)

// Estimates under different assumptions are refused for comparison, and there
// is deliberately no function that averages them.
assert.equal(resourceEstimatesComparable(estimate, estimate).comparable, true)
const otherEstimator = { ...estimate, assumptions: { ...estimate.assumptions, estimator: "qualtran" } }
const refusal = resourceEstimatesComparable(estimate, otherEstimator)
assert.equal(refusal.comparable, false)
assert.match(refusal.reasons.join(" "), /define\s+these quantities differently/)

// ---------------------------------------------------------------------------
// ZX-calculus optimization (RFC 0002)
// ---------------------------------------------------------------------------

const zxCircuit = (source) => parseQasm3(source).circuit

// H H cancels to nothing, and the result is *checked*, not asserted.
const hadamardPair = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[1] q;\nh q[0];\nh q[0];\n`))
assert.equal(hadamardPair.after.gate_count, 0)
assert.equal(hadamardPair.equivalence.level, "NUMERICALLY_CHECKED")
assert.ok(hadamardPair.rewrites.some((entry) => entry.rewrite === "hadamard_pair_cancellation"))

// Self-inverse two-qubit gates cancel too.
const cxPair = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[2] q;\ncx q[0], q[1];\ncx q[0], q[1];\n`))
assert.equal(cxPair.after.two_qubit_gate_count, 0)
assert.equal(cxPair.equivalence.level, "NUMERICALLY_CHECKED")

// Adjacent rotations about the same axis fuse.
const fused = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[1] q;\nrz(0.3) q[0];\nrz(0.4) q[0];\n`))
assert.equal(fused.after.gate_count, 1)
assert.ok(Math.abs(fused.circuit.operations[0].parameters[0] - 0.7) < 1e-12)
assert.equal(fused.equivalence.level, "NUMERICALLY_CHECKED")
assert.ok(fused.rewrites.some((entry) => entry.rewrite === "phase_fusion"))

// Rotations summing to zero vanish entirely.
const cancelled = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[1] q;\nrz(0.5) q[0];\nrz(-0.5) q[0];\n`))
assert.equal(cancelled.after.gate_count, 0)
assert.equal(cancelled.equivalence.level, "NUMERICALLY_CHECKED")

// Explicit identities and zero-angle rotations are removed.
const identities = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[1] q;\nid q[0];\nrz(0) q[0];\nx q[0];\n`))
assert.equal(identities.after.gate_count, 1)
assert.equal(identities.equivalence.level, "NUMERICALLY_CHECKED")

// A gate between the pair blocks cancellation, because the pair is no longer
// adjacent on that qubit.
const blocked = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[1] q;\nh q[0];\nx q[0];\nh q[0];\n`))
assert.equal(blocked.after.gate_count, 3)
assert.equal(blocked.equivalence.level, "NUMERICALLY_CHECKED")

// Gates on disjoint qubits are not mistaken for a cancelling pair.
const disjoint = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[2] q;\nh q[0];\nh q[1];\n`))
assert.equal(disjoint.after.gate_count, 2)

// A measurement between two gates blocks rewriting across it. Optimizing
// across a measurement is not an optimization -- it changes the program.
const acrossMeasure = optimizeWithZx(zxCircuit(`OPENQASM 3;
qubit[1] q;
bit[1] c;
h q[0];
c[0] = measure q[0];
h q[0];
`))
assert.equal(acrossMeasure.after.gate_count, 2, "must not cancel H pair across a measurement")

// A free parameter cannot be fused numerically, and guessing a value would
// change the circuit, so the rotation is left alone.
const freeParameter = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[1] q;\nrz(theta) q[0];\nrz(theta) q[0];\n`))
assert.equal(freeParameter.after.gate_count, 2)

// A larger circuit reduces and stays verifiably equivalent.
const larger = optimizeWithZx(zxCircuit(`OPENQASM 3;
qubit[3] q;
h q[0];
h q[0];
rz(0.2) q[1];
rz(0.3) q[1];
cx q[0], q[2];
cx q[0], q[2];
id q[1];
x q[2];
`))
assert.ok(larger.after.gate_count < larger.before.gate_count)
assert.equal(larger.after.two_qubit_gate_count, 0)
assert.equal(larger.equivalence.level, "NUMERICALLY_CHECKED")
assert.ok(larger.before.depth >= larger.after.depth)

// Above the verification width, equivalence is INCONCLUSIVE with a reason --
// never a claim that the rewrite was verified, and never FAILED.
const unverified = optimizeWithZx(zxCircuit(`OPENQASM 3;\nqubit[4] q;\nh q[0];\nh q[0];\n`), {
  maxVerificationQubits: 2,
})
assert.equal(unverified.equivalence.level, "INCONCLUSIVE")
assert.match(unverified.equivalence.reason, /not evidence that the circuits differ/)
EquivalenceEvidenceSchema.parse(unverified.equivalence)

// The transformation record validates against the shared contract and carries
// the rewrite set that was actually available.
CircuitTransformationSchema.parse(larger.transformation)
assert.equal(larger.transformation.kind, "ZX_REWRITE")
assert.deepEqual(larger.transformation.options.supported_rewrites, [...SUPPORTED_REWRITES])

// An optimization is only usable downstream if its equivalence evidence says so.
assert.equal(chainHasSemanticLoss([larger.transformation]), false)

// ---------------------------------------------------------------------------
// Noise and error mitigation (RFC 0001)
// ---------------------------------------------------------------------------

const mitCircuit = (source) => parseQasm3(source).circuit
const identityChain = mitCircuit(`OPENQASM 3;
qubit[1] q;
bit[1] c;
h q[0];
h q[0];
h q[0];
h q[0];
c[0] = measure q[0];
`)
const depolarizing = { model: "depolarizing", one_qubit_error: 0.02, two_qubit_error: 0, readout_error: 0 }

// The circuit is the identity, so the ideal expectation is exactly +1.
const idealCounts = simulateStatevector(identityChain, { shots: 4000, seed: 1 })
assert.equal(expectationFromCounts(idealCounts.counts, 0).value, 1)

// Noise degrades it, and the noise model is recorded on the result so a noisy
// run cannot be mistaken for an ideal one.
const noisyRun = simulateStatevector(identityChain, { shots: 4000, seed: 1, noise: depolarizing })
const noisyValue = expectationFromCounts(noisyRun.counts, 0).value
assert.ok(noisyValue < 1, "depolarizing noise must degrade the expectation")
assert.ok(noisyValue > 0.5, `noise should be modest at p=0.02, got ${noisyValue}`)
assert.deepEqual(noisyRun.noise, depolarizing)

// A noisy run is still exactly reproducible from its seed.
assert.deepEqual(
  simulateStatevector(identityChain, { shots: 4000, seed: 1, noise: depolarizing }).counts,
  noisyRun.counts,
)

// A noiseless model leaves the result untouched and records no noise.
assert.equal(
  simulateStatevector(identityChain, {
    shots: 200,
    seed: 1,
    noise: { model: "depolarizing", one_qubit_error: 0, two_qubit_error: 0, readout_error: 0 },
  }).noise,
  undefined,
)

// A noise model without shots is refused rather than silently returning the
// noiseless state under a noisy label.
assert.throws(
  () => simulateStatevector(mitCircuit(`OPENQASM 3;\nqubit[1] q;\nh q[0];\n`), { noise: depolarizing }),
  /requires a positive shot count/,
)

// Readout error flips outcomes.
const readoutNoisy = simulateStatevector(identityChain, {
  shots: 4000,
  seed: 5,
  noise: { model: "depolarizing", one_qubit_error: 0, two_qubit_error: 0, readout_error: 0.1 },
})
assert.ok(Math.abs(expectationFromCounts(readoutNoisy.counts, 0).value - 0.8) < 0.05)

// --- Unitary folding -------------------------------------------------------

const foldBase = mitCircuit(`OPENQASM 3;\nqubit[1] q;\nbit[1] c;\nrz(0.3) q[0];\nh q[0];\nc[0] = measure q[0];\n`)
assert.equal(foldCircuit(foldBase, 1), foldBase)
const folded3 = foldCircuit(foldBase, 3)
// Two gates fold to six; the measurement is not folded.
assert.equal(folded3.operations.filter((operation) => operation.kind === "gate").length, 6)
assert.equal(folded3.operations.filter((operation) => operation.kind === "measure").length, 1)

// Folding preserves the ideal unitary, which the equivalence checker confirms.
const unmeasured = mitCircuit(`OPENQASM 3;\nqubit[1] q;\nrz(0.3) q[0];\nh q[0];\n`)
assert.equal(checkCircuitEquivalence(unmeasured, foldCircuit(unmeasured, 3)).level, "NUMERICALLY_CHECKED")
assert.equal(checkCircuitEquivalence(unmeasured, foldCircuit(unmeasured, 5)).level, "NUMERICALLY_CHECKED")

// Even and fractional scale factors are refused rather than rounded, because a
// silently adjusted scale makes the reported factor a lie.
assert.throws(() => foldCircuit(foldBase, 2), /odd integer scale factors/)
assert.throws(() => foldCircuit(foldBase, 1.5), /odd integer scale factors/)
assert.throws(() => foldCircuit(foldBase, 0), /odd integer scale factors/)

// A gate with no known inverse is refused, not approximated.
assert.throws(
  () => foldCircuit(mitCircuit(`OPENQASM 3;\nqubit[1] q;\nu2(0.1, 0.2) q[0];\n`), 3),
  /Cannot invert gate/,
)

// --- Zero-noise extrapolation ---------------------------------------------

const zne = zeroNoiseExtrapolation(identityChain, depolarizing, {
  shots: 8000,
  seed: 7,
  scaleFactors: [1, 3, 5],
})
assert.equal(zne.method, "zero_noise_extrapolation")
// Raw is retained alongside the mitigated estimate; a mitigated number is a
// model-dependent estimate, not a measurement.
assert.ok(zne.raw_value < 1)
assert.equal(zne.data_points.length, 3)
assert.equal(zne.total_shots, 24000)
// The ZNE premise: the observable degrades monotonically with noise scale.
assert.ok(zne.data_points[0].value > zne.data_points[1].value)
assert.ok(zne.data_points[1].value > zne.data_points[2].value)
// Extrapolation recovers close to the ideal value of 1.
assert.ok(Math.abs(zne.mitigated_value - 1) < 0.1, `ZNE should approach 1, got ${zne.mitigated_value}`)
assert.ok(zne.mitigated_value > zne.raw_value, "mitigation should move the estimate toward the ideal")
assert.ok(zne.assumptions.some((entry) => /not a measurement/.test(entry)))
CircuitTransformationSchema.parse(zne.transformation)

// Scale factors must include 1, which anchors the fit to the raw result.
assert.throws(() => zeroNoiseExtrapolation(identityChain, depolarizing, { scaleFactors: [3, 5] }), /must include 1/)

// An unphysical extrapolation is reported, not clamped into a plausible number.
const unphysical = zeroNoiseExtrapolation(identityChain, depolarizing, {
  shots: 4000,
  seed: 3,
  scaleFactors: [1, 3, 5],
  extrapolation: "linear",
})
if (unphysical.mitigated_value > 1) {
  assert.ok(unphysical.warnings.some((warning) => /outside the physical range/.test(warning)))
}

// --- Readout mitigation ----------------------------------------------------

const readoutCorrected = mitigateReadout({ "0": 900, "1": 100 }, { p0_given_0: 0.95, p1_given_1: 0.95 }, 0)
assert.equal(readoutCorrected.method, "readout_error_mitigation")
assert.ok(Math.abs(readoutCorrected.raw_value - 0.8) < 1e-9)
// Correcting for 5% symmetric readout error scales 0.8 up toward 0.889.
assert.ok(readoutCorrected.mitigated_value > readoutCorrected.raw_value)
assert.ok(Math.abs(readoutCorrected.mitigated_value - 0.8 / 0.9) < 1e-9)

// A singular confusion matrix means readout carries no information, so no
// correction is possible and the raw value is returned with a warning.
const singular = mitigateReadout({ "0": 500, "1": 500 }, { p0_given_0: 0.5, p1_given_1: 0.5 }, 0)
assert.equal(singular.mitigated_value, singular.raw_value)
assert.ok(singular.warnings.some((warning) => /singular/.test(warning)))
assert.ok(singular.assumptions.some((entry) => /not a measurement/.test(entry)))

// ---------------------------------------------------------------------------
// CLI and MCP (RFC 0005: read-only by default, structured output)
// ---------------------------------------------------------------------------

const BELL_QASM = `OPENQASM 3;
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`

const cliFixture = new URL("./fixtures-cli-bell.qasm", import.meta.url)
fs.writeFileSync(cliFixture, BELL_QASM)

// Every command returns one structured object; no command prints prose to stdout.
const inspect = await runCli(["circuit", "inspect", cliFixture.pathname])
assert.equal(inspect.exitCode, 0)
assert.equal(inspect.stdout.command, "circuit.inspect")
assert.equal(inspect.stdout.summary.qubits, 2)
assert.equal(inspect.stdout.summary.two_qubit_gate_count, 1)

const simulated = await runCli(["simulate", cliFixture.pathname, "--shots", "500", "--seed", "3"])
assert.equal(simulated.exitCode, 0)
assert.equal(simulated.stdout.deterministic, true)
assert.deepEqual(Object.keys(simulated.stdout.counts).sort(), ["00", "11"])

// An unparseable circuit fails with the feature named, not a bare stack trace.
fs.writeFileSync(cliFixture, "OPENQASM 3;\nqubit[1] q;\nfor int i in [0:3] { h q[0]; }\n")
const rejected = await runCli(["circuit", "inspect", cliFixture.pathname])
assert.equal(rejected.exitCode, 1)
assert.equal(rejected.stdout.error, "qasm_parse_error")
assert.equal(rejected.stdout.feature, "control_flow_loop")
fs.writeFileSync(cliFixture, BELL_QASM)

// Unknown commands and missing arguments exit 2 with usage on stderr.
assert.equal((await runCli(["not-a-command"])).exitCode, 2)
assert.equal((await runCli(["simulate"])).exitCode, 2)
assert.equal((await runCli([])).exitCode, 2)
assert.ok((await runCli(["help"])).stderr.includes("ketqat-engine"))

// A FAILED equivalence is a finding, not a tool error, so it still exits 0.
const leftFixture = new URL("./fixtures-cli-x.qasm", import.meta.url)
const rightFixture = new URL("./fixtures-cli-z.qasm", import.meta.url)
fs.writeFileSync(leftFixture, "OPENQASM 3;\nqubit[1] q;\nx q[0];\n")
fs.writeFileSync(rightFixture, "OPENQASM 3;\nqubit[1] q;\nz q[0];\n")
const equivalence = await runCli(["equivalence", leftFixture.pathname, rightFixture.pathname])
assert.equal(equivalence.exitCode, 0)
assert.equal(equivalence.stdout.evidence.level, "FAILED")
assert.ok(equivalence.stdout.evidence.counterexample)

// mitigate zne refuses to run without a noise model rather than silently
// mitigating against nothing.
assert.equal((await runCli(["mitigate", "zne", cliFixture.pathname])).exitCode, 2)

fs.rmSync(cliFixture); fs.rmSync(leftFixture); fs.rmSync(rightFixture)

// --- MCP -------------------------------------------------------------------

// Every advertised tool is read-only. A tool that spends money or mutates state
// is not defined in this module at all, so it cannot leak out by accident.
const tools = listTools()
assert.ok(tools.length >= 7)
assert.ok(tools.every((tool) => tool.readOnly === true), "every MCP tool must be read-only")
assert.ok(tools.every((tool) => tool.name && tool.title && tool.description))

// Structured output, not prose.
const mcpInspect = callTool("inspect_circuit", { qasm: BELL_QASM })
assert.equal(mcpInspect.qubits, 2)
assert.equal(mcpInspect.two_qubit_gate_count, 1)
assert.deepEqual(mcpInspect.loss_report, [])

const mcpSimulate = callTool("simulate_circuit", { qasm: BELL_QASM, shots: 400, seed: 11 })
assert.equal(mcpSimulate.deterministic, true)
assert.deepEqual(Object.keys(mcpSimulate.counts).sort(), ["00", "11"])

const mcpEquivalence = callTool("check_circuit_equivalence", {
  left_qasm: "OPENQASM 3;\nqubit[1] q;\nh q[0];\nh q[0];\n",
  right_qasm: "OPENQASM 3;\nqubit[1] q;\nid q[0];\n",
})
assert.equal(mcpEquivalence.level, "NUMERICALLY_CHECKED")

const mcpZx = callTool("optimize_with_zx", { qasm: "OPENQASM 3;\nqubit[1] q;\nh q[0];\nh q[0];\n" })
assert.equal(mcpZx.after.gate_count, 0)
assert.equal(mcpZx.equivalence.level, "NUMERICALLY_CHECKED")

// Errors are structured too, and name the offending feature.
const mcpBad = callTool("inspect_circuit", { qasm: "OPENQASM 3;\nqubit[1] q;\ndefcal x $0 { }\n" })
assert.equal(mcpBad.error, "qasm_parse_error")
assert.equal(mcpBad.feature, "pulse_calibration")

assert.equal(callTool("delete_everything", {}).error, "unknown_tool")
assert.equal(callTool("simulate_circuit", { qasm: "" }).error, "invalid_input")
// A shot count beyond the declared cap is refused by the input schema rather
// than accepted and run.
assert.equal(callTool("simulate_circuit", { qasm: BELL_QASM, shots: 10_000_000 }).error, "invalid_input")

// --- Registry commands (A1) -------------------------------------------------

// Registry commands need a URL, and say where to put it.
const noRegistry = await runCli(["search", "grover"])
assert.equal(noRegistry.exitCode, 2)
assert.match(noRegistry.stderr, /--registry <url> or set KETQAT_URL/)

// A push without a token refuses, and explains why the token is not a flag.
const previousToken = process.env.KETQAT_TOKEN
delete process.env.KETQAT_TOKEN
const cardFixture = new URL("./fixtures-cli-card.json", import.meta.url)
fs.writeFileSync(
  cardFixture,
  JSON.stringify({
    schema_version: "0.1",
    name: "Surface code memory",
    slug: "surface-code-memory",
    version: "0.1.0",
    artifact_type: "QEC_CODE",
    description: "Rotated surface code memory experiment.",
    problem_definition: "Preserve one logical qubit for d rounds under circuit-level noise.",
    provenance: { license: "Apache-2.0", authors: ["A. Researcher"] },
    assumptions: { noise: ["Uniform circuit-level depolarizing noise"] },
    known_limitations: ["None identified"],
  }),
)
const noToken = await runCli(["push", "surface-code-memory", cardFixture.pathname, "--registry", "https://example.test"])
assert.equal(noToken.exitCode, 2)
assert.match(noToken.stderr, /KETQAT_TOKEN/)
// The reason matters: a flag would leak the token into shell history.
assert.match(noToken.stderr, /shell history/)

// Usage errors are reported before any network call is attempted.
assert.equal((await runCli(["push", "only-a-slug"])).exitCode, 2)
assert.equal((await runCli(["pull"])).exitCode, 2)
assert.equal((await runCli(["search"])).exitCode, 2)

fs.rmSync(cardFixture)
if (previousToken !== undefined) process.env.KETQAT_TOKEN = previousToken

// The client validates a Quantum Card locally before publishing, so an invalid
// card fails with the offending field rather than a bare 400 from the server.
const publishClient = new KetQatClient({
  baseUrl: "https://example.test",
  token: "kq_test",
  fetch: async () => {
    throw new Error("network should not be reached for an invalid card")
  },
})
await assert.rejects(
  () => publishClient.artifactVersions.publish("slug", { version: "0.1.0", quantum_card: { name: "incomplete" } }),
  (error) => /known_limitations|assumptions|Required/i.test(error.message),
)

// A server error message is surfaced rather than reduced to a status code.
const failingClient = new KetQatClient({
  baseUrl: "https://example.test",
  token: "kq_test",
  fetch: async () =>
    new Response(JSON.stringify({ error: "That version already exists and cannot be overwritten." }), {
      status: 409,
      statusText: "Conflict",
      headers: { "content-type": "application/json" },
    }),
})
await assert.rejects(
  () => failingClient.artifacts.get("slug"),
  (error) => /409/.test(error.message) && /already exists/.test(error.message),
)

// ---------------------------------------------------------------------------
// Execution plane (H2): jobs cannot express arbitrary code
// ---------------------------------------------------------------------------

const baseJob = {
  schema_version: "0.1",
  job_id: "job-1",
  idempotency_key: "key-1",
  submitted_by: "alice",
  parameters: {
    operation: "simulate",
    qasm: "OPENQASM 3;\nqubit[2] q;\nbit[2] c;\nh q[0];\ncx q[0], q[1];\nc[0] = measure q[0];\nc[1] = measure q[1];\n",
  },
}

// A valid job names an approved operation and supplies jobValidated parameters.
const jobValidated = validateJob(baseJob)
assert.equal(jobValidated.parameters.operation, "simulate")
// Limits are applied by default rather than left unbounded.
assert.ok(jobValidated.limits.timeout_seconds > 0)
assert.ok(jobValidated.limits.max_qubits > 0)
assert.ok(jobValidated.limits.max_result_bytes > 0)

// The security model is the shape: a job has no field for code, and one cannot
// be smuggled in at any depth. Each forbidden field is rejected individually.
for (const field of FORBIDDEN_JOB_FIELDS) {
  assert.throws(
    () => validateJob({ ...baseJob, [field]: "anything" }),
    (error) => error instanceof JobRejectedError && new RegExp(field, "i").test(error.message),
    `a job carrying '${field}' at the top level must be rejected`,
  )
  // ... including nested, where a shallow check would miss it.
  assert.throws(
    () => validateJob({ ...baseJob, parameters: { ...baseJob.parameters, nested: { deeper: { [field]: "x" } } } }),
    (error) => error instanceof JobRejectedError,
    `a job carrying '${field}' nested three levels deep must be rejected`,
  )
}

// An unapproved operation cannot be requested.
assert.throws(
  () => validateJob({ ...baseJob, parameters: { operation: "run_arbitrary_python", qasm: "x" } }),
  JobRejectedError,
)

// Limits are enforced against the job's own parameters, not just declared.
assert.throws(
  () =>
    assertWithinLimits(
      validateJob({
        ...baseJob,
        parameters: { ...baseJob.parameters, shots: 500_000 },
        limits: { timeout_seconds: 60, max_qubits: 10, max_shots: 1000, max_result_bytes: 1000 },
      }),
    ),
  /above this job's limit/,
)

// --- Execution -------------------------------------------------------------

const jobSimulateResult = await executeJob(
  validateJob({ ...baseJob, parameters: { ...baseJob.parameters, shots: 500, seed: 5 } }),
)
assert.equal(jobSimulateResult.status, "SUCCEEDED")
// A sandboxed result is always SIMULATION, so it can never be read as hardware.
assert.equal(jobSimulateResult.execution_class, "SIMULATION")
assert.deepEqual(Object.keys(jobSimulateResult.output.counts).sort(), ["00", "11"])
assert.ok(jobSimulateResult.duration_ms >= 0)
JobResultSchema.parse(jobSimulateResult)

// A circuit above the job's qubit limit fails with an explanation, and the
// failure is a result record rather than an exception escaping the worker.
const jobTooWide = await executeJob(
  validateJob({
    ...baseJob,
    parameters: {
      operation: "simulate",
      qasm: "OPENQASM 3;\nqubit[8] q;\nbit[1] c;\nh q[0];\nc[0] = measure q[0];\n",
      shots: 10,
    },
    limits: { timeout_seconds: 60, max_qubits: 4, max_shots: 1000, max_result_bytes: 1_000_000 },
  }),
)
assert.equal(jobTooWide.status, "FAILED")
assert.match(jobTooWide.error, /above this job's limit/)

// A parse failure is summarized, never a raw stack trace.
const jobBadCircuit = await executeJob(
  validateJob({ ...baseJob, parameters: { operation: "optimize_zx", qasm: "OPENQASM 3;\nqubit[1] q;\ndefcal x $0 { }\n" } }),
)
assert.equal(jobBadCircuit.status, "FAILED")
assert.match(jobBadCircuit.error, /could not be parsed/)
assert.doesNotMatch(jobBadCircuit.error, /at .*\.js:\d+/)

// Every approved operation runs.
const jobZx = await executeJob(
  validateJob({ ...baseJob, parameters: { operation: "optimize_zx", qasm: "OPENQASM 3;\nqubit[1] q;\nh q[0];\nh q[0];\n" } }),
)
assert.equal(jobZx.status, "SUCCEEDED")
assert.equal(jobZx.output.equivalence.level, "NUMERICALLY_CHECKED")

const jobEquivalence = await executeJob(
  validateJob({
    ...baseJob,
    parameters: {
      operation: "check_equivalence",
      left_qasm: "OPENQASM 3;\nqubit[1] q;\nx q[0];\n",
      right_qasm: "OPENQASM 3;\nqubit[1] q;\nz q[0];\n",
    },
  }),
)
assert.equal(jobEquivalence.status, "SUCCEEDED")
assert.equal(jobEquivalence.output.evidence.level, "FAILED")

const jobResources = await executeJob(
  validateJob({ ...baseJob, parameters: { operation: "estimate_resources", qasm: "OPENQASM 3;\nqubit[2] q;\nt q[0];\ncx q[0], q[1];\n" } }),
)
assert.equal(jobResources.status, "SUCCEEDED")
assert.equal(jobResources.output.fault_tolerant.t_count, 1)

// An jobOversized result is failed rather than truncated: a partial scientific
// result is worse than none.
const jobOversized = enforceResultSize(jobSimulateResult, 10)
assert.equal(jobOversized.status, "FAILED")
assert.equal(jobOversized.output, undefined)
assert.match(jobOversized.error, /rather than\s*truncated/)
// A result within the limit passes through untouched.
assert.deepEqual(enforceResultSize(jobSimulateResult, 5_000_000), jobSimulateResult)

// Sampling a circuit with no classical bits is refused rather than returning a
// histogram of empty outcomes that looks like data.
assert.throws(
  () => simulateStatevector(parseQasm3("OPENQASM 3;\nqubit[2] q;\nh q[0];\n").circuit, { shots: 100, seed: 1 }),
  /nothing to sample/,
)

// ---------------------------------------------------------------------------
// BYOC provider adapter (H3)
// ---------------------------------------------------------------------------

const byocCircuit = parseQasm3(
  "OPENQASM 3;\nqubit[3] q;\nbit[3] c;\nh q[0];\ncx q[0], q[2];\nc[0] = measure q[0];\nc[2] = measure q[2];\n",
).circuit
const provider = resolveProvider(REFERENCE_PROVIDER)

// A provider is rejected rather than defaulted, so a submission cannot silently
// go somewhere other than where it was addressed.
assert.throws(() => resolveProvider("ibm-quantum"), /Unknown provider/)
assert.throws(() => resolveProvider("ibm-quantum"), /rather than defaulted/)

// The backend snapshot is available before any spend, and states what it is.
const byocProfile = await provider.describeBackend("line-5")
assert.equal(byocProfile.provider, REFERENCE_PROVIDER)
assert.equal(byocProfile.qubit_count, 5)
assert.match(byocProfile.source, /[Nn]ot an observation of any physical device/)
await assert.rejects(() => provider.describeBackend("no-such-backend"), /Unknown backend/)

// --- Confirmation before spend ---------------------------------------------

const byocEstimate = await provider.estimate(byocCircuit, "line-5", 1000)
assert.equal(byocEstimate.shots, 1000)
assert.equal(byocEstimate.estimated_cost.currency, "USD")
assert.match(byocEstimate.confirmation_prompt, /1000 shots/)
assert.match(byocEstimate.confirmation_prompt, /Estimated cost/)
assert.match(byocEstimate.confirmation_prompt, /Remaining quota/)
// The user is told this costs money.
assert.match(byocEstimate.confirmation_prompt, /billed for/)
assert.ok(byocEstimate.warnings.some((warning) => /contract-test adapter/.test(warning)))

// An unknown cost is reported as unknown, never rendered as free.
const unknownCost = await provider.estimate(byocCircuit, "line-9", 500)
assert.equal(unknownCost.estimated_cost, null)
assert.match(unknownCost.confirmation_prompt, /Estimated cost: unknown/)
assert.ok(unknownCost.warnings.some((warning) => /not the same as free/.test(warning)))

// --- NOT_RUN rather than an imitation result -------------------------------

// No credential: recorded as not run, with no counts at all.
const noCredential = await provider.submit(byocCircuit, "line-5", 100, { confirmed: true })
assert.equal(noCredential.status, "NOT_RUN")
assert.equal(noCredential.reason, "credentials_unavailable")
assert.equal(noCredential.counts, undefined)
assert.match(noCredential.detail, /rather than simulated in place of a hardware result/)
NotRunRecordSchema.parse(noCredential)

// Unconfirmed: also not run, and the reason is distinct from the above.
const unconfirmed = await provider.submit(byocCircuit, "line-5", 100, {
  credential: { token: "kq_provider_secret" },
  confirmed: false,
})
assert.equal(unconfirmed.status, "NOT_RUN")
assert.equal(unconfirmed.reason, "confirmation_declined")
assert.equal(unconfirmed.counts, undefined)

// Exhausted quota: not run rather than a failed submission that still bills.
const exhausted = await provider.submit(byocCircuit, "exhausted", 100, {
  credential: { token: "kq_provider_secret" },
  confirmed: true,
})
assert.equal(exhausted.status, "NOT_RUN")
assert.equal(exhausted.reason, "quota_exhausted")

// --- A completed contract-test submission is never labelled HARDWARE -------

const submitted = await provider.submit(byocCircuit, "line-5", 200, {
  credential: { token: "kq_provider_secret" },
  confirmed: true,
})
assert.equal(submitted.status, "COMPLETED")
// The whole point: a contract-test adapter cannot produce a hardware result.
assert.equal(submitted.execution_class, "SIMULATION")
assert.notEqual(submitted.execution_class, "HARDWARE")
// The result records which device snapshot it was compiled against.
assert.equal(submitted.hardware_snapshot_id, "contract-test-line-5")
assert.ok(Object.keys(submitted.counts).length > 0)
ProviderSubmissionSchema.parse(submitted)

// The credential is an argument, never adapter state, so nothing holds it.
assert.equal(JSON.stringify(provider).includes("kq_provider_secret"), false)
assert.equal(JSON.stringify(submitted).includes("kq_provider_secret"), false)
assert.equal(JSON.stringify(noCredential).includes("kq_provider_secret"), false)

// --- Redaction --------------------------------------------------------------

// A stack trace or debug dump carrying a token is a normal accident, so
// redaction is a function rather than a rule reviewers must remember.
const redacted = redactCredentials({
  provider: "ibm",
  credential: { token: "kq_secret", scope: "project" },
  nested: { deeper: { api_key: "AKIA-secret", authorization: "Bearer abc" } },
  list: [{ password: "hunter2" }],
  harmless: "visible",
})
const serialized = JSON.stringify(redacted)
for (const secret of ["kq_secret", "AKIA-secret", "Bearer abc", "hunter2"]) {
  assert.equal(serialized.includes(secret), false, `'${secret}' must be redacted`)
}
assert.match(serialized, /\[redacted\]/)
// Non-secret values survive, so redaction stays useful for debugging.
assert.match(serialized, /visible/)
assert.match(serialized, /ibm/)

// ---------------------------------------------------------------------------
// Worker callback transport
//
// The worker holds no secret: it authenticates as its own service account with
// a token minted per call. These cases pin the parts of that arrangement that
// would fail silently and dangerously if they broke -- an unauthenticated
// request going out, a validation failure being retried until the budget is
// gone, or a job payload leaking into the environment.
// ---------------------------------------------------------------------------
{
  const { CallbackError, callbackConfigFromEnv, claimJob, reportResult } = await import(
    "../dist/index.js"
  )

  const identity = (token) => ({ fetchIdentityToken: async () => token })

  // Absent an identity token, the worker must fail rather than send the request
  // without one. A fallback here would turn a misconfigured deploy into an
  // endpoint anyone can call.
  {
    let called = false
    const config = {
      apiBaseUrl: "https://control.example",
      jobId: "job-1",
      attempt: 1,
      identity: identity(null),
      fetchImpl: async () => {
        called = true
        return new Response("{}", { status: 200 })
      },
    }
    await assert.rejects(
      () => claimJob(config),
      (error) => error instanceof CallbackError && /no fallback credential/i.test(error.message),
    )
    assert.equal(called, false, "no request may be sent without an identity token")
  }

  // The token is audienced to the control plane and sent as a bearer token, and
  // the attempt number goes with it so the ceiling is enforced server-side.
  {
    let seen = null
    const config = {
      apiBaseUrl: "https://control.example/",
      jobId: "job-2",
      attempt: 3,
      identity: {
        fetchIdentityToken: async (audience) => `token-for-${audience}`,
      },
      fetchImpl: async (url, init) => {
        seen = { url, headers: new Headers(init.headers), body: init.body }
        return new Response(JSON.stringify({ job: { job_id: "job-2" } }), { status: 200 })
      },
    }
    const claimed = await claimJob(config)
    assert.equal(claimed.job.job_id, "job-2")
    assert.equal(seen.url, "https://control.example/api/execution/jobs/job-2/claim")
    assert.equal(seen.headers.get("authorization"), "Bearer token-for-https://control.example/")
    assert.equal(seen.headers.get("x-ketqat-attempt"), "3")
  }

  // 5xx, 408, and 429 may succeed on another attempt. A 4xx will not, and
  // retrying it burns the attempt budget while delaying the error reaching the
  // person who submitted the job.
  for (const [status, retryable] of [
    [500, true],
    [503, true],
    [408, true],
    [429, true],
    [400, false],
    [403, false],
    [404, false],
    [409, false],
  ]) {
    const config = {
      apiBaseUrl: "https://control.example",
      jobId: "job-3",
      attempt: 1,
      identity: identity("t"),
      fetchImpl: async () => new Response("nope", { status }),
    }
    await assert.rejects(
      () => claimJob(config),
      (error) => {
        assert.ok(error instanceof CallbackError)
        assert.equal(error.retryable, retryable, `status ${status} retryable`)
        return true
      },
    )
  }

  // A network failure is retryable: the control plane may simply not have been
  // reachable yet.
  {
    const config = {
      apiBaseUrl: "https://control.example",
      jobId: "job-4",
      attempt: 1,
      identity: identity("t"),
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED")
      },
    }
    await assert.rejects(
      () => claimJob(config),
      (error) => error instanceof CallbackError && error.retryable === true,
    )
  }

  // An error page is truncated before it becomes the worker's log volume.
  {
    const config = {
      apiBaseUrl: "https://control.example",
      jobId: "job-5",
      attempt: 1,
      identity: identity("t"),
      fetchImpl: async () => new Response("x".repeat(50_000), { status: 500 }),
    }
    await assert.rejects(
      () => claimJob(config),
      (error) => error.message.length < 700,
    )
  }

  // Results are posted, not printed. Worker stdout is captured by the platform's
  // logging, which has different retention and access than the registry.
  {
    let body = null
    const config = {
      apiBaseUrl: "https://control.example",
      jobId: "job-6",
      attempt: 1,
      identity: identity("t"),
      fetchImpl: async (_url, init) => {
        body = JSON.parse(init.body)
        return new Response("{}", { status: 200 })
      },
    }
    await reportResult(config, { job_id: "job-6", status: "SUCCEEDED" })
    assert.deepEqual(body, { job_id: "job-6", status: "SUCCEEDED" })
  }

  // Callback mode requires both the base URL and the job id. With either
  // missing the worker runs locally instead of half-configured.
  assert.equal(callbackConfigFromEnv({}), null)
  assert.equal(callbackConfigFromEnv({ KETQAT_API_BASE_URL: "https://x" }), null)
  assert.equal(callbackConfigFromEnv({ KETQAT_JOB_ID: "j" }), null)
  assert.deepEqual(
    callbackConfigFromEnv({
      KETQAT_API_BASE_URL: "https://x",
      KETQAT_JOB_ID: "j",
      KETQAT_JOB_ATTEMPT: "4",
    }),
    { apiBaseUrl: "https://x", jobId: "j", attempt: 4 },
  )
  // A malformed or absent attempt counts as the first, never as zero, which
  // would make a retry ceiling of N allow N + 1 runs.
  for (const attempt of [undefined, "", "nonsense", "0", "-3"]) {
    const config = callbackConfigFromEnv({
      KETQAT_API_BASE_URL: "https://x",
      KETQAT_JOB_ID: "j",
      KETQAT_JOB_ATTEMPT: attempt,
    })
    assert.equal(config.attempt, 1, `attempt ${String(attempt)} defaults to 1`)
  }

  // The dispatcher passes an id and a URL, never the manifest. A payload in the
  // environment would appear in `gcloud run jobs describe` and in crash dumps.
  const entrypoint = fs.readFileSync(new URL("../worker/entrypoint.mjs", import.meta.url), "utf8")
  assert.ok(
    !/KETQAT_JOB_PAYLOAD|KETQAT_JOB_MANIFEST/.test(entrypoint),
    "the job manifest must not be read from the environment in callback mode",
  )
}

// ---------------------------------------------------------------------------
// Execution from the CLI and MCP
//
// Both surfaces must enqueue rather than execute. A CLI or MCP server that ran
// the circuit locally and uploaded the answer would produce a registry record
// with no audit trail and no enforced limits, indistinguishable from one the
// worker produced.
// ---------------------------------------------------------------------------
{
  const { KetQatClient: Client } = await import("../dist/index.js")
  const {
    EXECUTION_MCP_TOOLS,
    cancelExecutionJobTool,
    getExecutionJobTool,
    listExecutionTools,
    submitExecutionJobTool,
    MCP_TOOLS: readOnlyTools,
  } = await import("../dist/index.js")

  const BELL_QASM = `OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`

  function recordingClient(responder) {
    const calls = []
    const client = new Client({
      baseUrl: "https://ketqat.example",
      token: "kq_test",
      fetch: async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body })
        return responder(String(url), init)
      },
    })
    return { client, calls }
  }

  // --- the read-only MCP surface stays read-only ---------------------------
  // The annotation on those tools is only meaningful if a mutating tool cannot
  // join them by accident, which is why the mutating ones live in their own
  // module with their own type.
  for (const tool of readOnlyTools) {
    assert.equal(tool.readOnly, true, `${tool.name} must stay read-only`)
  }
  const readOnlyNames = new Set(readOnlyTools.map((tool) => tool.name))
  for (const tool of EXECUTION_MCP_TOOLS) {
    assert.equal(readOnlyNames.has(tool.name), false, `${tool.name} must not be in the read-only list`)
  }
  assert.equal(submitExecutionJobTool.readOnly, false)
  assert.equal(submitExecutionJobTool.requiresConfirmation, true)
  assert.equal(getExecutionJobTool.readOnly, true)

  // A host that wants a strictly read-only server can filter and still get
  // something useful, rather than having to drop the module entirely.
  const listed = listExecutionTools()
  assert.equal(listed.filter((tool) => tool.readOnly).length, 1)

  // --- submission refuses without confirmation -----------------------------
  {
    const { client, calls } = recordingClient(async () => new Response("{}", { status: 200 }))
    const preview = await submitExecutionJobTool.handler(
      { qasm: BELL_QASM, shots: 512, confirmed: false },
      client,
    )
    assert.equal(preview.confirmation_required, true)
    assert.equal(calls.length, 0, "an unconfirmed submission must not reach the network")

    // The refusal has to carry what a person needs in order to agree. A
    // confirmation prompt that omits the cost is not a confirmation.
    assert.equal(preview.summary.shots, 512)
    assert.equal(preview.summary.qubits, 2)
    assert.equal(preview.summary.execution_class, "SIMULATION")
    assert.equal(preview.summary.reaches_hardware, false)
    assert.equal(preview.summary.spends_provider_quota, false)
  }

  // Defaulting `confirmed` to false is the load-bearing part: a model that
  // simply omits the field must not thereby submit.
  {
    const { client, calls } = recordingClient(async () => new Response("{}", { status: 200 }))
    const omitted = await submitExecutionJobTool.handler({ qasm: BELL_QASM }, client)
    assert.equal(omitted.confirmation_required, true)
    assert.equal(calls.length, 0, "omitting `confirmed` must behave as refusing")
  }

  // --- a confirmed submission enqueues, and only enqueues ------------------
  {
    const { client, calls } = recordingClient(async () =>
      new Response(JSON.stringify({ job: { id: "job-9", status: "QUEUED" }, created: true }), {
        status: 202,
      }),
    )
    const queued = await submitExecutionJobTool.handler(
      { qasm: BELL_QASM, shots: 256, seed: 3, confirmed: true },
      client,
    )
    assert.equal(queued.job.id, "job-9")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, "POST")
    assert.match(calls[0].url, /\/api\/execution\/jobs$/)

    // No counts anywhere in the response: the tool queued work, it did not
    // produce a result. A result here would mean something ran in-process.
    assert.doesNotMatch(JSON.stringify(queued), /"counts"/)
  }

  // A repeated idempotency key returns the original job, and the tool says so
  // rather than presenting it as a fresh run.
  {
    const { client } = recordingClient(async () =>
      new Response(JSON.stringify({ job: { id: "job-1" }, created: false }), { status: 200 }),
    )
    const repeated = await submitExecutionJobTool.handler(
      { qasm: BELL_QASM, confirmed: true, idempotency_key: "k" },
      client,
    )
    assert.match(repeated.message, /already existed/)
  }

  // --- a bad circuit is named before confirmation, not after ---------------
  {
    const { client, calls } = recordingClient(async () => new Response("{}", { status: 200 }))
    const rejected = await submitExecutionJobTool.handler(
      { qasm: "OPENQASM 3.0;\nqubit[2] q;\nbit[2] c;\nc = measure q;\n", confirmed: true },
      client,
    )
    assert.equal(rejected.error, "qasm_parse_error")
    assert.match(rejected.message, /register/i)
    assert.equal(calls.length, 0, "an unparseable circuit must not be submitted")
  }

  // --- the client validates locally before the network ---------------------
  // validateJob rejects code- and credential-implying fields at any depth, so a
  // mistake of that shape never leaves the caller's machine.
  {
    const { client, calls } = recordingClient(async () => new Response("{}", { status: 200 }))
    await assert.rejects(() =>
      client.execution.submit({
        schema_version: "1.0",
        parameters: { operation: "simulate", qasm: BELL_QASM, token: "kq_leak" },
      }),
    )
    assert.equal(calls.length, 0, "a forbidden field must be caught before the request")
  }

  // --- waitFor stops on a terminal status and on its deadline --------------
  {
    let polls = 0
    const { client } = recordingClient(async () => {
      polls += 1
      const status = polls >= 3 ? "SUCCEEDED" : "RUNNING"
      return new Response(JSON.stringify({ job: { id: "job-2", status } }), { status: 200 })
    })
    const finished = await client.execution.waitFor("job-2", { intervalMs: 1, sleep: async () => {} })
    assert.equal(finished.job.status, "SUCCEEDED")
    assert.equal(polls, 3)
  }
  {
    const { client } = recordingClient(async () =>
      new Response(JSON.stringify({ job: { id: "job-3", status: "RUNNING" } }), { status: 200 }),
    )
    // On timeout it returns the job as it stands rather than throwing: the job
    // is still running, and saying so is more useful than an error that loses
    // the id.
    const pending = await client.execution.waitFor("job-3", {
      timeoutMs: 5,
      intervalMs: 1,
      sleep: async () => {},
    })
    assert.equal(pending.job.status, "RUNNING")
  }

  // --- cancellation is not gated behind confirmation -----------------------
  // Its failure mode is far smaller than an unwanted submission's, and
  // requiring confirmation everywhere teaches a model to confirm reflexively.
  assert.equal(cancelExecutionJobTool.requiresConfirmation, false)
  assert.equal(cancelExecutionJobTool.readOnly, false)

  // --- the CLI enqueues rather than running ---------------------------------
  {
    const { runCli } = await import("../dist/index.js")
    const cliCalls = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => {
      cliCalls.push({ url: String(url), method: init?.method ?? "GET" })
      return new Response(JSON.stringify({ job: { id: "cli-job", status: "QUEUED" }, created: true }), {
        status: 202,
      })
    }
    const originalToken = process.env.KETQAT_TOKEN
    process.env.KETQAT_TOKEN = "kq_test"
    try {
      fs.writeFileSync("/tmp/ketqat-cli-job.qasm", BELL_QASM)
      const result = await runCli([
        "job",
        "submit",
        "/tmp/ketqat-cli-job.qasm",
        "--registry",
        "https://ketqat.example",
        "--shots",
        "128",
      ])
      assert.equal(result.exitCode, 0)
      assert.equal(result.stdout.job.id, "cli-job")
      assert.equal(cliCalls.length, 1)
      assert.match(cliCalls[0].url, /\/api\/execution\/jobs$/)
      assert.equal(cliCalls[0].method, "POST")
      // The circuit summary comes from local parsing; the counts do not exist,
      // because the CLI did not run anything.
      assert.equal(result.stdout.circuit.qubits, 2)
      assert.doesNotMatch(JSON.stringify(result.stdout), /"counts"/)
    } finally {
      globalThis.fetch = originalFetch
      if (originalToken === undefined) delete process.env.KETQAT_TOKEN
      else process.env.KETQAT_TOKEN = originalToken
    }
  }

  // The usage text must point at the queue for anything publishable, otherwise
  // people reach for `simulate` and upload a local result.
  {
    const { runCli } = await import("../dist/index.js")
    const help = await runCli(["help"])
    assert.match(help.stderr, /job submit/)
    assert.match(help.stderr, /sandboxed container/)
  }
}

// ---------------------------------------------------------------------------
// Documentation that describes the contract must track the contract.
//
// docs/verification-levels.md makes specific claims about which evidence kinds
// each status accepts. A doc that drifts from the code is worse than none: it
// is read as authoritative and cited as if checked.
// ---------------------------------------------------------------------------
{
  const levels = fs.readFileSync(new URL("../docs/verification-levels.md", import.meta.url), "utf8")
  const contract = fs.readFileSync(
    new URL("../src/contracts/verification-evidence.ts", import.meta.url),
    "utf8",
  )

  // Every evidence kind the contract defines must appear in the table, or the
  // table is silently incomplete.
  const kinds = [...contract.matchAll(/"(SCHEMA_VALIDATION|HASH_VERIFICATION|INDEPENDENT_REPRODUCTION|DEMO_FIXTURE_REPRODUCTION|REVIEW_NOTE)"/g)]
    .map((match) => match[1])
  for (const kind of new Set(kinds)) {
    assert.ok(levels.includes(kind), `docs/verification-levels.md does not mention ${kind}`)
  }

  // The two claims the document rests on, checked against the code rather than
  // taken on trust.
  assert.match(
    contract,
    /HASH_VERIFICATION[\s\S]{0,200}REPRODUCED/,
    "the doc claims hash verification alone cannot reach REPRODUCED; the contract must enforce it",
  )
  assert.ok(
    contract.includes("DEMO_FIXTURE_REPRODUCTION") && contract.includes("INDEPENDENT_REPRODUCTION"),
    "the doc claims both kinds share status REPRODUCED",
  )

  // The doc states these statuses do not exist. If someone adds them, the doc
  // becomes wrong in the most misleading possible way, so it fails here first.
  for (const absent of ["INDEPENDENTLY_REPRODUCED", "REVIEWED"]) {
    const common = fs.readFileSync(new URL("../src/contracts/common.ts", import.meta.url), "utf8")
    const statusBlock = /VerificationStatusSchema = z\.enum\(\[[\s\S]*?\]\)/.exec(common)?.[0] ?? ""
    assert.ok(
      !statusBlock.includes(absent),
      `${absent} was added to the status enum; docs/verification-levels.md explains why it is absent and must be updated`,
    )
  }

  // The exclusion set the provenance doc lists must match the code's.
  const provenance = fs.readFileSync(new URL("../docs/provenance.md", import.meta.url), "utf8")
  const repro = fs.readFileSync(new URL("../src/reproducibility/index.ts", import.meta.url), "utf8")
  const excluded = [...repro.matchAll(/"(id|slug|started_at|finished_at|created_at|updated_at|submitted_at|ui_metadata|reproducibility_hash|owner_username|visibility)"/g)]
    .map((match) => match[1])
  for (const field of new Set(excluded)) {
    assert.ok(
      provenance.includes(`\`${field}\``),
      `docs/provenance.md omits the excluded field ${field}; an incomplete list understates what the hash ignores`,
    )
  }
}

// ---------------------------------------------------------------------------
// OSS metrics must not flatter.
//
// Adoption numbers are read by people deciding whether to trust or fund a
// project, and the pressure to round upward is strongest exactly where the
// figures are weakest. These assert the shape that makes the output
// trustworthy, against a real collection run.
// ---------------------------------------------------------------------------
{
  /**
   * Check a metrics document against the rules the collector exists to enforce.
   *
   * This was originally written inline against a collected document, which was
   * a mistake worth recording: the document is written to a gitignored path
   * that nothing generated -- not CI, not `npm run metrics:oss`, which prints
   * to stdout. So the block announced `# skip` on every run and every assertion
   * below had never once executed. A check that cannot fail is not a check, and
   * this one was load-bearing for the claim that the published numbers do not
   * flatter.
   *
   * Extracting it into a function is what makes it testable: the malformed
   * documents further down prove the rules actually reject what they describe,
   * with no network and no gh, so they run everywhere and always.
   */
  const assertMetricsShape = (metrics, label) => {
    assert.equal(metrics.schema_version, "1.0", `${label}: schema_version`)
    assert.ok(metrics.generated_at, "a metric without a timestamp cannot be judged current")

    /**
     * Every leaf that looks like a metric entry.
     *
     * Keyed on `value` alone, deliberately. An earlier version required both
     * `value` and `source`, which meant an entry missing its source was not
     * recognised as a metric and so was never checked for having one -- the
     * assertion below was vacuous for precisely the case it existed to catch.
     */
    const entries = []
    const walk = (node) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return
      if ("value" in node && "estimated" in node) entries.push(node)
      for (const child of Object.values(node)) walk(child)
    }
    walk(metrics)
    // Enough entries that the per-entry rules below are doing work. The richer
    // "the collector reports a full picture" count belongs to the collected
    // document, not to the small documents that prove the rules bite.
    assert.ok(entries.length >= 5, `${label}: expected several metrics, found ${entries.length}`)

    for (const entry of entries) {
      // The rule the whole file exists for: unknown is null, and null carries a
      // reason. Zero is a measurement; null is an admission, and they must not
      // be confused in either direction.
      if (entry.value === null) {
        assert.ok(entry.why, `a null metric must say why it is unknown: ${JSON.stringify(entry)}`)
      }
      // Every number must be traceable to something a reader can open.
      assert.ok(entry.source, `every metric must carry its source: ${JSON.stringify(entry)}`)
      assert.match(entry.source, /^https:\/\//, `source must be a URL: ${entry.source}`)
      // An estimate must say how it was arrived at, or it reads as measured.
      if (entry.estimated) {
        assert.ok(entry.how, `an estimate must explain its method: ${JSON.stringify(entry)}`)
      }
    }

    // Unpublished packages must report unknown downloads, never zero. A reader
    // shown "0 downloads" concludes the package was published and ignored.
    if (metrics.distribution.npm.value === null) {
      assert.equal(
        metrics.downloads.npm_last_month.value,
        null,
        "downloads must be unknown when nothing is published, not zero",
      )
    }

    // A contributor count without a date reads as current activity whether or
    // not it is. Whenever the count is above zero the recency must be reported
    // alongside it, so the flattering reading cannot stand unchallenged.
    if (metrics.contribution.external_contributors_last_12_months.value > 0) {
      assert.ok(
        metrics.contribution.most_recent_external_merge.value,
        "a non-zero external contributor count must report when the most recent contribution landed",
      )
      assert.equal(
        typeof metrics.contribution.days_since_external_merge.value,
        "number",
        "a non-zero external contributor count must report how long ago that was",
      )
    }

    // No personal data. Logins are public handles; names and emails are not.
    const serialized = JSON.stringify(metrics)
    assert.doesNotMatch(serialized, /"email"/, `${label}: metrics must not carry email addresses`)
    assert.doesNotMatch(serialized, /@[\w.-]+\.(com|org|net)/, `${label}: metrics must not carry email addresses`)

    // Demo and real scientific runs must never be summed.
    assert.equal(
      metrics.scientific_usage.public_non_demo_runs.value,
      null,
      `${label}: run counts must stay unknown until a source guarantees demo records are excluded`,
    )
  }

  // Bot activity must not be counted as adoption. A property of the collector
  // rather than of any one document, so it is checked against the source.
  const source = fs.readFileSync(new URL("../scripts/collect-oss-metrics.mjs", import.meta.url), "utf8")
  assert.match(source, /\[bot\]/, "the collector must exclude automation accounts")

  /**
   * A document that satisfies every rule. Each malformed case below is this
   * document with exactly one thing wrong, so a case that fails to throw has
   * identified a rule that does not actually hold.
   */
  const wellFormed = () => ({
    schema_version: "1.0",
    generated_at: "2026-07-29T00:00:00.000Z",
    contribution: {
      external_contributors_last_12_months: { value: 2, estimated: false, source: "https://github.com/ketqat" },
      most_recent_external_merge: { value: "2026-02-05T09:24:26Z", estimated: false, source: "https://github.com/ketqat" },
      days_since_external_merge: { value: 173, estimated: false, source: "https://github.com/ketqat" },
      sampled: { value: 9, estimated: true, source: "https://github.com/ketqat", how: "the most recent 100 PRs" },
    },
    distribution: { npm: { value: null, estimated: false, source: "https://registry.npmjs.org/x", why: "not published" } },
    downloads: { npm_last_month: { value: null, estimated: false, source: "https://api.npmjs.org", why: "nothing published" } },
    scientific_usage: {
      public_non_demo_runs: { value: null, estimated: false, source: "https://ketqat.com/runs", why: "needs registry access" },
    },
  })

  // The well-formed document must pass, or every case below passes vacuously.
  assertMetricsShape(wellFormed(), "well-formed")

  const mustReject = (mutate, why) => {
    const document = wellFormed()
    mutate(document)
    assert.throws(
      () => assertMetricsShape(document, "malformed"),
      (error) => error instanceof assert.AssertionError,
      `the shape check must reject ${why}`,
    )
  }

  mustReject((d) => { d.schema_version = "2.0" }, "an unknown schema version")
  mustReject((d) => { delete d.generated_at }, "a document with no collection timestamp")
  mustReject(
    (d) => { delete d.distribution.npm.why },
    "a null metric that does not say why it is unknown -- the rule the collector exists for",
  )
  mustReject((d) => { delete d.contribution.sampled.how }, "an estimate that does not explain its method")
  mustReject((d) => { delete d.contribution.sampled.source }, "a metric with no source anyone can open")
  mustReject((d) => { d.contribution.sampled.source = "github.com/ketqat" }, "a source that is not a URL")
  mustReject(
    (d) => { d.downloads.npm_last_month = { value: 0, estimated: false, source: "https://api.npmjs.org" } },
    "zero downloads for an unpublished package -- zero is a measurement, null is an admission",
  )
  mustReject(
    (d) => { d.contribution.most_recent_external_merge = { value: null, estimated: false, source: "https://github.com/ketqat", why: "none" } },
    "a non-zero contributor count with no date beside it, which reads as current activity",
  )
  mustReject(
    (d) => { d.scientific_usage.public_non_demo_runs = { value: 41, estimated: false, source: "https://ketqat.com/runs" } },
    "a run count that cannot guarantee demo records were excluded",
  )
  mustReject(
    (d) => { d.contribution.maintainer = { value: "a@b.com", estimated: false, source: "https://github.com/ketqat" } },
    "an email address in what is meant to be aggregate data",
  )

  // Finally, the live document when one has been collected. The rules above are
  // proved by construction; this proves the collector's real output obeys them.
  let collected = null
  try {
    collected = JSON.parse(fs.readFileSync(new URL("../.tmp-metrics.json", import.meta.url), "utf8"))
  } catch {
    console.log("# note: no collected metrics document; the rules were verified, this run's output was not")
  }
  if (collected) {
    assertMetricsShape(collected, "collected")
    const count = JSON.stringify(collected).split('"estimated"').length - 1
    assert.ok(count > 8, `a real collection should report many metrics, found ${count}`)
  }
}

// ---------------------------------------------------------------------------
// Contribution validation
//
// This runs in CI on pull requests from accounts nobody vouches for, so the
// properties that matter are what it refuses and what it never does: no eval,
// no dynamic import, no network, no shelling out.
// ---------------------------------------------------------------------------
{
  const { execFileSync } = await import("node:child_process")
  const validator = new URL("../scripts/validate-contribution.mjs", import.meta.url).pathname

  const run = (file) => {
    try {
      execFileSync("node", [validator, file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      return { ok: true, out: "" }
    } catch (error) {
      return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
    }
  }

  // The filled example must pass, so the templates cannot drift from what the
  // validator accepts without CI noticing.
  const filled = run(new URL("../contrib/examples/filled-benchmark-result.yaml", import.meta.url).pathname)
  assert.ok(filled.ok, `the filled example must validate:\n${filled.out}`)

  // Templates must NOT pass: a template is not a submission, and accepting one
  // would mean placeholder provenance reaching the registry.
  for (const template of ["benchmark-result", "reproduction-report"]) {
    const result = run(new URL(`../contrib/templates/${template}.yaml`, import.meta.url).pathname)
    assert.equal(result.ok, false, `${template} template must be rejected while it holds placeholders`)
    assert.match(result.out, /placeholder/, `${template} rejection must name the placeholder`)
  }

  // Quoting means string. An earlier version stripped quotes before testing for
  // digits, so a quoted all-zero SHA became the number 0 -- which failed the
  // typeof check and skipped SHA validation entirely. A validator that silently
  // stops validating is worse than none.
  const source = fs.readFileSync(validator, "utf8")
  assert.match(source, /quoted values are strings|Quoting is how YAML says/, "quote handling must stay deliberate")

  // The submission channel must not execute anything.
  for (const forbidden of [/\beval\s*\(/, /new Function\s*\(/, /child_process/, /\bfetch\s*\(/]) {
    assert.doesNotMatch(source, forbidden, `the validator must not use ${forbidden}`)
  }

  // YAML features historically used to make parsers construct unintended
  // objects must be refused rather than interpreted.
  assert.match(source, /anchors, aliases, and tags are not accepted/)
}

// ---------------------------------------------------------------------------
// The compiler must be told where Node's types come from.
//
// TypeScript 7 does not infer @types/node the way 5.x did. Without an explicit
// `types` entry the build fails with nine copies of "Cannot find name
// 'process'", which reads like a missing dependency and is not one -- the
// package is installed and the tsconfig simply never names it.
//
// The entry is a no-op under 5.x: building with it produced a byte-identical
// dist. So it is safe to keep regardless of which compiler is in use, and
// removing it breaks the build in a way that sends you looking in the wrong
// place. That is worth one assertion.
// ---------------------------------------------------------------------------
{
  const tsconfig = JSON.parse(
    fs.readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
  )
  assert.ok(
    Array.isArray(tsconfig.compilerOptions.types) && tsconfig.compilerOptions.types.includes("node"),
    'tsconfig must name "node" in compilerOptions.types, or TypeScript 7 cannot find process, Buffer, or node: imports',
  )
}

// ---------------------------------------------------------------------------
// The outreach claim checker must actually reject claims.
//
// A checker that passes everything is worse than no checker, because it is
// cited as evidence. This writes a template containing the six claims the rule
// exists to stop, and requires each to be caught.
//
// An earlier version of the superlative rule rejected "the first published
// release" and "be the only person there" -- both plain facts. A check that
// cries wolf gets ignored, so the well-formed templates passing cleanly is
// asserted here too.
// ---------------------------------------------------------------------------
{
  const { execFileSync } = await import("node:child_process")
  const outreachDir = new URL("../docs/outreach/", import.meta.url)
  const probe = new URL("zz-claim-probe.md", outreachDir)

  const run = () => {
    try {
      execFileSync("node", [fileURLToPath(new URL("../scripts/verify-outreach-claims.mjs", import.meta.url))], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      return { ok: true, output: "" }
    } catch (error) {
      return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
    }
  }

  // The committed templates must pass, or every assertion below is vacuous.
  assert.ok(run().ok, "the committed outreach templates must pass the claim checker")

  const claims = [
    ["KetQat is the leading platform for QEC benchmarking.", "market superlative"],
    ["Trusted by researchers at MIT and Delft.", "claimed adoption"],
    ["Join thousands of users already benchmarking with us.", "invented community size"],
    ["We are excited to announce our partnership with a national lab.", "claimed partnership"],
    ["It is production-ready and outperforms Stim for decoder comparison.", "claimed maturity"],
    ["Backed by the Quantum Foundation.", "claimed sponsorship"],
  ]

  for (const [claim, description] of claims) {
    fs.writeFileSync(probe, `> ${claim}\n`)
    try {
      const result = run()
      assert.equal(result.ok, false, `the checker must reject ${description}: ${claim}`)
    } finally {
      fs.rmSync(probe, { force: true })
    }
  }

  // Facts that read like superlatives must survive, or the rule gets ignored.
  for (const fact of [
    "This is the first published release.",
    "If nobody comes I will use the hour to work on issues, so it costs nothing to be the only person there.",
  ]) {
    fs.writeFileSync(probe, `> ${fact}\n`)
    try {
      assert.ok(run().ok, `the checker must not reject a plain fact: ${fact}`)
    } finally {
      fs.rmSync(probe, { force: true })
    }
  }
}

// ---------------------------------------------------------------------------
// A malformed noise model must be refused, not silently maximised.
//
// `{ model: "depolarizing", one_qubit_error_rate: 0.02 }` -- a plausible guess
// at the field name, which is actually `one_qubit_error` -- used to be accepted
// and produce a *maximally noisy* circuit:
//
//   malformed   counts {"0":2215,"1":1785}   <Z> = 0.1075
//   correct     counts {"0":3893,"1":107}    <Z> = 0.9465
//
// Two guards failed open in the same direction. `undefined <= 0` is false, so
// the "no noise" early return was skipped; then `random() >= undefined` is also
// false, so a Pauli was inserted after every gate on every qubit. A typo asking
// for 2% error produced near-total decoherence, reported as the requested run.
//
// This is the worst available failure for a scientific tool: not a crash, not a
// wrong-looking number, but a plausible one from an experiment nobody ran.
// ---------------------------------------------------------------------------
{
  const identityCircuit = parseQasm3(`OPENQASM 3;
include "stdgates.inc";
qubit[1] q;
bit[1] c;
h q[0];
h q[0];
c[0] = measure q[0];
`).circuit

  const run = (noise) => simulateStatevector(identityCircuit, { shots: 4000, seed: 42, noise })

  // The circuit is h;h -- the identity -- so a noiseless run must give |0> every
  // time. This anchors everything below: any deviation is the noise model.
  assert.deepEqual(run(undefined).counts, { 0: 4000 }, "h;h is the identity and must measure 0 every shot")

  // A misspelled rate names the offending key rather than guessing an intent.
  assert.throws(
    () => run({ model: "depolarizing", one_qubit_error_rate: 0.02, two_qubit_error_rate: 0.02 }),
    (error) => /one_qubit_error_rate/.test(String(error)),
    "a misspelled noise rate must be rejected by name",
  )

  // Refusal must not have been achieved by refusing everything.
  const correct = run({ model: "depolarizing", one_qubit_error: 0.02 })
  const zero = Number(correct.counts?.["0"] ?? 0)
  assert.ok(
    zero > 3500 && zero < 4000,
    `2% depolarizing on two gates should leave most shots at |0>, got ${zero}/4000`,
  )

  // An omitted rate is genuinely zero, which the schema defaults allow and which
  // must stay noiseless rather than becoming "unspecified, therefore maximal".
  assert.deepEqual(
    run({ model: "depolarizing" }).counts,
    { 0: 4000 },
    "a model that specifies no rates is noiseless, not maximally noisy",
  )

  // Rates outside [0,1] are not probabilities.
  for (const bad of [{ one_qubit_error: 1.5 }, { one_qubit_error: -0.1 }]) {
    assert.throws(
      () => run({ model: "depolarizing", ...bad }),
      `a rate outside [0,1] must be refused: ${JSON.stringify(bad)}`,
    )
  }
}
// ---------------------------------------------------------------------------
// The worked ZNE example must stay runnable and its README must stay true.
//
// A documentation example rots silently: the code moves, the numbers in the
// prose stop matching, and nobody notices because nothing runs it. The prose is
// the point of this example -- it exists to teach that a mitigated value is an
// estimate under a model -- so a stale number here teaches the wrong lesson
// with the project's own authority behind it.
// ---------------------------------------------------------------------------
{
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../examples/mitigation/zero-noise-extrapolation.json", import.meta.url), "utf8"),
  )
  const readme = fs.readFileSync(new URL("../examples/README.md", import.meta.url), "utf8")

  // The example must be submittable without editing.
  const parsedParameters = JobParametersSchema.safeParse(manifest.parameters)
  assert.ok(
    parsedParameters.success,
    `the example manifest must validate: ${JSON.stringify(parsedParameters.error?.issues?.slice(0, 2))}`,
  )

  const circuit = parseQasm3(manifest.parameters.qasm).circuit
  const result = zeroNoiseExtrapolation(circuit, manifest.parameters.noise, {
    shots: manifest.parameters.shots,
    seed: manifest.parameters.seed,
    scaleFactors: [1, 3, 5],
  })

  // Every number the README prints must be the number the example produces.
  //
  // Matched against the labelled line rather than anywhere in the file. An
  // earlier version searched the whole README, which passed when the headline
  // figure was edited because the same number also appears in the prose below
  // it -- a check that survives the exact edit it exists to catch.
  const labelled = (label) => {
    const match = readme.match(new RegExp(`^${label}\\s+([0-9.]+)`, "m"))
    assert.ok(match, `README has no "${label}" line to check`)
    return match[1]
  }
  assert.equal(labelled("raw"), result.raw_value.toFixed(4), "README raw value is stale")
  assert.equal(labelled("mitigated"), result.mitigated_value.toFixed(4), "README mitigated value is stale")
  assert.equal(labelled("uncertainty"), result.uncertainty.toFixed(4), "README uncertainty is stale")

  // The circuit is h;h, the identity, so the ideal answer is exactly 1. That is
  // what makes this example able to show whether mitigation helped at all.
  assert.ok(
    Math.abs(result.mitigated_value - 1) < Math.abs(result.raw_value - 1),
    "the example must actually demonstrate mitigation moving toward the true value",
  )

  // The result must carry its assumptions, and say the value is not a measurement.
  assert.ok(result.assumptions.length > 0)
  assert.ok(
    result.assumptions.some((line) => /not a measurement/i.test(line)),
    "a mitigated value must state that it is not a measurement",
  )

  // And the README must not sell it as one.
  assert.match(readme, /estimate under a model, not a measurement/i)
  assert.match(readme, /statistical only/i, "the README must say the uncertainty excludes model error")

  // The overshoot case: at 1% the extrapolation exceeds the physical range and
  // must warn rather than clamp. The README quotes that warning verbatim.
  const overshoot = zeroNoiseExtrapolation(
    circuit,
    { ...manifest.parameters.noise, one_qubit_error: 0.01, two_qubit_error: 0.01 },
    { shots: manifest.parameters.shots, seed: manifest.parameters.seed, scaleFactors: [1, 3, 5] },
  )
  assert.ok(overshoot.mitigated_value > 1, "the 1% case is documented as overshooting the physical range")
  assert.equal(overshoot.warnings.length, 1, "an unphysical extrapolation must warn")
  // Compared as a substring rather than compiled into a RegExp.
  //
  // The first version built a pattern from the warning text and escaped only
  // square brackets, which CodeQL correctly flagged: the message contains
  // "[-1, 1]" today and any regex metacharacter tomorrow, and a half-escaped
  // pattern either throws or silently matches something else. Nothing here
  // needs a regex -- the README is supposed to quote the sentence verbatim, so
  // verbatim is exactly the right comparison.
  // Split on ". " rather than ".", because the sentence contains the number
  // 1.003063 and splitting on every period compared only "Extrapolated value 1"
  // -- which matches whatever digits the README happens to carry, so the
  // assertion passed while the quoted value was wrong.
  const quotedWarning = overshoot.warnings[0].split(". ")[0]
  assert.ok(
    readme.includes(quotedWarning),
    `the README must quote the warning verbatim; expected to find: ${quotedWarning}`,
  )
}

// ---------------------------------------------------------------------------
// The equivalence example must stay runnable and its four verdicts must stay
// true.
//
// The prose is the deliverable here. NUMERICALLY_CHECKED is not PROVEN, and
// INCONCLUSIVE is not "they differ" -- those two sentences are the whole reason
// the example exists, and a stale one teaches the wrong lesson with the
// project's own authority behind it.
// ---------------------------------------------------------------------------
{
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../examples/equivalence/cx-decomposition.json", import.meta.url), "utf8"),
  )
  const readme = fs.readFileSync(new URL("../examples/README.md", import.meta.url), "utf8")

  const parsed = JobParametersSchema.safeParse(manifest.parameters)
  assert.ok(parsed.success, "the equivalence example must be submittable without editing")

  const circuitOf = (qasm) => parseQasm3(qasm).circuit
  const verdict = checkCircuitEquivalence(
    circuitOf(manifest.parameters.left_qasm),
    circuitOf(manifest.parameters.right_qasm),
    { tolerance: manifest.parameters.tolerance },
  )

  // cx and h-cz-h are a standard identity, so the expected answer is known
  // before the tool runs -- which is what lets the example demonstrate anything.
  assert.equal(verdict.level, "NUMERICALLY_CHECKED", "the documented identity must still check out")
  assert.equal(verdict.global_phase_ignored, true)
  assert.match(readme, new RegExp(`"level": "${verdict.level}"`))

  // The claim the README makes about that level.
  assert.match(readme, /does not mean proven/i)
  assert.match(readme, /[Gg]lobal phase was ignored/)

  // A genuine difference must still fail, and must still name the discrepancy
  // rather than only returning a verdict.
  const differs = checkCircuitEquivalence(
    circuitOf('OPENQASM 3;\ninclude "stdgates.inc";\nqubit[2] q;\nx q[0];\n'),
    circuitOf('OPENQASM 3;\ninclude "stdgates.inc";\nqubit[2] q;\nz q[0];\n'),
  )
  assert.equal(differs.level, "FAILED")
  assert.ok(differs.counterexample, "a FAILED verdict must name the discrepancy")

  // The answer most likely to be misread. It must say, in the payload itself,
  // that it is not evidence of a difference.
  const tooBig = circuitOf('OPENQASM 3;\ninclude "stdgates.inc";\nqubit[26] q;\nh q[0];\n')
  const inconclusive = checkCircuitEquivalence(tooBig, tooBig)
  assert.equal(inconclusive.level, "INCONCLUSIVE")
  assert.match(
    inconclusive.reason,
    /not evidence that the circuits differ/i,
    "an unanswered question must say it was not answered",
  )
  assert.ok(
    readme.includes(inconclusive.reason),
    `the README must quote the inconclusive reason verbatim; expected: ${inconclusive.reason}`,
  )
}

// ---------------------------------------------------------------------------
// The resource example must stay runnable, and its warning must stay true.
//
// The whole point of that example is that `t_count` is the field a reader lifts
// into a slide, and that on this circuit it undercounts by more than 3x because
// a Toffoli has not been decomposed. If the estimator ever starts decomposing,
// the README's warning becomes false and this fails.
// ---------------------------------------------------------------------------
{
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../examples/resources/t-count-with-toffoli.json", import.meta.url), "utf8"),
  )
  const readme = fs.readFileSync(new URL("../examples/README.md", import.meta.url), "utf8")

  assert.ok(
    JobParametersSchema.safeParse(manifest.parameters).success,
    "the resource example must be submittable without editing",
  )

  const estimate = estimateResources(parseQasm3(manifest.parameters.qasm).circuit)

  // Every figure the README prints.
  assert.equal(estimate.fault_tolerant.t_count, 3, "README documents t_count 3")
  assert.equal(estimate.fault_tolerant.toffoli_count, 1, "README documents toffoli_count 1")
  assert.match(readme, new RegExp(`"t_count": ${estimate.fault_tolerant.t_count}`))
  assert.match(readme, new RegExp(`"toffoli_count": ${estimate.fault_tolerant.toffoli_count}`))

  // The claim that makes the example worth reading: the circuit contains a
  // Toffoli that has NOT been decomposed, so t_count understates the real cost.
  // If the estimator starts decomposing, toffoli_count goes to zero and t_count
  // rises -- and the README's warning would be wrong.
  assert.ok(
    estimate.fault_tolerant.toffoli_count > 0,
    "the example depends on an undecomposed Toffoli being reported separately",
  )
  assert.match(readme, /is not this circuit's T-count/)
  assert.match(readme, /seven T gates/)

  // The estimator must keep saying what it did not do.
  const notes = estimate.assumptions.notes.join(" ")
  assert.match(notes, /No synthesis, decomposition, or optimization is applied/)
  assert.ok(
    readme.includes("Static count over the circuit as written. No synthesis, decomposition, or optimization is applied."),
    "the README quotes the estimator's own note verbatim",
  )

  // Duration and success probability must be absent, not defaulted, with no
  // hardware profile supplied. A plausible number from nothing is worse than
  // none, because it is indistinguishable from a measurement.
  assert.equal(estimate.nisq.duration_seconds, undefined)
  assert.equal(estimate.nisq.success_probability, undefined)
  assert.match(notes, /not estimated/)
}

// ---------------------------------------------------------------------------
// `job watch` follows a job without spamming, and never calls a timeout a
// failure.
//
// The distinction in the last clause is the point of the command. A job that is
// still running is not a job that failed, and a watch that reports the two the
// same way tells someone their experiment died when it is mid-flight.
// ---------------------------------------------------------------------------
{
  const { runCli } = await import("../dist/index.js")
  const originalFetch = globalThis.fetch
  const originalToken = process.env.KETQAT_TOKEN
  process.env.KETQAT_TOKEN = "kq_test"

  const stubStatuses = (statuses) => {
    let call = 0
    globalThis.fetch = async () => {
      const status = statuses[Math.min(call, statuses.length - 1)]
      call += 1
      return new Response(JSON.stringify({ job: { id: "watched", status } }), { status: 200 })
    }
    return () => call
  }

  try {
    // A job that progresses QUEUED -> RUNNING -> SUCCEEDED. Each transition is
    // recorded once, even though QUEUED and RUNNING are each polled twice.
    stubStatuses(["QUEUED", "QUEUED", "RUNNING", "RUNNING", "SUCCEEDED"])
    const succeeded = await runCli(["job", "watch", "watched", "--registry", "https://example.test"])
    assert.equal(succeeded.exitCode, 0, "a succeeded job exits 0, so the command is usable in a script")
    const transitions = succeeded.stdout.transitions.map((entry) => entry.status)
    assert.deepEqual(
      transitions,
      ["QUEUED", "RUNNING", "SUCCEEDED"],
      "each status is reported once, not once per poll",
    )

    // A failure exits non-zero, matching `job submit --wait`.
    stubStatuses(["FAILED"])
    const failed = await runCli(["job", "watch", "watched", "--registry", "https://example.test"])
    assert.equal(failed.exitCode, 1)
    assert.ok(!failed.stdout.timed_out, "a failure is not a timeout")

    // The one that matters: a job still running when watching stops. It must
    // not be reported as failed, and the payload must say the job is probably
    // still going.
    stubStatuses(["RUNNING"])
    const timedOut = await runCli([
      "job", "watch", "watched", "--registry", "https://example.test", "--timeout", "0",
    ])
    assert.equal(timedOut.stdout.timed_out, true)
    assert.notEqual(timedOut.exitCode, 1, "a timeout must not use the same exit code as a failed job")
    assert.match(timedOut.stdout.note, /has not\s+failed|not failed/i)
    assert.match(timedOut.stdout.note, /still running/i)

    // A missing id is a usage error, not a crash.
    const noId = await runCli(["job", "watch", "--registry", "https://example.test"])
    assert.equal(noId.exitCode, 2)
    assert.match(noId.stderr, /requires a job id/)

    // Every job subcommand needs a token, and it is never read from a flag.
    delete process.env.KETQAT_TOKEN
    const noToken = await runCli(["job", "watch", "watched", "--registry", "https://example.test"])
    assert.equal(noToken.exitCode, 2)
    assert.match(noToken.stderr, /KETQAT_TOKEN/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.KETQAT_TOKEN
    else process.env.KETQAT_TOKEN = originalToken
  }
}

// ---------------------------------------------------------------------------
// The routing and ZX examples must stay runnable and their numbers must stay
// true.
//
// Both exist to teach a limit rather than a capability: routing moves qubits
// and asserts equivalence rather than checking it, and an optimisation that is
// "verified" on one circuit is merely "applied" on the same circuit with
// measurements. A stale figure here teaches the wrong limit.
// ---------------------------------------------------------------------------
{
  const readme = fs.readFileSync(new URL("../examples/README.md", import.meta.url), "utf8")

  // --- transpile -----------------------------------------------------------
  const routing = JSON.parse(
    fs.readFileSync(new URL("../examples/transpile/routing-on-a-line.json", import.meta.url), "utf8"),
  ).parameters
  assert.ok(JobParametersSchema.safeParse(routing).success, "the routing example must be submittable")

  const routed = transpileForHardware(parseQasm3(routing.qasm).circuit, routing.hardware_profile)
  assert.equal(routed.swap_count, 3, "README documents 3 SWAPs")
  assert.match(readme, new RegExp(`swap_count ${routed.swap_count}`))
  assert.match(readme, new RegExp(`"final_layout":\\s+\\[${routed.final_layout.join(", ")}\\]`))

  // The claim the example rests on: the qubits actually move, so reading the
  // output without the layout gives a plausible wrong answer.
  assert.notDeepEqual(
    routed.final_layout,
    routed.initial_layout,
    "the example depends on routing permuting the qubits",
  )

  // And routing asserts equivalence rather than checking it.
  assert.equal(routed.transformation.equivalence.level, "NOT_CHECKED")
  assert.ok(
    readme.includes(routed.transformation.equivalence.method),
    "the README quotes the router's own equivalence note verbatim",
  )

  // --- optimize_zx ---------------------------------------------------------
  const optimization = JSON.parse(
    fs.readFileSync(new URL("../examples/optimization/cancelling-gates.json", import.meta.url), "utf8"),
  ).parameters
  assert.ok(JobParametersSchema.safeParse(optimization).success, "the ZX example must be submittable")

  const optimized = optimizeWithZx(parseQasm3(optimization.qasm).circuit)
  assert.equal(optimized.before.gate_count, 6)
  assert.equal(optimized.after.gate_count, 2)
  assert.equal(optimized.equivalence.level, "NUMERICALLY_CHECKED", "no measurements, so it is checkable")

  // The pairing that makes the example worth reading: the same rewrites on the
  // same circuit *with measurements* cannot be verified. If that ever starts
  // succeeding, the README's lesson is wrong and this fails.
  const withMeasurement = parseQasm3(
    optimization.qasm.replace(
      "qubit[2] q;",
      "qubit[2] q;\nbit[2] c;",
    ) + "c[0] = measure q[0];\nc[1] = measure q[1];\n",
  ).circuit
  const unverifiable = optimizeWithZx(withMeasurement)
  assert.deepEqual(
    unverifiable.rewrites.map((entry) => entry.rewrite),
    optimized.rewrites.map((entry) => entry.rewrite),
    "the same rewrites must apply, or the two cases are not comparable",
  )
  assert.equal(
    unverifiable.equivalence.level,
    "INCONCLUSIVE",
    "a circuit with measurement cannot be compared as a statevector",
  )
  assert.ok(readme.includes(unverifiable.equivalence.reason), "the README quotes that reason verbatim")
  assert.match(readme, /separate\s+claims/i)
}

// ---------------------------------------------------------------------------
// docs/scope-and-limits.md must stay true.
//
// A limits document is the one that rots most usefully in the wrong direction:
// the project grows, the doc keeps understating, and eventually somebody reads
// "one decoder" beside a leaderboard with four. These pin the claims that would
// become false first -- and each is pinned against the code, not against a
// number typed twice.
// ---------------------------------------------------------------------------
{
  const limits = fs.readFileSync(new URL("../docs/scope-and-limits.md", import.meta.url), "utf8")
  const runnerSource = fs.readFileSync(
    new URL("../python/src/ketqat_runner/runner.py", import.meta.url),
    "utf8",
  )
  const noiseSource = fs.readFileSync(new URL("../src/engine/noise.ts", import.meta.url), "utf8")

  // Every decoder in the registry must appear in the document, and the document
  // must not list one that no longer exists.
  //
  // Derived from the registry rather than pinned to a literal count, because the
  // first version of this asserted "1" -- and there were already two. A decoder
  // named `ketqat-lookup` had been in the registry the whole time, implementing
  // truncated maximum-likelihood decoding with explicit abstention accounting.
  // A test that pins a number I typed only proves I typed it twice.
  const decoderSource = fs.readFileSync(
    new URL("../python/src/ketqat_runner/decoders.py", import.meta.url),
    "utf8",
  )
  const registered = [...decoderSource.matchAll(/^\s+name = "([a-z0-9-]+)"$/gm)].map((m) => m[1])
  assert.ok(registered.length >= 2, `expected the decoder registry to be findable, got ${registered.length}`)
  for (const decoder of registered) {
    assert.ok(
      limits.includes(`\`${decoder}\``),
      `docs/scope-and-limits.md does not mention the ${decoder} decoder`,
    )
  }

  // Exactly one noise model.
  assert.equal(
    (noiseSource.match(/^export const \w*NoiseSchema = z$/gm) ?? []).length,
    1,
    "a second noise model exists; the limits document still describes one",
  )
  assert.match(limits, /One model: \*\*depolarizing\*\*/)

  // The QEC path applies its own channels, and every one of them must appear in
  // the limits document with the Stim parameter it maps to.
  //
  // Derived from `_STIM_NOISE_CHANNELS` rather than pinned to a count, for the
  // same reason as the decoder registry above: the QEC path shipped for months
  // applying exactly one channel while a manifest could name three, so the
  // failure worth catching is the code growing a channel the document does not
  // mention -- which a hand-written number cannot catch.
  const channelBlock = runnerSource.match(
    /_STIM_NOISE_CHANNELS: dict\[str, str\] = \{([^}]*)\}/,
  )?.[1]
  assert.ok(channelBlock, "the QEC noise channel map should be findable")
  const channels = [...channelBlock.matchAll(/"([a-z_]+)":\s*"([a-z_]+)"/g)]
  assert.ok(channels.length >= 3, `expected the channel map to parse, got ${channels.length}`)

  // Channels applied by rewriting the circuit rather than by a generator
  // argument must be documented too. They are the easiest to forget precisely
  // because they are not in the map above.
  const postBlock = runnerSource.match(/_POST_NOISE_CHANNELS: tuple\[str, \.\.\.\] = \(([^)]*)\)/)?.[1]
  assert.ok(postBlock, "the post-injected channel tuple should be findable")
  const postChannels = [...postBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  assert.ok(postChannels.length >= 1, "expected at least one post-injected channel")
  for (const field of postChannels) {
    assert.ok(
      limits.includes(`\`${field}\``),
      `docs/scope-and-limits.md does not mention the ${field} channel`,
    )
  }
  for (const [, manifestField, stimParameter] of channels) {
    assert.ok(
      limits.includes(`\`${manifestField}\``),
      `docs/scope-and-limits.md does not mention the ${manifestField} channel`,
    )
    assert.ok(
      limits.includes(`\`${stimParameter}\``),
      `docs/scope-and-limits.md does not name the Stim parameter ${stimParameter}`,
    )
  }

  // Each channel must also be a comparability field. A channel that changes the
  // result but not the ranking coordinate would put two different experiments
  // on one leaderboard row and present them as a comparison.
  const statsSource = fs.readFileSync(
    new URL("../python/src/ketqat_runner/qec_statistics.py", import.meta.url),
    "utf8",
  )
  const comparability = statsSource.match(/COMPARABILITY_FIELDS = \(([\s\S]*?)\)/)?.[1]
  assert.ok(comparability, "COMPARABILITY_FIELDS should be findable")
  for (const manifestField of [...channels.map((c) => c[1]), ...postChannels]) {
    assert.ok(
      comparability.includes(`"${manifestField}"`),
      `${manifestField} changes the result but is not a comparability field`,
    )
  }

  // The code families the runner can actually execute, checked against the map
  // rather than against prose.
  const families = [...runnerSource.matchAll(/^\s+"([a-z-]+)":\s+"[a-z_]+:/gm)].map((m) => m[1])
  assert.ok(families.includes("repetition-code"), "the runner should still execute repetition codes")
  assert.ok(families.includes("color-code"), "the runner should still execute color codes")
  for (const family of ["surface code", "repetition code", "color code"]) {
    assert.ok(limits.toLowerCase().includes(family), `the limits document must list ${family}`)
  }

  // The simulator ceiling, quoted rather than remembered.
  const statevector = fs.readFileSync(new URL("../src/engine/statevector.ts", import.meta.url), "utf8")
  const ceiling = statevector.match(/MAX_SIMULATED_QUBITS = (\d+)/)?.[1]
  assert.ok(ceiling, "the statevector ceiling should be findable")
  assert.match(limits, new RegExp(`\\*\\*${ceiling} qubits maximum\\*\\*`), "the quoted ceiling is stale")

  // No provider may SUBMIT to hardware. Reading a real device's calibration is
  // a different thing and is allowed: it produces no result, spends no quota,
  // and compiling against a real coupling map is the point of a snapshot.
  //
  // This check took three attempts, and the wrong turns are worth recording.
  // Matching `backend.run(` flagged the IBM adapter, whose only such call is in
  // `run_on_fake_backend` and passes `seed_simulator` -- an argument that exists
  // only on a simulator. Matching `QiskitRuntimeService(` flagged it too, and
  // that service is used solely for `service.backends()`, which lists names.
  // Both would have failed a build over code that does exactly what the
  // document claims.
  //
  // What actually distinguishes submission is a *primitive* or a real task
  // handle, so that is what is matched.
  const submissionPatterns = [
    /\bSampler\s*\(/,          // IBM primitive: submits
    /\bEstimator\s*\(/,        // IBM primitive: submits
    /\bSession\s*\(/,          // IBM: opens a device session
    /AwsQuantumTask\s*\(/,     // Braket: a real task
    /AwsDevice\s*\([^)]*arn:/, // Braket: a real device by ARN
  ]
  for (const provider of ["ibm", "braket"]) {
    const source = fs
      .readFileSync(new URL(`../python/src/ketqat_runner/providers/${provider}.py`, import.meta.url), "utf8")
      .replace(/#.*$/gm, "")
      .replace(/"""[\s\S]*?"""/g, "")
    for (const pattern of submissionPatterns) {
      assert.ok(
        !pattern.test(source),
        `${provider} can submit to hardware via ${pattern}; the limits document says none does`,
      )
    }
  }
  assert.match(limits, /\*\*None\.\*\* No result in this project has touched a quantum device/)
}

// ---------------------------------------------------------------------------
// The two-decoder comparison must stay discoverable and stay a fair comparison.
//
// The manifest existed and `ketqat examples list` did not show it, so the one
// artifact that demonstrates the comparison machinery was invisible to anyone
// who did not read the source tree. A capability nobody can find is close to a
// capability that is not there.
// ---------------------------------------------------------------------------
{
  const examplesSource = fs.readFileSync(
    new URL("../python/src/ketqat_runner/examples.py", import.meta.url),
    "utf8",
  )
  assert.match(
    examplesSource,
    /name="decoder-comparison"/,
    "the decoder comparison must be listed by `ketqat examples list`",
  )

  const manifest = fs.readFileSync(
    new URL("../python/src/ketqat_runner/examples/qec/decoder-comparison.yaml", import.meta.url),
    "utf8",
  )
  // Two decoders, or it is not a comparison.
  const decoders = [...manifest.matchAll(/^\s+- name:\s*([a-z0-9-]+)/gm)].map((m) => m[1])
  assert.ok(decoders.length >= 2, `a comparison needs at least two decoders, found ${decoders.join(", ")}`)
  assert.ok(new Set(decoders).size === decoders.length, "the same decoder twice is not a comparison")

  // And the property that makes the comparison mean anything: both decoders see
  // the same shots. Re-sampling per decoder would compare luck as much as
  // decoders, and the manifest says so where someone editing it will read it.
  assert.match(manifest, /identical set of syndrome samples|same shots at the same coordinate seed/i)

  // The packaged copy and the repository copy must not drift.
  const repoCopy = fs.readFileSync(new URL("../examples/qec/decoder-comparison.yaml", import.meta.url), "utf8")
  assert.equal(manifest, repoCopy, "the packaged and repository copies of the example have drifted")
}
