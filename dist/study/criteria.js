import { z } from "zod";
import { EvidenceClassSchema } from "../intelligence/measurement.js";
import { STUDY_DIMENSIONS, studyUnitSchema } from "./units.js";
import { ExactIntegerStringSchema, FiniteFloatSchema } from "./values.js";
/**
 * A success or refusal criterion an orchestrator can evaluate (goal §10.3).
 *
 * Prose was the alternative and it is what the plan carried: "A physical-qubit
 * count for each pinned scenario, with its assumptions stated." A person knows
 * what that means. A runner deciding whether to stop cannot read it, so the
 * decision moved to whoever wrote the summary -- which is the failure mode
 * refusal criteria exist to prevent, since a study that cannot mechanically
 * tell when to stop stops when somebody decides it has succeeded.
 *
 * So a criterion is a predicate: which metric, compared how, against what, on
 * evidence of which kinds, and what the evaluation currently says. The prose
 * stays as `explanation`, because a reader still has to understand why the
 * predicate is the right one, and because a predicate with no stated intent is
 * a number nobody can argue with.
 *
 * The split runs through the classification too. The structured half is
 * `SEMANTIC` -- change the comparator or the threshold and the study is
 * checking something else -- and `explanation` is `RECORD_ONLY`, because
 * rewording the sentence beneath an unchanged predicate does not change what
 * the study checks.
 */
/**
 * How a criterion compares its metric to its threshold.
 *
 * The first five are `ClaimComparatorSchema` from `evidence.ts`, member for
 * member, so a criterion and the claim node that eventually answers it speak
 * one vocabulary; `tests/study.test.mjs` asserts that rather than this comment
 * asserting it. They are restated rather than imported because a criterion is
 * declared before an evidence graph exists and should not drag one in.
 *
 * The last four take no threshold. Not every criterion is numeric: "no
 * classical baseline survives review" is a statement about whether something is
 * there at all, and forcing it into a comparison against zero would make the
 * record say a count was measured when what was established is an absence.
 */
export const CriterionComparatorSchema = z.enum([
    "LESS_THAN",
    "AT_MOST",
    "EQUAL",
    "AT_LEAST",
    "GREATER_THAN",
    "EXISTS",
    "DOES_NOT_EXIST",
    "IS_TRUE",
    "IS_FALSE",
]);
/** Which comparators take a threshold, as immutable plain data. */
export const CRITERION_COMPARATORS = Object.freeze([
    Object.freeze({ comparator: "LESS_THAN", takes_threshold: true, means: "strictly below the threshold" }),
    Object.freeze({ comparator: "AT_MOST", takes_threshold: true, means: "at or below the threshold" }),
    Object.freeze({ comparator: "EQUAL", takes_threshold: true, means: "equal to the threshold" }),
    Object.freeze({ comparator: "AT_LEAST", takes_threshold: true, means: "at or above the threshold" }),
    Object.freeze({ comparator: "GREATER_THAN", takes_threshold: true, means: "strictly above the threshold" }),
    Object.freeze({ comparator: "EXISTS", takes_threshold: false, means: "the metric resolves to something" }),
    Object.freeze({
        comparator: "DOES_NOT_EXIST",
        takes_threshold: false,
        means: "the metric resolves to nothing",
    }),
    Object.freeze({ comparator: "IS_TRUE", takes_threshold: false, means: "the metric holds" }),
    Object.freeze({ comparator: "IS_FALSE", takes_threshold: false, means: "the metric does not hold" }),
]);
const comparatorRules = new Map(CRITERION_COMPARATORS.map((entry) => [entry.comparator, entry]));
export function criterionComparatorTakesThreshold(comparator) {
    const rule = comparatorRules.get(comparator);
    if (rule === undefined) {
        throw new Error(`${JSON.stringify(comparator)} is not a criterion comparator.`);
    }
    return rule.takes_threshold;
}
const thresholdVariant = (dimension) => z
    .object({
    dimension: z.literal(dimension),
    /** A measurement-shaped threshold. Null when the threshold is written as exact digits. */
    value: FiniteFloatSchema.nullable(),
    /** Digits, for a threshold JavaScript cannot hold exactly: a large shot count, a byte count. */
    exact_value: ExactIntegerStringSchema.nullable(),
    unit: studyUnitSchema(dimension),
})
    .strict();
export const CriterionThresholdSchema = z
    .discriminatedUnion("dimension", STUDY_DIMENSIONS.map(thresholdVariant))
    .superRefine((threshold, context) => {
    const written = [threshold.value, threshold.exact_value].filter((candidate) => candidate !== null);
    if (written.length === 1)
        return;
    context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A threshold is written once: as a finite number, or as exact digits where the value may exceed 2^53. " +
            "Writing both is two spellings of one threshold, and writing neither is a comparison with nothing.",
        path: ["value"],
    });
});
/**
 * What an evaluation of a criterion currently says.
 *
 * `NOT_RUN` and `INCONCLUSIVE` are separate on purpose. Nothing has been
 * evaluated in the first and something has, and could not decide, in the
 * second; collapsing them lets a run that produced unusable evidence read as a
 * run that has not happened yet, and the second is retried while the first is
 * investigated.
 */
export const CriterionStatusSchema = z.enum(["PASS", "FAIL", "NOT_RUN", "INCONCLUSIVE"]);
/** Which statuses are a verdict, as immutable plain data. */
export const CRITERION_STATUSES = Object.freeze([
    Object.freeze({ status: "PASS", decided: true, means: "the predicate held on evidence of a required kind" }),
    Object.freeze({ status: "FAIL", decided: true, means: "the predicate did not hold" }),
    Object.freeze({ status: "NOT_RUN", decided: false, means: "nothing has been evaluated against it yet" }),
    Object.freeze({
        status: "INCONCLUSIVE",
        decided: false,
        means: "it was evaluated and the evidence did not settle it",
    }),
]);
/** The status a criterion carries before anything has been run against it. */
export const UNEVALUATED_CRITERION_STATUS = "NOT_RUN";
/**
 * A criterion id or a metric reference: a lowercase machine key, one spelling
 * per name.
 *
 * Bounded and anchored for the reason `values.ts` gives about number strings.
 * `Runtime`, `runtime ` and `runtime` are one name to a reader and three keys to
 * anything that looks one up, and an id that can be a megabyte is an id a
 * verifier has to hash.
 */
const CRITERION_ID = /^[a-z][a-z0-9_]{0,63}$/;
const METRIC_REF = /^[a-z][a-z0-9_]{0,63}(?:\.[a-z][a-z0-9_]{0,63}){0,7}$/;
export const StudyCriterionSchema = z
    .object({
    /** How this criterion is named in a queue, a report or a refusal. Unique within the record that carries it. */
    criterion_id: z.string().regex(CRITERION_ID),
    /** Which quantity of the study is being tested: `total_physical_qubits`, `baseline.surviving_count`. */
    metric_ref: z.string().regex(METRIC_REF),
    comparator: CriterionComparatorSchema,
    /** Null exactly for the comparators that test presence rather than magnitude. */
    threshold: CriterionThresholdSchema.nullable(),
    /**
     * The evidence classes that satisfy this criterion, as a set rather than a
     * floor.
     *
     * `src/intelligence/measurement.ts` states that `evidence` is not a
     * confidence score and that there is deliberately no ordering over its
     * members -- a modelled number is not a fraction of a measurement. A
     * "minimum level" would need that ordering and would invent one, so a
     * criterion names the kinds of evidence it accepts instead. A criterion
     * that accepts `MEASURED` and `DERIVED` says so; nothing has to decide
     * whether `DERIVED` is above or below `MODELLED`.
     */
    required_evidence: z.array(EvidenceClassSchema).min(1),
    status: CriterionStatusSchema,
    /** Why this predicate is the right test, for the reader the predicate does not serve. */
    explanation: z.string().min(1),
})
    .strict()
    .superRefine((criterion, context) => {
    const takesThreshold = criterionComparatorTakesThreshold(criterion.comparator);
    if (takesThreshold && criterion.threshold === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${criterion.comparator} compares against a threshold, and this criterion states none.`,
            path: ["threshold"],
        });
    }
    if (!takesThreshold && criterion.threshold !== null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${criterion.comparator} tests whether the metric is there at all, so a threshold beside it is a ` +
                "comparison nothing performs -- and a reader would take it for one that is.",
            path: ["threshold"],
        });
    }
    if (criterion.required_evidence.includes("UNKNOWN")) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "UNKNOWN is the absence of evidence, so a criterion satisfied by it is a criterion satisfied by nothing " +
                "having been established.",
            path: ["required_evidence"],
        });
    }
    if (new Set(criterion.required_evidence).size !== criterion.required_evidence.length) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An evidence class is named twice; the field is the set of kinds that satisfy this criterion.",
            path: ["required_evidence"],
        });
    }
});
/**
 * Refuse a list of criteria that names one id twice.
 *
 * Shared by the specification and the plan because it is the same invariant in
 * both: an id is how a later verdict is filed against a criterion, so two
 * criteria with one id are two predicates one verdict can be attached to, and
 * which one it settled is unrecoverable.
 */
export function duplicateCriterionIds(criteria) {
    const seen = new Set();
    const duplicates = new Set();
    for (const criterion of criteria) {
        if (seen.has(criterion.criterion_id))
            duplicates.add(criterion.criterion_id);
        seen.add(criterion.criterion_id);
    }
    return [...duplicates].sort();
}
//# sourceMappingURL=criteria.js.map