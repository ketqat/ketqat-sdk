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

// The claim map cites the snapshot as well as the number, so the graph has to
// carry an edge saying the snapshot supports the claim. `derived_from` below is
// provenance -- where the number came from -- and provenance is not support.
const resultSupportsEdge = stampEdge(
  edgeBody({
    kind: "supports",
    from_node_hash: resultNode.content_hash,
    to_node_hash: claimNode.content_hash,
    rationale: "The claimed ceiling is read out of this estimate snapshot, which is the run that produced it.",
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
  // The author list is written down rather than defaulted. `StudyCitationSchema` requires it
  // where the shared `CitationSchema` fills one in, because a container the parser materialises
  // is a container the file does not contain -- and that was the last split left between what
  // this builder hashed and what a verifier reading the file hashes.
  references: [
    {
      title: "Surface codes: towards practical large-scale quantum computation",
      authors: [],
      year: 2012,
    },
  ],
  bundleRefs: ["f".repeat(64)],
  environment: { operating_system: "linux", architecture: "arm64", packages: [], hardware: [] },
  reproductionCommand: "ketqat-engine study verify <this-file>",
  nodes: [claimNode, quantityNode, resultNode, inputNode],
  edges: [supportsEdge, resultSupportsEdge, derivedEdge, usedInputEdge],
  claimEvidenceMap: [
    {
      claim_node_hash: claimNode.content_hash,
      evidence_node_hashes: [quantityNode.content_hash, resultNode.content_hash],
      edge_hashes: [supportsEdge.content_hash, resultSupportsEdge.content_hash],
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
  assert.equal(pkg.edges.length, 4)
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
    packageInput({ edges: [supportsEdge, resultSupportsEdge, derivedEdge, usedInputEdge, dangling] }),
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

// ------------------------------------------- the map is checked against the graph

// Resolution was the weaker half of this check, and these are the three packages
// that got through it. Every hash in them resolves; what none of them has is a
// graph that says the evidence bears on the claim. The relation lives on an
// edge, with a rationale and an asserter on it, and an entry the edges do not
// corroborate is the map and the graph disagreeing -- which the module docstring
// calls a finding rather than a rounding error.

test("a claim citing itself as its own evidence is refused", () => {
  const selfCiting = packageInput({
    edges: [],
    claimEvidenceMap: [
      {
        claim_node_hash: claimNode.content_hash,
        evidence_node_hashes: [claimNode.content_hash],
        edge_hashes: [],
      },
    ],
  })
  const built = buildResearchPackage(selfCiting)

  assert.equal(built.ok, false)
  const codes = codesOf(built.refusals)
  assert.ok(codes.includes("CLAIM_EVIDENCE_SELF_REFERENTIAL"))
  // Nothing supports it in the graph either, and the entry cites no edge at all.
  // Three findings rather than one, because they take three different fixes.
  assert.ok(codes.includes("CLAIM_WITHOUT_EVIDENCE_NODE"))
  assert.ok(codes.includes("CLAIM_EVIDENCE_UNLINKED"))
})

test("a claim citing a node no edge joins to it is refused", () => {
  const unrelated = stampNode(
    nodeBody({ kind: "quantity", label: "An unrelated number nobody wired up", quantity: knownQuantity(17) }),
  )
  const built = buildResearchPackage(
    packageInput({
      nodes: [claimNode, quantityNode, resultNode, inputNode, unrelated],
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [unrelated.content_hash],
          edge_hashes: [supportsEdge.content_hash],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("CLAIM_EVIDENCE_UNLINKED"))
})

test("provenance is not support: a derived_from chain does not join evidence to a claim", () => {
  // The snapshot really is behind the number, and `derived_from` says where the
  // number came from. It does not say anyone claims the snapshot backs the
  // sentence -- that is a separate assertion, with its own rationale and its own
  // asserter, and this is the package that leaves it unmade.
  const built = buildResearchPackage(packageInput({ edges: [supportsEdge, derivedEdge, usedInputEdge] }))

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("CLAIM_EVIDENCE_UNLINKED"))
})

test("a claim map citing evidence and no edge at all is refused", () => {
  const built = buildResearchPackage(
    packageInput({
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [quantityNode.content_hash],
          edge_hashes: [],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.refusals).includes("CLAIM_EVIDENCE_UNLINKED"))
})

test("evidence that argues with a claim is joined by a contradicts edge, read either way round", () => {
  // Support is directional and contradiction is not, so both orientations are
  // accepted here: an objection written from the claim towards the objecting
  // node is the same objection, and a reader who saw it only when somebody wrote
  // it the other way round would be shown a filtered disagreement.
  const objection = stampNode(
    nodeBody({ kind: "quantity", label: "A second estimate that disagrees", quantity: knownQuantity(9100000) }),
  )
  for (const [from, to] of [
    [objection.content_hash, claimNode.content_hash],
    [claimNode.content_hash, objection.content_hash],
  ]) {
    const contradicts = stampEdge(
      edgeBody({
        kind: "contradicts",
        from_node_hash: from,
        to_node_hash: to,
        rationale: "A second estimate under the same scenario lands well above the claimed ceiling.",
      }),
    )
    const built = buildResearchPackage(
      packageInput({
        nodes: [claimNode, quantityNode, resultNode, inputNode, objection],
        edges: [supportsEdge, resultSupportsEdge, derivedEdge, usedInputEdge, contradicts],
        claimEvidenceMap: [
          {
            claim_node_hash: claimNode.content_hash,
            evidence_node_hashes: [quantityNode.content_hash, resultNode.content_hash, objection.content_hash],
            edge_hashes: [supportsEdge.content_hash, resultSupportsEdge.content_hash, contradicts.content_hash],
          },
        ],
      }),
    )
    assert.equal(built.ok, true, built.ok ? "" : codesOf(built.refusals).join(", "))
  }
})

test("a result row naming a node that carries no value is refused", () => {
  // The claim node is the tempting one: it holds a number, inside a sentence.
  // A table row reading from it would print the assertion as a measurement.
  const built = buildResearchPackage(
    packageInput({ resultRows: [{ label: "Total physical qubits", node_hash: claimNode.content_hash }] }),
  )

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.refusals), ["RESULT_ROW_WITHOUT_VALUE"])

  // An assumption row may name a node of any kind: an assumption is a stated
  // input, not a number read out of one.
  assert.equal(
    buildResearchPackage(packageInput({ assumptionRows: [{ label: "Base scenario", node_hash: inputNode.content_hash }] }))
      .ok,
    true,
  )
})

test("the verifier makes the same checks as the builder, on a package the builder never wrote", () => {
  // A recipient is who the checks are for. This package was assembled by
  // something other than `buildResearchPackage` -- by hand here, by an older
  // build or a different service in the field -- and it is cryptographically
  // perfect: every node is its own hash, and the package's digest is its own
  // contents. What it has lost is the edge that carried the relation.
  const forged = clone(buildOrThrow())
  forged.edges = forged.edges.filter((edge) => edge.kind !== "supports")
  forged.claim_evidence_map[0].edge_hashes = []
  forged.reproducibility_hash = calculateStudyHash(forged)

  const verification = verifyResearchPackage(forged)

  assert.equal(verification.hash_matches, true)
  assert.equal(verification.claims_resolve, false)
  assert.equal(verification.valid, false)
  const codes = new Set(verification.problems.map((problem) => problem.split(" (")[0]))
  assert.ok(codes.has("CLAIM_WITHOUT_EVIDENCE_NODE"))
  assert.ok(codes.has("CLAIM_EVIDENCE_UNLINKED"))
})

test("a self-citing package is refused by the verifier too, not only by the builder", () => {
  const forged = clone(buildOrThrow())
  forged.claim_evidence_map = [
    {
      claim_node_hash: claimNode.content_hash,
      evidence_node_hashes: [claimNode.content_hash],
      edge_hashes: [supportsEdge.content_hash],
    },
  ]
  forged.reproducibility_hash = calculateStudyHash(forged)

  const verification = verifyResearchPackage(forged)

  assert.equal(verification.hash_matches, true)
  assert.equal(verification.valid, false)
  assert.ok(
    verification.problems.some((problem) => problem.startsWith("CLAIM_EVIDENCE_SELF_REFERENTIAL")),
  )
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

// A package's digest is over the file, and there is no longer a second reading of the file.
//
// `CitationSchema.authors` carries `.default([])`, and that was the last default any study record
// hashed. The two halves of this module disagreed because of it: `buildResearchPackage` parsed
// its inputs and then hashed, so it hashed a list the caller never wrote, while
// `verifyResearchPackage` hashed what it read. One logical citation therefore had two content
// addresses depending on which side of the parse you stood, and `verify_research_package` in
// Python -- which fills in nothing at all -- agreed with whichever of them had happened to write
// the file. `StudyCitationSchema` requires the list instead, so the build path and the verify
// path address one record.
test("one record has one digest through the build path and the verify path alike", () => {
  const pkg = buildOrThrow()
  assert.deepEqual(pkg.references[0].authors, [], "the builder writes what it hashed")
  assert.deepEqual(pkg.environment.packages, [])

  // The two paths, asked the same question about the same bytes.
  const asWritten = JSON.parse(JSON.stringify(pkg))
  const built = pkg.reproducibility_hash
  const verified = verifyResearchPackage(asWritten)
  assert.equal(verified.expected_hash, built, "the verifier recomputes the digest the builder wrote")
  assert.deepEqual(verified.problems, [])
  assert.equal(verified.valid, true)

  // And parsing the file changes nothing about it, which is the property that makes those two the
  // same digest: no schema in this family materialises a field at parse time any more.
  const parsed = ResearchPackageSchema.parse(asWritten)
  assert.deepEqual(parsed, asWritten, "the parse must not rewrite its own subject")
  assert.equal(calculateStudyHash(parsed), built)

  // A file that omits the list is refused rather than filled in. Previously it parsed, gained an
  // empty array nobody wrote, and was reported valid against a digest of a record it was not.
  const omitted = clone(pkg)
  delete omitted.references[0].authors
  assert.equal(ResearchPackageSchema.safeParse(omitted).success, false)
  const stale = verifyResearchPackage(omitted)
  assert.equal(stale.valid, false)
  assert.equal(
    stale.problems.some((problem) => problem.includes("references.0.authors")),
    true,
    stale.problems.join(" "),
  )
})

// An environment recording a dependency named `id` was dropped before hashing, and two packages
// differing only there were content-addressed identically. The map that made that possible is
// gone -- `StudyEnvironment` puts the dependency name in a declared field -- so the shape is now
// refused by the schema rather than by the hashing walk, which is a refusal one level earlier.
test("an environment shaped as a map of run-time keys is no longer a package at all", () => {
  assert.throws(
    () =>
      buildResearchPackage(
        packageInput({ environment: { operating_system: "linux", packages: { id: "1.0.0" }, hardware: {} } }),
      ),
    /Expected array, received object/,
  )
})

// A key hidden inside a `Quantity` envelope, refused twice over.
//
// `Quantity` comes from `src/intelligence` and used to strip what it did not declare, so a key
// named after an exclusion survived the parse and only the hashing walk stopped it; the envelope
// is also an embedded record, whose top level the exclusions deliberately do not bite at. It is
// now read through `StudyQuantitySchema`, which refuses an undeclared key one step earlier -- and
// the hashing walk stays underneath as the backstop, because it is the whole check a caller who
// hand-assembles a dict, or who only has Python, ever runs.
test("a package whose graph hides an excluded key is refused, not hashed", () => {
  const forged = clone(buildOrThrow())
  const node = forged.nodes.find((candidate) => candidate.quantity !== null)
  node.quantity.id = "smuggled"

  const verification = verifyResearchPackage(forged)
  assert.equal(verification.valid, false)
  assert.equal(
    verification.problems.some((problem) => /[Uu]nrecognized key/.test(problem)),
    true,
    verification.problems.join(" "),
  )

  // The backstop, on the same record with no schema in the way: the digest is refused rather than
  // taken over contents the canonicalizer would silently drop.
  assert.throws(
    () => calculateStudyHash(node),
    /quantity\.id/,
    "two nodes differing only there would otherwise be content-addressed identically",
  )
})

// The same key, caught at the build boundary, where the parts a builder passes through
// unvalidated meet the record it assembles. A refusal is the ordinary outcome here, not an
// exception a caller has to catch.
test("a row hiding an excluded key is refused before the package is assembled", () => {
  const built = buildResearchPackage(
    packageInput({
      assumptionRows: [{ label: "Physical error rate", node_hash: inputNode.content_hash, id: "smuggled" }],
    }),
  )
  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.refusals), ["STUDY_EXCLUDED_KEY_NESTED"])
  assert.equal(built.refusals[0].message.includes("assumption_rows[0].id"), true, built.refusals[0].message)
})

// Undeclared keys are refused rather than stripped, so the two languages give one answer for one
// file. Zod's default is to strip, while the generated JSON Schema has always said
// `additionalProperties: false`: a package carrying `owner_username` parsed here, kept its hash --
// the key is excluded from the digest -- and was reported `valid: true, problems: []`, while
// `validate_study_record` in Python raised "Additional properties are not allowed".
test("a package carrying a key no schema declares is refused, not stripped", () => {
  for (const undeclared of [{ owner_username: "somebody-else" }, { smuggled_root_key: "not declared" }]) {
    const verification = verifyResearchPackage({ ...buildOrThrow(), ...undeclared })
    assert.equal(verification.valid, false, `${Object.keys(undeclared)[0]} must not pass as a package`)
    assert.equal(
      verification.problems.some((problem) => /[Uu]nrecognized key/.test(problem)),
      true,
      verification.problems.join(" "),
    )
  }

  // And one level down, in the citation the shared contracts declare: `.strict()` derives a
  // stricter reading for this family without moving the schema every legacy record uses.
  const withStrayCitationKey = clone(buildOrThrow())
  withStrayCitationKey.references[0].publisher = "not a citation field"
  assert.equal(verifyResearchPackage(withStrayCitationKey).valid, false)
})
