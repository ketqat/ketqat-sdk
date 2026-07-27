import assert from "node:assert/strict"
import fs from "node:fs"
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
