import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type RevisionRef } from "./common.js";
import { type StudyPlan } from "./plan.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * One unit of work a confirmed plan authorises (ketqat-sdk#259, ADR 0010).
 *
 * A task is thin on purpose. Everything about *running* it -- queueing,
 * retries, the job's own status vocabulary -- belongs to the execution system,
 * and persisting a task as an `ExecutionJob` with an extended kind is Phase 2
 * work. What has to exist now is the binding: a task names the exact plan
 * revision that authorised it, by hash, so "why was this run" has an answer that
 * does not depend on anyone's memory of a conversation.
 *
 * `buildStudyTask` refuses rather than constructing an unbound task. That is the
 * one thing this module exists to make impossible: a task with no confirmation,
 * or with a confirmation for a plan that has since changed, would spend credits
 * against an approval nobody gave for the work that actually ran.
 */
export declare const StudyTaskKindSchema: z.ZodEnum<["STUDY_BASELINE_RUN", "STUDY_RESOURCE_ESTIMATE", "STUDY_BENCHMARK_RUN", "STUDY_REPRODUCTION"]>;
export type StudyTaskKind = z.infer<typeof StudyTaskKindSchema>;
export interface StudyTask {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    kind: StudyTaskKind;
    plan_ref: RevisionRef;
    capsule_ref: string | null;
    status: string;
    created_at?: string;
    content_hash: string;
}
export declare const StudyTaskSchema: Contract<StudyTask>;
export interface StudyTaskInput {
    plan: StudyPlan;
    /** The hash the user actually confirmed, or null when nobody has. */
    confirmedPlanHash: string | null;
    kind: StudyTaskKind;
    /** The newest plan revision, when the caller knows it. Catches a stale confirmation at any depth. */
    latestPlanRevision?: RevisionRef | null;
    /** Initial job status. Denormalized and excluded from the hash. */
    status?: string;
    /** Recorded on the task but excluded from its hash. Omit for a byte-stable record. */
    createdAt?: string;
}
/**
 * Build a task, or say why there is nothing to build.
 *
 * The confirmation is checked before the record exists, so an unauthorised task
 * is never a value anyone can hold. A missing confirmation and a stale one are
 * different refusals because they need different fixes: one asks somebody to
 * approve the plan, the other tells them the plan they approved is not the plan
 * in front of them.
 */
export declare function buildStudyTask(input: StudyTaskInput): {
    ok: true;
    task: StudyTask;
} | {
    ok: false;
    refusal: StudyRefusal;
};
//# sourceMappingURL=task.d.ts.map