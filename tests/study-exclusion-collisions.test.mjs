// A field named after an excluded key vanishes from the hash -- at every nesting level.
//
// The canonicalizer drops excluded keys recursively, so a *nested* field whose name happens to
// match one is silently removed from the payload before hashing. At the top level that is the
// point: `created_at`, `status` and `id` are volatile and must not move a hash. Nested, it is a
// defect that content-addressing cannot survive: `reference.slug` once made two evidence nodes
// pointing at different registry records hash identically, because `slug` is an identity key.
//
// This file checks that from both ends, because a schema and a payload hide the defect
// differently.
//
// The first test derives the list of study schemas from the directory rather than trusting the
// one written below it, because a schema this file does not walk is a schema nothing checks.
// The second walks them and fails on any property, below the root, whose name is in the
// exclusion set. Root-level properties are exempt -- that is where the exclusions are meant to
// bite.
//
// The rest walk actual record *data*, which is the half no schema can answer for. A study record
// used to carry `EnvironmentSchema`'s `packages: z.record(z.string())` and `hardware:
// z.record(...)`, maps whose keys arrive at run time and appear in no schema: a dependency
// genuinely named `id`, or a hardware key named `visibility`, was dropped at every depth exactly
// as a declared field would be, and nothing in the generated JSON said so. `StudyEnvironment`
// records those names in declared fields instead, so the data half is now about what survives
// when a caller hands the hashing layer a dict no schema has seen -- which is what
// `calculateStudyHash` accepts, and what the Python verifier is given.
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import {
  STUDY_EXCLUDED_KEYS,
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  assertNoNestedExcludedKeys,
  calculateStudyHash,
  canonicalStudyJson,
  studyRulesIdOf,
} from "../dist/study/hashing.js"
import { STUDY_SCHEMA_VERSION } from "../dist/study/common.js"
import { buildExecutionCapsule, verifyExecutionCapsule } from "../dist/study/capsule.js"
import * as study from "../dist/study/index.js"
import { QuantitySchema, UncertaintySchema } from "../dist/intelligence/measurement.js"

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
 * The root record a generated schema describes, past the `$ref` wrapper.
 *
 * `zodToJsonSchema` emits `{ "$ref": "#/definitions/<name>", "definitions": ... }`
 * for the referenced schemas and an inline object for the rest, so both shapes
 * have to be handled to ask one question of every file in the directory.
 */
function rootDefinition(document) {
  const ref = typeof document.$ref === "string" ? document.$ref : null
  if (ref === null || !ref.startsWith("#/definitions/")) return document
  return (document.definitions ?? {})[ref.slice("#/definitions/".length)] ?? document
}

/**
 * Every study schema on disk, found rather than listed.
 *
 * A study record names its own hash rules -- that is the marker the family is
 * built on -- so a generated schema whose root declares `hash_rules_id` as a
 * const of `study-v1` is a study schema, whatever it is called. Finding them
 * this way is the point: the list below was hand-written, and a tenth record
 * kind added to the generator would have been emitted, shipped, and silently
 * excluded from the collision walk this file exists to perform. A test that
 * checks nine of ten schemas passes exactly as loudly as one that checks ten.
 */
function studySchemaFilesOnDisk() {
  const found = []
  for (const file of readdirSync(schemaDir)) {
    if (!file.endsWith(".schema.json")) continue
    const document = JSON.parse(readFileSync(join(schemaDir, file), "utf8"))
    const marker = rootDefinition(document).properties?.[STUDY_HASH_RULES_KEY]
    if (marker?.const === STUDY_HASH_RULES_ID) found.push(file)
  }
  return found.sort()
}

test("the checked list is every study schema the generator emits", () => {
  assert.deepEqual(
    studySchemaFilesOnDisk(),
    [...STUDY_SCHEMAS].sort(),
    "a study schema on disk that this file does not walk is a schema nothing checks for excluded-key collisions",
  )
})

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
      // An embedded whole record -- a study record declares `hash_rules_id` as a const of the
      // rules id, a Quantity envelope declares `evidence` -- is a root in its own right, so the
      // exclusions legitimately bite at *its* top level too. Descending into one resets the depth
      // rather than reporting its own metadata as a nesting mistake. The marker is read as the
      // hashing layer reads it: a field that merely exists is not a rules id.
      const isEmbeddedRecord =
        value.hash_rules_id?.const === STUDY_HASH_RULES_ID || ("evidence" in value && "value" in value)
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

// ------------------------------------------------------- the same defect, in data

const capsuleInput = {
  studyRef: "d".repeat(64),
  taskRef: "e".repeat(64),
  manifestHash: "f".repeat(64),
  engine: { name: "ketqat-engine", version: "0.3.0" },
  sourceHash: "a".repeat(64),
  executionClass: "SIMULATION",
  environment: { operating_system: "Linux", packages: [], hardware: [] },
}

// The reviewer's case, kept because it is the one that got through: two capsules whose only
// difference is a package literally named `id`. Both hashed to
// f02078067b3914977d6048da4e988b6c9b3a26543cc5526aee9f2cead80e46d6, and a capsule carrying the
// other's environment verified against its own digest. A map of run-time keys is not a shape this
// family accepts any more, so the refusal now comes from the schema -- one gate earlier than the
// hashing walk, and for the reason the walk was only ever compensating for.
test("an environment shaped as a map of run-time keys is not a capsule at all", () => {
  const withPackage = (version) => ({
    ...capsuleInput,
    environment: { ...capsuleInput.environment, packages: { id: version } },
  })
  assert.throws(() => buildExecutionCapsule(withPackage("1.0.0")), /Expected array, received object/)
  assert.throws(() => buildExecutionCapsule(withPackage("2.0.0")), /Expected array, received object/)
})

test("a capsule whose environment is map-shaped cannot be verified either", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  // The forgery the collision enabled: one capsule's hash over another's environment. The point
  // is not that this record is rejected as tampered -- it is that a record whose hash cannot see
  // its own environment is refused before any comparison is made. The verifier asks "can this be
  // hashed" before "is this a capsule", so the answer is the hashing refusal and not the shape
  // one, which is the order that sends a reader to the right bug.
  const forged = {
    ...capsule,
    environment: { ...capsule.environment, packages: { id: "2.0.0" } },
  }
  const verification = verifyExecutionCapsule(forged)
  assert.equal(verification.valid, false)
  assert.deepEqual(
    verification.refusals.map((refusal) => refusal.code),
    ["STUDY_EXCLUDED_KEY_NESTED"],
  )
  assert.equal(verification.problems[0].includes("environment.packages.id"), true)
  // Reported as a hashing refusal, not as a hash mismatch: the digest was never taken.
  assert.equal(verification.expected_hash, "")
})

// ------------------------------------------------- the three routes into the exemption
//
// Each of these was schema-valid, and each bought the "embedded record" exemption with data
// rather than with a schema: an object under `hardware` carrying a marker, an object under
// `hardware` shaped like a `Quantity` envelope, and a dependency literally named `hash_rules_id`.
// The exemption then let the canonicalizer drop `id` inside it, so two environments hashed
// identically and a capsule verified against a digest that could not see its own environment.
//
// The routes are closed twice over: `StudyEnvironment` has no key a producer chooses, so none of
// these is representable as a capsule; and the hashing layer, which takes any object at all,
// exempts an embedded record only for the three excluded names such a record declares.
const FORGING_ROUTES = {
  "hardware.x.{hash_rules_id, id}": (id) => ({ accelerator: { hash_rules_id: "junk", id } }),
  "hardware.x.{value, evidence, id}": (id) => ({ accelerator: { value: 1, evidence: "MEASURED", id } }),
}

test("an object under hardware cannot buy the embedded-record exemption", () => {
  for (const [route, hardware] of Object.entries(FORGING_ROUTES)) {
    for (const id of ["gpu-0", "gpu-1"]) {
      assert.throws(
        () => buildExecutionCapsule({ ...capsuleInput, environment: { ...capsuleInput.environment, hardware: hardware(id) } }),
        /Expected array, received object/,
        `${route} must not be a capsule`,
      )
    }
    // And at the hashing layer, where there is no schema to refuse it first.
    assert.throws(
      () => calculateStudyHash({ [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID, hardware: hardware("gpu-0") }),
      /must not carry an excluded key below its own top level/,
      `${route} must not vanish from a digest`,
    )
  }
})

test("a dependency named after the rules marker cannot buy it either", () => {
  const withDependency = (version) => ({
    ...capsuleInput,
    environment: { ...capsuleInput.environment, packages: { hash_rules_id: version } },
  })
  assert.throws(() => buildExecutionCapsule(withDependency("1.0.0")), /Expected array, received object/)

  // A dependency name is a value now, so two versions of a package called `hash_rules_id` are two
  // different capsules -- which is the whole difference between recording a name and using it as
  // a key the canonicalizer is allowed to drop.
  const asValues = (version) =>
    buildExecutionCapsule({
      ...capsuleInput,
      environment: { ...capsuleInput.environment, packages: [{ name: "hash_rules_id", version }] },
    })
  assert.notEqual(asValues("1.0.0").reproducibility_hash, asValues("2.0.0").reproducibility_hash)

  // And at the hashing layer: a marker naming no known rule set is not a marker, so the object
  // carrying it is not an embedded record and its `hash_rules_id` is refused rather than dropped.
  assert.throws(
    () => calculateStudyHash({ [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID, packages: { hash_rules_id: "1.0.0" } }),
    /must not carry an excluded key below its own top level/,
  )
})

test("two environments that differ are two capsules", () => {
  const withAccelerator = (id) =>
    buildExecutionCapsule({
      ...capsuleInput,
      environment: { ...capsuleInput.environment, hardware: [{ name: "accelerator", value: id }] },
    })
  assert.notEqual(withAccelerator("gpu-0").reproducibility_hash, withAccelerator("gpu-1").reproducibility_hash)

  // The forgery itself: B's environment under A's digest. It verified `valid: true` for as long as
  // the difference between the two lived in a key the canonicalizer dropped.
  const forged = { ...withAccelerator("gpu-0"), environment: withAccelerator("gpu-1").environment }
  assert.equal(verifyExecutionCapsule(forged).valid, false)
})

test("an undeclared key is refused rather than stripped, so both languages read one record", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  // `owner_username` is the case that hid best: undeclared by the contract *and* excluded from
  // the digest, so zod stripped it, the hash did not move, and `verifyExecutionCapsule` reported
  // the record intact -- while the generated schema, which has always said
  // `additionalProperties: false`, refused the same file in Python.
  for (const undeclared of ["owner_username", "smuggled_root_key"]) {
    const verification = verifyExecutionCapsule({ ...capsule, [undeclared]: "somebody-else" })
    assert.equal(verification.valid, false, `${undeclared} must not pass`)
    assert.equal(
      verification.problems.some((problem) => /[Uu]nrecognized key/.test(problem)),
      true,
      verification.problems.join(" "),
    )
  }

  // The agreement is between the parse and the emitted schema, so the schema is asserted too: a
  // generator that stopped emitting the constraint would leave Python permissive and this file
  // green.
  for (const file of STUDY_SCHEMAS) {
    const document = JSON.parse(readFileSync(join(schemaDir, file), "utf8"))
    assert.equal(
      rootDefinition(document).additionalProperties,
      false,
      `${file} must refuse undeclared properties, as the zod parse now does`,
    )
  }
})

test("the exclusions still bite at a record's own top level, and at an embedded record's", () => {
  // The whole point of the set: these are volatile at the root and must keep being dropped there.
  const record = {
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    title: "a study",
    id: "volatile",
    status: "DRAFT",
    created_at: "2026-01-01T00:00:00.000Z",
    // A node carries its own rules id, so it is a root in its own right and keeps the exemption.
    nodes: [{ [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID, label: "a node", content_hash: "b".repeat(64) }],
    // A Quantity envelope is the other kind of root: a value paired with the class that qualifies it.
    measurement: { value: 3, evidence: "MODELLED", created_at: "2026-01-01T00:00:00.000Z" },
  }
  assert.doesNotThrow(() => assertNoNestedExcludedKeys(record))
  assert.equal(
    calculateStudyHash(record),
    calculateStudyHash({ ...record, id: "different", status: "CONCLUDED" }),
    "a root-level exclusion is still dropped, which is what it is for",
  )
})

test("the refusal names the path, because a rename is what fixes it", () => {
  const record = {
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    environment: { hardware: { racks: [{ slug: "rack-a" }] } },
  }
  assert.throws(() => assertNoNestedExcludedKeys(record), /environment\.hardware\.racks\[0\]\.slug/)
})

// ------------------------------------------------- strictness, walked rather than trusted
//
// Every object this family declares refuses a key it does not declare. Zod's default is to
// strip, and the generated JSON Schemas cannot tell the two apart -- "strip" and "strict" both
// emit `additionalProperties: false` -- so a schema added later without `.strict()` would leave
// TypeScript permissive, Python refusing, and every file in `schemas/` looking correct.
//
// There used to be two named exceptions here, `QuantitySchema` and `UncertaintySchema`, on the
// reasoning that a key they do not declare is still hashed and therefore moves the digest rather
// than hiding inside it. That was true and it was not enough: the strip happens at *parse*, and
// this family's verifiers hash the record as written, so the two halves of one consumer disagreed
// -- a plan parsed before verifying gave one digest for two files, and the same plan hashed as
// read gave two. The exceptions are gone. `src/study/common.ts` derives strict variants and
// leaves the shared schemas alone, so there is nothing left for this list to hold and the walk
// below runs without exemptions.
function collectPermissiveObjects(schema, path, seen, found) {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return
  seen.add(schema)

  const def = schema._def
  if (!def) return
  switch (def.typeName) {
    case "ZodObject": {
      if (def.unknownKeys !== "strict") found.push(`${path} (unknownKeys: ${def.unknownKeys})`)
      for (const [key, value] of Object.entries(def.shape())) {
        collectPermissiveObjects(value, `${path}.${key}`, seen, found)
      }
      return
    }
    case "ZodEffects":
      return collectPermissiveObjects(def.schema, path, seen, found)
    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault":
      return collectPermissiveObjects(def.innerType, path, seen, found)
    case "ZodArray":
      return collectPermissiveObjects(def.type, `${path}[]`, seen, found)
    case "ZodRecord":
      return collectPermissiveObjects(def.valueType, `${path}{}`, seen, found)
    case "ZodUnion":
      return def.options.forEach((option, index) =>
        collectPermissiveObjects(option, `${path}|${index}`, seen, found),
      )
    default:
      return
  }
}

test("every object the study family declares refuses an undeclared key", () => {
  const found = []
  const seen = new Set()
  for (const [name, exported] of Object.entries(study)) {
    if (!name.endsWith("Schema")) continue
    collectPermissiveObjects(exported, name, seen, found)
  }
  assert.deepEqual(
    found,
    [],
    "zod strips undeclared keys by default, while the generated schema refuses them -- and this " +
      `family's verifiers hash the record as written, so a stripped key is a key the digest still sees:\n${found.join("\n")}`,
  )
})

// The shared schemas are left exactly as they were, which is the other half of the same claim.
//
// Making `QuantitySchema` and `UncertaintySchema` strict in `src/intelligence` would have been
// the shorter fix and the wrong one: those two validate stored intelligence records that predate
// this family, and a record carrying a key they have never heard of would start being refused
// where it used to parse. The study family derives its own reading instead, the way
// `StudyEnvironmentSchema` derives an array-shaped environment from the shared map-shaped one, so
// nothing outside `src/study/` changes and every hash published under the shared schemas still
// verifies under exactly the schema that produced it.
test("the strict reading is derived in the study family, not imposed on the shared one", () => {
  const stray = {
    value: 3,
    unit: "u",
    bound: "POINT",
    evidence: "MODELLED",
    source: "s",
    model: "m",
    model_version: "1",
    assumptions: [],
    schema_version: "0.1",
    limitations: [],
    smuggled_note: "figures revised downward after review",
  }

  // The shared contract keeps stripping, because stored records depend on it doing so.
  const shared = QuantitySchema.safeParse(stray)
  assert.equal(shared.success, true)
  assert.equal("smuggled_note" in shared.data, false, "the shared reading is unchanged: it strips")

  // The study reading refuses, because a key it stripped is a key the digest still sees.
  const strict = study.StudyQuantitySchema.safeParse(stray)
  assert.equal(strict.success, false)
  assert.equal(
    strict.error.issues.some((issue) => issue.code === "unrecognized_keys"),
    true,
    JSON.stringify(strict.error?.issues),
  )

  // Same for the uncertainty envelope one level down, which the study quantity carries in place
  // of the shared one rather than inheriting.
  const spread = { kind: "SENSITIVITY_RANGE", low: 1, high: 2, basis: "b", smuggled_note: "n" }
  assert.equal(UncertaintySchema.safeParse(spread).success, true)
  assert.equal(study.StudyUncertaintySchema.safeParse(spread).success, false)
  assert.equal(study.StudyQuantitySchema.safeParse({ ...stray, smuggled_note: undefined, uncertainty: spread }).success, false)

  // And the shared contract's own refinements are re-run rather than restated, so the study
  // reading is stricter in exactly one respect and identical in every other.
  const unknownWithValue = { ...stray, smuggled_note: undefined, evidence: "UNKNOWN" }
  delete unknownWithValue.smuggled_note
  const refined = study.StudyQuantitySchema.safeParse(unknownWithValue)
  assert.equal(refined.success, false)
  assert.equal(
    refined.error.issues.some((issue) => issue.message.includes("A quantity classified UNKNOWN must carry a null value")),
    true,
    JSON.stringify(refined.error.issues),
  )
})

// The parse and the digest are two readings of one file, and they used to differ.
//
// A `smuggled_note` inside an `expected_credits` envelope survived into the digest and did not
// survive the parse. A consumer that parsed the file and then verified the confirmation got one
// digest for two different files; a consumer that hashed the file as read got two. Both were
// running the published code, and neither was told anything.
test("a key inside an embedded envelope cannot be stripped by the parse and hashed by the digest", () => {
  const envelope = (extra = {}) => ({
    value: 1000,
    unit: "credits",
    bound: "POINT",
    evidence: "MODELLED",
    source: "s",
    model: "m",
    model_version: "1",
    assumptions: [],
    schema_version: "0.1",
    limitations: [],
    ...extra,
  })
  const plan = (extra = {}) => ({
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: "1".repeat(64),
    specification_ref: { revision_hash: "2".repeat(64), revision: 1 },
    revision: 1,
    supersedes: null,
    baselines: [],
    candidates: [{ name: "qaoa", workload_ref: null, rationale: "the only candidate" }],
    scenario_refs: ["3".repeat(64)],
    pinned_versions: { adapter: null, model: { name: "m", version: "1" }, engine: { name: "e", version: "1" } },
    expected_runtime: envelope({ unit: "seconds" }),
    expected_credits: envelope(extra),
    max_credits: 5000,
    data_handling: "deleted",
    reproducibility_level: "EXACT",
    success_criteria: ["converges"],
    refusal_criteria: ["baseline unmeasurable"],
    execution_limitations: [],
  })

  const honest = plan()
  const smuggled = plan({ smuggled_note: "figures revised downward after review" })

  // The digest has always seen the key. That was never the problem.
  assert.notEqual(calculateStudyHash(honest), calculateStudyHash(smuggled), "the digest sees the key")

  // The parse now sees it too, so a consumer cannot arrive at the first digest from the second
  // file by validating it first.
  assert.equal(study.StudyPlanSchema.safeParse({ ...honest, content_hash: calculateStudyHash(honest) }).success, true)
  const parsed = study.StudyPlanSchema.safeParse({ ...smuggled, content_hash: calculateStudyHash(honest) })
  assert.equal(parsed.success, false)
  assert.equal(
    parsed.error.issues.some((issue) => issue.path.join(".") === "expected_credits" && issue.code === "unrecognized_keys"),
    true,
    JSON.stringify(parsed.error.issues),
  )
})

// A rules id is looked up, and a lookup on a plain object answers to Object.prototype.
//
// `hash_rules_id: "toString"` resolved to `Function.prototype.toString` and was handed on as a
// rule set, so `calculateStudyHash` threw `TypeError: excluded.has is not a function` -- an
// internal type error where a refusal belongs -- and `verifyExecutionCapsule` reported it under
// `STUDY_EXCLUDED_KEY_NESTED`, which is the wrong finding and sends a reader to the wrong file.
// The registry is a Map, which has no inherited entries.
test("a rules id that is only a name on Object.prototype is refused like any other unknown id", () => {
  const inherited = [
    "toString",
    "constructor",
    "__proto__",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
  ]

  for (const id of inherited) {
    const record = { [STUDY_HASH_RULES_KEY]: id, title: "a study" }
    assert.throws(() => studyRulesIdOf(record), /Unknown study hash rules id/, id)
    assert.throws(() => calculateStudyHash(record), /Unknown study hash rules id/, id)
    assert.throws(() => assertNoNestedExcludedKeys(record), /Unknown study hash rules id/, id)

    const verification = verifyExecutionCapsule({ ...buildExecutionCapsule(capsuleInput), hash_rules_id: id })
    assert.equal(verification.valid, false, id)
    assert.deepEqual(verification.refusals.map((refusal) => refusal.code), ["STUDY_HASH_RULES_ID_UNKNOWN"], id)
  }

  // And such a name one level down buys an object nothing either: an embedded record is one that
  // names rules this build knows, and `toString` is not one of them.
  assert.throws(
    () =>
      calculateStudyHash({
        [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
        accelerator: { [STUDY_HASH_RULES_KEY]: "toString", id: "gpu-0" },
      }),
    /must not carry an excluded key below its own top level/,
  )
})

// Two values a digest cannot tell apart, and one key a digest lost entirely.
//
// Both were found by probing the finished guard rather than by reading it. The
// number rule asked `Number.isInteger`, which answers false for Infinity, -Infinity
// and NaN, so all three walked past it and canonicalized to `null` -- three distinct
// values, one digest -- while Python wrote them as bare `inf`/`nan`, which is not
// JSON. And `JSON.parse` makes `__proto__` an ordinary own key, but assigning it on a
// `{}` literal invokes the inherited setter, so the key and its subtree vanished from
// the JavaScript digest while Python hashed them.
test("a value neither language can agree on is refused, not hashed", () => {
  const record = (value) => ({ hash_rules_id: STUDY_HASH_RULES_ID, kind: "probe", value })

  for (const [label, value] of [
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["NaN", Number.NaN],
  ]) {
    assert.throws(
      () => calculateStudyHash(record(value)),
      /not a finite number/,
      `${label} must be refused rather than canonicalized to null`,
    )
  }

  // The finite boundary still hashes, so the guard refuses what it must and no more.
  assert.equal(typeof calculateStudyHash(record(Number.MAX_SAFE_INTEGER)), "string")
  assert.equal(typeof calculateStudyHash(record(3.0)), "string")
})

test("a __proto__ key is part of the digest, as it is in Python", () => {
  const parse = (text) => JSON.parse(text)
  const base = parse('{"hash_rules_id":"study-v1","a":1}')
  const withOne = parse('{"hash_rules_id":"study-v1","a":1,"__proto__":{"x":1}}')
  const withTwo = parse('{"hash_rules_id":"study-v1","a":1,"__proto__":{"x":2}}')

  assert.notEqual(
    calculateStudyHash(withOne),
    calculateStudyHash(base),
    "a record carrying __proto__ must not hash as though it did not",
  )
  assert.notEqual(
    calculateStudyHash(withOne),
    calculateStudyHash(withTwo),
    "two different __proto__ subtrees must not share a digest",
  )
  assert.match(canonicalStudyJson(withOne), /"__proto__":\{"x":1\}/)
})
