// A field named after an excluded key vanishes from the hash -- at every nesting level.
//
// The canonicalizer drops excluded keys recursively, so a *nested* field whose name happens to
// match one is silently removed from the payload before hashing. At the top level that is the
// point: `created_at`, `status` and `id` are volatile and must not move a hash. Nested, it is a
// defect that content-addressing cannot survive: `reference.slug` once made two evidence nodes
// pointing at different registry records hash identically, because `slug` is an identity key.
//
// This test walks the generated study schemas and fails on any property, below the root, whose
// name is in the exclusion set. Root-level properties are exempt -- that is where the exclusions
// are meant to bite.
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import { STUDY_EXCLUDED_KEYS } from "../dist/study/hashing.js"

const here = dirname(fileURLToPath(import.meta.url))
const schemaDir = join(here, "..", "schemas")

const STUDY_SCHEMAS = [
  "study.schema.json",
  "study-event.schema.json",
  "problem-specification.schema.json",
  "study-plan.schema.json",
  "study-task.schema.json",
  "evidence-node.schema.json",
  "evidence-edge.schema.json",
  "execution-capsule.schema.json",
  "research-package.schema.json",
]

/**
 * Walk a schema, reporting excluded-key names found *below* a record's own top level.
 *
 * `depth` counts object levels inside the record: the record's direct properties are depth 0,
 * where the exclusions are meant to bite, and anything deeper is a sub-object whose fields the
 * canonicalizer would strip without anybody intending it.
 */
function collect(node, path, depth, found) {
  if (node === null || typeof node !== "object") return
  if (Array.isArray(node)) {
    node.forEach((entry, index) => collect(entry, `${path}[${index}]`, depth, found))
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      // An embedded whole record -- a study record carries `hash_rules_id`, a Quantity envelope
      // carries `evidence` -- is a root in its own right, so the exclusions legitimately bite at
      // *its* top level too. Descending into one resets the depth rather than reporting its own
      // metadata as a nesting mistake.
      const isEmbeddedRecord = "hash_rules_id" in value || ("evidence" in value && "value" in value)
      const here = isEmbeddedRecord ? 0 : depth
      for (const [name, schema] of Object.entries(value)) {
        if (here > 0) found.push({ name, path: `${path}.${name}` })
        collect(schema, `${path}.${name}`, here + 1, found)
      }
      continue
    }
    // anyOf/allOf/items and friends stay at the same object level; only `properties` descends.
    collect(value, `${path}.${key}`, depth, found)
  }
}

test("no study schema nests a property named after an excluded key", () => {
  const available = new Set(readdirSync(schemaDir))
  const collisions = []

  for (const file of STUDY_SCHEMAS) {
    assert.ok(available.has(file), `${file} is missing from schemas/ -- generation is incomplete`)
    const document = JSON.parse(readFileSync(join(schemaDir, file), "utf8"))

    const found = []
    collect(document, file.replace(".schema.json", ""), 0, found)
    for (const definition of Object.values(document.definitions ?? document.$defs ?? {})) {
      collect(definition, file.replace(".schema.json", ""), 0, found)
    }

    for (const { name, path } of found) {
      if (!STUDY_EXCLUDED_KEYS.has(name)) continue
      collisions.push(`${path} is named "${name}", which study-v1 drops before hashing`)
    }
  }

  assert.deepEqual(
    collisions,
    [],
    `A nested field named after an excluded key is dropped before hashing, so two records that ` +
      `differ only there are content-addressed identically:\n${collisions.join("\n")}`,
  )
})
