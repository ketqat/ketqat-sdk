// The completeness rule: every schema field is classified, in both directions.
//
// A typed projection closes the name-matching hole by construction -- a key
// nobody declared is a key nothing reads -- and opens exactly one of its own.
// A *new* semantic field that nobody classifies stays out of the digest, so two
// records differing only there share one, and nothing says so. That is the
// mirror image of the denylist failure, and an allowlist without this file is
// not safer than a denylist, it is differently unsafe.
//
// So this file is what makes the projection safe rather than merely different.
// It walks each record kind's Zod schema -- the place a field is actually added
// -- and fails if the classification in `src/study/registry.ts` and the schema
// disagree in either direction:
//
//   * a schema field with no class, which is the silent-omission failure;
//   * a classified field the schema does not declare, which is a class left
//     behind by a rename and would make the first check pass by accident.
//
// The last two tests prove the check is not vacuous, by constructing both
// failures and asserting they are caught. A completeness test that passes
// because it found nothing to look at is the failure mode this design cannot
// afford, so the proof is automated rather than performed by hand once.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { z } from "zod"

import {
  STUDY_FIELD_CLASSES,
  STUDY_RECORD_KINDS,
  flattenSchemaFields,
  flattenShapeClasses,
} from "../dist/study/index.js"
import * as study from "../dist/study/index.js"

/** The Zod schema each declared record kind is the classification of. */
const SCHEMA_FOR_KIND = {
  study: study.StudySchema,
  study_event: study.StudyEventSchema,
  problem_specification: study.ProblemSpecificationSchema,
  study_plan: study.StudyPlanSchema,
  study_task: study.StudyTaskSchema,
  evidence_node: study.EvidenceNodeSchema,
  evidence_edge: study.EvidenceEdgeSchema,
  execution_capsule: study.ExecutionCapsuleSchema,
  research_package: study.ResearchPackageSchema,
}

/**
 * The two disagreements, as sorted lists.
 *
 * Returned rather than asserted so the same function can be pointed at a
 * deliberately broken pair below and asked whether it notices.
 */
function disagreements(shape, schema) {
  const classified = flattenShapeClasses(shape)
  const declared = new Set(flattenSchemaFields(schema))
  const unclassified = [...declared].filter((path) => !classified.has(path)).sort()
  const undeclared = [...classified.keys()].filter((path) => !declared.has(path)).sort()
  return { unclassified, undeclared, declared_count: declared.size, classified_count: classified.size }
}

test("every record kind in the registry has a schema to be checked against", () => {
  // A record kind absent from this table is a record kind nothing walks, which
  // would make the whole file pass by not looking.
  const kinds = STUDY_RECORD_KINDS.map((entry) => entry.record_kind).sort()
  assert.deepEqual(kinds, Object.keys(SCHEMA_FOR_KIND).sort())
  assert.equal(kinds.length, 9)
})

for (const entry of STUDY_RECORD_KINDS) {
  test(`${entry.record_kind}: every schema field is classified exactly once`, () => {
    const schema = SCHEMA_FOR_KIND[entry.record_kind]
    assert.ok(schema, `${entry.record_kind} has no schema in the table above`)
    const { unclassified, undeclared, declared_count, classified_count } = disagreements(
      entry.shape,
      schema,
    )
    // Two empty lists are also what a walk that found nothing produces, so the
    // counts are asserted before the difference is: this test must fail by
    // disagreeing, never by having nothing to disagree about.
    assert.ok(declared_count >= 9, `${entry.record_kind} schema walk found ${declared_count} fields`)
    assert.equal(declared_count, classified_count)
    assert.deepEqual(
      unclassified,
      [],
      `${entry.record_kind} declares these fields in its schema and classifies none of them. An unclassified ` +
        "field is not in any projection, so two records differing only there take one digest. Add it to " +
        "src/study/registry.ts as SEMANTIC, RECORD_ONLY, RECEIPT_ONLY or DERIVED.",
    )
    assert.deepEqual(
      undeclared,
      [],
      `${entry.record_kind} classifies these fields and its schema declares none of them. A class left behind ` +
        "by a rename makes the check above pass on a field that no longer exists.",
    )
  })

  test(`${entry.record_kind}: every class is one of the four`, () => {
    const allowed = new Set(STUDY_FIELD_CLASSES)
    for (const [path, fieldClass] of flattenShapeClasses(entry.shape)) {
      assert.ok(allowed.has(fieldClass), `${entry.record_kind}.${path} has class ${fieldClass}`)
    }
  })

  test(`${entry.record_kind}: the header components and the self-hash are DERIVED`, () => {
    // These three cannot be inputs to a digest that covers them: two are
    // committed to by the preimage header, and the third is the digest itself.
    const classified = flattenShapeClasses(entry.shape)
    for (const name of ["schema_version", "hash_rules_id", entry.self_hash_field]) {
      assert.equal(classified.get(name), "DERIVED", `${entry.record_kind}.${name}`)
    }
  })
}

test("the check is not vacuous: an unclassified schema field fails it", () => {
  // The proof, run every time rather than performed by hand once. A field added
  // to a schema and to nothing else is exactly the silent omission a projection
  // would otherwise hide, so the check has to notice it here.
  const entry = STUDY_RECORD_KINDS.find((candidate) => candidate.record_kind === "study_task")
  const clean = disagreements(entry.shape, SCHEMA_FOR_KIND.study_task)
  assert.deepEqual(clean.unclassified, [])

  const withSmuggledField = SCHEMA_FOR_KIND.study_task.extend({
    smuggled_semantic_field: z.string(),
  })
  const broken = disagreements(entry.shape, withSmuggledField)
  assert.deepEqual(broken.unclassified, ["smuggled_semantic_field"])
  assert.deepEqual(broken.undeclared, [])
})

test("the check is not vacuous: a nested unclassified field fails it too", () => {
  // Nesting is where a denylist kept finding new holes, so the proof covers it.
  // A field added inside an embedded shape is as invisible to a digest as one
  // added at the root, and has to fail the same way.
  const entry = STUDY_RECORD_KINDS.find((candidate) => candidate.record_kind === "study_task")
  const withNestedField = SCHEMA_FOR_KIND.study_task.extend({
    plan_ref: study.RevisionRefSchema.extend({ smuggled_nested_field: z.string() }),
  })
  const broken = disagreements(entry.shape, withNestedField)
  assert.deepEqual(broken.unclassified, ["plan_ref.smuggled_nested_field"])
})

test("the check is not vacuous: a classification with no schema field fails it", () => {
  // The other direction. A class left behind by a rename would make the first
  // check pass while the projection read a field that is gone.
  const entry = STUDY_RECORD_KINDS.find((candidate) => candidate.record_kind === "study_task")
  const stale = {
    name: entry.shape.name,
    fields: [...entry.shape.fields, { name: "renamed_away", field_class: "SEMANTIC", value: { kind: "leaf" } }],
  }
  const broken = disagreements(stale, SCHEMA_FOR_KIND.study_task)
  assert.deepEqual(broken.undeclared, ["renamed_away"])
})

test("the schema walk finds fields behind ZodEffects, which is how it stays honest", () => {
  // `StudyQuantitySchema` is an object behind a `superRefine`. A walk that did
  // not unwrap it would report zero fields, every comparison would be a
  // comparison of two empty sets, and the whole file would pass by finding
  // nothing. This asserts the walk actually reaches through.
  const fields = flattenSchemaFields(study.StudyQuantitySchema)
  assert.ok(fields.includes("value"))
  assert.ok(fields.includes("uncertainty.kind"))
  assert.ok(fields.length >= 12, `expected the full Quantity envelope, got ${fields.length} fields`)
})

test("the classification walk reaches nested and array-of-object shapes", () => {
  // The same guard for the other side of the comparison.
  const entry = STUDY_RECORD_KINDS.find((candidate) => candidate.record_kind === "research_package")
  const classified = flattenShapeClasses(entry.shape)
  assert.equal(classified.get("nodes.claim.value.unit"), "SEMANTIC")
  assert.equal(classified.get("environment.packages.name"), "SEMANTIC")
  assert.equal(classified.get("figures.svg"), "RECORD_ONLY")
  assert.ok(classified.size > 60, `expected a deep classification, got ${classified.size} entries`)
})

test("the shape tables Python projects from are the ones this registry declares", () => {
  // Python reads emitted tables rather than restating them, so that this file's
  // walk is watching the classification both languages actually use. That only
  // holds while the emitted copy matches the source, and the emitted copy is a
  // build output somebody can edit or forget to regenerate -- so the comparison
  // is byte for byte against a fresh serialization rather than a spot check.
  //
  // Serialized here the way `scripts/generate-study-shapes.mjs` serializes it.
  // Two copies of that walk would be two things to keep in step; this one is
  // short enough that repeating it costs less than exporting it would.
  const serializeValue = (value) =>
    value.kind === "leaf"
      ? { kind: "leaf" }
      : value.kind === "array"
        ? { kind: "array", item: serializeValue(value.item) }
        : { kind: "object", shape: serializeShape(value.shape) }
  const serializeShape = (shape) => ({
    name: shape.name,
    fields: shape.fields.map((declaration) => ({
      name: declaration.name,
      field_class: declaration.field_class,
      value: serializeValue(declaration.value),
    })),
  })

  const emitted = JSON.parse(
    readFileSync(
      new URL("../python/src/ketqat_runner/schemas/study-record-shapes.json", import.meta.url),
      "utf8",
    ),
  )
  assert.equal(emitted.field_classes.join(","), STUDY_FIELD_CLASSES.join(","))
  assert.deepEqual(
    emitted.record_kinds,
    STUDY_RECORD_KINDS.map((entry) => ({
      record_kind: entry.record_kind,
      self_hash_field: entry.self_hash_field,
      self_hash_purpose: entry.self_hash_purpose,
      shape: serializeShape(entry.shape),
    })),
    "the emitted shape tables are stale; run `npm run build`",
  )
})
