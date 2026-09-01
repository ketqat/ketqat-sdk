#!/usr/bin/env node
/**
 * Emit cross-language digest vectors for the study hashing core.
 *
 * RFC 8785 conformance is proved independently in each language against the
 * RFC's own vectors, which settles the canonicalizer. This file settles the
 * layer above it: that the projection, the preimage header and the digest
 * compose to the same hex in both languages, for records that exercise every
 * field class and all four purposes.
 *
 * Written by TypeScript and reproduced by `python/tests/test_study_hash_core.py`
 * from the same records. A drift in either language's projection or header
 * construction fails there rather than showing up later as two verifiers
 * disagreeing about a file neither can explain.
 */
import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  artifactHash,
  receiptHash,
  recordHash,
  semanticHash,
  studySelfHash,
} from "../dist/study/hash.js"
import { studyCanonicalBody } from "../dist/study/hash.js"
import { STUDY_HASH_RULES_ID } from "../dist/study/rules.js"
import { STUDY_RECORD_KINDS } from "../dist/study/registry.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SCHEMA_VERSION = "1.0"

/**
 * The stable opaque ids the family references aggregates by.
 *
 * Not `digest(n)` like every other reference here: a study id and a project ref
 * are lowercase version 4 UUIDs, and hashing a 64-hex string in their place
 * would pin a vector no real record could reproduce.
 */
const STUDY_ID = "9b1d5c40-2ea7-4b6f-8c31-7f0a6d2e4b58"
const PROJECT_REF = "2c7f5a91-4d68-4e02-b9a4-30f18c6b7d25"
const SUPERSEDING_STUDY_ID = "0f3b7d24-91ca-4e58-a7d0-5b6e2c419f83"
const JOB_ID = "6d4f2a18-53bc-4e79-9a02-8f31c7e05b46"

const hex = (value) => "0123456789abcdef"[value % 16]
const digest = (seed) => Array.from({ length: 64 }, (_, index) => hex(seed + index)).join("")

/**
 * One record per kind, carrying every field its kind declares.
 *
 * A partial record would leave whole field classes unexercised, and a vector
 * that never reaches a class cannot show the two languages agreeing about it.
 */
const quantity = {
  value: 1e-3,
  unit: "logical_error_rate",
  bound: "ESTIMATE",
  evidence: "MODELLED",
  source: "resource-model",
  model: "surface-code",
  model_version: "0.4.1",
  assumptions: ["p=1e-3", "round-trip"],
  created_at: "2026-08-01T00:00:00.000Z",
  schema_version: "0.1",
  uncertainty: { kind: "INTERVAL", low: 9e-4, high: 1.1e-3, basis: "bootstrap" },
  limitations: ["single decoder"],
}

/**
 * The structured halves of a specification and a plan.
 *
 * Every one of them is a nested shape whose fields are classified separately
 * from the field that carries them, so a vector that left them out would leave
 * the composition rule -- outer class selects, inner class strips annotation --
 * unexercised in both languages. `answer_provenance.recorded_at` is the only
 * `RECEIPT_ONLY` field nested under a `SEMANTIC` one anywhere in the family,
 * which is the case that separates the semantic projection from the record one
 * below the top level.
 */
const criterion = {
  criterion_id: "logical_error_rate_target",
  metric_ref: "decoder.logical_error_rate",
  comparator: "AT_MOST",
  threshold: { dimension: "QUBITS", value: 4200000, exact_value: null, unit: "physical qubits" },
  required_evidence: ["MODELLED", "DERIVED"],
  status: "NOT_RUN",
  explanation: "p_L below target",
}

const refusalCriterion = {
  criterion_id: "decoder_unavailable",
  metric_ref: "decoder.available",
  comparator: "IS_FALSE",
  threshold: null,
  required_evidence: ["MEASURED"],
  status: "NOT_RUN",
  explanation: "decoder unavailable",
}

const openQuestion = {
  question_id: "decoder_latency",
  targets: "runtime_constraint",
  question: "which decoder latency is acceptable?",
  answer_type: "QUANTITY",
  requirement: "REQUIRED",
  why_needed: "the runtime constraint cannot be sized without it",
  blocks: ["PLAN_CONSTRUCTION", "PLAN_CONFIRMATION"],
  allowed_choices: null,
  answer_provenance: {
    source: "USER",
    actor: "curator@example.invalid",
    reference: "intake call, 2026-08-30",
    recorded_at: "2026-08-31T10:00:00.000Z",
  },
  resolution: "ANSWERED",
}

const versionPin = (name, version, seed) => ({
  package_name: name,
  package_version: version,
  artifact_digest: `sha256:${digest(seed)}`,
  source_commit: digest(seed + 1).slice(0, 40),
  container_digest: `sha256:${digest(seed + 2)}`,
  model_snapshot_hash: digest(seed + 3),
  schema_hash: digest(seed + 4),
  adapter_configuration_hash: digest(seed + 5),
})

const dataHandling = {
  visibility: "PRIVATE",
  retention: { kind: "DELETE_AFTER_DAYS", days: 90 },
  third_party_transfer: "NAMED_PROCESSORS",
  model_training_use: "FORBIDDEN",
  public_dataset_opt_in: false,
  allowed_egress: [{ kind: "NAMED_HOST", host: "results.example.invalid" }],
  export_permission: "HASHES_ONLY",
  deletion_policy: { kind: "ON_REQUEST", within_days: 7 },
  secret_handling: "PER_JOB_NEVER_PERSISTED",
  pii_handling: "NONE_PRESENT",
  policy_version: "1.0",
}

const citation = {
  title: "A paper",
  authors: ["Ada", "Grace"],
  year: 2026,
  doi: "10.0000/x",
  url: "https://example.invalid/x",
  bibtex: "@article{x}",
}

/**
 * One input and one output, between them exercising every branch of the artifact
 * reference: both resolutions that carry a locator and the one that carries
 * none, complete and partial, unredacted and redacted, and a byte size past 2^53
 * where a JSON number would be a double here and an integer in Python.
 */
const artifactInput = {
  name: "circuit.stim",
  role: "CIRCUIT",
  media_type: "text/plain",
  byte_size: "18446744073709551615",
  content_hash: digest(48),
  resolution: { kind: "CONTENT_ADDRESSED_STORE", locator: "cas://ab/cd/ef" },
  completeness: "COMPLETE",
  partial_reason: null,
  redaction: "NONE",
  redaction_reason: null,
}

const artifactOutput = {
  name: "measurements.json",
  role: "MEASUREMENTS",
  media_type: "application/json",
  byte_size: "4096",
  content_hash: digest(49),
  resolution: { kind: "NOT_RETAINED", locator: null },
  completeness: "PARTIAL",
  partial_reason: "the wall-clock limit stopped the run at round 812 of 1000",
  redaction: "REDACTED",
  redaction_reason: "per-shot identifiers removed under data-handling policy dh-2026-07",
}

const environment = {
  operating_system: "linux",
  architecture: "arm64",
  python_version: "3.11.9",
  node_version: "22.11.0",
  packages: [{ name: "stim", version: "1.13.0" }],
  hardware: [{ name: "cpu", value: "apple-m2" }],
}

const evidenceNode = {
  schema_version: SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_ref: STUDY_ID,
  kind: "MEASURED_RESULT",
  label: "logical error rate at d=7",
  visibility: "PUBLIC",
  claim: {
    subject_ref: { record_kind: "quantum_workload", hash: digest(43), record_slug: "surface-code-memory" },
    metric: "p_L",
    comparator: "LESS_THAN",
    value_ref: { kind: "value_node", node_hash: digest(44), field_path: null },
  },
  quantity,
  reference: { record_kind: "qec_benchmark_result", hash: digest(2), record_slug: "run-7" },
  citation,
  limitations: ["one seed"],
  source_published_on: "2026-05-01",
  retrieved_on: "2026-08-30",
  created_at: "2026-08-31T12:00:00.000Z",
  content_hash: digest(3),
}

const reviewRecord = {
  schema_version: SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_ref: STUDY_ID,
  subject_node_hash: digest(45),
  verdict: "CHANGES_REQUESTED",
  rationale: "the decoder version is not pinned",
  reviewer: "reviewer@example.invalid",
  created_at: "2026-08-31T12:20:00.000Z",
  content_hash: digest(46),
}

const reproductionRecord = {
  schema_version: SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_ref: STUDY_ID,
  original_node_hash: digest(47),
  reproduction_capsule_ref: digest(48),
  observed_node_hash: digest(49),
  outcome: "DIVERGED",
  notes: "p_L differed by 4% at d=7",
  asserted_by: "runner@example.invalid",
  created_at: "2026-08-31T12:30:00.000Z",
  content_hash: digest(50),
}

const evidenceEdge = {
  schema_version: SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_ref: STUDY_ID,
  kind: "SUPPORTS",
  from_node_hash: digest(4),
  to_node_hash: digest(5),
  asserted_by: "reviewer@example.invalid",
  rationale: "the run measures the claimed metric",
  created_at: "2026-08-31T12:05:00.000Z",
  content_hash: digest(6),
}

const records = {
  study: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_id: STUDY_ID,
    core: { study_type: "QEC", project_ref: PROJECT_REF, is_demo: false },
    presentation: {
      title: "Surface code memory",
      status: "DRAFT",
      latest_specification: { revision_hash: digest(8), revision: 2 },
      latest_plan: { revision_hash: digest(9), revision: 1 },
    },
    created_at: "2026-08-31T10:00:00.000Z",
    content_hash: digest(10),
  },
  // Every payload field any event variant can carry, on one record.
  //
  // No variant of `StudyEventSchema` declares all of these together, and this
  // record is not meant to parse as one: the vectors are about the projection,
  // which reads the fields the *kind* declares, and a vector that reached only
  // one variant's payload would leave nine declared fields unexercised across
  // the language boundary. Two of the records below are the same shape of
  // deliberate -- `execution_capsule.execution` carries every branch of its own
  // union, and `evidence_node.kind` carries a value its schema would refuse.
  study_event: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    event_type: "plan_superseded",
    sequence: 3,
    previous_event_hash: digest(11),
    from_status: "PLANNED",
    to_status: "PLANNED",
    actor: "curator@example.invalid",
    reason: "specification confirmed",
    specification_ref: { revision_hash: digest(8), revision: 2 },
    plan_ref: { revision_hash: digest(9), revision: 1 },
    superseded_plan_ref: { revision_hash: digest(15), revision: 0 },
    confirmed_hash: digest(38),
    receipt_ref: digest(53),
    task_ref: digest(39),
    capsule_ref: digest(40),
    package_ref: digest(41),
    reproduction_capsule_ref: digest(42),
    superseding_study_ref: SUPERSEDING_STUDY_ID,
    question: "which decoder latency is acceptable?",
    review_verdict: "ACCEPTED",
    created_at: "2026-08-31T10:30:00.000Z",
    content_hash: digest(12),
  },
  problem_specification: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    revision: 2,
    supersedes: digest(13),
    objective: { value: "reach p_L < 1e-9", evidence: "REPORTED", origin: "CONFIRMED" },
    success_criteria: [
      { statement: { value: "d=15 fits budget", evidence: "MODELLED", origin: "INFERRED" }, predicate: criterion },
    ],
    accuracy_requirement: { quantity, origin: "CONFIRMED" },
    runtime_constraint: { quantity, origin: "INFERRED" },
    budget_constraint: { quantity, origin: "INFERRED" },
    problem_size: { quantity, origin: "CONFIRMED" },
    current_classical_method: { value: "MWPM", evidence: "REPORTED", origin: "CONFIRMED" },
    why_quantum: { value: "scaling", evidence: "MODELLED", origin: "INFERRED" },
    open_questions: [openQuestion],
    limitations: ["circuit-level noise only"],
    created_at: "2026-08-31T11:00:00.000Z",
    content_hash: digest(14),
  },
  study_plan: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    specification_ref: { revision_hash: digest(8), revision: 2 },
    revision: 1,
    supersedes: digest(15),
    baselines: [{ baseline_ref: digest(16), source_class: "PUBLISHED", note: "from the paper" }],
    candidates: [{ name: "mwpm", workload_ref: digest(17), rationale: "the obvious decoder" }],
    scenario_refs: [digest(18)],
    pinned_versions: {
      adapter: versionPin("stim", "1.13.0", 60),
      model: versionPin("surface-code", "0.4.1", 66),
      engine: versionPin("ketqat", "0.3.0", 72),
    },
    expected_runtime: quantity,
    expected_credits: quantity,
    max_credits: 100,
    data_handling: dataHandling,
    reproducibility_level: "EXACT",
    success_criteria: [criterion],
    refusal_criteria: [refusalCriterion],
    execution_limitations: ["single machine"],
    created_at: "2026-08-31T11:30:00.000Z",
    content_hash: digest(19),
  },
  confirmation_receipt: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    plan_ref: { revision_hash: digest(9), revision: 1 },
    plan_semantic_hash: digest(43),
    shown_summary_hash: digest(44),
    authorization_scope: ["study:estimate", "study:execute"],
    estimated_credits: 42.5,
    max_credits: 100,
    resource_class: "HARDWARE",
    data_handling_policy_revision: "dh-2026-07",
    expires_at: "2026-09-07T12:00:00.000Z",
    limitations: ["not a signature by the actor named"],
    attestation_level: "hash_only",
    actor_subject_id: "auth0|6512abf0",
    tenant_id: "tenant-14",
    oauth_client_id: "ketqat-console",
    confirmation_channel: "WEB_CONSOLE",
    confirmed_at: "2026-08-31T11:45:00.000Z",
    nonce: digest(46).slice(0, 32),
    idempotency_key: "confirm-2026-08-31-000117",
    content_hash: digest(45),
  },
  study_task_authorization: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    plan_ref: { revision_hash: digest(9), revision: 1 },
    confirmation_receipt_ref: digest(45),
    requested_operation: "STUDY_BENCHMARK_RUN",
    input_refs: [artifactInput],
    resource_ceiling: {
      max_credits: 100,
      max_runtime: 3600,
      max_memory_bytes: "9223372036854775807",
      resource_class: "HARDWARE",
    },
    created_at: "2026-08-31T11:46:00.000Z",
    content_hash: digest(47),
  },
  task_outcome: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    authorization_ref: digest(47),
    capsule_ref: digest(30),
    terminal_status: "SUCCEEDED",
    reason: null,
    attempts: 2,
    created_at: "2026-08-31T12:10:02.000Z",
    content_hash: digest(50),
  },
  evidence_node: evidenceNode,
  evidence_edge: evidenceEdge,
  review_record: reviewRecord,
  reproduction_record: reproductionRecord,
  execution_capsule: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: STUDY_ID,
    authorization_ref: digest(47),
    manifest_hash: digest(23),
    versions: {
      schema: "0.1",
      adapter: { name: "stim", version: "1.13.0" },
      engine: { name: "ketqat", version: "0.3.0" },
    },
    source_hash: digest(24),
    // A genuine 64-bit seed, which is what the exact-integer-string contract
    // exists for: as a JSON number this is the nearest double in JavaScript and
    // the integer as written in Python, so the same capsule would take two
    // digests. As digits both languages hash what the file contains.
    seed: "18446744073709551615",
    environment,
    inputs: [artifactInput],
    outputs: [artifactOutput],
    execution_class: "HARDWARE",
    // Every field any execution class can carry, on one envelope, for the same
    // reason the event above carries every payload: the vectors are about the
    // projection, which reads the fields the *kind* declares, and an envelope
    // that reached only the hardware branch would leave six declared fields
    // unexercised across the language boundary.
    execution: {
      kind: "HARDWARE",
      image_digest: `sha256:${digest(25)}`,
      dependency_lock_ref: digest(26),
      runner_version: { name: "ketqat-runner", version: "0.3.0" },
      resource_limits: {
        max_runtime: 3600,
        // Past 2^53, so the vector exercises the contract rather than a byte
        // count that would have fitted in a double anyway.
        max_memory_bytes: "9223372036854775807",
        max_credits: 100,
      },
      attestation_limitation: "run on an operator machine; the installed packages are recorded, not attested",
      provider_adapter: { name: "ionq", version: "2.1.0" },
      backend_snapshot: { provider: "ionq", backend: "aria-1", snapshot_hash: digest(51) },
      confirmation_receipt_ref: digest(45),
      provider_result_ref: digest(52),
      cost_confirmation: {
        credits_charged: 40.25,
        authorized_maximum: 100,
        source: "PROVIDER_REPORTED",
      },
      quota_confirmation: {
        quota: "monthly_shots",
        within_quota: true,
        source: "PROVIDER_REPORTED",
        exceeded_reason: null,
      },
    },
    logs_ref: digest(29),
    cancellation: { cancelled: false, reason: "" },
    attestation_level: "hash_only",
    execution_receipt: {
      job_id: JOB_ID,
      attempt: 2,
      actor: "runner@example.invalid",
      started_at: "2026-08-31T12:00:00.000Z",
      finished_at: "2026-08-31T12:10:00.000Z",
    },
    created_at: "2026-08-31T12:10:01.000Z",
    reproducibility_hash: digest(30),
  },
  // Exercises every nested shape the package gained with the structured report:
  // all eight segment kinds, both table column roles, both figure value-ref
  // kinds, a recipe with typed artifact references, an embedded bundle, a claim
  // naming a bundle field, and a ledger entry that did not run. A vector that
  // covered only the fields the previous shape had would pin the projection for
  // the parts that did not change.
  research_package: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    package_kind: "research_package",
    distribution: "OFFLINE_EXPORT",
    study_ref: STUDY_ID,
    plan_ref: { revision_hash: digest(9), revision: 1 },
    report: {
      sections: [
        {
          section_id: "findings",
          title: "Findings",
          segments: [
            { kind: "HEADING", level: 1, text: "Memory", node_hash: null, citation_index: null, limitation_index: null, table_id: null, figure_id: null },
            { kind: "PROSE", level: null, text: "The decoder reaches", node_hash: null, citation_index: null, limitation_index: null, table_id: null, figure_id: null },
            { kind: "QUANTITY_REF", level: null, text: null, node_hash: digest(31), citation_index: null, limitation_index: null, table_id: null, figure_id: null },
            { kind: "CLAIM_REF", level: null, text: null, node_hash: digest(34), citation_index: null, limitation_index: null, table_id: null, figure_id: null },
            { kind: "CITATION_REF", level: null, text: null, node_hash: null, citation_index: 0, limitation_index: null, table_id: null, figure_id: null },
            { kind: "LIMITATION_REF", level: null, text: null, node_hash: null, citation_index: null, limitation_index: 0, table_id: null, figure_id: null },
            { kind: "TABLE_REF", level: null, text: null, node_hash: null, citation_index: null, limitation_index: null, table_id: "results", figure_id: null },
            { kind: "FIGURE_REF", level: null, text: null, node_hash: null, citation_index: null, limitation_index: null, table_id: null, figure_id: "threshold" },
          ],
        },
      ],
      commentary: [
        { commentary_id: "outlook", title: "Outlook", text: "At 1e-4 the picture changes." },
      ],
    },
    tables: [
      {
        table_id: "results",
        caption: "Logical error rate by distance.",
        role: "RESULTS",
        columns: [
          { column_id: "distance", header: "Distance", role: "LABEL", unit: null },
          { column_id: "p_l", header: "Logical error rate", role: "VALUE", unit: "probability" },
        ],
        rows: [
          {
            row_id: "d7",
            cells: [
              { column_id: "distance", text: "7", node_hash: null },
              { column_id: "p_l", text: null, node_hash: digest(32) },
            ],
          },
        ],
        csv_artifact: { media_type: "text/csv", byte_size: "96", content_hash: digest(51) },
      },
    ],
    figures: [
      {
        figure_id: "threshold",
        title: "Threshold",
        caption: "Logical error rate against distance.",
        spec: {
          kind: "LINE",
          x_axis: { label: "Distance", unit: null },
          y_axis: { label: "Logical error rate", unit: "probability" },
          series: [
            {
              series_id: "base",
              label: "Base noise",
              points: [
                {
                  x: { kind: "NODE", node_hash: digest(52), table_id: null, row_id: null, column_id: null },
                  y: { kind: "TABLE_CELL", node_hash: null, table_id: "results", row_id: "d7", column_id: "p_l" },
                },
              ],
            },
          ],
        },
        svg_artifact: { media_type: "image/svg+xml", byte_size: "512", content_hash: digest(53) },
      },
    ],
    references: [citation],
    bundle_refs: [
      {
        bundle_kind: "RESOURCE_INTELLIGENCE",
        reproducibility_hash: digest(33),
        embedded: {
          media_type: "application/json",
          byte_size: "2",
          content_hash: digest(54),
          base64: "e30=",
        },
      },
    ],
    environment,
    recipe: {
      runner: "ketqat-runner",
      runner_version: "0.3.0",
      container_digest: `sha256:${digest(55)}`,
      argv: ["run", "examples/qec/surface-code-memory.yaml"],
      input_refs: [artifactInput],
      environment_allowlist: ["KETQAT_CACHE_DIR"],
      expected_output_refs: [artifactOutput],
      resource_limits: { max_runtime: 3600, max_memory_bytes: "9223372036854775807", max_credits: 100 },
      network_policy: "ALLOWLIST",
      allowed_hosts: ["api.example.invalid"],
      platform: { operating_system: "linux", architecture: "arm64", minimum_runner_version: "0.3.0" },
    },
    nodes: [evidenceNode],
    edges: [evidenceEdge],
    claim_evidence_map: [
      {
        claim_node_hash: digest(34),
        evidence_node_hashes: [digest(35)],
        edge_hashes: [digest(36)],
        bundle_fields: [{ bundle_hash: digest(33), field_path: "estimates[0].runtime.value" }],
      },
    ],
    reviews: [reviewRecord],
    reproductions: [reproductionRecord],
    check_ledger: [
      {
        check_id: "graph_structure",
        status: "PASS",
        requirement: "REQUIRED",
        tool: { name: "ketqat-sdk", version: "0.3.0" },
        input_refs: [digest(56)],
        output_ref: null,
        reason: "",
        limitations: ["structural only"],
        observed_at: "2026-08-31T12:59:00.000Z",
      },
      {
        check_id: "hardware_reproduction",
        status: "NOT_RUN",
        requirement: "OPTIONAL",
        tool: { name: "ketqat-runner", version: "0.3.0" },
        input_refs: [],
        output_ref: null,
        reason: "no device was booked",
        limitations: [],
        observed_at: "2026-08-31T12:59:30.000Z",
      },
    ],
    limitations: ["one decoder"],
    is_demo: false,
    created_at: "2026-08-31T13:00:00.000Z",
    reproducibility_hash: digest(37),
  },
}

const artifacts = [
  { label: "csv", record_kind: "research_package", text: "label,value\r\np_L,1e-3\r\n" },
  { label: "svg", record_kind: "research_package", text: "<svg/>" },
  { label: "empty", record_kind: "execution_capsule", text: "" },
  { label: "utf8", record_kind: "evidence_node", text: "é😀€" },
]

const HASH_FOR_PURPOSE = { semantic: semanticHash, record: recordHash, receipt: receiptHash }

/**
 * The three record purposes, each either a body and a digest or a refusal code.
 *
 * A purpose a record kind refuses is pinned as a refusal rather than dropped,
 * because "this kind has no semantic content" is a fact the other language has
 * to agree about too. A `study_event` is entirely audit evidence, so its
 * semantic projection reads no field and the digest would be one constant for
 * every event ever written -- `EMPTY_PROJECTION` says so instead.
 */
function purposesFor(recordKind, record) {
  const canonical_bodies = {}
  const digests = {}
  const refusals = {}
  for (const [purpose, hash] of Object.entries(HASH_FOR_PURPOSE)) {
    try {
      canonical_bodies[purpose] = studyCanonicalBody(recordKind, record, purpose)
      digests[purpose] = hash(recordKind, record)
    } catch (error) {
      if (error.code === undefined) throw error
      refusals[purpose] = error.code
    }
  }
  return { canonical_bodies, digests, refusals }
}

const vectors = {
  note:
    "Written by scripts/generate-study-hash-vectors.mjs, verified in place by " +
    "tests/study-hash-core.test.mjs and reproduced by python/tests/test_study_hash_core.py from the " +
    "same records. RFC 8785 conformance is proved separately and independently in each language; " +
    "these vectors settle the layer above it -- that the projection, the preimage header and the " +
    "digest compose to the same hex in both. Both languages check this file, so a change on either " +
    "side that moves a digest fails on that side rather than waiting for the other to notice.",
  schema_version: SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  records: STUDY_RECORD_KINDS.map((entry) => {
    const recordKind = entry.record_kind
    const record = records[recordKind]
    if (record === undefined) {
      // A kind with no vector is a kind nothing checks across the boundary.
      throw new Error(`No vector record for declared record kind ${recordKind}.`)
    }
    return {
      record_kind: recordKind,
      // Which of the four a record of this kind writes into its own hash field,
      // pinned here so the choice is a fact both languages check rather than one
      // each of them makes. A builder and a verifier that picked different
      // purposes would disagree about every record ever written.
      self_hash: {
        field: entry.self_hash_field,
        purpose: entry.self_hash_purpose,
        digest: studySelfHash(recordKind, record),
      },
      record,
      ...purposesFor(recordKind, record),
    }
  }),
  artifacts: artifacts.map((entry) => ({
    ...entry,
    digest: artifactHash(entry.record_kind, new TextEncoder().encode(entry.text), SCHEMA_VERSION),
  })),
}

writeFileSync(
  resolve(root, "fixtures", "study", "hash-core-vectors.json"),
  `${JSON.stringify(vectors, null, 2)}\n`,
)
