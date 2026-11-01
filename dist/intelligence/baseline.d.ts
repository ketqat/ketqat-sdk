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
    metric: z.ZodString;
    value: z.ZodNumber;
    unit: z.ZodOptional<z.ZodString>;
    lower_is_better: z.ZodBoolean;
}, z.core.$strip>;
export type SolutionQuality = z.infer<typeof SolutionQualitySchema>;
export declare const MonetaryAmountSchema: z.ZodObject<{
    amount: z.ZodNumber;
    currency: z.ZodString;
}, z.core.$strip>;
export type MonetaryAmount = z.infer<typeof MonetaryAmountSchema>;
export declare const ClassicalBaselineSchema: z.ZodObject<{
    schema_version: z.ZodString;
    evidence: z.ZodEnum<{
        DERIVED: "DERIVED";
        MEASURED: "MEASURED";
        MODELLED: "MODELLED";
        UNKNOWN: "UNKNOWN";
        USER_PROVIDED: "USER_PROVIDED";
    }>;
    runtime: z.ZodNullable<z.ZodNumber>;
    monetary_cost: z.ZodNullable<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodString;
    }, z.core.$strip>>;
    compute_environment: z.ZodString;
    hardware_description: z.ZodString;
    solution_quality: z.ZodNullable<z.ZodObject<{
        metric: z.ZodString;
        value: z.ZodNumber;
        unit: z.ZodOptional<z.ZodString>;
        lower_is_better: z.ZodBoolean;
    }, z.core.$strip>>;
    workload_size: z.ZodString;
    measured_on: z.ZodNullable<z.ZodString>;
    evidence_url: z.ZodNullable<z.ZodString>;
    evidence_note: z.ZodNullable<z.ZodString>;
    limitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ClassicalBaseline = z.infer<typeof ClassicalBaselineSchema>;
/** Whether a runtime comparison is supportable. */
export declare function supportsRuntimeComparison(baseline: ClassicalBaseline | null): boolean;
/** Whether a cost comparison is supportable. Needs the cost *and* a quantum economic model. */
export declare function supportsCostComparison(baseline: ClassicalBaseline | null): boolean;
export declare const INSUFFICIENT_ECONOMIC_EVIDENCE = "Insufficient evidence for economic comparison";
//# sourceMappingURL=baseline.d.ts.map