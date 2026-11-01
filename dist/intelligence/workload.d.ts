import { z } from "zod";
import type { NormalizedResourceEstimate } from "../engine/resources.js";
/**
 * What is being costed (ketqat-sdk#236).
 *
 * A resource estimate is only as meaningful as the statement of what was
 * estimated, and that statement has two halves that are routinely conflated: the
 * logical gate counts, and where those counts came from. A T count parsed from a
 * circuit and a T count typed into a form are the same integer and completely
 * different evidence, so `logical_counts_evidence` is required rather than
 * inferred.
 *
 * The source is recorded structurally rather than as prose. `MANUAL_LOGICAL_COUNTS`
 * is a legitimate input -- most people costing a future algorithm have counts
 * from a paper, not a circuit -- but a bundle built from typed-in numbers must
 * not be indistinguishable from one built by parsing a circuit this project can
 * re-parse.
 */
export declare const WorkloadSourceKindSchema: z.ZodEnum<{
    ALGORITHM_FAMILY: "ALGORITHM_FAMILY";
    KETQAT_ARTIFACT: "KETQAT_ARTIFACT";
    KETQAT_RUN: "KETQAT_RUN";
    KETQAT_WORKBENCH_CIRCUIT: "KETQAT_WORKBENCH_CIRCUIT";
    MANUAL_LOGICAL_COUNTS: "MANUAL_LOGICAL_COUNTS";
    OPENQASM3: "OPENQASM3";
}>;
export type WorkloadSourceKind = z.infer<typeof WorkloadSourceKindSchema>;
export declare const WorkloadSourceSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        ALGORITHM_FAMILY: "ALGORITHM_FAMILY";
        KETQAT_ARTIFACT: "KETQAT_ARTIFACT";
        KETQAT_RUN: "KETQAT_RUN";
        KETQAT_WORKBENCH_CIRCUIT: "KETQAT_WORKBENCH_CIRCUIT";
        MANUAL_LOGICAL_COUNTS: "MANUAL_LOGICAL_COUNTS";
        OPENQASM3: "OPENQASM3";
    }>;
    reference: z.ZodOptional<z.ZodString>;
    openqasm3: z.ZodOptional<z.ZodString>;
    source_digest: z.ZodOptional<z.ZodString>;
    citation: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type WorkloadSource = z.infer<typeof WorkloadSourceSchema>;
/**
 * Logical resources, before any error correction.
 *
 * These are counts over the circuit as written. `unsupported_for_ft_count` is
 * carried rather than folded away because a non-Clifford, non-T gate makes the T
 * count an *underestimate*, and an estimate built on an underestimate that
 * presents itself as complete is worse than one that refuses.
 */
export declare const LogicalResourceCountsSchema: z.ZodObject<{
    logical_qubits: z.ZodNumber;
    circuit_depth: z.ZodNumber;
    gate_count: z.ZodNumber;
    one_qubit_gate_count: z.ZodNumber;
    two_qubit_gate_count: z.ZodNumber;
    clifford_count: z.ZodNumber;
    t_count: z.ZodNumber;
    toffoli_count: z.ZodNumber;
    unsupported_for_ft_count: z.ZodNumber;
    measurement_count: z.ZodNumber;
    reset_count: z.ZodNumber;
    conditional_count: z.ZodNumber;
}, z.core.$strip>;
export type LogicalResourceCounts = z.infer<typeof LogicalResourceCountsSchema>;
export declare const ProblemSizeSchema: z.ZodObject<{
    description: z.ZodString;
    value: z.ZodOptional<z.ZodNumber>;
    unit: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProblemSize = z.infer<typeof ProblemSizeSchema>;
export declare const QuantumWorkloadSchema: z.ZodObject<{
    schema_version: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    is_demo: z.ZodBoolean;
    source: z.ZodObject<{
        kind: z.ZodEnum<{
            ALGORITHM_FAMILY: "ALGORITHM_FAMILY";
            KETQAT_ARTIFACT: "KETQAT_ARTIFACT";
            KETQAT_RUN: "KETQAT_RUN";
            KETQAT_WORKBENCH_CIRCUIT: "KETQAT_WORKBENCH_CIRCUIT";
            MANUAL_LOGICAL_COUNTS: "MANUAL_LOGICAL_COUNTS";
            OPENQASM3: "OPENQASM3";
        }>;
        reference: z.ZodOptional<z.ZodString>;
        openqasm3: z.ZodOptional<z.ZodString>;
        source_digest: z.ZodOptional<z.ZodString>;
        citation: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    logical: z.ZodObject<{
        logical_qubits: z.ZodNumber;
        circuit_depth: z.ZodNumber;
        gate_count: z.ZodNumber;
        one_qubit_gate_count: z.ZodNumber;
        two_qubit_gate_count: z.ZodNumber;
        clifford_count: z.ZodNumber;
        t_count: z.ZodNumber;
        toffoli_count: z.ZodNumber;
        unsupported_for_ft_count: z.ZodNumber;
        measurement_count: z.ZodNumber;
        reset_count: z.ZodNumber;
        conditional_count: z.ZodNumber;
    }, z.core.$strip>;
    logical_counts_evidence: z.ZodEnum<{
        DERIVED: "DERIVED";
        MEASURED: "MEASURED";
        MODELLED: "MODELLED";
        UNKNOWN: "UNKNOWN";
        USER_PROVIDED: "USER_PROVIDED";
    }> & z.ZodType<"DERIVED" | "MODELLED" | "USER_PROVIDED", "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED", z.core.$ZodTypeInternals<"DERIVED" | "MODELLED" | "USER_PROVIDED", "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED">>;
    problem_size: z.ZodOptional<z.ZodObject<{
        description: z.ZodString;
        value: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    gate_set: z.ZodArray<z.ZodString>;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type QuantumWorkload = z.infer<typeof QuantumWorkloadSchema>;
/**
 * Build a workload from a parsed circuit's normalized resource estimate.
 *
 * The counts come from `estimateResources`, which is the same function the
 * Workbench displays, so the assessment and the Workbench panel cannot disagree
 * about what the circuit contains.
 */
export declare function workloadFromResourceEstimate(input: {
    name: string;
    description: string;
    source: WorkloadSource;
    estimate: NormalizedResourceEstimate;
    isDemo: boolean;
    problemSize?: ProblemSize;
    notes?: string[];
}): QuantumWorkload;
//# sourceMappingURL=workload.d.ts.map