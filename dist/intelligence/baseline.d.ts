import { z } from "zod";
/**
 * What the classical computation currently costs (ketqat-sdk#236).
 *
 * This is the half of a quantum advantage claim that is almost always missing.
 * "Quantum will be faster" is not a comparison unless something states what it
 * would be faster *than*, measured on what hardware, at what problem size, to
 * what solution quality, on what date.
 *
 * The baseline is optional, and its absence is handled rather than papered over:
 * resource estimation runs without it, and every economic conclusion is refused
 * with `INSUFFICIENT_EVIDENCE_FOR_ECONOMIC_COMPARISON`. There is no default
 * classical runtime, because a fabricated denominator produces a fabricated
 * speedup.
 *
 * `evidence` is required and not defaulted. A baseline someone measured last
 * Tuesday and one someone estimated from a scaling argument support very
 * different claims, and the difference disappears the moment both are printed as
 * "1,200 s".
 */
export declare const SolutionQualitySchema: z.ZodObject<{
    /** What is being measured: "approximation ratio", "residual", "rank correlation". */
    metric: z.ZodString;
    value: z.ZodNumber;
    unit: z.ZodOptional<z.ZodString>;
    lower_is_better: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    metric: string;
    value: number;
    unit?: string | undefined;
    lower_is_better: boolean;
}, {
    metric: string;
    value: number;
    unit?: string | undefined;
    lower_is_better: boolean;
}>;
export type SolutionQuality = z.infer<typeof SolutionQualitySchema>;
export declare const MonetaryAmountSchema: z.ZodObject<{
    amount: z.ZodNumber;
    /** ISO 4217. Held separately so two baselines in different currencies are not silently compared. */
    currency: z.ZodString;
}, "strip", z.ZodTypeAny, {
    amount: number;
    currency: string;
}, {
    amount: number;
    currency: string;
}>;
export type MonetaryAmount = z.infer<typeof MonetaryAmountSchema>;
export declare const ClassicalBaselineSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodString;
    /**
     * How this baseline was obtained. `UNKNOWN` is representable so a user can
     * record that they do not know, which is different from not answering.
     */
    evidence: z.ZodEnum<["MEASURED", "USER_PROVIDED", "DERIVED", "MODELLED", "UNKNOWN"]>;
    /** Seconds. Named without a `_seconds` suffix because the unit lives in the field docs, and because
     * `runtime_seconds` is an excluded key in the reproducibility canonicalizer -- a baseline runtime is
     * an *input* to the comparison and must change the hash when it changes. */
    runtime: z.ZodNullable<z.ZodNumber>;
    monetary_cost: z.ZodNullable<z.ZodObject<{
        amount: z.ZodNumber;
        /** ISO 4217. Held separately so two baselines in different currencies are not silently compared. */
        currency: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        amount: number;
        currency: string;
    }, {
        amount: number;
        currency: string;
    }>>;
    /** "AWS c7i.48xlarge, 192 vCPU" or "in-house cluster, 40 nodes". */
    compute_environment: z.ZodString;
    hardware_description: z.ZodString;
    solution_quality: z.ZodNullable<z.ZodObject<{
        /** What is being measured: "approximation ratio", "residual", "rank correlation". */
        metric: z.ZodString;
        value: z.ZodNumber;
        unit: z.ZodOptional<z.ZodString>;
        lower_is_better: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        metric: string;
        value: number;
        unit?: string | undefined;
        lower_is_better: boolean;
    }, {
        metric: string;
        value: number;
        unit?: string | undefined;
        lower_is_better: boolean;
    }>>;
    /** What size of problem this baseline is for. A runtime without one is not comparable to anything. */
    workload_size: z.ZodString;
    /** ISO date. Not excluded from the hash: when a baseline was measured is part of what it claims. */
    measured_on: z.ZodNullable<z.ZodString>;
    evidence_url: z.ZodNullable<z.ZodString>;
    evidence_note: z.ZodNullable<z.ZodString>;
    limitations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
    runtime: number | null;
    monetary_cost: {
        amount: number;
        currency: string;
    } | null;
    compute_environment: string;
    hardware_description: string;
    solution_quality: {
        metric: string;
        value: number;
        unit?: string | undefined;
        lower_is_better: boolean;
    } | null;
    workload_size: string;
    measured_on: string | null;
    evidence_url: string | null;
    evidence_note: string | null;
    limitations: string[];
}, {
    schema_version: string;
    evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
    runtime: number | null;
    monetary_cost: {
        amount: number;
        currency: string;
    } | null;
    compute_environment: string;
    hardware_description: string;
    solution_quality: {
        metric: string;
        value: number;
        unit?: string | undefined;
        lower_is_better: boolean;
    } | null;
    workload_size: string;
    measured_on: string | null;
    evidence_url: string | null;
    evidence_note: string | null;
    limitations: string[];
}>, {
    schema_version: string;
    evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
    runtime: number | null;
    monetary_cost: {
        amount: number;
        currency: string;
    } | null;
    compute_environment: string;
    hardware_description: string;
    solution_quality: {
        metric: string;
        value: number;
        unit?: string | undefined;
        lower_is_better: boolean;
    } | null;
    workload_size: string;
    measured_on: string | null;
    evidence_url: string | null;
    evidence_note: string | null;
    limitations: string[];
}, {
    schema_version: string;
    evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
    runtime: number | null;
    monetary_cost: {
        amount: number;
        currency: string;
    } | null;
    compute_environment: string;
    hardware_description: string;
    solution_quality: {
        metric: string;
        value: number;
        unit?: string | undefined;
        lower_is_better: boolean;
    } | null;
    workload_size: string;
    measured_on: string | null;
    evidence_url: string | null;
    evidence_note: string | null;
    limitations: string[];
}>;
export type ClassicalBaseline = z.infer<typeof ClassicalBaselineSchema>;
/** Whether a runtime comparison is supportable. */
export declare function supportsRuntimeComparison(baseline: ClassicalBaseline | null): boolean;
/** Whether a cost comparison is supportable. Needs the cost *and* a quantum economic model. */
export declare function supportsCostComparison(baseline: ClassicalBaseline | null): boolean;
export declare const INSUFFICIENT_ECONOMIC_EVIDENCE = "Insufficient evidence for economic comparison";
//# sourceMappingURL=baseline.d.ts.map