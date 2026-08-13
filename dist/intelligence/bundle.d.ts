import { z } from "zod";
import { type Contract } from "./measurement.js";
import { type QuantumWorkload } from "./workload.js";
import { type ClassicalBaseline } from "./baseline.js";
import { type ResourceScenario } from "./scenario.js";
import { type ResourceEstimateSnapshot } from "./estimate.js";
import { type AdvantageThreshold } from "./thresholds.js";
import { type DecisionAssessment } from "./decision.js";
/**
 * One assessment, whole, under one hash (ketqat-sdk#236).
 *
 * The bundle is the unit that survives leaving this process. It carries the
 * inputs, the assumptions, every estimate, every threshold, every decision, and
 * the sources -- so a reader who receives only the bundle can check the
 * conclusion rather than take it, and a reader who receives only the conclusion
 * can be pointed at the bundle.
 *
 * Reproducibility comes from `src/reproducibility`, unchanged. Its canonicalizer
 * already drops `created_at` at every level, which is why every timestamp in
 * this module is called `created_at` rather than something more descriptive: a
 * new name would have needed a new exclusion, a new exclusion is a new hash
 * version, and a new hash version invalidates comparison with every record
 * already stored. Reusing the existing rule was free; extending it would not
 * have been.
 *
 * `buildBundle` is a pure function of workload, baseline and scenarios. Given
 * the same three it returns the same estimates, the same decisions, and the same
 * hash, in this process, in a week, and in Python.
 */
export declare const EvidenceSourceSchema: z.ZodObject<{
    /** What this source supports: "classical baseline", "hardware parameters". */
    supports: z.ZodString;
    title: z.ZodString;
    url: z.ZodNullable<z.ZodString>;
    /** ISO date the source was published. */
    published_on: z.ZodNullable<z.ZodString>;
    /** ISO date the source was read. A page can change after publication. */
    retrieved_on: z.ZodNullable<z.ZodString>;
    confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
    limitations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    supports: string;
    title: string;
    url: string | null;
    published_on: string | null;
    retrieved_on: string | null;
    confidence: "HIGH" | "LOW" | "MEDIUM";
    limitations: string[];
}, {
    supports: string;
    title: string;
    url: string | null;
    published_on: string | null;
    retrieved_on: string | null;
    confidence: "HIGH" | "LOW" | "MEDIUM";
    limitations: string[];
}>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export declare const ScenarioComparisonRowSchema: z.ZodObject<{
    scenario_name: z.ZodString;
    scenario_preset: z.ZodString;
    scenario_revision: z.ZodNumber;
    feasible: z.ZodBoolean;
    logical_qubits: z.ZodNullable<z.ZodNumber>;
    total_physical_qubits: z.ZodNullable<z.ZodNumber>;
    runtime: z.ZodNullable<z.ZodNumber>;
    code_distance: z.ZodNullable<z.ZodNumber>;
    factory_share: z.ZodNullable<z.ZodNumber>;
    achieved_logical_error: z.ZodNullable<z.ZodNumber>;
    /** Slowest cycle meeting whichever target applies, in ns. */
    required_cycle_time_ns: z.ZodNullable<z.ZodNumber>;
    required_factory_throughput: z.ZodNullable<z.ZodNumber>;
    economic_status: z.ZodString;
    evidence_confidence: z.ZodString;
    decision_status: z.ZodString;
}, "strip", z.ZodTypeAny, {
    scenario_name: string;
    scenario_preset: string;
    scenario_revision: number;
    feasible: boolean;
    logical_qubits: number | null;
    total_physical_qubits: number | null;
    runtime: number | null;
    code_distance: number | null;
    factory_share: number | null;
    achieved_logical_error: number | null;
    required_cycle_time_ns: number | null;
    required_factory_throughput: number | null;
    economic_status: string;
    evidence_confidence: string;
    decision_status: string;
}, {
    scenario_name: string;
    scenario_preset: string;
    scenario_revision: number;
    feasible: boolean;
    logical_qubits: number | null;
    total_physical_qubits: number | null;
    runtime: number | null;
    code_distance: number | null;
    factory_share: number | null;
    achieved_logical_error: number | null;
    required_cycle_time_ns: number | null;
    required_factory_throughput: number | null;
    economic_status: string;
    evidence_confidence: string;
    decision_status: string;
}>;
export type ScenarioComparisonRow = z.infer<typeof ScenarioComparisonRowSchema>;
export declare const ScenarioComparisonSchema: z.ZodObject<{
    comparable: z.ZodBoolean;
    /** Why the scenarios may not be placed in one table, when they may not. */
    incomparability_reasons: z.ZodArray<z.ZodString, "many">;
    rows: z.ZodArray<z.ZodObject<{
        scenario_name: z.ZodString;
        scenario_preset: z.ZodString;
        scenario_revision: z.ZodNumber;
        feasible: z.ZodBoolean;
        logical_qubits: z.ZodNullable<z.ZodNumber>;
        total_physical_qubits: z.ZodNullable<z.ZodNumber>;
        runtime: z.ZodNullable<z.ZodNumber>;
        code_distance: z.ZodNullable<z.ZodNumber>;
        factory_share: z.ZodNullable<z.ZodNumber>;
        achieved_logical_error: z.ZodNullable<z.ZodNumber>;
        /** Slowest cycle meeting whichever target applies, in ns. */
        required_cycle_time_ns: z.ZodNullable<z.ZodNumber>;
        required_factory_throughput: z.ZodNullable<z.ZodNumber>;
        economic_status: z.ZodString;
        evidence_confidence: z.ZodString;
        decision_status: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        scenario_name: string;
        scenario_preset: string;
        scenario_revision: number;
        feasible: boolean;
        logical_qubits: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
        code_distance: number | null;
        factory_share: number | null;
        achieved_logical_error: number | null;
        required_cycle_time_ns: number | null;
        required_factory_throughput: number | null;
        economic_status: string;
        evidence_confidence: string;
        decision_status: string;
    }, {
        scenario_name: string;
        scenario_preset: string;
        scenario_revision: number;
        feasible: boolean;
        logical_qubits: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
        code_distance: number | null;
        factory_share: number | null;
        achieved_logical_error: number | null;
        required_cycle_time_ns: number | null;
        required_factory_throughput: number | null;
        economic_status: string;
        evidence_confidence: string;
        decision_status: string;
    }>, "many">;
    /**
     * Why there is no summary row.
     *
     * A mean of a conservative and an optimistic estimate is a number no model
     * predicts, presented with the authority of both. The absence of an aggregate
     * is the design; this string says so where a reader would look for one.
     */
    aggregation_policy: z.ZodString;
}, "strip", z.ZodTypeAny, {
    comparable: boolean;
    incomparability_reasons: string[];
    rows: {
        scenario_name: string;
        scenario_preset: string;
        scenario_revision: number;
        feasible: boolean;
        logical_qubits: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
        code_distance: number | null;
        factory_share: number | null;
        achieved_logical_error: number | null;
        required_cycle_time_ns: number | null;
        required_factory_throughput: number | null;
        economic_status: string;
        evidence_confidence: string;
        decision_status: string;
    }[];
    aggregation_policy: string;
}, {
    comparable: boolean;
    incomparability_reasons: string[];
    rows: {
        scenario_name: string;
        scenario_preset: string;
        scenario_revision: number;
        feasible: boolean;
        logical_qubits: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
        code_distance: number | null;
        factory_share: number | null;
        achieved_logical_error: number | null;
        required_cycle_time_ns: number | null;
        required_factory_throughput: number | null;
        economic_status: string;
        evidence_confidence: string;
        decision_status: string;
    }[];
    aggregation_policy: string;
}>;
export type ScenarioComparison = z.infer<typeof ScenarioComparisonSchema>;
/**
 * Declared by hand so the emitted declaration references the component types by
 * name instead of expanding each of them once per array element.
 *
 * See the note in `measurement.ts`: the inferred bundle type printed the whole
 * estimate, threshold and assessment shapes inline, and `bundle.d.ts` reached
 * 413 KB. Naming the parts is what keeps a contracts package small enough to be
 * worth installing.
 */
export interface ResourceIntelligenceBundle {
    schema_version: string;
    bundle_kind: "RESOURCE_INTELLIGENCE";
    reproducibility_hash_version: number;
    reproducibility_hash: string;
    is_demo: boolean;
    generator: {
        name: string;
        version: string;
        schema_version: string;
    };
    workload: QuantumWorkload;
    classical_baseline: ClassicalBaseline | null;
    scenarios: ResourceScenario[];
    estimates: ResourceEstimateSnapshot[];
    thresholds: AdvantageThreshold[];
    assessments: DecisionAssessment[];
    comparison: ScenarioComparison;
    sources: EvidenceSource[];
    limitations: string[];
    reproduction_command: string;
    created_at?: string;
}
export declare const ResourceIntelligenceBundleSchema: Contract<ResourceIntelligenceBundle>;
export interface BundleInput {
    workload: QuantumWorkload;
    baseline: ClassicalBaseline | null;
    scenarios: ResourceScenario[];
    sources?: EvidenceSource[];
    /** Recorded in the bundle but excluded from the hash. Omit for a byte-stable artifact. */
    createdAt?: string;
}
/**
 * Build the whole assessment and hash it.
 *
 * Ordering is fixed by the caller's scenario list and preserved everywhere, so
 * two bundles built from the same inputs are byte-identical after
 * canonicalization.
 */
export declare function buildBundle(input: BundleInput): ResourceIntelligenceBundle;
export declare const VerificationSchema: z.ZodObject<{
    valid: z.ZodBoolean;
    hash_matches: z.ZodBoolean;
    decision_matches: z.ZodBoolean;
    estimates_match: z.ZodBoolean;
    expected_hash: z.ZodString;
    actual_hash: z.ZodString;
    /** Every discrepancy found, named. Empty when `valid`. */
    problems: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    valid: boolean;
    hash_matches: boolean;
    decision_matches: boolean;
    estimates_match: boolean;
    expected_hash: string;
    actual_hash: string;
    problems: string[];
}, {
    valid: boolean;
    hash_matches: boolean;
    decision_matches: boolean;
    estimates_match: boolean;
    expected_hash: string;
    actual_hash: string;
    problems: string[];
}>;
export type Verification = z.infer<typeof VerificationSchema>;
/**
 * Recompute a bundle from its own inputs and compare.
 *
 * Checking the hash alone proves the file was not edited. It does not prove the
 * conclusions follow from the inputs, which is the claim a reader actually needs
 * -- a bundle whose decision section was written by hand and then re-hashed
 * passes a hash check and is a fabrication. So this rebuilds the estimates,
 * thresholds and assessments from the stored workload, baseline and scenarios,
 * and compares those too.
 */
export declare function verifyBundle(candidate: unknown): Verification;
//# sourceMappingURL=bundle.d.ts.map