import type { Contract } from "../intelligence/measurement.js";
import { type QuantityField, type TextField } from "./common.js";
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
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    revision: number;
    supersedes: string | null;
    objective: TextField;
    success_criteria: TextField[];
    accuracy_requirement: QuantityField;
    runtime_constraint: QuantityField;
    budget_constraint: QuantityField;
    problem_size: QuantityField;
    current_classical_method: TextField;
    why_quantum: TextField;
    open_questions: string[];
    limitations: string[];
    created_at?: string;
    content_hash: string;
}
export declare const ProblemSpecificationSchema: Contract<ProblemSpecification>;
/**
 * Everything still worth asking about this specification.
 *
 * The stored `open_questions` come first, because they were written by whoever
 * knows the study; the generated ones follow, one per field that is either
 * unanswered or merely inferred. Nothing here invents an answer -- the function
 * only names gaps, which is the input the elicitation flow needs and the exact
 * thing a confident-looking draft hides.
 */
export declare function openQuestionsOf(specification: ProblemSpecification): string[];
/**
 * Produce the next revision of a specification, superseding the current one.
 *
 * `currentHash` is supplied by the caller rather than read from
 * `current.content_hash`, following `reviseScenario`. The record's own hash
 * field is a claim about the record; the argument is the hash the caller
 * actually verified. Where those two disagree, the disagreement is the thing
 * worth catching, and reading the field would hide it.
 */
export declare function reviseSpecification(current: ProblemSpecification, changes: Partial<Omit<ProblemSpecification, "revision" | "supersedes" | "schema_version" | "hash_rules_id" | "content_hash">>, currentHash: string): ProblemSpecification;
//# sourceMappingURL=specification.d.ts.map