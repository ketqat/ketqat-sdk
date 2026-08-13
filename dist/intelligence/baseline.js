import { z } from "zod";
import { EvidenceClassSchema } from "./measurement.js";
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
export const SolutionQualitySchema = z.object({
    /** What is being measured: "approximation ratio", "residual", "rank correlation". */
    metric: z.string().min(1),
    value: z.number(),
    unit: z.string().min(1).optional(),
    lower_is_better: z.boolean(),
});
export const MonetaryAmountSchema = z.object({
    amount: z.number().nonnegative(),
    /** ISO 4217. Held separately so two baselines in different currencies are not silently compared. */
    currency: z.string().regex(/^[A-Z]{3}$/),
});
export const ClassicalBaselineSchema = z
    .object({
    schema_version: z.string().min(1),
    /**
     * How this baseline was obtained. `UNKNOWN` is representable so a user can
     * record that they do not know, which is different from not answering.
     */
    evidence: EvidenceClassSchema,
    /** Seconds. Named without a `_seconds` suffix because the unit lives in the field docs, and because
     * `runtime_seconds` is an excluded key in the reproducibility canonicalizer -- a baseline runtime is
     * an *input* to the comparison and must change the hash when it changes. */
    runtime: z.number().positive().nullable(),
    monetary_cost: MonetaryAmountSchema.nullable(),
    /** "AWS c7i.48xlarge, 192 vCPU" or "in-house cluster, 40 nodes". */
    compute_environment: z.string().min(1),
    hardware_description: z.string().min(1),
    solution_quality: SolutionQualitySchema.nullable(),
    /** What size of problem this baseline is for. A runtime without one is not comparable to anything. */
    workload_size: z.string().min(1),
    /** ISO date. Not excluded from the hash: when a baseline was measured is part of what it claims. */
    measured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    evidence_url: z.string().url().nullable(),
    evidence_note: z.string().min(1).nullable(),
    limitations: z.array(z.string().min(1)),
})
    .superRefine((baseline, context) => {
    if (baseline.evidence === "UNKNOWN" && (baseline.runtime !== null || baseline.monetary_cost !== null)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A baseline classified UNKNOWN cannot carry a runtime or a cost. If a number is known, say how it was obtained.",
            path: ["evidence"],
        });
    }
    if (baseline.evidence === "MEASURED" && baseline.measured_on === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A MEASURED baseline must record when it was measured. Classical hardware improves; an undated measurement " +
                "cannot be checked and will be quoted years after it stopped being true.",
            path: ["measured_on"],
        });
    }
    if (baseline.evidence === "MEASURED" && baseline.evidence_url === null && baseline.evidence_note === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A MEASURED baseline must point at its evidence, by URL or by note.",
            path: ["evidence_note"],
        });
    }
    if (baseline.runtime === null && baseline.monetary_cost === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A baseline with neither a runtime nor a cost supports no comparison. Omit the baseline entirely rather than " +
                "storing an empty one -- an empty baseline present in a report reads as a comparison that was made.",
            path: ["runtime"],
        });
    }
});
/** Whether a runtime comparison is supportable. */
export function supportsRuntimeComparison(baseline) {
    return baseline !== null && baseline.runtime !== null && baseline.evidence !== "UNKNOWN";
}
/** Whether a cost comparison is supportable. Needs the cost *and* a quantum economic model. */
export function supportsCostComparison(baseline) {
    return baseline !== null && baseline.monetary_cost !== null && baseline.evidence !== "UNKNOWN";
}
export const INSUFFICIENT_ECONOMIC_EVIDENCE = "Insufficient evidence for economic comparison";
//# sourceMappingURL=baseline.js.map