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
export declare const TransformationKindSchema: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
export type TransformationKind = z.infer<typeof TransformationKindSchema>;
/**
 * Evidence for an equivalence claim.
 *
 * `tolerance` and `global_phase_ignored` are recorded for numerical checks
 * because "equivalent" without a method and a tolerance is not a scientific
 * statement. `INCONCLUSIVE` requires a reason, so that a check which simply
 * timed out is distinguishable from one that was never attempted.
 */
export declare const EquivalenceEvidenceSchema: z.ZodEffects<z.ZodObject<{
    level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
    method: z.ZodOptional<z.ZodString>;
    tolerance: z.ZodOptional<z.ZodNumber>;
    global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
    qubit_count: z.ZodOptional<z.ZodNumber>;
    /** Required for FAILED: what distinguishes the two programs. */
    counterexample: z.ZodOptional<z.ZodString>;
    /** Required for INCONCLUSIVE: why the check did not decide. */
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
    method?: string | undefined;
    tolerance?: number | undefined;
    global_phase_ignored?: boolean | undefined;
    qubit_count?: number | undefined;
    counterexample?: string | undefined;
    reason?: string | undefined;
}, {
    level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
    method?: string | undefined;
    tolerance?: number | undefined;
    global_phase_ignored?: boolean | undefined;
    qubit_count?: number | undefined;
    counterexample?: string | undefined;
    reason?: string | undefined;
}>, {
    level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
    method?: string | undefined;
    tolerance?: number | undefined;
    global_phase_ignored?: boolean | undefined;
    qubit_count?: number | undefined;
    counterexample?: string | undefined;
    reason?: string | undefined;
}, {
    level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
    method?: string | undefined;
    tolerance?: number | undefined;
    global_phase_ignored?: boolean | undefined;
    qubit_count?: number | undefined;
    counterexample?: string | undefined;
    reason?: string | undefined;
}>;
export type EquivalenceEvidence = z.infer<typeof EquivalenceEvidenceSchema>;
export declare const CircuitTransformationSchema: z.ZodObject<{
    kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
    /** Adapter that performed the transformation, e.g. "openqasm3", "qiskit-transpiler". */
    adapter: z.ZodString;
    adapter_version: z.ZodString;
    /** Version of the underlying library, when it differs from the adapter's own version. */
    library_version: z.ZodOptional<z.ZodString>;
    options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    input_circuit_hash: z.ZodOptional<z.ZodString>;
    output_circuit_hash: z.ZodOptional<z.ZodString>;
    loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
        action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
        detail: z.ZodString;
        location: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }, {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }>, "many">>;
    equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
        method: z.ZodOptional<z.ZodString>;
        tolerance: z.ZodOptional<z.ZodNumber>;
        global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
        qubit_count: z.ZodOptional<z.ZodNumber>;
        /** Required for FAILED: what distinguishes the two programs. */
        counterexample: z.ZodOptional<z.ZodString>;
        /** Required for INCONCLUSIVE: why the check did not decide. */
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }>, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    options: Record<string, unknown>;
    kind: "IMPORT" | "EXPORT" | "CONVERSION" | "TRANSPILATION" | "OPTIMIZATION" | "ZX_REWRITE" | "MITIGATION" | "LAYOUT" | "ROUTING";
    adapter: string;
    adapter_version: string;
    loss_report: {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }[];
    library_version?: string | undefined;
    input_circuit_hash?: string | undefined;
    output_circuit_hash?: string | undefined;
    equivalence?: {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    } | undefined;
}, {
    kind: "IMPORT" | "EXPORT" | "CONVERSION" | "TRANSPILATION" | "OPTIMIZATION" | "ZX_REWRITE" | "MITIGATION" | "LAYOUT" | "ROUTING";
    adapter: string;
    adapter_version: string;
    options?: Record<string, unknown> | undefined;
    library_version?: string | undefined;
    input_circuit_hash?: string | undefined;
    output_circuit_hash?: string | undefined;
    loss_report?: {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }[] | undefined;
    equivalence?: {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    } | undefined;
}>;
export type CircuitTransformation = z.infer<typeof CircuitTransformationSchema>;
/** An ordered chain of transformations, oldest first. */
export declare const TransformationChainSchema: z.ZodArray<z.ZodObject<{
    kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
    /** Adapter that performed the transformation, e.g. "openqasm3", "qiskit-transpiler". */
    adapter: z.ZodString;
    adapter_version: z.ZodString;
    /** Version of the underlying library, when it differs from the adapter's own version. */
    library_version: z.ZodOptional<z.ZodString>;
    options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    input_circuit_hash: z.ZodOptional<z.ZodString>;
    output_circuit_hash: z.ZodOptional<z.ZodString>;
    loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
        feature: z.ZodString;
        severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
        action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
        detail: z.ZodString;
        location: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }, {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }>, "many">>;
    equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
        method: z.ZodOptional<z.ZodString>;
        tolerance: z.ZodOptional<z.ZodNumber>;
        global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
        qubit_count: z.ZodOptional<z.ZodNumber>;
        /** Required for FAILED: what distinguishes the two programs. */
        counterexample: z.ZodOptional<z.ZodString>;
        /** Required for INCONCLUSIVE: why the check did not decide. */
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }>, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }, {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    options: Record<string, unknown>;
    kind: "IMPORT" | "EXPORT" | "CONVERSION" | "TRANSPILATION" | "OPTIMIZATION" | "ZX_REWRITE" | "MITIGATION" | "LAYOUT" | "ROUTING";
    adapter: string;
    adapter_version: string;
    loss_report: {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }[];
    library_version?: string | undefined;
    input_circuit_hash?: string | undefined;
    output_circuit_hash?: string | undefined;
    equivalence?: {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    } | undefined;
}, {
    kind: "IMPORT" | "EXPORT" | "CONVERSION" | "TRANSPILATION" | "OPTIMIZATION" | "ZX_REWRITE" | "MITIGATION" | "LAYOUT" | "ROUTING";
    adapter: string;
    adapter_version: string;
    options?: Record<string, unknown> | undefined;
    library_version?: string | undefined;
    input_circuit_hash?: string | undefined;
    output_circuit_hash?: string | undefined;
    loss_report?: {
        feature: string;
        severity: "semantic" | "structural" | "cosmetic";
        action: "rejected" | "dropped" | "approximated";
        detail: string;
        location?: string | undefined;
    }[] | undefined;
    equivalence?: {
        level: "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "SYMBOLICALLY_REDUCED" | "PROVED_BY_SUPPORTED_REWRITE" | "FAILED" | "INCONCLUSIVE";
        method?: string | undefined;
        tolerance?: number | undefined;
        global_phase_ignored?: boolean | undefined;
        qubit_count?: number | undefined;
        counterexample?: string | undefined;
        reason?: string | undefined;
    } | undefined;
}>, "many">;
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