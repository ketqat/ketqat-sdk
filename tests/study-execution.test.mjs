import assert from "node:assert/strict"
import test from "node:test"
import { quantity } from "../dist/index.js"
import { STUDY_SCHEMA_VERSION } from "../dist/study/common.js"
import { semanticHash, studySelfHash } from "../dist/study/hash.js"
import { STUDY_HASH_RULES_ID } from "../dist/study/rules.js"
import { buildStudy } from "../dist/study/study.js"
import { StudyPlanSchema, revisePlan } from "../dist/study/plan.js"
import {
  CONFIRMATION_RECEIPT_LIMITATIONS,
  ConfirmationReceiptSchema,
  buildConfirmationReceipt,
  receiptGrantsScope,
  verifyConfirmationReceipt,
} from "../dist/study/receipt.js"
import { ArtifactRefSchema, duplicateArtifactNames } from "../dist/study/artifact.js"
import { isAuthenticatedSubject } from "../dist/study/identity.js"
import { STUDY_CONTROL_PLANE_KINDS, STUDY_CONTROL_PLANE_KIND_NAMES } from "../dist/study/registry.js"
import {
  EXECUTION_EVIDENCE_REQUIREMENTS,
  ExecutionCapsuleSchema,
  buildExecutionCapsule,
  verifyExecutionCapsule,
} from "../dist/study/capsule.js"
import {
  STUDY_EXECUTION_JOB_TERMINAL_STATUSES,
  STUDY_OPERATION_SCOPES,
  StudyExecutionJobSchema,
  StudyTaskAuthorizationSchema,
  TaskOutcomeSchema,
  authoriseStudyTask,
  recordTaskOutcome,
  verifyTaskAuthorizationChain,
} from "../dist/study/task.js"

/**
 * Authorization and execution (goal §7, §8, §15).
 *
 * Three properties are under test here, and each one existed as a hole before
 * the records below did.
 *
 * **A bare plan hash cannot authorise a run.** It answers whether the contents
 * approved are the contents that would run, and nothing about who approved,
 * through which client, under which scope, having been shown what, or until
 * when. A `ConfirmationReceipt` answers all of them and says in its own
 * `limitations` that it is not a signature.
 *
 * **A task's identity does not change when it runs.** The retired `StudyTask`
 * mixed an authorization with a mutable status and a capsule reference that
 * appeared afterwards, so content-addressing it meant the digest moved exactly
 * when everything else began pointing at it. The split -- authorization, job,
 * outcome, capsule -- is what makes the digest stand still, and the test below
 * runs a whole execution and compares the authorization's hash before and after.
 *
 * **A capsule cannot omit the evidence its execution class is supposed to
 * carry.** A managed run's image digest and a hardware run's cost confirmation
 * are not optional fields somebody forgot; a capsule missing them is a record
 * that looks like the stronger kind of evidence and is not.
 */

const MODEL = "ketqat-execution-test"
const VERSION = "0.1.0"

const STUDY_ID = "8c1a4d02-73e5-4f19-9b46-2a0d7e315c8f"
const PROJECT_REF = "1f6b3e57-0d94-4c28-83a7-5e91b024df6a"
const JOB_ID = "b2e7c410-9d35-4a86-9f13-6c04e8a5b72d"

const ISO = {
  confirmed: "2026-09-01T09:00:00.000Z",
  expires: "2026-09-08T09:00:00.000Z",
  beforeExpiry: "2026-09-02T09:00:00.000Z",
  afterExpiry: "2026-09-09T09:00:00.000Z",
  started: "2026-09-02T09:05:00.000Z",
  finished: "2026-09-02T09:41:30.000Z",
}

const digest = (character) => character.repeat(64)

/** Stamp then hash, in the order every builder in the family uses. */
function seal(recordKind, schema, withoutHash) {
  return schema.parse({ ...withoutHash, content_hash: studySelfHash(recordKind, withoutHash) })
}

const clone = (value) => JSON.parse(JSON.stringify(value))

/** Remove a dotted path from a deep copy, for the missing-evidence proofs below. */
function without(record, path) {
  const copy = clone(record)
  const segments = path.split(".")
  let current = copy
  for (const segment of segments.slice(0, -1)) current = current[segment]
  delete current[segments[segments.length - 1]]
  return copy
}

const study = buildStudy({
  studyId: STUDY_ID,
  title: "Does the shot budget survive a real device?",
  core: { study_type: "FTQC_FEASIBILITY", project_ref: PROJECT_REF, is_demo: true },
})

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

const dataHandlingPolicy = {
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
}

function planCore(changes = {}) {
  return {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
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
    expected_runtime: quantity({ value: 0.432, unit: "seconds", evidence: "MODELLED", source: "Runtime model.", model: MODEL, modelVersion: VERSION }),
    expected_credits: quantity({ value: 1800, unit: "credits", evidence: "DERIVED", source: "Runtime at the pinned tariff.", model: MODEL, modelVersion: VERSION }),
    max_credits: 2500,
    data_handling: dataHandlingPolicy,
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
    ...changes,
  }
}

const plan = seal("study_plan", StudyPlanSchema, planCore())
const planRef = { revision_hash: plan.content_hash, revision: plan.revision }

function receiptInput(changes = {}) {
  return {
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
    confirmedAt: ISO.confirmed,
    expiresAt: ISO.expires,
    nonce: digest("2").slice(0, 32),
    idempotencyKey: "confirm-2026-09-01-000117",
    ...changes,
  }
}

const okReceipt = (result) => {
  assert.equal(result.ok, true, result.ok ? "" : result.refusal.message)
  return result.receipt
}

const okAuthorization = (result) => {
  assert.equal(result.ok, true, result.ok ? "" : result.refusal.message)
  return result.authorization
}

const receipt = okReceipt(buildConfirmationReceipt(receiptInput()))

const artifact = (changes = {}) =>
  ArtifactRefSchema.parse({
    name: "circuit.stim",
    role: "CIRCUIT",
    media_type: "text/plain",
    byte_size: "18446744073709551615",
    content_hash: digest("3"),
    resolution: { kind: "CONTENT_ADDRESSED_STORE", locator: "cas://ab/cd/ef" },
    completeness: "COMPLETE",
    partial_reason: null,
    redaction: "NONE",
    redaction_reason: null,
    ...changes,
  })

const authorization = okAuthorization(
  authoriseStudyTask({
    plan,
    receipt,
    requestedOperation: "STUDY_BENCHMARK_RUN",
    inputRefs: [artifact()],
    maxRuntime: 3600,
    maxMemoryBytes: "8589934592",
    latestPlanRevision: planRef,
    at: ISO.beforeExpiry,
  }),
)

const environment = {
  operating_system: "Linux",
  architecture: "x86_64",
  python_version: "3.11.9",
  node_version: "22.14.0",
  packages: [{ name: "stim", version: "1.14.0" }],
  hardware: [{ name: "cpu", value: "AMD EPYC 7763" }],
}

const executionReceipt = {
  job_id: JOB_ID,
  attempt: 1,
  actor: "runner@example.invalid",
  started_at: ISO.started,
  finished_at: ISO.finished,
}

const managedExecution = {
  kind: "MANAGED_SIMULATION",
  image_digest: `sha256:${digest("4")}`,
  dependency_lock_ref: digest("5"),
  runner_version: { name: "ketqat-runner", version: "0.3.0" },
  resource_limits: { max_runtime: 3600, max_memory_bytes: "8589934592", max_credits: 2500 },
}

const localExecution = {
  kind: "LOCAL_SIMULATION",
  image_digest: null,
  attestation_limitation:
    "Run on an operator machine. The installed packages are recorded from the interpreter, not attested.",
}

const hardwareExecution = {
  kind: "HARDWARE",
  provider_adapter: { name: "ionq", version: "2.1.0" },
  backend_snapshot: { provider: "ionq", backend: "aria-1", snapshot_hash: digest("6") },
  confirmation_receipt_ref: receipt.content_hash,
  provider_result_ref: digest("7"),
  cost_confirmation: { credits_charged: 40.25, authorized_maximum: 2500, source: "PROVIDER_REPORTED" },
  quota_confirmation: {
    quota: "monthly_shots",
    within_quota: true,
    source: "PROVIDER_REPORTED",
    exceeded_reason: null,
  },
}

function capsuleInput(changes = {}) {
  return {
    studyRef: study.study_id,
    authorizationRef: authorization.content_hash,
    manifestHash: digest("8"),
    engine: { name: "ketqat-engine", version: "0.3.0" },
    adapter: { name: "stim-pymatching", version: "1.14.0" },
    sourceHash: digest("9"),
    seed: "18446744073709551615",
    environment,
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
    execution: managedExecution,
    executionReceipt,
    ...changes,
  }
}

const capsule = buildExecutionCapsule(capsuleInput())

/** A valid capsule of each execution class, as plain records the schema accepts. */
const CAPSULE_FOR_CLASS = {
  MANAGED_SIMULATION: capsule,
  LOCAL_SIMULATION: buildExecutionCapsule(
    capsuleInput({ execution: localExecution, executionReceipt: undefined }),
  ),
  HARDWARE: buildExecutionCapsule(
    capsuleInput({ execution: hardwareExecution, executionClass: "HARDWARE", executionReceipt: undefined }),
  ),
}

// ------------------------------------------------------ the confirmation receipt

test("a receipt records what a bare plan hash could not, and binds it to the plan's own contents", () => {
  assert.deepEqual(receipt.plan_ref, planRef)
  assert.equal(receipt.plan_semantic_hash, semanticHash("study_plan", plan))
  assert.equal(receipt.study_ref, study.study_id)
  // The ceiling is the plan's, never the caller's: a receipt that could raise
  // its own limit would authorise a spend the plan did not propose.
  assert.equal(receipt.max_credits, plan.max_credits)
  assert.equal(receipt.actor_subject_id, "auth0|6512abf0")
  assert.equal(receipt.oauth_client_id, "ketqat-console")
  assert.equal(receipt.confirmation_channel, "WEB_CONSOLE")
  assert.equal(receipt.shown_summary_hash, digest("1"))
  assert.equal(receipt.content_hash, studySelfHash("confirmation_receipt", receipt))
  assert.deepEqual(ConfirmationReceiptSchema.parse(receipt), receipt)
})

test("a receipt states that it is not a signature, in the record rather than in a caption", () => {
  // ADR 0014: a hash match is never rendered as authentic, signed or correct.
  // The two standing limitations are written by the builder, so a receipt
  // cannot exist without them and no rendering layer has to be trusted to add
  // the caveat.
  for (const limitation of CONFIRMATION_RECEIPT_LIMITATIONS) {
    assert.ok(receipt.limitations.includes(limitation), limitation)
  }
  assert.match(receipt.limitations.join(" "), /not a cryptographic signature/)
  assert.equal(receipt.attestation_level, "hash_only")
  // And no field of the record is shaped like a signature, so nothing can be
  // mistaken for one by a consumer reading keys.
  assert.deepEqual(
    Object.keys(receipt).filter((key) => /signature|signed|certificate/.test(key)),
    [],
  )

  // The three identifiers the identity provider minted are single printable
  // ASCII tokens: whitespace would make one identifier look like two in a log
  // and would give one value two spellings through a trailing space.
  for (const value of [receipt.actor_subject_id, receipt.tenant_id, receipt.oauth_client_id]) {
    assert.equal(isAuthenticatedSubject(value), true, value)
  }
  assert.equal(isAuthenticatedSubject("auth0|6512abf0 "), false)
})

test("a receipt cannot authorise a plan revision that has been superseded", () => {
  // The property the whole record exists for. A plan updated after confirmation
  // invalidates the receipt structurally: the plan's digest moves, the pointer
  // stops matching, and nothing had to remember to revoke anything.
  const revised = revisePlan(plan, { max_credits: 4000 }, plan.content_hash)
  assert.equal(revised.ok, true)

  const verdict = verifyConfirmationReceipt(receipt, revised.plan, { at: ISO.beforeExpiry })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "PLAN_REVISION_SUPERSEDED")

  // A new confirmation is required, and it is a new record: the old receipt is
  // not edited to point at the new revision, because a receipt records
  // something that happened.
  const second = okReceipt(
    buildConfirmationReceipt(
      receiptInput({
        plan: revised.plan,
        latestPlanRevision: { revision_hash: revised.plan.content_hash, revision: 2 },
      }),
    ),
  )
  assert.notEqual(second.content_hash, receipt.content_hash)
  assert.equal(second.plan_ref.revision, 2)
  // The original still verifies against the plan it was given for, which is the
  // difference between "superseded" and "invalid".
  assert.equal(verifyConfirmationReceipt(receipt, plan, { at: ISO.beforeExpiry }).ok, true)
})

test("a receipt is refused at creation when the store's latest revision is not the plan in hand", () => {
  // The transaction the store owes, checked as far as this side can: the caller
  // passes what it re-read, and a receipt is never built against a plan that
  // has already moved. `confirmation_receipt_plan_compare_and_set` in
  // persistence.ts is what closes the remaining window.
  const stale = buildConfirmationReceipt(
    receiptInput({ latestPlanRevision: { revision_hash: digest("4"), revision: 2 } }),
  )
  assert.equal(stale.ok, false)
  assert.equal(stale.refusal.code, "PLAN_REVISION_SUPERSEDED")
})

test("a plan edited after confirmation is refused even though the receipt is intact", () => {
  const tampered = { ...plan, max_credits: 100000 }
  const verdict = verifyConfirmationReceipt(receipt, tampered, { at: ISO.beforeExpiry })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "CONFIRMATION_HASH_MISMATCH")
})

test("a receipt edited after it was written stops being the server's record of anything", () => {
  const raised = { ...receipt, max_credits: 100000 }
  const verdict = verifyConfirmationReceipt(raised, plan, { at: ISO.beforeExpiry })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "CONFIRMATION_RECEIPT_EDITED")
})

test("a receipt and a plan from two studies do not authorise each other", () => {
  const elsewhere = { ...receipt, study_ref: "0f3b7d24-91ca-4e58-a7d0-5b6e2c419f83" }
  const restamped = { ...elsewhere, content_hash: studySelfHash("confirmation_receipt", elsewhere) }
  const verdict = verifyConfirmationReceipt(restamped, plan, { at: ISO.beforeExpiry })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "CONFIRMATION_RECEIPT_STUDY_MISMATCH")
})

test("an approval has a shelf life, and the absence of a clock is not treated as unexpired", () => {
  assert.equal(verifyConfirmationReceipt(receipt, plan, { at: ISO.beforeExpiry }).ok, true)
  const lapsed = verifyConfirmationReceipt(receipt, plan, { at: ISO.afterExpiry })
  assert.equal(lapsed.ok, false)
  assert.equal(lapsed.refusal.code, "CONFIRMATION_RECEIPT_EXPIRED")
  // No `at` means the other four statements are answered and this one is not,
  // rather than being answered optimistically.
  assert.equal(verifyConfirmationReceipt(receipt, plan).ok, true)
})

test("a receipt whose own estimate exceeds the plan's ceiling is refused at creation", () => {
  const overrun = buildConfirmationReceipt(receiptInput({ estimatedCredits: plan.max_credits + 1 }))
  assert.equal(overrun.ok, false)
  assert.equal(overrun.refusal.code, "CREDITS_MAXIMUM_EXCEEDED")
})

test("an expiry at or before the confirmation is a receipt that was never valid", () => {
  assert.throws(
    () => ConfirmationReceiptSchema.parse({ ...receipt, expires_at: receipt.confirmed_at }),
    /authorises\s+nothing for any length of time/,
  )
})

// ------------------------------------------------------------- the authorization

test("an authorization copies the approval rather than restating it", () => {
  assert.equal(authorization.confirmation_receipt_ref, receipt.content_hash)
  assert.deepEqual(authorization.plan_ref, planRef)
  assert.equal(authorization.resource_ceiling.max_credits, receipt.max_credits)
  assert.equal(authorization.resource_ceiling.resource_class, receipt.resource_class)
  assert.equal(authorization.study_ref, study.study_id)
  assert.equal(authorization.content_hash, studySelfHash("study_task_authorization", authorization))
  assert.deepEqual(StudyTaskAuthorizationSchema.parse(authorization), authorization)
})

test("a confirmation authorises the operations its scopes name and no others", () => {
  const scopes = new Set(STUDY_OPERATION_SCOPES.map((entry) => entry.scope))
  assert.deepEqual([...scopes].sort(), ["study:estimate", "study:execute"])

  const estimateOnly = okReceipt(
    buildConfirmationReceipt(receiptInput({ authorizationScope: ["study:estimate"] })),
  )
  assert.equal(receiptGrantsScope(estimateOnly, "study:execute"), false)

  const refused = authoriseStudyTask({
    plan,
    receipt: estimateOnly,
    requestedOperation: "STUDY_BENCHMARK_RUN",
    inputRefs: [artifact()],
    at: ISO.beforeExpiry,
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.refusal.code, "CONFIRMATION_SCOPE_INSUFFICIENT")

  // The same receipt authorises the operation it does carry a scope for.
  assert.equal(
    authoriseStudyTask({
      plan,
      receipt: estimateOnly,
      requestedOperation: "STUDY_RESOURCE_ESTIMATE",
      inputRefs: [artifact()],
      at: ISO.beforeExpiry,
    }).ok,
    true,
  )
})

test("an expired confirmation authorises no work", () => {
  const refused = authoriseStudyTask({
    plan,
    receipt,
    requestedOperation: "STUDY_BENCHMARK_RUN",
    inputRefs: [artifact()],
    at: ISO.afterExpiry,
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.refusal.code, "CONFIRMATION_RECEIPT_EXPIRED")
})

// ------------------------------------------- identity is unchanged by execution

test("a task's identity is unchanged by execution", () => {
  // The property the split exists for, run end to end. The authorization is
  // hashed before anything happens, a job is queued, leased, retried and
  // finished, an outcome and a capsule are written -- and the digest everything
  // references the work by is the one it started with.
  const before = studySelfHash("study_task_authorization", authorization)

  let job = StudyExecutionJobSchema.parse({
    schema_version: STUDY_SCHEMA_VERSION,
    job_id: JOB_ID,
    authorization_ref: authorization.content_hash,
    status: "QUEUED",
    attempt: 1,
    max_attempts: 3,
    progress: { completed_units: 0, total_units: 1000, note: null },
    cancellation: { cancelled: false, reason: null },
    updated_at: ISO.started,
  })

  for (const [status, attempt, completed] of [
    ["LEASED", 1, 0],
    ["RUNNING", 1, 400],
    ["RETRY_SCHEDULED", 1, 400],
    ["RUNNING", 2, 812],
    ["SUCCEEDED", 2, 1000],
  ]) {
    job = StudyExecutionJobSchema.parse({
      ...job,
      status,
      attempt,
      progress: { ...job.progress, completed_units: completed },
      updated_at: ISO.finished,
    })
    assert.equal(studySelfHash("study_task_authorization", authorization), before, status)
  }

  const outcome = recordTaskOutcome({ authorization, capsule, terminalStatus: "SUCCEEDED", attempts: 2 })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.outcome.capsule_ref, capsule.reproducibility_hash)
  assert.equal(outcome.outcome.authorization_ref, before)
  assert.deepEqual(TaskOutcomeSchema.parse(outcome.outcome), outcome.outcome)

  assert.equal(studySelfHash("study_task_authorization", authorization), before)
  // And structurally, not just in this run: the record declares no field the
  // execution system could write to.
  const declared = Object.keys(StudyTaskAuthorizationSchema.shape)
  assert.equal(declared.includes("status"), false)
  assert.equal(declared.includes("capsule_ref"), false)
})

test("the job is control-plane state, and this family refuses to hash it", () => {
  const job = {
    schema_version: STUDY_SCHEMA_VERSION,
    job_id: JOB_ID,
    authorization_ref: authorization.content_hash,
    status: "RUNNING",
    attempt: 1,
    max_attempts: 3,
    progress: { completed_units: 12, total_units: 1000, note: "decoding" },
    cancellation: { cancelled: false, reason: null },
    updated_at: ISO.started,
  }
  assert.deepEqual(StudyExecutionJobSchema.parse(job), job)
  // No rules id and no hash field: every content-addressed record in this family
  // names the rules it hashes under, so naming one here would say it was hashed.
  assert.equal("hash_rules_id" in job, false)
  assert.equal("content_hash" in job, false)
  // Declared as data rather than simply left out of the registry, so the reason
  // is a row a reviewer reads and both languages give the same answer.
  assert.deepEqual([...STUDY_CONTROL_PLANE_KIND_NAMES], ["execution_job"])
  assert.equal(STUDY_CONTROL_PLANE_KINDS[0].address_instead, "study_task_authorization")
  assert.equal(Object.isFrozen(STUDY_CONTROL_PLANE_KINDS), true)
  // And the refusal names the reason rather than pleading ignorance.
  assert.throws(
    () => studySelfHash("execution_job", job),
    (error) => error.code === "NOT_CONTENT_ADDRESSED" && /study_task_authorization/.test(error.message),
  )
  assert.throws(
    () => studySelfHash("execution_jobs", job),
    (error) => error.code === "UNKNOWN_RECORD_KIND",
  )
})

test("a job cannot record a retry past its own limit or a cancellation it has not taken", () => {
  const base = {
    schema_version: STUDY_SCHEMA_VERSION,
    job_id: JOB_ID,
    authorization_ref: authorization.content_hash,
    status: "RUNNING",
    attempt: 1,
    max_attempts: 3,
    progress: { completed_units: 12, total_units: 1000, note: null },
    cancellation: { cancelled: false, reason: null },
    updated_at: ISO.started,
  }
  assert.throws(() => StudyExecutionJobSchema.parse({ ...base, attempt: 4 }), /past the limit/)
  // A retry parked on the last attempt never moves, and a reader waiting on it
  // is waiting for something that will not happen.
  assert.throws(
    () => StudyExecutionJobSchema.parse({ ...base, status: "RETRY_SCHEDULED", attempt: 3 }),
    /no attempt left/,
  )
  assert.equal(
    StudyExecutionJobSchema.parse({ ...base, status: "RETRY_SCHEDULED", attempt: 2 }).status,
    "RETRY_SCHEDULED",
  )
  // A success that did not finish its own work is either a wrong status or a
  // wrong total, and a reader cannot tell which.
  assert.deepEqual([...STUDY_EXECUTION_JOB_TERMINAL_STATUSES], ["SUCCEEDED", "FAILED", "CANCELLED"])
  assert.throws(
    () => StudyExecutionJobSchema.parse({ ...base, status: "SUCCEEDED" }),
    /did not finish its own work/,
  )
  assert.throws(
    () => StudyExecutionJobSchema.parse({ ...base, cancellation: { cancelled: true, reason: "user" } }),
    /A cancelled job is at RUNNING/,
  )
  assert.throws(
    () => StudyExecutionJobSchema.parse({ ...base, progress: { completed_units: 1300, total_units: 1000, note: null } }),
    /outrun its own total/,
  )
})

test("a record the hashing core refuses is a finding, not an exception to catch", () => {
  // A caller may be holding a record read from a file. "This cannot be hashed"
  // is then a fact about that record, and reporting it as a refusal is what lets
  // a caller branch on it beside the other findings instead of catching an error
  // to discover it.
  const undeclared = { ...authorization, smuggled: "not a declared field" }
  const verdict = verifyTaskAuthorizationChain({
    study,
    plan,
    receipt,
    authorization: undeclared,
    at: ISO.beforeExpiry,
  })
  assert.equal(verdict.valid, false)
  assert.deepEqual(
    verdict.problems.map((problem) => problem.code),
    ["STUDY_RECORD_NOT_HASHABLE"],
  )
  assert.match(verdict.problems[0].message, /^UNDECLARED_FIELD: /)

  const outcome = recordTaskOutcome({
    authorization: undeclared,
    terminalStatus: "REFUSED",
    reason: "unreachable, because the authorization cannot be hashed",
    attempts: 1,
  })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.refusal.code, "STUDY_RECORD_NOT_HASHABLE")
})

test("an outcome that names a capsule for other work is refused", () => {
  const foreign = buildExecutionCapsule(capsuleInput({ authorizationRef: digest("7") }))
  const refused = recordTaskOutcome({ authorization, capsule: foreign, terminalStatus: "SUCCEEDED", attempts: 1 })
  assert.equal(refused.ok, false)
  assert.equal(refused.refusal.code, "TASK_REFERENCE_UNRESOLVED")
})

test("a success with nothing behind it, and a failure with nothing to say, are both refused", () => {
  // These two are schema violations rather than findings about a graph, so they
  // are thrown where the record is parsed rather than returned as refusals. The
  // distinction is the one every builder in this family draws: a refusal is
  // something a caller has to be able to branch on and explain to a user, and a
  // record that cannot be assembled at all has no such answer to give.
  assert.throws(
    () => recordTaskOutcome({ authorization, terminalStatus: "SUCCEEDED", attempts: 1 }),
    /A success with nothing behind it is a claim/,
  )
  assert.throws(
    () => recordTaskOutcome({ authorization, terminalStatus: "FAILED", attempts: 1 }),
    /must say why/,
  )
  const refused = recordTaskOutcome({
    authorization,
    terminalStatus: "REFUSED",
    reason: "The provider reported the backend as unavailable for the whole authorisation window.",
    attempts: 3,
  })
  assert.equal(refused.ok, true)
  assert.equal(refused.outcome.capsule_ref, null)
})

// ------------------------------------------------ the execution capsule per class

test("every execution class this build declares has a capsule and a requirement", () => {
  // A class with no requirement is a class nothing checks, which would make the
  // loops below pass by not looking.
  const declared = EXECUTION_EVIDENCE_REQUIREMENTS.map((entry) => entry.resource_class).sort()
  assert.deepEqual(declared, ["HARDWARE", "LOCAL_SIMULATION", "MANAGED_SIMULATION"])
  assert.deepEqual(Object.keys(CAPSULE_FOR_CLASS).sort(), declared)
  assert.equal(Object.isFrozen(EXECUTION_EVIDENCE_REQUIREMENTS), true)
  for (const entry of EXECUTION_EVIDENCE_REQUIREMENTS) {
    assert.ok(entry.required_fields.length > 0, entry.resource_class)
    assert.ok(entry.why.length > 0, entry.resource_class)
    assert.equal(Object.isFrozen(entry), true)
  }
})

for (const requirement of EXECUTION_EVIDENCE_REQUIREMENTS) {
  test(`a ${requirement.resource_class} capsule is refused without each piece of evidence it must carry`, () => {
    const valid = CAPSULE_FOR_CLASS[requirement.resource_class]
    assert.equal(ExecutionCapsuleSchema.safeParse(valid).success, true)
    assert.equal(verifyExecutionCapsule(valid).valid, true)

    for (const path of requirement.required_fields) {
      const stripped = without(valid, path)
      assert.equal(
        ExecutionCapsuleSchema.safeParse(stripped).success,
        false,
        `${requirement.resource_class} accepted a capsule with no ${path}`,
      )
    }
  })
}

test("a managed simulation cannot record a null limit it was in fact running under", () => {
  // The union requires the object; what it cannot say is that a value inside it
  // is set. This system chose the limits and knows them, so a null here says no
  // limit applied, which for a managed runner is not true.
  const nulled = clone(capsule)
  nulled.execution.resource_limits.max_memory_bytes = null
  const parsed = ExecutionCapsuleSchema.safeParse(nulled)
  assert.equal(parsed.success, false)
  assert.match(parsed.error.issues[0].message, /must carry execution\.resource_limits\.max_memory_bytes/)
})

test("a local simulation may have no image, and must then say what ran and what that does not establish", () => {
  const local = CAPSULE_FOR_CLASS.LOCAL_SIMULATION
  assert.equal(local.execution.image_digest, null)
  assert.match(local.execution.attestation_limitation, /not attested/)

  // With no image to pull, the captured environment is the whole of what a
  // second party has, so an empty one makes the capsule a claim.
  const empty = clone(local)
  empty.environment = { packages: [], hardware: [] }
  const parsed = ExecutionCapsuleSchema.safeParse(empty)
  assert.equal(parsed.success, false)
  assert.match(parsed.error.issues[0].message, /must capture the machine it ran on/)
})

test("a hardware run is filed as HARDWARE, and a simulation cannot be filed as one", () => {
  const hardware = CAPSULE_FOR_CLASS.HARDWARE
  assert.equal(hardware.execution_class, "HARDWARE")
  assert.equal(hardware.execution.confirmation_receipt_ref, receipt.content_hash)

  const mislabelled = ExecutionCapsuleSchema.safeParse({ ...hardware, execution_class: "SIMULATION" })
  assert.equal(mislabelled.success, false)
  assert.match(mislabelled.error.issues[0].message, /comparison code refuses to rank/)

  const inflated = ExecutionCapsuleSchema.safeParse({ ...capsule, execution_class: "HARDWARE" })
  assert.equal(inflated.success, false)
})

test("a hardware capsule cannot record a charge above the ceiling it was authorised under", () => {
  const overrun = clone(CAPSULE_FOR_CLASS.HARDWARE)
  overrun.execution.cost_confirmation.credits_charged = 99999
  const parsed = ExecutionCapsuleSchema.safeParse(overrun)
  assert.equal(parsed.success, false)
  assert.match(parsed.error.issues[0].message, /above its own ceiling/)
})

test("a capsule stores no credential, and the refusal comes from both layers", () => {
  // Structural rather than a name check: every declared hardware field is a
  // name, a version, a hash or a number, so a token has nowhere to go. The
  // schema refuses the undeclared key, and so does the projection -- which
  // matters because the projection is reachable without a parse and is the only
  // verifier the Python side has.
  const withToken = { ...CAPSULE_FOR_CLASS.HARDWARE, provider_api_token: "sk-live-000" }
  assert.equal(ExecutionCapsuleSchema.safeParse(withToken).success, false)
  assert.throws(
    () => studySelfHash("execution_capsule", withToken),
    (error) => error.code === "UNDECLARED_FIELD",
  )

  const nestedToken = clone(CAPSULE_FOR_CLASS.HARDWARE)
  nestedToken.execution.backend_snapshot.api_key = "sk-live-000"
  assert.throws(
    () => studySelfHash("execution_capsule", nestedToken),
    (error) => error.code === "UNDECLARED_FIELD",
  )
})

// ------------------------------------------------------------ typed artifacts

test("an artifact says how much of it there is and whether anything was removed", () => {
  const output = capsule.outputs[0]
  assert.equal(output.completeness, "PARTIAL")
  assert.match(output.partial_reason, /round 812/)
  assert.equal(output.redaction, "REDACTED")
  assert.equal(output.resolution.kind, "NOT_RETAINED")
  assert.equal(output.resolution.locator, null)
  // The byte size is digits: past 2^53 a JSON number is a double here and an
  // integer in Python, so the same capsule would take two digests.
  assert.equal(capsule.inputs[0].byte_size, "18446744073709551615")

  // A truncation with no stated cause reads like a complete result that found
  // less, and a reason beside COMPLETE reads as a caveat on a file nothing
  // happened to. Both directions are refused.
  assert.throws(() => artifact({ completeness: "PARTIAL" }), /must record why it is partial/)
  assert.throws(() => artifact({ partial_reason: "unused" }), /nothing for a truncation reason/)
  assert.throws(() => artifact({ redaction: "REDACTED" }), /must say what was removed/)
  assert.throws(
    () => artifact({ resolution: { kind: "CONTENT_ADDRESSED_STORE", locator: null } }),
    /must say where/,
  )
  assert.throws(
    () => artifact({ resolution: { kind: "NOT_RETAINED", locator: "cas://x" } }),
    /nowhere to be fetched from/,
  )
  assert.throws(() => artifact({ media_type: "Text/CSV" }), /lowercase/)
})

test("two artifacts cannot share one name", () => {
  const collided = ExecutionCapsuleSchema.safeParse({
    ...capsule,
    outputs: [artifact({ name: "results.json" }), artifact({ name: "results.json", content_hash: digest("2") })],
  })
  assert.equal(collided.success, false)
  assert.match(collided.error.issues[0].message, /share the name/)
  assert.deepEqual(duplicateArtifactNames(capsule.outputs), [])
  assert.deepEqual(
    duplicateArtifactNames([artifact({ name: "a" }), artifact({ name: "a" }), artifact({ name: "b" })]),
    ["a"],
  )
})

test("a truncated output is a different run from a complete one", () => {
  // The whole reason the typed reference replaced a bare digest: under two
  // arrays of hashes this difference existed and nothing said what it was.
  const complete = clone(capsule)
  complete.outputs[0].completeness = "COMPLETE"
  complete.outputs[0].partial_reason = null
  assert.notEqual(
    semanticHash("execution_capsule", complete),
    semanticHash("execution_capsule", capsule),
  )
})

// ------------------------------------------------------- the references between

test("the whole chain resolves, and says what it does not establish", () => {
  const outcome = recordTaskOutcome({ authorization, capsule, terminalStatus: "SUCCEEDED", attempts: 2 })
  assert.equal(outcome.ok, true)

  const verdict = verifyTaskAuthorizationChain({
    study,
    plan,
    receipt,
    authorization,
    outcome: outcome.outcome,
    capsule,
    at: ISO.beforeExpiry,
  })
  assert.deepEqual(verdict.problems, [])
  assert.equal(verdict.valid, true)
  // Carried in the result rather than in a docstring, so a surface cannot
  // render a passing chain as more than it is.
  assert.equal(verdict.does_not_establish.length, 4)
  assert.match(verdict.does_not_establish.join(" "), /No key belonging to any person/)
  // Including the one this call did not check: without the store's latest
  // revision the chain sees an intact plan, not a current one.
  assert.match(verdict.does_not_establish.join(" "), /still the current revision/)
  const stale = verifyTaskAuthorizationChain({
    study,
    plan,
    receipt,
    authorization,
    capsule,
    latestPlanRevision: { revision_hash: digest("7"), revision: 2 },
    at: ISO.beforeExpiry,
  })
  assert.equal(stale.valid, false)
  assert.ok(stale.problems.some((problem) => problem.code === "PLAN_REVISION_SUPERSEDED"))
  assert.equal(Object.isFrozen(verdict.does_not_establish), true)
})

test("each record intact and the graph between them wrong is the failure that gets reported", () => {
  const cases = [
    [
      "a capsule answering other work",
      { capsule: buildExecutionCapsule(capsuleInput({ authorizationRef: digest("7") })) },
      "TASK_REFERENCE_UNRESOLVED",
    ],
    [
      "an authorization granted under another approval",
      {
        authorization: {
          ...authorization,
          confirmation_receipt_ref: digest("5"),
          content_hash: studySelfHash("study_task_authorization", {
            ...authorization,
            confirmation_receipt_ref: digest("5"),
          }),
        },
      },
      "TASK_REFERENCE_UNRESOLVED",
    ],
    [
      "a study that is not the one the plan belongs to",
      {
        study: buildStudy({
          studyId: "0f3b7d24-91ca-4e58-a7d0-5b6e2c419f83",
          title: "Another study entirely",
          core: { study_type: "FTQC_FEASIBILITY", project_ref: PROJECT_REF, is_demo: true },
        }),
      },
      "TASK_REFERENCE_UNRESOLVED",
    ],
    [
      "a run executed on a machine the approval did not cover",
      { capsule: CAPSULE_FOR_CLASS.HARDWARE },
      "EXECUTION_CLASS_MISMATCH",
    ],
  ]

  for (const [label, overrides, code] of cases) {
    const verdict = verifyTaskAuthorizationChain({
      study,
      plan,
      receipt,
      authorization,
      capsule,
      at: ISO.beforeExpiry,
      ...overrides,
    })
    assert.equal(verdict.valid, false, label)
    assert.ok(
      verdict.problems.some((problem) => problem.code === code),
      `${label}: expected ${code}, got ${verdict.problems.map((problem) => problem.code).join(", ")}`,
    )
  }
})

test("a chain is reported in full rather than at the first disagreement", () => {
  // These are findings about one graph, and a caller fixing them needs the whole
  // list -- unlike the builders, which refuse at the first failure because there
  // is no record to report about yet.
  const elsewhere = buildStudy({
    studyId: "0f3b7d24-91ca-4e58-a7d0-5b6e2c419f83",
    title: "Another study entirely",
    core: { study_type: "FTQC_FEASIBILITY", project_ref: PROJECT_REF, is_demo: true },
  })
  const verdict = verifyTaskAuthorizationChain({
    study: elsewhere,
    plan,
    receipt,
    authorization,
    capsule: CAPSULE_FOR_CLASS.HARDWARE,
    at: ISO.beforeExpiry,
  })
  assert.ok(verdict.problems.length >= 4, `${verdict.problems.length} problems reported`)
})

// -------------------------------------------------------- the four hash roles

test("the four roles answer four questions about a capsule", () => {
  // A retried run and a first-attempt run describe the same computation, so the
  // job id, the attempt, the actor and the timestamps are receipt evidence and
  // the semantic digest does not read them.
  const retried = clone(capsule)
  retried.execution_receipt.attempt = 4
  retried.execution_receipt.started_at = "2027-06-06T00:00:00.000Z"
  assert.equal(semanticHash("execution_capsule", retried), semanticHash("execution_capsule", capsule))
  assert.notEqual(studySelfHash("execution_capsule", retried), capsule.reproducibility_hash)

  // A different seed is different science, and a seed is digits, so two
  // spellings of one value cannot exist to take two digests.
  assert.notEqual(
    semanticHash("execution_capsule", { ...capsule, seed: "18446744073709551614" }),
    semanticHash("execution_capsule", capsule),
  )
})

test("a receipt's audit half and its authorization half are separated by the projection", () => {
  const laterClient = { ...receipt, oauth_client_id: "ketqat-cli" }
  // Who confirmed and through what is audit evidence: it moves the record digest
  // and not the semantic one, which is what "the same authorization, observed
  // differently" means.
  assert.equal(semanticHash("confirmation_receipt", laterClient), semanticHash("confirmation_receipt", receipt))
  assert.notEqual(studySelfHash("confirmation_receipt", laterClient), receipt.content_hash)

  // The ceiling and the expiry are what was authorised, so both move it.
  for (const change of [{ max_credits: 9000 }, { expires_at: "2027-01-01T00:00:00.000Z" }]) {
    assert.notEqual(
      semanticHash("confirmation_receipt", { ...receipt, ...change }),
      semanticHash("confirmation_receipt", receipt),
    )
  }
})
