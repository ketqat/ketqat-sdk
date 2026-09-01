import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import {
  ContentHashSchema,
  STUDY_SCHEMA_VERSION,
  StudyPositionSchema,
  TextFieldSchema,
  type QuantityField,
  type RevisionRef,
  type TextField,
} from "./common.js"
import { StudyCriterionSchema, duplicateCriterionIds, type StudyCriterion } from "./criteria.js"
import { studySelfHash } from "./hash.js"
import { StudyIdSchema } from "./identity.js"
import {
  OpenQuestionSchema,
  duplicateQuestionIds,
  isQuestionOutstanding,
  isSettledWithoutAnAnswer,
  questionResolutionRule,
  questionTargetsField,
  type OpenQuestion,
} from "./questions.js"
import type { StudyRefusal } from "./refusals.js"
import { studyRevisionRefusal } from "./revision.js"
import { STUDY_HASH_RULES_ID } from "./rules.js"
import { dimensionedQuantityFieldSchema } from "./units.js"

/**
 * What the study is actually asking, written down well enough to be answerable
 * (ketqat-sdk#259, ADR 0010, RFC 0008 §6).
 *
 * Most of a specification is drafted by a machine from a conversation, which is
 * the useful part and also the dangerous part. A field the system proposed and a
 * field a person read and agreed to are worth different amounts, and by the time
 * a number reaches a report nobody can tell them apart from the number alone. So
 * every field here wears an `origin`, and `origin` is hashed: an inferred
 * specification and the confirmed version of the same text are two different
 * records with two different hashes.
 *
 * Specifications are immutable. Editing one produces revision n+1 naming the
 * hash of revision n, the same discipline `ResourceScenario` already uses, for
 * the same reason: a plan built against a specification that was quietly changed
 * underneath it is a plan for a question nobody asked.
 *
 * Three things make the record actionable rather than merely readable.
 *
 * **Every measured field declares its dimension.** A runtime constraint takes
 * time units and a budget takes money, and neither takes the other's. The
 * envelope's `unit` is a free string in `src/intelligence/measurement.ts` and
 * has to stay one there; `units.ts` narrows it per field here.
 *
 * **The elicitation queue is records, not sentences.** `open_questions` says
 * which field an answer would fill, what shape it takes, what it blocks, and
 * what happened to the asking -- so an agent can work it, and so a question
 * answered "I do not know" stops looking like a question nobody asked.
 *
 * **Every gap is accounted for.** The refinements below make the queue complete:
 * a field nobody has settled must have an outstanding question, and a field
 * somebody confirmed as null must have a question saying *which* kind of
 * settled it is. That is what stops `value: null` + `evidence: UNKNOWN` +
 * `origin: CONFIRMED` from reading as resolved.
 *
 * The converse is deliberately not enforced. A field that carries a confirmed
 * value may still have an open question about it -- "is this really the
 * objective?" is a question worth asking about an answer somebody has already
 * given, and refusing it would make agreeing to a draft the end of the
 * conversation.
 */

/**
 * One thing that would count as an answer.
 *
 * The statement is prose under the elicitation discipline, because a success
 * criterion starts as something a person says and may not be known yet. The
 * predicate is what an orchestrator evaluates, and it is required exactly where
 * the study claims the criterion is settled: a confirmed criterion with no
 * predicate is a study asserting it knows what success means while leaving the
 * test to whoever writes the report.
 */
export interface SpecificationSuccessCriterion {
  statement: TextField
  predicate: StudyCriterion | null
}

export const SpecificationSuccessCriterionSchema: Contract<SpecificationSuccessCriterion> = z
  .object({
    statement: TextFieldSchema,
    predicate: StudyCriterionSchema.nullable(),
  })
  .strict()
  .superRefine((criterion, context) => {
    const stated = criterion.statement.value !== null
    if (stated && criterion.statement.origin === "CONFIRMED" && criterion.predicate === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A confirmed success criterion carries the predicate an orchestrator evaluates. Prose alone leaves the " +
          "decision to whoever reads it, which is the decision a success criterion exists to take in advance.",
        path: ["predicate"],
      })
    }
    if (!stated && criterion.predicate !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A predicate is stated for a criterion nobody has written down, so nothing says what it tests for.",
        path: ["predicate"],
      })
    }
  }) as unknown as Contract<SpecificationSuccessCriterion>

export interface ProblemSpecification {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  revision: number
  supersedes: string | null
  objective: TextField
  success_criteria: SpecificationSuccessCriterion[]
  accuracy_requirement: QuantityField
  runtime_constraint: QuantityField
  budget_constraint: QuantityField
  problem_size: QuantityField
  current_classical_method: TextField
  why_quantum: TextField
  open_questions: OpenQuestion[]
  limitations: string[]
  created_at?: string
  content_hash: string
}

/**
 * The four states a specification field can be in.
 *
 * Four rather than two, and the fourth is the reason this enum exists.
 * `UNANSWERED` and `CONFIRMED_UNKNOWN` are both a null value, and they differ
 * only in whether a person has looked. Treating them alike either re-asks a
 * question already answered or presents an unexamined blank as a settled fact,
 * and which of the two happens depends on which way the code rounded.
 */
export const SPECIFICATION_FIELD_STATES = Object.freeze([
  "ANSWERED",
  "INFERRED",
  "UNANSWERED",
  "CONFIRMED_UNKNOWN",
] as const)

export type SpecificationFieldState = (typeof SPECIFICATION_FIELD_STATES)[number]

export interface SpecificationFieldStatus {
  /** The path a question targets, which is how a status and a question are matched. */
  readonly path: string
  /** The same field in the words a person would use. */
  readonly label: string
  readonly state: SpecificationFieldState
}

/**
 * The fields whose settlement the invariants below are about.
 *
 * Declared as a structural type rather than as `ProblemSpecification` so the
 * same walk can run inside the schema's own refinement, where the value is not
 * yet a parsed specification.
 */
interface SpecificationFields {
  objective: TextField
  success_criteria: SpecificationSuccessCriterion[]
  accuracy_requirement: QuantityField
  runtime_constraint: QuantityField
  budget_constraint: QuantityField
  problem_size: QuantityField
  current_classical_method: TextField
  why_quantum: TextField
}

const stateOf = (known: boolean, confirmed: boolean): SpecificationFieldState => {
  if (known) return confirmed ? "ANSWERED" : "INFERRED"
  return confirmed ? "CONFIRMED_UNKNOWN" : "UNANSWERED"
}

/** Every answerable field of a specification, with the state it is in. */
export function specificationFieldStates(
  specification: SpecificationFields,
): readonly SpecificationFieldStatus[] {
  const text = (path: string, label: string, field: TextField): SpecificationFieldStatus => ({
    path,
    label,
    state: stateOf(field.value !== null, field.origin === "CONFIRMED"),
  })
  const measured = (path: string, label: string, field: QuantityField): SpecificationFieldStatus => ({
    path,
    label,
    state: stateOf(field.quantity.value !== null, field.origin === "CONFIRMED"),
  })
  return Object.freeze([
    text("objective", "objective", specification.objective),
    ...specification.success_criteria.map((criterion, index) =>
      text(`success_criteria[${index}]`, `success criterion ${index + 1}`, criterion.statement),
    ),
    measured("accuracy_requirement", "accuracy requirement", specification.accuracy_requirement),
    measured("runtime_constraint", "runtime constraint", specification.runtime_constraint),
    measured("budget_constraint", "budget constraint", specification.budget_constraint),
    measured("problem_size", "problem size", specification.problem_size),
    text("current_classical_method", "current classical method", specification.current_classical_method),
    text("why_quantum", "why quantum", specification.why_quantum),
  ])
}

export const ProblemSpecificationSchema: Contract<ProblemSpecification> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /** Starts at 1. A change produces revision n+1; it never rewrites revision n. */
    revision: StudyPositionSchema,
    /** Hash of the revision this one replaces, or null for the first. */
    supersedes: ContentHashSchema.nullable(),
    /** What the study is for, in the asker's terms. */
    objective: TextFieldSchema,
    /** What would count as an answer. Never empty: a study with no success criteria cannot conclude. */
    success_criteria: z.array(SpecificationSuccessCriterionSchema).min(1),
    /** How close the answer has to be to be useful, in a unit that says how close and not close in what. */
    accuracy_requirement: dimensionedQuantityFieldSchema("ACCURACY"),
    /** How long an answer may take before it stops being worth having. */
    runtime_constraint: dimensionedQuantityFieldSchema("TIME"),
    /** What may be spent, in money. A ceiling in platform credits is the plan's `max_credits`. */
    budget_constraint: dimensionedQuantityFieldSchema("MONEY"),
    /** The size of the instance the answer has to hold for, counted in whatever the instance is made of. */
    problem_size: dimensionedQuantityFieldSchema("PROBLEM_SIZE"),
    /** What is being done today, which is what any advantage claim is measured against. */
    current_classical_method: TextFieldSchema,
    /** Why a quantum method is a candidate here at all. */
    why_quantum: TextFieldSchema,
    /** What still has to be asked, and what happened to everything already asked. */
    open_questions: z.array(OpenQuestionSchema),
    /** What this specification does not cover. */
    limitations: z.array(z.string().min(1)),
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it says. */
    created_at: IsoDateTimeSchema.optional(),
    content_hash: ContentHashSchema,
  })
  .strict()
  .superRefine((specification, context) => {
    // The revision pairing, in the wording `scenario.ts` already uses. Two
    // families phrasing the same invariant two ways would read as two
    // invariants.
    if (specification.revision > 1 && specification.supersedes === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A revision after the first must name the revision it supersedes.",
        path: ["supersedes"],
      })
    }
    if (specification.revision === 1 && specification.supersedes !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The first revision supersedes nothing.",
        path: ["supersedes"],
      })
    }

    for (const duplicate of duplicateQuestionIds(specification.open_questions)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Two questions are filed under ${duplicate}. An answer recorded against that id would belong to both, ` +
          "and which one it settled could not be recovered.",
        path: ["open_questions"],
      })
    }
    const predicates = specification.success_criteria
      .map((criterion) => criterion.predicate)
      .filter((predicate): predicate is StudyCriterion => predicate !== null)
    for (const duplicate of duplicateCriterionIds(predicates)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Two success criteria are filed under ${duplicate}; a verdict against it would settle both.`,
        path: ["success_criteria"],
      })
    }

    // The queue is complete in both directions.
    //
    // From the field's side: a gap nobody has settled must have an outstanding
    // question, or the specification presents the system's own guesses as
    // settled; and a field confirmed with no value must have a question saying
    // which kind of settled it is, or a field nobody could answer is
    // indistinguishable from one nobody was asked about.
    //
    // From the question's side: a resolution has to agree with the field it was
    // recorded against, so an answer cannot be filed against a field that
    // carries nothing and a question cannot be closed as unanswerable over a
    // field that carries a value.
    const states = specificationFieldStates(specification)
    for (const status of states) {
      const targeting = specification.open_questions.filter((question) =>
        questionTargetsField(question, status.path),
      )
      if (status.state === "UNANSWERED" || status.state === "INFERRED") {
        if (!targeting.some(isQuestionOutstanding)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              `The ${status.label} is ${status.state === "INFERRED" ? "the system's own proposal" : "unanswered"} ` +
              `and no open question targets ${status.path}. A specification whose gaps are not in the queue ` +
              "presents them as settled.",
            path: ["open_questions"],
          })
        }
      }
      if (status.state === "CONFIRMED_UNKNOWN" && !targeting.some(isSettledWithoutAnAnswer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `The ${status.label} carries no value and is marked confirmed, and no question targeting ` +
            `${status.path} says which kind of settled that is. A confirmed unknown, a field that does not apply ` +
            "and an answer somebody declined are three different states, and none of them is an answer.",
          path: ["open_questions"],
        })
      }
    }

    const stateByPath = new Map(states.map((status) => [status.path, status.state]))
    for (const question of specification.open_questions) {
      const state = stateByPath.get(question.targets)
      // A question naming a list rather than one of its elements has no single
      // state to agree with, and is checked from the field's side above.
      if (state === undefined) continue
      const rule = questionResolutionRule(question.resolution)
      if (rule.answered && state !== "ANSWERED") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `Question ${question.question_id} is recorded as answered and ${question.targets} is ${state}. ` +
            "The answer is not in the record it was recorded against.",
          path: ["open_questions"],
        })
      }
      if (!rule.answered && !rule.outstanding && state !== "CONFIRMED_UNKNOWN") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `Question ${question.question_id} is settled without an answer and ${question.targets} is ${state}. ` +
            "A field that carries a value is not a field somebody could not answer.",
          path: ["open_questions"],
        })
      }
    }
  }) as unknown as Contract<ProblemSpecification>

/**
 * Everything still worth asking about this specification.
 *
 * A filter rather than a generator, which is the consequence of the schema
 * requiring every gap to be in the queue already: there is nothing left for
 * this function to invent, and a generated question would in any case be one
 * nobody could file an answer against, because it would have no id in the
 * record.
 *
 * Required questions come first. Everything else keeps the order it was written
 * in, so a queue a person arranged stays arranged.
 */
export function openQuestionsOf(specification: ProblemSpecification): readonly OpenQuestion[] {
  const outstanding = specification.open_questions.filter(isQuestionOutstanding)
  return Object.freeze([
    ...outstanding.filter((question) => question.requirement === "REQUIRED"),
    ...outstanding.filter((question) => question.requirement === "OPTIONAL"),
  ])
}

/**
 * Produce the next revision of a specification, superseding the current one.
 *
 * `currentHash` is supplied by the caller rather than read from
 * `current.content_hash`, following `reviseScenario`. The record's own hash
 * field is a claim about the record; the argument is the hash the caller
 * actually verified. Where those two disagree, the disagreement is the thing
 * worth catching -- and it used to be the thing that was written into
 * `supersedes` unexamined. `studyRevisionRefusal` compares all four statements
 * that have to agree, and which one disagreed comes back as a code (see
 * `revision.ts`); `latestRevision` adds the concurrent case when the caller
 * knows what the store's newest revision is.
 *
 * A refusal rather than a throw, because "somebody else revised this while you
 * were editing" is an ordinary thing to happen to a study and a caller has to
 * be able to tell it apart from "the record you handed me was edited".
 */
export function reviseSpecification(
  current: ProblemSpecification,
  changes: Partial<
    Omit<ProblemSpecification, "revision" | "supersedes" | "schema_version" | "hash_rules_id" | "content_hash">
  >,
  currentHash: string,
  latestRevision?: RevisionRef | null,
): { ok: true; specification: ProblemSpecification } | { ok: false; refusal: StudyRefusal } {
  const refusal = studyRevisionRefusal(
    "problem_specification",
    `problem specification revision ${current.revision}`,
    current,
    currentHash,
    latestRevision,
  )
  if (refusal !== null) return { ok: false, refusal }

  const withoutHash = {
    ...current,
    ...changes,
    revision: current.revision + 1,
    supersedes: currentHash,
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    // A revision is a new record. It does not inherit the moment the revision
    // before it was written, and it does not carry that revision's hash: the
    // predecessor is named in `supersedes`, and nowhere else.
    created_at: changes.created_at,
    content_hash: undefined,
  }
  return {
    ok: true,
    specification: ProblemSpecificationSchema.parse({
      ...withoutHash,
      content_hash: studySelfHash("problem_specification", withoutHash),
    }),
  }
}
