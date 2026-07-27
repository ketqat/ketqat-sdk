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
mkdirSync(outputDir, { recursive: true })

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
  writeFileSync(resolve(outputDir, filename), `${JSON.stringify(jsonSchema, null, 2)}\n`)
}
