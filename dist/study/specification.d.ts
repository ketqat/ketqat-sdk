import type { Contract } from "../intelligence/measurement.js";
import { type QuantityField, type RevisionRef, type TextField } from "./common.js";
import { type StudyCriterion } from "./criteria.js";
import { type OpenQuestion } from "./questions.js";
import type { StudyRefusal } from "./refusals.js";
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
    statement: TextField;
    predicate: StudyCriterion | null;
}
export declare const SpecificationSuccessCriterionSchema: Contract<SpecificationSuccessCriterion>;
export interface ProblemSpecification {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    revision: number;
    supersedes: string | null;
    objective: TextField;
    success_criteria: SpecificationSuccessCriterion[];
    accuracy_requirement: QuantityField;
    runtime_constraint: QuantityField;
    budget_constraint: QuantityField;
    problem_size: QuantityField;
    current_classical_method: TextField;
    why_quantum: TextField;
    open_questions: OpenQuestion[];
    limitations: string[];
    created_at?: string;
    content_hash: string;
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
export declare const SPECIFICATION_FIELD_STATES: readonly ["ANSWERED", "INFERRED", "UNANSWERED", "CONFIRMED_UNKNOWN"];
export type SpecificationFieldState = (typeof SPECIFICATION_FIELD_STATES)[number];
export interface SpecificationFieldStatus {
    /** The path a question targets, which is how a status and a question are matched. */
    readonly path: string;
    /** The same field in the words a person would use. */
    readonly label: string;
    readonly state: SpecificationFieldState;
}
/**
 * The fields whose settlement the invariants below are about.
 *
 * Declared as a structural type rather than as `ProblemSpecification` so the
 * same walk can run inside the schema's own refinement, where the value is not
 * yet a parsed specification.
 */
interface SpecificationFields {
    objective: TextField;
    success_criteria: SpecificationSuccessCriterion[];
    accuracy_requirement: QuantityField;
    runtime_constraint: QuantityField;
    budget_constraint: QuantityField;
    problem_size: QuantityField;
    current_classical_method: TextField;
    why_quantum: TextField;
}
/** Every answerable field of a specification, with the state it is in. */
export declare function specificationFieldStates(specification: SpecificationFields): readonly SpecificationFieldStatus[];
export declare const ProblemSpecificationSchema: Contract<ProblemSpecification>;
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
export declare function openQuestionsOf(specification: ProblemSpecification): readonly OpenQuestion[];
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
export declare function reviseSpecification(current: ProblemSpecification, changes: Partial<Omit<ProblemSpecification, "revision" | "supersedes" | "schema_version" | "hash_rules_id" | "content_hash">>, currentHash: string, latestRevision?: RevisionRef | null): {
    ok: true;
    specification: ProblemSpecification;
} | {
    ok: false;
    refusal: StudyRefusal;
};
export {};
//# sourceMappingURL=specification.d.ts.map