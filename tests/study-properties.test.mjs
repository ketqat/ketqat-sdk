// Properties of the study hashing family, and the cross-language corpus
// (goal §16).
//
// The other study test files pin cases somebody thought of. This one states the
// rules those cases are instances of, and checks them against inputs nobody
// chose by hand:
//
//   §1  records defined as identical produce identical canonical bytes
//   §2  changing one SEMANTIC field changes the semantic bytes
//   §3  changing only a RECORD_ONLY or RECEIPT_ONLY field behaves exactly as its
//       classification says -- unchanged where the classification excludes it,
//       changed where it includes it
//   §4  TypeScript and Python return the same bytes, or the same refusal code
//       and JSON path, for the same input
//   §5  a record built in memory and the same record re-read from a file hash
//       identically
//
// §2 and §3 are one predicate here rather than two assertions, and the merge is
// deliberate. Stated separately, §2 says "a semantic change moves the semantic
// digest" and §3 says "a presentation change does not" -- two claims whose
// conjunction is the real rule: **the digest moves exactly when the projection
// reaches the field.** An implementation that hashed every field would pass §2
// and fail §3; one that hashed nothing would pass §3 and fail §2; only the `iff`
// rules out both. `visiblePaths` below derives the prediction from the class
// tables, independently of the code that reads them, so a wrong classification
// fails rather than being restated.
//
// §4 cannot be asked from one language, so it is asked through a file:
// `fixtures/study/property-corpus.json` carries the inputs and the answers
// TypeScript gives, this file checks them, and
// `python/tests/test_study_properties.py` checks the same file. A divergence
// then fails on the side that diverged, with a case id naming the input, rather
// than as two suites reporting different totals.
//
// `fast-check` is a devDependency and reaches no consumer: the runtime
// dependency set is `zod` and `zod-to-json-schema`, asserted by
// `tests/dependency-advisory-floors.test.mjs`.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import fc from "fast-check"

import {
  STUDY_HASH_LIMITS,
  STUDY_HASH_RULES_ID,
  STUDY_RECORD_KINDS,
  STUDY_RECORD_KIND_NAMES,
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
import {
  CORPUS_SEED,
  LEAF_VALUES,
  applyEdits,
  buildCorpus,
} from "../scripts/generate-study-property-corpus.mjs"

const CORPUS_PATH = new URL("../fixtures/study/property-corpus.json", import.meta.url)
const CORPUS_TEXT = readFileSync(CORPUS_PATH, "utf8")
const CORPUS = JSON.parse(CORPUS_TEXT)

const PURPOSES = ["semantic", "record", "receipt"]
const HASH_FOR_PURPOSE = { semantic: semanticHash, record: recordHash, receipt: receiptHash }

/**
 * How many cases a generative property draws.
 *
 * The PR gate runs a fixed number from a fixed seed, so a red build is a red
 * build for everybody and not a coin toss that lands differently on a rerun. A
 * scheduled job raises `KETQAT_PROPERTY_RUNS` and explores further; a case it
 * finds is then written into the corpus, where it stays found.
 */
const RUNS = Number(process.env.KETQAT_PROPERTY_RUNS ?? 120)
const FC = { numRuns: RUNS, seed: CORPUS_SEED, endOnFailure: false }

const entriesByKind = new Map(STUDY_RECORD_KINDS.map((entry) => [entry.record_kind, entry]))

function defineKey(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

/** A deep copy that keeps `__proto__` an own key rather than a prototype write. */
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
 * The same deep copy, with every object's keys in reverse insertion order.
 *
 * This is property §1's whole input: two objects a reader would call identical,
 * differing only in the order somebody happened to write them. RFC 8785 §3.2.3
 * sorts property names, so the two must reach one byte sequence -- and a
 * canonicalizer that emitted keys in insertion order would pass every fixture in
 * this repository, because every fixture was written once.
 */
function reverseKeyOrder(value) {
  if (Array.isArray(value)) return value.map(reverseKeyOrder)
  if (value !== null && typeof value === "object") {
    const out = {}
    for (const key of Object.keys(value).reverse()) defineKey(out, key, reverseKeyOrder(value[key]))
    return out
  }
  return value
}

/**
 * The classification, re-derived here rather than imported.
 *
 * `scripts/generate-study-property-corpus.mjs` computes the same predicate when
 * it writes the corpus, and this file deliberately does not import it: a
 * prediction checked against the code that made it is not a check. The rule is
 * short enough to state twice, and the third statement is in Python, so a
 * classification that moved would have to move in three places before anything
 * passed.
 *
 * The rule itself is `STUDY_PURPOSE_FIELD_CLASSES`, read as a path predicate:
 * the *first* segment is selected by the purpose's top-level classes, and every
 * segment below it by the nested classes -- which is the composition rule that
 * the `study_event` receipt defect broke. Under the retired reading, top-level
 * classes were applied at every depth, so a `RECEIPT_ONLY` `plan_ref` selected
 * the pointer and then dropped the `SEMANTIC` fields inside it, and two events
 * adopting two different plan revisions took one receipt digest. That case is
 * `study_event/full:set:plan_ref.revision_hash` in the corpus, and it is the
 * reason this predicate walks ancestors instead of asking about one field.
 */
function visibleForPurpose(classes, purpose, declPath) {
  const top = new Set(fieldClassesForPurpose(purpose))
  const nested = new Set(nestedFieldClassesForPurpose(purpose))
  const parts = declPath.split(".")
  for (let index = 0; index < parts.length; index += 1) {
    const fieldClass = classes.get(parts.slice(0, index + 1).join("."))
    assert.ok(fieldClass !== undefined, `No class declared for ${parts.slice(0, index + 1).join(".")}`)
    if (!(index === 0 ? top : nested).has(fieldClass)) return false
  }
  return true
}

/** Every declaration path of a shape, with the class declared for it. */
function flattenClasses(shape) {
  const out = new Map()
  const visit = (current, prefix, seen) => {
    if (seen.has(current)) return
    const deeper = new Set(seen).add(current)
    for (const declaration of current.fields) {
      const path = prefix === "" ? declaration.name : `${prefix}.${declaration.name}`
      out.set(path, declaration.field_class)
      let value = declaration.value
      while (value.kind === "array") value = value.item
      if (value.kind === "object") visit(value.shape, path, deeper)
    }
  }
  visit(shape, "", new Set())
  return out
}

const classesByKind = new Map(
  STUDY_RECORD_KINDS.map((entry) => [entry.record_kind, flattenClasses(entry.shape)]),
)

/**
 * Every declaration path of a shape that ends in a leaf.
 *
 * A leaf is where a value actually lives, so the set of leaf paths is the set of
 * places a record can differ. An intermediate object path is not one: changing
 * `core` means changing something inside it, and the case that does so is
 * already here under a longer path.
 */
function declarationLeafPaths(shape) {
  const out = []
  const visit = (current, prefix, seen) => {
    if (seen.has(current)) return
    const deeper = new Set(seen).add(current)
    for (const declaration of current.fields) {
      const path = prefix === "" ? declaration.name : `${prefix}.${declaration.name}`
      let value = declaration.value
      while (value.kind === "array") value = value.item
      if (value.kind === "object") visit(value.shape, path, deeper)
      else out.push(path)
    }
  }
  visit(shape, "", new Set())
  return out
}

/**
 * Where every declared leaf actually sits in one record.
 *
 * A declaration path names a field; a concrete path names a place. `inputs.name`
 * is one field and `inputs[0].name`, `inputs[1].name` are two places, and a
 * mutation needs the second while the classification lookup needs the first.
 */
function leafLocations(shape, record) {
  const found = []
  const walkValue = (valueShape, value, declPath, concretePath) => {
    if (value === undefined) return
    if (valueShape.kind === "leaf") {
      found.push({ declPath, concretePath })
      return
    }
    if (valueShape.kind === "array") {
      if (!Array.isArray(value)) return
      value.forEach((item, index) =>
        walkValue(valueShape.item, item, declPath, `${concretePath}[${index}]`),
      )
      return
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) return
    walkShape(valueShape.shape, value, declPath, concretePath)
  }
  const walkShape = (current, value, declPrefix, concretePrefix) => {
    for (const declaration of current.fields) {
      if (!Object.prototype.hasOwnProperty.call(value, declaration.name)) continue
      const declPath = declPrefix === "" ? declaration.name : `${declPrefix}.${declaration.name}`
      const concretePath =
        concretePrefix === "" ? declaration.name : `${concretePrefix}.${declaration.name}`
      walkValue(declaration.value, value[declaration.name], declPath, concretePath)
    }
  }
  walkShape(shape, record, "", "")
  return found
}

/** What a purpose does with a record: bytes and a digest, or a refusal. */
function outcomeFor(recordKind, record, purpose, limits) {
  try {
    return {
      body: studyCanonicalBody(recordKind, record, purpose, limits),
      digest: HASH_FOR_PURPOSE[purpose](recordKind, record, limits),
    }
  } catch (error) {
    if (error.code === undefined) throw error
    return { refusal: { code: error.code, path: error.path ?? null } }
  }
}

function digestOutcome(recordKind, record, purpose, limits) {
  const outcome = outcomeFor(recordKind, record, purpose, limits)
  return outcome.refusal === undefined ? { digest: outcome.digest } : outcome
}

// ---------------------------------------------------------------------------
// The corpus: property §4, and the pinned answers behind §1--§3 and §5
// ---------------------------------------------------------------------------

test("the corpus is exactly what its recorded seed produces", () => {
  // The seed is in the file so a failure is reproducible from the file alone.
  // This is what makes that claim true rather than decorative: regenerating from
  // the recorded seed has to reproduce the file byte for byte, so a corpus
  // edited by hand -- to make a failing case pass, say -- fails here.
  assert.equal(CORPUS.seed, CORPUS_SEED)
  assert.equal(
    `${JSON.stringify(buildCorpus(CORPUS.seed), null, 2)}\n`,
    CORPUS_TEXT,
    "The corpus is not what the generator produces from its seed. Regenerate it with " +
      "`node scripts/generate-study-property-corpus.mjs` and read the diff.",
  )
})

test("the corpus is itself a file this family accepts", () => {
  // Not decoration. The corpus is full of the values that break readers, and a
  // fixture the family's own file gate refuses would be evidence of nothing --
  // it would prove that these bytes are unhashable, not that they hash the same
  // in two languages. It is also what forces the two values that cannot be
  // written down here -- a lone surrogate, an integer past 2^53 -- to be carried
  // as instructions and as base64 rather than as literals.
  const reading = readStudyFileBytes(new Uint8Array(readFileSync(CORPUS_PATH)))
  assert.equal(reading.value.seed, CORPUS_SEED)
})

test("the corpus agrees with this build about the rules it was written under", () => {
  assert.deepEqual({ ...CORPUS.limits }, { ...STUDY_HASH_LIMITS })
  assert.equal(CORPUS.hash_rules_id, STUDY_HASH_RULES_ID)
  const covered = new Set(CORPUS.records.map((entry) => entry.record_kind))
  assert.deepEqual(
    [...covered].sort(),
    [...STUDY_RECORD_KIND_NAMES].sort(),
    "A record kind with no corpus record is a kind nothing checks across the language boundary.",
  )
})

test("every base record reproduces its pinned bodies, digests and self-hash", () => {
  const failures = []
  for (const entry of CORPUS.records) {
    for (const purpose of PURPOSES) {
      const actual = outcomeFor(entry.record_kind, entry.record, purpose, undefined)
      if (JSON.stringify(actual) !== JSON.stringify(entry.purposes[purpose])) {
        failures.push(`${entry.case_id} ${purpose}: ${JSON.stringify(actual)}`)
      }
    }
    const expected = entry.self_hash
    let actual
    try {
      actual = {
        field: expected.field,
        purpose: expected.purpose,
        digest: studySelfHash(entry.record_kind, entry.record),
      }
    } catch (error) {
      if (error.code === undefined) throw error
      actual = {
        field: expected.field,
        purpose: expected.purpose,
        refusal: { code: error.code, path: error.path ?? null },
      }
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${entry.case_id} self_hash: ${JSON.stringify(actual)}`)
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 8).join("\n"))
})

test("every case reproduces its pinned answer", () => {
  const failures = []
  for (const testCase of CORPUS.cases) {
    const base = CORPUS.records.find((entry) => entry.case_id === testCase.base)
    assert.ok(base !== undefined, `${testCase.case_id} names an unknown base ${testCase.base}`)
    const record = applyEdits(base.record, testCase.edits)
    for (const purpose of PURPOSES) {
      const expected =
        testCase.purposes[purpose] === "unchanged"
          ? base.purposes[purpose].refusal !== undefined
            ? { refusal: base.purposes[purpose].refusal }
            : { digest: base.purposes[purpose].digest }
          : testCase.purposes[purpose]
      const actual = digestOutcome(testCase.record_kind, record, purpose, testCase.limits)
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(
          `${testCase.case_id} ${purpose}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        )
      }
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 8).join("\n"))
})

test("§2 and §3: a digest moves exactly when its projection reaches the field", () => {
  // The corpus records the prediction the classification makes; this rederives
  // it and compares both to each other and to what the digests actually did. The
  // third check is the one that matters, and the first is what keeps the fixture
  // from drifting into a transcript of whatever the code happens to do.
  const failures = []
  let checked = 0
  for (const testCase of CORPUS.cases) {
    if (testCase.visible === undefined) continue
    const base = CORPUS.records.find((entry) => entry.case_id === testCase.base)
    const classes = classesByKind.get(testCase.record_kind)
    for (const purpose of PURPOSES) {
      const predicted = visibleForPurpose(classes, purpose, testCase.declaration_path)
      if (predicted !== testCase.visible[purpose]) {
        failures.push(
          `${testCase.case_id} ${purpose}: the corpus predicts ${testCase.visible[purpose]} and the ` +
            `class tables predict ${predicted}`,
        )
        continue
      }
      // A purpose the base record already refuses says nothing about visibility:
      // `semanticHash` over a `study_event` refuses for every event ever
      // written, so "did the digest move" has no answer to compare.
      if (base.purposes[purpose].refusal !== undefined) continue
      checked += 1
      const moved = testCase.purposes[purpose] !== "unchanged"
      if (moved !== predicted) {
        failures.push(
          `${testCase.case_id} ${purpose}: ${testCase.field_class} at ${testCase.declaration_path} ` +
            `is ${predicted ? "read" : "not read"} by this purpose, and the digest ` +
            `${moved ? "moved" : "did not move"}`,
        )
      }
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 8).join("\n"))
  assert.ok(checked > 1000, `Only ${checked} classification claims were checkable.`)
})

test("every declared leaf of every kind is mutated somewhere in the corpus", () => {
  // The coverage claim, checked rather than asserted in a comment. A field added
  // to a shape and to no fixture is exactly the silent omission the projection's
  // allowlist can hide, and `tests/study-field-completeness.test.mjs` catches it
  // only against the Zod schema -- it says nothing about whether anything hashes
  // the field afterwards. This does.
  const failures = []
  for (const entry of STUDY_RECORD_KINDS) {
    const expected = declarationLeafPaths(entry.shape).filter(
      // Committed by the preimage header rather than by the body, and exercised
      // as header components instead. See the `header` cases.
      (path) => path !== "schema_version" && path !== "hash_rules_id",
    )
    const mutated = new Set(
      CORPUS.cases
        .filter(
          (testCase) =>
            testCase.kind === "leaf-mutation" && testCase.base === `${entry.record_kind}/full`,
        )
        .map((testCase) => testCase.declaration_path),
    )
    for (const path of expected) {
      if (!mutated.has(path)) failures.push(`${entry.record_kind}: ${path}`)
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Declared leaves nothing in the corpus changes:\n${failures.slice(0, 12).join("\n")}`,
  )
})

test("the corpus exercises both sides of the classification", () => {
  // A corpus in which every mutation moved every digest would pass the property
  // above while proving nothing about exclusion, and one in which none did would
  // prove nothing about inclusion. Both halves have to be populated for the
  // `iff` to have any content.
  let moved = 0
  let held = 0
  for (const testCase of CORPUS.cases) {
    if (testCase.visible === undefined) continue
    if (testCase.visible.semantic === true && testCase.purposes.semantic !== "unchanged") moved += 1
    if (testCase.visible.semantic === false && testCase.purposes.semantic === "unchanged") held += 1
  }
  assert.ok(moved > 200, `Only ${moved} mutations moved the semantic digest.`)
  assert.ok(held > 50, `Only ${held} mutations were excluded from the semantic digest.`)
})

test("a record's own hash field is inert in all four digests", () => {
  // What makes building and verifying one call rather than two: the builder
  // hashes a record it has not stamped, the verifier hashes one that is already
  // stamped, and they must not be two code paths.
  const failures = []
  for (const entry of STUDY_RECORD_KINDS) {
    const base = CORPUS.records.find((record) => record.case_id === `${entry.record_kind}/full`)
    const stamped = applyEdits(base.record, [
      { op: "set", path: entry.self_hash_field, value: "f".repeat(64) },
    ])
    for (const purpose of PURPOSES) {
      const before = JSON.stringify(digestOutcome(entry.record_kind, base.record, purpose))
      const after = JSON.stringify(digestOutcome(entry.record_kind, stamped, purpose))
      if (before !== after) failures.push(`${entry.record_kind} ${purpose}`)
    }
  }
  assert.deepEqual(failures, [])
})

test("pairs: two spellings of one value, and one spelling of two", () => {
  for (const pair of CORPUS.pairs) {
    const base = CORPUS.records.find((entry) => entry.case_id === pair.base)
    const left = semanticHash(pair.record_kind, applyEdits(base.record, pair.left_edits))
    const right = semanticHash(pair.record_kind, applyEdits(base.record, pair.right_edits))
    assert.equal(left, pair.left_digest, `${pair.case_id} left`)
    assert.equal(right, pair.right_digest, `${pair.case_id} right`)
    if (pair.relation === "identical") {
      assert.equal(left, right, `${pair.case_id}: ${pair.why}`)
    } else {
      assert.notEqual(left, right, `${pair.case_id}: ${pair.why}`)
    }
  }
})

test("§5: a record read back from a file hashes as it did in memory", () => {
  const failures = []
  for (const fileCase of CORPUS.files) {
    const bytes = new Uint8Array(Buffer.from(fileCase.base64, "base64"))
    let actual
    try {
      const reading = readStudyFileBytes(bytes)
      actual = {
        purposes: Object.fromEntries(
          PURPOSES.map((purpose) => [
            purpose,
            digestOutcome(fileCase.record_kind, reading.value, purpose),
          ]),
        ),
      }
    } catch (error) {
      if (error.code === undefined) throw error
      actual = { refusal: { code: error.code, path: error.path ?? null } }
    }
    if (JSON.stringify(actual) !== JSON.stringify(fileCase.expect)) {
      failures.push(`${fileCase.case_id}: ${JSON.stringify(actual).slice(0, 200)}`)
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 8).join("\n"))

  // Every round-trip case must have agreed with the in-memory record it was
  // serialized from, which is the property rather than a restatement of the
  // fixture: the base record and its bytes are two inputs, and the corpus pins
  // one answer for both.
  for (const fileCase of CORPUS.files) {
    if (fileCase.kind !== "round-trip") continue
    const baseId = fileCase.case_id.slice("file:".length)
    const base = CORPUS.records.find((entry) => entry.case_id === baseId)
    for (const purpose of PURPOSES) {
      const inMemory = base.purposes[purpose]
      const expected =
        inMemory.refusal === undefined ? { digest: inMemory.digest } : { refusal: inMemory.refusal }
      assert.deepEqual(fileCase.expect.purposes[purpose], expected, `${fileCase.case_id} ${purpose}`)
    }
  }
})

test("artifact digests are over bytes, with no decode and no projection", () => {
  for (const artifact of CORPUS.artifacts) {
    const bytes = new Uint8Array(Buffer.from(artifact.base64, "base64"))
    assert.equal(
      artifactHash(artifact.record_kind, bytes, CORPUS.schema_version),
      artifact.digest,
      artifact.case_id,
    )
  }
  // Two of the entries are the NFC and NFD spellings of one string, and one is
  // not valid UTF-8 at all. All three are ordinary byte sequences here, which is
  // the difference between this digest and the other three.
  const [nfc] = CORPUS.artifacts.filter((entry) => entry.case_id === "artifact:utf8")
  const [nfd] = CORPUS.artifacts.filter((entry) => entry.case_id === "artifact:nfd")
  assert.notEqual(nfc.digest, nfd.digest)
})

test("the two string number contracts admit one spelling per value, in both languages", () => {
  // Only the string contracts are pinned across the boundary. `finite_float` and
  // `safe_integer` ask what *type* a value has, and JSON's number has two types
  // in Python and one here -- the literal `3` is an `int` there and a `number`
  // here, `3.0` is a `float` there and the same `number` here. No cross-language
  // answer to "is this a safe integer" exists for a JSON number, which is
  // exactly why the digest is defined over the canonical rendering, where `3`
  // and `3.0` are one string. A `str` is a `str` in both.
  for (const entry of CORPUS.string_contracts) {
    assert.equal(
      isExactIntegerString(entry.value),
      entry.exact_integer_string,
      `${entry.case_id} exact_integer_string ${JSON.stringify(entry.value)}`,
    )
    assert.equal(
      isExactDecimalString(entry.value),
      entry.exact_decimal_string,
      `${entry.case_id} exact_decimal_string ${JSON.stringify(entry.value)}`,
    )
  }
  // A trailing newline is the case this section exists for. Python's `re` lets
  // `$` match before one, so `is_exact_integer_string("1\n")` returned true
  // there and false here until `study_values.py` moved to `fullmatch` --
  // two spellings of one value accepted by one language's contract and refused
  // by the other's, which is the injectivity failure the contract exists to
  // close, arriving through the regex rather than through the number.
  assert.equal(isExactIntegerString("1\n"), false)
  assert.equal(isExactDecimalString("1\n"), false)
})

test("the corpus reaches the refusals it claims to", () => {
  // Anti-vacuity for the refusal half: a corpus whose every case produced a
  // digest would check the accepting path only, and every refusal in
  // `STUDY_HASH_REFUSAL_CODES` would be unexercised across the boundary while
  // the suite reported green.
  const reached = new Set()
  const collect = (outcome) => {
    if (outcome !== null && typeof outcome === "object" && outcome.refusal !== undefined) {
      reached.add(outcome.refusal.code)
    }
  }
  for (const entry of CORPUS.records) for (const purpose of PURPOSES) collect(entry.purposes[purpose])
  for (const testCase of CORPUS.cases) for (const purpose of PURPOSES) collect(testCase.purposes[purpose])
  for (const fileCase of CORPUS.files) collect(fileCase.expect)
  const required = [
    "BYTE_ORDER_MARK",
    "DUPLICATE_PROPERTY",
    "EMPTY_PROJECTION",
    "INVALID_HEADER_COMPONENT",
    "INVALID_UTF8",
    "LONE_SURROGATE",
    "MAX_CANONICAL_BYTES_EXCEEDED",
    "MAX_DEPTH_EXCEEDED",
    "MAX_NODES_EXCEEDED",
    "MISSING_HEADER_COMPONENT",
    "NON_FINITE_NUMBER",
    "NOT_CONTENT_ADDRESSED",
    "SHAPE_MISMATCH",
    "UNDECLARED_FIELD",
    "UNKNOWN_HASH_RULES_ID",
    "UNKNOWN_RECORD_KIND",
    "UNSAFE_INTEGER",
  ]
  const missing = required.filter((code) => !reached.has(code))
  assert.deepEqual(missing, [], `The corpus no longer reaches: ${missing.join(", ")}`)
})

// ---------------------------------------------------------------------------
// Generated properties: §1, §2, §3, §5 without the other language present
// ---------------------------------------------------------------------------

/**
 * A record of a kind, with every optional field optional.
 *
 * `requiredKeys: []` is what covers "optional fields present and absent" without
 * a table of which ones to drop: fast-check drops a different subset every draw
 * and shrinks toward the smallest record that still fails. The two header
 * components are put back afterwards, because they are not optional -- a record
 * that does not name its schema version is refused before any projection runs,
 * and a generator that dropped them would spend its draws on one refusal.
 */
function shapeArbitrary(shape) {
  const model = {}
  for (const declaration of shape.fields) {
    model[declaration.name] = valueArbitrary(declaration.value)
  }
  return fc.record(model, { requiredKeys: [] })
}

function valueArbitrary(valueShape) {
  if (valueShape.kind === "leaf") return fc.constantFrom(...LEAF_VALUES).map(cloneJson)
  if (valueShape.kind === "array") {
    return fc.array(valueArbitrary(valueShape.item), { maxLength: 2 })
  }
  return shapeArbitrary(valueShape.shape)
}

function recordArbitrary(entry) {
  return shapeArbitrary(entry.shape).map((drawn) => {
    const record = cloneJson(drawn)
    defineKey(record, "schema_version", CORPUS.schema_version)
    defineKey(record, "hash_rules_id", STUDY_HASH_RULES_ID)
    return record
  })
}

const kindArbitrary = fc
  .constantFrom(...STUDY_RECORD_KIND_NAMES)
  .chain((recordKind) =>
    recordArbitrary(entriesByKind.get(recordKind)).map((record) => ({ recordKind, record })),
  )

test("§1: two spellings of one record produce one canonical byte sequence", () => {
  fc.assert(
    fc.property(kindArbitrary, ({ recordKind, record }) => {
      const reordered = reverseKeyOrder(record)
      for (const purpose of PURPOSES) {
        const left = outcomeFor(recordKind, record, purpose)
        const right = outcomeFor(recordKind, reordered, purpose)
        assert.deepEqual(right, left, `${recordKind} ${purpose}`)
      }
    }),
    FC,
  )
})

test("§2 and §3: one leaf changed moves exactly the digests whose purpose reads it", () => {
  // A draw that carries no mutable leaf is a legitimate draw and not a case, and
  // `fc.pre` discards it -- so the run count is an upper bound on the claims
  // actually made, and a filter that quietly rejected everything would leave a
  // green test that asserted nothing. The counter is what rules that out.
  const observed = { visible: 0, blind: 0 }
  fc.assert(
    fc.property(kindArbitrary, fc.nat(), fc.nat(), ({ recordKind, record }, where, what) => {
      const entry = entriesByKind.get(recordKind)
      const classes = classesByKind.get(recordKind)
      const locations = leafLocations(entry.shape, record)
      // A draw that produced no leaf at all is a record with nothing to change,
      // which is a legitimate draw and not a case.
      fc.pre(locations.length > 0)
      const location = locations[where % locations.length]
      // The two header components are committed by the preimage rather than by
      // the body, so they move every digest while the class tables -- correctly
      // -- say no projection reads them. They are exercised as header components
      // in the corpus instead.
      fc.pre(location.declPath !== "schema_version" && location.declPath !== "hash_rules_id")

      const before = readAtPath(record, location.concretePath)
      const beforeText = JSON.stringify(before) ?? "undefined"
      const candidates = LEAF_VALUES.filter((value) => JSON.stringify(value) !== beforeText)
      const mutated = applyEdits(record, [
        { op: "set", path: location.concretePath, value: candidates[what % candidates.length] },
      ])

      for (const purpose of PURPOSES) {
        const left = outcomeFor(recordKind, record, purpose)
        const right = outcomeFor(recordKind, mutated, purpose)
        if (left.refusal !== undefined || right.refusal !== undefined) {
          // Nothing in the leaf pool can cause a refusal by itself -- no NaN, no
          // lone surrogate, nothing past a bound -- so the only refusals
          // reachable here are structural, decided by the shape rather than by
          // the record. `EMPTY_PROJECTION` on a `study_event`'s semantic digest
          // is the one that fires. A structural refusal cannot move when a leaf
          // does, and asserting that is a real claim rather than a skip.
          assert.deepEqual(right, left, `${recordKind} ${purpose}: a refusal moved with a leaf`)
          continue
        }
        const predicted = visibleForPurpose(classes, purpose, location.declPath)
        observed[predicted ? "visible" : "blind"] += 1
        assert.equal(
          left.body !== right.body,
          predicted,
          `${recordKind} ${purpose} at ${location.concretePath} (${classes.get(location.declPath)})`,
        )
        // The digest follows the bytes exactly: same header, same body, same
        // digest, and no two different bodies share one. Without this the
        // property above would be a claim about a string nobody hashes.
        assert.equal(left.digest !== right.digest, left.body !== right.body)
      }
    }),
    FC,
  )
  assert.ok(observed.visible > 20, `Only ${observed.visible} draws reached a field a purpose reads.`)
  assert.ok(observed.blind > 20, `Only ${observed.blind} draws reached a field a purpose excludes.`)
})

test("§5: serialize, read back through the file gate, hash the same", () => {
  fc.assert(
    fc.property(kindArbitrary, ({ recordKind, record }) => {
      const bytes = new TextEncoder().encode(JSON.stringify(record))
      // Nothing in the leaf pool can fail this gate, and that is the claim: a
      // record built from values this family accepts survives being written to a
      // file and read back. A refusal here is a real failure, not a skip.
      const reading = readStudyFileBytes(bytes)
      for (const purpose of PURPOSES) {
        assert.deepEqual(
          outcomeFor(recordKind, reading.value, purpose),
          outcomeFor(recordKind, record, purpose),
          `${recordKind} ${purpose}`,
        )
      }
    }),
    FC,
  )
})

test("a polluted Object.prototype cannot supply a field a record does not carry", () => {
  // The projection reads own properties through `Object.prototype.hasOwnProperty`
  // rather than `record.field`. Without that, a record missing `status` would
  // project whatever somebody had written onto the prototype, and every record
  // in the process would project the same forged value.
  const record = applyEdits(
    CORPUS.records.find((candidate) => candidate.case_id === "study/full").record,
    [{ op: "delete", path: "presentation.status" }],
  )
  const clean = studyCanonicalBody("study", record, "record")
  assert.ok(!clean.includes('"status"'), "the record was supposed to be missing `status`")
  Object.prototype.status = "forged"
  try {
    assert.equal(studyCanonicalBody("study", record, "record"), clean)
  } finally {
    delete Object.prototype.status
  }
})

/** Read one concrete path, in the grammar the projection reports refusals in. */
function readAtPath(record, path) {
  let current = record
  let name = ""
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index]
    if (char === ".") {
      if (name !== "") current = current[name]
      name = ""
      continue
    }
    if (char === "[") {
      if (name !== "") current = current[name]
      name = ""
      const end = path.indexOf("]", index)
      current = current[Number(path.slice(index + 1, end))]
      index = end
      continue
    }
    name += char
  }
  return name === "" ? current : current[name]
}
