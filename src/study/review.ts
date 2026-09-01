import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { ContentHashSchema } from "./common.js"
import { StudyIdSchema } from "./identity.js"
import { STUDY_HASH_RULES_ID } from "./rules.js"

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
export const ReviewVerdictSchema = z.enum(["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"])
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>

export interface ReviewRecord {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  subject_node_hash: string
  verdict: ReviewVerdict
  rationale: string
  reviewer: string
  created_at?: string
  content_hash: string
}

export const ReviewRecordSchema: Contract<ReviewRecord> = z
  .object({
    schema_version: z.string().min(1),
    /** Required, never inferred: a record that does not name its rules is refused. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /**
     * The node that was reviewed, by content hash.
     *
     * A node's identity is its content, so this binds the review to the exact
     * text that was read. A node edited after the review takes a different hash
     * and this record stops resolving -- which is the correct outcome, and the
     * reason the subject is not named by label.
     */
    subject_node_hash: ContentHashSchema,
    verdict: ReviewVerdictSchema,
    /**
     * Why, in words a reader can weigh. Required: a verdict with no reasoning is
     * an opinion recorded with the authority of a process.
     */
    rationale: z.string().min(1),
    /**
     * Who reviewed. A free string, deliberately: nothing here is signed, and a
     * field shaped like an authenticated identity would suggest otherwise
     * (ADR 0014 §3).
     */
    reviewer: z.string().min(1),
    /** `RECEIPT_ONLY`: when the server observed this record, not part of what it says. */
    created_at: z.string().datetime({ offset: true }).optional(),
    content_hash: ContentHashSchema,
  })
  .strict()

/**
 * Whether a re-run reproduced what it set out to reproduce.
 *
 * `INCONCLUSIVE` is a first-class outcome for the reason `UNKNOWN` is one in
 * `Quantity`: a reproduction that could not be completed is not a reproduction
 * that failed, and recording it as either is a claim the run does not support.
 */
export const ReproductionOutcomeSchema = z.enum(["MATCHED", "DIVERGED", "INCONCLUSIVE"])
export type ReproductionOutcome = z.infer<typeof ReproductionOutcomeSchema>

export interface ReproductionRecord {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  original_node_hash: string
  reproduction_capsule_ref: string
  observed_node_hash: string | null
  outcome: ReproductionOutcome
  notes: string
  asserted_by: string
  created_at?: string
  content_hash: string
}

export const ReproductionRecordSchema: Contract<ReproductionRecord> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: StudyIdSchema,
    /** The node whose result was re-run, by content hash. */
    original_node_hash: ContentHashSchema,
    /**
     * The capsule the reproduction ran under.
     *
     * Required, and the field that separates this record from an assertion that
     * something was reproduced: the capsule carries the seed, the versions and
     * the environment, so a reader can check what was actually re-run rather
     * than take the outcome on trust.
     */
    reproduction_capsule_ref: ContentHashSchema,
    /**
     * The node the reproduction produced, where one was recorded.
     *
     * Null for `INCONCLUSIVE`, and required otherwise by the refinement below: a
     * `MATCHED` or `DIVERGED` verdict is a comparison, and a comparison with
     * only one side of it recorded cannot be checked by the reader it is shown
     * to.
     */
    observed_node_hash: ContentHashSchema.nullable(),
    outcome: ReproductionOutcomeSchema,
    /** What was compared, and to what tolerance. Free text; may be empty for a clean match. */
    notes: z.string(),
    /** Who ran it. A free string, for `ReviewRecord.reviewer`'s reason. */
    asserted_by: z.string().min(1),
    created_at: z.string().datetime({ offset: true }).optional(),
    content_hash: ContentHashSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (record.outcome !== "INCONCLUSIVE" && record.observed_node_hash === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A ${record.outcome} outcome is a comparison between two results, so the reproduction's own result must ` +
          "be named. Without it the record asserts a verdict whose evidence is not in the graph, and a reader has " +
          "nothing to open. A run that produced no comparable result is INCONCLUSIVE.",
        path: ["observed_node_hash"],
      })
    }
    if (record.observed_node_hash === record.original_node_hash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The reproduction names the original as its own result. Identity in this graph is the content hash, so " +
          "this says the second run produced the first run's record rather than a record that agrees with it.",
        path: ["observed_node_hash"],
      })
    }
  })

/** Every review recorded against one node, in the order they were given. */
export function reviewsOf(
  reviews: readonly ReviewRecord[],
  nodeHash: string,
): ReviewRecord[] {
  return reviews.filter((review) => review.subject_node_hash === nodeHash)
}

/** Every reproduction recorded against one node, in the order they were given. */
export function reproductionsOf(
  reproductions: readonly ReproductionRecord[],
  nodeHash: string,
): ReproductionRecord[] {
  return reproductions.filter((record) => record.original_node_hash === nodeHash)
}
