import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { quantity, unknownQuantity } from "../dist/index.js"
// The study barrel is finalized in the integration package, so these modules are
// imported by compiled path rather than through `dist/index.js`. The paths are
// what the barrel will re-export; nothing here depends on the wiring order.
import { STUDY_SCHEMA_VERSION, TextFieldSchema } from "../dist/study/common.js"
import { STUDY_HASH_RULES_ID, calculateStudyHash } from "../dist/study/hashing.js"
import {
  STUDY_STATUS_TRANSITIONS,
  StudyEventSchema,
  StudySchema,
  StudyStatusSchema,
  appendStudyEvent,
  isValidStudyTransition,
  verifyStudyEventChain,
} from "../dist/study/study.js"
import { ProblemSpecificationSchema, openQuestionsOf, reviseSpecification } from "../dist/study/specification.js"
import { StudyPlanSchema, planConfirmationTarget, revisePlan, verifyPlanConfirmation } from "../dist/study/plan.js"
import { buildStudyTask } from "../dist/study/task.js"

/**
 * Lifecycle contracts for the study family (ketqat-sdk#259, ADR 0010, RFC 0008).
 *
 * The invariants under test are the ones that decide whether a number in a
 * report can be trusted: that a study's history cannot be rewritten without
 * anyone noticing, that a revision never edits its predecessor, that a
 * confirmation binds to exactly the plan revision somebody read, and that a
 * field nobody has answered stays visibly unanswered all the way through
 * canonicalization. Each of them, violated, produces a plausible-looking record
 * that says something nobody agreed to.
 */

const MODEL = "ketqat-study-test"
const VERSION = "0.1.0"

/** Stamp then hash, in the order every builder in the family uses. */
function seal(schema, withoutHash) {
  return schema.parse({ ...withoutHash, content_hash: calculateStudyHash(withoutHash) })
}

const study = seal(StudySchema, {
  schema_version: STUDY_SCHEMA_VERSION,
  hash_rules_id: STUDY_HASH_RULES_ID,
  study_type: "FTQC_FEASIBILITY",
  title: "Would a fault-tolerant machine beat our routing solver?",
  project_ref: "acme-logistics",
  is_demo: true,
  status: "DRAFT",
  latest_specification: null,
  latest_plan: null,
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

function specificationCore(changes = {}) {
  return {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.content_hash,
    revision: 1,
    supersedes: null,
    objective: textField("Decide whether to fund a two-year quantum programme."),
    success_criteria: [textField("A stated condition under which the quantum route wins.")],
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

const specification = seal(ProblemSpecificationSchema, specificationCore())

function planCore(changes = {}) {
  return {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.content_hash,
    specification_ref: { revision_hash: specification.content_hash, revision: specification.revision },
    revision: 1,
    supersedes: null,
    baselines: [{ baseline_ref: "a".repeat(64), source_class: "measured", note: "Timed on the customer's cluster." }],
    candidates: [{ name: "Qubitized QPE", workload_ref: "b".repeat(64), rationale: "The only candidate with a published analysis." }],
    scenario_refs: ["c".repeat(64)],
    pinned_versions: {
      adapter: null,
      model: { name: "ketqat-resource-intelligence", version: "0.1.0" },
      engine: { name: "ketqat-engine", version: "0.3.0" },
    },
    expected_runtime: quantity({ value: 0.432, unit: "seconds", evidence: "MODELLED", source: "Runtime model.", model: MODEL, modelVersion: VERSION }),
    expected_credits: quantity({ value: 1800, unit: "credits", evidence: "DERIVED", source: "Runtime at the pinned tariff.", model: MODEL, modelVersion: VERSION }),
    max_credits: 2500,
    data_handling: "Inputs and outputs stay in the customer's tenancy.",
    reproducibility_level: "STATISTICAL",
    success_criteria: ["A physical-qubit count per pinned scenario, with its assumptions stated."],
    refusal_criteria: ["No classical baseline survives review, so no economic comparison is drawn."],
    execution_limitations: ["One QEC scheme is modelled."],
    ...changes,
  }
}

const plan = seal(StudyPlanSchema, planCore())

// ------------------------------------------------------------- the status ladder

test("every transition the ladder names is accepted, and every other pair is not", () => {
  const statuses = StudyStatusSchema.options
  const eventBetween = (from, to) => ({
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: study.content_hash,
    sequence: 2,
    previous_event_hash: "a".repeat(64),
    from_status: from,
    to_status: to,
    actor: "a reviewer",
    reason: null,
    plan_ref: to === "RUNNING" ? { revision_hash: plan.content_hash, revision: plan.revision } : null,
    content_hash: "b".repeat(64),
  })

  for (const from of statuses) {
    for (const to of statuses) {
      const legal = STUDY_STATUS_TRANSITIONS[from].includes(to)
      assert.equal(isValidStudyTransition(from, to), legal, `${from} -> ${to}`)
      if (legal) {
        assert.equal(StudyEventSchema.parse(eventBetween(from, to)).to_status, to)
      } else if (to !== "DRAFT") {
        assert.throws(() => StudyEventSchema.parse(eventBetween(from, to)), /cannot move from/, `${from} -> ${to}`)
      }
    }
  }
})

test("a study cannot start running without passing through confirmation", () => {
  assert.equal(isValidStudyTransition("PLANNED", "RUNNING"), false)
  const trail = [
    { toStatus: "DRAFT" },
    { toStatus: "SPECIFIED" },
    { toStatus: "PLANNED" },
  ].reduce((events, step) => {
    const appended = appendStudyEvent(study, events, { ...step, actor: "the study service" })
    assert.equal(appended.ok, true)
    return [...events, appended.event]
  }, [])

  const skipped = appendStudyEvent(study, trail, {
    toStatus: "RUNNING",
    actor: "the study service",
    planRef: { revision_hash: plan.content_hash, revision: plan.revision },
  })
  assert.equal(skipped.ok, false)
  assert.equal(skipped.refusal.code, "INVALID_STATUS_TRANSITION")
  assert.match(skipped.refusal.message, /AWAITING_CONFIRMATION/)
})

test("the terminal statuses accept nothing", () => {
  for (const terminal of ["REFUSED", "SUPERSEDED"]) {
    assert.deepEqual(STUDY_STATUS_TRANSITIONS[terminal], [])
    for (const to of StudyStatusSchema.options) {
      assert.equal(isValidStudyTransition(terminal, to), false)
    }
  }
})

test("refusing is reachable from every state a study is still alive in", () => {
  for (const [from, reachable] of Object.entries(STUDY_STATUS_TRANSITIONS)) {
    if (reachable.length === 0) continue
    assert.ok(reachable.includes("REFUSED"), `${from} must be able to refuse`)
  }
})

test("only the creation event has no prior status, and only it reaches DRAFT", () => {
  assert.equal(isValidStudyTransition(null, "DRAFT"), true)
  assert.equal(isValidStudyTransition(null, "SPECIFIED"), false)
  const created = appendStudyEvent(study, [], { toStatus: "DRAFT", actor: "the study service" })
  assert.equal(created.ok, true)
  assert.equal(created.event.from_status, null)
  assert.throws(
    () => StudyEventSchema.parse({ ...created.event, from_status: "DRAFT", to_status: "DRAFT" }),
    /Nothing returns to DRAFT/,
  )
})

// -------------------------------------------------------------- the event trail

function trailOf(...steps) {
  return steps.reduce((events, step) => {
    const appended = appendStudyEvent(study, events, { actor: "the study service", ...step })
    assert.equal(appended.ok, true, appended.ok ? "" : appended.refusal.message)
    return [...events, appended.event]
  }, [])
}

const confirmedTrail = trailOf(
  { toStatus: "DRAFT" },
  { toStatus: "SPECIFIED" },
  { toStatus: "PLANNED", reason: "Plan revision 1 drafted." },
  { toStatus: "AWAITING_CONFIRMATION" },
  { toStatus: "RUNNING", planRef: { revision_hash: plan.content_hash, revision: plan.revision } },
)

test("each appended event numbers itself and names the hash of the one before it", () => {
  assert.equal(confirmedTrail.length, 5)
  confirmedTrail.forEach((event, index) => {
    assert.equal(event.sequence, index + 1)
    assert.equal(event.previous_event_hash, index === 0 ? null : confirmedTrail[index - 1].content_hash)
    assert.equal(event.from_status, index === 0 ? null : confirmedTrail[index - 1].to_status)
    assert.equal(event.study_ref, study.content_hash)
    assert.equal(event.content_hash, calculateStudyHash(event))
  })
  assert.equal(verifyStudyEventChain(confirmedTrail).valid, true)
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
})

test("an event edited after it was written no longer hashes to what it claims", () => {
  const tampered = [...confirmedTrail]
  tampered[2] = { ...tampered[2], actor: "somebody else" }
  const verdict = verifyStudyEventChain(tampered)
  assert.equal(verdict.valid, false)
  assert.equal(verdict.problems[0].code, "EVENT_CHAIN_BROKEN")
  assert.match(verdict.problems[0].message, /edited after it was written/)
})

test("a rewritten middle event is caught by the event that follows it, even after re-hashing", () => {
  // The interesting forgery repairs the hash it broke. Event three then verifies
  // on its own -- and event four still names the hash the original event three
  // had, which nothing in the trail can produce any more.
  const rewritten = { ...confirmedTrail[2], reason: "Approved verbally, no plan attached." }
  rewritten.content_hash = calculateStudyHash(rewritten)
  const tampered = [...confirmedTrail]
  tampered[2] = rewritten

  assert.equal(calculateStudyHash(rewritten), rewritten.content_hash, "the rewritten event is internally consistent")
  const verdict = verifyStudyEventChain(tampered)
  assert.equal(verdict.valid, false)
  const codes = verdict.problems.map((problem) => problem.code)
  assert.ok(codes.includes("EVENT_CHAIN_BROKEN"))
  assert.equal(verdict.problems[0].subject, "study event 4")
})

test("a trail that does not verify is not extended", () => {
  const broken = [...confirmedTrail]
  broken[1] = { ...broken[1], reason: "rewritten" }
  const appended = appendStudyEvent(study, broken, { toStatus: "CONCLUDED", actor: "the study service" })
  assert.equal(appended.ok, false)
  assert.equal(appended.refusal.code, "EVENT_CHAIN_BROKEN")
})

test("an event that starts a run must name the plan revision it runs", () => {
  const running = confirmedTrail[4]
  assert.deepEqual(running.plan_ref, { revision_hash: plan.content_hash, revision: plan.revision })
  assert.throws(() => StudyEventSchema.parse({ ...running, plan_ref: null }), /must name the confirmed plan revision/)
  assert.throws(
    () => appendStudyEvent(study, confirmedTrail.slice(0, 4), { toStatus: "RUNNING", actor: "the study service" }),
    /must name the confirmed plan revision/,
  )
})

test("two studies' events are two trails", () => {
  const other = seal(StudySchema, { ...study, title: "A different question entirely", content_hash: undefined })
  const appended = appendStudyEvent(other, confirmedTrail, { toStatus: "CONCLUDED", actor: "the study service" })
  assert.equal(appended.ok, false)
  assert.equal(appended.refusal.code, "EVENT_CHAIN_BROKEN")
})

// --------------------------------------------------------- immutable revisions

test("revising a specification produces the next revision and leaves the original alone", () => {
  const before = JSON.parse(JSON.stringify(specification))
  const revised = reviseSpecification(
    specification,
    { problem_size: quantityField(4800, "delivery stops"), open_questions: ["Does the larger instance still fit the budget?"] },
    specification.content_hash,
  )
  assert.equal(revised.revision, 2)
  assert.equal(revised.supersedes, specification.content_hash)
  assert.equal(revised.problem_size.quantity.value, 4800)
  assert.equal(revised.content_hash, calculateStudyHash(revised))
  assert.notEqual(revised.content_hash, specification.content_hash)
  assert.deepEqual(specification, before, "the superseded revision is untouched")
})

test("revising a plan produces the next revision and leaves the original alone", () => {
  const before = JSON.parse(JSON.stringify(plan))
  const revised = revisePlan(plan, { max_credits: 4000 }, plan.content_hash)
  assert.equal(revised.revision, 2)
  assert.equal(revised.supersedes, plan.content_hash)
  assert.equal(revised.max_credits, 4000)
  assert.equal(revised.content_hash, calculateStudyHash(revised))
  assert.deepEqual(plan, before, "the superseded revision is untouched")
})

test("a revision after the first must name what it supersedes, and the first must not", () => {
  const revisedSpecification = reviseSpecification(specification, {}, specification.content_hash)
  assert.throws(
    () => ProblemSpecificationSchema.parse({ ...revisedSpecification, supersedes: null }),
    /must name the revision it supersedes/,
  )
  assert.throws(
    () => ProblemSpecificationSchema.parse({ ...specification, supersedes: "a".repeat(64) }),
    /first revision supersedes nothing/,
  )

  const revisedPlan = revisePlan(plan, {}, plan.content_hash)
  assert.throws(() => StudyPlanSchema.parse({ ...revisedPlan, supersedes: null }), /must name the revision it supersedes/)
  assert.throws(() => StudyPlanSchema.parse({ ...plan, supersedes: "a".repeat(64) }), /first revision supersedes nothing/)
})

// ------------------------------------------------- the confirmation is a binding

test("the confirmation target is the hash of exactly the revision that was read", () => {
  const revised = revisePlan(plan, { max_credits: 4000 }, plan.content_hash)
  assert.equal(planConfirmationTarget(plan), plan.content_hash)
  assert.equal(planConfirmationTarget(revised), revised.content_hash)
  assert.notEqual(planConfirmationTarget(revised), planConfirmationTarget(plan))
  assert.equal(verifyPlanConfirmation(plan, planConfirmationTarget(plan)).ok, true)
})

test("a confirmation of the superseded revision does not carry forward", () => {
  const revised = revisePlan(plan, { max_credits: 4000 }, plan.content_hash)
  const verdict = verifyPlanConfirmation(revised, plan.content_hash)
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "PLAN_REVISION_SUPERSEDED")
})

test("a newer revision invalidates a confirmation of this one, however deep the chain", () => {
  const second = revisePlan(plan, { max_credits: 4000 }, plan.content_hash)
  const third = revisePlan(second, { max_credits: 6000 }, second.content_hash)
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
  assert.match(verdict.refusal.message, /edited after it was written/)
})

test("a confirmation naming some other record is a mismatch, not a stale approval", () => {
  const verdict = verifyPlanConfirmation(plan, "d".repeat(64))
  assert.equal(verdict.ok, false)
  assert.equal(verdict.refusal.code, "CONFIRMATION_HASH_MISMATCH")
})

test("a task is refused rather than built when nobody confirmed the plan", () => {
  for (const confirmedPlanHash of [null, ""]) {
    const built = buildStudyTask({ plan, confirmedPlanHash, kind: "STUDY_RESOURCE_ESTIMATE" })
    assert.equal(built.ok, false)
    assert.equal(built.refusal.code, "PLAN_NOT_CONFIRMED")
  }
})

test("a task binds to the confirmed plan revision by hash", () => {
  const built = buildStudyTask({ plan, confirmedPlanHash: plan.content_hash, kind: "STUDY_RESOURCE_ESTIMATE" })
  assert.equal(built.ok, true)
  assert.deepEqual(built.task.plan_ref, { revision_hash: plan.content_hash, revision: 1 })
  assert.equal(built.task.study_ref, study.content_hash)
  assert.equal(built.task.capsule_ref, null)
  assert.equal(built.task.status, "PENDING")
  assert.equal(built.task.content_hash, calculateStudyHash(built.task))

  // The job's status is denormalized here, so a task that progressed is the same
  // task and keeps the hash everything else references it by.
  assert.equal(calculateStudyHash({ ...built.task, status: "RUNNING" }), built.task.content_hash)
  assert.notEqual(calculateStudyHash({ ...built.task, kind: "STUDY_BENCHMARK_RUN" }), built.task.content_hash)
})

test("a task cannot be built against a plan revision that has been replaced", () => {
  const revised = revisePlan(plan, { max_credits: 4000 }, plan.content_hash)
  const built = buildStudyTask({ plan: revised, confirmedPlanHash: plan.content_hash, kind: "STUDY_BENCHMARK_RUN" })
  assert.equal(built.ok, false)
  assert.equal(built.refusal.code, "PLAN_REVISION_SUPERSEDED")
})

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

test("an unanswered specification field survives with its reason, and moves the hash when it is answered", () => {
  const reason = "Nobody has said how close an answer has to be to be useful."
  const unanswered = seal(
    ProblemSpecificationSchema,
    specificationCore({
      accuracy_requirement: unknownQuantityField("relative error", reason),
      why_quantum: unknownTextField(),
      open_questions: ["How accurate does the answer have to be?"],
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
  assert.equal(calculateStudyHash(roundTripped), unanswered.content_hash)
  assert.equal(ProblemSpecificationSchema.parse(roundTripped).accuracy_requirement.quantity.value, null)

  const answered = seal(
    ProblemSpecificationSchema,
    specificationCore({
      accuracy_requirement: quantityField(0.01, "relative error"),
      why_quantum: unknownTextField(),
      open_questions: ["How accurate does the answer have to be?"],
    }),
  )
  assert.notEqual(answered.content_hash, unanswered.content_hash)
})

test("an inferred field and a confirmed one are different records", () => {
  const inferred = seal(
    ProblemSpecificationSchema,
    specificationCore({
      objective: textField("Decide whether to fund a two-year quantum programme.", "USER_PROVIDED", "INFERRED"),
      open_questions: ["Is this really the objective?"],
    }),
  )
  const confirmed = seal(
    ProblemSpecificationSchema,
    specificationCore({
      objective: textField("Decide whether to fund a two-year quantum programme.", "USER_PROVIDED", "CONFIRMED"),
      open_questions: ["Is this really the objective?"],
    }),
  )
  assert.equal(inferred.objective.value, confirmed.objective.value)
  assert.notEqual(inferred.content_hash, confirmed.content_hash, "origin is hashed; a guess is not a confirmation")
})

test("a specification with unconfirmed fields cannot claim to have no open questions", () => {
  assert.throws(
    () =>
      ProblemSpecificationSchema.parse(
        specificationCore({
          why_quantum: textField("Because it is exciting.", "USER_PROVIDED", "INFERRED"),
          open_questions: [],
          content_hash: "a".repeat(64),
        }),
      ),
    /has open questions by definition/,
  )
  assert.equal(ProblemSpecificationSchema.parse({ ...specificationCore(), content_hash: "a".repeat(64) }).open_questions.length, 0)
})

test("open questions name every gap without inventing an answer for it", () => {
  const partial = seal(
    ProblemSpecificationSchema,
    specificationCore({
      budget_constraint: unknownQuantityField("USD", "No budget has been set."),
      why_quantum: textField("The published analysis covers this size.", "USER_PROVIDED", "INFERRED"),
      open_questions: ["Who signs off on the budget?"],
    }),
  )
  const questions = openQuestionsOf(partial)
  assert.equal(questions[0], "Who signs off on the budget?", "what a person wrote comes first")
  assert.ok(questions.some((question) => question.startsWith("budget constraint: no answer has been recorded")))
  assert.ok(questions.some((question) => question.startsWith("why quantum: proposed by the system")))
  assert.ok(!questions.some((question) => question.startsWith("objective")), "a confirmed field asks nothing")
  assert.deepEqual(openQuestionsOf(specification), [], "a fully confirmed specification has nothing left to ask")
})

// --------------------------------------------------------------- the fixture pin

test("the stored plan revision verifies against its own contents", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/reproducibility/study-plan-revision.json", import.meta.url), "utf8"),
  )
  assert.equal(fixture.revision, 2)
  assert.equal(typeof fixture.supersedes, "string")
  assert.equal(calculateStudyHash(fixture), fixture.content_hash)
  assert.equal(calculateStudyHash(fixture), "a29381c39e2f15ccb1669ab1f6f787e7214bf67cefa9bd96903852b5c3384eb0")

  // Parsing drops the volatile keys the fixture carries; the digest ignored them
  // already, so the record and its parsed form are the same record.
  const parsed = StudyPlanSchema.parse(fixture)
  assert.equal(calculateStudyHash(parsed), fixture.content_hash)
  assert.equal(verifyPlanConfirmation(parsed, fixture.content_hash).ok, true)

  for (const volatileChange of [
    { id: "another-id" },
    { slug: "another-slug" },
    { status: "RUNNING" },
    { updated_at: "2027-01-01T00:00:00.000Z" },
    { started_at: "2027-01-01T00:00:00.000Z" },
    { runtime_seconds: 4242.5 },
  ]) {
    assert.equal(
      calculateStudyHash({ ...fixture, ...volatileChange }),
      fixture.content_hash,
      `${Object.keys(volatileChange)[0]} must not move a plan hash`,
    )
  }

  for (const decision of [
    { max_credits: 2501 },
    { reproducibility_level: "EXACT" },
    { refusal_criteria: [] },
    { data_handling: "Anything goes." },
  ]) {
    assert.notEqual(
      calculateStudyHash({ ...fixture, ...decision }),
      fixture.content_hash,
      `${Object.keys(decision)[0]} must move a plan hash`,
    )
  }
})
