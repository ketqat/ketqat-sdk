import { z } from "zod";
import { EquivalenceLevelSchema, LossReportEntrySchema, } from "./common.js";
/**
 * Provenance for a single transformation of a quantum program (RFC 0002).
 *
 * The invariant this exists to enforce: a transformation that cannot represent
 * a feature of its input must reject it or record it here. Converting silently
 * is prohibited, because the most common way a quantum result becomes
 * unreproducible is that the circuit that ran is not the circuit the author
 * wrote and nobody recorded the difference.
 */
export const TransformationKindSchema = z.enum([
    "IMPORT",
    "EXPORT",
    "CONVERSION",
    "TRANSPILATION",
    "OPTIMIZATION",
    "ZX_REWRITE",
    "MITIGATION",
    "LAYOUT",
    "ROUTING",
]);
/**
 * Evidence for an equivalence claim.
 *
 * `tolerance` and `global_phase_ignored` are recorded for numerical checks
 * because "equivalent" without a method and a tolerance is not a scientific
 * statement. `INCONCLUSIVE` requires a reason, so that a check which simply
 * timed out is distinguishable from one that was never attempted.
 */
export const EquivalenceEvidenceSchema = z
    .object({
    level: EquivalenceLevelSchema,
    method: z.string().min(1).optional(),
    tolerance: z.number().nonnegative().optional(),
    global_phase_ignored: z.boolean().optional(),
    qubit_count: z.number().int().positive().optional(),
    /** Required for FAILED: what distinguishes the two programs. */
    counterexample: z.string().min(1).optional(),
    /** Required for INCONCLUSIVE: why the check did not decide. */
    reason: z.string().min(1).optional(),
})
    .superRefine((evidence, context) => {
    if (evidence.level === "FAILED" && evidence.counterexample === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["counterexample"],
            message: "FAILED requires a counterexample. Without one the correct level is INCONCLUSIVE: " +
                "failing to prove equality is not proving inequality.",
        });
    }
    if (evidence.level === "INCONCLUSIVE" && evidence.reason === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reason"],
            message: "INCONCLUSIVE requires a reason so it is distinguishable from NOT_CHECKED.",
        });
    }
    if (evidence.level === "NUMERICALLY_CHECKED" && evidence.tolerance === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tolerance"],
            message: "NUMERICALLY_CHECKED requires a tolerance.",
        });
    }
});
export const CircuitTransformationSchema = z.object({
    kind: TransformationKindSchema,
    /** Adapter that performed the transformation, e.g. "openqasm3", "qiskit-transpiler". */
    adapter: z.string().min(1),
    adapter_version: z.string().min(1),
    /** Version of the underlying library, when it differs from the adapter's own version. */
    library_version: z.string().min(1).optional(),
    options: z.record(z.unknown()).default({}),
    input_circuit_hash: z.string().min(1).optional(),
    output_circuit_hash: z.string().min(1).optional(),
    loss_report: z.array(LossReportEntrySchema).default([]),
    equivalence: EquivalenceEvidenceSchema.optional(),
});
/** An ordered chain of transformations, oldest first. */
export const TransformationChainSchema = z.array(CircuitTransformationSchema);
export function hasSemanticLoss(entries) {
    return entries.some((entry) => entry.severity === "semantic");
}
/**
 * True when any step in the chain lost semantic content.
 *
 * Comparison code uses this: a run whose circuit reached its final form through
 * a semantically lossy conversion is not silently comparable with one that did
 * not, because the two runs no longer describe the same program.
 */
export function chainHasSemanticLoss(chain) {
    return chain.some((step) => hasSemanticLoss(step.loss_report));
}
//# sourceMappingURL=transformation.js.map