import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import { artifactRefListSchema, type ArtifactRef } from "./artifact.js"
import { CancellationSchema, type Cancellation, type ExecutionCapsule } from "./capsule.js"
import {
  ContentHashSchema,
  ExecutionResourceClassSchema,
  RevisionRefSchema,
  STUDY_SCHEMA_VERSION,
  type ExecutionResourceClass,
  type RevisionRef,
} from "./common.js"
import { studySelfHash } from "./hash.js"
import { StudyIdSchema } from "./identity.js"
import type { StudyPlan } from "./plan.js"
import {
  receiptGrantsScope,
  verifyConfirmationReceipt,
  type ConfirmationReceipt,
} from "./receipt.js"
import { studyNotHashableRefusal, type StudyRefusal } from "./refusals.js"
import { STUDY_HASH_RULES_ID } from "./rules.js"
import type { Study } from "./study.js"
import { FiniteFloatSchema, ExactIntegerStringSchema, SafeIntegerSchema } from "./values.js"

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
export const StudyTaskOperationSchema = z.enum([
  /** Measure the classical method the study compares against. */
  "STUDY_BASELINE_RUN",
  /** Estimate quantum resources under the plan's pinned scenarios. */
  "STUDY_RESOURCE_ESTIMATE",
  /** Run the benchmark the plan names. */
  "STUDY_BENCHMARK_RUN",
  /** Re-run a previous execution from its capsule and compare. */
  "STUDY_REPRODUCTION",
])
export type StudyTaskOperation = z.infer<typeof StudyTaskOperationSchema>

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
  readonly operation: StudyTaskOperation
  readonly scope: string
}

export const STUDY_OPERATION_SCOPES: readonly StudyOperationScope[] = Object.freeze([
  Object.freeze({ operation: "STUDY_BASELINE_RUN" as const, scope: "study:execute" }),
  Object.freeze({ operation: "STUDY_RESOURCE_ESTIMATE" as const, scope: "study:estimate" }),
  Object.freeze({ operation: "STUDY_BENCHMARK_RUN" as const, scope: "study:execute" }),
  Object.freeze({ operation: "STUDY_REPRODUCTION" as const, scope: "study:execute" }),
])

/** The working lookup, module-private and built from the frozen tuple. */
const scopeByOperation = new Map<string, string>(
  STUDY_OPERATION_SCOPES.map((entry) => [entry.operation, entry.scope]),
)

/** The scope an operation requires, or null where this build declares none. */
export function scopeForOperation(operation: string): string | null {
  return scopeByOperation.get(operation) ?? null
}

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
  max_credits: number
  max_runtime: number | null
  max_memory_bytes: string | null
  resource_class: ExecutionResourceClass
}

export const ResourceCeilingSchema: Contract<ResourceCeiling> = z
  .object({
    max_credits: FiniteFloatSchema.positive(),
    /** Seconds, or null where the operation is bounded by something other than the clock. */
    max_runtime: FiniteFloatSchema.positive().nullable(),
    /** A byte count as an `exact_integer_string`: past 2^53 a JSON number is two values in two languages. */
    max_memory_bytes: ExactIntegerStringSchema.nullable(),
    resource_class: ExecutionResourceClassSchema,
  })
  .strict()

export interface StudyTaskAuthorization {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  plan_ref: RevisionRef
  confirmation_receipt_ref: string
  requested_operation: StudyTaskOperation
  input_refs: ArtifactRef[]
  resource_ceiling: ResourceCeiling
  created_at?: string
  content_hash: string
}

export const StudyTaskAuthorizationSchema: Contract<StudyTaskAuthorization> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /** The confirmed plan revision this work is authorised by. */
    plan_ref: RevisionRefSchema,
    /**
     * The receipt that authorised it.
     *
     * A hash rather than a boolean or a bare confirmed digest: the receipt is
     * where the subject, the tenant, the client, the scope, the ceiling and the
     * expiry live, and an authorization that named only a plan hash would be
     * back where this family started (`receipt.ts`).
     */
    confirmation_receipt_ref: ContentHashSchema,
    requested_operation: StudyTaskOperationSchema,
    /**
     * The exact artifacts this work is authorised over.
     *
     * Typed refs rather than bare hashes, and the same shape a capsule records
     * its inputs with, so "what was authorised" and "what actually went in" are
     * comparable field by field instead of by a set of opaque digests.
     */
    input_refs: artifactRefListSchema("authorised input") as unknown as z.ZodType<ArtifactRef[]>,
    resource_ceiling: ResourceCeilingSchema,
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it authorises. */
    created_at: IsoDateTimeSchema.optional(),
    /**
     * The authorization's own digest: `recordHash`, over everything except the
     * three `DERIVED` fields.
     *
     * The *record* digest rather than the semantic one, which the retired
     * `study_task` could not use. There is no denormalized state left to move
     * underneath it, so "was this edited after it was written" is a question
     * this record can answer -- and it is the question a reader asks of an
     * authorization somebody is about to spend money against.
     */
    content_hash: ContentHashSchema,
  })
  .strict()

export interface StudyTaskAuthorizationInput {
  /** The plan revision the receipt confirmed. Re-canonicalized here rather than trusted. */
  plan: StudyPlan
  receipt: ConfirmationReceipt
  requestedOperation: StudyTaskOperation
  inputRefs: ArtifactRef[]
  /** Seconds. Null where the operation is bounded by something other than the clock. */
  maxRuntime?: number | null
  maxMemoryBytes?: string | null
  /** The newest plan revision, when the caller knows it. Catches a stale confirmation at any depth. */
  latestPlanRevision?: RevisionRef | null
  /** The moment to judge the receipt's expiry against. Omit and expiry is not checked. */
  at?: string
  /** Recorded on the record, and outside what it authorises. Omit for a byte-stable record. */
  createdAt?: string
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
export function authoriseStudyTask(
  input: StudyTaskAuthorizationInput,
): { ok: true; authorization: StudyTaskAuthorization } | { ok: false; refusal: StudyRefusal } {
  const subject = `study plan revision ${input.plan.revision}`

  const confirmation = verifyConfirmationReceipt(input.receipt, input.plan, {
    latestPlanRevision: input.latestPlanRevision,
    at: input.at,
  })
  if (!confirmation.ok) return confirmation

  const required = scopeForOperation(input.requestedOperation)
  if (required === null) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_SCOPE_INSUFFICIENT",
        message:
          `This build declares no scope for operation ${input.requestedOperation}, so nothing can say whether the ` +
          "confirmation permits it. An operation whose permission is undeclared is not authorised by default.",
      },
    }
  }
  if (!receiptGrantsScope(input.receipt, required)) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_SCOPE_INSUFFICIENT",
        message:
          `A ${input.requestedOperation} needs the scope ${required}, and the confirmation carries ` +
          `${input.receipt.authorization_scope.join(", ")}. The actor confirmed a plan; they did not grant this ` +
          "operation, and widening a scope on their behalf is the whole of what an authorization must not do.",
      },
    }
  }

  const withoutHash = {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: input.plan.study_ref,
    plan_ref: { revision_hash: input.plan.content_hash, revision: input.plan.revision },
    confirmation_receipt_ref: input.receipt.content_hash,
    requested_operation: input.requestedOperation,
    input_refs: [...input.inputRefs],
    resource_ceiling: {
      max_credits: input.receipt.max_credits,
      max_runtime: input.maxRuntime ?? null,
      max_memory_bytes: input.maxMemoryBytes ?? null,
      resource_class: input.receipt.resource_class,
    },
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  }

  return {
    ok: true,
    authorization: StudyTaskAuthorizationSchema.parse({
      ...withoutHash,
      content_hash: studySelfHash("study_task_authorization", withoutHash),
    }),
  }
}

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
export const StudyExecutionJobStatusSchema = z.enum([
  /** Accepted and waiting. */
  "QUEUED",
  /** Handed to a runner, which holds a lease on it. */
  "LEASED",
  "RUNNING",
  /** Waiting to be retried after a failed attempt. */
  "RETRY_SCHEDULED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
])
export type StudyExecutionJobStatus = z.infer<typeof StudyExecutionJobStatusSchema>

/** The statuses a job does not leave. Derived from nothing else; the queue owns this vocabulary. */
export const STUDY_EXECUTION_JOB_TERMINAL_STATUSES: readonly StudyExecutionJobStatus[] = Object.freeze([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
])

export interface StudyExecutionJobProgress {
  completed_units: number
  total_units: number | null
  note: string | null
}

export const StudyExecutionJobProgressSchema: Contract<StudyExecutionJobProgress> = z
  .object({
    completed_units: SafeIntegerSchema.min(0),
    /**
     * Null where the total is not known in advance, which is the honest answer
     * for a run whose length depends on convergence. Never zero standing in for
     * unknown: zero total units and an unknown total render as very different
     * progress bars.
     */
    total_units: SafeIntegerSchema.min(1).nullable(),
    note: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((progress, context) => {
    if (progress.total_units !== null && progress.completed_units > progress.total_units) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `${progress.completed_units} of ${progress.total_units} units is not progress, it is a counter that has ` +
          "outrun its own total. A reader shown 130% concludes the total was wrong and stops believing the figure.",
        path: ["completed_units"],
      })
    }
  })

export interface StudyExecutionJob {
  schema_version: string
  job_id: string
  authorization_ref: string
  status: StudyExecutionJobStatus
  attempt: number
  max_attempts: number
  progress: StudyExecutionJobProgress
  cancellation: Cancellation
  updated_at: string
}

export const StudyExecutionJobSchema: Contract<StudyExecutionJob> = z
  .object({
    schema_version: z.string().min(1),
    /**
     * No `hash_rules_id`, and the omission is the statement.
     *
     * Every content-addressed record in this family names the rules it hashes
     * under, because nothing is inferred from silence (ADR 0010). This record is
     * not hashed at all, so naming a rule set would say it was.
     */
    job_id: StudyIdSchema,
    /** The immutable authorization this job is working from. The stable reference in the pair. */
    authorization_ref: ContentHashSchema,
    status: StudyExecutionJobStatusSchema,
    attempt: SafeIntegerSchema.min(1),
    max_attempts: SafeIntegerSchema.min(1),
    progress: StudyExecutionJobProgressSchema,
    cancellation: CancellationSchema,
    /** When this row last moved. It moves often, which is the whole reason nothing hashes it. */
    updated_at: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((job, context) => {
    if (job.attempt > job.max_attempts) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Attempt ${job.attempt} of a job allowed ${job.max_attempts} is a retry past the limit that was set for ` +
          "it. The limit exists so that a failing run stops spending; a job past it has already spent past it.",
        path: ["attempt"],
      })
    }
    if (job.status === "RETRY_SCHEDULED" && job.attempt >= job.max_attempts) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A retry is scheduled on attempt ${job.attempt} of ${job.max_attempts}, and there is no attempt left ` +
          "to schedule. A job parked in this state never moves, and a reader waiting on it is waiting for " +
          "something that will not happen.",
        path: ["status"],
      })
    }
    if (
      STUDY_EXECUTION_JOB_TERMINAL_STATUSES.includes(job.status) &&
      job.progress.total_units !== null &&
      job.status === "SUCCEEDED" &&
      job.progress.completed_units !== job.progress.total_units
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A job that succeeded reports ${job.progress.completed_units} of ${job.progress.total_units} units ` +
          "done. A success that did not finish its own work is either a wrong status or a wrong total, and a " +
          "reader cannot tell which.",
        path: ["progress", "completed_units"],
      })
    }
    if (job.cancellation.cancelled && job.status !== "CANCELLED") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A cancelled job is at ${job.status}. The flag and the status are two statements about one thing, and a ` +
          "reader shown a running job with a cancellation on it cannot tell which of the two is stale.",
        path: ["status"],
      })
    }
  })

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
export const TaskTerminalStatusSchema = z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "REFUSED"])
export type TaskTerminalStatus = z.infer<typeof TaskTerminalStatusSchema>

export interface TaskOutcome {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  authorization_ref: string
  capsule_ref: string | null
  terminal_status: TaskTerminalStatus
  reason: string | null
  attempts: number
  created_at?: string
  content_hash: string
}

export const TaskOutcomeSchema: Contract<TaskOutcome> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: StudyIdSchema,
    /** The authorization this outcome closes. Immutable on both ends, so the pointer never goes stale. */
    authorization_ref: ContentHashSchema,
    /** The capsule the run produced, where it produced one. */
    capsule_ref: ContentHashSchema.nullable(),
    terminal_status: TaskTerminalStatusSchema,
    /**
     * Why it ended this way. `SEMANTIC`, not receipt evidence: a refusal reason
     * is part of what the outcome *is*, and two outcomes refusing for two
     * different reasons are two different outcomes.
     */
    reason: z.string().min(1).nullable(),
    /**
     * How many attempts the control plane made. `RECEIPT_ONLY`: a run that
     * succeeded on the third try and one that succeeded on the first describe
     * the same result, and the difference belongs in the audit trail.
     */
    attempts: SafeIntegerSchema.min(1),
    created_at: IsoDateTimeSchema.optional(),
    content_hash: ContentHashSchema,
  })
  .strict()
  .superRefine((outcome, context) => {
    if (outcome.terminal_status === "SUCCEEDED" && outcome.capsule_ref === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A successful run produced a capsule, and this outcome names none. A success with nothing behind it is " +
          "a claim, and a reader who follows the reference finds nothing to check.",
        path: ["capsule_ref"],
      })
    }
    if (outcome.terminal_status !== "SUCCEEDED" && outcome.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A ${outcome.terminal_status} outcome must say why. This is the record a reader goes to when they ask ` +
          "what happened to a run they were expecting a number from, and it is the only place an answer could be.",
        path: ["reason"],
      })
    }
    if (outcome.terminal_status === "SUCCEEDED" && outcome.reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A successful run has no reason to explain. A note recorded beside SUCCEEDED reads as a caveat on a " +
          "result that does not carry one.",
        path: ["reason"],
      })
    }
  })

export interface TaskOutcomeInput {
  authorization: StudyTaskAuthorization
  /** The capsule the run produced, where there is one. Cross-checked against the authorization. */
  capsule?: ExecutionCapsule | null
  terminalStatus: TaskTerminalStatus
  reason?: string | null
  attempts: number
  createdAt?: string
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
export function recordTaskOutcome(
  input: TaskOutcomeInput,
): { ok: true; outcome: TaskOutcome } | { ok: false; refusal: StudyRefusal } {
  const subject = `task authorization ${input.authorization.content_hash}`

  let authorizationHashNow: string
  try {
    authorizationHashNow = studySelfHash("study_task_authorization", input.authorization)
  } catch (error) {
    return { ok: false, refusal: studyNotHashableRefusal(subject, error) }
  }
  if (authorizationHashNow !== input.authorization.content_hash) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "REVISION_BASE_EDITED",
        message:
          `The authorization claims hash ${input.authorization.content_hash} and its own contents canonicalize ` +
          `to ${authorizationHashNow}. It was edited after it was written, so an outcome closing it would name a ` +
          "predecessor that never existed in the form it is being closed from.",
      },
    }
  }

  const capsule = input.capsule ?? null
  if (capsule !== null && capsule.authorization_ref !== input.authorization.content_hash) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "TASK_REFERENCE_UNRESOLVED",
        message:
          `The capsule answers authorization ${capsule.authorization_ref} and this outcome closes ` +
          `${input.authorization.content_hash}. Both records verify on their own; the reference between them is ` +
          "what says the run and the approval are the same piece of work.",
      },
    }
  }

  const withoutHash = {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: input.authorization.study_ref,
    authorization_ref: input.authorization.content_hash,
    capsule_ref: capsule === null ? null : capsule.reproducibility_hash,
    terminal_status: input.terminalStatus,
    reason: input.reason ?? null,
    attempts: input.attempts,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  }

  return {
    ok: true,
    outcome: TaskOutcomeSchema.parse({
      ...withoutHash,
      content_hash: studySelfHash("task_outcome", withoutHash),
    }),
  }
}

export interface TaskChainInput {
  study: Study
  plan: StudyPlan
  receipt: ConfirmationReceipt
  authorization: StudyTaskAuthorization
  outcome?: TaskOutcome | null
  capsule?: ExecutionCapsule | null
  /**
   * The newest plan revision the store knows, where the caller has read one.
   * Omitted, the chain can see that the plan in hand is intact and not that it
   * is still current, and `does_not_establish` says so rather than implying the
   * check happened.
   */
  latestPlanRevision?: RevisionRef | null
  /** The moment to judge the receipt's expiry against. Omit and expiry is not checked. */
  at?: string
}

export interface TaskChainVerification {
  readonly valid: boolean
  readonly problems: readonly StudyRefusal[]
  /** What a passing verdict does not establish, carried in the result rather than in a docstring. */
  readonly does_not_establish: readonly string[]
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
export const TASK_CHAIN_DOES_NOT_ESTABLISH: readonly string[] = Object.freeze([
  "That the run described by the capsule happened, or that its outputs came from the source it names. A capsule " +
    "records what a runner reported; attestation_level is hash_only (ADR 0014).",
  "That the actor named in the receipt had authority to approve this work inside their organisation. The receipt " +
    "records that this server authenticated them, not what they were entitled to.",
  "That anything here is signed. No key belonging to any person is involved at any point in this chain.",
  "That the plan is still the current revision, unless the caller supplied the latest revision it read. Without " +
    "it the chain can see that the plan in hand is intact and not that it is still the newest.",
])

export function verifyTaskAuthorizationChain(input: TaskChainInput): TaskChainVerification {
  const problems: StudyRefusal[] = []
  const { study, plan, receipt, authorization } = input
  const subject = `task authorization ${authorization.content_hash}`

  const add = (code: StudyRefusal["code"], message: string): void => {
    problems.push({ subject, code, message })
  }

  // A record the hashing core refuses has no digest to compare anything
  // against, so the whole chain is unanswerable and this is a finding about
  // that record rather than an exception the caller has to catch to discover
  // it. Anything that is not a hashing refusal is a bug here and is rethrown.
  let authorizationHashNow: string
  try {
    authorizationHashNow = studySelfHash("study_task_authorization", authorization)
  } catch (error) {
    return {
      valid: false,
      problems: Object.freeze([studyNotHashableRefusal(subject, error)]),
      does_not_establish: TASK_CHAIN_DOES_NOT_ESTABLISH,
    }
  }
  if (authorizationHashNow !== authorization.content_hash) {
    add(
      "REVISION_BASE_EDITED",
      `The authorization claims hash ${authorization.content_hash} and its own contents canonicalize to ` +
        `${authorizationHashNow}. Everything below is about a record that is not what it says it is.`,
    )
  }

  const confirmation = verifyConfirmationReceipt(receipt, plan, {
    latestPlanRevision: input.latestPlanRevision ?? null,
    at: input.at,
  })
  if (!confirmation.ok) problems.push(confirmation.refusal)

  if (authorization.confirmation_receipt_ref !== receipt.content_hash) {
    add(
      "TASK_REFERENCE_UNRESOLVED",
      `The authorization was granted under receipt ${authorization.confirmation_receipt_ref} and the receipt in ` +
        `hand is ${receipt.content_hash}. One of the two is a different approval, and which one decides what was ` +
        "actually permitted.",
    )
  }

  if (
    authorization.plan_ref.revision_hash !== receipt.plan_ref.revision_hash ||
    authorization.plan_ref.revision !== receipt.plan_ref.revision
  ) {
    add(
      "PLAN_REVISION_SUPERSEDED",
      `The authorization is bound to plan revision ${authorization.plan_ref.revision} ` +
        `(${authorization.plan_ref.revision_hash}) and the receipt confirmed revision ` +
        `${receipt.plan_ref.revision} (${receipt.plan_ref.revision_hash}). Work would run against a plan the ` +
        "actor did not approve.",
    )
  }

  for (const [label, value] of [
    ["the plan", plan.study_ref],
    ["the receipt", receipt.study_ref],
    ["the authorization", authorization.study_ref],
  ] as const) {
    if (value === study.study_id) continue
    add(
      "TASK_REFERENCE_UNRESOLVED",
      `${label} belongs to study ${value} and the study in hand is ${study.study_id}. An approval given inside ` +
        "one study does not authorise work inside another, however similar the two are.",
    )
  }

  const required = scopeForOperation(authorization.requested_operation)
  if (required === null || !receiptGrantsScope(receipt, required)) {
    add(
      "CONFIRMATION_SCOPE_INSUFFICIENT",
      `A ${authorization.requested_operation} needs the scope ${required ?? "(none declared)"}, and the receipt ` +
        `carries ${receipt.authorization_scope.join(", ")}.`,
    )
  }

  if (authorization.resource_ceiling.max_credits > receipt.max_credits) {
    add(
      "CREDITS_MAXIMUM_EXCEEDED",
      `The authorization allows ${authorization.resource_ceiling.max_credits} credits and the confirmation ` +
        `permitted ${receipt.max_credits}. An authorization cannot be wider than the approval it was built from.`,
    )
  }

  if (authorization.resource_ceiling.resource_class !== receipt.resource_class) {
    add(
      "EXECUTION_CLASS_MISMATCH",
      `The authorization is for ${authorization.resource_ceiling.resource_class} and the confirmation was given ` +
        `for ${receipt.resource_class}. An approval for a simulation is not an approval to submit to hardware.`,
    )
  }

  const capsule = input.capsule ?? null
  if (capsule !== null) {
    if (capsule.authorization_ref !== authorization.content_hash) {
      add(
        "TASK_REFERENCE_UNRESOLVED",
        `The capsule answers authorization ${capsule.authorization_ref} and the authorization in hand is ` +
          `${authorization.content_hash}.`,
      )
    }
    if (capsule.execution.kind !== authorization.resource_ceiling.resource_class) {
      add(
        "EXECUTION_CLASS_MISMATCH",
        `The run executed as ${capsule.execution.kind} and the authorization permits ` +
          `${authorization.resource_ceiling.resource_class}. Which machine ran is not a detail a runner may ` +
          "decide after the fact: it is what the actor approved.",
      )
    }
    if (
      capsule.execution.kind === "HARDWARE" &&
      capsule.execution.confirmation_receipt_ref !== receipt.content_hash
    ) {
      add(
        "TASK_REFERENCE_UNRESOLVED",
        `The hardware capsule was submitted under receipt ${capsule.execution.confirmation_receipt_ref} and the ` +
          `receipt in hand is ${receipt.content_hash}. A hardware submission names its approval a second time ` +
          "precisely so this comparison can be made from the capsule alone.",
      )
    }
    if (
      capsule.execution.kind === "HARDWARE" &&
      capsule.execution.cost_confirmation.authorized_maximum > receipt.max_credits
    ) {
      add(
        "CREDITS_MAXIMUM_EXCEEDED",
        `The capsule records an authorised maximum of ${capsule.execution.cost_confirmation.authorized_maximum} ` +
          `credits and the confirmation permitted ${receipt.max_credits}.`,
      )
    }
  }

  const outcome = input.outcome ?? null
  if (outcome !== null) {
    if (outcome.authorization_ref !== authorization.content_hash) {
      add(
        "TASK_REFERENCE_UNRESOLVED",
        `The outcome closes authorization ${outcome.authorization_ref} and the authorization in hand is ` +
          `${authorization.content_hash}.`,
      )
    }
    const capsuleHash = capsule === null ? null : capsule.reproducibility_hash
    if (outcome.capsule_ref !== null && outcome.capsule_ref !== capsuleHash) {
      add(
        "TASK_REFERENCE_UNRESOLVED",
        `The outcome names capsule ${outcome.capsule_ref} and the capsule in hand is ` +
          `${capsuleHash ?? "not supplied"}.`,
      )
    }
  }

  return {
    valid: problems.length === 0,
    problems: Object.freeze(problems),
    does_not_establish: TASK_CHAIN_DOES_NOT_ESTABLISH,
  }
}
