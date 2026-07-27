import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { zodToJsonSchema } from "zod-to-json-schema"
import {
  AlgorithmBenchmarkResultSchema,
  AlgorithmExperimentManifestSchema,
  ArtifactRelationSchema,
  ArtifactSchema,
  BenchmarkSuiteSchema,
  CircuitTransformationSchema,
  QecBenchmarkResultSchema,
  QecExperimentManifestSchema,
  QuantumCardSchema,
  ReproducibilityBundleSchema,
  VerificationEvidenceSchema,
} from "../dist/index.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDir = resolve(root, "schemas")
// The Python runner validates against a copy packaged inside the wheel, and
// `resources.files("ketqat_runner")` finds that copy before the repository's
// `schemas/`. Writing both from this one generator is what keeps them from
// drifting: a stale packaged copy silently validates against an older contract,
// which is how a manifest can be rejected for using a field the TypeScript
// contract already accepts.
const pythonSchemaDir = resolve(root, "python", "src", "ketqat_runner", "schemas")
mkdirSync(outputDir, { recursive: true })
mkdirSync(pythonSchemaDir, { recursive: true })

/** Schemas the Python runner validates against, packaged inside the wheel. */
const PYTHON_VALIDATED_SCHEMAS = new Set([
  "qec-experiment-manifest.schema.json",
  "algorithm-experiment-manifest.schema.json",
  "qec-benchmark-result.schema.json",
  "algorithm-benchmark-result.schema.json",
])

const schemas = {
  "artifact.schema.json": ArtifactSchema,
  "benchmark-suite.schema.json": BenchmarkSuiteSchema,
  "qec-experiment-manifest.schema.json": QecExperimentManifestSchema,
  "algorithm-experiment-manifest.schema.json": AlgorithmExperimentManifestSchema,
  "qec-benchmark-result.schema.json": QecBenchmarkResultSchema,
  "algorithm-benchmark-result.schema.json": AlgorithmBenchmarkResultSchema,
  "verification-evidence.schema.json": VerificationEvidenceSchema,
  "reproducibility-bundle.schema.json": ReproducibilityBundleSchema,
  "quantum-card.schema.json": QuantumCardSchema,
  "artifact-relation.schema.json": ArtifactRelationSchema,
  "circuit-transformation.schema.json": CircuitTransformationSchema,
}

for (const [filename, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, {
    name: filename.replace(".schema.json", ""),
    target: "jsonSchema7",
    // "none" fully inlines repeated sub-schemas; "seen" collapsed repeats to {},
    // which left fields like the bundle-level environment unvalidated by JSON
    // Schema consumers. No contract is recursive, so full inlining is safe.
    $refStrategy: "none",
  })
  const serialized = `${JSON.stringify(jsonSchema, null, 2)}\n`
  writeFileSync(resolve(outputDir, filename), serialized)
  if (PYTHON_VALIDATED_SCHEMAS.has(filename)) {
    writeFileSync(resolve(pythonSchemaDir, filename), serialized)
  }
}
