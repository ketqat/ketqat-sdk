import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import { QuantitySchema, type Contract, type Quantity } from "../intelligence/measurement.js"
import {
  BaselineSourceClassSchema,
  ContentHashSchema,
  RevisionRefSchema,
  STUDY_SCHEMA_VERSION,
  type RevisionRef,
} from "./common.js"
import { STUDY_HASH_RULES_ID, calculateStudyHash } from "./hashing.js"
import type { StudyRefusal } from "./refusals.js"

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

export const PlannedBaselineSchema = z.object({
  /** Hash of an existing `ClassicalBaseline` record. Referenced, never inlined and never re-stated. */
  baseline_ref: ContentHashSchema,
  /**
   * Where this study's use of that baseline stands.
   *
   * The classification lives on the plan rather than inside the baseline because
   * it is a statement about the comparison, not about the record: the same
   * measured baseline is strong evidence for the workload it was measured on and
   * a cited figure for a different one.
   */
  source_class: BaselineSourceClassSchema,
  note: z.string().min(1).nullable(),
})
export type PlannedBaseline = z.infer<typeof PlannedBaselineSchema>

export const CandidateWorkflowSchema = z.object({
  name: z.string().min(1),
  /** Hash of a record carrying the `QuantumWorkload`, where one exists yet. */
  workload_ref: ContentHashSchema.nullable(),
  /** Why this candidate is worth spending the run on. An unargued candidate is a preference. */
  rationale: z.string().min(1),
})
export type CandidateWorkflow = z.infer<typeof CandidateWorkflowSchema>

const namedVersion = z.object({ name: z.string().min(1), version: z.string().min(1) })

/**
 * The versions this plan is pinned to.
 *
 * Pinned in the plan rather than recorded after the run, because "which model
 * produced this" is only answerable in hindsight if it was decided in advance.
 * The adapter is nullable -- some studies have no vendor adapter -- while the
 * model and the engine are not: something computed the numbers, and it has a
 * version.
 */
export const PinnedVersionsSchema = z.object({
  adapter: namedVersion.nullable(),
  model: namedVersion,
  engine: namedVersion,
})
export type PinnedVersions = z.infer<typeof PinnedVersionsSchema>

/**
 * How exactly a rerun is expected to match.
 *
 * `STATISTICAL` is not a weaker `EXACT`: a sampled simulation reproduces to
 * within its own sampling error and claiming bit-identity for it would be false.
 * `BEST_EFFORT` says the study cannot promise either, which is the honest label
 * for a run against shared hardware.
 */
export const ReproducibilityLevelSchema = z.enum(["EXACT", "STATISTICAL", "BEST_EFFORT"])
export type ReproducibilityLevel = z.infer<typeof ReproducibilityLevelSchema>

export interface StudyPlan {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  specification_ref: RevisionRef
  revision: number
  supersedes: string | null
  baselines: PlannedBaseline[]
  candidates: CandidateWorkflow[]
  scenario_refs: string[]
  pinned_versions: PinnedVersions
  expected_runtime: Quantity
  expected_credits: Quantity
  max_credits: number
  data_handling: string
  reproducibility_level: ReproducibilityLevel
  success_criteria: string[]
  refusal_criteria: string[]
  execution_limitations: string[]
  created_at?: string
  content_hash: string
}

export const StudyPlanSchema: Contract<StudyPlan> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: ContentHashSchema,
    /** The specification revision this plan answers. A plan for an older question is a different plan. */
    specification_ref: RevisionRefSchema,
    revision: z.number().int().positive(),
    supersedes: ContentHashSchema.nullable(),
    /**
     * May be empty. A study with no classical baseline is a legitimate study; it
     * is simply one from which no economic or speedup conclusion can be drawn,
     * which the existing intelligence gate already refuses to draw.
     */
    baselines: z.array(PlannedBaselineSchema),
    /** At least one: a plan that proposes no quantum workflow has nothing to run. */
    candidates: z.array(CandidateWorkflowSchema).min(1),
    /** Hashes of the `ResourceScenario` revisions this plan estimates under. Reused by reference. */
    scenario_refs: z.array(ContentHashSchema).min(1),
    pinned_versions: PinnedVersionsSchema,
    /** An estimate, so it wears the envelope with its evidence class and its assumptions. */
    expected_runtime: QuantitySchema,
    expected_credits: QuantitySchema,
    /** The user's hard ceiling. Their decision, exact, not an estimate of anything. */
    max_credits: z.number().positive(),
    /** What happens to the inputs and the outputs. Never blank on a plan somebody signs. */
    data_handling: z.string().min(1),
    reproducibility_level: ReproducibilityLevelSchema,
    /** What would count as an answer. */
    success_criteria: z.array(z.string().min(1)).min(1),
    /** What would make this study stop and report nothing. Required, and required to be non-empty. */
    refusal_criteria: z.array(z.string().min(1)).min(1),
    /** What this plan already knows it will not establish. */
    execution_limitations: z.array(z.string().min(1)),
    /** Excluded from the hash by name, like every other timestamp in this family. */
    created_at: IsoDateTimeSchema.optional(),
    /** The confirmation target. Excluded from its own digest. */
    content_hash: ContentHashSchema,
  })
  .superRefine((plan, context) => {
    if (plan.revision > 1 && plan.supersedes === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A revision after the first must name the revision it supersedes.",
        path: ["supersedes"],
      })
    }
    if (plan.revision === 1 && plan.supersedes !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The first revision supersedes nothing.",
        path: ["supersedes"],
      })
    }
  })

/**
 * The hash a user is asked to confirm.
 *
 * Trivial by design, and named anyway. The alternative -- every caller reaching
 * for whichever field looked like an identifier -- is how a confirmation ends up
 * bound to a database id that survives an edit the hash would not have.
 */
export function planConfirmationTarget(plan: StudyPlan): string {
  return plan.content_hash
}

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
export function verifyPlanConfirmation(
  plan: StudyPlan,
  confirmedHash: string,
  latestRevision?: RevisionRef | null,
): { ok: true } | { ok: false; refusal: StudyRefusal } {
  const subject = `study plan revision ${plan.revision}`
  const actual = calculateStudyHash(plan)

  if (actual !== plan.content_hash) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_HASH_MISMATCH",
        message:
          `The plan claims hash ${plan.content_hash} and its own contents canonicalize to ${actual}. ` +
          "It was edited after it was written, so no confirmation applies to it.",
      },
    }
  }

  if (latestRevision != null && latestRevision.revision_hash !== actual) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "PLAN_REVISION_SUPERSEDED",
        message:
          `Revision ${latestRevision.revision} (${latestRevision.revision_hash}) is now the newest plan. ` +
          "A confirmation of an earlier revision does not carry forward: the plan changed, so the approval has to.",
      },
    }
  }

  if (plan.supersedes !== null && confirmedHash === plan.supersedes) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "PLAN_REVISION_SUPERSEDED",
        message:
          `The confirmation names revision ${plan.revision - 1} (${confirmedHash}), which revision ${plan.revision} ` +
          "replaced. What was approved and what would run are two different plans.",
      },
    }
  }

  if (confirmedHash !== actual) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_HASH_MISMATCH",
        message:
          `The confirmation names ${confirmedHash}, and this plan canonicalizes to ${actual}. ` +
          "A confirmation authorises exactly one set of contents.",
      },
    }
  }

  return { ok: true }
}

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
export function revisePlan(
  current: StudyPlan,
  changes: Partial<Omit<StudyPlan, "revision" | "supersedes" | "schema_version" | "hash_rules_id" | "content_hash">>,
  currentHash: string,
): StudyPlan {
  const withoutHash = {
    ...current,
    ...changes,
    revision: current.revision + 1,
    supersedes: currentHash,
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    created_at: changes.created_at,
    content_hash: undefined,
  }
  return StudyPlanSchema.parse({ ...withoutHash, content_hash: calculateStudyHash(withoutHash) })
}
