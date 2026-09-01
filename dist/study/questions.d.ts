import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
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
export declare const OpenQuestionAnswerTypeSchema: z.ZodEnum<["TEXT", "QUANTITY", "CHOICE", "BOOLEAN"]>;
export type OpenQuestionAnswerType = z.infer<typeof OpenQuestionAnswerTypeSchema>;
/**
 * Whether the study can proceed without an answer.
 *
 * `OPTIONAL` is a real state and not politeness: a question that would sharpen
 * an estimate but does not block anything should not stop a study, and marking
 * everything `REQUIRED` is how a queue becomes a wall somebody routes around.
 */
export declare const OpenQuestionRequirementSchema: z.ZodEnum<["REQUIRED", "OPTIONAL"]>;
export type OpenQuestionRequirement = z.infer<typeof OpenQuestionRequirementSchema>;
/**
 * What an unanswered question holds up.
 *
 * Named stages rather than prose, because this is the field an orchestrator
 * branches on: a question blocking `REPORT_EXPORT` does not stop a run, and a
 * question blocking `TASK_EXECUTION` must stop one before credits are spent.
 */
export declare const StudyBlockedStageSchema: z.ZodEnum<["SPECIFICATION_SIGN_OFF", "PLAN_CONSTRUCTION", "PLAN_CONFIRMATION", "TASK_EXECUTION", "REPORT_EXPORT"]>;
export type StudyBlockedStage = z.infer<typeof StudyBlockedStageSchema>;
/** What happened to the asking. */
export declare const QuestionResolutionSchema: z.ZodEnum<["UNANSWERED", "ANSWERED", "CONFIRMED_UNKNOWN", "NOT_APPLICABLE", "DECLINED"]>;
export type QuestionResolution = z.infer<typeof QuestionResolutionSchema>;
export interface QuestionResolutionRule {
    readonly resolution: QuestionResolution;
    /** Whether a value was supplied. Only `ANSWERED` supplies one. */
    readonly answered: boolean;
    /** Whether the question is still worth asking. */
    readonly outstanding: boolean;
    readonly means: string;
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
export declare const QUESTION_RESOLUTIONS: readonly QuestionResolutionRule[];
export declare function questionResolutionRule(resolution: QuestionResolution): QuestionResolutionRule;
/** Still worth asking. */
export declare function isQuestionOutstanding(question: OpenQuestion): boolean;
/** Settled, and settled without a value: the three states a null field is allowed to be in. */
export declare function isSettledWithoutAnAnswer(question: OpenQuestion): boolean;
/** Where an answer came from. */
export declare const AnswerSourceSchema: z.ZodEnum<["USER", "DOCUMENT", "MEASUREMENT", "MODEL", "THIRD_PARTY"]>;
export type AnswerSource = z.infer<typeof AnswerSourceSchema>;
export interface AnswerProvenance {
    source: AnswerSource;
    actor: string | null;
    reference: string | null;
    recorded_at?: string;
}
/**
 * Who said so, and on the strength of what.
 *
 * Present for every resolution except `UNANSWERED`, including the three that
 * supply no value: "I looked and do not know" is a statement somebody made, and
 * a study that cannot say who made it cannot tell a confirmed unknown from a
 * field a script set to null.
 */
export declare const AnswerProvenanceSchema: Contract<AnswerProvenance>;
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
    readonly path: string;
    readonly indexable: boolean;
}
export declare const SPECIFICATION_QUESTION_TARGETS: readonly SpecificationQuestionTarget[];
/**
 * Whether a question is about a given field path.
 *
 * A question naming the list covers every element of it: "what would count as
 * success?" is one question about `success_criteria`, not one per criterion.
 * A question naming an element covers that element alone.
 */
export declare function questionTargetsField(question: OpenQuestion, path: string): boolean;
export interface OpenQuestion {
    question_id: string;
    targets: string;
    question: string;
    answer_type: OpenQuestionAnswerType;
    requirement: OpenQuestionRequirement;
    why_needed: string;
    blocks: StudyBlockedStage[];
    allowed_choices: string[] | null;
    answer_provenance: AnswerProvenance | null;
    resolution: QuestionResolution;
}
export declare const OpenQuestionSchema: Contract<OpenQuestion>;
/** Refuse a queue that names one question id twice, for the reason the id exists. */
export declare function duplicateQuestionIds(questions: readonly OpenQuestion[]): readonly string[];
//# sourceMappingURL=questions.d.ts.map