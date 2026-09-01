#!/usr/bin/env node
/**
 * Emit cross-language verification vectors for the research package.
 *
 * `fixtures/study/hash-core-vectors.json` settles the digests. This file
 * settles the layer above them: that TypeScript and Python reach the same
 * verdict about the same file, and say so in the same words -- where "the same
 * words" means **the same codes at the same JSON paths**, and deliberately not
 * the same English.
 *
 * That distinction is the whole reason the vectors pin `{code, path}` pairs and
 * nothing else. A message is written for a person and is improved whenever
 * somebody finds a better sentence; a test comparing messages across two
 * implementations fails on an improvement and passes on a wrong path, which is
 * exactly backwards. A code is what a caller branches on and a path is where the
 * reader is sent to look, and those two are the contract.
 *
 * Each case is a whole package rather than a patch against a base. A patch
 * format would need a small applier in both languages, and a defect in the
 * applier would look exactly like a disagreement between the verifiers.
 *
 * Written by `npm run build`-adjacent tooling and reproduced by
 * `tests/research-package.test.mjs` and `python/tests/test_study_package.py`.
 */
import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { studySelfHash } from "../dist/study/hash.js"
import { STUDY_HASH_RULES_ID } from "../dist/study/rules.js"
import { STUDY_SCHEMA_VERSION } from "../dist/study/common.js"
import { buildResearchPackage, verifyResearchPackage } from "../dist/study/research-package.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const STUDY_REF = "d5a370a6-8b65-4ae8-8f57-8c06f313afac"
const MODEL = "ketqat-resource-intelligence"

const stamp = (kind, body) => ({ ...body, content_hash: studySelfHash(kind, body) })

const nodeBody = (changes) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
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

const quantity = (value, unit) => ({
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

const qubits = stamp(
  "evidence_node",
  nodeBody({
    kind: "quantity",
    label: "Total physical qubits, base scenario",
    quantity: quantity(4200000, "physical qubits"),
  }),
)

const distance = stamp(
  "evidence_node",
  nodeBody({
    kind: "quantity",
    label: "Code distance, base scenario",
    quantity: quantity(21, "code distance"),
  }),
)

const claim = stamp(
  "evidence_node",
  nodeBody({
    kind: "claim",
    label: "Shor-2048 fits within 4.2 million physical qubits under the base scenario",
    claim: {
      subject_ref: { record_kind: "quantum_workload", hash: null, record_slug: "shor-2048" },
      metric: "total_physical_qubits",
      comparator: "AT_MOST",
      value_ref: { kind: "value_node", node_hash: qubits.content_hash, field_path: null },
    },
  }),
)

const result = stamp(
  "evidence_node",
  nodeBody({
    kind: "result",
    label: "Resource estimate snapshot, base scenario",
    reference: { record_kind: "resource_estimate_snapshot", hash: "e".repeat(64), record_slug: null },
  }),
)

const edgeBody = (changes) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_ref: STUDY_REF,
  kind: "supports",
  from_node_hash: qubits.content_hash,
  to_node_hash: claim.content_hash,
  asserted_by: MODEL,
  rationale: "The claimed ceiling is the estimate's own upper bound.",
  ...changes,
})

const supports = stamp("evidence_edge", edgeBody({}))
const derived = stamp(
  "evidence_edge",
  edgeBody({
    kind: "derived_from",
    from_node_hash: qubits.content_hash,
    to_node_hash: result.content_hash,
    rationale: "The number is read out of this estimate.",
  }),
)
const distanceDerived = stamp(
  "evidence_edge",
  edgeBody({
    kind: "derived_from",
    from_node_hash: distance.content_hash,
    to_node_hash: result.content_hash,
    rationale: "The code distance is read out of the same estimate.",
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

const baseInput = {
  studyRef: STUDY_REF,
  planRef: { revision_hash: "c".repeat(64), revision: 2 },
  distribution: "ONLINE",
  report: {
    sections: [
      {
        section_id: "findings",
        title: "Findings",
        segments: [
          segment("PROSE", { text: "The base scenario needs" }),
          segment("QUANTITY_REF", { node_hash: qubits.content_hash }),
          segment("TABLE_REF", { table_id: "results" }),
          segment("FIGURE_REF", { figure_id: "scaling" }),
        ],
      },
    ],
    commentary: [],
  },
  tables: [
    {
      table_id: "results",
      caption: "Resource estimate under the base scenario.",
      role: "RESULTS",
      columns: [
        { column_id: "scenario", header: "Scenario", role: "LABEL", unit: null },
        { column_id: "qubits", header: "Total physical qubits", role: "VALUE", unit: "physical qubits" },
      ],
      rows: [
        {
          row_id: "base",
          cells: [
            { column_id: "scenario", text: "Base", node_hash: null },
            { column_id: "qubits", text: null, node_hash: qubits.content_hash },
          ],
        },
      ],
    },
  ],
  figures: [
    {
      figure_id: "scaling",
      title: "Physical qubits against code distance",
      caption: "One point, drawn from the nodes the table reads.",
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
                x: { kind: "NODE", node_hash: distance.content_hash, table_id: null, row_id: null, column_id: null },
                y: { kind: "TABLE_CELL", node_hash: null, table_id: "results", row_id: "base", column_id: "qubits" },
              },
            ],
          },
        ],
      },
      svg_artifact: null,
    },
  ],
  references: [
    { title: "Surface codes: towards practical large-scale quantum computation", authors: [], year: 2012 },
  ],
  bundleRefs: [],
  environment: {
    operating_system: "Linux",
    architecture: "x86_64",
    python_version: "3.11.9",
    packages: [],
    hardware: [],
  },
  recipe: {
    runner: "ketqat-runner",
    runner_version: "0.3.0",
    container_digest: `sha256:${"a".repeat(64)}`,
    argv: ["study", "reproduce", "--package", "research-package.json"],
    input_refs: [],
    environment_allowlist: [],
    expected_output_refs: [],
    resource_limits: { max_runtime: 3600, max_memory_bytes: "8589934592", max_credits: null },
    network_policy: "NONE",
    allowed_hosts: [],
    platform: { operating_system: "linux", architecture: "x86_64", minimum_runner_version: null },
  },
  nodes: [qubits, distance, claim, result],
  edges: [supports, derived, distanceDerived],
  claimEvidenceMap: [
    {
      claim_node_hash: claim.content_hash,
      evidence_node_hashes: [qubits.content_hash],
      edge_hashes: [supports.content_hash],
      bundle_fields: [],
    },
  ],
  reviews: [],
  reproductions: [],
  checkLedger: [
    {
      check_id: "graph_structure",
      status: "PASS",
      requirement: "REQUIRED",
      tool: { name: "ketqat-sdk", version: "0.3.0" },
      input_refs: [],
      output_ref: null,
      reason: "",
      limitations: ["Structural only: nothing here weighs the evidence."],
      observed_at: "2026-09-01T00:00:00Z",
    },
  ],
  limitations: ["Modelled, not measured. No device was run."],
  isDemo: false,
}

const built = buildResearchPackage(baseInput)
if (!built.ok) {
  console.error(JSON.stringify(built.findings, null, 2))
  throw new Error("The base package for the verification vectors does not build.")
}

const clone = (value) => JSON.parse(JSON.stringify(value))
const restamp = (pkg) => {
  pkg.reproducibility_hash = studySelfHash("research_package", pkg)
  return pkg
}

/**
 * Each case is a package and the defect it carries, or the absence of one.
 *
 * Only defects both languages can find. Recomputing a bundle's estimates is
 * TypeScript's alone -- ADR 0010 withholds it from Python deliberately, so that
 * two implementations of one model cannot disagree at the third decimal place --
 * and a vector pinning it would be a vector Python is required to fail.
 */
const cases = [
  {
    label: "intact",
    why: "Nothing wrong with it. A vector set with no passing case cannot tell a strict verifier from a broken one.",
    package: clone(built.package),
  },
  {
    label: "edited_without_rehash",
    why: "The ordinary tampering: a number changed and nothing else touched.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.nodes[0].quantity.value = 42
      return pkg
    })(),
  },
  {
    label: "edited_and_rehashed",
    why:
      "The fabrication a digest cannot see: the node is edited, re-stamped, and the package re-hashed, so every " +
      "digest in the file agrees with its own contents and every reference to the node has stopped resolving.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.nodes[0].quantity.value = 42
      pkg.nodes[0].content_hash = studySelfHash("evidence_node", pkg.nodes[0])
      return restamp(pkg)
    })(),
  },
  {
    label: "prose_carries_a_number",
    why: "A figure typed into a verified section, which is the failure the structured report exists to prevent.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.report.sections[0].segments[0].text = "The base scenario needs 4.2 million physical qubits"
      return restamp(pkg)
    })(),
  },
  {
    label: "table_value_cell_without_node",
    why: "A number typed into a table cell, which renders exactly like one that was measured.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.tables[0].rows[0].cells[1] = { column_id: "qubits", text: "4200000", node_hash: null }
      return restamp(pkg)
    })(),
  },
  {
    label: "csv_artifact_mismatch",
    why: "The forwarded file and the rows it was generated from, disagreeing.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.tables[0].csv_artifact.content_hash = "b".repeat(64)
      return restamp(pkg)
    })(),
  },
  {
    label: "figure_point_unresolved",
    why: "A chart drawn from a coordinate the package does not carry.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.figures[0].spec.series[0].points[0].y = {
        kind: "TABLE_CELL",
        node_hash: null,
        table_id: "results",
        row_id: "no-such-row",
        column_id: "qubits",
      }
      return restamp(pkg)
    })(),
  },
  {
    label: "report_reference_unresolved",
    why: "A report segment naming a node the package does not carry.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.report.sections[0].segments[1].node_hash = "9".repeat(64)
      return restamp(pkg)
    })(),
  },
  {
    label: "claim_evidence_unlinked",
    why: "The map and the graph disagreeing: the evidence is carried and no edge says it backs the claim.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.edges = pkg.edges.filter((edge) => edge.kind !== "supports")
      pkg.claim_evidence_map[0].edge_hashes = []
      return restamp(pkg)
    })(),
  },
  {
    label: "offline_export_without_bundle",
    why: "A file calling itself self-contained and citing a document nobody has.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.distribution = "OFFLINE_EXPORT"
      pkg.bundle_refs = [
        { bundle_kind: "RESOURCE_INTELLIGENCE", reproducibility_hash: "1".repeat(64), embedded: null },
      ]
      return restamp(pkg)
    })(),
  },
  {
    label: "check_ledger_duplicate_id",
    why: "Two answers about one check, and a consumer indexing by id reports whichever it read last.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.check_ledger = [pkg.check_ledger[0], { ...pkg.check_ledger[0], status: "FAIL", reason: "It did not." }]
      return restamp(pkg)
    })(),
  },
  {
    label: "recipe_runner_not_approved",
    why: "A recipe that is a readable record of a manual reproduction and not an instruction anything will follow.",
    package: (() => {
      const pkg = clone(built.package)
      pkg.recipe.runner = "bash"
      return restamp(pkg)
    })(),
  },
]

/** The two paths a subject-addressed graph refusal lands on. */
const COLLECTION_PATHS = new Set(["$.nodes", "$.edges"])

const sortFindings = (findings) =>
  findings
    .map((item) => ({ code: item.code, path: item.path }))
    .sort((left, right) =>
      left.code === right.code
        ? left.path.localeCompare(right.path)
        : left.code.localeCompare(right.code),
    )

const vectors = {
  note:
    "Written by scripts/generate-study-verification-vectors.mjs, checked in place by " +
    "tests/research-package.test.mjs and reproduced by python/tests/test_study_package.py from the same " +
    "packages. The contract is the `findings` list: a code and a JSON path per defect, sorted. Messages are " +
    "written for people and are deliberately not compared across the two languages -- a test that compared " +
    "English would fail on an improved sentence and pass on a wrong path. Only defects both languages can " +
    "find are pinned in `findings`: recomputing a bundle's estimates is the TypeScript verifier's alone " +
    "(ADR 0010), so a vector for it would be a vector Python is required to fail. `typescript_only_findings` " +
    "records what this build finds in addition -- every refusal `verifyEvidenceGraph` addresses to a subject " +
    "rather than to a place, which is the edge matrix, cycles, supersession forks, reference agreement and " +
    "provenance closure -- so the difference between the two verifiers is written down rather than implied.",
  schema_version: STUDY_SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  cases: cases.map((entry) => {
    const verification = verifyResearchPackage(entry.package)
    return {
      label: entry.label,
      why: entry.why,
      status: verification.status,
      // The levels both languages compute the same way. `science_recomputed` is
      // deliberately absent: TypeScript recomputes bundles and Python does not,
      // and none of these cases cites a resolvable bundle, so pinning it would
      // pin a coincidence rather than an agreement.
      levels: {
        schema_valid: verification.levels.schema_valid,
        canonicalizable: verification.levels.canonicalizable,
        hash_matches: verification.levels.hash_matches,
        record_integrity_valid: verification.levels.record_integrity_valid,
        graph_structurally_valid: verification.levels.graph_structurally_valid,
        provenance_closed: verification.levels.provenance_closed,
        claims_resolve: verification.levels.claims_resolve,
        bundles_resolve: verification.levels.bundles_resolve,
      },
      // The cross-language contract: every finding addressed to a *place*. A
      // finding whose path is exactly `$.nodes` or `$.edges` came from
      // `verifyEvidenceGraph`, which reports by subject because it is called on
      // bare lists as often as on a package -- the edge matrix, cycles,
      // supersession forks, reference agreement and provenance closure. Those
      // are checks this build makes and the Python verifier does not, by ADR
      // 0010, so they are recorded beside the contract rather than inside it.
      findings: sortFindings(
        verification.findings.filter((item) => !COLLECTION_PATHS.has(item.path)),
      ),
      typescript_only_findings: sortFindings(
        verification.findings.filter((item) => COLLECTION_PATHS.has(item.path)),
      ),
      package: entry.package,
    }
  }),
}

writeFileSync(
  resolve(root, "fixtures", "study", "verification-vectors.json"),
  `${JSON.stringify(vectors, null, 2)}\n`,
)
