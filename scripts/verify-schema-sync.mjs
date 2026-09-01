#!/usr/bin/env node
/**
 * Fail if the schemas packaged for the Python runner drift from the generated
 * ones.
 *
 * The Python validator resolves `resources.files("ketqat_runner")/schemas`
 * before falling back to the repository's `schemas/`, so the packaged copy is
 * what actually validates a manifest. When the two drift, the runner rejects
 * input the TypeScript contract already accepts, and the error names the field
 * rather than the staleness — which sends you looking in the wrong place.
 *
 * `generate-schemas.mjs` writes both copies from one source. This check exists
 * so a hand-edited or partially-regenerated tree fails loudly instead.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const generatedDir = resolve(root, "schemas")
const packagedDir = resolve(root, "python", "src", "ketqat_runner", "schemas")

const PYTHON_VALIDATED_SCHEMAS = [
  "qec-experiment-manifest.schema.json",
  "algorithm-experiment-manifest.schema.json",
  "qec-benchmark-result.schema.json",
  "algorithm-benchmark-result.schema.json",
  "qec-code-catalog.json",
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
]

const drifted = []
for (const filename of PYTHON_VALIDATED_SCHEMAS) {
  let generated
  let packaged
  try {
    generated = readFileSync(resolve(generatedDir, filename), "utf8")
  } catch {
    drifted.push(`${filename}: missing from schemas/ (run \`npm run build\`)`)
    continue
  }
  try {
    packaged = readFileSync(resolve(packagedDir, filename), "utf8")
  } catch {
    drifted.push(`${filename}: missing from the packaged Python schemas`)
    continue
  }
  if (generated !== packaged) {
    drifted.push(`${filename}: packaged copy differs from the generated one`)
  }
}

if (drifted.length > 0) {
  console.error("Python-packaged schemas are out of sync with the generated schemas:\n")
  for (const entry of drifted) {
    console.error(`  ${entry}`)
  }
  console.error("\nRun: npm run build")
  process.exit(1)
}

console.log(`Verified Python-packaged schemas match the generated ones: ${PYTHON_VALIDATED_SCHEMAS.length} files.`)
