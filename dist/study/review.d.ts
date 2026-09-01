import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
/**
 * What people and processes assert about the evidence graph, kept out of it.
 *
 * An evidence edge answers one question: how does the content of this record
 * follow from the content of that one. Derivation, consumption, support,
 * contradiction and replacement are all answers to it, and all five are
 * statements about records. Two relations that were once written as edges are
 * not:
 *
 * **A review is about a person's judgement.** Its other end is a reviewer, and
 * a reviewer is not a node -- there is no node kind an edge could legally point
 * at, so `reviewed_by` had no honest row in the matrix at all. Worse, the
 * judgement itself is unrepresentable on an edge: a review that rejected a node
 * and a review that accepted it carry the same `from`, the same `to` and the
 * same kind, so a graph rendering "2 reviews" cannot say whether either agreed.
 *
 * **A reproduction is about a process outcome.** Its two ends *are* records, so
 * it could be an edge -- and it would be an edge that cannot say whether the
 * reproduction matched. `A reproduces B` reads identically whether the second
 * run agreed with the first or contradicted it, which turns the strongest
 * evidence this family can carry into a claim that it happened.
 *
 * So both become records with the fields their meaning requires, and the edge
 * matrix keeps only relations whose meaning an edge can hold. Each is
 * content-addressed like the nodes it talks about: the subject is named by hash,
 * so a review of one version of a node does not travel to the next one.
 *
 * Neither record establishes that a person signed anything. `asserted_by` and
 * `reviewer` are free strings written by whoever produced the record, exactly
 * as `asserted_by` is on an edge, and `attestation_level` across this family
 * stays `hash_only` (ADR 0014). A review record is evidence that a review was
 * recorded, which is a weaker thing than a review and is the thing that is true.
 */
/**
 * What a review concluded.
 *
 * Three outcomes rather than a boolean, because "changes requested" is the
 * common one and collapsing it into either of the others misreports the review:
 * folded into `REJECTED` it overstates the objection, folded into `ACCEPTED` it
 * disappears.
 */
export declare const ReviewVerdictSchema: z.ZodEnum<["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"]>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export interface ReviewRecord {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    subject_node_hash: string;
    verdict: ReviewVerdict;
    rationale: string;
    reviewer: string;
    created_at?: string;
    content_hash: string;
}
export declare const ReviewRecordSchema: Contract<ReviewRecord>;
/**
 * Whether a re-run reproduced what it set out to reproduce.
 *
 * `INCONCLUSIVE` is a first-class outcome for the reason `UNKNOWN` is one in
 * `Quantity`: a reproduction that could not be completed is not a reproduction
 * that failed, and recording it as either is a claim the run does not support.
 */
export declare const ReproductionOutcomeSchema: z.ZodEnum<["MATCHED", "DIVERGED", "INCONCLUSIVE"]>;
export type ReproductionOutcome = z.infer<typeof ReproductionOutcomeSchema>;
export interface ReproductionRecord {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    original_node_hash: string;
    reproduction_capsule_ref: string;
    observed_node_hash: string | null;
    outcome: ReproductionOutcome;
    notes: string;
    asserted_by: string;
    created_at?: string;
    content_hash: string;
}
export declare const ReproductionRecordSchema: Contract<ReproductionRecord>;
/** Every review recorded against one node, in the order they were given. */
export declare function reviewsOf(reviews: readonly ReviewRecord[], nodeHash: string): ReviewRecord[];
/** Every reproduction recorded against one node, in the order they were given. */
export declare function reproductionsOf(reproductions: readonly ReproductionRecord[], nodeHash: string): ReproductionRecord[];
//# sourceMappingURL=review.d.ts.map