import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { IDENTITY_KEYS, TIMING_KEYS, calculateReproducibilityHash } from "../dist/index.js"
import {
  EvidenceEdgeSchema,
  EvidenceNodeSchema,
  ExecutionCapsuleSchema,
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  STUDY_RECORD_KIND_NAMES,
  StudyPlanSchema,
  ResearchPackageSchema,
  readStudyFileBytes,
  recordHash,
  semanticHash,
  studyRecordKind,
  studySelfHash,
  verifyStudySelfHash,
} from "../dist/study/index.js"

/**
 * The study parity fixtures, and the boundary with the legacy hash registry.
 *
 * These are files rather than objects built in memory, because the property
 * being pinned is that two independent implementations reading the same bytes
 * compute the same digest. `python/tests/test_study_hashing.py` reads exactly
 * these files and asserts exactly these hex strings; a drift in either
 * canonicalizer, projection or preimage header fails on the side that drifted.
 *
 * Every hash here moved when the rules did. `study-v1` keeps its name because
 * nothing has ever been published under it -- npm 404, PyPI 404, no releases, no
 * study surface in the live API -- so the rules behind the name changed rather
 * than the name in front of them. What must not have moved is anything in
 * `expected-hashes.json`: the legacy registry is a separate rule set over
 * separate records, and the last section here re-asserts its four load-bearing
 * digests next to the code that could have disturbed them.
 */

const fixture = (name) =>
  JSON.parse(fs.readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url), "utf8"))

const bytesOf = (name) => fs.readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url))

const pins = fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID]

// --- the single-record fixtures --------------------------------------------

test("each single-record fixture verifies against its own contents and its pin", () => {
  const records = [
    ["study_plan_revision", "study-plan-revision.json", StudyPlanSchema],
    ["study_capsule", "study-capsule.json", ExecutionCapsuleSchema],
    ["study_capsule_64_bit_integers", "study-capsule-64-bit-integers.json", ExecutionCapsuleSchema],
    ["study_capsule_hardware", "study-capsule-hardware.json", ExecutionCapsuleSchema],
    ["study_research_package_as_written", "study-research-package-as-written.json", ResearchPackageSchema],
  ]

  for (const [name, file, schema] of records) {
    const pin = pins[name]
    const record = fixture(file)

    // The record kind is not a label on the pin: it is a component of the
    // preimage header, so a digest taken under the wrong kind is a different
    // digest rather than the same one described differently.
    assert.ok(STUDY_RECORD_KIND_NAMES.includes(pin.record_kind), pin.record_kind)
    const entry = studyRecordKind(pin.record_kind)
    assert.equal(entry.self_hash_field, pin.self_hash_field)

    assert.equal(studySelfHash(pin.record_kind, record), pin.self_hash, `${name} drifted from its pin`)
    assert.equal(record[pin.self_hash_field], pin.self_hash, `${name} does not carry its own hash`)

    const verified = verifyStudySelfHash(pin.record_kind, record)
    assert.equal(verified.valid, true)
    assert.equal(verified.purpose, entry.self_hash_purpose)

    // The file parses as the record it claims to be, and parsing changes
    // nothing: the digest is over the file, and the two are the same value only
    // because no schema in this family materialises a field at parse time.
    assert.deepEqual(schema.parse(record), record)
  }
})

test("a fixture hashed under another record kind takes another digest", () => {
  const capsule = fixture("study-capsule.json")
  // Two kinds that both carry `reproducibility_hash`, so nothing but the header
  // separates them. Without the header a capsule and a package that projected to
  // the same body would share a digest namespace.
  assert.throws(
    () => studySelfHash("research_package", capsule),
    (error) => error.code === "UNDECLARED_FIELD",
  )
  assert.notEqual(
    recordHash("execution_capsule", capsule),
    semanticHash("execution_capsule", capsule),
    "two purposes over one record are two digests",
  )
})

// --- the containers ---------------------------------------------------------
//
// A file holding a list of records is not itself a record: no kind declares
// `nodes` and `edges` at its root, so there is no digest of the wrapper. What is
// pinned is every record inside it, which is where the content actually lives.

test("every node and edge in the pinned evidence graph verifies and matches its pin", () => {
  const graph = fixture("study-evidence-graph.json")
  const pin = pins.study_evidence_graph

  assert.deepEqual(
    graph.nodes.map((node) => studySelfHash("evidence_node", node)),
    pin.nodes,
  )
  assert.deepEqual(
    graph.edges.map((edge) => studySelfHash("evidence_edge", edge)),
    pin.edges,
  )

  for (const node of graph.nodes) {
    assert.equal(verifyStudySelfHash("evidence_node", node).valid, true)
    assert.deepEqual(EvidenceNodeSchema.parse(node), node)
  }
  const present = new Set(pin.nodes)
  for (const edge of graph.edges) {
    assert.equal(verifyStudySelfHash("evidence_edge", edge).valid, true)
    assert.deepEqual(EvidenceEdgeSchema.parse(edge), edge)
    assert.equal(present.has(edge.from_node_hash), true)
    assert.equal(present.has(edge.to_node_hash), true)
  }
})

// Float rendering is where two languages disagree without anyone noticing, so
// the cases are pinned as records rather than as bare numbers: each one sits in
// a `Quantity` envelope inside an evidence node, which is where a study's
// numbers actually live and where a digest actually reaches them.
test("the float boundary cases hash identically to their pins, one node per case", () => {
  const nodes = fixture("study-float-edge-cases.json").nodes
  const pin = pins.study_float_edge_cases

  assert.deepEqual(
    nodes.map((node) => studySelfHash("evidence_node", node)),
    pin.nodes,
  )

  const values = nodes.map((node) => node.quantity.value)
  assert.deepEqual(values, [3, 0.00005, 1e-7, -0, null])
  // `assert.deepEqual` above holds `-0` and `0` apart, so the line has already
  // said which one the file carries -- but only to a reader who knows that. The
  // literal in the file is `-0.0`, which `JSON.stringify` has no spelling for and
  // would have written as `0`; that the two reach one digest is what RFC 8785
  // §3.2.2.3 requires, so the literal has to survive in the file for the rule to
  // be pinned at all.
  assert.ok(Object.is(values[3], -0), "the fixture carries a negative zero")

  // RFC 8785 §3.2.2.3 renders a whole-number float without its fraction, keeps
  // 0.00005 positional, puts 1e-7 in scientific notation, and writes minus zero
  // as `0`. Python has no `Number::toString` and implements the algorithm; these
  // are the four places the two implementations could part company.
  const bodies = nodes.map((node) => JSON.stringify(node.quantity.value))
  assert.deepEqual(bodies, ["3", "0.00005", "1e-7", "0", "null"])

  // An explicit null is content and an absent key is not, so dropping one moves
  // the digest -- otherwise "we never asked" and "we asked and there is no
  // answer" would be one record.
  const unknown = nodes[4]
  const { retrieved_on: _dropped, ...withoutNull } = unknown
  assert.notEqual(studySelfHash("evidence_node", withoutNull), unknown.content_hash)
})

// The hash is over the parsed value, never over the source text. `3.0` and `3`
// are the same IEEE-754 double and the same JSON number, and Python's int/float
// distinction -- which has no counterpart here -- must not leak into a digest
// the two languages have to agree on.
test("textual variation that is not value variation does not move a digest", () => {
  const text = fs.readFileSync(
    new URL("../fixtures/reproducibility/study-float-edge-cases.json", import.meta.url),
    "utf8",
  )
  const rewritten = JSON.parse(text.replace('"value": 3,', '"value": 3.0,').replace('"value": -0.0,', '"value": 0,'))
  assert.deepEqual(
    rewritten.nodes.map((node) => studySelfHash("evidence_node", node)),
    pins.study_float_edge_cases.nodes,
  )
})

// --- what the digests answer, on real records -------------------------------

test("the four roles answer four questions about the pinned capsule", () => {
  const capsule = fixture("study-capsule.json")

  // Same science, later run: who ran it, on which job, which attempt and when
  // are receipt evidence, and the semantic digest does not read any of them.
  const rerun = {
    ...capsule,
    execution_receipt: { ...capsule.execution_receipt, attempt: 4, started_at: "2027-06-06T00:00:00.000Z" },
  }
  assert.equal(semanticHash("execution_capsule", rerun), semanticHash("execution_capsule", capsule))
  assert.notEqual(recordHash("execution_capsule", rerun), recordHash("execution_capsule", capsule))

  // Same file, different reading: a seed is digits, so two spellings of one
  // value cannot exist to take two digests -- and two different values cannot
  // collapse onto one double either.
  assert.equal(capsule.seed, "20260101")
  assert.notEqual(
    semanticHash("execution_capsule", { ...capsule, seed: "20260102" }),
    semanticHash("execution_capsule", capsule),
  )
})

test("the pinned hardware capsule carries the evidence only a hardware run can produce", () => {
  // A hardware result is not a simulated one with a different label. The fields
  // below are what a reader has instead of a re-run they cannot perform: which
  // adapter spoke to the device, which calibration it ran under, which approval
  // it was submitted on, the provider's own result, and what it cost against
  // what was allowed.
  const capsule = fixture("study-capsule-hardware.json")
  assert.equal(capsule.execution_class, "HARDWARE")
  assert.equal(capsule.execution.kind, "HARDWARE")
  assert.equal(capsule.execution.cost_confirmation.source, "PROVIDER_REPORTED")
  assert.ok(
    capsule.execution.cost_confirmation.credits_charged <=
      capsule.execution.cost_confirmation.authorized_maximum,
  )
  // The bytes are the provider's, and a third party cannot fetch them. Saying so
  // is what stops the capsule from implying a reproduction only the account
  // holder could perform.
  assert.equal(capsule.outputs[0].resolution.kind, "PROVIDER_HELD")
  assert.equal(capsule.outputs[0].completeness, "PARTIAL")
  assert.equal(capsule.attestation_level, "hash_only")
  // And no credential reached the file, at any depth.
  assert.equal(/token|secret|api[_-]?key|password/i.test(bytesOf("study-capsule-hardware.json").toString("utf8")), false)
})

test("a record that does not name its schema version is refused, not defaulted", () => {
  const capsule = fixture("study-capsule.json")
  const { schema_version: _omitted, ...unversioned } = capsule
  assert.throws(
    () => studySelfHash("execution_capsule", unversioned),
    (error) => error.code === "MISSING_HEADER_COMPONENT",
  )
  assert.throws(
    () => studySelfHash("execution_capsule", { ...capsule, [STUDY_HASH_RULES_KEY]: "study-v2" }),
    (error) => error.code === "UNKNOWN_HASH_RULES_ID",
  )
})

test("every fixture is read from its raw bytes without a refusal", () => {
  // The reader answers questions a parse has already thrown away: a byte order
  // mark, invalid UTF-8, a duplicate property name, an integer literal outside
  // ±2^53. Running it over the committed fixtures is what keeps them files a
  // recipient could actually verify rather than objects that happen to hash.
  for (const name of [
    "study-plan-revision.json",
    "study-capsule.json",
    "study-capsule-64-bit-integers.json",
    "study-capsule-hardware.json",
    "study-research-package-as-written.json",
    "study-evidence-graph.json",
    "study-float-edge-cases.json",
  ]) {
    const reading = readStudyFileBytes(new Uint8Array(bytesOf(name)))
    assert.deepEqual(reading.value, fixture(name), `${name} reads differently from raw bytes`)
  }
})

// --- legacy isolation --------------------------------------------------------
//
// The two rule sets are genuinely different, so the same payload hashes
// differently under each. If these ever agreed, the family would be hashing
// under the legacy rules while claiming its own.

test("the legacy canonicalizer and the study rules do not agree about one record", () => {
  const capsule = fixture("study-capsule.json")
  for (const version of [1, 2]) {
    assert.notEqual(calculateReproducibilityHash(capsule, version), studySelfHash("execution_capsule", capsule))
  }
})

test("a legacy record is not a study record, and this family will not invent a kind for it", () => {
  const qecResult = fixture("qec-result-before-hash.json")
  assert.throws(
    () => studySelfHash("qec_benchmark_result", qecResult),
    (error) => error.code === "UNKNOWN_RECORD_KIND",
  )
})

// The load-bearing negative: the frozen corpus is untouched. These numbers are
// asserted in `tests/sdk.test.mjs` and `python/tests/test_hashing.py` already;
// re-asserting them here means a change made for the study family fails in this
// file, next to the code that caused it, rather than only in a suite nobody was
// editing.
test("the legacy expected hashes are byte-identical to what they always were", () => {
  const expectedHashes = fixture("expected-hashes.json")
  const qecResult = fixture("qec-result-before-hash.json")
  const qecManifest = fixture("qec-manifest.json")

  assert.equal(
    calculateReproducibilityHash(qecResult, 1),
    "2b1be50bd10215449956fc37555cecccf1987eebed374449c2643793d7e3d6a5",
  )
  assert.equal(
    calculateReproducibilityHash(qecResult, 2),
    "e15000bd534e391f917bfc8715829938e0017f5953d918ebef2d88a8b1adad8a",
  )
  assert.equal(calculateReproducibilityHash(qecResult, 1), expectedHashes.v1.qec_result)
  assert.equal(calculateReproducibilityHash(qecResult, 2), expectedHashes.v2.qec_result)
  assert.equal(calculateReproducibilityHash(qecManifest, 1), expectedHashes.v1.qec_manifest)
  assert.equal(calculateReproducibilityHash(qecManifest, 2), expectedHashes.v2.qec_manifest)
})

// "Inherited rather than copied" was the old exclusion set's claim on the legacy
// key lists, and that inheritance is gone with it -- no study digest reads a key
// name any more. The lists still have to be unwritable, because the legacy rules
// that do read them are still in service.
test("the legacy key lists are frozen against a consumer that would edit them", () => {
  for (const list of [IDENTITY_KEYS, TIMING_KEYS]) {
    assert.equal(Object.isFrozen(list), true)
    assert.throws(() => list.push("not-an-exclusion"), TypeError)
  }
})
