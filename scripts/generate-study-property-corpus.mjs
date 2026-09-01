#!/usr/bin/env node
/**
 * The shared property corpus: one deterministic body of inputs, hashed by both
 * languages (goal §16).
 *
 * The fixtures already in `fixtures/study/` pin the cases somebody thought of.
 * This file pins the *class*: every record kind, every declared leaf mutated in
 * turn, every optional present and absent, and the values a canonicalizer has to
 * get right -- empty strings, NFC against NFD, astral characters, minus zero,
 * subnormals, both sides of `Number.MAX_SAFE_INTEGER`, `__proto__` as a key and
 * as a value, duplicate JSON keys at byte level.
 *
 * ## Why one corpus rather than two generators
 *
 * `fast-check` and `hypothesis` both shrink well and neither can shrink a case
 * the other never drew. Two independently seeded random walks over the same
 * shapes would produce two disjoint sets of inputs, and a cross-language
 * disagreement would then be found only when both happened to draw the same
 * value -- which is a coincidence, on a schedule nobody controls. So the walk
 * happens once, here, from a recorded seed, and both languages read the result.
 * A divergence is then a genuine disagreement about one input rather than a
 * report that two suites explored different ground.
 *
 * Each language still runs its own generator on top of this, for the properties
 * that are checkable without the other language present (§1, §2, §3, §5). The
 * corpus is what settles §4, which no single-language generator can ask.
 *
 * ## What is pinned, and what is derived
 *
 * Every case carries the *expected* answer -- canonical bytes, digest, or a
 * refusal code and path -- computed here by TypeScript. Both languages then
 * check against the file rather than against each other, which is what makes a
 * failure reproducible from the file alone: `npm test` fails on the TypeScript
 * side and `pytest` fails on the Python side, independently, and the case id in
 * the message names the input.
 *
 * Digests after a mutation are written as the literal string `unchanged` when
 * they equal the base record's digest for that purpose. That is not a
 * compression trick: "this mutation moved nothing" is the assertion property §3
 * makes, and a fixture that spelled it as a second copy of the same 64 hex
 * characters would hide it from a reader diffing the file.
 *
 * ## Why the corpus itself is a file this family would accept
 *
 * `tests/study-properties.test.mjs` runs `readStudyFileBytes` over this file.
 * That is not decoration: the corpus is full of the values that break readers,
 * and if writing them down produced a document the family's own file gate
 * refuses, the fixture would be evidence of nothing. It follows that the two
 * values that *cannot* appear in it as literals -- a lone surrogate and an
 * integer past 2^53 -- are carried as an `edits` instruction and as base64 bytes
 * respectively, and are built by each language rather than parsed.
 *
 * Regenerate with `node scripts/generate-study-property-corpus.mjs`. The seed is
 * recorded in the output; nothing here reads a clock, a filesystem or an
 * environment variable, so the same seed gives the same file on any machine.
 */
import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  STUDY_HASH_LIMITS,
  STUDY_HASH_RULES_ID,
  STUDY_RECORD_KINDS,
  artifactHash,
  fieldClassesForPurpose,
  isExactDecimalString,
  isExactIntegerString,
  nestedFieldClassesForPurpose,
  readStudyFileBytes,
  receiptHash,
  recordHash,
  semanticHash,
  studyCanonicalBody,
  studySelfHash,
} from "../dist/study/index.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * The seed, written into the output so a failure is reproducible from the file.
 *
 * A date rather than a lucky number, because the only thing a seed has to be is
 * fixed and traceable to the day somebody chose it. Changing it rewrites every
 * digest in the fixture, which is a reviewable diff and not a silent one.
 */
export const CORPUS_SEED = 20260901

const SCHEMA_VERSION = "1.0"
const PURPOSES = Object.freeze(["semantic", "record", "receipt"])
const HASH_FOR_PURPOSE = Object.freeze({
  semantic: semanticHash,
  record: recordHash,
  receipt: receiptHash,
})

/**
 * mulberry32: 32 bits of state, one multiply-shift round, uniform enough.
 *
 * Written out rather than imported because the corpus has to be reproducible
 * from this repository at this commit, and a PRNG behind a version range is a
 * fixture that changes when a lockfile does. Nothing here is cryptographic and
 * nothing needs to be -- the requirement is that the same seed walks the same
 * path, not that the path is unguessable.
 */
function mulberry32(seed) {
  let state = seed | 0
  return function next() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The leaf values the corpus draws from.
 *
 * Every entry is here because it has broken a canonicalizer somewhere, and every
 * entry survives a JSON round trip unchanged -- which is what lets the same
 * value serve the in-memory property and the read-back-from-a-file one (§5)
 * without a second table.
 *
 * Three exclusions are deliberate and each is covered elsewhere, by an `edits`
 * instruction that both languages execute rather than parse:
 *
 * - **`-0`** would be written by `JSON.stringify` as `0`, so a fixture entry
 *   claiming to cover it would cover nothing. See the `negative_zero` special.
 * - **A lone surrogate** would make this file something `readStudyFileBytes`
 *   refuses, and the corpus has to be a file the family accepts. See the
 *   `lone_surrogate_*` specials.
 * - **An integer past 2^53** is the one value the two languages genuinely read
 *   differently -- `9007199254740993` is an exact `int` in Python and the
 *   nearest double here -- so writing one as a literal would make the fixture
 *   itself the disagreement. It appears only as base64 file bytes, where the
 *   expected answer is the `UNSAFE_INTEGER` refusal both languages give.
 */
export const LEAF_VALUES = Object.freeze([
  // Strings whose names the retired name-matching rule dropped at every depth.
  // As *values* they are ordinary text; the point is that nothing here treats
  // them as anything else. Their appearance as undeclared *keys* is a refusal
  // case further down.
  "id",
  "slug",
  "status",
  "created_at",
  "content_hash",
  // The four prototype-adjacent names, again as values.
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  // The empty string: a value, not an absence, and it must not project as one.
  "",
  // NFC and NFD of the same character. RFC 8785 §3.1 forbids normalization, so
  // these two must stay distinct all the way to the digest.
  "é",
  "é",
  // An astral character, which sorts by its high surrogate under §3.2.3, and a
  // BMP character above it in code-point order and below it in UTF-16 order.
  "\u{1f600}",
  "דּ",
  // A C0 control, which §3.2.2.2 escapes as a lowercase \u0000 escape rather than as
  // anything shorter.
  "a\u0000b",
  // The exact-number contracts, as the strings they are: the accepted spelling
  // and four rejected ones that a looser contract would call equal.
  "0",
  "-0",
  "007",
  "1e3",
  "18446744073709551615",
  "-9007199254740993",
  // Numbers on the boundaries the RFC's own table is about.
  0,
  1,
  -1,
  1.5,
  4.5,
  1e21,
  1e-7,
  0.000001,
  5e-324,
  9007199254740991,
  -9007199254740991,
  true,
  false,
  null,
  // Nested arrays, an empty one, and one carrying the same entry twice: array
  // order is significant and duplicate entries are not deduplicated.
  [],
  [1, 2],
  [[1], [[2]]],
  ["x", "x"],
  // A free object in a leaf slot, including one whose key is `__proto__`. Built
  // by parsing rather than by an object literal: `{ __proto__: 1 }` in source
  // sets the prototype and creates no own key at all, so the literal spelling
  // would silently cover nothing.
  {},
  JSON.parse('{"a":1,"__proto__":2}'),
])

/**
 * Set a key without going through the inherited `__proto__` setter.
 *
 * `object.__proto__ = value` mutates the prototype and creates no own property,
 * so a corpus instruction that added a key called `__proto__` would silently add
 * nothing and the case would pass by testing an unmodified record. Every write
 * in this file and in both test suites goes through a define.
 */
function defineKey(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

/** A deep copy that keeps `__proto__` an own key, which is the whole point. */
function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson)
  if (value !== null && typeof value === "object") {
    const out = {}
    for (const key of Object.keys(value)) defineKey(out, key, cloneJson(value[key]))
    return out
  }
  return value
}

/**
 * A path into a record: dotted names with bracketed indices, the same spelling
 * the projection uses in a refusal.
 *
 * One grammar for both, so a `path` a case asks about and a `path` a refusal
 * reports are comparable without a translation step -- which is what property §4
 * compares when the answer is a refusal rather than bytes.
 */
function pathSegments(path) {
  const out = []
  let current = ""
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index]
    if (char === ".") {
      if (current !== "") out.push({ key: current })
      current = ""
      continue
    }
    if (char === "[") {
      if (current !== "") out.push({ key: current })
      current = ""
      const end = path.indexOf("]", index)
      out.push({ index: Number(path.slice(index + 1, end)) })
      index = end
      continue
    }
    current += char
  }
  if (current !== "") out.push({ key: current })
  return out
}

function containerAt(record, segments) {
  let current = record
  for (const segment of segments) {
    current = segment.key === undefined ? current[segment.index] : current[segment.key]
  }
  return current
}

function readAt(record, path) {
  const segments = pathSegments(path)
  const container = containerAt(record, segments.slice(0, -1))
  const last = segments[segments.length - 1]
  return last.key === undefined ? container[last.index] : container[last.key]
}

function writeAt(record, path, value) {
  const segments = pathSegments(path)
  const container = containerAt(record, segments.slice(0, -1))
  const last = segments[segments.length - 1]
  if (last.key === undefined) container[last.index] = value
  else defineKey(container, last.key, value)
}

function deleteAt(record, path) {
  const segments = pathSegments(path)
  const container = containerAt(record, segments.slice(0, -1))
  const last = segments[segments.length - 1]
  if (last.key === undefined) container.splice(last.index, 1)
  else delete container[last.key]
}

/**
 * The values a JSON file cannot carry, named so both languages build them.
 *
 * A corpus entry is a string here and a `float('nan')` or a `"\ud800"` there.
 * That is the point: the four specials below are exactly the values whose
 * *literal* would either be silently rewritten by `JSON.stringify` or make this
 * fixture a file the family refuses, so they are described rather than written.
 */
export function buildSpecial(special) {
  switch (special.kind) {
    case "nan":
      return Number.NaN
    case "infinity":
      return Number.POSITIVE_INFINITY
    case "negative_infinity":
      return Number.NEGATIVE_INFINITY
    case "negative_zero":
      return -0
    case "lone_surrogate_high":
      return "before\ud800after"
    case "lone_surrogate_low":
      return "before\udc00after"
    case "deep_array": {
      let value = 1
      for (let level = 0; level < special.depth; level += 1) value = [value]
      return value
    }
    case "wide_array":
      return Array.from({ length: special.length }, (_, index) => index)
    case "long_string":
      return "a".repeat(special.length)
    default:
      throw new Error(`Unknown special ${special.kind}.`)
  }
}

/**
 * Apply a case's edits to a copy of its base record.
 *
 * Both test suites implement this same twelve-line interpreter. A corpus that
 * carried whole mutated records instead would be four megabytes of near-copies,
 * and a reader could not see what a case was *about* -- `{"op":"set","path":
 * "core.study_type","special":{"kind":"nan"}}` says it in one line.
 */
export function applyEdits(record, edits) {
  const out = cloneJson(record)
  for (const edit of edits) {
    if (edit.op === "delete") {
      deleteAt(out, edit.path)
      continue
    }
    const value = edit.special === undefined ? cloneJson(edit.value) : buildSpecial(edit.special)
    if (edit.op === "set") {
      writeAt(out, edit.path, value)
      continue
    }
    if (edit.op === "add") {
      const container = edit.path === "" ? out : readAt(out, edit.path)
      defineKey(container, edit.key, value)
      continue
    }
    throw new Error(`Unknown edit op ${edit.op}.`)
  }
  return out
}

/**
 * What a purpose does with a record: bytes and a digest, or a refusal.
 *
 * A refusal is an answer and is pinned as one. `semanticHash` over a
 * `study_event` refusing `EMPTY_PROJECTION` is a fact about the family both
 * languages have to agree on, and a corpus that dropped refused purposes would
 * pin only the cases where nothing interesting happened.
 */
function outcomeFor(recordKind, record, purpose, limits, withBody) {
  try {
    const digest = HASH_FOR_PURPOSE[purpose](recordKind, record, limits)
    return withBody
      ? { body: studyCanonicalBody(recordKind, record, purpose, limits), digest }
      : { digest }
  } catch (error) {
    if (error.code === undefined) throw error
    return { refusal: { code: error.code, path: error.path ?? null } }
  }
}

function selfHashOutcome(entry, record, limits) {
  try {
    return {
      field: entry.self_hash_field,
      purpose: entry.self_hash_purpose,
      digest: studySelfHash(entry.record_kind, record, limits),
    }
  } catch (error) {
    if (error.code === undefined) throw error
    return {
      field: entry.self_hash_field,
      purpose: entry.self_hash_purpose,
      refusal: { code: error.code, path: error.path ?? null },
    }
  }
}

function purposesFor(recordKind, record, limits, withBody) {
  const out = {}
  for (const purpose of PURPOSES) {
    out[purpose] = outcomeFor(recordKind, record, purpose, limits, withBody)
  }
  return out
}

/**
 * The same three answers, with an unchanged digest written as `unchanged`.
 *
 * See the header: this is the assertion, not a saving. A mutation whose entry
 * reads `"semantic": "unchanged"` is a mutation the semantic projection is
 * blind to, and property §3 is the claim that the classification predicted it.
 */
function purposeDeltas(recordKind, record, limits, base) {
  const out = {}
  for (const purpose of PURPOSES) {
    const outcome = outcomeFor(recordKind, record, purpose, limits, false)
    const before = base[purpose]
    if (
      outcome.digest !== undefined &&
      before.digest !== undefined &&
      outcome.digest === before.digest
    ) {
      out[purpose] = "unchanged"
      continue
    }
    if (
      outcome.refusal !== undefined &&
      before.refusal !== undefined &&
      outcome.refusal.code === before.refusal.code &&
      outcome.refusal.path === before.refusal.path
    ) {
      out[purpose] = "unchanged"
      continue
    }
    out[purpose] = outcome
  }
  return out
}

// ---------------------------------------------------------------------------
// Building records from the shape tables
// ---------------------------------------------------------------------------

/**
 * Whether a purpose's projection reaches a declaration path.
 *
 * The composition rule from `projection.ts`, stated as a predicate over a path
 * rather than over a field: the *first* segment is selected by the purpose's
 * top-level classes, and every segment below it by the nested classes. Both test
 * suites re-derive this from their own copy of the tables and check the answer
 * against what the digests actually did, which is what makes property §3 a claim
 * about the classification rather than a restatement of the code that reads it.
 */
function visibilityOf(classes, path) {
  return Object.fromEntries(
    PURPOSES.map((purpose) => [purpose, visibleForPurpose(classes, purpose, path)]),
  )
}

function visibleForPurpose(classes, purpose, path) {
  const top = new Set(fieldClassesForPurpose(purpose))
  const nested = new Set(nestedFieldClassesForPurpose(purpose))
  const parts = path.split(".")
  for (let index = 0; index < parts.length; index += 1) {
    const prefix = parts.slice(0, index + 1).join(".")
    const fieldClass = classes.get(prefix)
    if (fieldClass === undefined) throw new Error(`No class declared for ${prefix}.`)
    if (!(index === 0 ? top : nested).has(fieldClass)) return false
  }
  return true
}

/**
 * Build one record of a kind, and the concrete location of every declared leaf.
 *
 * `mode` decides which optional fields are present. `full` carries every
 * declared field, which is what makes "every leaf field mutated" reachable;
 * `sparse` drops roughly half at every level; `minimal` carries only the header
 * fields a digest cannot be taken without. Between them the three modes are the
 * "optional fields present and absent" coverage, per kind rather than per field.
 *
 * The returned `leaves` map is declaration path -> concrete path. A declaration
 * path names a *field*, and a concrete path names a place in this record --
 * `inputs.name` against `inputs[0].name` -- and the mutation cases need both:
 * the first to look the classification up, the second to write.
 */
function buildRecord(entry, rng, mode) {
  const leaves = new Map()

  const buildValue = (valueShape, declPath, concretePath) => {
    if (valueShape.kind === "leaf") {
      if (!leaves.has(declPath)) leaves.set(declPath, concretePath)
      return LEAF_VALUES[Math.floor(rng() * LEAF_VALUES.length)]
    }
    if (valueShape.kind === "array") {
      const length = mode === "full" ? (rng() < 0.3 ? 2 : 1) : rng() < 0.5 ? 1 : 0
      const items = []
      for (let index = 0; index < length; index += 1) {
        items.push(buildValue(valueShape.item, declPath, `${concretePath}[${index}]`))
      }
      // Two identical entries where the draw allows it: array order matters and
      // duplicate entries are not a set.
      if (length === 2 && rng() < 0.5) items[1] = cloneJson(items[0])
      return items
    }
    return buildShape(valueShape.shape, declPath, concretePath)
  }

  const buildShape = (shape, declPrefix, concretePrefix) => {
    const object = {}
    for (const declaration of shape.fields) {
      const declPath =
        declPrefix === "" ? declaration.name : `${declPrefix}.${declaration.name}`
      const concretePath =
        concretePrefix === "" ? declaration.name : `${concretePrefix}.${declaration.name}`
      const required =
        declPrefix === "" &&
        (declaration.name === "schema_version" || declaration.name === "hash_rules_id")
      const present = required || mode === "full" || (mode === "sparse" && rng() < 0.5)
      if (!present) {
        // The leaf is still declared even when this record does not carry it.
        // Recording it with a null location keeps the lookup total, so a caller
        // asking "where does this declared leaf live in this record" gets
        // "nowhere" rather than an undefined it might mistake for a bug.
        registerAbsentLeaves(declaration.value, declPath, leaves)
        continue
      }
      defineKey(object, declaration.name, buildValue(declaration.value, declPath, concretePath))
    }
    return object
  }

  const record = buildShape(entry.shape, "", "")
  // The two header components are read off the record by name and validated as
  // preimage components, so they are the two fields a generated record cannot
  // be allowed to draw at random.
  defineKey(record, "schema_version", SCHEMA_VERSION)
  defineKey(record, "hash_rules_id", STUDY_HASH_RULES_ID)
  return { record, leaves }
}

/** Register the declaration leaves under a value nobody built, so lookups stay total. */
function registerAbsentLeaves(valueShape, declPath, leaves) {
  if (valueShape.kind === "leaf") {
    if (!leaves.has(declPath)) leaves.set(declPath, null)
    return
  }
  if (valueShape.kind === "array") {
    registerAbsentLeaves(valueShape.item, declPath, leaves)
    return
  }
  for (const declaration of valueShape.shape.fields) {
    registerAbsentLeaves(declaration.value, `${declPath}.${declaration.name}`, leaves)
  }
}

/** Every declaration path of a shape and the class declared for it. */
function flattenClasses(shape) {
  const out = new Map()
  const visit = (current, prefix, seen) => {
    if (seen.has(current)) return
    const nested = new Set(seen).add(current)
    for (const declaration of current.fields) {
      const path = prefix === "" ? declaration.name : `${prefix}.${declaration.name}`
      out.set(path, declaration.field_class)
      let value = declaration.value
      while (value.kind === "array") value = value.item
      if (value.kind === "object") visit(value.shape, path, nested)
    }
  }
  visit(shape, "", new Set())
  return out
}

/**
 * A replacement for a leaf that the canonicalizer can tell apart from what is
 * there.
 *
 * Drawing at random and hoping would give a corpus in which some fraction of the
 * mutations changed nothing, and every one of those cases would pass property §2
 * by testing the wrong thing. The candidate is checked against the value it
 * replaces by canonical bytes, which is the comparison the property is about --
 * `1` and `1.0` are two spellings the JCS number rule collapses, and swapping
 * one for the other would be a mutation only the source can see.
 */
function distinctValue(current, rng) {
  const currentText = JSON.stringify(current) ?? "undefined"
  for (let attempt = 0; attempt < LEAF_VALUES.length; attempt += 1) {
    const candidate = LEAF_VALUES[Math.floor(rng() * LEAF_VALUES.length)]
    if (JSON.stringify(candidate) !== currentText) return cloneJson(candidate)
  }
  throw new Error("No distinct replacement value; the leaf pool has collapsed.")
}

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

export function buildCorpus(seed = CORPUS_SEED) {
  const rng = mulberry32(seed)
  const records = []
  const cases = []
  const bases = new Map()

  for (const entry of STUDY_RECORD_KINDS) {
    const classes = flattenClasses(entry.shape)
    for (const mode of ["full", "sparse", "minimal"]) {
      const caseId = `${entry.record_kind}/${mode}`
      const { record, leaves } = buildRecord(entry, rng, mode)
      const purposes = purposesFor(entry.record_kind, record, undefined, true)
      records.push({
        case_id: caseId,
        record_kind: entry.record_kind,
        mode,
        record,
        purposes,
        self_hash: selfHashOutcome(entry, record, undefined),
      })
      bases.set(caseId, { record, purposes, classes, leaves, entry })
    }
  }

  /**
   * The two fields a mutation loop must not touch, and why they are not an
   * exception to the classification rule.
   *
   * `schema_version` and `hash_rules_id` are `DERIVED`, so no projection reads
   * them and the `visible` prediction below says `false` for all three purposes
   * -- and yet changing either one *does* change every digest, because
   * `buildStudyPreimage` commits to both outside the body. That is the design
   * working: they are covered without being stated twice. It is also a prediction
   * this loop would report as broken, so they are hashed as header components
   * instead, in the `header` cases further down, where the answer is the refusal
   * or the digest a header change actually produces.
   *
   * The third `DERIVED` field -- the record's own hash -- stays in the loop, and
   * must come back `unchanged` for every purpose of every kind. That is what
   * makes building and verifying one call rather than two.
   */
  const HEADER_COMPONENT_FIELDS = new Set(["schema_version", "hash_rules_id"])

  // -- Every declared leaf, mutated in turn. ---------------------------------
  //
  // The `full` record of each kind is the base, because it is the only one that
  // carries every field. A leaf whose declaration path has no concrete location
  // -- an array the generator left empty, a field the mode dropped -- would be
  // skipped here; the test asserts nothing is skipped for `full`, so a shape that
  // grew an unreachable field fails rather than quietly losing its coverage.
  for (const [caseId, base] of bases) {
    if (!caseId.endsWith("/full")) continue
    for (const [declPath, concretePath] of base.leaves) {
      if (concretePath === null || HEADER_COMPONENT_FIELDS.has(declPath)) continue
      const current = readAt(base.record, concretePath)
      const replacement = distinctValue(current, rng)
      const mutated = applyEdits(base.record, [
        { op: "set", path: concretePath, value: replacement },
      ])
      cases.push({
        case_id: `${caseId}:set:${concretePath}`,
        kind: "leaf-mutation",
        base: caseId,
        record_kind: base.entry.record_kind,
        declaration_path: declPath,
        field_class: base.classes.get(declPath),
        visible: visibilityOf(base.classes, declPath),
        edits: [{ op: "set", path: concretePath, value: replacement }],
        purposes: purposeDeltas(base.entry.record_kind, mutated, undefined, base.purposes),
      })
    }
  }

  // -- Every top-level field, deleted. ---------------------------------------
  //
  // "Optional fields present and absent" as a per-field claim rather than a
  // per-record one: a field the projection reads must move the digest when it
  // leaves, and a field it does not read must not. Absent is not null -- the
  // projection omits a missing field rather than writing one -- so a deletion is
  // a different input from a mutation to `null`, and both are here.
  for (const [caseId, base] of bases) {
    if (!caseId.endsWith("/full")) continue
    for (const declaration of base.entry.shape.fields) {
      if (HEADER_COMPONENT_FIELDS.has(declaration.name)) continue
      const declPath = declaration.name
      const mutated = applyEdits(base.record, [{ op: "delete", path: declPath }])
      cases.push({
        case_id: `${caseId}:delete:${declPath}`,
        kind: "field-deletion",
        base: caseId,
        record_kind: base.entry.record_kind,
        declaration_path: declPath,
        field_class: base.classes.get(declPath),
        visible: visibilityOf(base.classes, declPath),
        edits: [{ op: "delete", path: declPath }],
        purposes: purposeDeltas(base.entry.record_kind, mutated, undefined, base.purposes),
      })
    }
  }

  // -- The values a literal cannot carry. ------------------------------------
  const study = bases.get("study/full")
  const specials = [
    {
      suffix: "nan",
      why: "NaN is not a JSON number; RFC 8785 §3.2.2.3 requires termination rather than `null`",
      edit: { op: "set", path: "core.study_type", special: { kind: "nan" } },
    },
    {
      suffix: "infinity",
      why: "Infinity, for the same reason and by the same clause",
      edit: { op: "set", path: "core.study_type", special: { kind: "infinity" } },
    },
    {
      suffix: "negative-infinity",
      why: "-Infinity, so the refusal is not a test of the sign bit",
      edit: { op: "set", path: "core.study_type", special: { kind: "negative_infinity" } },
    },
    {
      suffix: "negative-zero",
      why: "minus zero renders as `0` under ECMA-262 §7.1.12.1, in both languages",
      edit: { op: "set", path: "core.study_type", special: { kind: "negative_zero" } },
    },
    {
      suffix: "lone-surrogate-high",
      why: "half a character is not a character; §3.2.2.2 requires termination",
      edit: { op: "set", path: "core.study_type", special: { kind: "lone_surrogate_high" } },
    },
    {
      suffix: "lone-surrogate-low",
      why: "the low half, so the refusal is not a test of one branch",
      edit: { op: "set", path: "core.study_type", special: { kind: "lone_surrogate_low" } },
    },
    {
      suffix: "deep-array-at-limit",
      why: "a leaf carrying 62 nested arrays sits just inside max_depth",
      edit: { op: "set", path: "core.study_type", special: { kind: "deep_array", depth: 61 } },
    },
    {
      suffix: "deep-array-past-limit",
      why: "one level further is MAX_DEPTH_EXCEEDED, at the same bound in both languages",
      edit: { op: "set", path: "core.study_type", special: { kind: "deep_array", depth: 65 } },
    },
  ]
  for (const special of specials) {
    const mutated = applyEdits(study.record, [special.edit])
    cases.push({
      case_id: `study/full:special:${special.suffix}`,
      kind: "value-outside-json",
      base: "study/full",
      record_kind: "study",
      why: special.why,
      edits: [special.edit],
      purposes: purposeDeltas("study", mutated, undefined, study.purposes),
    })
  }

  // -- The structural bounds, under limits small enough to write down. -------
  //
  // `max_nodes` is 100000 and `max_canonical_bytes` is 8 MiB. A corpus that
  // reached either honestly would be a fixture nobody can review and a test
  // nobody wants to run, so these two cases pass their own limits -- which is
  // the same code path, since every entry point takes the limits as an argument
  // and neither language reads a global. The depth bound is reached at its real
  // value above, because 65 nested arrays cost 130 characters.
  const boundCases = [
    {
      suffix: "max-nodes",
      why: "a wide leaf past a small max_nodes: the bound is on the walk, not the depth",
      limits: { max_depth: 64, max_nodes: 32, max_canonical_bytes: 8388608 },
      edit: { op: "set", path: "core.study_type", special: { kind: "wide_array", length: 64 } },
    },
    {
      suffix: "max-canonical-bytes",
      why: "an oversized record: the bound is on the bytes a digest consumes",
      limits: { max_depth: 64, max_nodes: 100000, max_canonical_bytes: 256 },
      edit: { op: "set", path: "core.study_type", special: { kind: "long_string", length: 512 } },
    },
  ]
  for (const bound of boundCases) {
    const mutated = applyEdits(study.record, [bound.edit])
    cases.push({
      case_id: `study/full:bound:${bound.suffix}`,
      kind: "structural-bound",
      base: "study/full",
      record_kind: "study",
      why: bound.why,
      limits: bound.limits,
      edits: [bound.edit],
      purposes: purposesFor("study", mutated, bound.limits, false),
    })
  }

  // -- Keys nobody declared, at the top level and nested. --------------------
  //
  // The names are the ones the retired rule dropped by name at every depth, plus
  // the four that resolve on `Object.prototype`. Under a projection none of them
  // is special: the question is whether the *shape* declares the key, and the
  // answer for all of them is no, so all of them are refused at the path they
  // appear at. That is the whole content of the change, and it is asserted here
  // rather than argued.
  const undeclaredKeys = [
    "id",
    "slug",
    "status",
    "created_at",
    "content_hash",
    "reproducibility_hash",
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "",
  ]
  for (const key of undeclaredKeys) {
    for (const at of ["", "core", "presentation.latest_plan"]) {
      // `created_at` and `content_hash` *are* declared at the top level of a
      // `study`, so adding them there is not an undeclared key -- it is a
      // mutation, and it is already covered. The nested placements are the ones
      // the old rule got wrong.
      const declared = at === "" && (key === "created_at" || key === "content_hash")
      if (declared) continue
      const edit = { op: "add", path: at, key, value: "forged" }
      const mutated = applyEdits(study.record, [edit])
      cases.push({
        case_id: `study/full:undeclared:${at === "" ? "(root)" : at}:${key === "" ? "(empty)" : key}`,
        kind: "undeclared-key",
        base: "study/full",
        record_kind: "study",
        edits: [edit],
        purposes: purposesFor("study", mutated, undefined, false),
      })
    }
  }

  // -- Header components. ---------------------------------------------------
  const headerCases = [
    {
      suffix: "unknown-rules-id",
      why: "a rules id this build does not know is a rule set nobody declared",
      edits: [{ op: "set", path: "hash_rules_id", value: "study-v2" }],
      record_kind: "study",
    },
    {
      suffix: "rules-id-absent",
      why: "absent falls back to this build's id, which is the documented default",
      edits: [{ op: "delete", path: "hash_rules_id" }],
      record_kind: "study",
    },
    {
      suffix: "rules-id-not-a-string",
      why: "a non-string rules id is invalid rather than defaulted",
      edits: [{ op: "set", path: "hash_rules_id", value: 1 }],
      record_kind: "study",
    },
    {
      suffix: "schema-version-absent",
      why: "nothing is inferred: a record that does not say what it was written against is malformed",
      edits: [{ op: "delete", path: "schema_version" }],
      record_kind: "study",
    },
    {
      suffix: "schema-version-empty",
      why: "an empty header component cannot be separated from its neighbour",
      edits: [{ op: "set", path: "schema_version", value: "" }],
      record_kind: "study",
    },
    {
      suffix: "schema-version-non-ascii",
      why: "a header component outside printable ASCII would make its encoding a second question",
      edits: [{ op: "set", path: "schema_version", value: "1.0é" }],
      record_kind: "study",
    },
  ]
  for (const header of headerCases) {
    const mutated = applyEdits(study.record, header.edits)
    cases.push({
      case_id: `study/full:header:${header.suffix}`,
      kind: "header-component",
      base: "study/full",
      record_kind: header.record_kind,
      why: header.why,
      edits: header.edits,
      purposes: purposesFor(header.record_kind, mutated, undefined, false),
    })
  }

  // -- Record kinds that are not this record's kind. ------------------------
  //
  // A record kind is a preimage header component, so hashing a `study` under
  // `evidence_node` is not a mistake a digest can absorb: either the projection
  // refuses the undeclared keys, or the answer is a digest in a namespace the
  // record does not belong to. Both are pinned.
  const kindCases = [
    { kind: "not_a_record_kind", why: "a kind nobody declared" },
    { kind: "execution_job", why: "a kind this build knows and deliberately does not hash" },
    { kind: "toString", why: "a kind that resolves on Object.prototype in a language with objects for maps" },
    { kind: "__proto__", why: "and the other name that does" },
    { kind: "evidence_node", why: "a real kind, but not this record's; the projection refuses the keys" },
  ]
  for (const kindCase of kindCases) {
    cases.push({
      case_id: `study/full:kind:${kindCase.kind}`,
      kind: "record-kind",
      base: "study/full",
      record_kind: kindCase.kind,
      why: kindCase.why,
      edits: [],
      purposes: purposesFor(kindCase.kind, study.record, undefined, false),
    })
  }

  // -- A shape mismatch: the declaration says list, the record says otherwise.
  const mismatchCases = [
    {
      suffix: "array-field-is-object",
      base: "execution_capsule/full",
      record_kind: "execution_capsule",
      why: "a declared list carrying an object is refused rather than serialized under a reading nobody declared",
      edits: [{ op: "set", path: "inputs", value: { name: "circuit.stim" } }],
    },
    {
      suffix: "object-field-is-array",
      base: "study/full",
      record_kind: "study",
      why: "and the mirror: a declared object carrying a list",
      edits: [{ op: "set", path: "core", value: [1, 2] }],
    },
    {
      suffix: "object-field-is-string",
      base: "study/full",
      record_kind: "study",
      why: "a declared object carrying a scalar",
      edits: [{ op: "set", path: "core", value: "QEC" }],
    },
    {
      suffix: "object-field-is-null",
      base: "study/full",
      record_kind: "study",
      why: "null is a value the projection passes through at any declared shape",
      edits: [{ op: "set", path: "core", value: null }],
    },
  ]
  for (const mismatch of mismatchCases) {
    const base = bases.get(mismatch.base)
    const mutated = applyEdits(base.record, mismatch.edits)
    cases.push({
      case_id: `${mismatch.base}:mismatch:${mismatch.suffix}`,
      kind: "shape-mismatch",
      base: mismatch.base,
      record_kind: mismatch.record_kind,
      why: mismatch.why,
      edits: mismatch.edits,
      purposes: purposesFor(mismatch.record_kind, mutated, undefined, false),
    })
  }

  // -- Pairs, where the claim is about two records rather than one. ---------
  //
  // Three of the coverage items are relations rather than values: two spellings
  // of one character must stay distinct, two spellings of one object must
  // collapse, and two orderings of one list must not. None of them is expressible
  // as a single case, because the assertion is `left === right` or
  // `left !== right` -- so each pair pins both digests *and* the relation, and a
  // language that got both digests wrong in the same direction would still fail
  // the relation.
  //
  // `distinct` is the interesting half. RFC 8785 3.1 forbids normalization, so
  // NFC and NFD of one character are two records; a canonicalizer that
  // normalized would merge two documents a reader can see are different, and
  // would make the digest depend on which normalization library was linked in.
  const pairSpecs = [
    {
      suffix: "nfc-nfd-e-acute",
      relation: "distinct",
      why: "NFC and NFD of e-acute: different bytes, therefore different records",
      left: "\u00e9",
      right: "e\u0301",
    },
    {
      suffix: "nfc-nfd-a-ring",
      relation: "distinct",
      why: "NFC and NFD of A-ring, so the rule is not a fact about one character",
      left: "\u00c5",
      right: "A\u030a",
    },
    {
      suffix: "nfkc-ligature",
      relation: "distinct",
      why: "a compatibility ligature and its NFKC expansion, which is a wider merge still",
      left: "\ufb01",
      right: "fi",
    },
    {
      suffix: "combining-order",
      relation: "distinct",
      why: "two orderings of two combining marks, which a normalizing reader would reorder",
      left: "q\u0307\u0323",
      right: "q\u0323\u0307",
    },
    {
      suffix: "object-key-order",
      relation: "identical",
      why: "3.2.3 sorts property names, so two spellings of one object are one record",
      left: JSON.parse('{"a":1,"b":2,"\\u00e9":3}'),
      right: JSON.parse('{"\\u00e9":3,"b":2,"a":1}'),
    },
    {
      suffix: "object-key-order-astral",
      relation: "identical",
      why: "and the sort is over UTF-16 code units, so an astral name sorts by its high surrogate",
      left: JSON.parse('{"\\ud83d\\ude00":1,"\\ufb33":2}'),
      right: JSON.parse('{"\\ufb33":2,"\\ud83d\\ude00":1}'),
    },
    {
      suffix: "array-order",
      relation: "distinct",
      why: "a list is ordered: 3.2.1 leaves array element order alone",
      left: [1, 2],
      right: [2, 1],
    },
    {
      suffix: "array-duplicates",
      relation: "distinct",
      why: "a list is not a set: dropping a repeated entry is a different record",
      left: ["x", "x"],
      right: ["x"],
    },
    {
      suffix: "empty-string-is-not-null",
      relation: "distinct",
      why: "an empty string is a value, and null is a different one",
      left: "",
      right: null,
    },
  ]
  const pairs = pairSpecs.map((spec) => {
    const leftEdits = [{ op: "set", path: "core.study_type", value: spec.left }]
    const rightEdits = [{ op: "set", path: "core.study_type", value: spec.right }]
    return {
      case_id: `pair:${spec.suffix}`,
      why: spec.why,
      relation: spec.relation,
      record_kind: "study",
      base: "study/full",
      left_edits: leftEdits,
      right_edits: rightEdits,
      left_digest: semanticHash("study", applyEdits(study.record, leftEdits)),
      right_digest: semanticHash("study", applyEdits(study.record, rightEdits)),
    }
  })

  // -- Files, read as bytes. ------------------------------------------------
  //
  // Property §5 is here: the same record, serialized and read back through
  // `readStudyFileBytes`, takes the digests it took in memory. The byte-level
  // refusals are here too, because they are the cases a parsed value cannot
  // express -- a duplicate key survives no parser, a BOM is gone by the time a
  // decoder returns, and an integer past 2^53 has already become the wrong
  // number.
  const files = []
  const encoder = new TextEncoder()
  for (const [caseId, base] of bases) {
    const text = JSON.stringify(base.record)
    files.push({
      case_id: `file:${caseId}`,
      record_kind: base.entry.record_kind,
      kind: "round-trip",
      base64: Buffer.from(encoder.encode(text)).toString("base64"),
      expect: { purposes: purposesFor(base.entry.record_kind, base.record, undefined, false) },
    })
  }
  const byteCases = [
    {
      suffix: "duplicate-key",
      why: "RFC 8259 §4 makes this valid JSON and parsers disagree about which value wins",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","study_id":"a","study_id":"b"}',
    },
    {
      suffix: "duplicate-key-nested",
      why: "and one level down, where a scan that only tracked the root would miss it",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":"QEC","study_type":"QAOA"}}',
    },
    {
      suffix: "duplicate-key-across-siblings-is-not-one",
      why: "the same name in two sibling objects is not a duplicate, and must not be refused",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":"QEC"},"presentation":{"study_type":"QEC"}}',
    },
    {
      suffix: "byte-order-mark",
      why: "RFC 8259 §8.1 says MAY ignore, and `may` is what makes two readers hash two files",
      text: '\ufeff{"schema_version":"1.0"}',
    },
    {
      suffix: "unsafe-integer-literal",
      why: "the one value the two languages read differently; refused before either reads it",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":9007199254740993}}',
    },
    {
      suffix: "unsafe-integer-literal-at-the-boundary",
      why: "2^53 - 1 is exact in both and is not refused",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":9007199254740991}}',
    },
    {
      suffix: "unsafe-integer-literal-just-past-the-boundary",
      why: "2^53 is one integer further and is refused, so the bound is checked rather than assumed",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":9007199254740992}}',
    },
    {
      suffix: "large-float-literal-is-not-an-unsafe-integer",
      why: "a literal with a point or an exponent is the same double in both languages, however large",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":1e30}}',
    },
    {
      suffix: "lone-surrogate-escape",
      why: "syntactically valid JSON that one language hashes and the other cannot encode",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":"\\ud800"}}',
    },
    {
      suffix: "paired-surrogate-escape",
      why: "the same escape, paired, which is an ordinary astral character",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":"\\ud83d\\ude00"}}',
    },
    {
      suffix: "negative-zero-literal",
      why: "`-0` is a literal JSON.stringify never writes, and renders as `0` in both languages",
      text: '{"schema_version":"1.0","hash_rules_id":"study-v1","core":{"study_type":-0}}',
    },
  ]
  for (const byteCase of byteCases) {
    const bytes = encoder.encode(byteCase.text)
    files.push({
      case_id: `file:bytes:${byteCase.suffix}`,
      record_kind: "study",
      kind: "byte-level",
      why: byteCase.why,
      base64: Buffer.from(bytes).toString("base64"),
      expect: fileExpectation("study", bytes),
    })
  }
  // Invalid UTF-8 has no text spelling at all, so it is built from bytes.
  const invalidUtf8 = Uint8Array.from([
    ...encoder.encode('{"schema_version":"1.0","core":{"study_type":"'),
    0xff,
    0xfe,
    ...encoder.encode('"}}'),
  ])
  files.push({
    case_id: "file:bytes:invalid-utf8",
    record_kind: "study",
    kind: "byte-level",
    why: "a decoder that substituted U+FFFD would hash a repair nobody made",
    base64: Buffer.from(invalidUtf8).toString("base64"),
    expect: fileExpectation("study", invalidUtf8),
  })

  // -- Artifacts: literal bytes, no parse and no projection. ----------------
  const artifacts = [
    { suffix: "empty", record_kind: "execution_capsule", bytes: new Uint8Array(0) },
    { suffix: "csv", record_kind: "research_package", bytes: encoder.encode("label,value\r\np_L,1e-3\r\n") },
    { suffix: "utf8", record_kind: "evidence_node", bytes: encoder.encode("é\u{1f600}€") },
    { suffix: "nfd", record_kind: "evidence_node", bytes: encoder.encode("é\u{1f600}€") },
    { suffix: "not-utf8", record_kind: "execution_capsule", bytes: Uint8Array.from([0xff, 0xfe, 0x00]) },
  ].map((artifact) => ({
    case_id: `artifact:${artifact.suffix}`,
    record_kind: artifact.record_kind,
    why: "an artifact digest is over bytes: no decode, no canonicalization, no projection",
    base64: Buffer.from(artifact.bytes).toString("base64"),
    digest: artifactHash(artifact.record_kind, artifact.bytes, SCHEMA_VERSION),
  }))

  // -- The two string number contracts, which are `str` in both languages. --
  //
  // Only the string contracts are pinned across the boundary, and the omission
  // is deliberate rather than an oversight. `finite_float` and `safe_integer`
  // ask what *type* a value has, and JSON's number has two types in Python and
  // one here: the literal `3` is an `int` there and a `number` here, `3.0` is a
  // `float` there and the same `number` here. No cross-language answer to "is
  // this a safe integer" exists for a JSON number, which is exactly why the
  // digest is defined over the canonical *rendering* -- where `3` and `3.0` are
  // one string -- rather than over the predicate. A string is a `str` in both.
  const stringContractValues = [
    "0",
    "1",
    "-1",
    "-0",
    "007",
    "00",
    "+7",
    "1e3",
    "1E3",
    "1_000",
    "1.5",
    "1.50",
    "-0.0",
    "0.0",
    "",
    " 1",
    "1 ",
    "1\n",
    "\n1",
    "1\r",
    "1\u0000",
    "18446744073709551615",
    "-9007199254740993",
    "١٢٣",
    "1".repeat(64),
    "1".repeat(65),
    `1.${"0".repeat(64)}`,
    `1.${"0".repeat(65)}`,
  ]
  const stringContracts = stringContractValues.map((value, index) => ({
    case_id: `string-contract/${index}`,
    value,
    exact_integer_string: isExactIntegerString(value),
    exact_decimal_string: isExactDecimalString(value),
  }))

  return {
    note:
      "Written by scripts/generate-study-property-corpus.mjs from the seed recorded below, checked in " +
      "place by tests/study-properties.test.mjs and by python/tests/test_study_properties.py. One corpus " +
      "rather than two random walks: a divergence between the languages is then a disagreement about one " +
      "input rather than a report that two suites explored different ground. Do not hand-edit -- " +
      "regenerate, and read the diff.",
    seed,
    generator: "scripts/generate-study-property-corpus.mjs",
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    limits: { ...STUDY_HASH_LIMITS },
    case_kinds: CASE_KINDS,
    records,
    cases,
    pairs,
    files,
    artifacts,
    string_contracts: stringContracts,
  }
}

/**
 * What each family of cases is asking, said once instead of on every case.
 *
 * Eight hundred `"why": "one leaf replaced; the classification says which
 * digests may move"` strings would be eight hundred copies of one sentence, and
 * a reader diffing the fixture would learn nothing from any of them. The bespoke
 * cases keep their own `why`, because each of those says something the group
 * does not.
 */
const CASE_KINDS = Object.freeze({
  "leaf-mutation":
    "One declared leaf replaced with a value the canonicalizer renders differently. The " +
    "`visible` block is the prediction the classification makes: a digest whose purpose reaches " +
    "the path must move, and one whose purpose does not must not.",
  "field-deletion":
    "One top-level field removed. Absent and null are different statements -- the projection " +
    "omits a field the record does not carry rather than writing null -- so this is a different " +
    "input from the leaf mutation that sets the same path to null.",
  "value-outside-json":
    "A value JSON has no syntax for, or one `JSON.stringify` would silently rewrite. Built by " +
    "each language from the named special rather than parsed out of this file.",
  "structural-bound":
    "A document past one of the three bounds, under limits small enough to write down. The " +
    "limits travel with the case because every entry point takes them as an argument in both " +
    "languages; neither reads a global.",
  "undeclared-key":
    "A key nobody declared, at the root and two levels down. The question the projection asks is " +
    "whether the shape declares the key, never whether the key is called something suspicious, " +
    "so every name here is refused at the depth it appears at.",
  "header-component":
    "One of the two header components a record repeats. They are DERIVED, so no projection reads " +
    "them -- and the digest still moves, because `buildStudyPreimage` commits to them outside " +
    "the body.",
  "record-kind":
    "A record hashed under a kind that is not its own: unknown, control-plane, resolvable on " +
    "`Object.prototype`, or a real kind whose shape does not declare these keys.",
  "shape-mismatch":
    "A value of the wrong shape for its declaration. The projection builds the body from the " +
    "declaration, so it refuses rather than serializing under a reading nobody declared.",
})

/**
 * What `readStudyFileBytes` does with these bytes, and then what the digests are.
 *
 * The two steps are one case because they are one question: a reader who has a
 * file has bytes, not a value, and "does this file hash to what the record
 * hashed to" is only answerable through the gate that refuses a BOM, a duplicate
 * key and an integer neither language can agree about.
 */
function fileExpectation(recordKind, bytes) {
  let reading
  try {
    reading = readStudyFileBytes(bytes).value
  } catch (error) {
    if (error.code === undefined) throw error
    return { refusal: { code: error.code, path: error.path ?? null } }
  }
  return { purposes: purposesFor(recordKind, reading, undefined, false) }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeFileSync(
    resolve(root, "fixtures", "study", "property-corpus.json"),
    `${JSON.stringify(buildCorpus(), null, 2)}\n`,
  )
}
