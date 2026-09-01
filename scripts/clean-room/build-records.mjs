/**
 * Build one of every study record a consumer would produce, using nothing but
 * the installed npm tarball.
 *
 * This is the half of the clean room that `npm test` cannot state. The suites in
 * `tests/` import `../dist/`, which is this working tree's build output: a
 * module missing from the `files` list, a subpath absent from the exports map,
 * or a generated table that never reached the package all resolve there and fail
 * only for somebody who installed the thing. So every import below is a **bare
 * specifier through a declared subpath export**, and the records are built by
 * the shipped builders rather than copied out of a fixture -- a fixture would
 * prove the file still parses, and what is on trial is whether the code that
 * writes it shipped.
 *
 * The records are written to `$KETQAT_RECORDS` as plain JSON, because the next
 * two programs read them from two different languages. The file is the interface
 * between them, which is also what a consumer holds: nothing here passes an
 * object from one verifier to another in memory.
 *
 * Nothing in this file asserts. It builds, and it refuses to write a record any
 * builder declined to produce -- `verify-typescript.mjs` and `verify_python.py`
 * are where the claims are made.
 */

import { quantity } from "ketqat-sdk/intelligence"
import {
  STUDY_HASH_RULES_ID,
  STUDY_HASH_RULES_KEY,
  STUDY_SCHEMA_VERSION,
  studySelfHash,
} from "ketqat-sdk/study"
import { buildStudy, appendStudyEvent } from "ketqat-sdk/study"
import { StudyPlanSchema, revisePlan } from "ketqat-sdk/study"
import { buildConfirmationReceipt } from "ketqat-sdk/study"
import { ArtifactRefSchema } from "ketqat-sdk/study"
import { authoriseStudyTask, recordTaskOutcome } from "ketqat-sdk/study"
import { buildExecutionCapsule } from "ketqat-sdk/study"
import { EvidenceEdgeSchema, EvidenceNodeSchema } from "ketqat-sdk/study"
import { buildResearchPackage } from "ketqat-sdk/study"

import { RECORDS, corpusIdOf, done, must, writeRecord } from "./support.mjs"

/**
 * The records this run wrote, in the order it wrote them.
 *
 * Kept so the run can publish a digest over its own corpus: the two verifiers
 * stamp it into what they compute, and `compare-languages.mjs` refuses to
 * compare two halves that were not produced from the same records.
 */
const written = []
const record = (name, value) => {
  written.push(name)
  return writeRecord(name, value)
}

const MODEL = "ketqat-resource-intelligence"
const MODEL_VERSION = "0.1.0"

// Fixed identifiers and timestamps throughout. A record built from `Date.now()`
// or a fresh uuid would hash differently on every run, and the point of the
// cross-language comparison two programs from here is that two implementations
// reading the same bytes produce the same hex -- which needs the bytes to stand
// still within one run and be reproducible across runs when a digest disagrees.
const STUDY_ID = "3f5c9d18-6b47-4e0a-9c2f-81d5a6304e7b"
const PROJECT_REF = "1f6b3e57-0d94-4c28-83a7-5e91b024df6a"
const JOB_ID = "b2e7c410-9d35-4a86-9f13-6c04e8a5b72d"
const AT = {
  confirmed: "2026-09-01T09:00:00.000Z",
  expires: "2026-09-08T09:00:00.000Z",
  used: "2026-09-02T09:00:00.000Z",
  started: "2026-09-02T09:05:00.000Z",
  finished: "2026-09-02T09:41:30.000Z",
}

const digest = (character) => character.repeat(64)

/** Stamp then hash, in the order every builder in the family uses. */
const seal = (recordKind, schema, withoutHash) =>
  schema.parse({ ...withoutHash, content_hash: studySelfHash(recordKind, withoutHash) })

/** A builder returning `{ok:false}` is a failed release check, not a fixture to fix later. */
function taken(result, what) {
  if (result.ok !== true) {
    const detail = result.refusal
      ? `${result.refusal.code}: ${result.refusal.message}`
      : result.findings.map((finding) => `${finding.code} ${finding.path}`).join("; ")
    throw new Error(`The installed package refused to build ${what}: ${detail}`)
  }
  return result
}

// ------------------------------------------------------------------- the study

const study = buildStudy({
  studyId: STUDY_ID,
  title: "Does the shot budget survive a real device?",
  core: { study_type: "FTQC_FEASIBILITY", project_ref: PROJECT_REF, is_demo: true },
  createdAt: AT.confirmed,
})
record("study", study)

// One event, appended through the chain rules rather than written by hand: the
// sequence, the previous-event link and both statuses are read off the trail,
// so a build that shipped the event table but not the transition rules fails
// here rather than in a store six months from now.
const created = taken(
  appendStudyEvent(study, [], null, {
    event_type: "study_created",
    actor: "clean-room@example.invalid",
    created_at: AT.confirmed,
  }),
  "a study_created event",
)
record("study-event", created.event)

// ------------------------------------------------------------------- the plan

const criterion = (id, changes = {}) => ({
  criterion_id: id,
  metric_ref: "scenario.total_physical_qubits",
  comparator: "AT_MOST",
  threshold: { dimension: "QUBITS", value: 4200000, exact_value: null, unit: "physical qubits" },
  required_evidence: ["MODELLED"],
  status: "NOT_RUN",
  explanation: "The count has to fit the machine the study is arguing for.",
  ...changes,
})

const versionPin = (name, changes = {}) => ({
  package_name: name,
  package_version: "0.1.0",
  artifact_digest: null,
  source_commit: null,
  container_digest: null,
  model_snapshot_hash: null,
  schema_hash: null,
  adapter_configuration_hash: null,
  ...changes,
})

const planWithoutHash = {
  schema_version: STUDY_SCHEMA_VERSION,
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_ref: study.study_id,
  specification_ref: { revision_hash: digest("a"), revision: 1 },
  revision: 1,
  supersedes: null,
  baselines: [{ baseline_ref: digest("b"), source_class: "measured", note: "Timed on the customer's cluster." }],
  candidates: [{ name: "Qubitized QPE", workload_ref: digest("c"), rationale: "The only published analysis." }],
  scenario_refs: [digest("d")],
  pinned_versions: {
    adapter: null,
    model: versionPin("ketqat-resource-intelligence", { model_snapshot_hash: digest("e") }),
    engine: versionPin("ketqat-engine", { container_digest: `sha256:${digest("f")}` }),
  },
  expected_runtime: quantity({
    value: 0.432,
    unit: "seconds",
    evidence: "MODELLED",
    source: "Runtime model.",
    model: MODEL,
    modelVersion: MODEL_VERSION,
  }),
  expected_credits: quantity({
    value: 1800,
    unit: "credits",
    evidence: "DERIVED",
    source: "Runtime at the pinned tariff.",
    model: MODEL,
    modelVersion: MODEL_VERSION,
  }),
  max_credits: 2500,
  data_handling: {
    visibility: "PRIVATE",
    retention: { kind: "DELETE_AFTER_DAYS", days: 90 },
    third_party_transfer: "NONE",
    model_training_use: "FORBIDDEN",
    public_dataset_opt_in: false,
    allowed_egress: [{ kind: "HASHES_ONLY", host: null }],
    export_permission: "HASHES_ONLY",
    deletion_policy: { kind: "ON_REQUEST", within_days: 7 },
    secret_handling: "PER_JOB_NEVER_PERSISTED",
    pii_handling: "NONE_PRESENT",
    policy_version: "1.0",
  },
  reproducibility_level: "STATISTICAL",
  success_criteria: [criterion("physical_qubits_within_ceiling")],
  refusal_criteria: [
    criterion("no_surviving_baseline", {
      metric_ref: "baseline.surviving",
      comparator: "DOES_NOT_EXIST",
      threshold: null,
      required_evidence: ["MEASURED", "USER_PROVIDED"],
      explanation: "No classical baseline survives review, so no economic comparison is drawn.",
    }),
  ],
  execution_limitations: ["One QEC scheme is modelled."],
}

const plan = seal("study_plan", StudyPlanSchema, planWithoutHash)
const planRef = { revision_hash: plan.content_hash, revision: plan.revision }
record("study-plan", plan)

// Revision 2 exists so the confirmation checks have a superseding plan to run
// against. It is produced by the shipped `revisePlan` rather than assembled
// here, because the property under test -- a revision withdraws its
// predecessor's confirmation by moving the digest, with nothing to remember to
// revoke -- is a property of that function.
const revised = taken(revisePlan(plan, { max_credits: 4000 }, plan.content_hash), "a plan revision")
record("study-plan-revision-2", revised.plan)

// ------------------------------------------------------ the confirmation receipt

const receipt = taken(
  buildConfirmationReceipt({
    plan,
    latestPlanRevision: planRef,
    shownSummaryHash: digest("1"),
    actorSubjectId: "auth0|6512abf0",
    tenantId: "tenant-14",
    oauthClientId: "ketqat-console",
    authorizationScope: ["study:estimate", "study:execute"],
    estimatedCredits: 1800,
    resourceClass: "MANAGED_SIMULATION",
    dataHandlingPolicyRevision: "dh-2026-07",
    confirmationChannel: "WEB_CONSOLE",
    confirmedAt: AT.confirmed,
    expiresAt: AT.expires,
    nonce: digest("2").slice(0, 32),
    idempotencyKey: "confirm-2026-09-01-000117",
  }),
  "a confirmation receipt",
).receipt
record("confirmation-receipt", receipt)

// --------------------------------------------------- authorization and capsule

const artifact = (changes = {}) =>
  ArtifactRefSchema.parse({
    name: "circuit.stim",
    role: "CIRCUIT",
    media_type: "text/plain",
    // A 64-bit value carried as an exact decimal string. It is here on purpose:
    // it is the value class that a canonicalizer implemented over IEEE doubles
    // silently rounds, and it has to survive a round trip through two languages.
    byte_size: "18446744073709551615",
    content_hash: digest("3"),
    resolution: { kind: "CONTENT_ADDRESSED_STORE", locator: "cas://ab/cd/ef" },
    completeness: "COMPLETE",
    partial_reason: null,
    redaction: "NONE",
    redaction_reason: null,
    ...changes,
  })

const authorization = taken(
  authoriseStudyTask({
    plan,
    receipt,
    requestedOperation: "STUDY_BENCHMARK_RUN",
    inputRefs: [artifact()],
    maxRuntime: 3600,
    maxMemoryBytes: "8589934592",
    latestPlanRevision: planRef,
    at: AT.used,
  }),
  "a task authorization",
).authorization
record("study-task-authorization", authorization)

const capsule = buildExecutionCapsule({
  studyRef: study.study_id,
  authorizationRef: authorization.content_hash,
  manifestHash: digest("8"),
  engine: { name: "ketqat-engine", version: "0.3.0" },
  adapter: { name: "stim-pymatching", version: "1.14.0" },
  sourceHash: digest("9"),
  seed: "18446744073709551615",
  environment: {
    operating_system: "Linux",
    architecture: "x86_64",
    python_version: "3.12.11",
    node_version: "22.0.0",
    packages: [{ name: "stim", version: "1.14.0" }],
    hardware: [{ name: "cpu", value: "AMD EPYC 7763" }],
  },
  inputs: [artifact()],
  outputs: [
    artifact({
      name: "measurements.json",
      role: "MEASUREMENTS",
      media_type: "application/json",
      byte_size: "4096",
      content_hash: digest("0"),
      resolution: { kind: "NOT_RETAINED", locator: null },
      completeness: "PARTIAL",
      partial_reason: "The wall-clock limit stopped the run at round 812 of 1000.",
      redaction: "REDACTED",
      redaction_reason: "Per-shot identifiers removed under data-handling policy dh-2026-07.",
    }),
  ],
  logsRef: digest("c"),
  executionClass: "SIMULATION",
  execution: {
    kind: "MANAGED_SIMULATION",
    image_digest: `sha256:${digest("4")}`,
    dependency_lock_ref: digest("5"),
    runner_version: { name: "ketqat-runner", version: "0.3.0" },
    resource_limits: { max_runtime: 3600, max_memory_bytes: "8589934592", max_credits: 2500 },
  },
  executionReceipt: {
    job_id: JOB_ID,
    attempt: 1,
    actor: "runner@example.invalid",
    started_at: AT.started,
    finished_at: AT.finished,
  },
})
record("execution-capsule", capsule)

const outcome = taken(
  recordTaskOutcome({
    authorization,
    capsule,
    terminalStatus: "SUCCEEDED",
    attempts: 1,
    createdAt: AT.finished,
  }),
  "a task outcome",
).outcome
record("task-outcome", outcome)

// -------------------------------------------------------------- evidence graph

const nodeBody = (changes = {}) => ({
  schema_version: STUDY_SCHEMA_VERSION,
  [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
  study_ref: STUDY_ID,
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
  study_ref: STUDY_ID,
  kind: "supports",
  from_node_hash: digest("a"),
  to_node_hash: digest("b"),
  asserted_by: MODEL,
  rationale: "The bound is read from the estimate rather than restated.",
  ...changes,
})

// A node's identity is the hash of its content, so a usable node is stamped
// rather than invented.
const stampNode = (body) => seal("evidence_node", EvidenceNodeSchema, body)
const stampEdge = (body) => seal("evidence_edge", EvidenceEdgeSchema, body)

const measured = (value, unit) => ({
  value,
  unit,
  bound: "UPPER_BOUND",
  evidence: "MODELLED",
  source: "Resource estimate under the base scenario.",
  model: MODEL,
  model_version: MODEL_VERSION,
  assumptions: ["Physical error rate 0.001."],
  schema_version: "0.1",
  limitations: ["Modelled, not measured. No device was run."],
})

const quantityNode = stampNode(
  nodeBody({ label: "Total physical qubits, base scenario", quantity: measured(4200000, "physical qubits") }),
)
const distanceNode = stampNode(
  nodeBody({ label: "Code distance, base scenario", quantity: measured(21, "code distance") }),
)
const resultNode = stampNode(
  nodeBody({
    kind: "result",
    label: "Resource estimate snapshot, base scenario",
    reference: { record_kind: "resource_estimate_snapshot", hash: digest("e"), record_slug: null },
  }),
)
const inputNode = stampNode(
  nodeBody({
    kind: "input",
    label: "Physical error rate 0.001",
    reference: { record_kind: "resource_scenario", hash: null, record_slug: "base-scenario" },
  }),
)
// The claim names the node its number lives in rather than carrying a copy of
// it: two copies of one decision-bearing figure are free to disagree, and the
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

const supportsEdge = stampEdge(
  edgeBody({
    from_node_hash: quantityNode.content_hash,
    to_node_hash: claimNode.content_hash,
    rationale: "The claimed ceiling is the estimate's own upper bound, not a rounding of it.",
  }),
)
const resultSupportsEdge = stampEdge(
  edgeBody({
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

const nodes = [claimNode, quantityNode, distanceNode, resultNode, inputNode]
const edges = [supportsEdge, resultSupportsEdge, derivedEdge, distanceDerivedEdge, usedInputEdge]
record("evidence-nodes", nodes)
record("evidence-edges", edges)

// ------------------------------------------------------------ research package

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

const built = taken(
  buildResearchPackage({
    studyRef: STUDY_ID,
    planRef,
    distribution: "ONLINE",
    report: {
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
          text: "At a physical error rate of 1e-4 the 4.2 million figure would be an overestimate.",
        },
      ],
    },
    tables: [
      {
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
      },
    ],
    figures: [
      {
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
                  x: {
                    kind: "NODE",
                    node_hash: distanceNode.content_hash,
                    table_id: null,
                    row_id: null,
                    column_id: null,
                  },
                  y: {
                    kind: "TABLE_CELL",
                    node_hash: null,
                    table_id: "results",
                    row_id: "base",
                    column_id: "qubits",
                  },
                },
              ],
            },
          ],
        },
        svg_artifact: null,
      },
    ],
    references: [
      {
        title: "Surface codes: towards practical large-scale quantum computation",
        authors: [],
        year: 2012,
      },
    ],
    bundleRefs: [],
    environment: { operating_system: "linux", architecture: "x86_64", packages: [], hardware: [] },
    recipe: {
      runner: "ketqat-runner",
      runner_version: "0.3.0",
      container_digest: `sha256:${digest("a")}`,
      argv: ["study", "reproduce", "--package", "research-package.json"],
      input_refs: [],
      environment_allowlist: ["KETQAT_CACHE_DIR"],
      expected_output_refs: [],
      resource_limits: { max_runtime: 3600, max_memory_bytes: "8589934592", max_credits: null },
      network_policy: "NONE",
      allowed_hosts: [],
      platform: { operating_system: "linux", architecture: "x86_64", minimum_runner_version: null },
    },
    nodes,
    edges,
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
    isDemo: true,
  }),
  "a research package",
)
record("research-package", built.package)

/**
 * The same package with one number moved and every digest left alone.
 *
 * This is the forgery a recipient must be able to detect from the file alone,
 * and it is deliberately the *cheapest* one: edit the figure a reader quotes and
 * publish. Both languages must reject it, and both must reject it for the reason
 * that is true -- the package's own contents no longer canonicalize to the
 * digest written on it -- rather than by noticing something incidental.
 *
 * A structuredClone rather than a re-build: re-building would restamp the
 * hashes, which is the *other* forgery, and that one is caught by the graph
 * rather than by the package digest.
 */
const tampered = structuredClone(built.package)
tampered.nodes.find((node) => node.content_hash === quantityNode.content_hash).quantity.value = 42
record("research-package-tampered", tampered)

/**
 * What a complete run writes, named rather than counted.
 *
 * A count would pass while a record was quietly swapped for another; the names
 * are what the two verifiers go on to read, so listing them here is the check
 * that a builder removed from this file fails loudly instead of leaving the
 * suite to verify a smaller corpus and report a pass.
 */
const EXPECTED = [
  "study",
  "study-event",
  "study-plan",
  "study-plan-revision-2",
  "confirmation-receipt",
  "study-task-authorization",
  "execution-capsule",
  "task-outcome",
  "evidence-nodes",
  "evidence-edges",
  "research-package",
  "research-package-tampered",
]
const corpusId = corpusIdOf(written)
writeRecord("corpus", { corpus_id: corpusId, records: written })
const missing = EXPECTED.filter((name) => !written.includes(name))
const extra = written.filter((name) => !EXPECTED.includes(name))
must(
  missing.length === 0 && extra.length === 0,
  `built all ${EXPECTED.length} records from the installed tarball, corpus ${corpusId.slice(0, 16)}…`,
  `missing: ${missing.join(", ") || "none"}; unexpected: ${extra.join(", ") || "none"}`,
)
done(`records written to ${RECORDS}`)
