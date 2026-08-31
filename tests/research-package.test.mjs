import assert from "node:assert/strict"
import test from "node:test"
import {
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  STUDY_SCHEMA_VERSION,
  calculateStudyHash,
} from "../dist/study/index.js"
import { EvidenceEdgeSchema, EvidenceNodeSchema } from "../dist/study/evidence.js"
import {
  ResearchPackageSchema,
  buildResearchPackage,
  verifyResearchPackage,
} from "../dist/study/research-package.js"

/**
 * Tests for the research package export (ketqat-sdk#259, WP4).
 *
 * One property is on trial, from both ends. Going out, a number cannot leave the
 * building without a node under it: every refusal below is the same rule seen
 * from a different table, and the export returns refusals rather than a package
 * with a caveat, because a caveat and a number travel separately the moment
 * either is copied.
 *
 * Coming in, a recipient holding only the file has to be able to tell a study
 * from a story. Editing a figure breaks the package hash; editing it and
 * re-hashing everything that mentions it does not -- so the structural checks
 * are what catch the second case, and the two are reported apart so a reader
 * knows whether they are looking at a corrupted file or at a fabricated one.
 *
 * Refusals are asserted by code throughout. A test that matched the message text
 * would break the day somebody improved the wording, which is the day it would
 * be least welcome.
 */

const STUDY_REF = "da5370a68b65fae82f578c06f313afac786e0b5e9d3caf543b1e37319d9720d9"
const PLAN_REF = { revision_hash: "c".repeat(64), revision: 2 }
const ABSENT_HASH = "9".repeat(64)
const MODEL = "ketqat-resource-intelligence"

const codesOf = (refusals) => refusals.map((refusal) => refusal.code)

const knownQuantity = (value = 4200000) => ({
  value,
  unit: "physical qubits",
  bound: "UPPER_BOUND",
  evidence: "MODELLED",
  source: "Resource estimate under the base scenario.",
  model: MODEL,
  model_version: "0.1.0",
  assumptions: ["Physical error rate 0.001."],
  schema_version: "0.1",
  limitations: ["Modelled, not measured. No device was run."],
})

const unknownQuantity = () => ({
  value: null,
  unit: "physical qubits",
  bound: "POINT",
  evidence: "UNKNOWN",
  source: "Not computed.",
  model: MODEL,
  model_version: "0.1.0",
  assumptions: [],
  schema_version: "0.1",
  limitations: ["No estimate was produced at this problem size."],
})

const nodeBody = (changes = {}) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_ref: STUDY_REF,
  kind: "quantity",
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
  to_node_hash: "b".repeat(64),
  asserted_by: MODEL,
  rationale: "The bound is read from the estimate rather than restated.",
  ...changes,
})

// A node's identity is the hash of its content, so a usable node is stamped
// rather than invented. `content_hash` is excluded from the digest, which is
// what makes stamping it afterwards non-circular.
const stampNode = (body) => EvidenceNodeSchema.parse({ ...body, content_hash: calculateStudyHash(body) })
const stampEdge = (body) => EvidenceEdgeSchema.parse({ ...body, content_hash: calculateStudyHash(body) })

const claimNode = stampNode(
  nodeBody({
    kind: "claim",
    label: "Shor-2048 fits within 4.2 million physical qubits under the base scenario",
    claim: {
      subject: "shor-2048",
      metric: "total_physical_qubits",
      comparator: "AT_MOST",
      value: knownQuantity(),
    },
  }),
)

const quantityNode = stampNode(
  nodeBody({ kind: "quantity", label: "Total physical qubits, base scenario", quantity: knownQuantity() }),
)

const resultNode = stampNode(
  nodeBody({
    kind: "result",
    label: "Resource estimate snapshot, base scenario",
    reference: { record_kind: "resource_estimate_snapshot", hash: "e".repeat(64), record_slug: null },
  }),
)

const inputNode = stampNode(
  nodeBody({
    kind: "input",
    label: "Physical error rate 0.001",
    reference: { record_kind: "resource_scenario", hash: null, record_slug: "base-scenario" },
  }),
)

const supportsEdge = stampEdge(
  edgeBody({
    kind: "supports",
    from_node_hash: quantityNode.content_hash,
    to_node_hash: claimNode.content_hash,
    rationale: "The claimed ceiling is the estimate's own upper bound, not a rounding of it.",
  }),
)

const derivedEdge = stampEdge(
  edgeBody({
    kind: "derived_from",
    from_node_hash: quantityNode.content_hash,
    to_node_hash: resultNode.content_hash,
    rationale: "The qubit count is read out of the estimate snapshot.",
  }),
)

const usedInputEdge = stampEdge(
  edgeBody({
    kind: "used_input",
    from_node_hash: resultNode.content_hash,
    to_node_hash: inputNode.content_hash,
    rationale: "The snapshot was computed under this scenario's physical error rate.",
  }),
)

const packageInput = (changes = {}) => ({
  studyRef: STUDY_REF,
  planRef: PLAN_REF,
  reportMarkdown: "# Shor-2048 feasibility\n\nOne claim, and the numbers it rests on.",
  methods: "Surface-code resource estimation under the base scenario, as pinned by the confirmed plan.",
  assumptionRows: [{ label: "Physical error rate", node_hash: inputNode.content_hash }],
  resultRows: [{ label: "Total physical qubits", node_hash: quantityNode.content_hash }],
  csv: "label,node_hash\nTotal physical qubits," + quantityNode.content_hash + "\n",
  figures: [{ label: "Physical qubits by code distance", svg: "<svg viewBox='0 0 1 1'></svg>" }],
  // Deliberately written without an author list: `CitationSchema` fills one in,
  // and the builder has to normalise before it hashes or the package would fail
  // its own verifier the moment the final parse added the empty array.
  references: [{ title: "Surface codes: towards practical large-scale quantum computation", year: 2012 }],
  bundleRefs: ["f".repeat(64)],
  environment: { operating_system: "linux", architecture: "arm64", packages: {}, hardware: {} },
  reproductionCommand: "ketqat-engine study verify <this-file>",
  nodes: [claimNode, quantityNode, resultNode, inputNode],
  edges: [supportsEdge, derivedEdge, usedInputEdge],
  claimEvidenceMap: [
    {
      claim_node_hash: claimNode.content_hash,
      evidence_node_hashes: [quantityNode.content_hash, resultNode.content_hash],
      edge_hashes: [supportsEdge.content_hash],
    },
  ],
  limitations: ["Modelled, not measured. No device was run."],
  isDemo: true,
  ...changes,
})

const buildOrThrow = (changes = {}) => {
  const built = buildResearchPackage(packageInput(changes))
  assert.equal(built.ok, true, `the package was refused: ${built.ok ? "" : codesOf(built.refusals).join(", ")}`)
  return built.package
}

const clone = (value) => JSON.parse(JSON.stringify(value))

// ------------------------------------------------------------ claim resolution

test("a package whose rows, claims and edges all resolve is built and verifies", () => {
  const pkg = buildOrThrow()

  assert.equal(pkg.package_kind, "KETQAT_RESEARCH_PACKAGE")
  assert.equal(pkg.hash_rules_id, STUDY_HASH_RULES_ID)
  assert.equal(pkg.schema_version, STUDY_SCHEMA_VERSION)
  // The graph travels with the report; a recipient resolves the rows from the
  // file rather than from a store they were never given.
  assert.equal(pkg.nodes.length, 4)
  assert.equal(pkg.edges.length, 3)
  assert.equal(pkg.result_rows[0].node_hash, quantityNode.content_hash)

  const verification = verifyResearchPackage(pkg)
  assert.deepEqual(verification.problems, [])
  assert.equal(verification.valid, true)
  assert.equal(verification.hash_matches, true)
  assert.equal(verification.claims_resolve, true)
  assert.equal(verification.graph_valid, true)
  assert.equal(verification.expected_hash, pkg.reproducibility_hash)
  assert.equal(verification.actual_hash, pkg.reproducibility_hash)
})

test("every claim node's map entry resolves to nodes and edges the package carries", () => {
  const pkg = buildOrThrow()
  const nodeHashes = new Set(pkg.nodes.map((node) => node.content_hash))
  const edgeHashes = new Set(pkg.edges.map((edge) => edge.content_hash))

  for (const claim of pkg.nodes.filter((node) => node.kind === "claim")) {
    const entry = pkg.claim_evidence_map.find((row) => row.claim_node_hash === claim.content_hash)
    assert.ok(entry, `claim '${claim.label}' must appear in the claim evidence map`)
    assert.ok(entry.evidence_node_hashes.length >= 1)
    for (const hash of entry.evidence_node_hashes) assert.ok(nodeHashes.has(hash))
    for (const hash of entry.edge_hashes) assert.ok(edgeHashes.has(hash))
  }
})

// --------------------------------------------------- the export refuses, not warns

test("a result row naming a node the package does not carry is refused", () => {
  const built = buildResearchPackage(
    packageInput({ resultRows: [{ label: "Total physical qubits", node_hash: ABSENT_HASH }] }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("EVIDENCE_NODE_UNRESOLVED"))
  // No package at all, rather than a package with the row quietly dropped: an
  // export missing a row reads to a recipient exactly like one that never had it.
  assert.equal(built.package, undefined)
})

test("an assumption row naming a node the package does not carry is refused the same way", () => {
  const built = buildResearchPackage(
    packageInput({ assumptionRows: [{ label: "Physical error rate", node_hash: ABSENT_HASH }] }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("EVIDENCE_NODE_UNRESOLVED"))
})

test("a claim node absent from the claim evidence map is refused", () => {
  const built = buildResearchPackage(packageInput({ claimEvidenceMap: [] }))

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("CLAIM_WITHOUT_EVIDENCE_NODE"))
})

test("a claim mapped to an empty evidence list is refused as a claim with nothing behind it", () => {
  const built = buildResearchPackage(
    packageInput({
      claimEvidenceMap: [
        { claim_node_hash: claimNode.content_hash, evidence_node_hashes: [], edge_hashes: [] },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("CLAIM_WITHOUT_EVIDENCE_NODE"))
})

test("a claim map naming evidence the package does not carry is refused", () => {
  const built = buildResearchPackage(
    packageInput({
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [ABSENT_HASH],
          edge_hashes: [supportsEdge.content_hash],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("EVIDENCE_NODE_UNRESOLVED"))
})

test("an edge whose endpoint is not in the graph is refused", () => {
  const dangling = stampEdge(
    edgeBody({
      kind: "reviewed_by",
      from_node_hash: claimNode.content_hash,
      to_node_hash: ABSENT_HASH,
      rationale: "Reviewed by a node this package forgot to carry.",
    }),
  )
  const built = buildResearchPackage(
    packageInput({ edges: [supportsEdge, derivedEdge, usedInputEdge, dangling] }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("EVIDENCE_EDGE_ENDPOINT_UNRESOLVED"))
})

test("a claim map citing an edge the package does not carry is refused", () => {
  const built = buildResearchPackage(
    packageInput({
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [quantityNode.content_hash],
          edge_hashes: [ABSENT_HASH],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("EVIDENCE_EDGE_ENDPOINT_UNRESOLVED"))
})

test("a claim asserting an unknown value is refused rather than thrown", () => {
  // Assembled without the node schema on purpose: the schema refuses an unknown
  // claim by throwing, and the export owes its caller a refusal it can read
  // beside the others instead of an exception it has to catch.
  const body = nodeBody({
    kind: "claim",
    label: "Shor-2048 fits within an unknown number of physical qubits",
    claim: {
      subject: "shor-2048",
      metric: "total_physical_qubits",
      comparator: "AT_MOST",
      value: unknownQuantity(),
    },
  })
  const unknownClaimNode = { ...body, content_hash: calculateStudyHash(body) }

  const built = buildResearchPackage(
    packageInput({
      nodes: [unknownClaimNode, quantityNode, resultNode, inputNode],
      edges: [],
      claimEvidenceMap: [
        {
          claim_node_hash: unknownClaimNode.content_hash,
          evidence_node_hashes: [quantityNode.content_hash],
          edge_hashes: [],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.refusals), ["CLAIM_VALUE_UNKNOWN"])
})

// ------------------------------------------------- tampered-study detection

test("an edited package fails its hash check", () => {
  const tampered = clone(buildOrThrow())
  const edited = tampered.nodes.find((node) => node.kind === "quantity")
  edited.quantity.value = 42

  const verification = verifyResearchPackage(tampered)

  assert.equal(verification.hash_matches, false)
  assert.equal(verification.valid, false)
  assert.equal(verification.actual_hash, tampered.reproducibility_hash)
  assert.notEqual(verification.expected_hash, tampered.reproducibility_hash)
})

test("an edited and re-hashed package fails structurally, not cryptographically", () => {
  const tampered = clone(buildOrThrow())
  const edited = tampered.nodes.find((node) => node.kind === "quantity")
  edited.quantity.value = 42
  // The fabrication a hash check alone cannot see: re-stamp the node and then
  // the package, so every digest in the file agrees with its own contents.
  edited.content_hash = calculateStudyHash(edited)
  tampered.reproducibility_hash = calculateStudyHash(tampered)

  const verification = verifyResearchPackage(tampered)

  // Cryptographically the file is now beyond reproach.
  assert.equal(verification.hash_matches, true)
  // Structurally it has fallen apart: the node's identity moved, so the result
  // row, the supporting edges and the claim map all name something that is no
  // longer in the package.
  assert.equal(verification.claims_resolve, false)
  assert.equal(verification.graph_valid, false)
  assert.equal(verification.valid, false)
  assert.ok(verification.problems.some((problem) => problem.includes("EVIDENCE_NODE_UNRESOLVED")))
})

test("a re-hashed node alone breaks the rows that named it", () => {
  const tampered = clone(buildOrThrow())
  const edited = tampered.nodes.find((node) => node.kind === "quantity")
  edited.quantity.value = 42
  edited.content_hash = calculateStudyHash(edited)
  tampered.reproducibility_hash = calculateStudyHash(tampered)

  const rowHashes = new Set(tampered.nodes.map((node) => node.content_hash))
  assert.equal(rowHashes.has(tampered.result_rows[0].node_hash), false)
})

// ------------------------------------------------------------ recorded, not omitted

test("failed checks are carried through the build rather than dropped", () => {
  const failedChecks = [
    "Independent reproduction of the base-scenario estimate was not attempted.",
    "No measured classical baseline was available at this problem size.",
  ]
  const pkg = buildOrThrow({ failedChecks })

  assert.deepEqual(pkg.failed_checks, failedChecks)
  // A package that records its failures still verifies: recording them is the
  // honest outcome, not a defect in the export.
  assert.equal(verifyResearchPackage(pkg).valid, true)
})

test("a package with no failed checks says so with an empty list, not an absent field", () => {
  const pkg = buildOrThrow()
  assert.deepEqual(pkg.failed_checks, [])
  assert.ok(Object.prototype.hasOwnProperty.call(pkg, "failed_checks"))
})

// ------------------------------------------------------------------ round trip

test("the package round-trips through JSON and keeps its schema and interface in step", () => {
  const pkg = buildOrThrow({ createdAt: "2026-01-01T00:00:00.000Z" })
  const roundTripped = ResearchPackageSchema.parse(clone(pkg))

  assert.deepEqual(roundTripped, pkg)
  assert.equal(verifyResearchPackage(roundTripped).valid, true)

  // The field list is asserted rather than inferred, so a field added to the
  // hand-written interface and forgotten in the schema -- or the reverse -- is a
  // failing test rather than a key that silently never survives a parse.
  assert.deepEqual(Object.keys(roundTripped).sort(), [
    "assumption_rows",
    "bundle_refs",
    "claim_evidence_map",
    "created_at",
    "csv",
    "edges",
    "environment",
    "failed_checks",
    "figures",
    "hash_rules_id",
    "is_demo",
    "limitations",
    "methods",
    "nodes",
    "package_kind",
    "plan_ref",
    "references",
    "report_markdown",
    "reproducibility_hash",
    "reproduction_command",
    "result_rows",
    "schema_version",
    "study_ref",
  ])
})

test("a timestamp is recorded but never hashed", () => {
  const withoutTimestamp = buildOrThrow()
  const withTimestamp = buildOrThrow({ createdAt: "2026-06-30T12:00:00.000Z" })

  assert.equal(withTimestamp.created_at, "2026-06-30T12:00:00.000Z")
  assert.equal(withTimestamp.reproducibility_hash, withoutTimestamp.reproducibility_hash)
})

test("a candidate that is not a research package is refused with named problems", () => {
  const verification = verifyResearchPackage({ package_kind: "NOT_A_PACKAGE" })

  assert.equal(verification.valid, false)
  assert.equal(verification.hash_matches, false)
  assert.equal(verification.claims_resolve, false)
  assert.equal(verification.graph_valid, false)
  assert.ok(verification.problems.length > 0)
})
