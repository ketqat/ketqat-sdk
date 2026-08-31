import assert from "node:assert/strict"
import fs from "node:fs"
import { calculateReproducibilityHash } from "../dist/index.js"
import {
  STUDY_EXCLUDED_KEYS,
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  calculateStudyHash,
  canonicalStudyJson,
  studyRulesIdOf,
  verifyStudyRecordHash,
} from "../dist/study/index.js"

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url), "utf8"))

const studyHashes = fixture("study-expected-hashes.json")
const floatEdgeCases = fixture("study-float-edge-cases.json")

// The study fixtures, pinned against hashes the TypeScript implementation
// produced. The Python suite reproduces the same numbers from the same files, so
// a drift in either canonicalizer shows up as a failing pin rather than as two
// languages quietly disagreeing about what a record says.
const studyFixtures = {
  study_float_edge_cases: floatEdgeCases,
  study_plan_revision: fixture("study-plan-revision.json"),
  study_capsule: fixture("study-capsule.json"),
}
for (const [key, payload] of Object.entries(studyFixtures)) {
  assert.equal(calculateStudyHash(payload), studyHashes[STUDY_HASH_RULES_ID][key], `study hash drifted for ${key}`)
}

// The evidence graph is a container of records rather than a record itself: each
// node and edge inside it names the rules it was hashed under, the file wrapped
// around them does not. So this is the one pin that names the rules from the
// outside -- there is no record here to have named them, and inventing a marker
// on the wrapper would put a field in the corpus that no contract declares.
assert.equal(
  calculateStudyHash(fixture("study-evidence-graph.json"), STUDY_HASH_RULES_ID),
  studyHashes[STUDY_HASH_RULES_ID].study_evidence_graph,
  "study hash drifted for study_evidence_graph",
)

// Each record the graph carries also verifies against the hash written into it,
// which is what makes the container's own digest a pin on the parts as well as
// on the whole.
const pinnedGraph = fixture("study-evidence-graph.json")
for (const record of [...pinnedGraph.nodes, ...pinnedGraph.edges]) {
  assert.equal(calculateStudyHash(record), record.content_hash, `${record.kind} node or edge does not match its own hash`)
}

// Float rendering is where two languages disagree without anyone noticing: a
// whole-number float, a value inside the window where Python switches to
// scientific notation and JavaScript does not, a value below both thresholds,
// and negative zero. All four are inside this fixture, nested in the Quantity
// envelopes the family wraps every number in.
const canonical = canonicalStudyJson(floatEdgeCases)
assert.equal(canonical.includes('"value":3}'), true, "a whole-number float renders without its fraction")
assert.equal(canonical.includes('"value":0.00005}'), true, "0.00005 stays in positional notation")
assert.equal(canonical.includes('"value":1e-7}'), true, "1e-7 renders in scientific notation")
assert.equal(canonical.includes('"value":0}'), true, "negative zero renders as zero")
assert.equal(canonical.includes('"value":null}'), true, "an unknown value stays null and is not dropped")

// The hash is over the parsed value, never the source text. `3.0` and `3` are
// the same IEEE-754 double and the same JSON number, and Python's int/float
// distinction -- which has no counterpart here -- must not leak into a digest
// the two languages have to agree on.
const textualVariation = JSON.parse(
  fs
    .readFileSync(new URL("../fixtures/reproducibility/study-float-edge-cases.json", import.meta.url), "utf8")
    .replace('"value": 3.0', '"value": 3')
    .replace('"value": -0.0', '"value": -0'),
)
assert.equal(calculateStudyHash(textualVariation), studyHashes[STUDY_HASH_RULES_ID].study_float_edge_cases)

// An explicit null is content; an absent key is not. Dropping a `null` therefore
// has to move the hash -- otherwise "we never asked" and "we asked and there is
// no answer" would be the same record.
const withoutExplicitNull = {
  ...floatEdgeCases,
  measurements: floatEdgeCases.measurements.map(({ note, ...rest }) => rest),
}
assert.notEqual(calculateStudyHash(withoutExplicitNull), studyHashes[STUDY_HASH_RULES_ID].study_float_edge_cases)

// The rules id is required, and a record without one is refused rather than
// hashed under whatever this build happens to consider current. Absent key,
// present-but-undefined, and empty string are the same failure.
for (const broken of [
  Object.fromEntries(Object.entries(floatEdgeCases).filter(([key]) => key !== STUDY_HASH_RULES_KEY)),
  { ...floatEdgeCases, [STUDY_HASH_RULES_KEY]: undefined },
  { ...floatEdgeCases, [STUDY_HASH_RULES_KEY]: "" },
  { ...floatEdgeCases, [STUDY_HASH_RULES_KEY]: 1 },
]) {
  assert.throws(() => calculateStudyHash(broken), /refused, not defaulted/)
  assert.throws(() => canonicalStudyJson(broken), /refused, not defaulted/)
  assert.throws(() => verifyStudyRecordHash(broken), /refused, not defaulted/)
  assert.throws(() => studyRulesIdOf(broken), /refused, not defaulted/)
}

// ADR 0006's "no marker means version 1" is disabled here. A study record
// carrying the legacy marker and no rules id earns nothing from it: the legacy
// field is inert on this family, and inheriting an inference designed for
// records that predate versioning would hash a malformed record instead of
// refusing it.
const legacyMarkerOnly = {
  ...Object.fromEntries(Object.entries(floatEdgeCases).filter(([key]) => key !== STUDY_HASH_RULES_KEY)),
  reproducibility_hash_version: 2,
}
assert.throws(() => calculateStudyHash(legacyMarkerOnly), /refused, not defaulted/)

// The reverse of the same trap: `hashVersionOf` reports version 1 for any marker
// that is not a number, so a rules id written into the legacy field would have
// verified silently under version 1 rules. It is a different field precisely so
// that cannot happen, and the legacy verifier's answer for such a record is not
// this family's answer.
const ruleIdInLegacyField = { ...floatEdgeCases, reproducibility_hash_version: STUDY_HASH_RULES_ID }
assert.equal(calculateStudyHash(ruleIdInLegacyField), studyHashes[STUDY_HASH_RULES_ID].study_float_edge_cases)

// An unknown id is refused, never treated as the current one. The legacy
// registry does the same for version 99.
assert.throws(() => calculateStudyHash({ ...floatEdgeCases, [STUDY_HASH_RULES_KEY]: "study-v2" }), /Unknown study hash rules id/)
assert.throws(() => calculateStudyHash(floatEdgeCases, "study-v99"), /Unknown study hash rules id/)

// A study-shaped record with one of everything the exclusion set has an opinion
// about, so the volatile-versus-scientific split is exercised on decisions
// rather than on a fixture's prose.
const studyRecord = {
  schema_version: "1.0",
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_type: "FTQC_FEASIBILITY",
  title: "Is a fault-tolerant factoring run affordable in 2031?",
  is_demo: true,
  max_credits: 2500,
  attestation_level: "hash_only",
  claim: { subject: "shor-2048", metric: "total_physical_qubits", comparator: "AT_MOST", value: 4200000 },
  id: "volatile-study-id",
  slug: "volatile-study-slug",
  status: "DRAFT",
  latest_specification: { revision_hash: "a".repeat(64), revision: 1 },
  latest_plan: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  runtime_seconds: 41.5,
  content_hash: "b".repeat(64),
}
const studyRecordHash = calculateStudyHash(studyRecord)

// Nothing on this list describes the study. An id, a slug, a timestamp, a
// duration, a denormalized status and the pointers at the newest revisions all
// move on their own schedule, and a hash that moved with them would mean the
// same study stopped matching itself between two reads of the same database row.
for (const volatile of [
  { id: "changed" },
  { slug: "changed" },
  { created_at: "2027-06-06T00:00:00.000Z" },
  { updated_at: "2027-06-06T00:00:00.000Z" },
  { status: "CONCLUDED" },
  { latest_specification: { revision_hash: "c".repeat(64), revision: 9 } },
  { latest_plan: { revision_hash: "d".repeat(64), revision: 4 } },
  { runtime_seconds: 999.5 },
  { content_hash: "e".repeat(64) },
  { reproducibility_hash: "f".repeat(64) },
  { reproducibility_hash_version: 1 },
]) {
  assert.equal(
    calculateStudyHash({ ...studyRecord, ...volatile }),
    studyRecordHash,
    `${Object.keys(volatile)[0]} must not be able to move a study hash`,
  )
}

// Everything a decision rests on does move it. `max_credits` is a limit the user
// set, `attestation_level` is what the record claims to prove, and a claim's
// value is the number a reader will quote -- an edit to any of them is a
// different record, and must not be able to keep the old hash.
for (const scientific of [
  { study_type: "QEC_LOGICAL_BENCHMARK" },
  { title: "Is it affordable in 2029?" },
  { is_demo: false },
  { max_credits: 2501 },
  { attestation_level: "signed" },
  { claim: { ...studyRecord.claim, value: 4200001 } },
]) {
  assert.notEqual(
    calculateStudyHash({ ...studyRecord, ...scientific }),
    studyRecordHash,
    `${Object.keys(scientific)[0]} must move a study hash`,
  )
}

// Key order is a property of how a record was serialized, not of what it says.
const moved = ["content_hash", "claim", "title"]
const reordered = {
  content_hash: studyRecord.content_hash,
  claim: {
    value: studyRecord.claim.value,
    comparator: studyRecord.claim.comparator,
    metric: studyRecord.claim.metric,
    subject: studyRecord.claim.subject,
  },
  title: studyRecord.title,
  ...Object.fromEntries(Object.entries(studyRecord).filter(([key]) => !moved.includes(key))),
}
assert.equal(calculateStudyHash(reordered), studyRecordHash)

// A record verifies against whichever self-hash field it carries. Both are
// excluded from the digest, so which one it uses cannot change the answer.
const stamped = { ...studyRecord, content_hash: studyRecordHash }
assert.equal(verifyStudyRecordHash(stamped).valid, true)
assert.equal(verifyStudyRecordHash(stamped).rules_id, STUDY_HASH_RULES_ID)
assert.equal(verifyStudyRecordHash(stamped).expected, studyRecordHash)
assert.equal(verifyStudyRecordHash({ ...stamped, max_credits: 5000 }).valid, false)
assert.equal(verifyStudyRecordHash({ ...stamped, content_hash: undefined }).actual, null)

const capsuleShaped = { ...studyRecord, content_hash: undefined, reproducibility_hash: studyRecordHash }
assert.equal(verifyStudyRecordHash(capsuleShaped).valid, true, "a capsule names its self-hash reproducibility_hash")

// The exclusion set is inherited from `src/reproducibility` rather than copied,
// and this is the assertion that says so: the identity and timing keys every
// published hash was computed under are all present, alongside the four the
// family adds.
for (const key of [
  "id",
  "slug",
  "created_at",
  "updated_at",
  "started_at",
  "finished_at",
  "submitted_at",
  "ui_metadata",
  "owner_username",
  "visibility",
  "reproducibility_hash",
  "reproducibility_hash_version",
  "runtime_seconds",
  "decoder_latency_ms",
  "hash_rules_id",
  "content_hash",
  "status",
  "latest_specification",
  "latest_plan",
]) {
  assert.equal(STUDY_EXCLUDED_KEYS.has(key), true, `${key} must be excluded from study-v1`)
}

// --- Legacy isolation. -------------------------------------------------------
//
// The two rule sets are genuinely different, so the same payload hashes
// differently under each. If these ever agreed, the family would be hashing
// under the legacy rules while claiming its own.
assert.notEqual(calculateReproducibilityHash(floatEdgeCases, 2), calculateStudyHash(floatEdgeCases))
assert.notEqual(calculateReproducibilityHash(floatEdgeCases, 1), calculateStudyHash(floatEdgeCases))

// And the load-bearing negative: the frozen corpus is untouched. These four
// numbers are asserted in `tests/sdk.test.mjs` and `python/tests/test_hashing.py`
// already; re-asserting them here means a change to the shared canonicalizer
// made for this family fails in this file, next to the code that caused it,
// rather than only in a suite nobody was editing.
const expectedHashes = fixture("expected-hashes.json")
const qecResult = fixture("qec-result-before-hash.json")
const qecManifest = fixture("qec-manifest.json")
assert.equal(calculateReproducibilityHash(qecResult, 1), "2b1be50bd10215449956fc37555cecccf1987eebed374449c2643793d7e3d6a5")
assert.equal(calculateReproducibilityHash(qecResult, 2), "e15000bd534e391f917bfc8715829938e0017f5953d918ebef2d88a8b1adad8a")
assert.equal(calculateReproducibilityHash(qecResult, 1), expectedHashes.v1.qec_result)
assert.equal(calculateReproducibilityHash(qecResult, 2), expectedHashes.v2.qec_result)
assert.equal(calculateReproducibilityHash(qecManifest, 1), expectedHashes.v1.qec_manifest)
assert.equal(calculateReproducibilityHash(qecManifest, 2), expectedHashes.v2.qec_manifest)

// A legacy record has no rules id, and this family will not invent one for it.
assert.throws(() => calculateStudyHash(qecResult), /refused, not defaulted/)

console.log("study hashing checks passed")
