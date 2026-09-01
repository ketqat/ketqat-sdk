import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"

/**
 * The elicitation queue, as records rather than sentences (goal §10.1).
 *
 * A list of strings is a list nobody can act on. It does not say which field an
 * answer would fill, what shape the answer takes, whether the study can proceed
 * without it, or -- the one that matters -- whether it has been answered. So an
 * agent re-asks questions that were settled, and a report presents a gap as a
 * finding because nothing in the record distinguished the two.
 *
 * The distinction this file exists for:
 *
 * **A question nobody answered and a question answered "I don't know" are
 * different states.** On the field they look identical -- `value: null`,
 * `evidence: UNKNOWN` -- and the only difference is `origin`, which says a
 * person confirmed it. That is not enough, because `origin: CONFIRMED` beside a
 * null value has three possible meanings: the user looked and does not know,
 * the field does not apply to this study, or the user chose not to say. Each
 * leads somewhere different -- the first is a modelling assumption to be
 * declared, the second is a field to be dropped from the report, the third is a
 * commercial fact -- and none of them is "resolved". So the question carries
 * the resolution, and the specification refuses a confirmed-unknown field that
 * no question accounts for.
 *
 * Nothing here invents an answer. A resolution says what happened to the asking,
 * and `answer_provenance` says who said so.
 */

/**
 * What shape an answer takes.
 *
 * Read by whatever asks the question: a `QUANTITY` needs a number and a unit, a
 * `CHOICE` needs the list to choose from, and a `BOOLEAN` needs neither. Prose
 * asking for a number is how a number arrives as a sentence.
 */
export const OpenQuestionAnswerTypeSchema = z.enum(["TEXT", "QUANTITY", "CHOICE", "BOOLEAN"])
export type OpenQuestionAnswerType = z.infer<typeof OpenQuestionAnswerTypeSchema>

/**
 * Whether the study can proceed without an answer.
 *
 * `OPTIONAL` is a real state and not politeness: a question that would sharpen
 * an estimate but does not block anything should not stop a study, and marking
 * everything `REQUIRED` is how a queue becomes a wall somebody routes around.
 */
export const OpenQuestionRequirementSchema = z.enum(["REQUIRED", "OPTIONAL"])
export type OpenQuestionRequirement = z.infer<typeof OpenQuestionRequirementSchema>

/**
 * What an unanswered question holds up.
 *
 * Named stages rather than prose, because this is the field an orchestrator
 * branches on: a question blocking `REPORT_EXPORT` does not stop a run, and a
 * question blocking `TASK_EXECUTION` must stop one before credits are spent.
 */
export const StudyBlockedStageSchema = z.enum([
  "SPECIFICATION_SIGN_OFF",
  "PLAN_CONSTRUCTION",
  "PLAN_CONFIRMATION",
  "TASK_EXECUTION",
  "REPORT_EXPORT",
])
export type StudyBlockedStage = z.infer<typeof StudyBlockedStageSchema>

/** What happened to the asking. */
export const QuestionResolutionSchema = z.enum([
  "UNANSWERED",
  "ANSWERED",
  "CONFIRMED_UNKNOWN",
  "NOT_APPLICABLE",
  "DECLINED",
])
export type QuestionResolution = z.infer<typeof QuestionResolutionSchema>

export interface QuestionResolutionRule {
  readonly resolution: QuestionResolution
  /** Whether a value was supplied. Only `ANSWERED` supplies one. */
  readonly answered: boolean
  /** Whether the question is still worth asking. */
  readonly outstanding: boolean
  readonly means: string
}

/**
 * The five states, as immutable plain data.
 *
 * Two booleans rather than one, because the three settled-without-an-answer
 * states are neither answered nor outstanding, and a single flag would have to
 * put them with one or the other. Filed with the answered ones they become a
 * value that does not exist; filed with the outstanding ones the study asks
 * again, having already been told.
 */
export const QUESTION_RESOLUTIONS: readonly QuestionResolutionRule[] = Object.freeze([
  Object.freeze({
    resolution: "UNANSWERED" as const,
    answered: false,
    outstanding: true,
    means: "nobody has been asked, or nobody has replied",
  }),
  Object.freeze({
    resolution: "ANSWERED" as const,
    answered: true,
    outstanding: false,
    means: "a value was supplied and is recorded in the field this question targets",
  }),
  Object.freeze({
    resolution: "CONFIRMED_UNKNOWN" as const,
    answered: false,
    outstanding: false,
    means: "somebody looked and does not know; the field stays UNKNOWN and the study must model around it",
  }),
  Object.freeze({
    resolution: "NOT_APPLICABLE" as const,
    answered: false,
    outstanding: false,
    means: "the question does not apply to this study, so the field is absent rather than missing",
  }),
  Object.freeze({
    resolution: "DECLINED" as const,
    answered: false,
    outstanding: false,
    means: "somebody chose not to say, which is a fact about the answer rather than about the asking",
  }),
])

const resolutionRules = new Map<string, QuestionResolutionRule>(
  QUESTION_RESOLUTIONS.map((entry) => [entry.resolution, entry]),
)

export function questionResolutionRule(resolution: QuestionResolution): QuestionResolutionRule {
  const rule = resolutionRules.get(resolution)
  if (rule === undefined) {
    throw new Error(`${JSON.stringify(resolution)} is not a question resolution.`)
  }
  return rule
}

/** Still worth asking. */
export function isQuestionOutstanding(question: OpenQuestion): boolean {
  return questionResolutionRule(question.resolution).outstanding
}

/** Settled, and settled without a value: the three states a null field is allowed to be in. */
export function isSettledWithoutAnAnswer(question: OpenQuestion): boolean {
  const rule = questionResolutionRule(question.resolution)
  return !rule.answered && !rule.outstanding
}

/** Where an answer came from. */
export const AnswerSourceSchema = z.enum(["USER", "DOCUMENT", "MEASUREMENT", "MODEL", "THIRD_PARTY"])
export type AnswerSource = z.infer<typeof AnswerSourceSchema>

export interface AnswerProvenance {
  source: AnswerSource
  actor: string | null
  reference: string | null
  recorded_at?: string
}

/**
 * Who said so, and on the strength of what.
 *
 * Present for every resolution except `UNANSWERED`, including the three that
 * supply no value: "I looked and do not know" is a statement somebody made, and
 * a study that cannot say who made it cannot tell a confirmed unknown from a
 * field a script set to null.
 */
export const AnswerProvenanceSchema: Contract<AnswerProvenance> = z
  .object({
    source: AnswerSourceSchema,
    /** Who supplied it, where a person or a system can be named. Null where the source is all that is known. */
    actor: z.string().min(1).nullable(),
    /** A document, a URL, a record hash -- whatever a reader would have to open to check the answer. */
    reference: z.string().min(1).nullable(),
    /** `RECEIPT_ONLY`: when the server recorded the answer, not part of what the answer says. */
    recorded_at: IsoDateTimeSchema.optional(),
  })
  .strict()

/**
 * The specification fields a question can be about, as immutable plain data.
 *
 * A free-text target is a target nothing resolves: an agent handed
 * `"the budget, roughly"` cannot write the answer anywhere. The two array
 * fields are indexable so a question can name one success criterion rather than
 * the list, and the pattern below is built from this table so the two cannot
 * drift.
 */
export interface SpecificationQuestionTarget {
  readonly path: string
  readonly indexable: boolean
}

export const SPECIFICATION_QUESTION_TARGETS: readonly SpecificationQuestionTarget[] = Object.freeze([
  Object.freeze({ path: "objective", indexable: false }),
  Object.freeze({ path: "success_criteria", indexable: true }),
  Object.freeze({ path: "accuracy_requirement", indexable: false }),
  Object.freeze({ path: "runtime_constraint", indexable: false }),
  Object.freeze({ path: "budget_constraint", indexable: false }),
  Object.freeze({ path: "problem_size", indexable: false }),
  Object.freeze({ path: "current_classical_method", indexable: false }),
  Object.freeze({ path: "why_quantum", indexable: false }),
  Object.freeze({ path: "limitations", indexable: true }),
])

const QUESTION_TARGET = new RegExp(
  `^(?:${SPECIFICATION_QUESTION_TARGETS.map((target) =>
    target.indexable ? `${target.path}(?:\\[[0-9]{1,3}\\])?` : target.path,
  ).join("|")})$`,
)

/**
 * Whether a question is about a given field path.
 *
 * A question naming the list covers every element of it: "what would count as
 * success?" is one question about `success_criteria`, not one per criterion.
 * A question naming an element covers that element alone.
 */
export function questionTargetsField(question: OpenQuestion, path: string): boolean {
  if (question.targets === path) return true
  const bracket = path.indexOf("[")
  return bracket > 0 && question.targets === path.slice(0, bracket)
}

const QUESTION_ID = /^[a-z][a-z0-9_]{0,63}$/

export interface OpenQuestion {
  question_id: string
  targets: string
  question: string
  answer_type: OpenQuestionAnswerType
  requirement: OpenQuestionRequirement
  why_needed: string
  blocks: StudyBlockedStage[]
  allowed_choices: string[] | null
  answer_provenance: AnswerProvenance | null
  resolution: QuestionResolution
}

export const OpenQuestionSchema: Contract<OpenQuestion> = z
  .object({
    /**
     * How an answer is filed against this question.
     *
     * `SEMANTIC`, not a label: it is the handle an answer is recorded under, so
     * two questions sharing an id are two questions one answer can be attached
     * to, and which one it settled is unrecoverable afterwards.
     */
    question_id: z.string().regex(QUESTION_ID),
    /** The field an answer would fill, from the table above. */
    targets: z.string().regex(QUESTION_TARGET),
    /** The asking, in the words it was put. */
    question: z.string().min(1),
    answer_type: OpenQuestionAnswerTypeSchema,
    requirement: OpenQuestionRequirementSchema,
    /** Why the study needs it. Not the same as what it blocks: one is a reason, the other is a consequence. */
    why_needed: z.string().min(1),
    /** What an unanswered question holds up. At least one: a question that blocks nothing is not a question. */
    blocks: z.array(StudyBlockedStageSchema).min(1),
    /** The list to choose from, for a `CHOICE` question and for nothing else. */
    allowed_choices: z.array(z.string().min(1)).min(1).nullable(),
    answer_provenance: AnswerProvenanceSchema.nullable(),
    resolution: QuestionResolutionSchema,
  })
  .strict()
  .superRefine((question, context) => {
    const isChoice = question.answer_type === "CHOICE"
    if (isChoice && question.allowed_choices === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A CHOICE question with no list to choose from is a free-text question wearing a type.",
        path: ["allowed_choices"],
      })
    }
    if (!isChoice && question.allowed_choices !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Choices are offered beside a ${question.answer_type} answer, which nothing constrains them to. ` +
          "A reader would take the list for the permitted answers, and the schema would not.",
        path: ["allowed_choices"],
      })
    }
    if (question.allowed_choices !== null) {
      if (new Set(question.allowed_choices).size !== question.allowed_choices.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A choice is offered twice; one answer would then have two spellings.",
          path: ["allowed_choices"],
        })
      }
    }
    const outstanding = questionResolutionRule(question.resolution).outstanding
    if (outstanding && question.answer_provenance !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An unanswered question has nobody to attribute an answer to.",
        path: ["answer_provenance"],
      })
    }
    if (!outstanding && question.answer_provenance === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A question resolved ${question.resolution} carries a statement somebody made -- including "I looked and ` +
          'do not know" -- and a statement with no source is indistinguishable from a field a script set.',
        path: ["answer_provenance"],
      })
    }
  }) as unknown as Contract<OpenQuestion>

/** Refuse a queue that names one question id twice, for the reason the id exists. */
export function duplicateQuestionIds(questions: readonly OpenQuestion[]): readonly string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const question of questions) {
    if (seen.has(question.question_id)) duplicates.add(question.question_id)
    seen.add(question.question_id)
  }
  return [...duplicates].sort()
}
