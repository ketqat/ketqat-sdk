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
export declare const WorkloadSourceKindSchema: z.ZodEnum<["OPENQASM3", "KETQAT_WORKBENCH_CIRCUIT", "KETQAT_ARTIFACT", "KETQAT_RUN", "MANUAL_LOGICAL_COUNTS", "ALGORITHM_FAMILY"]>;
export type WorkloadSourceKind = z.infer<typeof WorkloadSourceKindSchema>;
export declare const WorkloadSourceSchema: z.ZodEffects<z.ZodObject<{
    kind: z.ZodEnum<["OPENQASM3", "KETQAT_WORKBENCH_CIRCUIT", "KETQAT_ARTIFACT", "KETQAT_RUN", "MANUAL_LOGICAL_COUNTS", "ALGORITHM_FAMILY"]>;
    /** Slug, family name, or file name, depending on `kind`. */
    reference: z.ZodOptional<z.ZodString>;
    /**
     * The circuit itself, when the workload came from one.
     *
     * Stored so the estimate can be recomputed from the same input rather than
     * trusted. A bundle whose counts cannot be re-derived is a claim, not a
     * record.
     */
    openqasm3: z.ZodOptional<z.ZodString>;
    /** SHA-256 of the source text, when there is source text. */
    source_digest: z.ZodOptional<z.ZodString>;
    /** Citation for counts taken from a publication. */
    citation: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
    reference?: string | undefined;
    openqasm3?: string | undefined;
    source_digest?: string | undefined;
    citation?: string | undefined;
}, {
    kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
    reference?: string | undefined;
    openqasm3?: string | undefined;
    source_digest?: string | undefined;
    citation?: string | undefined;
}>, {
    kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
    reference?: string | undefined;
    openqasm3?: string | undefined;
    source_digest?: string | undefined;
    citation?: string | undefined;
}, {
    kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
    reference?: string | undefined;
    openqasm3?: string | undefined;
    source_digest?: string | undefined;
    citation?: string | undefined;
}>;
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
    /** Gates needing synthesis into Clifford+T before fault-tolerant costing. */
    unsupported_for_ft_count: z.ZodNumber;
    measurement_count: z.ZodNumber;
    reset_count: z.ZodNumber;
    conditional_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    logical_qubits: number;
    circuit_depth: number;
    gate_count: number;
    one_qubit_gate_count: number;
    two_qubit_gate_count: number;
    clifford_count: number;
    t_count: number;
    toffoli_count: number;
    unsupported_for_ft_count: number;
    measurement_count: number;
    reset_count: number;
    conditional_count: number;
}, {
    logical_qubits: number;
    circuit_depth: number;
    gate_count: number;
    one_qubit_gate_count: number;
    two_qubit_gate_count: number;
    clifford_count: number;
    t_count: number;
    toffoli_count: number;
    unsupported_for_ft_count: number;
    measurement_count: number;
    reset_count: number;
    conditional_count: number;
}>;
export type LogicalResourceCounts = z.infer<typeof LogicalResourceCountsSchema>;
export declare const ProblemSizeSchema: z.ZodObject<{
    description: z.ZodString;
    value: z.ZodOptional<z.ZodNumber>;
    unit: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    value?: number | undefined;
    unit?: string | undefined;
}, {
    description: string;
    value?: number | undefined;
    unit?: string | undefined;
}>;
export type ProblemSize = z.infer<typeof ProblemSizeSchema>;
export declare const QuantumWorkloadSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    /**
     * Marks a fixture. Carried through every derived record and every report, so
     * a demonstration cannot be quoted as a finding.
     */
    is_demo: z.ZodBoolean;
    source: z.ZodEffects<z.ZodObject<{
        kind: z.ZodEnum<["OPENQASM3", "KETQAT_WORKBENCH_CIRCUIT", "KETQAT_ARTIFACT", "KETQAT_RUN", "MANUAL_LOGICAL_COUNTS", "ALGORITHM_FAMILY"]>;
        /** Slug, family name, or file name, depending on `kind`. */
        reference: z.ZodOptional<z.ZodString>;
        /**
         * The circuit itself, when the workload came from one.
         *
         * Stored so the estimate can be recomputed from the same input rather than
         * trusted. A bundle whose counts cannot be re-derived is a claim, not a
         * record.
         */
        openqasm3: z.ZodOptional<z.ZodString>;
        /** SHA-256 of the source text, when there is source text. */
        source_digest: z.ZodOptional<z.ZodString>;
        /** Citation for counts taken from a publication. */
        citation: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    }, {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    }>, {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    }, {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    }>;
    logical: z.ZodObject<{
        logical_qubits: z.ZodNumber;
        circuit_depth: z.ZodNumber;
        gate_count: z.ZodNumber;
        one_qubit_gate_count: z.ZodNumber;
        two_qubit_gate_count: z.ZodNumber;
        clifford_count: z.ZodNumber;
        t_count: z.ZodNumber;
        toffoli_count: z.ZodNumber;
        /** Gates needing synthesis into Clifford+T before fault-tolerant costing. */
        unsupported_for_ft_count: z.ZodNumber;
        measurement_count: z.ZodNumber;
        reset_count: z.ZodNumber;
        conditional_count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        logical_qubits: number;
        circuit_depth: number;
        gate_count: number;
        one_qubit_gate_count: number;
        two_qubit_gate_count: number;
        clifford_count: number;
        t_count: number;
        toffoli_count: number;
        unsupported_for_ft_count: number;
        measurement_count: number;
        reset_count: number;
        conditional_count: number;
    }, {
        logical_qubits: number;
        circuit_depth: number;
        gate_count: number;
        one_qubit_gate_count: number;
        two_qubit_gate_count: number;
        clifford_count: number;
        t_count: number;
        toffoli_count: number;
        unsupported_for_ft_count: number;
        measurement_count: number;
        reset_count: number;
        conditional_count: number;
    }>;
    /**
     * How the counts were obtained.
     *
     * `MEASURED` is not accepted: a gate count is not a measurement of anything.
     * Parsing a circuit yields `DERIVED`; typing numbers in yields
     * `USER_PROVIDED`; a published analysis yields `USER_PROVIDED` with a
     * citation on the source.
     */
    logical_counts_evidence: z.ZodEffects<z.ZodEnum<["MEASURED", "USER_PROVIDED", "DERIVED", "MODELLED", "UNKNOWN"]>, "DERIVED" | "MODELLED" | "USER_PROVIDED", "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED">;
    problem_size: z.ZodOptional<z.ZodObject<{
        description: z.ZodString;
        value: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        value?: number | undefined;
        unit?: string | undefined;
    }, {
        description: string;
        value?: number | undefined;
        unit?: string | undefined;
    }>>;
    /** The gate set the counts were taken over, so two workloads are comparable or not. */
    gate_set: z.ZodArray<z.ZodString, "many">;
    notes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    name: string;
    description: string;
    is_demo: boolean;
    source: {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    };
    logical: {
        logical_qubits: number;
        circuit_depth: number;
        gate_count: number;
        one_qubit_gate_count: number;
        two_qubit_gate_count: number;
        clifford_count: number;
        t_count: number;
        toffoli_count: number;
        unsupported_for_ft_count: number;
        measurement_count: number;
        reset_count: number;
        conditional_count: number;
    };
    logical_counts_evidence: "DERIVED" | "MODELLED" | "USER_PROVIDED";
    problem_size?: {
        description: string;
        value?: number | undefined;
        unit?: string | undefined;
    } | undefined;
    gate_set: string[];
    notes: string[];
}, {
    schema_version: string;
    name: string;
    description: string;
    is_demo: boolean;
    source: {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    };
    logical: {
        logical_qubits: number;
        circuit_depth: number;
        gate_count: number;
        one_qubit_gate_count: number;
        two_qubit_gate_count: number;
        clifford_count: number;
        t_count: number;
        toffoli_count: number;
        unsupported_for_ft_count: number;
        measurement_count: number;
        reset_count: number;
        conditional_count: number;
    };
    logical_counts_evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
    problem_size?: {
        description: string;
        value?: number | undefined;
        unit?: string | undefined;
    } | undefined;
    gate_set: string[];
    notes: string[];
}>, {
    schema_version: string;
    name: string;
    description: string;
    is_demo: boolean;
    source: {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    };
    logical: {
        logical_qubits: number;
        circuit_depth: number;
        gate_count: number;
        one_qubit_gate_count: number;
        two_qubit_gate_count: number;
        clifford_count: number;
        t_count: number;
        toffoli_count: number;
        unsupported_for_ft_count: number;
        measurement_count: number;
        reset_count: number;
        conditional_count: number;
    };
    logical_counts_evidence: "DERIVED" | "MODELLED" | "USER_PROVIDED";
    problem_size?: {
        description: string;
        value?: number | undefined;
        unit?: string | undefined;
    } | undefined;
    gate_set: string[];
    notes: string[];
}, {
    schema_version: string;
    name: string;
    description: string;
    is_demo: boolean;
    source: {
        kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
        reference?: string | undefined;
        openqasm3?: string | undefined;
        source_digest?: string | undefined;
        citation?: string | undefined;
    };
    logical: {
        logical_qubits: number;
        circuit_depth: number;
        gate_count: number;
        one_qubit_gate_count: number;
        two_qubit_gate_count: number;
        clifford_count: number;
        t_count: number;
        toffoli_count: number;
        unsupported_for_ft_count: number;
        measurement_count: number;
        reset_count: number;
        conditional_count: number;
    };
    logical_counts_evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
    problem_size?: {
        description: string;
        value?: number | undefined;
        unit?: string | undefined;
    } | undefined;
    gate_set: string[];
    notes: string[];
}>;
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