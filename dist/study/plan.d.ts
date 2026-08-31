import { z } from "zod";
import type { Contract, Quantity } from "../intelligence/measurement.js";
import { type RevisionRef } from "./common.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * What the study intends to do, and the exact thing a user confirms
 * (ketqat-sdk#259, ADR 0010, RFC 0008 §3).
 *
 * A plan is the last point at which anything is cheap. After it, runs start,
 * credits are spent, and a number goes in front of somebody. The confirmation
 * therefore has to bind to *this* plan and not to "the plan", which is what
 * `content_hash` is for: the user confirms a digest, and any edit to the plan --
 * a different baseline, a looser success criterion, a higher credit ceiling --
 * produces a different digest and so requires a new confirmation. That property
 * is structural rather than procedural. There is no code path that could forget
 * to invalidate the old approval, because nothing invalidates it; it simply
 * stops matching.
 *
 * Two smaller decisions carry weight.
 *
 * **Success and refusal criteria are both required.** A plan that says only what
 * would count as success has pre-committed to succeeding: every outcome can be
 * read as partial progress after the fact. Stating in advance what would make
 * the study stop is what makes the eventual conclusion falsifiable (RFC §3).
 *
 * **`max_credits` is a plain number, not a `Quantity`.** Every estimate in this
 * family wears the measurement envelope because an estimate has a provenance and
 * an uncertainty. A spending ceiling has neither: it is a decision the user made,
 * exact by construction, in the same way `error_budget` is on a scenario.
 */
export declare const PlannedBaselineSchema: z.ZodObject<{
    /** Hash of an existing `ClassicalBaseline` record. Referenced, never inlined and never re-stated. */
    baseline_ref: z.ZodString;
    /**
     * Where this study's use of that baseline stands.
     *
     * The classification lives on the plan rather than inside the baseline because
     * it is a statement about the comparison, not about the record: the same
     * measured baseline is strong evidence for the workload it was measured on and
     * a cited figure for a different one.
     */
    source_class: z.ZodEnum<["measured", "user_provided", "approved_adapter", "cited_primary_source", "unknown"]>;
    note: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    baseline_ref: string;
    source_class: "approved_adapter" | "cited_primary_source" | "measured" | "unknown" | "user_provided";
    note: string | null;
}, {
    baseline_ref: string;
    source_class: "approved_adapter" | "cited_primary_source" | "measured" | "unknown" | "user_provided";
    note: string | null;
}>;
export type PlannedBaseline = z.infer<typeof PlannedBaselineSchema>;
export declare const CandidateWorkflowSchema: z.ZodObject<{
    name: z.ZodString;
    /** Hash of a record carrying the `QuantumWorkload`, where one exists yet. */
    workload_ref: z.ZodNullable<z.ZodString>;
    /** Why this candidate is worth spending the run on. An unargued candidate is a preference. */
    rationale: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
    workload_ref: string | null;
    rationale: string;
}, {
    name: string;
    workload_ref: string | null;
    rationale: string;
}>;
export type CandidateWorkflow = z.infer<typeof CandidateWorkflowSchema>;
/**
 * The versions this plan is pinned to.
 *
 * Pinned in the plan rather than recorded after the run, because "which model
 * produced this" is only answerable in hindsight if it was decided in advance.
 * The adapter is nullable -- some studies have no vendor adapter -- while the
 * model and the engine are not: something computed the numbers, and it has a
 * version.
 */
export declare const PinnedVersionsSchema: z.ZodObject<{
    adapter: z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: string;
        version: string;
    }, {
        name: string;
        version: string;
    }>>;
    model: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: string;
        version: string;
    }, {
        name: string;
        version: string;
    }>;
    engine: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: string;
        version: string;
    }, {
        name: string;
        version: string;
    }>;
}, "strict", z.ZodTypeAny, {
    adapter: {
        name: string;
        version: string;
    } | null;
    model: {
        name: string;
        version: string;
    };
    engine: {
        name: string;
        version: string;
    };
}, {
    adapter: {
        name: string;
        version: string;
    } | null;
    model: {
        name: string;
        version: string;
    };
    engine: {
        name: string;
        version: string;
    };
}>;
export type PinnedVersions = z.infer<typeof PinnedVersionsSchema>;
/**
 * How exactly a rerun is expected to match.
 *
 * `STATISTICAL` is not a weaker `EXACT`: a sampled simulation reproduces to
 * within its own sampling error and claiming bit-identity for it would be false.
 * `BEST_EFFORT` says the study cannot promise either, which is the honest label
 * for a run against shared hardware.
 */
export declare const ReproducibilityLevelSchema: z.ZodEnum<["EXACT", "STATISTICAL", "BEST_EFFORT"]>;
export type ReproducibilityLevel = z.infer<typeof ReproducibilityLevelSchema>;
export interface StudyPlan {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    specification_ref: RevisionRef;
    revision: number;
    supersedes: string | null;
    baselines: PlannedBaseline[];
    candidates: CandidateWorkflow[];
    scenario_refs: string[];
    pinned_versions: PinnedVersions;
    expected_runtime: Quantity;
    expected_credits: Quantity;
    max_credits: number;
    data_handling: string;
    reproducibility_level: ReproducibilityLevel;
    success_criteria: string[];
    refusal_criteria: string[];
    execution_limitations: string[];
    created_at?: string;
    content_hash: string;
}
export declare const StudyPlanSchema: Contract<StudyPlan>;
/**
 * The hash a user is asked to confirm.
 *
 * Trivial by design, and named anyway. The alternative -- every caller reaching
 * for whichever field looked like an identifier -- is how a confirmation ends up
 * bound to a database id that survives an edit the hash would not have.
 */
export declare function planConfirmationTarget(plan: StudyPlan): string;
/**
 * Whether a confirmation still authorises this plan.
 *
 * The plan's own contents are re-canonicalized rather than trusted, which is
 * what separates the two ways a confirmation goes stale.
 *
 * A plan whose stored hash no longer matches its contents was edited after it
 * was written: whatever was approved, it was not this, and the answer is
 * `CONFIRMATION_HASH_MISMATCH` even when the confirmed string equals the hash
 * the record carries. That case is the whole reason this function recomputes.
 *
 * A plan that is internally consistent but was revised has a confirmation that
 * names the revision it replaced -- a real approval, for a plan that no longer
 * exists -- and the answer is `PLAN_REVISION_SUPERSEDED`. Passing
 * `latestRevision` catches the same staleness at any depth; without it, only the
 * immediately superseded revision is recognisable from the record alone.
 */
export declare function verifyPlanConfirmation(plan: StudyPlan, confirmedHash: string, latestRevision?: RevisionRef | null): {
    ok: true;
} | {
    ok: false;
    refusal: StudyRefusal;
};
/**
 * Produce the next revision of a plan, superseding the current one.
 *
 * The new revision's hash is different by construction, which is what withdraws
 * the old confirmation: nothing has to remember to revoke it.
 *
 * `currentHash` comes from the caller for the same reason it does in
 * `reviseSpecification` -- the field on the record is a claim, the argument is
 * what the caller checked.
 */
export declare function revisePlan(current: StudyPlan, changes: Partial<Omit<StudyPlan, "revision" | "supersedes" | "schema_version" | "hash_rules_id" | "content_hash">>, currentHash: string): StudyPlan;
//# sourceMappingURL=plan.d.ts.map