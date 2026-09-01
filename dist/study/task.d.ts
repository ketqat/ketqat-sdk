import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type ArtifactRef } from "./artifact.js";
import { type Cancellation, type ExecutionCapsule } from "./capsule.js";
import { type ExecutionResourceClass, type RevisionRef } from "./common.js";
import type { StudyPlan } from "./plan.js";
import { type ConfirmationReceipt } from "./receipt.js";
import { type StudyRefusal } from "./refusals.js";
import type { Study } from "./study.js";
/**
 * One unit of work, split into the four records it always was (goal §8).
 *
 * `StudyTask` mixed three lifetimes in one row and the mixture is what made it
 * wrong. It carried an authorization (the plan revision, the confirmation) that
 * must never change; a `status` the execution system overwrote as the job
 * moved; and a `capsule_ref` bolted on afterwards, null until a run existed.
 * Content-address that and the record's identity changes the moment it runs --
 * which is precisely when everything else starts pointing at it. The workaround
 * was to make the task's `content_hash` its *semantic* digest so that `status`
 * fell out of it, and that bought stability at the cost of a digest that could
 * not answer whether the row had been edited.
 *
 * There is no arrangement of one record that works, because the three parts
 * answer three questions with three different lifetimes:
 *
 * | record | question | lifetime |
 * | --- | --- | --- |
 * | `StudyTaskAuthorization` | what was authorised, by whom, against which plan | written once, never edited |
 * | `ExecutionJob` | where the work is right now | mutable, and deliberately **not** content-addressed |
 * | `TaskOutcome` | how it ended | written once when it ends |
 * | `ExecutionCapsule` | what ran and what it produced | written once per run (`capsule.ts`) |
 *
 * The property this buys is the one the goal asks for and the old shape could
 * not give: **a task's identity is unchanged by execution.** An authorization
 * has no status field and no capsule pointer, so queueing it, running it,
 * retrying it and finishing it move nothing. Everything that moves lives on the
 * job, which nothing content-addresses; everything that is decided at the end
 * lives on the outcome, which is a new record rather than an edit to an old one.
 */
/**
 * What the work actually is.
 *
 * The vocabulary is this family's, so it is closed. Each member is paired below
 * with the scope a confirmation must carry for it, because "authorised" without
 * "authorised to do what" is how a confirmation for a resource estimate ends up
 * paying for a hardware run.
 */
export declare const StudyTaskOperationSchema: z.ZodEnum<["STUDY_BASELINE_RUN", "STUDY_RESOURCE_ESTIMATE", "STUDY_BENCHMARK_RUN", "STUDY_REPRODUCTION"]>;
export type StudyTaskOperation = z.infer<typeof StudyTaskOperationSchema>;
/**
 * Which scope each operation needs, as immutable plain data.
 *
 * A table rather than a check inside the builder, so that the mapping a
 * reviewer reads is the mapping the code applies and a test can iterate it. The
 * two estimate-shaped operations share `study:estimate` because they cost the
 * same kind of resource; a benchmark run and a reproduction both execute code
 * and take `study:execute`.
 */
export interface StudyOperationScope {
    readonly operation: StudyTaskOperation;
    readonly scope: string;
}
export declare const STUDY_OPERATION_SCOPES: readonly StudyOperationScope[];
/** The scope an operation requires, or null where this build declares none. */
export declare function scopeForOperation(operation: string): string | null;
/**
 * The ceiling this authorization runs under.
 *
 * Copied from the confirmation receipt rather than supplied by a caller, so an
 * authorization cannot widen the approval it was built from. `max_credits` and
 * `resource_class` are not nullable: an authorization with no credit ceiling
 * authorises unbounded spending, and one with no resource class authorises a
 * hardware submission on the strength of an approval for a simulation.
 */
export interface ResourceCeiling {
    max_credits: number;
    max_runtime: number | null;
    max_memory_bytes: string | null;
    resource_class: ExecutionResourceClass;
}
export declare const ResourceCeilingSchema: Contract<ResourceCeiling>;
export interface StudyTaskAuthorization {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    plan_ref: RevisionRef;
    confirmation_receipt_ref: string;
    requested_operation: StudyTaskOperation;
    input_refs: ArtifactRef[];
    resource_ceiling: ResourceCeiling;
    created_at?: string;
    content_hash: string;
}
export declare const StudyTaskAuthorizationSchema: Contract<StudyTaskAuthorization>;
export interface StudyTaskAuthorizationInput {
    /** The plan revision the receipt confirmed. Re-canonicalized here rather than trusted. */
    plan: StudyPlan;
    receipt: ConfirmationReceipt;
    requestedOperation: StudyTaskOperation;
    inputRefs: ArtifactRef[];
    /** Seconds. Null where the operation is bounded by something other than the clock. */
    maxRuntime?: number | null;
    maxMemoryBytes?: string | null;
    /** The newest plan revision, when the caller knows it. Catches a stale confirmation at any depth. */
    latestPlanRevision?: RevisionRef | null;
    /** The moment to judge the receipt's expiry against. Omit and expiry is not checked. */
    at?: string;
    /** Recorded on the record, and outside what it authorises. Omit for a byte-stable record. */
    createdAt?: string;
}
/**
 * Authorise work, or say why there is nothing to authorise.
 *
 * Four things are checked before the record exists, so an unauthorised task is
 * never a value anyone can hold:
 *
 * 1. the receipt still authorises this plan -- it hashes to its own contents,
 *    the plan hashes to its own, the revision is current and the receipt has
 *    not expired (`verifyConfirmationReceipt`);
 * 2. the receipt's scopes cover the operation being requested, so an approval
 *    for a resource estimate cannot pay for a benchmark run;
 * 3. the study the receipt belongs to is the study the plan belongs to;
 * 4. the ceiling is copied from the receipt rather than accepted from the
 *    caller, so the authorization cannot be wider than the approval.
 *
 * A missing confirmation and a stale one were once the two failures worth
 * separating. There are now six, and each is a different code because each
 * needs a different fix: one asks somebody to approve the plan, one tells them
 * the plan they approved is not the plan in front of them, one says the
 * approval has lapsed, one says the token did not carry the permission.
 */
export declare function authoriseStudyTask(input: StudyTaskAuthorizationInput): {
    ok: true;
    authorization: StudyTaskAuthorization;
} | {
    ok: false;
    refusal: StudyRefusal;
};
/**
 * Where the work is right now, and why this record has no hash (goal §8).
 *
 * An `ExecutionJob` is control-plane state: a queue position, an attempt
 * counter, a progress figure, a cancellation flag. Every one of those is
 * overwritten while the work runs, which is exactly what a content address
 * cannot survive -- and the retired `StudyTask` proved it, by having to exclude
 * its own status from its own identity to stay referenceable.
 *
 * So this record is **deliberately not content-addressed**, and the absence is
 * stated rather than left to be noticed. It carries no `hash_rules_id` and no
 * hash field; `registry.ts` lists `execution_job` as a control-plane kind and
 * `studyRecordKind` refuses it with `NOT_CONTENT_ADDRESSED` rather than
 * `UNKNOWN_RECORD_KIND`, because "we do not hash this" and "we have never heard
 * of this" send a reader to two different places.
 *
 * What is content-addressed is what the job *did*: the authorization it is
 * working from, and the `TaskOutcome` and `ExecutionCapsule` it produces. A
 * reader who wants a stable reference to this work references the
 * authorization, whose digest does not move while the job runs.
 *
 * The exported names carry a `Study` prefix, as `StudyEnvironment` and
 * `StudyQuantity` do, because `src/worker/job.ts` already exports an
 * `ExecutionJob`: that one is the envelope a worker receives, this one is the
 * study family's view of the same work, and two different types under one name
 * in the root barrel would be an ambiguity a consumer resolves by guessing. The
 * record kind is `execution_job` either way, since that is a study-family name
 * and no other family declares one.
 */
export declare const StudyExecutionJobStatusSchema: z.ZodEnum<["QUEUED", "LEASED", "RUNNING", "RETRY_SCHEDULED", "SUCCEEDED", "FAILED", "CANCELLED"]>;
export type StudyExecutionJobStatus = z.infer<typeof StudyExecutionJobStatusSchema>;
/** The statuses a job does not leave. Derived from nothing else; the queue owns this vocabulary. */
export declare const STUDY_EXECUTION_JOB_TERMINAL_STATUSES: readonly StudyExecutionJobStatus[];
export interface StudyExecutionJobProgress {
    completed_units: number;
    total_units: number | null;
    note: string | null;
}
export declare const StudyExecutionJobProgressSchema: Contract<StudyExecutionJobProgress>;
export interface StudyExecutionJob {
    schema_version: string;
    job_id: string;
    authorization_ref: string;
    status: StudyExecutionJobStatus;
    attempt: number;
    max_attempts: number;
    progress: StudyExecutionJobProgress;
    cancellation: Cancellation;
    updated_at: string;
}
export declare const StudyExecutionJobSchema: Contract<StudyExecutionJob>;
/**
 * How the work ended (goal §8).
 *
 * A separate immutable record rather than a status on the authorization, which
 * is the whole point of the split: writing this changes nothing about what was
 * authorised, so every reference to the authorization keeps resolving to the
 * same digest it always did.
 *
 * `capsule_ref` is nullable and the pairing is checked. A run that succeeded
 * produced a capsule and must name it -- a success with nothing behind it is a
 * claim. A run that failed before it started may have produced nothing, and a
 * cancelled one may have produced partial outputs worth keeping, so both may
 * name a capsule or not.
 */
export declare const TaskTerminalStatusSchema: z.ZodEnum<["SUCCEEDED", "FAILED", "CANCELLED", "REFUSED"]>;
export type TaskTerminalStatus = z.infer<typeof TaskTerminalStatusSchema>;
export interface TaskOutcome {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    authorization_ref: string;
    capsule_ref: string | null;
    terminal_status: TaskTerminalStatus;
    reason: string | null;
    attempts: number;
    created_at?: string;
    content_hash: string;
}
export declare const TaskOutcomeSchema: Contract<TaskOutcome>;
export interface TaskOutcomeInput {
    authorization: StudyTaskAuthorization;
    /** The capsule the run produced, where there is one. Cross-checked against the authorization. */
    capsule?: ExecutionCapsule | null;
    terminalStatus: TaskTerminalStatus;
    reason?: string | null;
    attempts: number;
    createdAt?: string;
}
/**
 * Close a task, or say why the outcome cannot be recorded.
 *
 * The capsule is cross-checked rather than trusted: a capsule pointing at some
 * other authorization would make the outcome say a run answered work nobody
 * authorised, and every hash in the chain would still verify individually. That
 * is the shape of failure this family exists to make visible -- each record
 * intact, the graph between them wrong.
 */
export declare function recordTaskOutcome(input: TaskOutcomeInput): {
    ok: true;
    outcome: TaskOutcome;
} | {
    ok: false;
    refusal: StudyRefusal;
};
export interface TaskChainInput {
    study: Study;
    plan: StudyPlan;
    receipt: ConfirmationReceipt;
    authorization: StudyTaskAuthorization;
    outcome?: TaskOutcome | null;
    capsule?: ExecutionCapsule | null;
    /**
     * The newest plan revision the store knows, where the caller has read one.
     * Omitted, the chain can see that the plan in hand is intact and not that it
     * is still current, and `does_not_establish` says so rather than implying the
     * check happened.
     */
    latestPlanRevision?: RevisionRef | null;
    /** The moment to judge the receipt's expiry against. Omit and expiry is not checked. */
    at?: string;
}
export interface TaskChainVerification {
    readonly valid: boolean;
    readonly problems: readonly StudyRefusal[];
    /** What a passing verdict does not establish, carried in the result rather than in a docstring. */
    readonly does_not_establish: readonly string[];
}
/**
 * Whether the references between a study, a plan, a receipt, an authorization,
 * an outcome and a capsule all resolve to each other (goal §8).
 *
 * Each record verifies on its own -- that is what `studySelfHash` is for -- and
 * a graph of individually intact records can still be wrong in every way that
 * matters: an authorization built on a receipt for a different study, a capsule
 * answering a different authorization, an outcome naming a capsule that belongs
 * to another run. Nothing about a single record can see any of that, which is
 * why the cross-references are checked here, in one place, against every record
 * a caller holds.
 *
 * Every problem is reported rather than the first, because these are findings
 * about one graph and a caller fixing them needs the whole list -- unlike the
 * builders, which refuse at the first failure because there is no record to
 * report about yet.
 *
 * **What a passing verdict does not establish**, in the result itself so that a
 * surface cannot render it as more: that the run happened, that the outputs came
 * from the code named, that the actor had authority, or that anything here is
 * signed. It establishes that these records refer to each other consistently and
 * that none of them has been edited since it was written.
 */
export declare const TASK_CHAIN_DOES_NOT_ESTABLISH: readonly string[];
export declare function verifyTaskAuthorizationChain(input: TaskChainInput): TaskChainVerification;
//# sourceMappingURL=task.d.ts.map