import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { quantity, unknownQuantity } from "../dist/index.js"
// The study barrel is finalized in the integration package, so these modules are
// imported by compiled path rather than through `dist/index.js`. The paths are
// what the barrel will re-export; nothing here depends on the wiring order.
import { STUDY_SCHEMA_VERSION, TextFieldSchema } from "../dist/study/common.js"
import { studySelfHash, receiptHash, semanticHash } from "../dist/study/hash.js"
import { StudyIdSchema, isStudyOpaqueId, newStudyId } from "../dist/study/identity.js"
import { STUDY_PERSISTENCE_INVARIANTS } from "../dist/study/persistence.js"
import { STUDY_HASH_RULES_ID } from "../dist/study/rules.js"
import {
  STUDY_EVENT_TYPES,
  STUDY_STATUS_TRANSITIONS,
  STUDY_TERMINAL_STATUSES,
  StudyEventSchema,
  StudyEventTypeSchema,
  StudySchema,
  StudyStatusSchema,
  appendStudyEvent,
  buildStudy,
  isPermittedStudyEvent,
  isValidStudyTransition,
  studyEventRule,
  studyStatusAfter,
  updateStudyPresentation,
  verifyStudyEventChain,
} from "../dist/study/study.js"
import {
  ProblemSpecificationSchema,
  openQuestionsOf,
  reviseSpecification,
  specificationFieldStates,
} from "../dist/study/specification.js"
import {
  StudyPlanSchema,
  planConfirmationTarget,
  planDataHandlingSummary,
  planExecutability,
  revisePlan,
  verifyPlanConfirmation,
} from "../dist/study/plan.js"
import { CriterionThresholdSchema, CriterionComparatorSchema } from "../dist/study/criteria.js"
import { ClaimComparatorSchema } from "../dist/study/evidence.js"
import { QUESTION_RESOLUTIONS } from "../dist/study/questions.js"
import { DataHandlingPolicySchema, dataHandlingSummary } from "../dist/study/policy.js"
import { STUDY_VERSION_PIN_REQUIREMENTS, VERSION_PIN_COMPONENTS } from "../dist/study/pins.js"
import { STUDY_FIELD_DIMENSIONS, STUDY_UNIT_FAMILIES, unitBelongsToDimension } from "../dist/study/units.js"

/**
 * Lifecycle contracts for the study family (ketqat-sdk#259, ADR 0010, RFC 0008).
 *
 * The invariants under test are the ones that decide whether a number in a
 * report can be trusted: that a study's identity survives being renamed and its
 * history cannot be rewritten without anyone noticing, that a revision never
 * edits its predecessor and never branches off one silently, that a confirmation
 * binds to exactly the plan revision somebody read, and that a field nobody has
 * answered stays visibly unanswered all the way through canonicalization. Each
 * of them, violated, produces a plausible-looking record that says something
 * nobody agreed to.
 */

const MODEL = "ketqat-study-test"
const VERSION = "0.1.0"

/** Fixed ids, so every record below is byte-stable across runs. */
const STUDY_ID = "b7c1f0d2-3a45-4e69-9c8b-1d2e3f405162"
const OTHER_STUDY_ID = "0f3b7d24-91ca-4e58-a7d0-5b6e2c419f83"
const PROJECT_REF = "7b2e9d41-6c05-4f8a-a3d7-1e4b8c60f295"

/**
 * Stamp then hash, in the order every builder in the family uses.
 *
 * The record kind is an argument because it is a preimage header component:
 * there is no digest of an object in the abstract, and which of the four
 * digests a kind writes into its own hash field is declared in the registry
 * rather than chosen here.
 */
function seal(recordKind, schema, withoutHash) {
  return schema.parse({ ...withoutHash, content_hash: studySelfHash(recordKind, withoutHash) })
}

const study = buildStudy({
  studyId: STUDY_ID,
  title: "Would a fault-tolerant machine beat our routing solver?",
  core: { study_type: "FTQC_FEASIBILITY", project_ref: PROJECT_REF, is_demo: true },
})

const textField = (value, evidence = "USER_PROVIDED", origin = "CONFIRMED") => ({ value, evidence, origin })
const unknownTextField = (origin = "INFERRED") => ({ value: null, evidence: "UNKNOWN", origin })

const quantityField = (value, unit, origin = "CONFIRMED") => ({
  quantity: quantity({ value, unit, evidence: "USER_PROVIDED", source: "The customer said so.", model: MODEL, modelVersion: VERSION }),
  origin,
})

const unknownQuantityField = (unit, reason, origin = "INFERRED") => ({
  quantity: unknownQuantity(unit, reason, MODEL, VERSION),
  origin,
})

/**
 * A criterion predicate, in the shape an orchestrator evaluates.
 *
 * Defaulted to a numeric comparison, because the threshold is where a
 * wrong-dimension unit is refused and every criterion below is a variation on
 * one of these seven fields.
 */
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

/** An outstanding question: the state every gap in a specification has to be in. */
const openQuestion = (id, targets, changes = {}) => ({
  question_id: id,
  targets,
  question: "What does this have to be for the study to be worth running?",
  answer_type: "TEXT",
  requirement: "REQUIRED",
  why_needed: "Nothing downstream can be sized without it.",
  blocks: ["SPECIFICATION_SIGN_OFF"],
  allowed_choices: null,
  answer_provenance: null,
  resolution: "UNANSWERED",
  ...changes,
})

const answerProvenance = (changes = {}) => ({
  source: "USER",
  actor: "The customer's head of operations.",
  reference: null,
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

const dataHandlingPolicy = (changes = {}) => ({
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
  ...changes,
})

function specificationCore(changes = {}) {
  return {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.study_id,
    revision: 1,
    supersedes: null,
    objective: textField("Decide whether to fund a two-year quantum programme."),
    success_criteria: [
      {
        statement: textField("A stated condition under which the quantum route wins."),
        predicate: criterion("quantum_route_wins", {
          metric_ref: "advantage.crossover_problem_size",
          comparator: "EXISTS",
          threshold: null,
          required_evidence: ["DERIVED"],
          explanation: "A condition, stated, or there is nothing to hold the conclusion to.",
        }),
      },
    ],
    accuracy_requirement: quantityField(0.01, "relative error"),
    runtime_constraint: quantityField(3600, "seconds"),
    budget_constraint: quantityField(250000, "USD"),
    problem_size: quantityField(1200, "delivery stops"),
    current_classical_method: textField("A commercial MILP solver on a 64-core node."),
    why_quantum: textField("The published resource analysis covers an instance of this size."),
    open_questions: [],
    limitations: ["A test fixture. It describes no real programme."],
    ...changes,
  }
}

const specification = seal("problem_specification", ProblemSpecificationSchema, specificationCore())
const specificationRef = { revision_hash: specification.content_hash, revision: specification.revision }

function planCore(changes = {}) {
  return {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.study_id,
    specification_ref: specificationRef,
    revision: 1,
    supersedes: null,
    baselines: [{ baseline_ref: "a".repeat(64), source_class: "measured", note: "Timed on the customer's cluster." }],
    candidates: [{ name: "Qubitized QPE", workload_ref: "b".repeat(64), rationale: "The only candidate with a published analysis." }],
    scenario_refs: ["c".repeat(64)],
    pinned_versions: {
      adapter: null,
      model: versionPin("ketqat-resource-intelligence", { model_snapshot_hash: "d".repeat(64) }),
      engine: versionPin("ketqat-engine", { container_digest: `sha256:${"e".repeat(64)}` }),
    },
    expected_runtime: quantity({ value: 0.432, unit: "seconds", evidence: "MODELLED", source: "Runtime model.", model: MODEL, modelVersion: VERSION }),
    expected_credits: quantity({ value: 1800, unit: "credits", evidence: "DERIVED", source: "Runtime at the pinned tariff.", model: MODEL, modelVersion: VERSION }),
    max_credits: 2500,
    data_handling: dataHandlingPolicy(),
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

const reviseOk = (result) => {
  assert.equal(result.ok, true, result.ok ? "" : result.refusal.message)
  return result.ok ? (result.plan ?? result.specification) : null
}

// ----------------------------------------------------------------- identity

test("a study is identified by an opaque id that nothing about it can change", () => {
  assert.equal(StudyIdSchema.safeParse(study.study_id).success, true)
  assert.equal(isStudyOpaqueId(newStudyId()), true, "the minted form is the accepted form")

  // The whole reason the id exists: a rename is a rename. Under content
  // addressing this moved the study's identity and orphaned every study_ref in
  // the graph, while a status change -- which is a real change -- moved nothing.
  const renamed = updateStudyPresentation(study, { title: "A different question entirely" })
  assert.equal(renamed.study_id, study.study_id)
  assert.equal(renamed.content_hash, study.content_hash, "renaming is not a new study")
  assert.equal(renamed.presentation.title, "A different question entirely")

  const advanced = updateStudyPresentation(study, {
    status: "RUNNING",
    latest_plan: planRef,
    latest_specification: specificationRef,
  })
  assert.equal(advanced.content_hash, study.content_hash, "advancing is not a new study either")

  // And the identity is not free: two studies asking the same question in the
  // same project are two studies, which is what the id says and a digest over
  // the core alone could not.
  const twin = buildStudy({ studyId: OTHER_STUDY_ID, title: study.presentation.title, core: study.core })
  assert.notEqual(twin.content_hash, study.content_hash)
})

test("an id is not a hash, not a slug, and has one spelling", () => {
  for (const notAnId of [
    "a".repeat(64),
    "acme-logistics",
    "B7C1F0D2-3A45-4E69-9C8B-1D2E3F405162",
    "b7c1f0d2-3a45-1e69-9c8b-1d2e3f405162",
    "b7c1f0d2-3a45-4e69-1c8b-1d2e3f405162",
    "b7c1f0d23a454e699c8b1d2e3f405162",
  ]) {
    assert.equal(isStudyOpaqueId(notAnId), false, notAnId)
    assert.throws(() => StudySchema.parse({ ...study, study_id: notAnId }))
  }
  // The project is somebody else's aggregate, and this family only refuses a
  // display name where an immutable ref belongs.
  assert.throws(
    () => StudySchema.parse({ ...study, core: { ...study.core, project_ref: "acme-logistics" } }),
    /immutable ref/,
  )
})

test("every study_ref in the family points at the id, not at a digest", () => {
  assert.equal(specification.study_ref, study.study_id)
  assert.equal(plan.study_ref, study.study_id)
  // The execution half of the family carries the same reference and is checked
  // where it is built, in tests/study-execution.test.mjs.
  assert.equal(StudyIdSchema.safeParse(study.study_id).success, true)
})

// ------------------------------------------------------- the event vocabulary

/**
 * One payload per event type, so a variant can be built without the test
 * knowing which fields it needs.
 *
 * Checked for completeness below rather than trusted: a type missing from this
 * table would silently drop out of every loop in this file, which is the way a
 * table-driven test stops testing.
 */
const PAYLOAD = {
  study_created: {},
  specification_revised: { specification_ref: specificationRef },
  question_elicited: { question: "How accurate does the answer have to be?" },
  answer_confirmed: { question: "How accurate does the answer have to be?" },
  plan_created: { plan_ref: planRef },
  plan_superseded: { plan_ref: planRef, superseded_plan_ref: { revision_hash: "e".repeat(64), revision: 1 } },
  confirmation_requested: { plan_ref: planRef },
  confirmation_recorded: { plan_ref: planRef, confirmed_hash: plan.content_hash, receipt_ref: "9".repeat(64) },
  task_authorised: { task_ref: "f".repeat(64), plan_ref: planRef },
  task_queued: { task_ref: "f".repeat(64) },
  task_started: { task_ref: "f".repeat(64) },
  task_completed: { task_ref: "f".repeat(64), capsule_ref: "1".repeat(64) },
  task_failed: { task_ref: "f".repeat(64) },
  task_cancelled: { task_ref: "f".repeat(64) },
  conclusion_created: { package_ref: "2".repeat(64) },
  conclusion_retracted: { package_ref: "2".repeat(64) },
  study_refused: {},
  study_cancelled: {},
  study_superseded: { superseding_study_ref: OTHER_STUDY_ID },
  study_published: { package_ref: "2".repeat(64) },
  reproduction_submitted: { package_ref: "2".repeat(64), reproduction_capsule_ref: "3".repeat(64) },
  review_recorded: { package_ref: "2".repeat(64), review_verdict: "ACCEPTED" },
}

const eventFrom = (eventType, from) => {
  const entry = studyEventRule(eventType)
  const to = entry.outcome.kind === "fixed" ? entry.outcome.to : (from ?? "DRAFT")
  return {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.study_id,
    event_type: eventType,
    sequence: from === null ? 1 : 2,
    previous_event_hash: from === null ? null : "a".repeat(64),
    from_status: from,
    to_status: to,
    actor: "a reviewer",
    reason: entry.requires_reason ? "Stated, because this event type is refused without one." : null,
    ...PAYLOAD[eventType],
    content_hash: "b".repeat(64),
  }
}

test("the event table and the event union describe the same twenty-two things", () => {
  const declared = StudyEventTypeSchema.options
  assert.deepEqual([...declared].sort(), STUDY_EVENT_TYPES.map((entry) => entry.event_type).sort())
  assert.deepEqual([...declared].sort(), Object.keys(PAYLOAD).sort())
  assert.equal(declared.length, 22)
  // Every status a rule names is a status that exists, so a typo in the table is
  // an event nothing could ever record rather than a rule nobody notices.
  const statuses = new Set(StudyStatusSchema.options)
  for (const entry of STUDY_EVENT_TYPES) {
    for (const status of entry.permitted_from ?? []) assert.ok(statuses.has(status), status)
  }
})

test("each variant carries the payload its meaning needs, and refuses the rest", () => {
  // The property the union buys. A task event cannot carry a package reference
  // and a conclusion cannot carry a task reference, so the record a reader is
  // handed cannot describe two different things at once.
  assert.throws(
    () => StudyEventSchema.parse({ ...eventFrom("task_started", "RUNNING"), package_ref: "2".repeat(64) }),
    /Unrecognized key/,
  )
  const { capsule_ref: _dropped, ...incomplete } = eventFrom("task_completed", "RUNNING")
  assert.throws(() => StudyEventSchema.parse(incomplete), /capsule_ref/)
  assert.throws(
    () => StudyEventSchema.parse({ ...eventFrom("review_recorded", "CONCLUDED"), review_verdict: "LOOKS_FINE" }),
    /review_verdict/,
  )
})

test("an event type is legal from the statuses its rule names, and from no others", () => {
  for (const eventType of StudyEventTypeSchema.options) {
    for (const from of [null, ...StudyStatusSchema.options]) {
      const legal = isPermittedStudyEvent(eventType, from)
      const entry = studyEventRule(eventType)
      assert.equal(
        legal,
        entry.permitted_from === null ? from === null : from !== null && entry.permitted_from.includes(from),
        `${eventType} from ${from}`,
      )
      const parsed = StudyEventSchema.safeParse(eventFrom(eventType, from))
      assert.equal(parsed.success, legal, `${eventType} from ${from} must parse iff it is permitted`)
    }
  }
})

test("the four endings that used to be one word are four statuses", () => {
  // CONCLUDED -> REFUSED stood for refusing to conclude, a user stopping, a
  // conclusion being withdrawn, and waiting. Each now has a status and an event
  // that reaches it, and each reaches it from somewhere different.
  assert.deepEqual(
    [...STUDY_TERMINAL_STATUSES].sort(),
    ["CANCELLED", "REFUSED", "RETRACTED", "SUPERSEDED"],
  )
  assert.equal(STUDY_STATUS_TRANSITIONS.CONCLUDED.includes("RETRACTED"), true)
  assert.equal(STUDY_STATUS_TRANSITIONS.CONCLUDED.includes("REFUSED"), false, "a conclusion is retracted, not refused")
  assert.equal(isPermittedStudyEvent("conclusion_retracted", "CONCLUDED"), true)
  assert.equal(isPermittedStudyEvent("study_refused", "RUNNING"), true)
  assert.equal(isPermittedStudyEvent("study_cancelled", "DRAFT"), true)
  assert.equal(isPermittedStudyEvent("question_elicited", "RUNNING"), true)
  // NEEDS_INPUT is not an ending, which is the point of separating it.
  assert.equal(STUDY_TERMINAL_STATUSES.includes("NEEDS_INPUT"), false)
  for (const terminal of STUDY_TERMINAL_STATUSES) {
    assert.deepEqual(STUDY_STATUS_TRANSITIONS[terminal], [])
    for (const to of StudyStatusSchema.options) assert.equal(isValidStudyTransition(terminal, to), false)
  }
})

test("the five events that would leave a reader asking why must say why", () => {
  for (const entry of STUDY_EVENT_TYPES) {
    const from = entry.permitted_from === null ? null : entry.permitted_from[0]
    const built = { ...eventFrom(entry.event_type, from), reason: null }
    assert.equal(StudyEventSchema.safeParse(built).success, !entry.requires_reason, entry.event_type)
  }
  assert.deepEqual(
    STUDY_EVENT_TYPES.filter((entry) => entry.requires_reason).map((entry) => entry.event_type).sort(),
    ["conclusion_retracted", "study_cancelled", "study_refused", "task_cancelled", "task_failed"],
  )
})

test("the pairwise view is derived from the event table and cannot drift from it", () => {
  // The table is the rule; this is the display layer's convenience. Recomputing
  // it here from the same source is what makes "derived" a checked claim rather
  // than a comment.
  const expected = Object.fromEntries(StudyStatusSchema.options.map((status) => [status, new Set()]))
  for (const entry of STUDY_EVENT_TYPES) {
    for (const from of entry.permitted_from ?? []) {
      if (entry.outcome.kind === "fixed" && entry.outcome.to !== from) expected[from].add(entry.outcome.to)
      if (entry.outcome.kind === "resumes") {
        for (const candidate of STUDY_EVENT_TYPES) {
          if (candidate.outcome.kind !== "fixed" || candidate.outcome.to !== from) continue
          for (const origin of candidate.permitted_from ?? []) if (origin !== from) expected[from].add(origin)
        }
      }
    }
  }
  for (const status of StudyStatusSchema.options) {
    assert.deepEqual(STUDY_STATUS_TRANSITIONS[status], [...expected[status]].sort(), status)
  }
  // An event that does not move the study contributes nothing here, which is why
  // no status is listed as reachable from itself.
  for (const [from, targets] of Object.entries(STUDY_STATUS_TRANSITIONS)) {
    assert.equal(targets.includes(from), false, from)
  }
})

// -------------------------------------------------------------- the event trail

function trailOf(...steps) {
  return steps.reduce((events, step) => {
    const head = events.length === 0 ? null : events[events.length - 1].content_hash
    const appended = appendStudyEvent(study, events, head, { actor: "the study service", ...step })
    assert.equal(appended.ok, true, appended.ok ? "" : appended.refusal.message)
    return [...events, appended.event]
  }, [])
}

const confirmedTrail = trailOf(
  { event_type: "study_created" },
  { event_type: "specification_revised", specification_ref: specificationRef },
  { event_type: "plan_created", plan_ref: planRef, reason: "Plan revision 1 drafted." },
  { event_type: "confirmation_requested", plan_ref: planRef },
  { event_type: "confirmation_recorded", plan_ref: planRef, confirmed_hash: plan.content_hash, receipt_ref: "9".repeat(64) },
  { event_type: "task_authorised", task_ref: "f".repeat(64), plan_ref: planRef },
  { event_type: "task_started", task_ref: "f".repeat(64) },
)

test("each appended event numbers itself, names the hash of the one before it, and lands where its type says", () => {
  assert.equal(confirmedTrail.length, 7)
  confirmedTrail.forEach((event, index) => {
    assert.equal(event.sequence, index + 1)
    assert.equal(event.previous_event_hash, index === 0 ? null : confirmedTrail[index - 1].content_hash)
    assert.equal(event.from_status, index === 0 ? null : confirmedTrail[index - 1].to_status)
    assert.equal(event.study_ref, study.study_id)
    assert.equal(event.content_hash, studySelfHash("study_event", event))
    assert.equal(event.to_status, studyStatusAfter(event.event_type, event.from_status, null) ?? event.to_status)
  })
  assert.deepEqual(
    confirmedTrail.map((event) => event.to_status),
    ["DRAFT", "SPECIFIED", "PLANNED", "AWAITING_CONFIRMATION", "AWAITING_CONFIRMATION", "AWAITING_CONFIRMATION", "RUNNING"],
  )
  const verdict = verifyStudyEventChain(confirmedTrail)
  assert.equal(verdict.valid, true)
})

test("most of the lifecycle happens inside a status, which the old model had nowhere to put", () => {
  // Three consecutive events at AWAITING_CONFIRMATION: the confirmation was
  // recorded, work was authorised against it, and only then did anything run.
  // Under a status-transition trail these were one hop and a free-text reason.
  const inside = confirmedTrail.filter((event) => event.from_status === event.to_status)
  assert.deepEqual(inside.map((event) => event.event_type), [
    "confirmation_recorded",
    "task_authorised",
  ])
  const authorised = confirmedTrail[5]
  assert.equal(authorised.plan_ref.revision_hash, plan.content_hash)
  assert.equal(confirmedTrail[4].confirmed_hash, plan.content_hash)
})

test("a receipt digest commits to which plan an event names, not merely that it names one", () => {
  // The nested-projection property, on the record it matters for: a receipt that
  // said "a plan was adopted" without saying which would let two events binding
  // a study to two different revisions share one digest.
  const authorised = confirmedTrail[5]
  const elsewhere = { ...authorised, plan_ref: { revision_hash: "9".repeat(64), revision: 1 } }
  assert.notEqual(receiptHash("study_event", elsewhere), receiptHash("study_event", authorised))
})

test("a first event that follows something, or a later one that follows nothing, is refused at parse", () => {
  assert.throws(
    () => StudyEventSchema.parse({ ...confirmedTrail[0], previous_event_hash: "f".repeat(64) }),
    /first event in a trail follows nothing/,
  )
  assert.throws(
    () => StudyEventSchema.parse({ ...confirmedTrail[1], previous_event_hash: null }),
    /must name the event it follows/,
  )
  assert.throws(
    () => StudyEventSchema.parse({ ...confirmedTrail[0], from_status: "DRAFT" }),
    /Only a study_created event has no prior status/,
  )
})

test("an event edited after it was written no longer hashes to what it claims", () => {
  const tampered = [...confirmedTrail]
  tampered[2] = { ...tampered[2], actor: "somebody else" }
  const verdict = verifyStudyEventChain(tampered)
  assert.equal(verdict.valid, false)
  assert.equal(verdict.problems[0].code, "EVENT_CHAIN_BROKEN")
  assert.notEqual(studySelfHash("study_event", tampered[2]), tampered[2].content_hash)
  assert.equal(verdict.problems[0].subject, "study event 3")
})

test("a rewritten middle event is caught by the event that follows it, even after re-hashing", () => {
  // The interesting forgery repairs the hash it broke. Event three then verifies
  // on its own -- and event four still names the hash the original event three
  // had, which nothing in the trail can produce any more.
  const rewritten = { ...confirmedTrail[2], reason: "Approved verbally, no plan attached." }
  rewritten.content_hash = studySelfHash("study_event", rewritten)
  const tampered = [...confirmedTrail]
  tampered[2] = rewritten

  assert.equal(
    studySelfHash("study_event", rewritten),
    rewritten.content_hash,
    "the rewritten event is internally consistent",
  )
  const verdict = verifyStudyEventChain(tampered)
  assert.equal(verdict.valid, false)
  assert.ok(verdict.problems.map((problem) => problem.code).includes("EVENT_CHAIN_BROKEN"))
  assert.equal(verdict.problems[0].subject, "study event 4")
})

// The honest limit of a forward-linked chain, pinned so the docstring cannot
// quietly outgrow it again. Each event names the one before it, so nothing
// inside a trail can be moved, spliced or replayed without breaking the next
// link -- and nothing inside a trail can say how long the trail should be.
test("a truncated trail still verifies, and a forgery appended to it verifies too", () => {
  const truncated = confirmedTrail.slice(0, 5)
  assert.equal(verifyStudyEventChain(truncated).valid, true, "a chain cut short is still a chain")

  const previous = truncated[truncated.length - 1]
  const forged = {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.study_id,
    event_type: "study_refused",
    sequence: 6,
    previous_event_hash: previous.content_hash,
    from_status: previous.to_status,
    to_status: "REFUSED",
    actor: "somebody who was never there",
    reason: "Fabricated: this study never refused.",
  }
  const continued = [
    ...truncated,
    StudyEventSchema.parse({ ...forged, content_hash: studySelfHash("study_event", forged) }),
  ]

  assert.equal(
    verifyStudyEventChain(continued).valid,
    true,
    "the forger holds the same hash the honest writer would have, so the link is real",
  )
})

test("a caller holding the store's head detects both, offline", () => {
  const head = confirmedTrail[confirmedTrail.length - 1].content_hash
  const anchored = verifyStudyEventChain(confirmedTrail, head)
  assert.equal(anchored.valid, true)
  assert.equal(anchored.head_checked, true)
  assert.deepEqual([...anchored.undetected], [], "with an anchor, the far end was checked")

  const truncated = confirmedTrail.slice(0, 5)
  const cut = verifyStudyEventChain(truncated, head)
  assert.equal(cut.valid, false)
  assert.deepEqual(cut.problems.map((problem) => problem.code), ["EVENT_CHAIN_BROKEN"])

  // An empty trail is the whole history missing, which the same anchor catches.
  assert.equal(verifyStudyEventChain([], head).valid, false)

  // And a stale anchor is not silently accepted either: the head the caller
  // holds is in the trail, and events were added after it.
  const stale = verifyStudyEventChain(confirmedTrail, confirmedTrail[2].content_hash)
  assert.equal(stale.valid, false)
  assert.equal(stale.problems[0].code, "EVENT_CHAIN_BROKEN")
})

test("without an anchor the verdict says what it did not check", () => {
  // Silence would be the same answer a full check gives, so the result reports
  // the gap rather than leaving it to a docstring. A caller with no head learns
  // that the trail is internally consistent, and learns that is all it learned.
  const unanchored = verifyStudyEventChain(confirmedTrail.slice(0, 5))
  assert.equal(unanchored.valid, true)
  assert.equal(unanchored.head_checked, false)
  assert.deepEqual([...unanchored.undetected], ["TRUNCATION"])
  // The same trail with its last two events removed is reported exactly the
  // same way, which is the fact `undetected` exists to disclose.
  const shorter = verifyStudyEventChain(confirmedTrail.slice(0, 3))
  assert.equal(shorter.valid, true)
  assert.deepEqual([...shorter.undetected], ["TRUNCATION"])
  assert.deepEqual(verifyStudyEventChain([]).undetected.slice(), ["TRUNCATION"])
})

test("appending requires the head the caller holds, so a stale read is refused before it forks", () => {
  const head = confirmedTrail[confirmedTrail.length - 1].content_hash
  const stale = appendStudyEvent(study, confirmedTrail, confirmedTrail[2].content_hash, {
    event_type: "task_completed",
    actor: "the study service",
    task_ref: "f".repeat(64),
    capsule_ref: "1".repeat(64),
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.refusal.code, "EVENT_HEAD_MISMATCH")

  // Claiming an empty trail when the trail is not empty is the same mistake.
  const claimedEmpty = appendStudyEvent(study, confirmedTrail, null, {
    event_type: "task_queued",
    actor: "the study service",
    task_ref: "f".repeat(64),
  })
  assert.equal(claimedEmpty.ok, false)
  assert.equal(claimedEmpty.refusal.code, "EVENT_HEAD_MISMATCH")

  const fresh = appendStudyEvent(study, confirmedTrail, head, {
    event_type: "task_completed",
    actor: "the study service",
    task_ref: "f".repeat(64),
    capsule_ref: "1".repeat(64),
  })
  assert.equal(fresh.ok, true)
})

test("a wait is resumed to the status the study was waiting from, which one event cannot know", () => {
  const waiting = trailOf(
    { event_type: "study_created" },
    { event_type: "specification_revised", specification_ref: specificationRef },
    { event_type: "plan_created", plan_ref: planRef },
    { event_type: "question_elicited", question: "Is the budget still 250k?" },
    { event_type: "answer_confirmed", question: "Is the budget still 250k?" },
  )
  assert.deepEqual(waiting.map((event) => event.to_status), [
    "DRAFT",
    "SPECIFIED",
    "PLANNED",
    "NEEDS_INPUT",
    "PLANNED",
  ])
  assert.equal(verifyStudyEventChain(waiting).valid, true)

  // A single event cannot check this: the status before the wait is a fact about
  // the trail. So a forged resumption parses, and the chain catches it.
  const forged = { ...waiting[4], to_status: "RUNNING" }
  forged.content_hash = studySelfHash("study_event", forged)
  assert.equal(StudyEventSchema.safeParse(forged).success, true, "the schema cannot see the trail")
  const verdict = verifyStudyEventChain([...waiting.slice(0, 4), forged])
  assert.equal(verdict.valid, false)
  assert.equal(verdict.problems[0].code, "INVALID_STATUS_TRANSITION")
})

test("a second question while already waiting is refused, because there would be nothing to resume to", () => {
  const waiting = trailOf(
    { event_type: "study_created" },
    { event_type: "question_elicited", question: "What is the objective?" },
  )
  const second = appendStudyEvent(study, waiting, waiting[1].content_hash, {
    event_type: "question_elicited",
    actor: "the study service",
    question: "And the budget?",
  })
  assert.equal(second.ok, false)
  assert.equal(second.refusal.code, "EVENT_TYPE_NOT_PERMITTED")
})

test("a trail that does not verify is not extended", () => {
  const broken = [...confirmedTrail]
  broken[1] = { ...broken[1], reason: "rewritten" }
  const appended = appendStudyEvent(study, broken, broken[broken.length - 1].content_hash, {
    event_type: "task_completed",
    actor: "the study service",
    task_ref: "f".repeat(64),
    capsule_ref: "1".repeat(64),
  })
  assert.equal(appended.ok, false)
  assert.equal(appended.refusal.code, "EVENT_CHAIN_BROKEN")
})

test("an event out of order is refused by the event table rather than by a pair of statuses", () => {
  const early = trailOf({ event_type: "study_created" })
  const skipped = appendStudyEvent(study, early, early[0].content_hash, {
    event_type: "task_started",
    actor: "the study service",
    task_ref: "f".repeat(64),
  })
  assert.equal(skipped.ok, false)
  assert.equal(skipped.refusal.code, "EVENT_TYPE_NOT_PERMITTED")
  // What was actually wrong, read off the table rather than out of the prose:
  // codes are the contract and messages are for people.
  assert.deepEqual(studyEventRule("task_started").permitted_from, ["AWAITING_CONFIRMATION", "RUNNING"])
})

test("two studies' events are two trails", () => {
  const other = buildStudy({ studyId: OTHER_STUDY_ID, title: "A different question entirely", core: study.core })
  const appended = appendStudyEvent(other, confirmedTrail, confirmedTrail[confirmedTrail.length - 1].content_hash, {
    event_type: "task_queued",
    actor: "the study service",
    task_ref: "f".repeat(64),
  })
  assert.equal(appended.ok, false)
  assert.equal(appended.refusal.code, "EVENT_CHAIN_BROKEN")
})

// ------------------------------------------------- what the store must enforce

test("the invariants no amount of checking here can establish are declared, not implied", () => {
  const names = STUDY_PERSISTENCE_INVARIANTS.map((invariant) => invariant.name)
  assert.deepEqual(names.slice().sort(), [
    "confirmation_receipt_idempotency_unique",
    "confirmation_receipt_plan_compare_and_set",
    "study_event_head_compare_and_set",
    "study_event_sequence_unique",
    "study_id_unique",
    "study_revision_compare_and_set",
    "study_revision_unique",
    "task_outcome_unique",
  ])
  for (const invariant of STUDY_PERSISTENCE_INVARIANTS) {
    assert.ok(invariant.key.length > 0, invariant.name)
    assert.ok(invariant.sdk_checks.length > 0 && invariant.persistence_must.length > 0, invariant.name)
    assert.ok(["unique", "compare_and_set"].includes(invariant.kind), invariant.name)
    assert.equal(Object.isFrozen(invariant), true)
  }
  assert.equal(Object.isFrozen(STUDY_PERSISTENCE_INVARIANTS), true)
})

// --------------------------------------------------------- immutable revisions

test("revising a specification produces the next revision and leaves the original alone", () => {
  const before = JSON.parse(JSON.stringify(specification))
  const revised = reviseOk(
    reviseSpecification(
      specification,
      {
        problem_size: quantityField(4800, "delivery stops"),
        open_questions: [
          openQuestion("budget_at_larger_size", "limitations", {
            question: "Does the larger instance still fit the budget?",
            requirement: "OPTIONAL",
            blocks: ["PLAN_CONSTRUCTION"],
          }),
        ],
      },
      specification.content_hash,
    ),
  )
  assert.equal(revised.revision, 2)
  assert.equal(revised.supersedes, specification.content_hash)
  assert.equal(revised.problem_size.quantity.value, 4800)
  assert.equal(revised.content_hash, studySelfHash("problem_specification", revised))
  assert.notEqual(revised.content_hash, specification.content_hash)
  assert.deepEqual(specification, before, "the superseded revision is untouched")
})

test("revising a plan produces the next revision and leaves the original alone", () => {
  const before = JSON.parse(JSON.stringify(plan))
  const revised = reviseOk(revisePlan(plan, { max_credits: 4000 }, plan.content_hash))
  assert.equal(revised.revision, 2)
  assert.equal(revised.supersedes, plan.content_hash)
  assert.equal(revised.max_credits, 4000)
  assert.equal(revised.content_hash, studySelfHash("study_plan", revised))
  assert.deepEqual(plan, before, "the superseded revision is untouched")
})

test("a revision after the first must name what it supersedes, and the first must not", () => {
  const revisedSpecification = reviseOk(reviseSpecification(specification, {}, specification.content_hash))
  assert.throws(
    () => ProblemSpecificationSchema.parse({ ...revisedSpecification, supersedes: null }),
    /must name the revision it supersedes/,
  )
  assert.throws(
    () => ProblemSpecificationSchema.parse({ ...specification, supersedes: "a".repeat(64) }),
    /first revision supersedes nothing/,
  )

  const revisedPlan = reviseOk(revisePlan(plan, {}, plan.content_hash))
  assert.throws(() => StudyPlanSchema.parse({ ...revisedPlan, supersedes: null }), /must name the revision it supersedes/)
  assert.throws(() => StudyPlanSchema.parse({ ...plan, supersedes: "a".repeat(64) }), /first revision supersedes nothing/)
})

test("a revision is refused unless four statements about the base agree", () => {
  // (1) the stored hash, (2) the hash recomputed from the contents, (3) the
  // caller's assertion, (4) the store's newest revision. Each disagreement is a
  // different accident with a different fix, so each is a different code.
  const edited = { ...plan, max_credits: 99999 }
  const editedResult = revisePlan(edited, { reproducibility_level: "EXACT" }, edited.content_hash)
  assert.equal(editedResult.ok, false)
  assert.equal(editedResult.refusal.code, "REVISION_BASE_EDITED")
  assert.notEqual(studySelfHash("study_plan", edited), edited.content_hash)

  const wrongAssertion = revisePlan(plan, { max_credits: 4000 }, "d".repeat(64))
  assert.equal(wrongAssertion.ok, false)
  assert.equal(wrongAssertion.refusal.code, "REVISION_BASE_MISMATCH")

  const second = reviseOk(revisePlan(plan, { max_credits: 4000 }, plan.content_hash))
  const branching = revisePlan(plan, { max_credits: 6000 }, plan.content_hash, {
    revision_hash: second.content_hash,
    revision: second.revision,
  })
  assert.equal(branching.ok, false)
  assert.equal(branching.refusal.code, "REVISION_BRANCH_DETECTED")

  // The same three refusals on a specification, so the check is the family's
  // rather than the plan module's.
  const editedSpecification = { ...specification, limitations: ["Edited after writing."] }
  assert.equal(
    reviseSpecification(editedSpecification, {}, editedSpecification.content_hash).refusal.code,
    "REVISION_BASE_EDITED",
  )
  assert.equal(reviseSpecification(specification, {}, "d".repeat(64)).refusal.code, "REVISION_BASE_MISMATCH")
})

test("two revisions from one base both verify, which is why the store owes a compare-and-set", () => {
  // The concurrent case, modelled rather than described. Neither branch is
  // detectably wrong from the records in hand: each names revision 1 as its
  // predecessor and each hashes to what it says.
  const mine = reviseOk(revisePlan(plan, { max_credits: 4000 }, plan.content_hash))
  const theirs = reviseOk(revisePlan(plan, { max_credits: 6000 }, plan.content_hash))
  assert.equal(mine.revision, theirs.revision)
  assert.equal(mine.supersedes, theirs.supersedes)
  assert.notEqual(mine.content_hash, theirs.content_hash)
  assert.equal(studySelfHash("study_plan", mine), mine.content_hash)
  assert.equal(studySelfHash("study_plan", theirs), theirs.content_hash)

  // What the SDK can do about it is refuse the second when the caller brings the
  // store's answer; what closes the window at the write is the store's.
  const withStoreAnswer = revisePlan(plan, { max_credits: 6000 }, plan.content_hash, {
    revision_hash: mine.content_hash,
    revision: mine.revision,
  })
  assert.equal(withStoreAnswer.ok, false)
  assert.equal(withStoreAnswer.refusal.code, "REVISION_BRANCH_DETECTED")
  const invariant = STUDY_PERSISTENCE_INVARIANTS.find(
    (candidate) => candidate.name === "study_revision_compare_and_set",
  )
  assert.deepEqual([...invariant.record_kinds].sort(), ["problem_specification", "study_plan"])
})

// ------------------------------------------------- the confirmation is a binding

test("the confirmation target is the hash of exactly the revision that was read", () => {
  const revised = reviseOk(revisePlan(plan, { max_credits: 4000 }, plan.content_hash))
  assert.equal(planConfirmationTarget(plan), plan.content_hash)
  assert.equal(planConfirmationTarget(revised), revised.content_hash)
  assert.notEqual(planConfirmationTarget(revised), planConfirmationTarget(plan))
  assert.equal(verifyPlanConfirmation(plan, planConfirmationTarget(plan)).ok, true)
})

test("a confirmation of the superseded revision does not carry forward", () => {
  const revised = reviseOk(revisePlan(plan, { max_credits: 4000 }, plan.content_hash))
  const verdict = verifyPlanConfirmation(revised, plan.content_hash)
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "PLAN_REVISION_SUPERSEDED")
})

test("a newer revision invalidates a confirmation of this one, however deep the chain", () => {
  const second = reviseOk(revisePlan(plan, { max_credits: 4000 }, plan.content_hash))
  const third = reviseOk(revisePlan(second, { max_credits: 6000 }, second.content_hash))
  const verdict = verifyPlanConfirmation(second, second.content_hash, { revision_hash: third.content_hash,
    revision: third.revision,
  })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "PLAN_REVISION_SUPERSEDED")
  assert.equal(verifyPlanConfirmation(third, third.content_hash, { revision_hash: third.content_hash, revision: 3 }).ok, true)
})

test("a plan edited after confirmation fails even when the confirmed hash is the one it carries", () => {
  // The verifier recomputes, so keeping the old digest on edited contents does
  // not preserve the approval -- it is the case a hash comparison alone misses.
  const tampered = { ...plan, max_credits: 100000 }
  const verdict = verifyPlanConfirmation(tampered, tampered.content_hash)
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "CONFIRMATION_HASH_MISMATCH")
  assert.notEqual(studySelfHash("study_plan", tampered), tampered.content_hash)
})

test("a confirmation naming some other record is a mismatch, not a stale approval", () => {
  const verdict = verifyPlanConfirmation(plan, "d".repeat(64))
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "CONFIRMATION_HASH_MISMATCH")
})

// The four records that replace `StudyTask` -- the confirmation receipt, the
// authorization, the job and the outcome -- are exercised in
// tests/study-execution.test.mjs, together with the per-class execution capsule.
// They are a family of their own and their fixtures are execution fixtures; the
// lifecycle invariants this file is about end at the plan.

// ----------------------------------------------------------- UNKNOWN discipline

test("a text field with no value must declare UNKNOWN, and one declared UNKNOWN cannot carry text", () => {
  assert.throws(
    () => TextFieldSchema.parse({ value: null, evidence: "MEASURED", origin: "INFERRED" }),
    /must be classified UNKNOWN/,
  )
  assert.throws(
    () => TextFieldSchema.parse({ value: "a plausible objective", evidence: "UNKNOWN", origin: "INFERRED" }),
    /must carry a null value/,
  )
  assert.equal(TextFieldSchema.parse(unknownTextField()).value, null)
})

const accuracyQuestion = (changes = {}) =>
  openQuestion("accuracy_requirement", "accuracy_requirement", {
    question: "How accurate does the answer have to be?",
    answer_type: "QUANTITY",
    ...changes,
  })

const whyQuantumQuestion = (changes = {}) =>
  openQuestion("why_quantum", "why_quantum", { question: "Why is a quantum method a candidate here?", ...changes })

test("an unanswered specification field survives with its reason, and moves the hash when it is answered", () => {
  const reason = "Nobody has said how close an answer has to be to be useful."
  const unanswered = seal(
    "problem_specification",
    ProblemSpecificationSchema,
    specificationCore({
      accuracy_requirement: unknownQuantityField("relative error", reason),
      why_quantum: unknownTextField(),
      open_questions: [accuracyQuestion(), whyQuantumQuestion()],
    }),
  )

  assert.equal(unanswered.accuracy_requirement.quantity.value, null)
  assert.equal(unanswered.accuracy_requirement.quantity.evidence, "UNKNOWN")
  assert.deepEqual(unanswered.accuracy_requirement.quantity.limitations, [reason])
  assert.equal(unanswered.why_quantum.value, null)

  // The null survives canonicalization in both directions: through a JSON round
  // trip, and back out of the digest. An absent key and an explicit null are
  // different records, which is what keeps "never asked" apart from "asked, no
  // answer".
  const roundTripped = JSON.parse(JSON.stringify(unanswered))
  assert.equal(roundTripped.accuracy_requirement.quantity.value, null)
  assert.equal(studySelfHash("problem_specification", roundTripped), unanswered.content_hash)
  assert.equal(ProblemSpecificationSchema.parse(roundTripped).accuracy_requirement.quantity.value, null)

  const answered = seal(
    "problem_specification",
    ProblemSpecificationSchema,
    specificationCore({
      accuracy_requirement: quantityField(0.01, "relative error"),
      why_quantum: unknownTextField(),
      open_questions: [
        accuracyQuestion({ resolution: "ANSWERED", answer_provenance: answerProvenance() }),
        whyQuantumQuestion(),
      ],
    }),
  )
  assert.notEqual(answered.content_hash, unanswered.content_hash)
})

test("an inferred field and a confirmed one are different records", () => {
  // The only difference between the two records is `origin`. The question stays
  // outstanding in both, because confirming a value does not settle whether it
  // was the right value to confirm.
  const objectiveQuestion = openQuestion("objective", "objective", { question: "Is this really the objective?" })
  const withOrigin = (origin) =>
    seal(
      "problem_specification",
      ProblemSpecificationSchema,
      specificationCore({
        objective: textField("Decide whether to fund a two-year quantum programme.", "USER_PROVIDED", origin),
        open_questions: [objectiveQuestion],
      }),
    )
  const inferred = withOrigin("INFERRED")
  const confirmed = withOrigin("CONFIRMED")
  assert.equal(inferred.objective.value, confirmed.objective.value)
  assert.notEqual(inferred.content_hash, confirmed.content_hash, "origin is hashed; a guess is not a confirmation")
})

test("a specification's gaps have to be in its queue, one question per gap", () => {
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          why_quantum: textField("Because it is exciting.", "USER_PROVIDED", "INFERRED"),
          open_questions: [],
          content_hash: "a".repeat(64),
        }),
      ),
    /no open question targets why_quantum/,
  )
  // A question about a different field does not cover this one: the queue is
  // checked per gap, so a long list cannot stand in for the missing entry.
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          why_quantum: textField("Because it is exciting.", "USER_PROVIDED", "INFERRED"),
          open_questions: [openQuestion("budget", "budget_constraint")],
          content_hash: "a".repeat(64),
        }),
      ),
    /no open question targets why_quantum/,
  )
  assert.equal(ProblemSpecificationSchema.parse({ ...specificationCore(), content_hash: "a".repeat(64) }).open_questions.length, 0)
})

test("open questions name every gap without inventing an answer for it", () => {
  const partial = seal(
    "problem_specification",
    ProblemSpecificationSchema,
    specificationCore({
      budget_constraint: unknownQuantityField("USD", "No budget has been set."),
      why_quantum: textField("The published analysis covers this size.", "USER_PROVIDED", "INFERRED"),
      open_questions: [
        openQuestion("budget_constraint", "budget_constraint", {
          question: "Who signs off on the budget?",
          answer_type: "QUANTITY",
          requirement: "OPTIONAL",
        }),
        whyQuantumQuestion(),
      ],
    }),
  )

  const questions = openQuestionsOf(partial)
  assert.deepEqual(
    questions.map((question) => question.question_id),
    ["why_quantum", "budget_constraint"],
    "a required question is asked before an optional one, whatever order they were written in",
  )
  // Every gap is named, and nothing is answered on the study's behalf: an
  // outstanding question carries no provenance, because there is nobody to
  // attribute an answer to.
  assert.ok(questions.every((question) => question.answer_provenance === null))
  assert.ok(!questions.some((question) => question.targets === "objective"), "a confirmed field asks nothing")
  assert.deepEqual(openQuestionsOf(specification), [], "a fully confirmed specification has nothing left to ask")
})

// ------------------------------------------- a confirmed unknown is not an answer

test("a question nobody answered and a question answered `I do not know` stay different", () => {
  // The three settled-without-an-answer states all look identical on the field
  // -- null value, UNKNOWN evidence, CONFIRMED origin -- so the question is
  // where they are told apart, and the specification refuses one that is not.
  const settled = (resolution) =>
    seal(
      "problem_specification",
      ProblemSpecificationSchema,
      specificationCore({
        budget_constraint: unknownQuantityField("USD", "The customer looked and could not say.", "CONFIRMED"),
        open_questions: [
          openQuestion("budget_constraint", "budget_constraint", {
            answer_type: "QUANTITY",
            resolution,
            answer_provenance: answerProvenance(),
          }),
        ],
      }),
    )

  const unanswered = seal(
    "problem_specification",
    ProblemSpecificationSchema,
    specificationCore({
      budget_constraint: unknownQuantityField("USD", "Nobody has been asked."),
      open_questions: [openQuestion("budget_constraint", "budget_constraint", { answer_type: "QUANTITY" })],
    }),
  )

  const confirmedUnknown = settled("CONFIRMED_UNKNOWN")
  const notApplicable = settled("NOT_APPLICABLE")
  const declined = settled("DECLINED")

  // All four records carry the same null budget. They are four different
  // specifications, and the digest says so.
  for (const record of [unanswered, confirmedUnknown, notApplicable, declined]) {
    assert.equal(record.budget_constraint.quantity.value, null)
    assert.equal(record.budget_constraint.quantity.evidence, "UNKNOWN")
  }
  const digests = new Set(
    [unanswered, confirmedUnknown, notApplicable, declined].map((record) => record.content_hash),
  )
  assert.equal(digests.size, 4, "four states, four records, four digests")

  // And the field's own state distinguishes the two that a display layer would
  // otherwise render the same way.
  const stateOf = (record) =>
    specificationFieldStates(record).find((status) => status.path === "budget_constraint").state
  assert.equal(stateOf(unanswered), "UNANSWERED")
  assert.equal(stateOf(confirmedUnknown), "CONFIRMED_UNKNOWN")

  // A confirmed null whose only question is still outstanding is refused: the
  // record would be claiming somebody confirmed something and leaving no
  // statement of what they confirmed.
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          budget_constraint: unknownQuantityField("USD", "The customer looked.", "CONFIRMED"),
          open_questions: [openQuestion("budget_constraint", "budget_constraint", { answer_type: "QUANTITY" })],
          content_hash: "a".repeat(64),
        }),
      ),
    /says which kind of settled that is/,
  )

  // The other direction: a question cannot be recorded as answered while the
  // field it targets carries nothing.
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          budget_constraint: unknownQuantityField("USD", "Nobody has been asked."),
          open_questions: [
            openQuestion("budget_constraint", "budget_constraint", {
              answer_type: "QUANTITY",
              resolution: "ANSWERED",
              answer_provenance: answerProvenance(),
            }),
          ],
          content_hash: "a".repeat(64),
        }),
      ),
    /The answer is not in the record it was recorded against/,
  )

  // The resolution table is what an orchestrator branches on, so the three
  // states have to be separable from it alone.
  const answered = QUESTION_RESOLUTIONS.filter((rule) => rule.answered).map((rule) => rule.resolution)
  const outstanding = QUESTION_RESOLUTIONS.filter((rule) => rule.outstanding).map((rule) => rule.resolution)
  const settledWithout = QUESTION_RESOLUTIONS.filter((rule) => !rule.answered && !rule.outstanding)
  assert.deepEqual(answered, ["ANSWERED"])
  assert.deepEqual(outstanding, ["UNANSWERED"])
  assert.deepEqual(
    settledWithout.map((rule) => rule.resolution).sort(),
    ["CONFIRMED_UNKNOWN", "DECLINED", "NOT_APPLICABLE"],
  )
  assert.equal(Object.isFrozen(QUESTION_RESOLUTIONS), true)
})

test("an answer that nobody is behind is not an answer", () => {
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          budget_constraint: unknownQuantityField("USD", "The customer looked.", "CONFIRMED"),
          open_questions: [
            openQuestion("budget_constraint", "budget_constraint", { resolution: "CONFIRMED_UNKNOWN" }),
          ],
          content_hash: "a".repeat(64),
        }),
      ),
    /indistinguishable from a field a script set/,
  )
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          open_questions: [openQuestion("spare", "limitations", { answer_provenance: answerProvenance() })],
          content_hash: "a".repeat(64),
        }),
      ),
    /has nobody to attribute an answer to/,
  )
})

// ------------------------------------------------------------- unit semantics

test("a quantity cannot take a unit from another dimension", () => {
  const specificationWith = (changes) => () =>
    ProblemSpecificationSchema.parse(specificationCore({ ...changes, content_hash: "a".repeat(64) }))

  // Seconds are not dollars, in both directions.
  assert.throws(specificationWith({ runtime_constraint: quantityField(3600, "USD") }), /TIME quantity/)
  assert.throws(specificationWith({ budget_constraint: quantityField(250000, "seconds") }), /MONEY quantity/)
  assert.throws(specificationWith({ accuracy_requirement: quantityField(0.01, "USD") }), /ACCURACY quantity/)

  // An unanswered field still declares a unit, so the check applies to a null
  // value exactly as it does to a measured one.
  assert.throws(
    specificationWith({ runtime_constraint: unknownQuantityField("credits", "Nobody has said.") }),
    /TIME quantity/,
  )

  // A problem size is counted in whatever the instance is made of, so its family
  // is open -- and open means "anything that is not a duration, a price, a
  // quantity of memory or a tolerance", not "anything".
  assert.equal(unitBelongsToDimension("delivery stops", "PROBLEM_SIZE"), true)
  assert.equal(unitBelongsToDimension("physical qubits", "PROBLEM_SIZE"), true)
  assert.equal(unitBelongsToDimension("seconds", "PROBLEM_SIZE"), false)
  assert.throws(specificationWith({ problem_size: quantityField(1200, "hours") }), /PROBLEM_SIZE quantity/)

  const planWith = (changes) => () =>
    StudyPlanSchema.parse({ ...planCore(changes), content_hash: "a".repeat(64) })
  const estimate = (value, unit) =>
    quantity({ value, unit, evidence: "MODELLED", source: "Model.", model: MODEL, modelVersion: VERSION })
  assert.throws(planWith({ expected_runtime: estimate(0.432, "credits") }), /TIME quantity/)
  // Credits are not money: they convert through a tariff somebody set, so a
  // ceiling in credits and an estimate in dollars would bound nothing.
  assert.throws(planWith({ expected_credits: estimate(1800, "USD") }), /CREDITS quantity/)

  // Memory, shots and qubit counts reach the family through a criterion
  // threshold, which declares its own dimension.
  assert.throws(
    () => CriterionThresholdSchema.parse({ dimension: "MEMORY", value: 8, exact_value: null, unit: "seconds" }),
    /MEMORY quantity/,
  )
  assert.throws(
    () => CriterionThresholdSchema.parse({ dimension: "SHOTS", value: 100000, exact_value: null, unit: "qubits" }),
    /SHOTS quantity/,
  )
  assert.equal(
    CriterionThresholdSchema.parse({ dimension: "MEMORY", value: 8, exact_value: null, unit: "gibibytes" }).unit,
    "gibibytes",
  )
  assert.equal(
    CriterionThresholdSchema.parse({ dimension: "SHOTS", value: null, exact_value: "20000000000000000", unit: "shots" })
      .exact_value,
    "20000000000000000",
    "a shot count past 2^53 is written as digits, under the exact_integer_string contract",
  )
  assert.throws(
    () => CriterionThresholdSchema.parse({ dimension: "SHOTS", value: 1, exact_value: "1", unit: "shots" }),
    /written once/,
  )
  assert.throws(
    () => CriterionThresholdSchema.parse({ dimension: "SHOTS", value: null, exact_value: null, unit: "shots" }),
    /written once/,
  )

  // The rule has to survive into the generated JSON Schema, because
  // `python/src/ketqat_runner/study_validation.py` checks records against that
  // and not against these schemas. A unit stated in a refinement would be a unit
  // only one of the two languages constrains, which is the failure `values.ts`
  // describes at length for the exact-number contracts.
  const unconstrainedUnits = []
  const walkForUnits = (node, path) => {
    if (node === null || typeof node !== "object") return
    if (Array.isArray(node)) {
      node.forEach((item, index) => walkForUnits(item, `${path}[${index}]`))
      return
    }
    const unit = node.properties?.unit
    if (unit !== undefined && unit.enum === undefined && unit.pattern === undefined) {
      unconstrainedUnits.push(path)
    }
    for (const [key, child] of Object.entries(node)) walkForUnits(child, `${path}.${key}`)
  }
  for (const file of ["study-plan.schema.json", "problem-specification.schema.json"]) {
    const emitted = JSON.parse(readFileSync(new URL(`../schemas/${file}`, import.meta.url), "utf8"))
    walkForUnits(emitted, file)
  }
  assert.deepEqual(unconstrainedUnits, [], "a unit the generated schema does not constrain is a unit Python accepts")

  // The declared dimensions are data a reviewer and this test read from one
  // place, and every family is frozen.
  assert.deepEqual(
    STUDY_FIELD_DIMENSIONS.filter((entry) => entry.record_kind === "study_plan").map((entry) => entry.field),
    ["expected_runtime", "expected_credits"],
  )
  assert.equal(Object.isFrozen(STUDY_UNIT_FAMILIES), true)
  for (const family of STUDY_UNIT_FAMILIES) assert.equal(Object.isFrozen(family.units), true)
})

// -------------------------------------------------------- structured criteria

test("a criterion is a predicate rather than a sentence about one", () => {
  // The numeric comparators are the claim comparators, so a criterion and the
  // claim node that eventually answers it speak one vocabulary.
  assert.deepEqual(CriterionComparatorSchema.options.slice(0, 5), [...ClaimComparatorSchema.options])

  const planWith = (changes) => () =>
    StudyPlanSchema.parse({ ...planCore(changes), content_hash: "a".repeat(64) })

  assert.throws(
    planWith({ success_criteria: [criterion("no_threshold", { threshold: null })] }),
    /compares against a threshold, and this criterion states none/,
  )
  assert.throws(
    planWith({
      success_criteria: [criterion("exists_with_threshold", { comparator: "EXISTS" })],
    }),
    /tests whether the metric is there at all/,
  )
  assert.throws(
    planWith({ success_criteria: [criterion("unknown_evidence", { required_evidence: ["UNKNOWN"] })] }),
    /satisfied by nothing having been established/,
  )
  assert.throws(planWith({ success_criteria: [criterion("Shouty")] }), /invalid/i)

  // A plan is written before anything runs, so it cannot carry a verdict.
  assert.throws(
    planWith({ success_criteria: [criterion("already_passed", { status: "PASS" })] }),
    /a plan that carries a verdict is a plan that has decided its own outcome/,
  )
  assert.throws(
    planWith({ refusal_criteria: [criterion("already_failed", { status: "FAIL" })] }),
    /is recorded as FAIL on a plan/,
  )

  // One id space across both lists: a verdict is filed against an id.
  assert.throws(
    planWith({
      success_criteria: [criterion("shared_id")],
      refusal_criteria: [criterion("shared_id", { comparator: "IS_FALSE", threshold: null })],
    }),
    /A verdict recorded against that id would settle both/,
  )

  // The prose is kept and is presentation: rewording an explanation leaves the
  // predicate, and therefore the science, where it was.
  const reworded = {
    ...plan,
    success_criteria: [criterion("physical_qubits_within_ceiling", { explanation: "Said another way." })],
  }
  assert.equal(semanticHash("study_plan", reworded), semanticHash("study_plan", plan))
  assert.notEqual(studySelfHash("study_plan", reworded), plan.content_hash)

  // The condition is not.
  const loosened = {
    ...plan,
    success_criteria: [
      criterion("physical_qubits_within_ceiling", {
        threshold: { dimension: "QUBITS", value: 8400000, exact_value: null, unit: "physical qubits" },
      }),
    ],
  }
  assert.notEqual(semanticHash("study_plan", loosened), semanticHash("study_plan", plan))
})

test("a specification's confirmed success criterion carries the predicate, not only the prose", () => {
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          success_criteria: [{ statement: textField("The quantum route wins."), predicate: null }],
          content_hash: "a".repeat(64),
        }),
      ),
    /A confirmed success criterion carries the predicate/,
  )
  // A criterion nobody has stated yet has nothing to test, so a predicate
  // beside it would be a test for a sentence that does not exist.
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          success_criteria: [{ statement: unknownTextField(), predicate: criterion("premature") }],
          open_questions: [openQuestion("criteria", "success_criteria")],
          content_hash: "a".repeat(64),
        }),
      ),
    /nobody has written down/,
  )
})

// ------------------------------------------------------- the data handling policy

test("the data-handling summary is generated from the policy rather than stored beside it", () => {
  // There is no field to disagree with the policy, and the schema refuses one.
  assert.equal("data_handling_summary" in plan, false)
  assert.throws(
    () => StudyPlanSchema.parse({ ...planCore(), data_handling_summary: "Anything goes.", content_hash: "a".repeat(64) }),
    /Unrecognized key/,
  )
  assert.throws(
    () => StudyPlanSchema.parse({ ...planCore({ data_handling: "Anything goes." }), content_hash: "a".repeat(64) }),
    /Expected object/,
  )

  const summary = planDataHandlingSummary(plan)
  assert.equal(summary, dataHandlingSummary(plan.data_handling))
  assert.match(summary, /deleted after 90 days/)
  assert.match(summary, /Egress is limited to content hashes/)
  assert.match(summary, /Data policy version 1\.0/)

  // Every one of the eleven decisions reaches the sentence. A field that did not
  // would be a decision a reader confirming the summary never saw.
  const variations = [
    { visibility: "PUBLIC" },
    { retention: { kind: "RETAIN_INDEFINITELY", days: null } },
    { third_party_transfer: "QUANTUM_PROVIDER_ONLY", allowed_egress: [{ kind: "QUANTUM_PROVIDER_API", host: null }] },
    { model_training_use: "PERMITTED_ON_AGGREGATES" },
    { visibility: "PUBLIC", public_dataset_opt_in: true },
    { third_party_transfer: "NAMED_PROCESSORS", allowed_egress: [{ kind: "NAMED_HOST", host: "results.example.org" }] },
    { export_permission: "FULL" },
    { deletion_policy: { kind: "NOT_OFFERED", within_days: null } },
    { secret_handling: "REFERENCED_BY_VAULT" },
    { pii_handling: "PSEUDONYMISED" },
    { policy_version: "2.0" },
  ]
  for (const change of variations) {
    const varied = DataHandlingPolicySchema.parse(dataHandlingPolicy(change))
    assert.notEqual(
      dataHandlingSummary(varied),
      summary,
      `changing ${Object.keys(change).join(" and ")} left the summary unchanged`,
    )
  }

  // A policy that contradicts itself is refused where it is written, rather than
  // by whichever system reads it first.
  assert.throws(
    () => DataHandlingPolicySchema.parse(dataHandlingPolicy({ public_dataset_opt_in: true })),
    /cannot also be offered as a public dataset/,
  )
  assert.throws(
    () =>
      DataHandlingPolicySchema.parse(
        dataHandlingPolicy({ allowed_egress: [{ kind: "QUANTUM_PROVIDER_API", host: null }] }),
      ),
    /Egress is how a transfer happens/,
  )
  assert.throws(
    () =>
      DataHandlingPolicySchema.parse(
        dataHandlingPolicy({
          allowed_egress: [
            { kind: "NONE", host: null },
            { kind: "HASHES_ONLY", host: null },
          ],
        }),
      ),
    /permits egress and says it permits none/,
  )
  assert.throws(
    () => DataHandlingPolicySchema.parse(dataHandlingPolicy({ retention: { kind: "RETAIN_INDEFINITELY", days: 90 } })),
    /A reader would take the number for a deletion date/,
  )
  assert.throws(
    () =>
      DataHandlingPolicySchema.parse(
        dataHandlingPolicy({ pii_handling: "PRESENT_RESTRICTED", model_training_use: "PERMITTED" }),
      ),
    /not a property a trained model keeps/,
  )

  // The policy is hashed, so a plan somebody confirmed cannot have its data
  // handling loosened afterwards without the confirmation ceasing to match.
  const loosened = { ...plan, data_handling: dataHandlingPolicy({ export_permission: "FULL" }) }
  assert.notEqual(studySelfHash("study_plan", loosened), plan.content_hash)
  assert.equal(verifyPlanConfirmation(loosened, plan.content_hash).ok, false)
})

// ------------------------------------------------------------ immutable version pins

test("a version pin names a program rather than a label a registry resolves", () => {
  assert.equal(planExecutability(plan).executable, true)

  const labelled = {
    ...planCore({
      pinned_versions: {
        adapter: null,
        model: versionPin("ketqat-resource-intelligence"),
        engine: versionPin("ketqat-engine"),
      },
    }),
    content_hash: "a".repeat(64),
  }
  const parsed = StudyPlanSchema.parse(labelled)
  const verdict = planExecutability(parsed)
  assert.equal(verdict.executable, false, "a name and a version are not a pin")
  assert.deepEqual(
    verdict.shortfalls.map((shortfall) => [shortfall.role, shortfall.kind]),
    [
      ["engine", "NO_IMMUTABLE_PIN"],
      ["model", "NO_IMMUTABLE_PIN"],
    ],
  )
  assert.match(verdict.shortfalls[0].message, /names a version and not a program/)

  // An absent adapter is not an unpinned adapter.
  assert.equal(
    planExecutability(
      StudyPlanSchema.parse({
        ...planCore({
          pinned_versions: {
            adapter: versionPin("vendor-adapter", { adapter_configuration_hash: "f".repeat(64) }),
            model: versionPin("m", { model_snapshot_hash: "d".repeat(64) }),
            engine: versionPin("e", { container_digest: `sha256:${"e".repeat(64)}` }),
          },
        }),
        content_hash: "a".repeat(64),
      }),
    ).executable,
    true,
  )
  assert.equal(
    planExecutability(
      StudyPlanSchema.parse({
        ...planCore({
          pinned_versions: {
            adapter: versionPin("vendor-adapter"),
            model: versionPin("m", { model_snapshot_hash: "d".repeat(64) }),
            engine: versionPin("e", { container_digest: `sha256:${"e".repeat(64)}` }),
          },
        }),
        content_hash: "a".repeat(64),
      }),
    ).executable,
    false,
  )

  // The identifiers are shaped, so a digest that is a paragraph is refused where
  // it is written rather than where it fails to resolve.
  for (const bad of [
    { container_digest: "e".repeat(64) },
    { container_digest: `sha256:${"e".repeat(63)}` },
    { source_commit: "not a commit" },
    { model_snapshot_hash: "sha256:" + "d".repeat(64) },
  ]) {
    assert.throws(
      () =>
        StudyPlanSchema.parse({
          ...planCore({
            pinned_versions: {
              adapter: null,
              model: versionPin("m", { model_snapshot_hash: "d".repeat(64) }),
              engine: versionPin("e", { container_digest: `sha256:${"e".repeat(64)}`, ...bad }),
            },
          }),
          content_hash: "a".repeat(64),
        }),
      /invalid/i,
      Object.keys(bad)[0],
    )
  }

  // Which components are required and which are best-effort is declared as data,
  // and every component is classified for every role.
  for (const entry of STUDY_VERSION_PIN_REQUIREMENTS) {
    const named = [...entry.required, ...entry.immutable_any_of, ...entry.best_effort].sort()
    assert.deepEqual(named, [...VERSION_PIN_COMPONENTS].sort(), entry.role)
    assert.ok(entry.immutable_any_of.length > 0, entry.role)
    assert.equal(Object.isFrozen(entry), true)
  }
  assert.deepEqual(
    STUDY_VERSION_PIN_REQUIREMENTS.map((entry) => entry.role).sort(),
    ["adapter", "engine", "model"],
  )

  // A pin is hashed in full, so swapping the image behind an unchanged version
  // string moves the plan's digest.
  const rebuilt = {
    ...plan,
    pinned_versions: {
      ...plan.pinned_versions,
      engine: { ...plan.pinned_versions.engine, container_digest: `sha256:${"1".repeat(64)}` },
    },
  }
  assert.notEqual(studySelfHash("study_plan", rebuilt), plan.content_hash)
  assert.equal(rebuilt.pinned_versions.engine.package_version, plan.pinned_versions.engine.package_version)
})

// --------------------------------------------------------------- the fixture pin

test("the stored plan revision verifies against its own contents", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/reproducibility/study-plan-revision.json", import.meta.url), "utf8"),
  )
  const pins = JSON.parse(
    readFileSync(new URL("../fixtures/reproducibility/study-expected-hashes.json", import.meta.url), "utf8"),
  )[STUDY_HASH_RULES_ID].study_plan_revision

  assert.equal(fixture.revision, 2)
  assert.equal(typeof fixture.supersedes, "string")
  assert.equal(isStudyOpaqueId(fixture.study_ref), true, "a plan points at a study id, not at a digest")
  assert.equal(studySelfHash("study_plan", fixture), fixture.content_hash)
  assert.equal(studySelfHash("study_plan", fixture), pins.self_hash)
  assert.equal(pins.record_kind, "study_plan")

  // The fixture is exactly the fields a plan declares, and that is the change.
  // It used to be written as a store hands the row back -- wrapped in `id`,
  // `slug`, `owner_username`, `status`, `runtime_seconds` and the rest -- to pin
  // a rule that dropped those names from the digest at every depth. There is no
  // such rule any more. The projection reads the fields the kind declares and
  // refuses the rest, so row metadata is not something a study record can carry
  // and be hashed: it is stripped by whatever read the row, before the record
  // exists.
  //
  // The refusal is the assertion. Skipping an undeclared key would give this
  // record and the same record with an extra key one digest, so a field could be
  // added to a finished plan for nothing.
  for (const rowMetadata of [
    { id: "volatile-plan-id" },
    { slug: "volatile-plan-slug" },
    { owner_username: "volatile-owner" },
    { visibility: "private" },
    { status: "AWAITING_CONFIRMATION" },
    { ui_metadata: { pinned: true } },
    { updated_at: "2027-01-01T00:00:00.000Z" },
    { runtime_seconds: 4242.5 },
  ]) {
    const key = Object.keys(rowMetadata)[0]
    assert.throws(
      () => studySelfHash("study_plan", { ...fixture, ...rowMetadata }),
      (error) => error.code === "UNDECLARED_FIELD" && error.path === key,
      `${key} must be refused rather than dropped`,
    )
    assert.throws(() => StudyPlanSchema.parse({ ...fixture, ...rowMetadata }), /Unrecognized key/)
  }

  const parsed = StudyPlanSchema.parse(fixture)
  assert.equal(studySelfHash("study_plan", parsed), fixture.content_hash, "parsing changes nothing")
  assert.equal(verifyPlanConfirmation(parsed, fixture.content_hash).ok, true)

  // A plan is immutable once written, so its identity is the record digest and
  // every declared field moves it -- including `revision` and `supersedes`,
  // which are where the revision chain lives. The two that do not are the
  // `DERIVED` header components the preimage already commits to.
  for (const decision of [
    { max_credits: 2501 },
    { reproducibility_level: "EXACT" },
    { refusal_criteria: [] },
    { data_handling: { ...fixture.data_handling, visibility: "PUBLIC" } },
    { revision: 3 },
    { supersedes: "b".repeat(64) },
    { created_at: "2027-01-01T00:00:00.000Z" },
  ]) {
    assert.notEqual(
      studySelfHash("study_plan", { ...fixture, ...decision }),
      fixture.content_hash,
      `${Object.keys(decision)[0]} must move a plan hash`,
    )
  }

  // `content_hash` cannot be an input to itself, and the two header components
  // are committed to outside the body rather than restated inside it.
  for (const derived of [
    { content_hash: "c".repeat(64) },
    { schema_version: STUDY_SCHEMA_VERSION },
    { hash_rules_id: STUDY_HASH_RULES_ID },
  ]) {
    assert.equal(
      studySelfHash("study_plan", { ...fixture, ...derived }),
      fixture.content_hash,
      `${Object.keys(derived)[0]} is DERIVED and is not an input to the digest that covers it`,
    )
  }
})
