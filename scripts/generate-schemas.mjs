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
  ProtocolBenchmarkResultSchema,
  ProtocolExperimentManifestSchema,
  QecBenchmarkResultSchema,
  QecExperimentManifestSchema,
  QEC_CODE_CATALOG,
  QuantumCardSchema,
  ReproducibilityBundleSchema,
  VerificationEvidenceSchema,
  QuantumWorkloadSchema,
  ClassicalBaselineSchema,
  ResourceScenarioSchema,
  HardwareModelSnapshotSchema,
  QecModelSnapshotSchema,
  EconomicModelSchema,
  ResourceEstimateSnapshotSchema,
  AdvantageThresholdSchema,
  DecisionAssessmentSchema,
  ResourceIntelligenceBundleSchema,
  StudySchema,
  StudyEventSchema,
  ProblemSpecificationSchema,
  StudyPlanSchema,
  ConfirmationReceiptSchema,
  StudyTaskAuthorizationSchema,
  StudyExecutionJobSchema,
  TaskOutcomeSchema,
  EvidenceNodeSchema,
  EvidenceEdgeSchema,
  ReviewRecordSchema,
  ReproductionRecordSchema,
  ExecutionCapsuleSchema,
  ResearchPackageSchema,
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
  // The whole study family ships, not the subset Python happens to validate
  // today: `study_validation.py` resolves any of the nine by kind, and a schema
  // present in a checkout but absent from the wheel validates for maintainers
  // and for nobody who installed the package.
  "study.schema.json",
  "study-event.schema.json",
  "problem-specification.schema.json",
  "study-plan.schema.json",
  "confirmation-receipt.schema.json",
  "study-task-authorization.schema.json",
  "execution-job.schema.json",
  "task-outcome.schema.json",
  "evidence-node.schema.json",
  "evidence-edge.schema.json",
  "review-record.schema.json",
  "reproduction-record.schema.json",
  "execution-capsule.schema.json",
  "research-package.schema.json",
])

const schemas = {
  "artifact.schema.json": ArtifactSchema,
  "benchmark-suite.schema.json": BenchmarkSuiteSchema,
  "qec-experiment-manifest.schema.json": QecExperimentManifestSchema,
  "algorithm-experiment-manifest.schema.json": AlgorithmExperimentManifestSchema,
  "qec-benchmark-result.schema.json": QecBenchmarkResultSchema,
  "algorithm-benchmark-result.schema.json": AlgorithmBenchmarkResultSchema,
  "protocol-experiment-manifest.schema.json": ProtocolExperimentManifestSchema,
  "protocol-benchmark-result.schema.json": ProtocolBenchmarkResultSchema,
  "verification-evidence.schema.json": VerificationEvidenceSchema,
  "reproducibility-bundle.schema.json": ReproducibilityBundleSchema,
  "quantum-card.schema.json": QuantumCardSchema,
  "artifact-relation.schema.json": ArtifactRelationSchema,
  "circuit-transformation.schema.json": CircuitTransformationSchema,
  // Resource intelligence (ketqat-sdk#236). Additive: no existing schema changes.
  "quantum-workload.schema.json": QuantumWorkloadSchema,
  "classical-baseline.schema.json": ClassicalBaselineSchema,
  "resource-scenario.schema.json": ResourceScenarioSchema,
  "hardware-model-snapshot.schema.json": HardwareModelSnapshotSchema,
  "qec-model-snapshot.schema.json": QecModelSnapshotSchema,
  "economic-model.schema.json": EconomicModelSchema,
  "resource-estimate-snapshot.schema.json": ResourceEstimateSnapshotSchema,
  "advantage-threshold.schema.json": AdvantageThresholdSchema,
  "decision-assessment.schema.json": DecisionAssessmentSchema,
  "resource-intelligence-bundle.schema.json": ResourceIntelligenceBundleSchema,
  // The study contract family (ketqat-sdk#259). Additive: no existing schema
  // changes, and every one of these enters at schema_version 1.0 under the
  // study-v1 hash rules rather than inheriting the legacy versioning.
  "study.schema.json": StudySchema,
  "study-event.schema.json": StudyEventSchema,
  "problem-specification.schema.json": ProblemSpecificationSchema,
  "study-plan.schema.json": StudyPlanSchema,
  "confirmation-receipt.schema.json": ConfirmationReceiptSchema,
  "study-task-authorization.schema.json": StudyTaskAuthorizationSchema,
  // Emitted like every other contract even though nothing hashes it: the
  // Python side validates a job it is handed, and a record with no schema is a
  // record only one language can check. Its shape is the statement -- no
  // `hash_rules_id`, no hash field (`task.ts`).
  "execution-job.schema.json": StudyExecutionJobSchema,
  "task-outcome.schema.json": TaskOutcomeSchema,
  "evidence-node.schema.json": EvidenceNodeSchema,
  "evidence-edge.schema.json": EvidenceEdgeSchema,
  "review-record.schema.json": ReviewRecordSchema,
  "reproduction-record.schema.json": ReproductionRecordSchema,
  "execution-capsule.schema.json": ExecutionCapsuleSchema,
  "research-package.schema.json": ResearchPackageSchema,
}

// The QEC code catalog is data, not a schema, and is emitted to both locations
// for the same reason: the Python runner must read one source rather than keep
// a second hand-maintained copy that can drift.
const catalogJson = `${JSON.stringify({ schema_version: "0.1", codes: QEC_CODE_CATALOG }, null, 2)}\n`
writeFileSync(resolve(outputDir, "qec-code-catalog.json"), catalogJson)
writeFileSync(resolve(pythonSchemaDir, "qec-code-catalog.json"), catalogJson)

/**
 * Refuse to emit a schema that would validate anything.
 *
 * An empty JSON Schema -- `{}` -- accepts every document. A generator that
 * silently produces one turns every downstream contract check into a
 * no-op while every build stays green, which is the worst failure mode
 * available to a validation pipeline: it does not break, it stops
 * objecting.
 *
 * This has already happened here once. `$refStrategy: "seen"` collapsed
 * repeated sub-schemas to `{}` and left fields like the bundle-level
 * environment unvalidated; the comment above records the fix but no check
 * was added, so nothing would have caught a recurrence.
 *
 * It recurs. Building with zod 4 emits `{}` for all eleven definitions --
 * `zod-to-json-schema` does not understand zod 4's internals -- and the
 * full test suite passes, because `verify-schema-sync` compares the
 * TypeScript copy against the Python copy and both are equally empty.
 * Two copies of the same nothing agree perfectly.
 *
 * So the generator checks its own output, at the point where the
 * information to judge it still exists.
 */
function assertSchemaIsNotVacuous(filename, jsonSchema, zodSchema) {
  const definitions = jsonSchema.definitions ?? {}
  const [name] = Object.keys(definitions)
  const definition = name ? definitions[name] : jsonSchema

  if (!definition || Object.keys(definition).length === 0) {
    throw new Error(
      `${filename}: the generated schema is empty, so it would accept any document. ` +
        "This usually means zod-to-json-schema does not understand the installed zod version.",
    )
  }

  // A schema with no properties and no composition constrains nothing beyond
  // "is an object", which is not a contract.
  const constrains =
    (definition.properties && Object.keys(definition.properties).length > 0) ||
    definition.anyOf ||
    definition.oneOf ||
    definition.allOf
  if (!constrains) {
    throw new Error(`${filename}: the generated schema declares no properties and no composition.`)
  }

  // Every field the zod object declares must survive into the output. This is
  // the check that ties the artifact to its source of truth rather than to a
  // shape it merely resembles.
  const shape = zodSchema?._def?.shape
  const zodKeys = typeof shape === "function" ? Object.keys(shape()) : shape ? Object.keys(shape) : []
  if (zodKeys.length > 0 && definition.properties) {
    const missing = zodKeys.filter((key) => !(key in definition.properties))
    if (missing.length > 0) {
      throw new Error(
        `${filename}: fields present in the zod schema are absent from the generated JSON Schema: ` +
          `${missing.join(", ")}. Documents violating them would validate.`,
      )
    }
  }

  // And no nested field may be an unconstrained `{}` -- the original bug.
  const vacuous = []
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    for (const [key, value] of Object.entries(node.properties ?? {})) {
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
        vacuous.push(`${path}.${key}`)
      }
      walk(value, `${path}.${key}`)
    }
    for (const key of ["items", "additionalProperties"]) {
      if (node[key] && typeof node[key] === "object") walk(node[key], `${path}.${key}`)
    }
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(node[key])) node[key].forEach((item, index) => walk(item, `${path}.${key}[${index}]`))
    }
  }
  walk(definition, name ?? "root")
  if (vacuous.length > 0) {
    throw new Error(
      `${filename}: these fields generated an empty schema and would accept any value: ${vacuous.join(", ")}.`,
    )
  }
}

/**
 * Schemas that reference repeated sub-schemas rather than inlining them.
 *
 * Every resource-intelligence contract wraps its numbers in the same `Quantity`
 * envelope -- around thirty times in one estimate, and an estimate appears
 * inside the bundle alongside a threshold and an assessment that do the same.
 * Fully inlined, `resource-intelligence-bundle.schema.json` was 216 KB of the
 * same object repeated.
 *
 * "root" emits in-document `$ref` pointers for the repeats. That is *not* the
 * `"seen"` strategy that once collapsed sub-schemas to `{}` and left fields
 * unvalidated: a `$ref` resolves to the real constraint, and the vacuity check
 * below still runs over the output. The older contracts keep full inlining so
 * no already-published schema document changes shape.
 */
const REFERENCED_SCHEMAS = new Set([
  "quantum-workload.schema.json",
  "classical-baseline.schema.json",
  "resource-scenario.schema.json",
  "hardware-model-snapshot.schema.json",
  "qec-model-snapshot.schema.json",
  "economic-model.schema.json",
  "resource-estimate-snapshot.schema.json",
  "advantage-threshold.schema.json",
  "decision-assessment.schema.json",
  "resource-intelligence-bundle.schema.json",
  // The study family repeats the same envelopes just as heavily -- a `Quantity`
  // inside every typed field, a `RevisionRef` at every pointer, and a research
  // package that carries a whole evidence graph inline.
  "study.schema.json",
  "study-event.schema.json",
  "problem-specification.schema.json",
  "study-plan.schema.json",
  "confirmation-receipt.schema.json",
  "study-task-authorization.schema.json",
  "task-outcome.schema.json",
  "evidence-node.schema.json",
  "evidence-edge.schema.json",
  "review-record.schema.json",
  "reproduction-record.schema.json",
  "execution-capsule.schema.json",
  "research-package.schema.json",
])

for (const [filename, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, {
    name: filename.replace(".schema.json", ""),
    target: "jsonSchema7",
    ...(REFERENCED_SCHEMAS.has(filename) ? { $refStrategy: "root" } : {}),
    // "none" fully inlines repeated sub-schemas; "seen" collapsed repeats to {},
    // which left fields like the bundle-level environment unvalidated by JSON
    // Schema consumers. No contract is recursive, so full inlining is safe.
    ...(REFERENCED_SCHEMAS.has(filename) ? {} : { $refStrategy: "none" }),
  })
  assertSchemaIsNotVacuous(filename, jsonSchema, schema)
  const serialized = `${JSON.stringify(jsonSchema, null, 2)}\n`
  writeFileSync(resolve(outputDir, filename), serialized)
  if (PYTHON_VALIDATED_SCHEMAS.has(filename)) {
    writeFileSync(resolve(pythonSchemaDir, filename), serialized)
  }
}
