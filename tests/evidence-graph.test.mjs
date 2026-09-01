import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import {
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  STUDY_SCHEMA_VERSION,
  exactIntegerStringFromBigInt,
  readStudyFileBytes,
  receiptHash,
  semanticHash,
  studySelfHash,
  verifyStudySelfHash,
} from "../dist/study/index.js"
import {
  ClaimMapEntrySchema,
  ClaimStatementSchema,
  ClaimValueRefSchema,
  EVIDENCE_EDGE_MATRIX,
  EVIDENCE_GROUND_RULES,
  EvidenceEdgeKindSchema,
  EvidenceEdgeSchema,
  EvidenceNodeKindSchema,
  EvidenceNodeSchema,
  EvidenceReferenceSchema,
  contradictionSet,
  isEvidenceEdgePermitted,
  resolveClaimEvidence,
  supersessionChain,
  verifyClaimMap,
  verifyEvidenceGraph,
  verifyProvenanceClosure,
} from "../dist/study/evidence.js"
import { ReproductionRecordSchema, ReviewRecordSchema } from "../dist/study/review.js"
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
 * cannot exist without something behind it -- and "behind it" is the load
 * bearing phrase: the payload pairing, the value reference, the edge matrix and
 * the provenance closure are the same rule seen from four angles, and every one
 * of them, violated, produces a sentence in a report that no reader can walk
 * back to a number. Each is therefore tested by being violated rather than by
 * being exercised. The second is that a capsule says what it can prove and no
 * more -- one attestation level, hashed, so the strength of the evidence cannot
 * be edited after the run.
 */

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/reproducibility/${name}`, import.meta.url), "utf8"))

const STUDY_REF = "d5a370a6-8b65-4ae8-8f57-8c06f313afac"
const OTHER_STUDY_REF = "7f3c1e88-5b2a-4d19-9c6e-2a4b8d0f1e73"
const OTHER_HASH = "b".repeat(64)
const ABSENT_HASH = "e".repeat(64)
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

const subjectRef = () => ({
  record_kind: "quantum_workload",
  hash: null,
  record_slug: "shor-2048",
})

const valueRef = (nodeHash) => ({ kind: "value_node", node_hash: nodeHash, field_path: null })

const claimStatement = (changes = {}) => ({
  subject_ref: subjectRef(),
  metric: "total_physical_qubits",
  comparator: "AT_MOST",
  value_ref: valueRef(OTHER_HASH),
  ...changes,
})

// The four payload blocks, and which node kind each one belongs to. Written out
// here rather than imported so the test asserts the pairing the module claims
// instead of asserting the module against itself.
const PAYLOADS = {
  claim: () => claimStatement(),
  quantity: () => unknownRuntime(),
  reference: () => ({ record_kind: "qec_benchmark_result", hash: OTHER_HASH, record_slug: null }),
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
  assumption: "quantity",
  input: "reference",
  model_ref: "reference",
  result: "reference",
  capsule_ref: "reference",
  source: "citation",
  dataset_ref: "reference",
  snapshot_ref: "reference",
}
// Two kinds want a narrower payload than the generic one: an assumption must
// state a value it assumes, and a capsule reference names exactly one contract.
const KIND_PAYLOAD_VALUE = {
  assumption: () => knownQuantity(0.001),
  capsule_ref: () => ({ record_kind: "execution_capsule", hash: OTHER_HASH, record_slug: null }),
}
const payloadFor = (kind) => (KIND_PAYLOAD_VALUE[kind] ?? PAYLOADS[KIND_PAYLOAD[kind]])()

const nodeBody = (changes = {}) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_ref: STUDY_REF,
  kind: "claim",
  label: "a node",
  visibility: "PUBLIC",
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
  asserted_by: MODEL,
  rationale: "The bound is read from the estimate rather than restated.",
  ...changes,
})

// A node's identity is the hash of its content, so a test that wants a usable
// node computes the hash rather than inventing one. `content_hash` is `DERIVED`
// and no purpose reads it, which is why stamping it afterwards is not circular.
const stampNode = (body) =>
  EvidenceNodeSchema.parse({ ...body, content_hash: studySelfHash("evidence_node", body) })
const stampEdge = (body) =>
  EvidenceEdgeSchema.parse({ ...body, content_hash: studySelfHash("evidence_edge", body) })

// Some graph tests need a record the schema would refuse -- an edge whose two
// ends are one node, a triple the matrix does not define -- because the
// question is what the *graph* check says about a file assembled without a
// parse. Those build the record without parsing it.
const unparsedEdge = (body) => ({ ...body, content_hash: studySelfHash("evidence_edge", body) })

const nodeOfKind = (kind, changes = {}) =>
  stampNode(nodeBody({ kind, [KIND_PAYLOAD[kind]]: payloadFor(kind), ...changes }))

const codesOf = (refusals) => refusals.map((refusal) => refusal.code).sort()

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

test("a claim holds no number of its own, so there is one place a value can be", () => {
  // The failure this closes is two copies of one decision-bearing number, free
  // to disagree -- and the copy inside the sentence is the one that gets quoted.
  // A claim that still carried a `value` is refused as an undeclared key rather
  // than accepted and ignored.
  assert.throws(
    () => ClaimStatementSchema.parse({ ...claimStatement(), value: knownQuantity() }),
    /unrecognized_keys|Unrecognized key/,
  )
  const parsed = ClaimStatementSchema.parse(claimStatement())
  assert.deepEqual(Object.keys(parsed).sort(), ["comparator", "metric", "subject_ref", "value_ref"])
})

test("a claim names its subject by reference, not by display name", () => {
  assert.throws(() => ClaimStatementSchema.parse(claimStatement({ subject_ref: "shor-2048" })), /expected object|invalid_type/i)
  assert.throws(
    () => ClaimStatementSchema.parse(claimStatement({ subject_ref: { ...subjectRef(), record_kind: "workload" } })),
    /invalid_enum_value|Invalid enum/,
  )
})

test("a value reference says which node, and a result reference says which field of it", () => {
  assert.throws(
    () => ClaimValueRefSchema.parse({ kind: "result_field", node_hash: OTHER_HASH, field_path: null }),
    /must say which field/,
  )
  assert.throws(
    () => ClaimValueRefSchema.parse({ kind: "value_node", node_hash: OTHER_HASH, field_path: "metrics/p_L" }),
    /there is no field to name/,
  )
  assert.equal(
    ClaimValueRefSchema.parse({ kind: "result_field", node_hash: OTHER_HASH, field_path: "metrics/p_L" }).field_path,
    "metrics/p_L",
  )
  // One spelling per path, for the reason `values.ts` gives about numbers.
  assert.throws(
    () => ClaimValueRefSchema.parse({ kind: "result_field", node_hash: OTHER_HASH, field_path: "/metrics/p_L" }),
    /invalid_string|Invalid/,
  )
})

test("an unknown value is representable in a quantity node, which is where it belongs", () => {
  const node = nodeOfKind("quantity")
  assert.equal(node.quantity.value, null)
  assert.equal(node.quantity.evidence, "UNKNOWN")
})

test("an assumption must state the value it assumes", () => {
  assert.throws(
    () =>
      EvidenceNodeSchema.parse({
        ...nodeBody({ kind: "assumption", quantity: unknownRuntime() }),
        content_hash: "0".repeat(64),
      }),
    /An assumption must state the value it assumes/,
  )
  assert.equal(nodeOfKind("assumption").quantity.value, 0.001)
})

// ------------------------------------------------------------ kind/payload pairing

test("every node kind carries exactly the payload its kind means", () => {
  assert.deepEqual(Object.keys(KIND_PAYLOAD).sort(), [...EvidenceNodeKindSchema.options].sort())
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
            ...nodeBody({ kind, [required]: payloadFor(kind), [wrong]: PAYLOADS[wrong]() }),
            content_hash: "0".repeat(64),
          }),
        new RegExp(`must leave ${wrong} null`),
        `a ${kind} node must not also carry a ${wrong} block`,
      )
    }
  }
})

test("a node kind that names one contract refuses a reference to another", () => {
  assert.throws(
    () =>
      EvidenceNodeSchema.parse({
        ...nodeBody({
          kind: "capsule_ref",
          reference: { record_kind: "qec_benchmark_result", hash: OTHER_HASH, record_slug: null },
        }),
        content_hash: "0".repeat(64),
      }),
    /A capsule_ref node references a execution_capsule/,
  )
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

test("a reference draws its record kind from a versioned vocabulary", () => {
  // A free string means every consumer invents its own reading, and two of them
  // disagreeing about whether `benchmark_result` and `qec_benchmark_result` name
  // one contract is a disagreement about whether the evidence exists.
  assert.throws(
    () => EvidenceReferenceSchema.parse({ record_kind: "benchmark_result", hash: OTHER_HASH, record_slug: null }),
    /invalid_enum_value|Invalid enum/,
  )
  assert.equal(
    EvidenceReferenceSchema.parse({ record_kind: "qec_benchmark_result", hash: OTHER_HASH, record_slug: null })
      .record_kind,
    "qec_benchmark_result",
  )
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

test("every edge kind parses, and the two that are not relations between records are gone", () => {
  for (const kind of EvidenceEdgeKindSchema.options) {
    assert.equal(stampEdge(edgeBody({ kind })).kind, kind)
  }
  // A review's other end is a person, so no triple could ever be legal; a
  // reproduction's other end is a record and its verdict is unrepresentable on
  // an edge. Both are records now, with the fields their meaning requires.
  for (const retired of ["reviewed_by", "reproduces"]) {
    assert.throws(
      () => EvidenceEdgeSchema.parse({ ...edgeBody({ kind: retired }), content_hash: "0".repeat(64) }),
      /invalid_enum_value|Invalid enum/,
      `${retired} must not be an edge kind`,
    )
  }
  const review = ReviewRecordSchema.parse({
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: STUDY_REF,
    subject_node_hash: OTHER_HASH,
    verdict: "REJECTED",
    rationale: "The decoder version is not pinned, so the run is not reproducible.",
    reviewer: "reviewer@example.invalid",
    content_hash: "0".repeat(64),
  })
  assert.equal(review.verdict, "REJECTED")
  const reproduction = ReproductionRecordSchema.parse({
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: STUDY_REF,
    original_node_hash: OTHER_HASH,
    reproduction_capsule_ref: "a".repeat(64),
    observed_node_hash: "c".repeat(64),
    outcome: "DIVERGED",
    notes: "p_L differed by 4% at d=7.",
    asserted_by: "runner@example.invalid",
    content_hash: "0".repeat(64),
  })
  assert.equal(reproduction.outcome, "DIVERGED")
  // The whole reason it is a record: a divergence and a match are two findings,
  // and an edge has nowhere to put the difference.
  assert.throws(
    () =>
      ReproductionRecordSchema.parse({
        schema_version: STUDY_SCHEMA_VERSION,
        [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
        study_ref: STUDY_REF,
        original_node_hash: OTHER_HASH,
        reproduction_capsule_ref: "a".repeat(64),
        observed_node_hash: null,
        outcome: "MATCHED",
        notes: "",
        asserted_by: "runner@example.invalid",
        content_hash: "0".repeat(64),
      }),
    /comparison between two results/,
  )
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

// -------------------------------------------------------------- the matrix

test("the matrix defines the relations the model is built on", () => {
  for (const [from, kind, to] of [
    ["result", "derived_from", "input"],
    ["result", "used_model", "model_ref"],
    ["quantity", "derived_from", "result"],
    ["quantity", "supports", "claim"],
    ["source", "supports", "claim"],
    ["claim", "supersedes", "claim"],
  ]) {
    assert.equal(isEvidenceEdgePermitted(from, kind, to), true, `${from} ${kind} ${to}`)
  }
})

test("the matrix refuses the combinations that mean nothing", () => {
  for (const [from, kind, to] of [
    // A citation asserts nothing that a dataset could disagree with.
    ["source", "contradicts", "dataset_ref"],
    // A source is not computed from anything in this study.
    ["source", "derived_from", "claim"],
    // Support points at claims. "The claim supports the measurement" is not a
    // statement anyone means.
    ["claim", "supports", "result"],
    // Supersession runs along the diagonal: a result replacing a claim would
    // drop the claim out of every traversal that follows replacement.
    ["result", "supersedes", "claim"],
    // A model is used, not derived from.
    ["model_ref", "derived_from", "capsule_ref"],
  ]) {
    assert.equal(isEvidenceEdgePermitted(from, kind, to), false, `${from} ${kind} ${to}`)
  }
})

test("the matrix is declared data, and every triple names known kinds", () => {
  const nodeKinds = new Set(EvidenceNodeKindSchema.options)
  const edgeKinds = new Set(EvidenceEdgeKindSchema.options)
  for (const rule of EVIDENCE_EDGE_MATRIX) {
    assert.ok(nodeKinds.has(rule.from_kind), rule.from_kind)
    assert.ok(nodeKinds.has(rule.to_kind), rule.to_kind)
    assert.ok(edgeKinds.has(rule.edge_kind), rule.edge_kind)
    assert.ok(rule.why.length > 0, "every row says what the relation means")
  }
  assert.throws(() => EVIDENCE_EDGE_MATRIX.push({}), /read only|not extensible|object is not extensible/i)
})

test("an edge the matrix does not define is refused by the graph, not by a reviewer", () => {
  const source = nodeOfKind("source", { label: "the paper" })
  const dataset = nodeOfKind("dataset_ref", { label: "the syndrome dataset" })
  const illegal = stampEdge(
    edgeBody({
      kind: "contradicts",
      from_node_hash: source.content_hash,
      to_node_hash: dataset.content_hash,
      rationale: "Written by somebody who meant something by it.",
    }),
  )
  const verification = verifyEvidenceGraph([source, dataset], [illegal])
  assert.equal(verification.edges_permitted, false)
  assert.equal(verification.valid, false)
  assert.ok(codesOf(verification.refusals).includes("EVIDENCE_EDGE_NOT_PERMITTED"))
})

// --------------------------------------------------------------- traversal

const valueNode = nodeOfKind("quantity", {
  label: "Total physical qubits, base scenario",
  quantity: knownQuantity(),
})
const claimNode = nodeOfKind("claim", {
  label: "Shor-2048 fits within 4.2 million physical qubits",
  claim: claimStatement({ value_ref: valueRef(valueNode.content_hash) }),
})
const supportingResult = nodeOfKind("result", { label: "base scenario estimate" })
const withdrawnObjection = nodeOfKind("result", { label: "first objection, later replaced" })
const liveObjection = nodeOfKind("result", { label: "objection that still stands" })

const supportsEdge = stampEdge(
  edgeBody({ kind: "supports", from_node_hash: valueNode.content_hash, to_node_hash: claimNode.content_hash }),
)
const derivedEdge = stampEdge(
  edgeBody({
    kind: "derived_from",
    from_node_hash: valueNode.content_hash,
    to_node_hash: supportingResult.content_hash,
    rationale: "The number is read out of this estimate, which is the run that produced it.",
  }),
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

const graphNodes = [claimNode, valueNode, supportingResult, withdrawnObjection, liveObjection]
const graphEdges = [supportsEdge, derivedEdge, withdrawnEdge, supersedesEdge, liveEdge]

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
    ["Total physical qubits, base scenario"],
  )
  assert.deepEqual(
    resolved.contradicting.map((node) => node.label),
    ["objection that still stands"],
  )
  assert.equal(resolved.grounded, true)
  assert.deepEqual(resolved.terminals, [supportingResult.content_hash])
  assert.deepEqual(resolved.refusals, [])
})

test("a claim with nothing behind it is refused, not annotated", () => {
  const resolved = resolveClaimEvidence([claimNode, valueNode], [], claimNode.content_hash)
  assert.deepEqual(codesOf(resolved.refusals), ["CLAIM_WITHOUT_EVIDENCE_NODE"])
})

test("a supports edge naming a node the graph does not carry is refused", () => {
  const dangling = stampEdge(
    edgeBody({ kind: "supports", from_node_hash: ABSENT_HASH, to_node_hash: claimNode.content_hash }),
  )
  const resolved = resolveClaimEvidence([claimNode, valueNode], [dangling], claimNode.content_hash)
  assert.deepEqual(codesOf(resolved.refusals), [
    "CLAIM_NOT_GROUNDED",
    "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
  ])
  assert.deepEqual(
    codesOf(resolveClaimEvidence(graphNodes, graphEdges, "f".repeat(64)).refusals),
    ["EVIDENCE_NODE_UNRESOLVED"],
  )
})

// ------------------------------------------------------- provenance closure

test("one supports edge is not grounding: a claim backed only by a claim fails closure", () => {
  // The property the whole module exists for. Every local check passes -- both
  // nodes parse, the edge is in the matrix, the hashes recompute -- and nothing
  // anywhere was measured.
  const backing = nodeOfKind("claim", {
    label: "an earlier claim that says much the same thing",
    claim: claimStatement({ value_ref: valueRef(valueNode.content_hash) }),
  })
  const chained = stampEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: backing.content_hash,
      to_node_hash: claimNode.content_hash,
      rationale: "The earlier study reached the same conclusion.",
    }),
  )
  const nodes = [claimNode, backing, valueNode]
  const closure = verifyProvenanceClosure(nodes, [chained], claimNode.content_hash)
  assert.equal(closure.grounded, false)
  assert.deepEqual(closure.terminals, [])
  assert.ok(codesOf(closure.refusals).includes("CLAIM_NOT_GROUNDED"))

  // And a chain of them is no better, however long: the check is about where
  // the walk ends, not how far it goes.
  const third = nodeOfKind("claim", {
    label: "and an earlier one still",
    claim: claimStatement({ value_ref: valueRef(valueNode.content_hash) }),
  })
  const deeper = stampEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: third.content_hash,
      to_node_hash: backing.content_hash,
      rationale: "Which cited this one.",
    }),
  )
  const deep = verifyProvenanceClosure([...nodes, third], [chained, deeper], claimNode.content_hash)
  assert.equal(deep.grounded, false)
  assert.ok(codesOf(deep.refusals).includes("CLAIM_NOT_GROUNDED"))
})

test("a number nobody says where they got does not ground a claim either", () => {
  const closure = verifyProvenanceClosure([claimNode, valueNode], [supportsEdge], claimNode.content_hash)
  assert.equal(closure.grounded, false)
  assert.deepEqual(codesOf(closure.refusals), ["CLAIM_NOT_GROUNDED", "CLAIM_SUPPORT_BRANCH_UNGROUNDED"])
})

test("every kind the grounding table ends a chain in actually ends one", () => {
  const grounding = EVIDENCE_GROUND_RULES.filter((rule) => rule.grounds === "always")
  assert.ok(grounding.length >= 6, "the goal names six terminal kinds and an explicit UNKNOWN")
  for (const rule of grounding) {
    const terminal = nodeOfKind(rule.node_kind, { label: `a ${rule.node_kind} terminal` })
    const edge = stampEdge(
      edgeBody({
        kind: "supports",
        from_node_hash: terminal.content_hash,
        to_node_hash: claimNode.content_hash,
        rationale: `The claim rests on this ${rule.node_kind}.`,
      }),
    )
    const closure = verifyProvenanceClosure([claimNode, terminal], [edge], claimNode.content_hash)
    assert.equal(closure.grounded, true, `${rule.node_kind}: ${rule.why}`)
    assert.deepEqual(closure.terminals, [terminal.content_hash])
  }
  // And the three that do not end one are the three the table says do not.
  assert.deepEqual(
    EVIDENCE_GROUND_RULES.filter((rule) => rule.grounds !== "always").map((rule) => rule.node_kind).sort(),
    ["claim", "model_ref", "quantity"],
  )
})

test("an explicit UNKNOWN ends a chain, because saying so is a complete answer", () => {
  const unknown = nodeOfKind("quantity", { label: "the classical baseline nobody measured" })
  const edge = stampEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: unknown.content_hash,
      to_node_hash: claimNode.content_hash,
      rationale: "The claim is stated in spite of this gap, which is recorded rather than filled in.",
    }),
  )
  const closure = verifyProvenanceClosure([claimNode, unknown], [edge], claimNode.content_hash)
  assert.equal(closure.grounded, true)
  assert.deepEqual(closure.terminals, [unknown.content_hash])
})

test("a provenance cycle is refused rather than walked", () => {
  const first = nodeOfKind("quantity", { label: "first figure", quantity: knownQuantity(1) })
  const second = nodeOfKind("quantity", { label: "second figure", quantity: knownQuantity(2) })
  const support = stampEdge(
    edgeBody({ kind: "supports", from_node_hash: first.content_hash, to_node_hash: claimNode.content_hash }),
  )
  const loopOut = stampEdge(
    edgeBody({
      kind: "derived_from",
      from_node_hash: first.content_hash,
      to_node_hash: second.content_hash,
      rationale: "Computed from the second figure.",
    }),
  )
  const loopBack = stampEdge(
    edgeBody({
      kind: "derived_from",
      from_node_hash: second.content_hash,
      to_node_hash: first.content_hash,
      rationale: "And the second from the first.",
    }),
  )
  const closure = verifyProvenanceClosure(
    [claimNode, first, second],
    [support, loopOut, loopBack],
    claimNode.content_hash,
  )
  assert.equal(closure.grounded, false)
  assert.deepEqual(codesOf(closure.refusals), ["CLAIM_NOT_GROUNDED", "EVIDENCE_GRAPH_CYCLE"])

  const verification = verifyEvidenceGraph([claimNode, first, second], [support, loopOut, loopBack])
  assert.equal(verification.claims_grounded, false)
  assert.ok(codesOf(verification.refusals).includes("EVIDENCE_GRAPH_CYCLE"))
})

test("a branch that dies is reported even when another branch grounds the claim", () => {
  // The verdict alone would never surface this: the claim is grounded, and the
  // dead branch is still in the graph a reader is shown.
  const orphan = nodeOfKind("quantity", { label: "a figure with no run behind it", quantity: knownQuantity(7) })
  const orphanEdge = stampEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: orphan.content_hash,
      to_node_hash: claimNode.content_hash,
      rationale: "Also offered in support.",
    }),
  )
  const closure = verifyProvenanceClosure(
    [claimNode, valueNode, supportingResult, orphan],
    [supportsEdge, derivedEdge, orphanEdge],
    claimNode.content_hash,
  )
  assert.equal(closure.grounded, true)
  assert.deepEqual(closure.terminals, [supportingResult.content_hash])
  assert.deepEqual(codesOf(closure.refusals), ["CLAIM_SUPPORT_BRANCH_UNGROUNDED"])
})

test("closure is a question about a claim, and refuses to answer it about anything else", () => {
  const closure = verifyProvenanceClosure(graphNodes, graphEdges, supportingResult.content_hash)
  assert.equal(closure.grounded, false)
  assert.deepEqual(codesOf(closure.refusals), ["EVIDENCE_NODE_KIND_MISMATCH"])
})

// ----------------------------------------------------------- claim value ref

test("a claim's value must resolve to a node that can carry one", () => {
  const missing = nodeOfKind("claim", {
    label: "a claim whose number is not in the package",
    claim: claimStatement({ value_ref: valueRef(ABSENT_HASH) }),
  })
  assert.ok(
    codesOf(verifyEvidenceGraph([missing], []).refusals).includes("EVIDENCE_NODE_UNRESOLVED"),
  )

  const model = nodeOfKind("model_ref", { label: "the estimator" })
  const atModel = nodeOfKind("claim", {
    label: "a claim reading its number off a model",
    claim: claimStatement({ value_ref: valueRef(model.content_hash) }),
  })
  assert.ok(
    codesOf(verifyEvidenceGraph([atModel, model], []).refusals).includes("EVIDENCE_NODE_KIND_MISMATCH"),
  )

  const result = nodeOfKind("result", { label: "the run" })
  const atResult = nodeOfKind("claim", {
    label: "a claim reading a named field of a result",
    claim: claimStatement({
      value_ref: { kind: "result_field", node_hash: result.content_hash, field_path: "metrics/p_L" },
    }),
  })
  assert.equal(
    codesOf(verifyEvidenceGraph([atResult, result], []).refusals).includes("EVIDENCE_NODE_KIND_MISMATCH"),
    false,
  )
})

test("a claim cannot read its value from an UNKNOWN, wherever the unknown lives", () => {
  const unknown = nodeOfKind("quantity", { label: "the runtime nobody measured" })
  const claim = nodeOfKind("claim", {
    label: "a claim about a number nobody has",
    claim: claimStatement({ value_ref: valueRef(unknown.content_hash) }),
  })
  assert.ok(codesOf(verifyEvidenceGraph([claim, unknown], []).refusals).includes("CLAIM_VALUE_UNKNOWN"))
})

// -------------------------------------------------------- graph verification

test("a whole graph verifies by recomputing every identity", () => {
  const verification = verifyEvidenceGraph(graphNodes, graphEdges)
  assert.equal(verification.valid, true, verification.problems.join(" "))
  assert.equal(verification.hashes_match, true)
  assert.equal(verification.edges_resolve, true)
  assert.equal(verification.edges_permitted, true)
  assert.equal(verification.claims_grounded, true)
})

test("a node edited after it was written fails on its own hash", () => {
  const tampered = { ...valueNode, quantity: knownQuantity(1000) }
  const verification = verifyEvidenceGraph([claimNode, tampered, supportingResult], graphEdges)
  assert.equal(verification.hashes_match, false)
  assert.equal(verification.valid, false)
})

test("a node edited and re-hashed fails structurally, because identity is the hash", () => {
  const rewritten = stampNode(nodeBody({ ...valueNode, content_hash: undefined, quantity: knownQuantity(1000) }))
  const verification = verifyEvidenceGraph([claimNode, rewritten, supportingResult], [supportsEdge, derivedEdge])
  assert.equal(verification.hashes_match, true, "the fabrication is internally consistent")
  assert.equal(verification.edges_resolve, false, "and the edges that named the old node now point at nothing")
  assert.ok(codesOf(verification.refusals).includes("EVIDENCE_EDGE_ENDPOINT_UNRESOLVED"))
})

test("one graph, one study", () => {
  const foreign = stampNode(nodeBody({ ...supportingResult, content_hash: undefined, study_ref: OTHER_STUDY_REF }))
  const verification = verifyEvidenceGraph([claimNode, valueNode, foreign], [supportsEdge])
  assert.ok(codesOf(verification.refusals).includes("EVIDENCE_GRAPH_STUDY_MISMATCH"))
})

test("two nodes cannot share one hash, and one relation cannot be asserted twice", () => {
  const duplicated = verifyEvidenceGraph([claimNode, valueNode, valueNode, supportingResult], graphEdges)
  assert.ok(codesOf(duplicated.refusals).includes("EVIDENCE_NODE_DUPLICATE"))

  const restated = stampEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: valueNode.content_hash,
      to_node_hash: claimNode.content_hash,
      rationale: "The same relation, asserted again with different words.",
    }),
  )
  const twice = verifyEvidenceGraph(
    [claimNode, valueNode, supportingResult],
    [supportsEdge, derivedEdge, restated],
  )
  assert.ok(codesOf(twice.refusals).includes("EVIDENCE_EDGE_DUPLICATE"))
})

test("an edge assembled without a parse still cannot join a node to itself", () => {
  const loop = unparsedEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: claimNode.content_hash,
      to_node_hash: claimNode.content_hash,
    }),
  )
  const verification = verifyEvidenceGraph([claimNode, valueNode], [loop])
  assert.equal(verification.edges_permitted, false)
  assert.ok(codesOf(verification.refusals).includes("EVIDENCE_EDGE_NOT_PERMITTED"))
})

test("supersession runs one way, and forks are refused", () => {
  const first = nodeOfKind("result", { label: "the first reading" })
  const second = nodeOfKind("result", { label: "the second reading" })
  const forward = stampEdge(
    edgeBody({
      kind: "supersedes",
      from_node_hash: first.content_hash,
      to_node_hash: second.content_hash,
      rationale: "Replaces the second.",
    }),
  )
  const backward = stampEdge(
    edgeBody({
      kind: "supersedes",
      from_node_hash: second.content_hash,
      to_node_hash: first.content_hash,
      rationale: "And is replaced by it.",
    }),
  )
  assert.ok(
    codesOf(verifyEvidenceGraph([first, second], [forward, backward]).refusals).includes("EVIDENCE_GRAPH_CYCLE"),
  )

  const third = nodeOfKind("result", { label: "a third reading, produced in parallel" })
  const fork = stampEdge(
    edgeBody({
      kind: "supersedes",
      from_node_hash: third.content_hash,
      to_node_hash: second.content_hash,
      rationale: "Also replaces the second.",
    }),
  )
  assert.ok(
    codesOf(verifyEvidenceGraph([first, second, third], [forward, fork]).refusals).includes(
      "EVIDENCE_SUPERSESSION_BRANCH",
    ),
  )
})

test("two references to one record must not disagree about what it is or is called", () => {
  const named = nodeOfKind("input", {
    label: "the decoder, by name",
    reference: { record_kind: "artifact", hash: OTHER_HASH, record_slug: "surface-code-decoder" },
  })
  const renamed = nodeOfKind("input", {
    label: "the same hash, a different name",
    reference: { record_kind: "artifact", hash: OTHER_HASH, record_slug: "mwpm-decoder" },
  })
  assert.ok(
    codesOf(verifyEvidenceGraph([named, renamed], []).refusals).includes("EVIDENCE_REFERENCE_DISAGREES"),
  )

  const refiled = nodeOfKind("dataset_ref", {
    label: "the same hash, a different kind",
    reference: { record_kind: "benchmark_suite", hash: OTHER_HASH, record_slug: null },
  })
  assert.ok(
    codesOf(verifyEvidenceGraph([named, refiled], []).refusals).includes("EVIDENCE_REFERENCE_DISAGREES"),
  )
})

test("a reference cannot file a node of this graph under some other record's kind", () => {
  const impostor = nodeOfKind("result", {
    label: "a reference pointing back into the graph",
    reference: { record_kind: "qec_benchmark_result", hash: supportingResult.content_hash, record_slug: null },
  })
  assert.ok(
    codesOf(verifyEvidenceGraph([impostor, supportingResult], []).refusals).includes(
      "EVIDENCE_NODE_KIND_MISMATCH",
    ),
  )
})

test("a private node cannot enter a public package, and visibility is inside the hash", () => {
  const priv = nodeOfKind("result", { label: "an internal run", visibility: "PRIVATE" })
  const publicRead = verifyEvidenceGraph([priv], [])
  assert.equal(publicRead.valid, false)
  assert.ok(codesOf(publicRead.refusals).includes("EVIDENCE_NODE_NOT_PUBLIC"))

  const internalRead = verifyEvidenceGraph([priv], [], { audience: "internal" })
  assert.equal(internalRead.valid, true, internalRead.problems.join(" "))

  // Relabelling it for the export is not free: visibility is `RECORD_ONLY` and
  // an evidence node self-hashes for the record purpose, so the hash every edge
  // names moves with it.
  const relabelled = { ...priv, visibility: "PUBLIC" }
  assert.notEqual(studySelfHash("evidence_node", relabelled), priv.content_hash)
  assert.equal(verifyStudySelfHash("evidence_node", relabelled).valid, false)
})

// -------------------------------------------------------------- the claim map

const mapEntry = (changes = {}) => ({
  claim_node_hash: claimNode.content_hash,
  supporting_node_hashes: [valueNode.content_hash],
  contradicting_node_hashes: [],
  supporting_edge_hashes: [supportsEdge.content_hash],
  contradicting_edge_hashes: [],
  ...changes,
})

test("a claim map entry that names the right edge is accepted", () => {
  const entries = [
    ClaimMapEntrySchema.parse(
      mapEntry({
        contradicting_node_hashes: [liveObjection.content_hash],
        contradicting_edge_hashes: [liveEdge.content_hash],
      }),
    ),
  ]
  assert.deepEqual(verifyClaimMap(entries, graphNodes, graphEdges), [])
})

test("support and contradiction are separate fields, so an objection cannot be counted as support", () => {
  const entries = [
    ClaimMapEntrySchema.parse(
      mapEntry({
        supporting_node_hashes: [valueNode.content_hash, liveObjection.content_hash],
        supporting_edge_hashes: [supportsEdge.content_hash, liveEdge.content_hash],
      }),
    ),
  ]
  assert.deepEqual(codesOf(verifyClaimMap(entries, graphNodes, graphEdges)), [
    "CLAIM_EVIDENCE_CONTRADICTS",
  ])
})

test("an entry must name the edge that joins this evidence to this claim, not an edge that exists", () => {
  // Every hash in the entry resolves. The claim is a claim, the node is carried,
  // the edge is in the package -- and the edge is about two other records.
  const entries = [
    ClaimMapEntrySchema.parse(
      mapEntry({ supporting_edge_hashes: [supersedesEdge.content_hash] }),
    ),
  ]
  assert.deepEqual(codesOf(verifyClaimMap(entries, graphNodes, graphEdges)), ["CLAIM_EVIDENCE_UNLINKED"])
})

test("a claim map refuses duplicate entries, and entries whose target is not a claim", () => {
  const duplicated = [ClaimMapEntrySchema.parse(mapEntry()), ClaimMapEntrySchema.parse(mapEntry())]
  assert.deepEqual(codesOf(verifyClaimMap(duplicated, graphNodes, graphEdges)), [
    "CLAIM_MAP_DUPLICATE_ENTRY",
  ])

  const notAClaim = [
    ClaimMapEntrySchema.parse(mapEntry({ claim_node_hash: valueNode.content_hash })),
  ]
  assert.deepEqual(codesOf(verifyClaimMap(notAClaim, graphNodes, graphEdges)), [
    "CLAIM_WITHOUT_EVIDENCE_NODE",
    "EVIDENCE_NODE_KIND_MISMATCH",
  ])
})

test("a claim map refuses a claim citing itself, and a claim nobody mapped", () => {
  const selfCited = [
    ClaimMapEntrySchema.parse(mapEntry({ supporting_node_hashes: [claimNode.content_hash] })),
  ]
  assert.deepEqual(codesOf(verifyClaimMap(selfCited, graphNodes, graphEdges)), [
    "CLAIM_EVIDENCE_SELF_REFERENTIAL",
  ])
  assert.deepEqual(codesOf(verifyClaimMap([], graphNodes, graphEdges)), ["CLAIM_WITHOUT_EVIDENCE_NODE"])
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
  const unknown = nodes.find((node) => node.quantity !== null && node.quantity.value === null)
  assert.equal(unknown.quantity.evidence, "UNKNOWN")
  assert.equal(studySelfHash("evidence_node", unknown), unknown.content_hash)

  const claim = nodes.find((node) => node.kind === "claim")
  const resolved = resolveClaimEvidence(nodes, edges, claim.content_hash)
  assert.deepEqual(resolved.refusals, [])
  assert.equal(resolved.grounded, true)
  assert.deepEqual(
    resolved.supporting.map((node) => node.kind),
    ["quantity"],
  )
  // The claim's number is the node it names, not a copy beside it.
  const value = nodes.find((node) => node.content_hash === claim.claim.value_ref.node_hash)
  assert.equal(value.quantity.value, 4200000)
  assert.deepEqual(
    resolved.terminals.map((hash) => nodes.find((node) => node.content_hash === hash).kind),
    ["result"],
  )
})
// ---------------------------------------------------------- execution capsule

/**
 * A typed reference to one file, replacing the bare digest a capsule used to
 * list. A digest cannot say whether the bytes are all of the artifact, whether
 * anything was removed before it was written, or where a second party would
 * find them, and each of those is a question somebody asks of a result they are
 * about to quote.
 */
const artifactRef = (changes = {}) => ({
  name: "circuit.stim",
  role: "CIRCUIT",
  media_type: "text/plain",
  byte_size: "48213",
  content_hash: "5".repeat(64),
  resolution: { kind: "CONTENT_ADDRESSED_STORE", locator: "cas://55/55/5555" },
  completeness: "COMPLETE",
  partial_reason: null,
  redaction: "NONE",
  redaction_reason: null,
  ...changes,
})

const managedExecution = {
  kind: "MANAGED_SIMULATION",
  image_digest: `sha256:${"4".repeat(64)}`,
  dependency_lock_ref: "8".repeat(64),
  runner_version: { name: "ketqat-runner", version: "0.3.0" },
  resource_limits: { max_runtime: 3600, max_memory_bytes: "8589934592", max_credits: 250 },
}

const executionReceipt = {
  job_id: "5c9a1e73-0b62-4d18-9f47-3a80c2e651bd",
  attempt: 1,
  actor: "runner@ketqat.invalid",
  started_at: "2026-01-01T00:00:00.000Z",
  finished_at: "2026-01-01T00:41:30.000Z",
}

const capsuleInput = {
  studyRef: STUDY_REF,
  authorizationRef: "1".repeat(64),
  manifestHash: "2".repeat(64),
  engine: { name: "ketqat-engine", version: "0.3.0" },
  adapter: { name: "stim-pymatching", version: "1.14.0" },
  sourceHash: "3".repeat(64),
  seed: "20260101",
  environment: {
    operating_system: "Linux",
    packages: [{ name: "stim", version: "1.14.0" }],
    hardware: [],
  },
  inputs: [artifactRef()],
  outputs: [
    artifactRef({
      name: "logical-error-rate.json",
      role: "RESULT",
      media_type: "application/json",
      byte_size: "2048",
      content_hash: "6".repeat(64),
      resolution: { kind: "INLINE_IN_BUNDLE", locator: "outputs/logical-error-rate.json" },
    }),
  ],
  logsRef: "7".repeat(64),
  executionClass: "SIMULATION",
  execution: managedExecution,
  executionReceipt,
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
    studySelfHash("execution_capsule", { ...capsule, attestation_level: other }),
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

test("an image digest is recorded in the form a registry accepts, where there is one", () => {
  assert.throws(
    () =>
      buildExecutionCapsule({
        ...capsuleInput,
        execution: { ...managedExecution, image_digest: "4".repeat(64) },
      }),
    /image_digest/,
    "a bare hex digest is not a digest anyone can pull",
  )

  // A managed run is defined by the image this system pinned and pulled, so a
  // null there is not an absence, it is a claim that the run was managed by
  // nothing. A local run may genuinely have had no container, and says so.
  assert.throws(
    () =>
      buildExecutionCapsule({
        ...capsuleInput,
        execution: { ...managedExecution, image_digest: null },
      }),
    /image_digest/,
  )
  const local = buildExecutionCapsule({
    ...capsuleInput,
    executionReceipt: undefined,
    // With no image to pull, the captured environment is the whole of what a
    // second party has, so a local capsule has to name the machine.
    environment: { ...capsuleInput.environment, architecture: "arm64" },
    execution: {
      kind: "LOCAL_SIMULATION",
      image_digest: null,
      attestation_limitation:
        "Run on an operator machine. The installed packages are recorded from the interpreter, not attested.",
    },
  })
  assert.equal(local.execution.image_digest, null)
  assert.equal(verifyExecutionCapsule(local).valid, true)
})

// A seed is digits, and exactly one spelling of each value is a seed.
//
// The field carries an identifier for a pseudo-random stream, not a magnitude,
// and Stim and NumPy hand out 64-bit ones. As a JSON number a seed past 2^53 is
// the nearest double here and the integer as written in Python, so one capsule
// took two digests and nothing on this side could say which of the many seeds
// sharing that double had run. Every spelling refused below is a second way of
// writing a value that already has one, and two spellings of one value are two
// digests for one record.
test("zero is a seed, an unseeded run says null, and a 64-bit seed is ordinary", () => {
  assert.equal(buildExecutionCapsule({ ...capsuleInput, seed: "0" }).seed, "0")
  assert.equal(buildExecutionCapsule({ ...capsuleInput, seed: null }).seed, null)
  assert.equal(
    buildExecutionCapsule({ ...capsuleInput, seed: "18446744073709551615" }).seed,
    "18446744073709551615",
  )
  for (const spelling of ["-0", "007", "+7", "1e3", "1_000", " 7", "7 ", "", "seven"]) {
    assert.throws(
      () => buildExecutionCapsule({ ...capsuleInput, seed: spelling }),
      /seed/,
      `${JSON.stringify(spelling)} must not be a second spelling of a seed`,
    )
  }
  assert.throws(() => buildExecutionCapsule({ ...capsuleInput, seed: 7 }), /seed/, "a number is not a seed")
})

test("a tampered seed is caught, with both hashes named", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const tampered = { ...capsule, seed: "7" }
  const verification = verifyExecutionCapsule(tampered)
  assert.equal(verification.valid, false)
  assert.equal(verification.hash_matches, false)
  assert.equal(verification.actual_hash, capsule.reproducibility_hash)
  assert.equal(verification.expected_hash, studySelfHash("execution_capsule", tampered))
  assert.notEqual(verification.expected_hash, verification.actual_hash)
  assert.equal(verification.problems.length, 1)
})

// One digest cannot mean both "the same computation" and "nobody edited this
// file", because the two want opposite things from a timestamp. Under the
// retired rules the timestamps were dropped by name and the single digest
// answered the first question while `verifyExecutionCapsule` claimed it answered
// the second. Here they are separate digests and each answers its own.
test("when a run happened is receipt evidence, and the two digests differ about it", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  const rerun = buildExecutionCapsule({
    ...capsuleInput,
    executionReceipt: {
      ...executionReceipt,
      attempt: 3,
      started_at: "2027-06-06T00:00:00.000Z",
      finished_at: "2027-06-06T00:41:30.000Z",
    },
    createdAt: "2027-06-06T00:41:31.000Z",
  })

  // Same inputs, same source, same seed, same environment: the same intended
  // computation, whenever it ran.
  assert.equal(
    semanticHash("execution_capsule", rerun),
    semanticHash("execution_capsule", capsule),
    "a rerun of the same capsule describes the same science",
  )

  // And a different file, which is what the capsule's own hash answers for.
  assert.notEqual(rerun.reproducibility_hash, capsule.reproducibility_hash)
  assert.notEqual(
    receiptHash("execution_capsule", rerun),
    receiptHash("execution_capsule", capsule),
    "the server observed two different runs",
  )
  assert.equal(verifyExecutionCapsule(rerun).valid, true, "each file still verifies against itself")
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
  const selfHash = verifyStudySelfHash("execution_capsule", capsule)
  assert.equal(selfHash.valid, true)
  // Which field carries the self-hash, and which of the four digests it is, are
  // declared per kind rather than guessed at by a verifier that accepted either
  // name. A capsule that also carried a `content_hash` is now an undeclared key
  // rather than an ambiguity to resolve by precedence.
  assert.equal(selfHash.self_hash_field, "reproducibility_hash")
  assert.equal(selfHash.purpose, "record")
  assert.throws(
    () => studySelfHash("execution_capsule", { ...capsule, content_hash: capsule.reproducibility_hash }),
    (error) => error.code === "UNDECLARED_FIELD" && error.path === "content_hash",
  )
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
  const editedHash = studySelfHash("execution_capsule", edited)
  assert.notEqual(editedHash, built.reproducibility_hash, "an environment entry is content")

  const stale = verifyExecutionCapsule(edited)
  assert.equal(stale.valid, false, "the file carries the digest of a record it is not")
  assert.equal(stale.expected_hash, editedHash)

  const honest = verifyExecutionCapsule({ ...edited, reproducibility_hash: editedHash })
  assert.equal(honest.valid, true, honest.problems.join(" "))
  assert.equal(honest.expected_hash, editedHash)
})

// Undeclared keys are refused rather than stripped, in the digest as well as in the parse, and
// the two languages therefore give one answer for one file.
//
// `owner_username` is the case that hid best under the retired rules: it was on the exclusion
// list, so the hash did not move either and nothing objected at all. Zod stripped it, the
// generated JSON Schema said `additionalProperties: false`, and the Python validator refused the
// file this one accepted. Now the projection reads declared fields and refuses the rest, so the
// refusal arrives before the schema is even asked -- which is the order that sends a reader to
// the right place, since "this cannot be hashed" is not "this is the wrong shape".
test("a capsule carrying a key no schema declares is refused, not stripped", () => {
  const capsule = buildExecutionCapsule(capsuleInput)
  for (const undeclared of [{ owner_username: "somebody-else" }, { smuggled: "not declared" }]) {
    const key = Object.keys(undeclared)[0]
    const verification = verifyExecutionCapsule({ ...capsule, ...undeclared })
    assert.equal(verification.valid, false, `${key} must not pass as a capsule`)
    assert.deepEqual(
      verification.refusals.map((refusal) => refusal.code),
      ["STUDY_RECORD_NOT_HASHABLE"],
    )
    assert.match(verification.problems[0], /^UNDECLARED_FIELD: /)
    assert.ok(verification.problems[0].includes(key), verification.problems[0])
    // Reported as a hashing refusal rather than as a mismatch: no digest was taken,
    // so there is nothing to compare the stored one against.
    assert.equal(verification.expected_hash, "")
    // Skipping it would be the collision: this record and the record without the
    // key would take one digest.
    assert.throws(
      () => studySelfHash("execution_capsule", { ...capsule, ...undeclared }),
      (error) => error.code === "UNDECLARED_FIELD" && error.path === key,
    )
    assert.equal(ExecutionCapsuleSchema.safeParse({ ...capsule, ...undeclared }).success, false)
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
  assert.equal(studySelfHash("research_package", pkg), pkg.reproducibility_hash)
  assert.equal(
    studySelfHash("research_package", pkg),
    fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID].study_research_package_as_written.self_hash,
  )
  // And it holds together structurally, which is the half a digest cannot check:
  // its one claim is joined to its evidence by an edge the file carries, and its
  // one table cell reads a node that has a value. Asserted from Python too, in
  // test_a_package_written_without_its_optional_maps_verifies_here_too.
  //
  // The status is STRUCTURE_VERIFIED rather than anything stronger, and that is
  // the point of the ladder: this package cites no bundle, so no model was
  // re-run, and carries no reproduction record, so nothing says a second party
  // reached the same result. Both of those are reported as false rather than
  // folded into a single verdict that would have read as success.
  const verification = verifyResearchPackage(pkg)
  assert.deepEqual(verification.problems, [])
  assert.equal(verification.status, "STRUCTURE_VERIFIED")
  assert.equal(verification.levels.hash_matches, true)
  assert.equal(verification.levels.claims_resolve, true)
  assert.equal(verification.levels.provenance_closed, true)
  assert.equal(verification.levels.science_recomputed, false)
  assert.equal(verification.levels.independent_reproduction_present, false)
  assert.equal(verification.verification_performed, "INTEGRITY_STRUCTURE_AND_SCIENCE")
})

// An integer above 2**53 is not the same number in the two languages, so the
// fields that carry one do not carry it as a number.
//
// Python emits `str(int)` exactly; JavaScript reads the same JSON as a double. A 64-bit seed --
// what Stim and NumPy hand out, so the ordinary case rather than the pathological one -- came out
// as 13835058055282164000 here and 13835058055282163712 there, from the same bytes, and the two
// digests differed.
//
// Two fixes were tried and both were wrong in the same direction. A `.max()` on `seed` and on
// `resource_limits.max_memory_bytes`, and on nothing else in the family, missed every other
// number. A blanket refusal in the hashing layer caught them all and refused the family's own
// inputs: a 64-bit seed is not a mistake. What replaces both is a contract per field --
// `exact_integer_string` for a seed and a byte count, `finite_float` for a magnitude -- so the
// value is carried as the digits that were written and both languages hash the same bytes.
test("a 64-bit seed and a 64-bit byte count are carried exactly, not rounded", () => {
  const unsafe = 13835058055282163712n
  assert.notEqual(
    String(Number(unsafe)),
    unsafe.toString(),
    "as a double this is already not the number that was written",
  )

  const capsule = buildExecutionCapsule({
    ...capsuleInput,
    seed: unsafe.toString(),
    resourceLimits: { max_runtime: null, max_memory_bytes: "18446744073709551615", max_credits: null },
  })
  assert.equal(capsule.seed, "13835058055282163712")
  assert.equal(verifyExecutionCapsule(capsule).valid, true)

  // The property the number form could not hold: two values that share one double
  // are two records here, because the digest is over the digits.
  const neighbour = { ...capsule, seed: (unsafe + 1n).toString() }
  assert.equal(Number(unsafe), Number(unsafe + 1n), "one double, two integers")
  assert.notEqual(
    studySelfHash("execution_capsule", neighbour),
    capsule.reproducibility_hash,
    "one double stands for both, and the digest must not",
  )

  // `exactIntegerStringFromBigInt` is the sanctioned crossing, and a BigInt that
  // reached JSON would be refused by name rather than converted on the caller's behalf.
  assert.equal(exactIntegerStringFromBigInt(unsafe), "13835058055282163712")
  assert.throws(
    () => studySelfHash("execution_capsule", { ...capsule, seed: unsafe }),
    (error) => error.code === "NOT_JSON_BIGINT",
  )
})

// The half of the same finding that no enumeration reached: `Quantity.value` is every number a
// study reports, and it was unguarded.
//
// Near 4.2e21 one double stands for 524287 distinct integers, so two evidence nodes reporting
// figures 524286 apart took one content hash, one package digest, and `valid: true` with no
// problems -- while every row, edge and claim-map entry went on resolving, because the node's
// identity had not moved either. Python, holding the integers as written, computed two different
// digests and matched neither.
//
// A measurement is a `finite_float`, so the ambiguity is real for this field and cannot be
// designed away by a contract: 4.2e21 is one double however it was spelled. What closes it is
// the byte-level reader -- `readStudyFileBytes` refuses an integer *literal* outside +/-2^53,
// which is a fact about the file that this language has thrown away by the time it holds a
// number. The refusal is where the information still exists.
test("an integer literal JavaScript cannot hold exactly is refused when the file is read", () => {
  // The widest such pair: the lowest and highest integers this one double stands for.
  const LOW = 4199999999999999737857n
  const HIGH = 4200000000000000262143n
  assert.equal(Number(LOW), Number(HIGH), "one double, two integers 524286 apart")

  const nodeText = (literal) =>
    `{"schema_version":"1.0","hash_rules_id":"study-v1","study_ref":"${STUDY_REF}","kind":"quantity",` +
    `"label":"total physical-qubit-seconds","claim":null,"quantity":{"value":${literal},` +
    `"unit":"qubit_seconds","bound":"UPPER_BOUND","evidence":"MODELLED","source":"s","model":"m",` +
    `"model_version":"1","assumptions":[],"schema_version":"0.1","limitations":[]},"reference":null,` +
    `"citation":null,"limitations":[],"source_published_on":null,"retrieved_on":null}`

  for (const literal of [LOW.toString(), HIGH.toString()]) {
    assert.throws(
      () => readStudyFileBytes(new TextEncoder().encode(nodeText(literal))),
      (error) => error.code === "UNSAFE_INTEGER",
      `${literal} must not be read into a double that stands for another value too`,
    )
  }

  // The bound is inclusive, and it is about integer literals: the last integer both languages
  // hold exactly is read, and so is a non-integral literal of any magnitude, because Python reads
  // that as a float exactly as JavaScript does.
  for (const literal of [String(Number.MAX_SAFE_INTEGER), "1.5e-9", "4.2e21"]) {
    const { value } = readStudyFileBytes(new TextEncoder().encode(nodeText(literal)))
    assert.equal(typeof studySelfHash("evidence_node", value), "string")
  }
})

// A byte sequence neither language can round-trip cannot be hashed identically in both.
//
// A lone `\ud800` in a node label is legal in a JavaScript string and legal in JSON. This side
// escaped it and hashed the escape; Python held the same lone surrogate and could not encode it
// as UTF-8 at all, so the recipient could not check the file. RFC 8785 §3.2.2.2 requires a
// compliant implementation to terminate on one, which is what both now do.
test("a string carrying an unpaired UTF-16 surrogate is refused rather than hashed here alone", () => {
  const withLabel = (label) => ({
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: STUDY_REF,
    kind: "quantity",
    label,
    claim: null,
    quantity: null,
    reference: null,
    citation: null,
    limitations: [],
    source_published_on: null,
    retrieved_on: null,
  })

  for (const half of ["\uD800", "total qubits \uD800", "\uDC00 total qubits"]) {
    assert.throws(
      () => studySelfHash("evidence_node", withLabel(half)),
      (error) => error.code === "LONE_SURROGATE",
    )
  }

  // A well-formed pair is one character and hashes normally. Refusing it would be refusing an
  // emoji, which is not what either language struggles with.
  assert.equal(typeof studySelfHash("evidence_node", withLabel("total qubits \uD83D\uDE00")), "string")
})

test("the pinned 64-bit capsule verifies, and is recomputed from the same file in Python", () => {
  const pinned = fixture("study-capsule-64-bit-integers.json")
  assert.equal(pinned.seed, "18446744073709551615")
  assert.equal(pinned.execution.resource_limits.max_memory_bytes, "9223372036854775807")
  assert.equal(pinned.outputs[0].byte_size, "9007199254740993")
  // All three are past 2^53, which is the point: under the retired rules this
  // file was the one the family refused to write. The third is an artifact's
  // byte count, which is where the problem is least avoidable -- a measurement
  // dump outgrows a double as a matter of course.
  for (const digits of [
    pinned.seed,
    pinned.execution.resource_limits.max_memory_bytes,
    pinned.outputs[0].byte_size,
  ]) {
    assert.ok(BigInt(digits) > BigInt(Number.MAX_SAFE_INTEGER), digits)
  }
  assert.equal(verifyExecutionCapsule(pinned).valid, true)
  assert.equal(
    studySelfHash("execution_capsule", pinned),
    fixture("study-expected-hashes.json")[STUDY_HASH_RULES_ID].study_capsule_64_bit_integers.self_hash,
  )
})
