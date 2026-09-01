import { refuse } from "./limits.js"
import type { JsonValue } from "./jcs.js"

/**
 * The typed canonical projection.
 *
 * A projection reads **declared fields off a parsed record** and builds the
 * canonical body explicitly. It never matches on a key's name, never recurses
 * over keys it has not been told about, and never asks whether an object "looks
 * like" an embedded record.
 *
 * That is the whole of the change. The rule it replaces decided what to leave
 * out by looking at a key's name at every nesting level, and five rounds of
 * probing found five holes in it -- nested `slug`, a nested reference field
 * named `content_hash`, a free-map key chosen by whoever captured an
 * environment, unguarded numbers, `__proto__` -- each one found after the
 * previous fix was green. They were one bug reported five times: a rule that
 * drops keys by name has to be right about every name that can ever appear at
 * every depth, including names an attacker picks. Under a projection those
 * questions do not arise, because a key nobody declared is a key nothing reads.
 *
 * The known cost of an allowlist is the mirror image, and it is real: a new
 * semantic field that nobody classifies stays out of the digest, and two
 * records differing only there share one. That is what the completeness rule in
 * `registry.ts` and `tests/study-field-completeness.test.mjs` exist for. The
 * test walks each Zod schema and fails on any field this file does not
 * classify, in either direction, so a silent omission becomes a failing build
 * rather than a collision nobody sees. Without that test an allowlist is not
 * safer than a denylist -- it is differently unsafe.
 *
 * Composition rule for nested shapes, stated once here and implemented by the
 * two class lists on each purpose below: the *outer* field's class decides
 * whether an embedded object is projected at all, and once it is, its own
 * fields are projected in full apart from `DERIVED` and -- for `semantic` only
 * -- the `RECORD_ONLY` annotations that would make rebuilding an envelope read
 * as new science. Inner classes exist to strip annotation, not to re-ask at
 * every level the question the outer field already answered.
 */

/**
 * The four classes every declared field takes exactly one of.
 *
 * - `SEMANTIC` -- model inputs, assumptions, scenario, reproduction conditions,
 *   and the numbers and claims a record asserts. In the semantic projection.
 * - `RECORD_ONLY` -- presentation and placement: labels, denormalized state,
 *   lifecycle pointers, timestamps, and the structural references that say
 *   where a record sits rather than what it says. In the record projection
 *   only.
 * - `RECEIPT_ONLY` -- audit evidence: actor, subject, sequence, previous
 *   receipt, action, timestamp. In the receipt preimage, and in the record
 *   projection.
 * - `DERIVED` -- values that cannot be inputs to the digest that covers them:
 *   a record's own hash field, and the two header components a record repeats
 *   (`schema_version`, `hash_rules_id`). The header carries the latter two, and
 *   `buildStudyPreimage` refuses a record whose declared values disagree with
 *   the header it is hashed under, so they are covered without being stated
 *   twice.
 */
export const STUDY_FIELD_CLASSES = Object.freeze([
  "SEMANTIC",
  "RECORD_ONLY",
  "RECEIPT_ONLY",
  "DERIVED",
] as const)

export type StudyFieldClass = (typeof STUDY_FIELD_CLASSES)[number]

/**
 * What a digest is being taken for.
 *
 * `artifact` reads no fields at all: it is taken over literal bytes and has no
 * projection. It is a member here because it is a header component, and a
 * header component drawn from a different list than the one the code branches
 * on is how two purposes end up sharing a namespace.
 */
export const STUDY_HASH_PURPOSES = Object.freeze([
  "semantic",
  "record",
  "receipt",
  "artifact",
] as const)

export type StudyHashPurpose = (typeof STUDY_HASH_PURPOSES)[number]

/**
 * Which classes each purpose reads, as immutable plain data.
 *
 * Two lists per purpose, because a field's class answers two different
 * questions at two different depths, and conflating them cost a digest.
 *
 * `classes` selects **top-level** fields: which of the record's own fields this
 * digest is taken over. `record` reads everything except `DERIVED`, which is
 * what "the record as written" means once the fields that cannot be inputs to
 * themselves are set aside; `semantic` and `receipt` each read one class, which
 * is what makes them answer one question apiece.
 *
 * `nested_classes` filters **inside a value that has already been selected**,
 * and the rule is different: once a field participates in a digest, its value
 * participates in full. The only things stripped below the top level are
 * `DERIVED`, which can never be an input to a digest that covers it, and -- for
 * `semantic` alone -- `RECORD_ONLY`, which is the annotation on an envelope
 * rather than the measurement inside it. A `Quantity`'s `created_at` moves
 * whenever an envelope is rebuilt around the same number, and a semantic digest
 * that read it would report new science every time a record was re-serialized.
 * That is the whole reason inner classes exist.
 *
 * Applying `classes` at every depth instead was wrong in a way that was
 * invisible until the bodies were read: a `study_event`'s `plan_ref` is
 * `RECEIPT_ONLY` and `RevisionRef`'s own two fields are `SEMANTIC`, so the
 * receipt projection selected the pointer and then dropped everything in it,
 * writing `"plan_ref":{}`. Two events binding a study to two different plan
 * revisions took one receipt digest -- the audit record of *which* plan was
 * adopted did not commit to the plan.
 */
export interface StudyPurposeClasses {
  readonly purpose: StudyHashPurpose
  readonly classes: readonly StudyFieldClass[]
  readonly nested_classes: readonly StudyFieldClass[]
}

const NOT_DERIVED = Object.freeze([
  "SEMANTIC" as const,
  "RECORD_ONLY" as const,
  "RECEIPT_ONLY" as const,
])

export const STUDY_PURPOSE_FIELD_CLASSES: readonly StudyPurposeClasses[] = Object.freeze([
  Object.freeze({
    purpose: "semantic" as const,
    classes: Object.freeze(["SEMANTIC" as const]),
    nested_classes: Object.freeze(["SEMANTIC" as const]),
  }),
  Object.freeze({
    purpose: "record" as const,
    classes: NOT_DERIVED,
    nested_classes: NOT_DERIVED,
  }),
  Object.freeze({
    purpose: "receipt" as const,
    classes: Object.freeze(["RECEIPT_ONLY" as const]),
    nested_classes: NOT_DERIVED,
  }),
  Object.freeze({
    purpose: "artifact" as const,
    classes: Object.freeze([]),
    nested_classes: Object.freeze([]),
  }),
])

/**
 * The working lookups, module-private.
 *
 * Built from the frozen tuple above, so the two cannot drift, and never handed
 * out: a `Map` a consumer holds is a rule set that consumer can edit, and
 * `Object.freeze` does not stop it.
 */
const classesByPurpose = new Map<string, ReadonlySet<StudyFieldClass>>(
  STUDY_PURPOSE_FIELD_CLASSES.map((entry) => [entry.purpose, new Set(entry.classes)]),
)

const nestedClassesByPurpose = new Map<string, ReadonlySet<StudyFieldClass>>(
  STUDY_PURPOSE_FIELD_CLASSES.map((entry) => [entry.purpose, new Set(entry.nested_classes)]),
)

/** How a declared field's value is projected. */
export type StudyValueShape =
  | { readonly kind: "leaf" }
  | { readonly kind: "object"; readonly shape: StudyShape }
  | { readonly kind: "array"; readonly item: StudyValueShape }

export interface StudyFieldDeclaration {
  readonly name: string
  readonly field_class: StudyFieldClass
  readonly value: StudyValueShape
}

export interface StudyShape {
  readonly name: string
  readonly fields: readonly StudyFieldDeclaration[]
}

/**
 * A JSON scalar, or an array of them: taken as written.
 *
 * A leaf is never an object and never an array of objects. The completeness
 * test enforces that against the Zod schema, because a leaf declared over an
 * object would be the one place a field could enter the digest without anybody
 * classifying it -- which is the hole this design closes, reopened by
 * shorthand.
 */
export function leaf(): StudyValueShape {
  return LEAF
}

const LEAF: StudyValueShape = Object.freeze({ kind: "leaf" as const })

export function objectOf(shape: StudyShape): StudyValueShape {
  return Object.freeze({ kind: "object" as const, shape })
}

export function arrayOf(item: StudyValueShape): StudyValueShape {
  return Object.freeze({ kind: "array" as const, item })
}

/**
 * Declare a shape, deeply frozen.
 *
 * Duplicate field names are refused at load: two declarations of one name would
 * mean two classifications of one field, and the completeness test could then
 * pass while the projection read whichever came first.
 */
export function declareShape(name: string, fields: readonly StudyFieldDeclaration[]): StudyShape {
  const seen = new Set<string>()
  for (const field of fields) {
    if (seen.has(field.name)) {
      throw new Error(`Shape ${name} declares ${field.name} twice; a field takes exactly one class.`)
    }
    seen.add(field.name)
  }
  return Object.freeze({
    name,
    fields: Object.freeze(fields.map((field) => Object.freeze({ ...field }))),
  })
}

/** Shorthand for one declaration, so a shape table reads as a table. */
export function field(
  name: string,
  fieldClass: StudyFieldClass,
  value: StudyValueShape = LEAF,
): StudyFieldDeclaration {
  return Object.freeze({ name, field_class: fieldClass, value })
}

function classesFor(
  purpose: StudyHashPurpose,
  lookup: ReadonlyMap<string, ReadonlySet<StudyFieldClass>>,
): ReadonlySet<StudyFieldClass> {
  const classes = lookup.get(purpose)
  if (classes === undefined) {
    refuse(
      "INVALID_HEADER_COMPONENT",
      `${JSON.stringify(purpose)} is not a hash purpose. Known purposes: ${STUDY_HASH_PURPOSES.join(", ")}.`,
    )
  }
  return classes
}

/**
 * Refuse a projection that reads no field of this shape at all.
 *
 * A shape none of whose fields this purpose reads projects to `{}` for every
 * record of its kind, so the digest is a constant: `semanticHash` over a
 * `study_event` -- whose every field is audit evidence -- returned one hex
 * string for every event ever written, and a reader comparing two of them was
 * told two unrelated events were "the same science".
 *
 * A constant is worse than a refusal, because it answers. So the question "does
 * this record kind have semantic content?" is answered here, structurally, from
 * the declaration rather than from the record in hand: the check is about which
 * fields the *shape* declares, so it gives the same answer for every record of
 * the kind and cannot pass on a full record and fail on a sparse one.
 */
function assertProjectionReadsSomething(
  shape: StudyShape,
  purpose: StudyHashPurpose,
  classes: ReadonlySet<StudyFieldClass>,
  path: string,
): void {
  if (shape.fields.some((declaration) => classes.has(declaration.field_class))) return
  refuse(
    "EMPTY_PROJECTION",
    `${shape.name} declares no field a ${purpose} digest reads, so its ${purpose} projection is {} for every ` +
      "record of this kind and the digest is a constant. A constant is not an answer to `are these two the " +
      "same` -- it says yes to every pair. Ask for a purpose this kind has content for, or classify a field " +
      "into the class this purpose reads.",
    path === "" ? null : path,
  )
}

/**
 * Read one declared field off a value, ignoring everything it inherits.
 *
 * `hasOwnProperty` through `Object.prototype` rather than `value.field`,
 * because a polluted `Object.prototype` would otherwise supply a value for a
 * field the record does not have -- a record missing `status` would project
 * whatever `Object.prototype.status` was set to, and every record in the
 * process would project the same forged value. The projection reads what the
 * record carries or nothing.
 */
function ownField(source: object, name: string): unknown {
  return Object.prototype.hasOwnProperty.call(source, name)
    ? (source as Record<string, unknown>)[name]
    : undefined
}

/**
 * Refuse a key nobody declared, rather than ignoring it.
 *
 * Ignoring is what an allowlist does by default, and by itself it is a
 * collision: a record and the same record with one extra key project to the
 * same body and take the same digest, so a field could be added to a signed-off
 * file for nothing. The schemas in this family are all `.strict()` and would
 * refuse such a file at parse -- but this layer is reachable without a parse,
 * its Python counterpart is the only verifier some readers have, and "the
 * caller parsed first" is an assumption rather than a check.
 *
 * So the projection is strict in both directions: it reads only what is
 * declared, and it refuses what is not. Note which question is being asked --
 * *is this key declared*, not *is this key called something suspicious*. No
 * name is special, at any depth.
 */
function assertOnlyDeclaredFields(shape: StudyShape, record: object, path: string): void {
  const declared = declaredNameSets.get(shape)
  const names = declared ?? new Set(shape.fields.map((declaration) => declaration.name))
  if (declared === undefined) declaredNameSets.set(shape, names)
  for (const key of Object.keys(record)) {
    if (names.has(key)) continue
    refuse(
      "UNDECLARED_FIELD",
      `${shape.name} does not declare a field named ${JSON.stringify(key)}. An undeclared key is refused rather ` +
        "than skipped: skipping it would give this record and the same record without the key one digest, and a " +
        "field could then be added to a finished record at no cost.",
      path === "" ? key : `${path}.${key}`,
    )
  }
}

/** Per-shape name lookups, module-private and built on first use. */
const declaredNameSets = new WeakMap<StudyShape, Set<string>>()

function projectValue(
  shape: StudyValueShape,
  value: unknown,
  purpose: StudyHashPurpose,
  nested: ReadonlySet<StudyFieldClass>,
  path: string,
): JsonValue {
  if (value === null) return null
  if (shape.kind === "leaf") return value as JsonValue
  if (shape.kind === "array") {
    if (!Array.isArray(value)) {
      refuse(
        "SHAPE_MISMATCH",
        "the declaration says this field is a list, and the record carries something else. The projection builds " +
          "the body from the declaration, so a value of the wrong shape is refused rather than serialized under a " +
          "reading nobody declared.",
        path,
      )
    }
    return value.map((item, index) =>
      projectValue(shape.item, item, purpose, nested, `${path}[${index}]`),
    )
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    refuse(
      "SHAPE_MISMATCH",
      `the declaration says this field is a ${shape.shape.name}, and the record carries something else.`,
      path,
    )
  }
  // `nested` for both the filter and the descent: below the top level the rule
  // no longer changes with depth, so an object three levels down is filtered
  // exactly as one level down is.
  return projectShapeWith(shape.shape, value as object, purpose, nested, nested, path)
}

/**
 * Build the canonical body for one shape.
 *
 * Only declared names are read, and only fields whose class this purpose reads
 * are read at all. A declared field the record does not carry is omitted rather
 * than written as null: absent and null are different statements in this
 * family, and a projection that turned one into the other would give two
 * different records one digest.
 *
 * The body has a null prototype. `JSON.parse` makes `__proto__` an ordinary own
 * key, but assigning it on a `{}` calls the inherited setter instead of
 * creating a property -- so the key and everything under it would vanish here
 * while Python, which has no such setter, hashed it. One payload, two answers.
 * A key named `__proto__` cannot in fact reach this body, because it is not a
 * declared field name anywhere in the family; the null prototype is what makes
 * that a fact about the code rather than a fact about the current field lists.
 */
export function projectStudyShape(
  shape: StudyShape,
  record: object,
  purpose: StudyHashPurpose,
  path = "",
): JsonValue {
  return projectShapeWith(
    shape,
    record,
    purpose,
    classesFor(purpose, classesByPurpose),
    classesFor(purpose, nestedClassesByPurpose),
    path,
  )
}

/**
 * The walk, with the two filters passed in rather than looked up.
 *
 * Top-level and nested filters differ (see `STUDY_PURPOSE_FIELD_CLASSES`), and
 * passing them explicitly is what keeps "which filter applies here" a fact about
 * the call rather than a fact about whether `path` happens to be empty -- a
 * distinction the public entry point above cannot make, because a caller may
 * pass a path.
 */
function projectShapeWith(
  shape: StudyShape,
  record: object,
  purpose: StudyHashPurpose,
  classes: ReadonlySet<StudyFieldClass>,
  nested: ReadonlySet<StudyFieldClass>,
  path: string,
): JsonValue {
  assertProjectionReadsSomething(shape, purpose, classes, path)
  assertOnlyDeclaredFields(shape, record, path)
  const body = Object.create(null) as Record<string, JsonValue>
  for (const declaration of shape.fields) {
    if (!classes.has(declaration.field_class)) continue
    const raw = ownField(record, declaration.name)
    if (raw === undefined) continue
    const here = path === "" ? declaration.name : `${path}.${declaration.name}`
    body[declaration.name] = projectValue(declaration.value, raw, purpose, nested, here)
  }
  return body
}

/** The declared field names of a shape, as immutable plain data. */
export function declaredFieldNames(shape: StudyShape): readonly string[] {
  return Object.freeze(shape.fields.map((declaration) => declaration.name))
}

/**
 * The classes a purpose reads at the top level, as immutable plain data rather
 * than a Set.
 */
export function fieldClassesForPurpose(purpose: StudyHashPurpose): readonly StudyFieldClass[] {
  return purposeEntry(purpose).classes
}

/** The classes a purpose reads inside a value it has already selected. */
export function nestedFieldClassesForPurpose(
  purpose: StudyHashPurpose,
): readonly StudyFieldClass[] {
  return purposeEntry(purpose).nested_classes
}

function purposeEntry(purpose: StudyHashPurpose): StudyPurposeClasses {
  const entry = STUDY_PURPOSE_FIELD_CLASSES.find((candidate) => candidate.purpose === purpose)
  if (entry === undefined) {
    refuse("INVALID_HEADER_COMPONENT", `${JSON.stringify(purpose)} is not a hash purpose.`)
  }
  return entry
}
