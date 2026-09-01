import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  STUDY_SCHEMA_VERSION,
  recordHash,
  semanticHash,
  studySelfHash,
} from "../dist/study/index.js"
import { EvidenceEdgeSchema, EvidenceNodeSchema } from "../dist/study/evidence.js"
import {
  ResearchPackageSchema,
  buildResearchPackage,
  verifyResearchPackage,
} from "../dist/study/research-package.js"
import { renderReportMarkdown } from "../dist/study/report.js"
import { renderTableCsv, renderTableMarkdown, tableCsvArtifact } from "../dist/study/tables.js"
import { indexTableCells, renderFigureSvg, sanitizeStudySvg } from "../dist/study/figures.js"
import { renderRecipeCommand } from "../dist/study/recipe.js"
import { checkLedgerSummary } from "../dist/study/ledger.js"

/**
 * Tests for the research package export (ketqat-sdk#259, WP4; goal §13, §14).
 *
 * One property is on trial, from both ends. Going out, a number cannot leave the
 * building without a node under it -- and "the building" now means every surface
 * a reader quotes from, not just the tables: the report's prose, the CSV that
 * gets forwarded, the figure that gets screenshotted. Every refusal below is the
 * same rule seen from a different surface, and the export returns findings
 * rather than a package with a caveat, because a caveat and a number travel
 * separately the moment either is copied.
 *
 * Coming in, a recipient holding only the file has to be able to tell a study
 * from a story. Editing a figure breaks the package hash; editing it and
 * re-hashing everything that mentions it does not -- so the structural checks
 * catch the second case, and the levels report them apart so a reader knows
 * whether they are looking at a corrupted file or a fabricated one.
 *
 * Findings are asserted by `code` and by `path`. A test that matched the message
 * text would break the day somebody improved the wording, which is the day it
 * would be least welcome -- and the message is deliberately not a contract
 * between the two languages either.
 */

const STUDY_REF = "d5a370a6-8b65-4ae8-8f57-8c06f313afac"
const PLAN_REF = { revision_hash: "c".repeat(64), revision: 2 }
const ABSENT_HASH = "9".repeat(64)
const MODEL = "ketqat-resource-intelligence"

const codesOf = (findings) => findings.map((item) => item.code)
const pathsFor = (findings, code) =>
  findings.filter((item) => item.code === code).map((item) => item.path)

const knownQuantity = (value = 4200000, unit = "physical qubits") => ({
  value,
  unit,
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
  to_node_hash: "b".repeat(64),
  asserted_by: MODEL,
  rationale: "The bound is read from the estimate rather than restated.",
  ...changes,
})

// A node's identity is the hash of its content, so a usable node is stamped
// rather than invented. `content_hash` is `DERIVED` and no purpose reads it,
// which is what makes stamping it afterwards non-circular.
const stampNode = (body) =>
  EvidenceNodeSchema.parse({ ...body, content_hash: studySelfHash("evidence_node", body) })
const stampEdge = (body) =>
  EvidenceEdgeSchema.parse({ ...body, content_hash: studySelfHash("evidence_edge", body) })

const quantityNode = stampNode(
  nodeBody({ kind: "quantity", label: "Total physical qubits, base scenario", quantity: knownQuantity() }),
)

const distanceNode = stampNode(
  nodeBody({ kind: "quantity", label: "Code distance, base scenario", quantity: knownQuantity(21, "code distance") }),
)

// The claim names the node its number lives in rather than carrying a copy of
// it. Two copies of one decision-bearing figure are free to disagree, and the
// copy inside the sentence is the one that gets quoted.
const claimNode = stampNode(
  nodeBody({
    kind: "claim",
    label: "Shor-2048 fits within 4.2 million physical qubits under the base scenario",
    claim: {
      subject_ref: { record_kind: "quantum_workload", hash: null, record_slug: "shor-2048" },
      metric: "total_physical_qubits",
      comparator: "AT_MOST",
      value_ref: { kind: "value_node", node_hash: quantityNode.content_hash, field_path: null },
    },
  }),
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

const distanceDerivedEdge = stampEdge(
  edgeBody({
    kind: "derived_from",
    from_node_hash: distanceNode.content_hash,
    to_node_hash: resultNode.content_hash,
    rationale: "The code distance is read out of the same estimate snapshot.",
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

const segment = (kind, changes = {}) => ({
  kind,
  level: null,
  text: null,
  node_hash: null,
  citation_index: null,
  limitation_index: null,
  table_id: null,
  figure_id: null,
  ...changes,
})

const report = (changes = {}) => ({
  sections: [
    {
      section_id: "findings",
      title: "Findings",
      segments: [
        segment("HEADING", { level: 1, text: "Under the base scenario" }),
        segment("PROSE", { text: "The estimate puts the workload at" }),
        segment("QUANTITY_REF", { node_hash: quantityNode.content_hash }),
        segment("PROSE", { text: "before any allowance for factory idling." }),
        segment("CLAIM_REF", { node_hash: claimNode.content_hash }),
        segment("CITATION_REF", { citation_index: 0 }),
        segment("LIMITATION_REF", { limitation_index: 0 }),
        segment("TABLE_REF", { table_id: "results" }),
        segment("FIGURE_REF", { figure_id: "scaling" }),
      ],
    },
  ],
  commentary: [
    {
      commentary_id: "outlook",
      title: "What we would try next",
      // Unrestricted on purpose: this is where an author writes 4.2 million in
      // words if they want to, and the renderer labels the whole block.
      text: "At a physical error rate of 1e-4 the 4.2 million figure would be an overestimate.",
    },
  ],
  ...changes,
})

const resultsTable = (changes = {}) => ({
  table_id: "results",
  caption: "Resource estimate under the base scenario.",
  role: "RESULTS",
  columns: [
    { column_id: "scenario", header: "Scenario", role: "LABEL", unit: null },
    { column_id: "qubits", header: "Total physical qubits", role: "VALUE", unit: "physical qubits" },
    { column_id: "distance", header: "Code distance", role: "VALUE", unit: "code distance" },
  ],
  rows: [
    {
      row_id: "base",
      cells: [
        { column_id: "scenario", text: "Base", node_hash: null },
        { column_id: "qubits", text: null, node_hash: quantityNode.content_hash },
        { column_id: "distance", text: null, node_hash: distanceNode.content_hash },
      ],
    },
  ],
  ...changes,
})

const scalingFigure = (changes = {}) => ({
  figure_id: "scaling",
  title: "Physical qubits against code distance",
  caption: "One point: the base scenario, drawn from the same nodes the table reads.",
  spec: {
    kind: "SCATTER",
    x_axis: { label: "Code distance", unit: "code distance" },
    y_axis: { label: "Total physical qubits", unit: "physical qubits" },
    series: [
      {
        series_id: "base",
        label: "Base scenario",
        points: [
          {
            x: { kind: "NODE", node_hash: distanceNode.content_hash, table_id: null, row_id: null, column_id: null },
            y: { kind: "TABLE_CELL", node_hash: null, table_id: "results", row_id: "base", column_id: "qubits" },
          },
        ],
      },
    ],
  },
  svg_artifact: null,
  ...changes,
})

const recipe = (changes = {}) => ({
  runner: "ketqat-runner",
  runner_version: "0.3.0",
  container_digest: `sha256:${"a".repeat(64)}`,
  argv: ["study", "reproduce", "--package", "research-package.json"],
  input_refs: [],
  environment_allowlist: ["KETQAT_CACHE_DIR"],
  expected_output_refs: [],
  resource_limits: { max_runtime: 3600, max_memory_bytes: "8589934592", max_credits: null },
  network_policy: "NONE",
  allowed_hosts: [],
  platform: { operating_system: "linux", architecture: "x86_64", minimum_runner_version: null },
  ...changes,
})

const ledgerEntry = (changes = {}) => ({
  check_id: "graph_structure",
  status: "PASS",
  requirement: "REQUIRED",
  tool: { name: "ketqat-sdk", version: "0.3.0" },
  input_refs: [],
  output_ref: null,
  reason: "",
  limitations: ["Structural only: nothing here weighs the evidence."],
  observed_at: "2026-09-01T00:00:00Z",
  ...changes,
})

const packageInput = (changes = {}) => ({
  studyRef: STUDY_REF,
  planRef: PLAN_REF,
  distribution: "ONLINE",
  report: report(),
  tables: [resultsTable()],
  figures: [scalingFigure()],
  // The author list is written down rather than defaulted. `StudyCitationSchema`
  // requires it where the shared `CitationSchema` fills one in, because a
  // container the parser materialises is a container the file does not contain.
  references: [
    {
      title: "Surface codes: towards practical large-scale quantum computation",
      authors: [],
      year: 2012,
    },
  ],
  bundleRefs: [],
  environment: { operating_system: "linux", architecture: "arm64", packages: [], hardware: [] },
  recipe: recipe(),
  nodes: [claimNode, quantityNode, distanceNode, resultNode, inputNode],
  edges: [supportsEdge, resultSupportsEdge, derivedEdge, distanceDerivedEdge, usedInputEdge],
  // The map cites the number and not the snapshot behind it. Citing the snapshot
  // is legitimate and is what the bundle tests below do -- it is evidence that
  // points into a resource intelligence bundle, so an entry naming it has to say
  // which field of which bundle the claim reads.
  claimEvidenceMap: [
    {
      claim_node_hash: claimNode.content_hash,
      evidence_node_hashes: [quantityNode.content_hash],
      edge_hashes: [supportsEdge.content_hash],
      bundle_fields: [],
    },
  ],
  reviews: [],
  reproductions: [],
  checkLedger: [ledgerEntry()],
  limitations: ["Modelled, not measured. No device was run."],
  isDemo: true,
  ...changes,
})

const buildOrThrow = (changes = {}) => {
  const built = buildResearchPackage(packageInput(changes))
  assert.equal(built.ok, true, `the package was refused: ${built.ok ? "" : codesOf(built.findings).join(", ")}`)
  return built.package
}

const clone = (value) => JSON.parse(JSON.stringify(value))

// ------------------------------------------------------------ the happy path

test("a package whose report, tables, figures and claims all resolve is built and verifies", () => {
  const pkg = buildOrThrow()

  assert.equal(pkg.package_kind, "KETQAT_RESEARCH_PACKAGE")
  assert.equal(pkg.hash_rules_id, STUDY_HASH_RULES_ID)
  assert.equal(pkg.schema_version, STUDY_SCHEMA_VERSION)
  // The graph travels with the report; a recipient resolves every cell from the
  // file rather than from a store they were never given.
  assert.equal(pkg.nodes.length, 5)
  assert.equal(pkg.edges.length, 5)
  assert.equal(pkg.tables[0].rows[0].cells[1].node_hash, quantityNode.content_hash)

  const verification = verifyResearchPackage(pkg)
  assert.deepEqual(verification.problems, [])
  assert.equal(verification.expected_hash, pkg.reproducibility_hash)
  assert.equal(verification.actual_hash, pkg.reproducibility_hash)
  assert.equal(verification.status, "STRUCTURE_VERIFIED")
})

test("the twelve levels are reported separately, and the status is derived from them", () => {
  // The whole of goal §13.1: one boolean hides which check passed, and the
  // reader quotes the strongest reading of whichever one they were given.
  const verification = verifyResearchPackage(buildOrThrow())

  assert.deepEqual(Object.keys(verification.levels).sort(), [
    "attestation_level",
    "bundles_resolve",
    "canonicalizable",
    "claims_resolve",
    "graph_structurally_valid",
    "hash_matches",
    "independent_reproduction_present",
    "provenance_closed",
    "record_integrity_valid",
    "review_present",
    "schema_valid",
    "science_recomputed",
  ])
  for (const level of [
    "schema_valid",
    "canonicalizable",
    "hash_matches",
    "record_integrity_valid",
    "graph_structurally_valid",
    "provenance_closed",
    "claims_resolve",
    "bundles_resolve",
  ]) {
    assert.equal(verification.levels[level], true, level)
  }
  // And the three that are false, each for a stated reason rather than folded
  // into a verdict: no bundle was cited, so nothing was recomputed; nobody
  // reproduced it; nobody reviewed it.
  assert.equal(verification.levels.science_recomputed, false)
  assert.equal(verification.levels.independent_reproduction_present, false)
  assert.equal(verification.levels.review_present, false)
  assert.equal(verification.levels.attestation_level, "hash_only")
  assert.equal(verification.status, "STRUCTURE_VERIFIED")

  // ADR 0014's wording rule, discharged in the result rather than in a comment.
  const sentences = verification.not_established.join(" ")
  assert.match(sentences, /Nothing here is signed/)
  assert.match(sentences, /No model was re-run/)
  for (const forbidden of [/\bauthentic\b/i, /scientifically correct/i]) {
    assert.equal(forbidden.test(sentences), false, `${forbidden} must not appear`)
  }
})

test("a review and a matched reproduction move two levels and one rung", () => {
  const observedBody = nodeBody({
    kind: "quantity",
    label: "Total physical qubits, second run",
    quantity: knownQuantity(4200000),
    limitations: ["Re-run under the same capsule."],
  })
  const observedNode = stampNode(observedBody)
  const reviewBody = {
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: STUDY_REF,
    subject_node_hash: quantityNode.content_hash,
    verdict: "ACCEPTED",
    rationale: "The bound is read from a pinned model at a pinned version.",
    reviewer: "reviewer@example.invalid",
  }
  const review = { ...reviewBody, content_hash: studySelfHash("review_record", reviewBody) }
  const reproductionBody = {
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: STUDY_REF,
    original_node_hash: quantityNode.content_hash,
    reproduction_capsule_ref: "d".repeat(64),
    observed_node_hash: observedNode.content_hash,
    outcome: "MATCHED",
    notes: "Same figure, same envelope.",
    asserted_by: "runner@example.invalid",
  }
  const reproduction = {
    ...reproductionBody,
    content_hash: studySelfHash("reproduction_record", reproductionBody),
  }

  const pkg = buildOrThrow({
    nodes: [claimNode, quantityNode, distanceNode, resultNode, inputNode, observedNode],
    reviews: [review],
    reproductions: [reproduction],
  })
  const verification = verifyResearchPackage(pkg)

  assert.equal(verification.levels.review_present, true)
  assert.equal(verification.levels.independent_reproduction_present, true)
  // Still `STRUCTURE_VERIFIED`, because no bundle was recomputed: the ladder is
  // ordered, and a reproduction record does not carry a package past a rung it
  // has not reached.
  assert.equal(verification.status, "STRUCTURE_VERIFIED")
  assert.match(
    verification.not_established.join(" "),
    /Whether the party that ran it was independent/,
    "a record of a match is not a claim of independence",
  )
})

// -------------------------------------- a number cannot reach a verified section

test("a number typed into verified prose is refused; the same number by reference is not", () => {
  // The definition-of-done property, and the one the previous shape could not
  // hold at all: `report_markdown` hashed a sentence and established nothing
  // about the figure inside it.
  const typed = report()
  typed.sections[0].segments[1] = segment("PROSE", {
    text: "The estimate puts the workload at 4.2 million physical qubits.",
  })
  const built = buildResearchPackage(packageInput({ report: typed }))

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.findings), ["VERIFIED_PROSE_NOT_GROUNDED"])
  assert.deepEqual(pathsFor(built.findings, "VERIFIED_PROSE_NOT_GROUNDED"), [
    "$.report.sections[0].segments[1].text",
  ])

  // The same sentence, with the figure read from the node it lives in, is the
  // package that builds -- and the rendered Markdown carries the number.
  const pkg = buildOrThrow()
  const markdown = renderReportMarkdown(pkg.report, {
    nodes: new Map(pkg.nodes.map((node) => [node.content_hash, node])),
    tables: pkg.tables,
    figures: pkg.figures,
    citations: pkg.references,
    limitations: pkg.limitations,
  })
  assert.match(markdown, /4200000 physical qubits/)
  assert.match(markdown, new RegExp(quantityNode.content_hash))
  // And the author's free prose is rendered, under a heading that says what it is.
  assert.match(markdown, /## Unverified commentary/)
  assert.match(markdown, /At a physical error rate of 1e-4/)
})

test("a name carrying digits is prose; a measurement is not", () => {
  // The rule is "a digit inside a name, never a number standing on its own", so
  // a study of Shor-2048 can say so.
  const named = report()
  named.sections[0].segments[3] = segment("PROSE", {
    text: "Shor-2048 under the surface-17 layout, at v1.2 of the model.",
  })
  assert.equal(buildResearchPackage(packageInput({ report: named })).ok, true)

  const titled = report()
  titled.sections[0].title = "Findings at distance 21"
  const built = buildResearchPackage(packageInput({ report: titled }))
  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "VERIFIED_PROSE_NOT_GROUNDED"), [
    "$.report.sections[0].title",
  ])
})

test("a report segment naming a node the package does not carry is refused", () => {
  const dangling = report()
  dangling.sections[0].segments[2] = segment("QUANTITY_REF", { node_hash: ABSENT_HASH })
  const built = buildResearchPackage(packageInput({ report: dangling }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "REPORT_REFERENCE_UNRESOLVED"), [
    "$.report.sections[0].segments[2].node_hash",
  ])
})

test("a quantity segment naming a claim renders an assertion where a number belongs", () => {
  const wrongKind = report()
  wrongKind.sections[0].segments[2] = segment("QUANTITY_REF", { node_hash: claimNode.content_hash })
  const built = buildResearchPackage(packageInput({ report: wrongKind }))

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.findings), ["REPORT_REFERENCE_KIND_MISMATCH"])
})

test("a citation or limitation marker pointing past the end of its list is refused", () => {
  const dangling = report()
  dangling.sections[0].segments[5] = segment("CITATION_REF", { citation_index: 7 })
  dangling.sections[0].segments[6] = segment("LIMITATION_REF", { limitation_index: 7 })
  const built = buildResearchPackage(packageInput({ report: dangling }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "REPORT_REFERENCE_UNRESOLVED"), [
    "$.report.sections[0].segments[5].citation_index",
    "$.report.sections[0].segments[6].limitation_index",
  ])
})

// ------------------------------------------------------------ tables and CSV

test("a table and its CSV are one statement: the file is generated, hashed and comparable", () => {
  const pkg = buildOrThrow()
  const sources = new Map(pkg.nodes.map((node) => [node.content_hash, node]))
  const csv = renderTableCsv(pkg.tables[0], sources)

  // Every value column contributes the number and the node it came from, so the
  // traceability survives the format everyone forwards.
  assert.equal(
    csv,
    "Scenario,Total physical qubits (physical qubits),Total physical qubits node," +
      "Code distance (code distance),Code distance node\n" +
      `Base,4200000,${quantityNode.content_hash},21,${distanceNode.content_hash}\n`,
  )
  assert.deepEqual(
    tableCsvArtifact(pkg.tables[0], sources, STUDY_SCHEMA_VERSION),
    pkg.tables[0].csv_artifact,
  )
  assert.equal(pkg.tables[0].csv_artifact.byte_size, String(new TextEncoder().encode(csv).length))
})

test("a CSV artifact that is not the digest of these rows is refused", () => {
  const tampered = clone(buildOrThrow())
  tampered.tables[0].csv_artifact.content_hash = "b".repeat(64)
  tampered.reproducibility_hash = studySelfHash("research_package", tampered)

  const verification = verifyResearchPackage(tampered)

  assert.equal(verification.levels.hash_matches, true)
  assert.equal(verification.levels.claims_resolve, false)
  assert.deepEqual(pathsFor(verification.findings, "TABLE_CSV_ARTIFACT_MISMATCH"), [
    "$.tables[0].csv_artifact.content_hash",
  ])
})

test("a value cell with no node is refused: a number typed into a table is not a measurement", () => {
  const typed = resultsTable()
  typed.rows[0].cells[1] = { column_id: "qubits", text: "4200000", node_hash: null }
  const built = buildResearchPackage(packageInput({ tables: [typed] }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "TABLE_CELL_WITHOUT_NODE"), [
    "$.tables[0].rows[0].cells[1].node_hash",
  ])
})

test("a value cell naming a node the package does not carry is refused", () => {
  const dangling = resultsTable()
  dangling.rows[0].cells[1].node_hash = ABSENT_HASH
  const built = buildResearchPackage(packageInput({ tables: [dangling] }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "EVIDENCE_NODE_UNRESOLVED"), [
    "$.tables[0].rows[0].cells[1].node_hash",
  ])
})

test("a value cell naming a node that carries no number is refused", () => {
  // The claim node is the tempting one: it holds a number, inside a sentence.
  // A cell reading from it would print the assertion as a measurement.
  const wrong = resultsTable()
  wrong.rows[0].cells[1].node_hash = claimNode.content_hash
  const built = buildResearchPackage(packageInput({ tables: [wrong] }))

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.findings), ["RESULT_ROW_WITHOUT_VALUE"])
})

test("a column claims its cells are comparable, so a unit mismatch is refused", () => {
  const mixed = resultsTable()
  mixed.rows[0].cells[2].node_hash = quantityNode.content_hash
  const built = buildResearchPackage(packageInput({ tables: [mixed] }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "TABLE_SHAPE_MISMATCH"), [
    "$.tables[0].rows[0].cells[2].node_hash",
  ])
})

test("a row missing a declared column is refused rather than rendered as a blank", () => {
  const gappy = resultsTable()
  gappy.rows[0].cells = gappy.rows[0].cells.slice(0, 2)
  const built = buildResearchPackage(packageInput({ tables: [gappy] }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "TABLE_SHAPE_MISMATCH"), ["$.tables[0].rows[0].cells"])
})

// ------------------------------------------------------------------- figures

test("a figure supplied as raw SVG is refused, by name and with a reason", () => {
  const built = buildResearchPackage(
    packageInput({ figures: [{ ...scalingFigure(), svg: "<svg viewBox='0 0 1 1'></svg>" }] }),
  )

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.findings), ["FIGURE_RAW_SVG_REFUSED"])
  assert.deepEqual(pathsFor(built.findings, "FIGURE_RAW_SVG_REFUSED"), ["$.figures[0].svg"])
  assert.equal(built.package, undefined)
})

test("the sanitizer refuses script, foreignObject, external references and handlers", () => {
  const cases = [
    ["<svg><script>fetch('//x')</script></svg>", "SVG_SCRIPT_REFUSED"],
    ["<svg><a href=\"javascript:alert(1)\">x</a></svg>", "SVG_SCRIPT_REFUSED"],
    ["<svg>&#x73;cript</svg>", "SVG_SCRIPT_REFUSED"],
    ["<svg><foreignObject><b>x</b></foreignObject></svg>", "SVG_FOREIGN_OBJECT_REFUSED"],
    ["<svg><image href=\"https://example.invalid/x.png\"/></svg>", "SVG_EXTERNAL_REFERENCE_REFUSED"],
    ["<svg><image href=\"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=\"/></svg>", "SVG_EXTERNAL_REFERENCE_REFUSED"],
    ["<!DOCTYPE svg [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><svg/>", "SVG_EXTERNAL_REFERENCE_REFUSED"],
    ["<svg><rect onclick=\"steal()\"/></svg>", "SVG_EVENT_HANDLER_REFUSED"],
    ["<svg><iframe/></svg>", "SVG_FOREIGN_OBJECT_REFUSED"],
    ["<svg><marquee>x</marquee></svg>", "SVG_ELEMENT_NOT_PERMITTED"],
  ]
  for (const [svg, code] of cases) {
    const result = sanitizeStudySvg(svg)
    assert.equal(result.ok, false, svg)
    assert.equal(result.bytes, null)
    assert.ok(codesOf(result.findings).includes(code), `${svg} -> ${codesOf(result.findings).join(",")}`)
  }
})

test("the reviewed renderer draws from the spec, and its own output passes the sanitizer", () => {
  // The other half of the rule: refusing supplied markup is only tenable if a
  // study can still have a figure.
  const pkg = buildOrThrow()
  const sources = new Map(pkg.nodes.map((node) => [node.content_hash, node]))
  const svg = renderFigureSvg(pkg.figures[0], sources, indexTableCells(pkg.tables))

  assert.match(svg, /^<svg /)
  assert.match(svg, /<circle /)
  const sanitized = sanitizeStudySvg(svg)
  assert.equal(sanitized.ok, true, codesOf(sanitized.findings).join(", "))
  assert.ok(sanitized.bytes instanceof Uint8Array)
})

test("a figure coordinate that resolves to nothing is refused", () => {
  const dangling = scalingFigure()
  dangling.spec.series[0].points[0].y = {
    kind: "TABLE_CELL",
    node_hash: null,
    table_id: "results",
    row_id: "no-such-row",
    column_id: "qubits",
  }
  const built = buildResearchPackage(packageInput({ figures: [dangling] }))

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "FIGURE_POINT_UNRESOLVED"), [
    "$.figures[0].spec.series[0].points[0].y",
  ])
})

// ------------------------------------------------------------------- recipe

test("the display command is generated from the recipe, with nothing to escape", () => {
  const pkg = buildOrThrow()
  assert.equal(
    renderRecipeCommand(pkg.recipe),
    "ketqat-runner study reproduce --package research-package.json",
  )
})

test("an argv element a shell would act on is refused where it is written", () => {
  for (const argument of ["rm -rf /", "$(whoami)", "a;b", "x'y", "a\nb", "`id`"]) {
    assert.throws(
      () => buildResearchPackage(packageInput({ recipe: recipe({ argv: ["run", argument] }) })),
      /argv element/,
      argument,
    )
  }
})

test("an environment allowlist carries names, never values", () => {
  assert.throws(
    () =>
      buildResearchPackage(
        packageInput({ recipe: recipe({ environment_allowlist: ["KETQAT_TOKEN=secret"] }) }),
      ),
    /environment allowlist carries variable names/,
  )
})

test("a runner this build does not approve is a record, not an instruction", () => {
  const built = buildResearchPackage(
    packageInput({ recipe: recipe({ runner: "bash" }) }),
  )
  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "RECIPE_RUNNER_NOT_APPROVED"), ["$.recipe.runner"])
})

test("a policy that forbids the network and then names hosts is two policies", () => {
  assert.throws(
    () =>
      buildResearchPackage(
        packageInput({ recipe: recipe({ allowed_hosts: ["api.example.invalid"] }) }),
      ),
    /no network and then names hosts/,
  )
})

// -------------------------------------------------------------- check ledger

test("a check that did not run is recorded as NOT_RUN, not as an absence", () => {
  const pkg = buildOrThrow({
    checkLedger: [
      ledgerEntry(),
      ledgerEntry({
        check_id: "hardware_reproduction",
        status: "NOT_RUN",
        requirement: "OPTIONAL",
        reason: "No device was booked: this study is a resource estimate.",
        limitations: [],
      }),
      ledgerEntry({
        check_id: "classical_baseline",
        status: "INCONCLUSIVE",
        requirement: "OPTIONAL",
        reason: "The published baseline does not state its hardware.",
        limitations: [],
      }),
    ],
  })

  const summary = checkLedgerSummary(pkg.check_ledger)
  assert.deepEqual(summary, {
    total: 3,
    passed: 1,
    failed: 0,
    not_run: 1,
    inconclusive: 1,
    required_checks_passed: true,
  })
  assert.equal(verifyResearchPackage(pkg).check_ledger.not_run, 1)
  // A package that records what it did not do still verifies: recording it is
  // the honest outcome, not a defect in the export.
  assert.equal(verifyResearchPackage(pkg).status, "STRUCTURE_VERIFIED")
})

test("a failure, a skip and an inconclusive must each say why", () => {
  for (const status of ["FAIL", "NOT_RUN", "INCONCLUSIVE"]) {
    assert.throws(
      () =>
        buildResearchPackage(
          packageInput({ checkLedger: [ledgerEntry({ status, requirement: "OPTIONAL", reason: "" })] }),
        ),
      /must say why/,
      status,
    )
  }
})

test("two entries for one check id give the ledger two answers", () => {
  const pkg = clone(buildOrThrow())
  pkg.check_ledger = [ledgerEntry(), ledgerEntry({ status: "FAIL", reason: "It did not." })]
  pkg.reproducibility_hash = studySelfHash("research_package", pkg)

  const verification = verifyResearchPackage(pkg)
  assert.equal(verification.status, "REFUSED")
  assert.deepEqual(pathsFor(verification.findings, "CHECK_LEDGER_DUPLICATE_ID"), [
    "$.check_ledger[1].check_id",
  ])
})

test("a required check the ledger does not mention is not a check that passed", () => {
  const pkg = buildOrThrow()
  const verification = verifyResearchPackage(pkg, { requiredChecks: ["independent_reproduction"] })

  assert.equal(verification.levels.claims_resolve, false)
  assert.deepEqual(pathsFor(verification.findings, "CHECK_LEDGER_REQUIRED_CHECK_ABSENT"), [
    "$.check_ledger",
  ])
})

// ------------------------------------------------------------------- bundles

const bundleDocument = () => ({
  schema_version: "0.1",
  bundle_kind: "RESOURCE_INTELLIGENCE",
  reproducibility_hash: "1".repeat(64),
  is_demo: true,
  generator: { name: "ketqat", version: "0.3.0", schema_version: "0.1" },
})

test("a cited bundle that resolves to nothing is reported at its own level", () => {
  const pkg = buildOrThrow({
    bundleRefs: [
      { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
    ],
  })
  const verification = verifyResearchPackage(pkg)

  assert.equal(verification.levels.bundles_resolve, false)
  assert.equal(verification.levels.science_recomputed, false)
  assert.equal(verification.status, "STRUCTURE_UNVERIFIED")
  assert.deepEqual(pathsFor(verification.findings, "BUNDLE_UNRESOLVED"), [
    "$.bundle_refs[0].reproducibility_hash",
  ])
})

test("a resolved document of the wrong kind is not the bundle the reference names", () => {
  const pkg = buildOrThrow({
    bundleRefs: [
      { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
    ],
  })
  const verification = verifyResearchPackage(pkg, {
    bundles: new Map([["1".repeat(64), { bundle_kind: "SOMETHING_ELSE" }]]),
  })

  assert.deepEqual(pathsFor(verification.findings, "BUNDLE_KIND_MISMATCH"), [
    "$.bundle_refs[0].bundle_kind",
  ])
})

test("an offline export that does not carry a bundle it cites is refused", () => {
  // Refused at the build boundary, unlike an online package citing a bundle held
  // in a store: an offline export's whole claim is that the recipient needs
  // nothing else, so the builder can and must check it.
  const built = buildResearchPackage(
    packageInput({
      distribution: "OFFLINE_EXPORT",
      bundleRefs: [
        { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
      ],
    }),
  )
  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED"), [
    "$.bundle_refs[0].embedded",
  ])

  // And the same package assembled by hand fails verification the same way.
  const forged = clone(buildOrThrow())
  forged.distribution = "OFFLINE_EXPORT"
  forged.bundle_refs = [
    { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
  ]
  forged.reproducibility_hash = studySelfHash("research_package", forged)
  const verification = verifyResearchPackage(forged)
  assert.equal(verification.levels.hash_matches, true)
  assert.equal(verification.levels.bundles_resolve, false)
  assert.deepEqual(pathsFor(verification.findings, "OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED"), [
    "$.bundle_refs[0].embedded",
  ])
})

test("a claim reading a bundle must say which field of which bundle", () => {
  const bundleNode = stampNode(
    nodeBody({
      kind: "result",
      label: "Resource intelligence bundle, base scenario",
      reference: { record_kind: "resource_intelligence_bundle", hash: "1".repeat(64), record_slug: null },
    }),
  )
  const bundleSupports = stampEdge(
    edgeBody({
      kind: "supports",
      from_node_hash: bundleNode.content_hash,
      to_node_hash: claimNode.content_hash,
      rationale: "The claimed ceiling is the bundle's own estimate.",
    }),
  )
  const bundleDerived = stampEdge(
    edgeBody({
      kind: "derived_from",
      from_node_hash: quantityNode.content_hash,
      to_node_hash: bundleNode.content_hash,
      rationale: "The number is read out of this bundle.",
    }),
  )
  const withBundle = (bundleFields) =>
    packageInput({
      nodes: [claimNode, quantityNode, distanceNode, resultNode, inputNode, bundleNode],
      edges: [
        supportsEdge,
        resultSupportsEdge,
        derivedEdge,
        distanceDerivedEdge,
        usedInputEdge,
        bundleSupports,
        bundleDerived,
      ],
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [quantityNode.content_hash, bundleNode.content_hash],
          edge_hashes: [supportsEdge.content_hash, bundleSupports.content_hash],
          bundle_fields: bundleFields,
        },
      ],
      bundleRefs: [
        { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
      ],
    })

  const silent = buildResearchPackage(withBundle([]))
  assert.equal(silent.ok, false)
  assert.deepEqual(pathsFor(silent.findings, "CLAIM_BUNDLE_FIELD_MISSING"), [
    "$.claim_evidence_map[0].bundle_fields",
  ])

  // Naming the field is what the entry owed, so the package builds -- and the
  // recipient is still told that nothing checked the bundle, because they do not
  // have it. Two separate answers rather than one.
  const named = buildResearchPackage(
    withBundle([{ bundle_hash: "1".repeat(64), field_path: "estimates[0].total_physical_qubits.value" }]),
  )
  assert.equal(named.ok, true, named.ok ? "" : codesOf(named.findings).join(", "))
  const unchecked = verifyResearchPackage(named.package)
  assert.equal(unchecked.levels.bundles_resolve, false)
  assert.equal(unchecked.levels.science_recomputed, false)
  assert.deepEqual(pathsFor(unchecked.findings, "BUNDLE_UNRESOLVED"), [
    "$.bundle_refs[0].reproducibility_hash",
  ])

  // A claim citing a bundle the file does not list is a defect wherever it is
  // checked, because the citation names nothing the recipient can look up.
  const strayBundle = buildResearchPackage(
    withBundle([{ bundle_hash: "7".repeat(64), field_path: "estimates[0].runtime.value" }]),
  )
  assert.equal(strayBundle.ok, false)
  assert.deepEqual(pathsFor(strayBundle.findings, "BUNDLE_UNRESOLVED"), [
    "$.claim_evidence_map[0].bundle_fields[0].bundle_hash",
  ])
})

test("a bundle field path that resolves to nothing is a citation of a document, not a number", () => {
  const pkg = buildOrThrow({
    bundleRefs: [
      { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
    ],
    claimEvidenceMap: [
      {
        claim_node_hash: claimNode.content_hash,
        evidence_node_hashes: [quantityNode.content_hash, resultNode.content_hash],
        edge_hashes: [supportsEdge.content_hash, resultSupportsEdge.content_hash],
        bundle_fields: [{ bundle_hash: "1".repeat(64), field_path: "estimates[0].nothing_here" }],
      },
    ],
    edges: [supportsEdge, resultSupportsEdge, derivedEdge, distanceDerivedEdge, usedInputEdge],
  })
  const verification = verifyResearchPackage(pkg, {
    bundles: new Map([["1".repeat(64), bundleDocument()]]),
  })

  assert.deepEqual(pathsFor(verification.findings, "BUNDLE_FIELD_UNRESOLVED"), [
    "$.claim_evidence_map[0].bundle_fields[0].field_path",
  ])
  // A prototype walk would have resolved `constructor.name` on every object in
  // the process and reported the claim as grounded in a field nobody wrote.
  const prototypeWalk = verifyResearchPackage(
    { ...pkg, claim_evidence_map: [{ ...pkg.claim_evidence_map[0], bundle_fields: [{ bundle_hash: "1".repeat(64), field_path: "constructor" }] }] },
    { bundles: new Map([["1".repeat(64), bundleDocument()]]) },
  )
  assert.ok(codesOf(prototypeWalk.findings).includes("BUNDLE_FIELD_UNRESOLVED"))
})

// --------------------------------------------------- the map against the graph

test("a claim node absent from the claim evidence map is refused", () => {
  const built = buildResearchPackage(packageInput({ claimEvidenceMap: [] }))

  assert.equal(built.ok, false)
  assert.ok(codesOf(built.findings).includes("CLAIM_WITHOUT_EVIDENCE_NODE"))
})

test("a claim citing itself as its own evidence is refused", () => {
  const built = buildResearchPackage(
    packageInput({
      edges: [],
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [claimNode.content_hash],
          edge_hashes: [],
          bundle_fields: [],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  const codes = codesOf(built.findings)
  assert.ok(codes.includes("CLAIM_EVIDENCE_SELF_REFERENTIAL"))
  // Nothing supports it in the graph either, and the entry cites no edge at all.
  // Three findings rather than one, because they take three different fixes.
  assert.ok(codes.includes("CLAIM_WITHOUT_EVIDENCE_NODE"))
  assert.ok(codes.includes("CLAIM_EVIDENCE_UNLINKED"))
})

test("provenance is not support: a derived_from chain does not join evidence to a claim", () => {
  // The snapshot really is behind the number, and `derived_from` says where the
  // number came from. It does not say anyone claims the snapshot backs the
  // sentence -- that is a separate assertion, with its own rationale and its own
  // asserter, and this is the package that leaves it unmade.
  const built = buildResearchPackage(
    packageInput({
      edges: [supportsEdge, derivedEdge, distanceDerivedEdge, usedInputEdge],
      claimEvidenceMap: [
        {
          claim_node_hash: claimNode.content_hash,
          evidence_node_hashes: [quantityNode.content_hash, resultNode.content_hash],
          edge_hashes: [supportsEdge.content_hash],
          bundle_fields: [],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.deepEqual(pathsFor(built.findings, "CLAIM_EVIDENCE_UNLINKED"), [
    "$.claim_evidence_map[0].evidence_node_hashes[1]",
  ])
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
        nodes: [claimNode, quantityNode, distanceNode, resultNode, inputNode, objection],
        edges: [
          supportsEdge,
          resultSupportsEdge,
          derivedEdge,
          distanceDerivedEdge,
          usedInputEdge,
          contradicts,
        ],
        claimEvidenceMap: [
          {
            claim_node_hash: claimNode.content_hash,
            evidence_node_hashes: [quantityNode.content_hash, objection.content_hash],
            edge_hashes: [supportsEdge.content_hash, contradicts.content_hash],
            bundle_fields: [],
          },
        ],
      }),
    )
    assert.equal(built.ok, true, built.ok ? "" : codesOf(built.findings).join(", "))
  }
})

test("a claim reading its value from an unknown is refused rather than thrown", () => {
  // The value lives in the node the claim names, so this is a question about the
  // graph rather than about one record -- and it is still answered before the
  // node schema sees the input, because the export owes its caller a refusal it
  // can read beside the others instead of an exception it has to catch.
  const unknownBody = nodeBody({
    kind: "quantity",
    label: "Total physical qubits, base scenario",
    quantity: unknownQuantity(),
  })
  const unknownNode = { ...unknownBody, content_hash: studySelfHash("evidence_node", unknownBody) }
  const claimBody = nodeBody({
    kind: "claim",
    label: "Shor-2048 fits within an unknown number of physical qubits",
    claim: {
      subject_ref: { record_kind: "quantum_workload", hash: null, record_slug: "shor-2048" },
      metric: "total_physical_qubits",
      comparator: "AT_MOST",
      value_ref: { kind: "value_node", node_hash: unknownNode.content_hash, field_path: null },
    },
  })
  const unknownClaimNode = { ...claimBody, content_hash: studySelfHash("evidence_node", claimBody) }

  const built = buildResearchPackage(
    packageInput({
      nodes: [unknownClaimNode, unknownNode, resultNode, inputNode],
      edges: [],
      tables: [],
      figures: [],
      report: {
        sections: [
          { section_id: "s", title: "Findings", segments: [segment("PROSE", { text: "Nothing resolved." })] },
        ],
        commentary: [],
      },
      claimEvidenceMap: [
        {
          claim_node_hash: unknownClaimNode.content_hash,
          evidence_node_hashes: [unknownNode.content_hash],
          edge_hashes: [],
          bundle_fields: [],
        },
      ],
    }),
  )

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.findings), ["CLAIM_VALUE_UNKNOWN"])
})

// ------------------------------------------------- tampered-study detection

test("an edited package fails its hash check", () => {
  const tampered = clone(buildOrThrow())
  const edited = tampered.nodes.find((node) => node.kind === "quantity")
  edited.quantity.value = 42

  const verification = verifyResearchPackage(tampered)

  assert.equal(verification.levels.hash_matches, false)
  assert.equal(verification.status, "STRUCTURE_UNVERIFIED")
  assert.equal(verification.actual_hash, tampered.reproducibility_hash)
  assert.notEqual(verification.expected_hash, tampered.reproducibility_hash)
})

test("an edited and re-hashed package fails structurally, not cryptographically", () => {
  const tampered = clone(buildOrThrow())
  const edited = tampered.nodes.find((node) => node.kind === "quantity")
  edited.quantity.value = 42
  // The fabrication a hash check alone cannot see: re-stamp the node and then
  // the package, so every digest in the file agrees with its own contents.
  edited.content_hash = studySelfHash("evidence_node", edited)
  tampered.reproducibility_hash = studySelfHash("research_package", tampered)

  const verification = verifyResearchPackage(tampered)

  // Cryptographically the file is now beyond reproach.
  assert.equal(verification.levels.hash_matches, true)
  assert.equal(verification.levels.record_integrity_valid, true)
  // Structurally it has fallen apart: the node's identity moved, so the table
  // cell, the report segment, the figure point, the supporting edges and the
  // claim map all name something that is no longer in the package.
  assert.equal(verification.levels.claims_resolve, false)
  assert.equal(verification.levels.graph_structurally_valid, false)
  assert.equal(verification.status, "STRUCTURE_UNVERIFIED")
  const paths = new Set(verification.findings.map((item) => item.path))
  assert.ok(paths.has("$.tables[0].rows[0].cells[1].node_hash"))
  assert.ok(paths.has("$.report.sections[0].segments[2].node_hash"))
  assert.ok(paths.has("$.figures[0].spec.series[0].points[0].y"))
})

test("a re-hashed node alone breaks the cells that named it", () => {
  const tampered = clone(buildOrThrow())
  const edited = tampered.nodes.find((node) => node.kind === "quantity")
  edited.quantity.value = 42
  edited.content_hash = studySelfHash("evidence_node", edited)

  const carried = new Set(tampered.nodes.map((node) => node.content_hash))
  assert.equal(carried.has(tampered.tables[0].rows[0].cells[1].node_hash), false)
})

test("a review whose recorded hash is not its contents is a verdict that was edited", () => {
  const reviewBody = {
    schema_version: STUDY_SCHEMA_VERSION,
    [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
    study_ref: STUDY_REF,
    subject_node_hash: quantityNode.content_hash,
    verdict: "ACCEPTED",
    rationale: "Looks right.",
    reviewer: "reviewer@example.invalid",
  }
  const pkg = clone(
    buildOrThrow({
      reviews: [{ ...reviewBody, content_hash: studySelfHash("review_record", reviewBody) }],
    }),
  )
  pkg.reviews[0].verdict = "REJECTED"
  pkg.reproducibility_hash = studySelfHash("research_package", pkg)

  const verification = verifyResearchPackage(pkg)
  assert.equal(verification.levels.hash_matches, true)
  assert.equal(verification.levels.record_integrity_valid, false)
  assert.deepEqual(pathsFor(verification.findings, "STUDY_RECORD_NOT_HASHABLE"), [
    "$.reviews[0].content_hash",
  ])
})

// ------------------------------------------------------------------ ceilings

test("a package past a declared ceiling is refused before anything walks it", () => {
  const pkg = clone(buildOrThrow())
  // The ceiling is checked from the record as written and before the schema, so
  // this does not have to be a well-formed package to be refused as too large.
  pkg.nodes = new Array(5001).fill(pkg.nodes[0])

  const verification = verifyResearchPackage(pkg)
  assert.equal(verification.status, "REFUSED")
  assert.equal(verification.levels.schema_valid, false)
  assert.deepEqual(pathsFor(verification.findings, "PACKAGE_LIMIT_EXCEEDED"), ["$.nodes"])
})

test("a package built to be deep is refused by the nesting ceiling", () => {
  const pkg = clone(buildOrThrow())
  let nest = {}
  const root = nest
  for (let depth = 0; depth < 40; depth += 1) {
    nest.child = {}
    nest = nest.child
  }
  pkg.limitations = [root]

  const verification = verifyResearchPackage(pkg)
  assert.equal(verification.status, "REFUSED")
  assert.deepEqual(pathsFor(verification.findings, "PACKAGE_LIMIT_EXCEEDED"), ["$"])
})

// ------------------------------------------------------------------ round trip

test("the package round-trips through JSON and keeps its schema and interface in step", () => {
  const pkg = buildOrThrow({ createdAt: "2026-01-01T00:00:00.000Z" })
  const roundTripped = ResearchPackageSchema.parse(clone(pkg))

  assert.deepEqual(roundTripped, pkg)
  assert.equal(verifyResearchPackage(roundTripped).status, "STRUCTURE_VERIFIED")

  // The field list is asserted rather than inferred, so a field added to the
  // hand-written interface and forgotten in the schema -- or the reverse -- is a
  // failing test rather than a key that silently never survives a parse.
  assert.deepEqual(Object.keys(roundTripped).sort(), [
    "bundle_refs",
    "check_ledger",
    "claim_evidence_map",
    "created_at",
    "distribution",
    "edges",
    "environment",
    "figures",
    "hash_rules_id",
    "is_demo",
    "limitations",
    "nodes",
    "package_kind",
    "plan_ref",
    "recipe",
    "references",
    "report",
    "reproducibility_hash",
    "reproductions",
    "reviews",
    "schema_version",
    "study_ref",
    "tables",
  ])
})

// A timestamp is receipt evidence, and the two digests answer differently about it.
test("a timestamp is receipt evidence: outside the semantic digest, inside the record one", () => {
  const withoutTimestamp = buildOrThrow()
  const withTimestamp = buildOrThrow({ createdAt: "2026-06-30T12:00:00.000Z" })

  assert.equal(withTimestamp.created_at, "2026-06-30T12:00:00.000Z")
  assert.equal(
    semanticHash("research_package", withTimestamp),
    semanticHash("research_package", withoutTimestamp),
    "the same evidence graph reports the same science, whenever it was written down",
  )
  assert.notEqual(
    withTimestamp.reproducibility_hash,
    withoutTimestamp.reproducibility_hash,
    "and they are two different files, which is what the record digest answers",
  )
  assert.equal(verifyResearchPackage(withTimestamp).status, "STRUCTURE_VERIFIED")
})

test("a check ledger is receipt evidence, and so is a review", () => {
  // The class change from `failed_checks`, which was semantic: re-running the
  // same checks tomorrow produces the same science and a different ledger.
  const first = buildOrThrow()
  const second = buildOrThrow({
    checkLedger: [ledgerEntry({ observed_at: "2027-01-01T00:00:00Z" })],
  })

  assert.equal(
    semanticHash("research_package", first),
    semanticHash("research_package", second),
    "when a check ran is not part of what the study says",
  )
  assert.notEqual(
    recordHash("research_package", first),
    recordHash("research_package", second),
    "and the record digest still covers it",
  )
})

test("a candidate that is not a research package is refused with named findings", () => {
  const verification = verifyResearchPackage({ package_kind: "NOT_A_PACKAGE" })

  assert.equal(verification.status, "REFUSED")
  assert.equal(verification.levels.schema_valid, false)
  assert.equal(verification.levels.canonicalizable, false)
  assert.ok(verification.findings.length > 0)
  assert.equal(verifyResearchPackage(null).status, "REFUSED")
})

// A package's digest is over the file, and there is no second reading of the file.
test("one record has one digest through the build path and the verify path alike", () => {
  const pkg = buildOrThrow()
  assert.deepEqual(pkg.references[0].authors, [], "the builder writes what it hashed")
  assert.deepEqual(pkg.environment.packages, [])

  const asWritten = JSON.parse(JSON.stringify(pkg))
  const built = pkg.reproducibility_hash
  const verified = verifyResearchPackage(asWritten)
  assert.equal(verified.expected_hash, built, "the verifier recomputes the digest the builder wrote")
  assert.deepEqual(verified.problems, [])

  // And parsing the file changes nothing about it, which is the property that
  // makes those two the same digest: no schema in this family materialises a
  // field at parse time.
  const parsed = ResearchPackageSchema.parse(asWritten)
  assert.deepEqual(parsed, asWritten, "the parse must not rewrite its own subject")
  assert.equal(studySelfHash("research_package", parsed), built)

  const omitted = clone(pkg)
  delete omitted.references[0].authors
  assert.equal(ResearchPackageSchema.safeParse(omitted).success, false)
  const stale = verifyResearchPackage(omitted)
  assert.equal(stale.status, "REFUSED")
  assert.equal(
    stale.findings.some((item) => item.path.includes("references[0].authors")),
    true,
    stale.problems.join(" "),
  )
})

// An environment recording a dependency named `id` was dropped before hashing.
test("an environment shaped as a map of run-time keys is no longer a package at all", () => {
  assert.throws(
    () =>
      buildResearchPackage(
        packageInput({ environment: { operating_system: "linux", packages: { id: "1.0.0" }, hardware: {} } }),
      ),
    /Expected array, received object/,
  )
})

// A key hidden inside a `Quantity` envelope, refused for a reason that does not
// depend on what the key is called.
test("a package whose graph hides an undeclared key is refused, not hashed", () => {
  for (const key of ["id", "slug", "smuggled", "__proto__"]) {
    const forged = clone(buildOrThrow())
    const node = forged.nodes.find((candidate) => candidate.quantity !== null)
    Object.defineProperty(node.quantity, key, {
      value: "smuggled",
      enumerable: true,
      writable: true,
      configurable: true,
    })

    assert.notEqual(verifyResearchPackage(forged).status, "STRUCTURE_VERIFIED", key)

    assert.throws(
      () => studySelfHash("evidence_node", node),
      (error) => error.code === "UNDECLARED_FIELD" && error.path === `quantity.${key}`,
      `two nodes differing only in ${key} would otherwise be content-addressed identically`,
    )
  }

  // And the mirror image, which is what makes the rule a classification rather
  // than a denylist: `created_at` is a declared field of a `Quantity` envelope.
  const honest = clone(buildOrThrow())
  const node = honest.nodes.find((candidate) => candidate.quantity !== null)
  const rebuilt = { ...node, quantity: { ...node.quantity, created_at: "2027-01-01T00:00:00.000Z" } }
  assert.equal(
    semanticHash("evidence_node", rebuilt),
    semanticHash("evidence_node", node),
    "an envelope rebuilt around the same number is the same measurement",
  )
  assert.notEqual(recordHash("evidence_node", rebuilt), recordHash("evidence_node", node))
})

test("a table cell hiding a key nobody declared is refused before the package is assembled", () => {
  const smuggled = resultsTable()
  smuggled.rows[0].cells[0] = { column_id: "scenario", text: "Base", node_hash: null, id: "smuggled" }
  const built = buildResearchPackage(packageInput({ tables: [smuggled] }))

  assert.equal(built.ok, false)
  assert.deepEqual(codesOf(built.findings), ["STUDY_RECORD_NOT_HASHABLE"])
  assert.match(built.findings[0].message, /^research_package: UNDECLARED_FIELD: /)
  assert.equal(
    built.findings[0].message.includes("tables[0].rows[0].cells[0].id"),
    true,
    built.findings[0].message,
  )
})

// Undeclared keys are refused rather than stripped, so the two languages give
// one answer for one file.
test("a package carrying a key no schema declares is refused, not stripped", () => {
  for (const undeclared of [{ owner_username: "somebody-else" }, { smuggled_root_key: "not declared" }]) {
    const verification = verifyResearchPackage({ ...buildOrThrow(), ...undeclared })
    assert.equal(verification.status, "REFUSED", `${Object.keys(undeclared)[0]} must not pass as a package`)
    assert.equal(
      verification.problems.some((problem) => /[Uu]nrecognized key/.test(problem)),
      true,
      verification.problems.join(" "),
    )
  }

  const withStrayCitationKey = clone(buildOrThrow())
  withStrayCitationKey.references[0].publisher = "not a citation field"
  assert.equal(verifyResearchPackage(withStrayCitationKey).status, "REFUSED")
})

// ------------------------------------------------ the cross-language contract

// The vectors are checked in place here and reproduced from the same packages by
// `python/tests/test_study_package.py`. What is pinned is a code and a JSON path
// per defect: a caller branches on the code and a reader follows the path, and
// those two are what the two implementations owe each other. Messages are
// written for people and are deliberately not compared -- a test that compared
// English would fail on an improved sentence and pass on a wrong path.
test("the committed verification vectors are the ones this build produces", () => {
  const vectors = JSON.parse(
    readFileSync(new URL("../fixtures/study/verification-vectors.json", import.meta.url), "utf8"),
  )
  assert.equal(vectors.hash_rules_id, STUDY_HASH_RULES_ID)
  assert.ok(vectors.cases.length >= 10, `${vectors.cases.length} cases is not a corpus`)
  // A passing case is required: a vector set in which every package is broken
  // cannot tell a strict verifier from one that refuses everything.
  assert.ok(vectors.cases.some((entry) => entry.findings.length === 0))

  const collectionPaths = new Set(["$.nodes", "$.edges"])
  const sortFindings = (findings) =>
    findings
      .map((item) => ({ code: item.code, path: item.path }))
      .sort((left, right) =>
        left.code === right.code
          ? left.path.localeCompare(right.path)
          : left.code.localeCompare(right.code),
      )

  for (const entry of vectors.cases) {
    const verification = verifyResearchPackage(entry.package)
    assert.equal(verification.status, entry.status, entry.label)
    for (const [level, expected] of Object.entries(entry.levels)) {
      assert.equal(verification.levels[level], expected, `${entry.label}.${level}`)
    }
    assert.deepEqual(
      sortFindings(verification.findings.filter((item) => !collectionPaths.has(item.path))),
      entry.findings,
      entry.label,
    )
    assert.deepEqual(
      sortFindings(verification.findings.filter((item) => collectionPaths.has(item.path))),
      entry.typescript_only_findings,
      entry.label,
    )
  }
})

// --- three CodeQL findings, reproduced and fenced ------------------------
//
// All three shipped in this branch and were demonstrated before being fixed.
// Each test below fails against the code as it was written.

test("a figure title cannot close the attribute it is rendered into", () => {
  // `escapeSvgText` escaped `&`, `<` and `>` -- enough for an element body, and
  // not enough for `aria-label="..."`, which it was also used for. A title of
  // `" onload="alert(1)` produced `aria-label="" onload="alert(1)">`: an event
  // handler in a document this family generates precisely so that supplied SVG
  // never has to be trusted.
  const pkg = buildOrThrow()
  const sources = new Map(pkg.nodes.map((node) => [node.content_hash, node]))
  const hostile = {
    ...pkg.figures[0],
    title: '" onload="alert(1)',
    caption: "</desc><script>alert(2)</script><desc>",
  }

  const svg = renderFigureSvg(hostile, sources, indexTableCells(pkg.tables))

  // The property is about the attribute, not about the characters. `onload=`
  // sitting inside an escaped attribute value is inert text; what must not
  // happen is a `"` that ends `aria-label` and starts something else.
  const ariaLabel = /aria-label="([^"]*)"/.exec(svg)
  assert.ok(ariaLabel !== null, `no aria-label in ${svg}`)
  assert.equal(ariaLabel[1], "&quot; onload=&quot;alert(1)")
  assert.doesNotMatch(svg, /<script/i, "a script element reached the output")
  assert.equal((svg.match(/aria-label=/g) ?? []).length, 1)

  // The sanitizer refuses this output, and that is correct rather than a
  // contradiction. Its event-handler pattern reads the bytes as they are, so
  // `&quot; onload=` matches even though the quote is an entity and cannot
  // delimit anything. A sanitizer that decoded entities before deciding would
  // be reasoning about one parse of a document that several parsers will read,
  // which is how sanitizers are evaded; refusing more than it must is the safe
  // direction for it to be wrong in. The consequence is bounded and worth
  // stating: a figure whose title genuinely contains `on…=` after a quote
  // cannot be rendered, and the study says so rather than drawing it.
  const sanitized = sanitizeStudySvg(svg)
  assert.equal(sanitized.ok, false)
  assert.deepEqual(codesOf(sanitized.findings), ["SVG_EVENT_HANDLER_REFUSED"])

  // A title with nothing hostile in it still renders and still passes.
  const benign = renderFigureSvg(
    { ...pkg.figures[0], title: 'Physical qubits vs "distance"' },
    sources,
    indexTableCells(pkg.tables),
  )
  assert.match(benign, /aria-label="Physical qubits vs &quot;distance&quot;"/)
  assert.equal(sanitizeStudySvg(benign).ok, true)
})

test("scanning element names stays linear on a long run of separators", () => {
  // `<\s*\/?\s*` gave the engine an ambiguous split to backtrack through:
  // 2,000 spaces after a `<` took 3.9 ms and 32,000 took 689 ms -- quadratic,
  // on input the sanitizer exists to read from strangers.
  const timeFor = (spaces) => {
    const started = process.hrtime.bigint()
    sanitizeStudySvg(`<svg xmlns="http://www.w3.org/2000/svg"><${" ".repeat(spaces)}`)
    return Number(process.hrtime.bigint() - started) / 1e6
  }

  timeFor(1000) // warm the JIT so the ratio measures the pattern, not the compile
  const small = Math.max(timeFor(8_000), 0.5)
  const large = timeFor(64_000)

  // Eight times the input. Linear would be ~8x; the old pattern was ~64x.
  assert.ok(large < small * 24, `8x input took ${(large / small).toFixed(1)}x the time`)
  // And it still finds what it is for.
  assert.equal(sanitizeStudySvg("<svg><script>x</script></svg>").ok, false)
  assert.equal(sanitizeStudySvg("<svg></ script></svg>").ok, false)
})

test("a table cell cannot split its own row", () => {
  // Escaping only the pipe turned `a\|b` into `a\\|b`, where the doubled
  // backslash is a literal and the pipe delimits again. A newline ends the row
  // outright, moving every later value into the wrong column.
  const pkg = buildOrThrow()
  const sources = new Map(pkg.nodes.map((node) => [node.content_hash, node]))
  const table = pkg.tables[0]
  const hostile = {
    ...table,
    columns: table.columns.map((column, index) =>
      index === 0 ? { ...column, header: "a\\|b\nc" } : column,
    ),
  }

  // The property is that a hostile label changes the *text* of a cell and
  // nothing about the shape of the table. Comparing against the same table
  // rendered with a benign label tests exactly that, without assuming how many
  // columns the header derives from the spec.
  const benign = {
    ...table,
    columns: table.columns.map((column, index) =>
      index === 0 ? { ...column, header: "safe" } : column,
    ),
  }
  const cellCount = (markdown) => markdown.split("\n")[0].split(/(?<!\\)\|/).length

  const hostileMarkdown = renderTableMarkdown(hostile, sources)
  const benignMarkdown = renderTableMarkdown(benign, sources)

  assert.equal(hostileMarkdown.split("\n").length, benignMarkdown.split("\n").length,
    "the hostile label added a row")
  assert.equal(cellCount(hostileMarkdown), cellCount(benignMarkdown),
    `the hostile label added a cell: ${hostileMarkdown.split("\n")[0]}`)
  // And the hostile text is present, escaped, inside one cell: the backslash
  // doubled so it cannot escape anything, the pipe escaped so it cannot
  // delimit, and the newline replaced so it cannot end the row.
  assert.ok(
    hostileMarkdown.includes("a\\\\\\|b c"),
    `escaped label missing from: ${hostileMarkdown.split("\n")[0]}`,
  )
})
