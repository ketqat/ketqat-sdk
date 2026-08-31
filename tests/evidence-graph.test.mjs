import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import {
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  STUDY_SCHEMA_VERSION,
  calculateStudyHash,
  verifyStudyRecordHash,
} from "../dist/study/index.js"
import {
  ClaimStatementSchema,
  EvidenceEdgeSchema,
  EvidenceNodeSchema,
  contradictionSet,
  resolveClaimEvidence,
  supersessionChain,
  verifyEvidenceGraph,
} from "../dist/study/evidence.js"
import {
  CancellationSchema,
  ExecutionCapsuleSchema,
  buildExecutionCapsule,
  verifyExecutionCapsule,
} from "../dist/study/capsule.js"
import { AttestationLevelSchema } from "../dist/study/common.js"
import { verifyResearchPackage } from "../dist/study/research-package.js"

/**
 * Tests for the Evidence Graph and the execution capsule (ketqat-sdk#259, WP3).
 *
 * Two properties are on trial here. The first is that a claim in this family
 * cannot exist without something behind it: the payload pairing, the ban on
 * unknown claim values and the traversal helpers are all the same rule seen from
 * different angles, and every one of them, violated, produces a sentence in a
 * report that no reader can walk back to a number. The second is that a capsule
 * says what it can prove and no more -- one attestation level, hashed, so the
 * strength of the evidence cannot be edited after the run.
 */

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url), "utf8"))

const STUDY_REF = "da5370a68b65fae82f578c06f313afac786e0b5e9d3caf543b1e37319d9720d9"
const OTHER_HASH = "b".repeat(64)
const MODEL = "ketqat-resource-intelligence"

const knownQuantity = (value = 4200000) => ({
  value,
  unit: "physical qubits",
  bound: "UPPER_BOUND",
  evidence: "MODELLED",
  source: "Resource estimate under the base scenario.",
  model: MODEL,
  model_version: "0.1.0",
  assumptions: [],
  schema_version: "0.1",
  limitations: [],
})

const unknownRuntime = () => ({
  value: null,
  unit: "seconds",
  bound: "POINT",
  evidence: "UNKNOWN",
  source: "Not computed.",
  model: MODEL,
  model_version: "0.1.0",
  assumptions: [],
  schema_version: "0.1",
  limitations: ["No measured classical runtime was supplied."],
})

const claimStatement = (changes = {}) => ({
  subject: "shor-2048",
  metric: "total_physical_qubits",
  comparator: "AT_MOST",
  value: knownQuantity(),
  ...changes,
})

// The four payload blocks, and which node kind each one belongs to. Written out
// here rather than imported so the test asserts the pairing the module claims
// instead of asserting the module against itself.
const PAYLOADS = {
  claim: () => claimStatement(),
  quantity: () => unknownRuntime(),
  reference: () => ({ record_kind: "benchmark_result", hash: OTHER_HASH, record_slug: null }),
  // `authors` is required rather than defaulted: `StudyCitationSchema` drops the shared
  // `.default([])`, because a container the parser materialises is a container the file does
  // not contain, and the build path and the verify path then address two different nodes.
  citation: () => ({
    title: "Surface codes: towards practical large-scale quantum computation",
    authors: [],
    year: 2012,
  }),
}
const KIND_PAYLOAD = {
  claim: "claim",
  quantity: "quantity",
  input: "reference",
  model_ref: "reference",
  result: "reference",
  source: "citation",
  dataset_ref: "reference",
  snapshot_ref: "reference",
}
const EDGE_KINDS = [
  "derived_from",
  "used_model",
  "used_input",
  "supports",
  "contradicts",
  "supersedes",
  "reproduces",
  "reviewed_by",
]

const nodeBody = (changes = {}) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_ref: STUDY_REF,
  kind: "claim",
  label: "a node",
  claim: null,
  quantity: null,
  reference: null,
  citation: null,
  limitations: [],
  source_published_on: null,
  retrieved_on: null,
  ...changes,
})

const edgeBody = (changes = {}) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_ref: STUDY_REF,
  kind: "supports",
  from_node_hash: "a".repeat(64),
  to_node_hash: OTHER_HASH,
  asserted_by: "ketqat-resource-intelligence",
  rationale: "The bound is read from the estimate rather than restated.",
  ...changes,
})

// A node's identity is the hash of its content, so a test that wants a usable
// node computes the hash rather than inventing one. `content_hash` is excluded
// from the digest, which is why stamping it afterwards is not circular.
const stampNode = (body) => EvidenceNodeSchema.parse({ ...body, content_hash: calculateStudyHash(body) })
const stampEdge = (body) => EvidenceEdgeSchema.parse({ ...body, content_hash: calculateStudyHash(body) })

const nodeOfKind = (kind, changes = {}) =>
  stampNode(nodeBody({ kind, [KIND_PAYLOAD[kind]]: PAYLOADS[KIND_PAYLOAD[kind]](), ...changes }))

// ------------------------------------------------------- machine-readable claims

test("a claim node without a claim block is refused", () => {
  assert.throws(
    () => EvidenceNodeSchema.parse({ ...nodeBody({ kind: "claim" }), content_hash: "0".repeat(64) }),
    /must carry its claim block/,
  )
})

test("a claim node carrying a quantity block is refused", () => {
  assert.throws(
    () =>
      EvidenceNodeSchema.parse({
        ...nodeBody({ kind: "claim", claim: claimStatement(), quantity: knownQuantity() }),
        content_hash: "0".repeat(64),
      }),
    /must leave quantity null/,
  )
})

test("a claim whose quantity is unknown is refused at parse", () => {
  assert.throws(
    () => ClaimStatementSchema.parse(claimStatement({ value: unknownRuntime() })),
    /CLAIM_VALUE_UNKNOWN/,
  )
  assert.throws(
    () =>
      EvidenceNodeSchema.parse({
        ...nodeBody({ kind: "claim", claim: claimStatement({ value: unknownRuntime() }) }),
        content_hash: "0".repeat(64),
      }),
    /CLAIM_VALUE_UNKNOWN/,
  )
})

test("an unknown value is representable in a quantity node, which is where it belongs", () => {
  const node = nodeOfKind("quantity")
  assert.equal(node.quantity.value, null)
  assert.equal(node.quantity.evidence, "UNKNOWN")
})

// ------------------------------------------------------------ kind/payload pairing

test("every node kind carries exactly the payload its kind means", () => {
  for (const [kind, required] of Object.entries(KIND_PAYLOAD)) {
    assert.equal(nodeOfKind(kind).kind, kind, `${kind} must parse with its own payload`)

    assert.throws(
      () => EvidenceNodeSchema.parse({ ...nodeBody({ kind }), content_hash: "0".repeat(64) }),
      new RegExp(`must carry its ${required} block`),
      `a ${kind} node with no payload must be refused`,
    )

    for (const wrong of Object.keys(PAYLOADS)) {
      if (wrong === required) continue
      assert.throws(
        () =>
          EvidenceNodeSchema.parse({
            ...nodeBody({ kind, [required]: PAYLOADS[required](), [wrong]: PAYLOADS[wrong]() }),
            content_hash: "0".repeat(64),
          }),
        new RegExp(`must leave ${wrong} null`),
        `a ${kind} node must not also carry a ${wrong} block`,
      )
    }
  }
})

test("a reference must name what it points at, by hash or by slug", () => {
  assert.throws(
    () =>
      EvidenceNodeSchema.parse({
        ...nodeBody({ kind: "input", reference: { record_kind: "artifact", hash: null, record_slug: null } }),
        content_hash: "0".repeat(64),
      }),
    /by content hash or by registry slug/,
  )
  assert.equal(
    nodeOfKind("input", { reference: { record_kind: "artifact", hash: null, record_slug: "surface-code-decoder" } }).reference
      .record_slug,
    "surface-code-decoder",
  )
  assert.equal(nodeOfKind("input").reference.hash, OTHER_HASH)
})

// ------------------------------------------------------------------- edges

test("an edge must join two different nodes", () => {
  assert.throws(
    () =>
      EvidenceEdgeSchema.parse({
        ...edgeBody({ from_node_hash: OTHER_HASH, to_node_hash: OTHER_HASH }),
        content_hash: "0".repeat(64),
      }),
    /must join two different nodes/,
  )
})

test("every edge kind parses", () => {
  for (const kind of EDGE_KINDS) {
    assert.equal(stampEdge(edgeBody({ kind })).kind, kind)
  }
})

test("an edge must say who asserted it and why", () => {
  for (const missing of [{ asserted_by: "" }, { rationale: "" }]) {
    assert.throws(
      () => EvidenceEdgeSchema.parse({ ...edgeBody(missing), content_hash: "0".repeat(64) }),
      /too_small|at least 1/,
      `an edge without ${Object.keys(missing)[0]} must be refused`,
    )
  }
})

// --------------------------------------------------------------- traversal

const claimNode = nodeOfKind("claim", { label: "Shor-2048 fits within 4.2 million physical qubits" })
const supportingResult = nodeOfKind("result", { label: "base scenario estimate" })
const withdrawnObjection = nodeOfKind("result", { label: "first objection, later replaced" })
const liveObjection = nodeOfKind("result", { label: "objection that still stands" })

const supportsEdge = stampEdge(
  edgeBody({ kind: "supports", from_node_hash: supportingResult.content_hash, to_node_hash: claimNode.content_hash }),
)
const withdrawnEdge = stampEdge(
  edgeBody({
    kind: "contradicts",
    from_node_hash: withdrawnObjection.content_hash,
    to_node_hash: claimNode.content_hash,
    rationale: "The first reading of the baseline disagreed with the claimed bound.",
  }),
)
const supersedesEdge = stampEdge(
  edgeBody({
    kind: "supersedes",
    from_node_hash: liveObjection.content_hash,
    to_node_hash: withdrawnObjection.content_hash,
    rationale: "The objection was re-run against the corrected baseline.",
  }),
)
const liveEdge = stampEdge(
  edgeBody({
    kind: "contradicts",
    from_node_hash: liveObjection.content_hash,
    to_node_hash: claimNode.content_hash,
    rationale: "The corrected run exceeds the claimed bound.",
  }),
)

const graphNodes = [claimNode, supportingResult, withdrawnObjection, liveObjection]
const graphEdges = [supportsEdge, withdrawnEdge, supersedesEdge, liveEdge]

test("supersessionChain follows supersedes edges from the newest node backwards", () => {
  const chain = supersessionChain(graphNodes, graphEdges, liveObjection.content_hash)
  assert.deepEqual(
    chain.map((node) => node.label),
    ["objection that still stands", "first objection, later replaced"],
  )
  assert.deepEqual(supersessionChain(graphNodes, graphEdges, "c".repeat(64)), [])
})

test("contradictionSet reports the objections that still stand", () => {
  const contradictions = contradictionSet(graphNodes, graphEdges, claimNode.content_hash)
  assert.deepEqual(
    contradictions.map((node) => node.label),
    ["objection that still stands"],
  )
})

test("contradictions are read in both directions", () => {
  const reversed = stampEdge(
    edgeBody({
      kind: "contradicts",
      from_node_hash: claimNode.content_hash,
      to_node_hash: supportingResult.content_hash,
      rationale: "Written the other way round by a different reviewer.",
    }),
  )
  const found = contradictionSet(graphNodes, [reversed], claimNode.content_hash)
  assert.deepEqual(
    found.map((node) => node.label),
    ["base scenario estimate"],
  )
})

test("resolveClaimEvidence partitions support from contradiction", () => {
  const resolved = resolveClaimEvidence(graphNodes, graphEdges, claimNode.content_hash)
  assert.equal(resolved.claim.label, claimNode.label)
  assert.deepEqual(
    resolved.supporting.map((node) => node.label),
    ["base scenario estimate"],
  )
  assert.deepEqual(
    resolved.contradicting.map((node) => node.label),
    ["objection that still stands"],
  )
  assert.deepEqual(resolved.refusals, [])
})

test("a claim with nothing behind it is refused, not annotated", () => {
  const resolved = resolveClaimEvidence([claimNode], [], claimNode.content_hash)
  assert.deepEqual(
    resolved.refusals.map((refusal) => refusal.code),
    ["CLAIM_WITHOUT_EVIDENCE_NODE"],
  )
})

test("a supports edge naming a node the graph does not carry is refused", () => {
  const dangling = stampEdge(
    edgeBody({ kind: "supports", from_node_hash: "e".repeat(64), to_node_hash: claimNode.content_hash }),
  )
  const resolved = resolveClaimEvidence([claimNode], [dangling], claimNode.content_hash)
  assert.deepEqual(
    resolved.refusals.map((refusal) => refusal.code),
    ["EVIDENCE_EDGE_ENDPOINT_UNRESOLVED", "CLAIM_WITHOUT_EVIDENCE_NODE"],
  )
  assert.deepEqual(
    resolveClaimEvidence(graphNodes, graphEdges, "f".repeat(64)).refusals.map((refusal) => refusal.code),
    ["EVIDENCE_NODE_UNRESOLVED"],
  )
})

// -------------------------------------------------------- graph verification

test("a whole graph verifies by recomputing every identity", () => {
  const verification = verifyEvidenceGraph(graphNodes, graphEdges)
  assert.equal(verification.valid, true, verification.problems.join(" "))
  assert.equal(verification.hashes_match, true)
  assert.equal(verification.edges_resolve, true)
})

test("a node edited after it was written fails on its own hash", () => {
  const tampered = { ...claimNode, claim: claimStatement({ value: knownQuantity(1000) }) }
  const verification = verifyEvidenceGraph([tampered, supportingResult], [supportsEdge])
  assert.equal(verification.hashes_match, false)
  assert.equal(verification.valid, false)
})

test("a node edited and re-hashed fails structurally, because identity is the hash", () => {
  const rewritten = stampNode(nodeBody({ ...claimNode, claim: claimStatement({ value: knownQuantity(1000) }) }))
  const verification = verifyEvidenceGraph([rewritten, supportingResult], [supportsEdge])
  assert.equal(verification.hashes_match, true, "the fabrication is internally consistent")
  assert.equal(verification.edges_resolve, false, "and the edge that named the old node now points at nothing")
  assert.deepEqual(
    verification.refusals.map((refusal) => refusal.code),
    ["EVIDENCE_EDGE_ENDPOINT_UNRESOLVED"],
  )
})

// ------------------------------------------------------------- the fixture

test("the pinned evidence graph verifies as written", () => {
  const graph = fixture("study-evidence-graph.json")
  const nodes = graph.nodes.map((node) => EvidenceNodeSchema.parse(node))
  const edges = graph.edges.map((edge) => EvidenceEdgeSchema.parse(edge))
  const verification = verifyEvidenceGraph(nodes, edges)
  assert.equal(verification.valid, true, verification.problems.join(" "))

  // The UNKNOWN pin: a null value survives parsing and canonicalization with its
  // evidence class intact, and its node hash is fixed by the file itself.
  const unknown = nodes.find((node) => node.kind === "quantity")
  assert.equal(unknown.quantity.value, null)
  assert.equal(unknown.quantity.evidence, "UNKNOWN")
  assert.equal(calculateStudyHash(unknown), unknown.content_hash)

  const claim = nodes.find((node) => node.kind === "claim")
  const resolved = resolveClaimEvidence(nodes, edges, claim.content_hash)
  assert.deepEqual(resolved.refusals, [])
  assert.deepEqual(
    resolved.supporting.map((node) => node.kind),
    ["result"],
  )
})

// ---------------------------------------------------------- execution capsule

const capsuleInput = {
  studyRef: STUDY_REF,
  taskRef: "1".repeat(64),
  manifestHash: "2".repeat(64),
  engine: { name: "ketqat-engine", version: "0.3.0" },
  adapter: { name: "stim-pymatching", version: "1.14.0" },
  sourceHash: "3".repeat(64),
  imageDigest: `sha256:${"4".repeat(64)}`,
  seed: 20260101,
  environment: {
    operating_system: "Linux",
    packages: [{ name: "stim", version: "1.14.0" }],
    hardware: [],
  },
  resourceLimits: { max_runtime: 3600, max_memory_bytes: 8589934592, max_credits: 250 },
  inputHashes: ["5".repeat(64)],
  outputHashes: ["6".repeat(64)],
  logsRef: "7".repeat(64),
  executionClass: "SIMULATION",
}

test("a built capsule verifies against its own contents", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const verification = verifyExecutionCapsule(capsule)
  assert.equal(verification.valid, true, verification.problems.join(" "))
  assert.equal(verification.hash_matches, true)
  assert.equal(verification.rules_id, STUDY_HASH_RULES_ID)
  assert.equal(verification.expected_hash, capsule.reproducibility_hash)
  assert.equal(capsule.attestation_level, "hash_only")
  assert.equal(capsule.schema_version, STUDY_SCHEMA_VERSION)
})

test("a capsule claims one attestation level, and it is hashed", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  // Deliberately a nonsense string. ADR 0014 reserves no name and pre-names no
  // future level -- writing "signed" here would put the word this family
  // declines to promise into the test suite as though it were a candidate.
  const other = "level-this-family-does-not-define"

  const refused = ExecutionCapsuleSchema.safeParse({ ...capsule, attestation_level: other })
  assert.equal(refused.success, false)
  // The issue's own code and path, not Zod's English: "Invalid enum value" is
  // wording internal to a dependency, and matching it made this test a hostage
  // to somebody else's release notes.
  assert.ok(
    refused.error.issues.some(
      (issue) => issue.path.join(".") === "attestation_level" && issue.code === "invalid_enum_value",
    ),
  )
  assert.deepEqual(AttestationLevelSchema.options, ["hash_only"])

  assert.notEqual(
    calculateStudyHash({ ...capsule, attestation_level: other }),
    capsule.reproducibility_hash,
    "the level a capsule claims cannot be edited without breaking its hash",
  )
})

test("a cancelled run must say why, and an uncancelled one must not", () => {
  assert.throws(() => CancellationSchema.parse({ cancelled: true, reason: null }), /must record why it was cancelled/)
  assert.throws(
    () => CancellationSchema.parse({ cancelled: false, reason: "ran out of credits" }),
    /has no cancellation reason/,
  )
  const cancelled = buildExecutionCapsule({
    ...capsuleInput,
    cancellation: { cancelled: true, reason: "The credit maximum the user set was reached." },
  })
  assert.equal(verifyExecutionCapsule(cancelled).valid, true)
})

test("an image digest is recorded in the form a registry accepts", () => {
  assert.throws(
    () => buildExecutionCapsule({ ...capsuleInput, imageDigest: "4".repeat(64) }),
    /image_digest/,
    "a bare hex digest is not a digest anyone can pull",
  )
  assert.equal(buildExecutionCapsule({ ...capsuleInput, imageDigest: null }).image_digest, null)
})

test("zero is a seed, and an unseeded run says null", () => {
  assert.equal(buildExecutionCapsule({ ...capsuleInput, seed: 0 }).seed, 0)
  assert.equal(buildExecutionCapsule({ ...capsuleInput, seed: null }).seed, null)
  assert.throws(() => buildExecutionCapsule({ ...capsuleInput, seed: -1 }), /seed/)
})

test("a tampered seed is caught, with both hashes named", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const tampered = { ...capsule, seed: 7 }
  const verification = verifyExecutionCapsule(tampered)
  assert.equal(verification.valid, false)
  assert.equal(verification.hash_matches, false)
  assert.equal(verification.actual_hash, capsule.reproducibility_hash)
  assert.equal(verification.expected_hash, calculateStudyHash(tampered))
  assert.notEqual(verification.expected_hash, verification.actual_hash)
  assert.equal(verification.problems.length, 1)
})

test("when a run happened is not what a run says", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const rerun = buildExecutionCapsule({
    ...capsuleInput,
    startedAt: "2027-06-06T00:00:00.000Z",
    finishedAt: "2027-06-06T00:41:30.000Z",
    createdAt: "2027-06-06T00:41:31.000Z",
  })
  assert.equal(rerun.reproducibility_hash, capsule.reproducibility_hash)
  assert.equal(verifyExecutionCapsule(rerun).valid, true)
})

test("a capsule that does not name its hash rules is refused, not guessed", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const { [STUDY_HASH_RULES_KEY]: _omitted, ...unmarked } = capsule
  assert.deepEqual(
    verifyExecutionCapsule(unmarked).refusals.map((refusal) => refusal.code),
    ["STUDY_HASH_RULES_ID_MISSING"],
  )
  assert.deepEqual(
    verifyExecutionCapsule({ ...capsule, [STUDY_HASH_RULES_KEY]: "study-v2" }).refusals.map(
      (refusal) => refusal.code,
    ),
    ["STUDY_HASH_RULES_ID_UNKNOWN"],
  )
  assert.equal(verifyExecutionCapsule(unmarked).rules_id, null)
})

test("a capsule that is not a capsule is reported as a shape problem, not a hash one", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const verification = verifyExecutionCapsule({ ...capsule, execution_class: "MAGIC" })
  assert.equal(verification.valid, false)
  assert.equal(verification.rules_id, STUDY_HASH_RULES_ID)
  assert.equal(verification.problems.some((problem) => problem.startsWith("execution_class")), true)
  assert.equal(verifyExecutionCapsule(null).problems.length, 1)
})

test("the pinned capsule verifies as written", () => {
  const capsule = fixture("study-capsule.json")
  const verification = verifyExecutionCapsule(capsule)
  assert.equal(verification.valid, true, verification.problems.join(" "))
  assert.equal(verification.expected_hash, capsule.reproducibility_hash)
  assert.equal(verifyStudyRecordHash(capsule).valid, true, "the family verifier reads reproducibility_hash too")
})

// A capsule's digest is over the file, not over what the parser makes of it.
//
// The disagreement this holds shut used to be reachable through `.default({})` on two
// environment maps: `safeParse` invented the keys for a producer that wrote neither, and hashing
// the parsed value made this verifier answer about a record the file does not contain while
// `python/tests/test_study_hashing.py` read the same bytes and invented nothing. Neither side had
// an error message for it -- TypeScript reported the file valid and Python reported it
// unverifiable. `StudyEnvironment` requires both lists and defaults neither, so a capsule the
// parser would complete is now unrepresentable; what this pins is that the verifier still reads
// the file rather than its parse.
test("a capsule is hashed as it was written, not as it parses", () => {
  const omitted = { ...capsuleInput, environment: { operating_system: "Linux", architecture: "x86_64" } }
  assert.throws(() => buildExecutionCapsule(omitted), /packages/, "no list is defaulted into existence")

  const built = buildExecutionCapsule(capsuleInput)
  const edited = { ...built, environment: { ...built.environment, hardware: [{ name: "cores", value: "8" }] } }
  const editedHash = calculateStudyHash(edited)
  assert.notEqual(editedHash, built.reproducibility_hash, "an environment entry is content")

  const stale = verifyExecutionCapsule(edited)
  assert.equal(stale.valid, false, "the file carries the digest of a record it is not")
  assert.equal(stale.expected_hash, editedHash)

  const honest = verifyExecutionCapsule({ ...edited, reproducibility_hash: editedHash })
  assert.equal(honest.valid, true, honest.problems.join(" "))
  assert.equal(honest.expected_hash, editedHash)
})

// Undeclared keys are refused rather than stripped, and the two languages therefore give one
// answer for one file. Zod's default is to strip, while the generated JSON Schema has always said
// `additionalProperties: false`, so a capsule carrying a key no schema declares parsed here and
// was refused by `validate_study_record` in Python. `owner_username` is the case that hid best:
// it is excluded from the digest, so the hash did not move either and nothing objected at all.
test("a capsule carrying a key no schema declares is refused, not stripped", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  for (const undeclared of [{ owner_username: "somebody-else" }, { smuggled: "not declared" }]) {
    const verification = verifyExecutionCapsule({ ...capsule, ...undeclared })
    assert.equal(verification.valid, false, `${Object.keys(undeclared)[0]} must not pass as a capsule`)
    assert.equal(
      verification.problems.some((problem) => /[Uu]nrecognized key/.test(problem)),
      true,
      verification.problems.join(" "),
    )
  }
})

test("the pinned package verifies as written in both languages", () => {
  // Pinned in study-expected-hashes.json and asserted from Python by
  // test_python_study_hashes_match_shared_expected_fixtures. Its one citation now *carries* its
  // author list rather than relying on a default to supply one: an empty array is a statement a
  // reader can see and a byte the digest covers, where an omitted key was a container only one of
  // the two languages invented.
  const pkg = fixture("study-research-package-as-written.json")
  assert.deepEqual(pkg.references[0].authors, [], "the file says what it hashes")
  assert.equal(calculateStudyHash(pkg), pkg.reproducibility_hash)
  assert.equal(
    calculateStudyHash(pkg),
    fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID].study_research_package_as_written,
  )
  // And it holds together structurally, which is the half a digest cannot check:
  // its one claim is joined to its evidence by an edge the file carries, and its
  // one result row reads a node that has a value. Asserted from Python too, in
  // test_a_package_written_without_its_optional_maps_verifies_here_too.
  const verification = verifyResearchPackage(pkg)
  assert.deepEqual(verification.problems, [])
  assert.equal(verification.valid, true)
})

// An integer above 2**53 is not the same number in the two languages.
//
// Python emits `str(int)` exactly; JavaScript reads the same JSON as a double. A 64-bit seed --
// what Stim and NumPy hand out, so the ordinary case rather than the pathological one -- came out
// as 13835058055282164000 here and 13835058055282163712 there, from the same bytes, and the two
// digests differed. There is no rendering rule that reconciles them, so the contract refuses the
// value instead of producing two answers for one record.
//
// The refusal used to be a `.max()` on `seed` and on `resource_limits.max_memory_bytes`, and on
// nothing else in the family. It now lives in the hashing layer, over every number a study record
// hashes at every depth, which is why the schema below no longer bounds the field and the
// verifier reports `STUDY_VALUE_NOT_REPRESENTABLE` instead. A capsule is still refused; so is
// everything the two-field enumeration used to miss.
test("an integer JavaScript cannot hold exactly is refused, not silently rounded", () => {
  const unsafe = 13835058055282163712
  assert.notEqual(unsafe, 13835058055282163712n, "this literal is already not the number that was written")

  assert.throws(
    () => buildExecutionCapsule({ ...capsuleInput, seed: unsafe }),
    /cannot be represented exactly in JavaScript/,
  )
  assert.throws(
    () =>
      buildExecutionCapsule({
        ...capsuleInput,
        resourceLimits: { max_runtime: null, max_memory_bytes: unsafe, max_credits: null },
      }),
    /cannot be represented exactly in JavaScript/,
  )

  // A capsule that arrives with one is refused by name, before the shape is even asked about:
  // "this cannot be hashed" and "this is not a capsule" send a reader to different places.
  const verification = verifyExecutionCapsule({ ...buildExecutionCapsule(capsuleInput), seed: unsafe })
  assert.equal(verification.valid, false)
  assert.deepEqual(
    verification.refusals.map((refusal) => refusal.code),
    ["STUDY_VALUE_NOT_REPRESENTABLE"],
  )
  // The message says why rather than only that: a caller reading it can tell that renaming or
  // retrying will not help, and that the value itself is what has to change.
  assert.equal(verification.problems[0].includes("two different digests"), true, verification.problems[0])
  assert.equal(verification.problems[0].includes("seed"), true, verification.problems[0])
  // Reported as a hashing refusal rather than as a mismatch: the digest was never taken.
  assert.equal(verification.expected_hash, "")

  // And the schema deliberately no longer answers for it. Leaving the bound here as well would be
  // a second rule free to drift from the first, and the first is the one both languages run.
  assert.equal(ExecutionCapsuleSchema.safeParse({ ...buildExecutionCapsule(capsuleInput), seed: unsafe }).success, true)
})

// The half of the same finding that no enumeration reached: `Quantity.value` is every number a
// study reports, and it was unguarded.
//
// Near 4.2e21 one double stands for 524287 distinct integers, so two evidence nodes reporting
// figures 524286 apart took one content hash, one package digest, and `valid: true` with no
// problems -- while every row, edge and claim-map entry went on resolving, because the node's
// identity had not moved either. Python, holding the integers as written, computed two different
// digests and matched neither.
test("a reported figure JavaScript cannot hold exactly is refused wherever it sits", () => {
  // The widest such pair: the lowest and highest integers this one double stands for.
  const LOW = 4199999999999999737857n
  const HIGH = 4200000000000000262143n
  assert.equal(Number(LOW), Number(HIGH), "one double, two integers 524286 apart")

  const nodeWith = (literal) =>
    JSON.parse(
      `{"schema_version":"1.0","hash_rules_id":"study-v1","study_ref":"${STUDY_REF}","kind":"quantity",` +
        `"label":"total physical-qubit-seconds","claim":null,"quantity":{"value":${literal},` +
        `"unit":"qubit_seconds","bound":"UPPER_BOUND","evidence":"MODELLED","source":"s","model":"m",` +
        `"model_version":"1","assumptions":[],"schema_version":"0.1","limitations":[]},"reference":null,` +
        `"citation":null,"limitations":[],"source_published_on":null,"retrieved_on":null}`,
    )

  for (const literal of [LOW.toString(), HIGH.toString(), "4.2e21"]) {
    assert.throws(
      () => calculateStudyHash(nodeWith(literal)),
      /quantity\.value is 4\.2e\+21/,
      `${literal} must not be given a content address JavaScript cannot tell from another value's`,
    )
  }

  // The bound is inclusive and the refusal is about ambiguity, not size: the last integer both
  // languages hold exactly is still hashed, and so is a non-integral number of any magnitude,
  // because no second value canonicalizes onto it.
  assert.equal(typeof calculateStudyHash(nodeWith(String(Number.MAX_SAFE_INTEGER))), "string")
  assert.equal(typeof calculateStudyHash(nodeWith("1.5e-9")), "string")
})

// A byte sequence neither language can round-trip cannot be hashed identically in both.
//
// A lone `\ud800` in a node label is legal in a JavaScript string and legal in JSON. This side
// escaped it and hashed the escape; Python held the same lone surrogate and raised
// `UnicodeEncodeError` out of `calculate_study_hash`, so the recipient could not check the file
// at all. Refusing beats diverging, exactly as with the integers.
test("a string carrying an unpaired UTF-16 surrogate is refused rather than hashed here alone", () => {
  const withLabel = (label) => ({
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    kind: "quantity",
    label,
  })

  for (const half of ["\uD800", "total qubits \uD800", "\uDC00 total qubits"]) {
    assert.throws(() => calculateStudyHash(withLabel(half)), /unpaired UTF-16 surrogate/)
  }

  // A well-formed pair is one character and hashes normally. Refusing it would be refusing an
  // emoji, which is not what either language struggles with.
  assert.equal(typeof calculateStudyHash(withLabel("total qubits \uD83D\uDE00")), "string")

  // And a key is encoded exactly as a value is, so the walk asks about keys too.
  assert.throws(
    () => calculateStudyHash({ [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID, notes: { "\uD800": "half a key" } }),
    /unpaired UTF-16 surrogate/,
  )
})

test("exactly Number.MAX_SAFE_INTEGER is accepted, and hashes the same in both languages", () => {
  const capsule = buildExecutionCapsule({
    ...capsuleInput,
    seed: Number.MAX_SAFE_INTEGER,
    resourceLimits: { max_runtime: null, max_memory_bytes: Number.MAX_SAFE_INTEGER, max_credits: null },
  })
  assert.equal(capsule.seed, Number.MAX_SAFE_INTEGER)
  assert.equal(verifyExecutionCapsule(capsule).valid, true)

  // Pinned, and recomputed from the same file by python/tests/test_study_hashing.py.
  const pinned = fixture("study-capsule-max-safe-integers.json")
  assert.equal(pinned.seed, Number.MAX_SAFE_INTEGER)
  assert.equal(pinned.resource_limits.max_memory_bytes, Number.MAX_SAFE_INTEGER)
  assert.equal(verifyExecutionCapsule(pinned).valid, true)
  assert.equal(
    calculateStudyHash(pinned),
    fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID].study_capsule_max_safe_integers,
  )
})
