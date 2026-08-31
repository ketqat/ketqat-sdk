import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import {
  ContentHashSchema,
  QuantityFieldSchema,
  STUDY_SCHEMA_VERSION,
  TextFieldSchema,
  type QuantityField,
  type TextField,
} from "./common.js"
import { STUDY_HASH_RULES_ID, calculateStudyHash } from "./hashing.js"

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
 * `open_questions` is the elicitation queue (RFC §6) and is allowed to be empty
 * only when there is genuinely nothing left to ask -- which is to say, only when
 * every field has been confirmed. An empty list on a specification full of
 * guesses would present those guesses as settled.
 */

export interface ProblemSpecification {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  revision: number
  supersedes: string | null
  objective: TextField
  success_criteria: TextField[]
  accuracy_requirement: QuantityField
  runtime_constraint: QuantityField
  budget_constraint: QuantityField
  problem_size: QuantityField
  current_classical_method: TextField
  why_quantum: TextField
  open_questions: string[]
  limitations: string[]
  created_at?: string
  content_hash: string
}

/**
 * The fields whose provenance the invariants below are about.
 *
 * Declared as a structural type rather than as `ProblemSpecification` so the
 * same walk can run inside the schema's own refinement, where the value is not
 * yet a parsed specification.
 */
interface SpecificationFields {
  objective: TextField
  success_criteria: TextField[]
  accuracy_requirement: QuantityField
  runtime_constraint: QuantityField
  budget_constraint: QuantityField
  problem_size: QuantityField
  current_classical_method: TextField
  why_quantum: TextField
}

interface FieldState {
  label: string
  known: boolean
  confirmed: boolean
}

function fieldStates(specification: SpecificationFields): FieldState[] {
  const text = (label: string, field: TextField): FieldState => ({
    label,
    known: field.value !== null,
    confirmed: field.origin === "CONFIRMED",
  })
  const measured = (label: string, field: QuantityField): FieldState => ({
    label,
    known: field.quantity.value !== null,
    confirmed: field.origin === "CONFIRMED",
  })
  return [
    text("objective", specification.objective),
    ...specification.success_criteria.map((criterion, index) => text(`success criterion ${index + 1}`, criterion)),
    measured("accuracy requirement", specification.accuracy_requirement),
    measured("runtime constraint", specification.runtime_constraint),
    measured("budget constraint", specification.budget_constraint),
    measured("problem size", specification.problem_size),
    text("current classical method", specification.current_classical_method),
    text("why quantum", specification.why_quantum),
  ]
}

export const ProblemSpecificationSchema: Contract<ProblemSpecification> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: ContentHashSchema,
    /** Starts at 1. A change produces revision n+1; it never rewrites revision n. */
    revision: z.number().int().positive(),
    /** Hash of the revision this one replaces, or null for the first. */
    supersedes: ContentHashSchema.nullable(),
    /** What the study is for, in the asker's terms. */
    objective: TextFieldSchema,
    /** What would count as an answer. Never empty: a study with no success criteria cannot conclude. */
    success_criteria: z.array(TextFieldSchema).min(1),
    /** How close the answer has to be to be useful. */
    accuracy_requirement: QuantityFieldSchema,
    /** How long an answer may take before it stops being worth having. */
    runtime_constraint: QuantityFieldSchema,
    /** What may be spent. */
    budget_constraint: QuantityFieldSchema,
    /** The size of the instance the answer has to hold for. */
    problem_size: QuantityFieldSchema,
    /** What is being done today, which is what any advantage claim is measured against. */
    current_classical_method: TextFieldSchema,
    /** Why a quantum method is a candidate here at all. */
    why_quantum: TextFieldSchema,
    /** What still has to be asked before this specification is settled. */
    open_questions: z.array(z.string().min(1)),
    /** What this specification does not cover. */
    limitations: z.array(z.string().min(1)),
    /** Excluded from the hash by name, like every other timestamp in this family. */
    created_at: IsoDateTimeSchema.optional(),
    content_hash: ContentHashSchema,
  })
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
    if (specification.open_questions.length === 0) {
      const unconfirmed = fieldStates(specification)
        .filter((field) => !field.confirmed)
        .map((field) => field.label)
      if (unconfirmed.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A specification with fields nobody has confirmed (${unconfirmed.join(", ")}) has open questions by ` +
            "definition. An empty list here presents the system's own guesses as settled.",
          path: ["open_questions"],
        })
      }
    }
  })

/**
 * Everything still worth asking about this specification.
 *
 * The stored `open_questions` come first, because they were written by whoever
 * knows the study; the generated ones follow, one per field that is either
 * unanswered or merely inferred. Nothing here invents an answer -- the function
 * only names gaps, which is the input the elicitation flow needs and the exact
 * thing a confident-looking draft hides.
 */
export function openQuestionsOf(specification: ProblemSpecification): string[] {
  const questions = [...specification.open_questions]
  const add = (question: string): void => {
    if (!questions.includes(question)) questions.push(question)
  }
  for (const field of fieldStates(specification)) {
    if (!field.known) {
      add(`${field.label}: no answer has been recorded yet.`)
    } else if (!field.confirmed) {
      add(`${field.label}: proposed by the system and not yet confirmed by anyone.`)
    }
  }
  return questions
}

/**
 * Produce the next revision of a specification, superseding the current one.
 *
 * `currentHash` is supplied by the caller rather than read from
 * `current.content_hash`, following `reviseScenario`. The record's own hash
 * field is a claim about the record; the argument is the hash the caller
 * actually verified. Where those two disagree, the disagreement is the thing
 * worth catching, and reading the field would hide it.
 */
export function reviseSpecification(
  current: ProblemSpecification,
  changes: Partial<
    Omit<ProblemSpecification, "revision" | "supersedes" | "schema_version" | "hash_rules_id" | "content_hash">
  >,
  currentHash: string,
): ProblemSpecification {
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
  return ProblemSpecificationSchema.parse({
    ...withoutHash,
    content_hash: calculateStudyHash(withoutHash),
  })
}
