import { z } from "zod";
import { type LossReportEntry } from "./common.js";
/**
 * Provenance for a single transformation of a quantum program (RFC 0002).
 *
 * The invariant this exists to enforce: a transformation that cannot represent
 * a feature of its input must reject it or record it here. Converting silently
 * is prohibited, because the most common way a quantum result becomes
 * unreproducible is that the circuit that ran is not the circuit the author
 * wrote and nobody recorded the difference.
 */
export declare const TransformationKindSchema: z.ZodEnum<{
    CONVERSION: "CONVERSION";
    EXPORT: "EXPORT";
    IMPORT: "IMPORT";
    LAYOUT: "LAYOUT";
    MITIGATION: "MITIGATION";
    OPTIMIZATION: "OPTIMIZATION";
    ROUTING: "ROUTING";
    TRANSPILATION: "TRANSPILATION";
    ZX_REWRITE: "ZX_REWRITE";
}>;
export type TransformationKind = z.infer<typeof TransformationKindSchema>;
/**
 * Evidence for an equivalence claim.
 *
 * `tolerance` and `global_phase_ignored` are recorded for numerical checks
 * because "equivalent" without a method and a tolerance is not a scientific
 * statement. `INCONCLUSIVE` requires a reason, so that a check which simply
 * timed out is distinguishable from one that was never attempted.
 */
export declare const EquivalenceEvidenceSchema: z.ZodObject<{
    level: z.ZodEnum<{
        FAILED: "FAILED";
        INCONCLUSIVE: "INCONCLUSIVE";
        NOT_CHECKED: "NOT_CHECKED";
        NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
        PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
        SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
    }>;
    method: z.ZodOptional<z.ZodString>;
    tolerance: z.ZodOptional<z.ZodNumber>;
    global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
    qubit_count: z.ZodOptional<z.ZodNumber>;
    counterexample: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EquivalenceEvidence = z.infer<typeof EquivalenceEvidenceSchema>;
export declare const CircuitTransformationSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        CONVERSION: "CONVERSION";
        EXPORT: "EXPORT";
        IMPORT: "IMPORT";
        LAYOUT: "LAYOUT";
        MITIGATION: "MITIGATION";
        OPTIMIZATION: "OPTIMIZATION";
        ROUTING: "ROUTING";
        TRANSPILATION: "TRANSPILATION";
        ZX_REWRITE: "ZX_REWRITE";
    }>;
    adapter: z.ZodString;
    adapter_version: z.ZodString;
    library_version: z.ZodOptional<z.ZodString>;
    options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    input_circuit_hash: z.ZodOptional<z.ZodString>;
    output_circuit_hash: z.ZodOptional<z.ZodString>;
    loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        severity: z.ZodEnum<{
            cosmetic: "cosmetic";
            semantic: "semantic";
            structural: "structural";
        }>;
        action: z.ZodEnum<{
            approximated: "approximated";
            dropped: "dropped";
            rejected: "rejected";
        }>;
        detail: z.ZodString;
        location: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    equivalence: z.ZodOptional<z.ZodObject<{
        level: z.ZodEnum<{
            FAILED: "FAILED";
            INCONCLUSIVE: "INCONCLUSIVE";
            NOT_CHECKED: "NOT_CHECKED";
            NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
            PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
            SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
        }>;
        method: z.ZodOptional<z.ZodString>;
        tolerance: z.ZodOptional<z.ZodNumber>;
        global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
        qubit_count: z.ZodOptional<z.ZodNumber>;
        counterexample: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CircuitTransformation = z.infer<typeof CircuitTransformationSchema>;
/** An ordered chain of transformations, oldest first. */
export declare const TransformationChainSchema: z.ZodArray<z.ZodObject<{
    kind: z.ZodEnum<{
        CONVERSION: "CONVERSION";
        EXPORT: "EXPORT";
        IMPORT: "IMPORT";
        LAYOUT: "LAYOUT";
        MITIGATION: "MITIGATION";
        OPTIMIZATION: "OPTIMIZATION";
        ROUTING: "ROUTING";
        TRANSPILATION: "TRANSPILATION";
        ZX_REWRITE: "ZX_REWRITE";
    }>;
    adapter: z.ZodString;
    adapter_version: z.ZodString;
    library_version: z.ZodOptional<z.ZodString>;
    options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    input_circuit_hash: z.ZodOptional<z.ZodString>;
    output_circuit_hash: z.ZodOptional<z.ZodString>;
    loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        severity: z.ZodEnum<{
            cosmetic: "cosmetic";
            semantic: "semantic";
            structural: "structural";
        }>;
        action: z.ZodEnum<{
            approximated: "approximated";
            dropped: "dropped";
            rejected: "rejected";
        }>;
        detail: z.ZodString;
        location: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    equivalence: z.ZodOptional<z.ZodObject<{
        level: z.ZodEnum<{
            FAILED: "FAILED";
            INCONCLUSIVE: "INCONCLUSIVE";
            NOT_CHECKED: "NOT_CHECKED";
            NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
            PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
            SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
        }>;
        method: z.ZodOptional<z.ZodString>;
        tolerance: z.ZodOptional<z.ZodNumber>;
        global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
        qubit_count: z.ZodOptional<z.ZodNumber>;
        counterexample: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export type TransformationChain = z.infer<typeof TransformationChainSchema>;
export declare function hasSemanticLoss(entries: LossReportEntry[]): boolean;
/**
 * True when any step in the chain lost semantic content.
 *
 * Comparison code uses this: a run whose circuit reached its final form through
 * a semantically lossy conversion is not silently comparable with one that did
 * not, because the two runs no longer describe the same program.
 */
export declare function chainHasSemanticLoss(chain: TransformationChain): boolean;
//# sourceMappingURL=transformation.d.ts.map