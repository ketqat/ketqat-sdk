import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import { ContentHashSchema, RevisionRefSchema, STUDY_SCHEMA_VERSION, type RevisionRef } from "./common.js"
import { studySelfHash } from "./hash.js"
import { verifyPlanConfirmation, type StudyPlan } from "./plan.js"
import type { StudyRefusal } from "./refusals.js"
import { STUDY_HASH_RULES_ID } from "./rules.js"

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

export const StudyTaskKindSchema = z.enum([
  /** Measure the classical method the study compares against. */
  "STUDY_BASELINE_RUN",
  /** Estimate quantum resources under the plan's pinned scenarios. */
  "STUDY_RESOURCE_ESTIMATE",
  /** Run the benchmark the plan names. */
  "STUDY_BENCHMARK_RUN",
  /** Re-run a previous execution from its capsule and compare. */
  "STUDY_REPRODUCTION",
])
export type StudyTaskKind = z.infer<typeof StudyTaskKindSchema>

export interface StudyTask {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  kind: StudyTaskKind
  plan_ref: RevisionRef
  capsule_ref: string | null
  status: string
  created_at?: string
  content_hash: string
}

export const StudyTaskSchema: Contract<StudyTask> = z.object({
  schema_version: z.string().min(1),
  hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
  study_ref: ContentHashSchema,
  kind: StudyTaskKindSchema,
  /** The confirmed plan revision this work is authorised by. Never null: an unbound task is refused at build. */
  plan_ref: RevisionRefSchema,
  /** Hash of the `ExecutionCapsule`, once an execution exists to point at. */
  capsule_ref: ContentHashSchema.nullable(),
  /**
   * Denormalized from the execution job. A free string rather than an enum
   * because the vocabulary belongs to the job system, not to this family, and a
   * closed copy of someone else's states drifts silently.
   *
   * Classified `RECORD_ONLY`, and it is why a task's `content_hash` is the
   * *semantic* digest of the four (see the self-hash purpose table in
   * `registry.ts`): the execution system overwrites this field as the job moves,
   * so an identity that covered it would stop matching itself between two reads
   * of the same row. `recordHash("study_task", task)` still covers it, and
   * answers the other question -- whether anything about the row was edited.
   */
  status: z.string().min(1),
  /** `RECEIPT_ONLY`: the moment the server observed this task, not a property of the work. */
  created_at: IsoDateTimeSchema.optional(),
  content_hash: ContentHashSchema,
}).strict()

export interface StudyTaskInput {
  plan: StudyPlan
  /** The hash the user actually confirmed, or null when nobody has. */
  confirmedPlanHash: string | null
  kind: StudyTaskKind
  /** The newest plan revision, when the caller knows it. Catches a stale confirmation at any depth. */
  latestPlanRevision?: RevisionRef | null
  /** Initial job status. Denormalized, and outside the digest this task's identity is. */
  status?: string
  /** Recorded on the task, and outside its identity. Omit for a byte-stable record. */
  createdAt?: string
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
export function buildStudyTask(
  input: StudyTaskInput,
): { ok: true; task: StudyTask } | { ok: false; refusal: StudyRefusal } {
  const subject = `study plan revision ${input.plan.revision}`

  if (input.confirmedPlanHash === null || input.confirmedPlanHash.length === 0) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "PLAN_NOT_CONFIRMED",
        message:
          "No confirmation was supplied for this plan, so no work is authorised. A run costs credits and produces " +
          "numbers somebody will quote; both need an approval that names what was approved.",
      },
    }
  }

  const confirmation = verifyPlanConfirmation(input.plan, input.confirmedPlanHash, input.latestPlanRevision)
  if (!confirmation.ok) {
    return confirmation
  }

  const withoutHash = {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: input.plan.study_ref,
    kind: input.kind,
    plan_ref: { revision_hash: input.plan.content_hash, revision: input.plan.revision },
    capsule_ref: null,
    // Nothing has been submitted yet. The execution system owns every state
    // after this one, and overwrites this field as the job moves.
    status: input.status ?? "PENDING",
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  }

  return {
    ok: true,
    task: StudyTaskSchema.parse({ ...withoutHash, content_hash: studySelfHash("study_task", withoutHash) }),
  }
}
