import { z } from "zod";
import { IsoDateTimeSchema } from "../contracts/common.js";
import { BaselineSourceClassSchema, ContentHashSchema, RevisionRefSchema, STUDY_SCHEMA_VERSION, StudyPositionSchema, } from "./common.js";
import { StudyCriterionSchema, UNEVALUATED_CRITERION_STATUS, duplicateCriterionIds, } from "./criteria.js";
import { studySelfHash } from "./hash.js";
import { StudyIdSchema } from "./identity.js";
import { VersionPinSchema, versionPinShortfall, } from "./pins.js";
import { DataHandlingPolicySchema, dataHandlingSummary } from "./policy.js";
import { studyRevisionRefusal } from "./revision.js";
import { STUDY_HASH_RULES_ID } from "./rules.js";
import { dimensionedQuantitySchema } from "./units.js";
import { FiniteFloatSchema } from "./values.js";
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
 * Four smaller decisions carry weight.
 *
 * **Success and refusal criteria are both required, and both are predicates.** A
 * plan that says only what would count as success has pre-committed to
 * succeeding: every outcome can be read as partial progress after the fact.
 * Stating in advance what would make the study stop is what makes the eventual
 * conclusion falsifiable (RFC §3) -- and stating it as prose leaves the reading
 * of it to whoever writes the report, which is the same failure one step later.
 * So each criterion is a metric, a comparator, a threshold and the kinds of
 * evidence that satisfy it, with the sentence kept beside it as explanation.
 *
 * **`max_credits` is a plain number, not a `Quantity`.** Every estimate in this
 * family wears the measurement envelope because an estimate has a provenance and
 * an uncertainty. A spending ceiling has neither: it is a decision the user made,
 * exact by construction, in the same way `error_budget` is on a scenario. It is
 * denominated in credits, which is why `expected_credits` is a `CREDITS`
 * quantity and cannot be stated in dollars -- a ceiling and an estimate that
 * could not be compared would be two numbers about nothing.
 *
 * **Data handling is a policy, and its summary is generated.** See `policy.ts`:
 * a stored paragraph beside the fields is a second statement free to disagree
 * with them, and the reader believes the paragraph.
 *
 * **A pinned version is not a name and a version.** See `pins.ts`: a version
 * string is a label a registry resolves to whatever is published under it today.
 * Whether a plan is executable is asked of the pins by `planExecutability`,
 * rather than assumed by whatever runs it.
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
}).strict();
export const CandidateWorkflowSchema = z.object({
    name: z.string().min(1),
    /** Hash of a record carrying the `QuantumWorkload`, where one exists yet. */
    workload_ref: ContentHashSchema.nullable(),
    /** Why this candidate is worth spending the run on. An unargued candidate is a preference. */
    rationale: z.string().min(1),
}).strict();
/**
 * The versions this plan is pinned to.
 *
 * Pinned in the plan rather than recorded after the run, because "which model
 * produced this" is only answerable in hindsight if it was decided in advance.
 * The adapter is nullable -- some studies have no vendor adapter -- while the
 * model and the engine are not: something computed the numbers, and it has a
 * version, a digest and, where the source is public, a commit.
 */
export const PinnedVersionsSchema = z
    .object({
    adapter: VersionPinSchema.nullable(),
    model: VersionPinSchema,
    engine: VersionPinSchema,
})
    .strict();
/**
 * How exactly a rerun is expected to match.
 *
 * `STATISTICAL` is not a weaker `EXACT`: a sampled simulation reproduces to
 * within its own sampling error and claiming bit-identity for it would be false.
 * `BEST_EFFORT` says the study cannot promise either, which is the honest label
 * for a run against shared hardware.
 */
export const ReproducibilityLevelSchema = z.enum(["EXACT", "STATISTICAL", "BEST_EFFORT"]);
export const StudyPlanSchema = z
    .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /** The specification revision this plan answers. A plan for an older question is a different plan. */
    specification_ref: RevisionRefSchema,
    revision: StudyPositionSchema,
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
    expected_runtime: dimensionedQuantitySchema("TIME"),
    /** In credits, which is what `max_credits` bounds. A figure in dollars would bound nothing. */
    expected_credits: dimensionedQuantitySchema("CREDITS"),
    /** The user's hard ceiling, in credits. Their decision, exact, not an estimate of anything. */
    max_credits: FiniteFloatSchema.positive(),
    /** What happens to the inputs and the outputs, as decisions rather than a paragraph. */
    data_handling: DataHandlingPolicySchema,
    reproducibility_level: ReproducibilityLevelSchema,
    /** What would count as an answer, as predicates something can evaluate. */
    success_criteria: z.array(StudyCriterionSchema).min(1),
    /** What would make this study stop and report nothing. Required, and required to be non-empty. */
    refusal_criteria: z.array(StudyCriterionSchema).min(1),
    /** What this plan already knows it will not establish. */
    execution_limitations: z.array(z.string().min(1)),
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it says. */
    created_at: IsoDateTimeSchema.optional(),
    /** The confirmation target. Excluded from its own digest. */
    content_hash: ContentHashSchema,
})
    .strict()
    .superRefine((plan, context) => {
    if (plan.revision > 1 && plan.supersedes === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A revision after the first must name the revision it supersedes.",
            path: ["supersedes"],
        });
    }
    if (plan.revision === 1 && plan.supersedes !== null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "The first revision supersedes nothing.",
            path: ["supersedes"],
        });
    }
    // One id space across both lists. A verdict is filed against an id, and a
    // success criterion sharing an id with a refusal criterion would let one
    // verdict argue both ways.
    const criteria = [...plan.success_criteria, ...plan.refusal_criteria];
    for (const duplicate of duplicateCriterionIds(criteria)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Two criteria on this plan are filed under ${duplicate}. A verdict recorded against that id would ` +
                "settle both, and which one it was about could not be recovered.",
            path: ["success_criteria"],
        });
    }
    // A plan is written before anything runs, so a criterion on it cannot
    // already have a verdict. A plan carrying PASS is a plan asserting its own
    // conclusion, which is exactly what stating refusal criteria in advance
    // exists to prevent.
    for (const [index, criterion] of plan.success_criteria.entries()) {
        if (criterion.status !== UNEVALUATED_CRITERION_STATUS) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Success criterion ${criterion.criterion_id} is recorded as ${criterion.status} on a plan. Nothing ` +
                    "has run yet, so a plan that carries a verdict is a plan that has decided its own outcome.",
                path: ["success_criteria", index, "status"],
            });
        }
    }
    for (const [index, criterion] of plan.refusal_criteria.entries()) {
        if (criterion.status !== UNEVALUATED_CRITERION_STATUS) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Refusal criterion ${criterion.criterion_id} is recorded as ${criterion.status} on a plan.`,
                path: ["refusal_criteria", index, "status"],
            });
        }
    }
});
/**
 * The hash a user is asked to confirm.
 *
 * Trivial by design, and named anyway. The alternative -- every caller reaching
 * for whichever field looked like an identifier -- is how a confirmation ends up
 * bound to a database id that survives an edit the hash would not have.
 */
export function planConfirmationTarget(plan) {
    return plan.content_hash;
}
/**
 * The data-handling paragraph a user is shown, generated from the policy they
 * are confirming.
 *
 * Named here so that a surface asking for confirmation has one place to reach
 * for it, and so that no surface is tempted to write its own -- a second
 * rendering is a second thing that can say what the fields do not.
 */
export function planDataHandlingSummary(plan) {
    return dataHandlingSummary(plan.data_handling);
}
/**
 * Whether this plan's pins name programs rather than labels.
 *
 * A report rather than a refusal, and the distinction is the point. A plan is
 * drafted before an image is built, and refusing to record one would push the
 * drafting out of the record; but running a plan whose engine is pinned only by
 * a version string produces a capsule nobody can reproduce, and the runner has
 * to be able to see that before it spends anything.
 *
 * The adapter is checked only when there is one. A study with no vendor adapter
 * is not a study with an unpinned adapter.
 */
export function planExecutability(plan) {
    const shortfalls = [
        ...versionPinShortfall("engine", plan.pinned_versions.engine),
        ...versionPinShortfall("model", plan.pinned_versions.model),
        ...(plan.pinned_versions.adapter === null
            ? []
            : versionPinShortfall("adapter", plan.pinned_versions.adapter)),
    ];
    return Object.freeze({ executable: shortfalls.length === 0, shortfalls: Object.freeze(shortfalls) });
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
export function verifyPlanConfirmation(plan, confirmedHash, latestRevision) {
    const subject = `study plan revision ${plan.revision}`;
    const actual = studySelfHash("study_plan", plan);
    if (actual !== plan.content_hash) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "CONFIRMATION_HASH_MISMATCH",
                message: `The plan claims hash ${plan.content_hash} and its own contents canonicalize to ${actual}. ` +
                    "It was edited after it was written, so no confirmation applies to it.",
            },
        };
    }
    if (latestRevision != null && latestRevision.revision_hash !== actual) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "PLAN_REVISION_SUPERSEDED",
                message: `Revision ${latestRevision.revision} (${latestRevision.revision_hash}) is now the newest plan. ` +
                    "A confirmation of an earlier revision does not carry forward: the plan changed, so the approval has to.",
            },
        };
    }
    if (plan.supersedes !== null && confirmedHash === plan.supersedes) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "PLAN_REVISION_SUPERSEDED",
                message: `The confirmation names revision ${plan.revision - 1} (${confirmedHash}), which revision ${plan.revision} ` +
                    "replaced. What was approved and what would run are two different plans.",
            },
        };
    }
    if (confirmedHash !== actual) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "CONFIRMATION_HASH_MISMATCH",
                message: `The confirmation names ${confirmedHash}, and this plan canonicalizes to ${actual}. ` +
                    "A confirmation authorises exactly one set of contents.",
            },
        };
    }
    return { ok: true };
}
/**
 * Produce the next revision of a plan, superseding the current one.
 *
 * The new revision's hash is different by construction, which is what withdraws
 * the old confirmation: nothing has to remember to revoke it.
 *
 * `currentHash` comes from the caller for the same reason it does in
 * `reviseSpecification` -- the field on the record is a claim, the argument is
 * what the caller checked -- and it is now checked rather than written into
 * `supersedes` on trust. All four statements that have to agree are compared in
 * `revision.ts`, which is also where what the SDK checks and what a store must
 * is spelled out; `latestRevision` is how a caller brings the store's answer
 * into the comparison and gets the concurrent case detected.
 *
 * This one matters more than the specification's. A plan is the thing a user
 * confirms, so a revision built on a stale or edited base is a plan somebody is
 * about to be asked to approve on the strength of a chain that points at a
 * record it did not come from.
 */
export function revisePlan(current, changes, currentHash, latestRevision) {
    const refusal = studyRevisionRefusal("study_plan", `study plan revision ${current.revision}`, current, currentHash, latestRevision);
    if (refusal !== null)
        return { ok: false, refusal };
    const withoutHash = {
        ...current,
        ...changes,
        revision: current.revision + 1,
        supersedes: currentHash,
        schema_version: STUDY_SCHEMA_VERSION,
        hash_rules_id: STUDY_HASH_RULES_ID,
        created_at: changes.created_at,
        content_hash: undefined,
    };
    return {
        ok: true,
        plan: StudyPlanSchema.parse({ ...withoutHash, content_hash: studySelfHash("study_plan", withoutHash) }),
    };
}
//# sourceMappingURL=plan.js.map