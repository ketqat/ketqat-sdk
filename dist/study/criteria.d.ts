import { z } from "zod";
import { type Contract, type EvidenceClass } from "../intelligence/measurement.js";
import { type StudyDimension } from "./units.js";
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
export declare const CriterionComparatorSchema: z.ZodEnum<["LESS_THAN", "AT_MOST", "EQUAL", "AT_LEAST", "GREATER_THAN", "EXISTS", "DOES_NOT_EXIST", "IS_TRUE", "IS_FALSE"]>;
export type CriterionComparator = z.infer<typeof CriterionComparatorSchema>;
export interface CriterionComparatorRule {
    readonly comparator: CriterionComparator;
    readonly takes_threshold: boolean;
    readonly means: string;
}
/** Which comparators take a threshold, as immutable plain data. */
export declare const CRITERION_COMPARATORS: readonly CriterionComparatorRule[];
export declare function criterionComparatorTakesThreshold(comparator: CriterionComparator): boolean;
/**
 * What a criterion is measured against.
 *
 * The dimension is declared on the threshold rather than inferred from the
 * metric name, because a metric name is a string and inferring a dimension from
 * one is guessing. Declaring it is what lets the unit be checked: a memory
 * threshold in seconds and a shot count in qubits are refused here, at the
 * schema, in both languages -- the union emits one variant per dimension with
 * its own unit enum, so the rule survives into the generated JSON Schema
 * instead of living in a refinement Python never sees.
 *
 * Both number contracts from `values.ts` are offered because both are needed:
 * a runtime threshold is a `finite_float`, and a shot count past 2^53 is an
 * `exact_integer_string`. Exactly one is written, because two spellings of one
 * threshold are two records saying the same thing.
 */
export interface CriterionThreshold {
    dimension: StudyDimension;
    value: number | null;
    exact_value: string | null;
    unit: string;
}
export declare const CriterionThresholdSchema: Contract<CriterionThreshold>;
/**
 * What an evaluation of a criterion currently says.
 *
 * `NOT_RUN` and `INCONCLUSIVE` are separate on purpose. Nothing has been
 * evaluated in the first and something has, and could not decide, in the
 * second; collapsing them lets a run that produced unusable evidence read as a
 * run that has not happened yet, and the second is retried while the first is
 * investigated.
 */
export declare const CriterionStatusSchema: z.ZodEnum<["PASS", "FAIL", "NOT_RUN", "INCONCLUSIVE"]>;
export type CriterionStatus = z.infer<typeof CriterionStatusSchema>;
export interface CriterionStatusRule {
    readonly status: CriterionStatus;
    readonly decided: boolean;
    readonly means: string;
}
/** Which statuses are a verdict, as immutable plain data. */
export declare const CRITERION_STATUSES: readonly CriterionStatusRule[];
/** The status a criterion carries before anything has been run against it. */
export declare const UNEVALUATED_CRITERION_STATUS: CriterionStatus;
export interface StudyCriterion {
    criterion_id: string;
    metric_ref: string;
    comparator: CriterionComparator;
    threshold: CriterionThreshold | null;
    required_evidence: EvidenceClass[];
    status: CriterionStatus;
    explanation: string;
}
export declare const StudyCriterionSchema: Contract<StudyCriterion>;
/**
 * Refuse a list of criteria that names one id twice.
 *
 * Shared by the specification and the plan because it is the same invariant in
 * both: an id is how a later verdict is filed against a criterion, so two
 * criteria with one id are two predicates one verdict can be attached to, and
 * which one it settled is unrecoverable.
 */
export declare function duplicateCriterionIds(criteria: readonly {
    criterion_id: string;
}[]): readonly string[];
//# sourceMappingURL=criteria.d.ts.map