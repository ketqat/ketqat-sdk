import assert from "node:assert/strict"
import {
  AlgorithmExperimentManifestSchema,
  ArtifactSchema,
  QecExperimentManifestSchema,
  calculateReproducibilityHash,
  compareRunCompatibility,
  demoArtifacts,
  demoBenchmarkSuites,
  demoRuns,
  findComparableMetricCoordinates,
} from "../dist/index.js"

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
assert.equal(calculateReproducibilityHash(qecRun), qecRun.reproducibility_hash)
assert.equal(compareRunCompatibility(qecRun, algorithmRun, demoBenchmarkSuites).compatible, false)
assert.deepEqual(findComparableMetricCoordinates(qecRun, algorithmRun), [])
assert.equal(compareRunCompatibility(qecRun, { ...qecRun, name: "copy" }, demoBenchmarkSuites).compatible, true)
