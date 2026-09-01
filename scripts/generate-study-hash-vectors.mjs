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

const citation = {
  title: "A paper",
  authors: ["Ada", "Grace"],
  year: 2026,
  doi: "10.0000/x",
  url: "https://example.invalid/x",
  bibtex: "@article{x}",
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
  study_ref: digest(1),
  kind: "MEASURED_RESULT",
  label: "logical error rate at d=7",
  claim: { subject: "surface code", metric: "p_L", comparator: "LESS_THAN", value: quantity },
  quantity,
  reference: { record_kind: "qec_benchmark_result", hash: digest(2), record_slug: "run-7" },
  citation,
  limitations: ["one seed"],
  source_published_on: "2026-05-01",
  retrieved_on: "2026-08-30",
  created_at: "2026-08-31T12:00:00.000Z",
  content_hash: digest(3),
}

const evidenceEdge = {
  schema_version: SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_ref: digest(1),
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
    study_type: "QEC",
    title: "Surface code memory",
    project_ref: digest(7),
    is_demo: false,
    status: "DRAFT",
    latest_specification: { revision_hash: digest(8), revision: 2 },
    latest_plan: { revision_hash: digest(9), revision: 1 },
    created_at: "2026-08-31T10:00:00.000Z",
    content_hash: digest(10),
  },
  study_event: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: digest(1),
    sequence: 3,
    previous_event_hash: digest(11),
    from_status: "DRAFT",
    to_status: "PLANNED",
    actor: "curator@example.invalid",
    reason: "specification confirmed",
    plan_ref: { revision_hash: digest(9), revision: 1 },
    created_at: "2026-08-31T10:30:00.000Z",
    content_hash: digest(12),
  },
  problem_specification: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: digest(1),
    revision: 2,
    supersedes: digest(13),
    objective: { value: "reach p_L < 1e-9", evidence: "REPORTED", origin: "CONFIRMED" },
    success_criteria: [{ value: "d=15 fits budget", evidence: "MODELLED", origin: "INFERRED" }],
    accuracy_requirement: { quantity, origin: "CONFIRMED" },
    runtime_constraint: { quantity, origin: "INFERRED" },
    budget_constraint: { quantity, origin: "INFERRED" },
    problem_size: { quantity, origin: "CONFIRMED" },
    current_classical_method: { value: "MWPM", evidence: "REPORTED", origin: "CONFIRMED" },
    why_quantum: { value: "scaling", evidence: "MODELLED", origin: "INFERRED" },
    open_questions: ["decoder latency"],
    limitations: ["circuit-level noise only"],
    created_at: "2026-08-31T11:00:00.000Z",
    content_hash: digest(14),
  },
  study_plan: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: digest(1),
    specification_ref: { revision_hash: digest(8), revision: 2 },
    revision: 1,
    supersedes: digest(15),
    baselines: [{ baseline_ref: digest(16), source_class: "PUBLISHED", note: "from the paper" }],
    candidates: [{ name: "mwpm", workload_ref: digest(17), rationale: "the obvious decoder" }],
    scenario_refs: [digest(18)],
    pinned_versions: {
      adapter: { name: "stim", version: "1.13.0" },
      model: { name: "surface-code", version: "0.4.1" },
      engine: { name: "ketqat", version: "0.3.0" },
    },
    expected_runtime: quantity,
    expected_credits: quantity,
    max_credits: 100,
    data_handling: "no personal data",
    reproducibility_level: "EXACT",
    success_criteria: ["p_L below target"],
    refusal_criteria: ["decoder unavailable"],
    execution_limitations: ["single machine"],
    created_at: "2026-08-31T11:30:00.000Z",
    content_hash: digest(19),
  },
  study_task: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: digest(1),
    kind: "SIMULATION",
    plan_ref: { revision_hash: digest(9), revision: 1 },
    capsule_ref: digest(20),
    status: "PENDING",
    created_at: "2026-08-31T11:45:00.000Z",
    content_hash: digest(21),
  },
  evidence_node: evidenceNode,
  evidence_edge: evidenceEdge,
  execution_capsule: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: digest(1),
    task_ref: digest(22),
    manifest_hash: digest(23),
    versions: {
      schema: "0.1",
      adapter: { name: "stim", version: "1.13.0" },
      engine: { name: "ketqat", version: "0.3.0" },
    },
    source_hash: digest(24),
    image_digest: `sha256:${digest(25)}`,
    dependency_lock_ref: digest(26),
    // A genuine 64-bit seed, which is what the exact-integer-string contract
    // exists for: as a JSON number this is the nearest double in JavaScript and
    // the integer as written in Python, so the same capsule would take two
    // digests. As digits both languages hash what the file contains.
    seed: "18446744073709551615",
    environment,
    resource_limits: {
      max_runtime: 3600,
      // Past 2^53, so the vector exercises the contract rather than a byte count
      // that would have fitted in a double anyway.
      max_memory_bytes: "9223372036854775807",
      max_credits: 100,
    },
    input_hashes: [digest(27)],
    output_hashes: [digest(28)],
    logs_ref: digest(29),
    execution_class: "SIMULATED",
    cancellation: { cancelled: false, reason: "" },
    attestation_level: "hash_only",
    started_at: "2026-08-31T12:00:00.000Z",
    finished_at: "2026-08-31T12:10:00.000Z",
    created_at: "2026-08-31T12:10:01.000Z",
    reproducibility_hash: digest(30),
  },
  research_package: {
    schema_version: SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    package_kind: "research_package",
    study_ref: digest(1),
    plan_ref: { revision_hash: digest(9), revision: 1 },
    report_markdown: "# Report\n\nText.\n",
    methods: "Stim + PyMatching.",
    assumption_rows: [{ label: "noise", node_hash: digest(31) }],
    result_rows: [{ label: "p_L", node_hash: digest(32) }],
    csv: "label,value\r\np_L,1e-3\r\n",
    figures: [{ label: "threshold", svg: "<svg/>" }],
    references: [citation],
    bundle_refs: [digest(33)],
    environment,
    reproduction_command: "ketqat run examples/qec/surface-code-memory.yaml",
    nodes: [evidenceNode],
    edges: [evidenceEdge],
    claim_evidence_map: [
      { claim_node_hash: digest(34), evidence_node_hashes: [digest(35)], edge_hashes: [digest(36)] },
    ],
    limitations: ["one decoder"],
    failed_checks: [],
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
