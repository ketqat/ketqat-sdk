import { z } from "zod";
import { type Quantity } from "./measurement.js";
import { type LayoutModel, type ResourceScenario } from "./scenario.js";
import type { QuantumWorkload } from "./workload.js";
/**
 * Costing one workload under one scenario (ketqat-sdk#236).
 *
 * Everything here composes the existing engine rather than reimplementing it:
 * `requiredCodeDistance` and `logicalErrorPerCycle` from `engine/fault-tolerant`
 * and `requiredLevels` from `engine/distillation`. A second implementation of
 * the same arithmetic would drift from the Workbench panel, and the first
 * symptom would be two pages of this product disagreeing about one circuit.
 *
 * Four things this module does that the engine underneath deliberately does not:
 *
 * **It separates three footprints that are routinely reported as one.** The
 * algorithm's own patches, the routing space a lattice-surgery layout needs, and
 * the distillation factory are computed and reported apart. Their sum is the
 * machine; none of them alone is, and the largest is frequently the factory.
 *
 * **It refuses to total an unknown.** If distillation cannot reach the target
 * state error, the factory footprint is not computable, so the total is reported
 * `UNKNOWN` rather than as the algorithm footprint with a footnote. A total that
 * silently omits its largest term is the specific failure this product exists to
 * prevent.
 *
 * **It costs time twice.** A computation is limited either by how fast logical
 * cycles run or by how fast magic states arrive, and which one binds is the
 * actionable output. Reporting only the cycle-limited runtime attributes a
 * factory bottleneck to the wrong subsystem.
 *
 * **Sensitivity is an output, not an appendix.** Six parameters are varied and
 * reported alongside the point estimate, because the spread across reasonable
 * choices is usually wider than the precision the point estimate appears to
 * carry.
 */
export declare const InfeasibilityCodeSchema: z.ZodEnum<["ABOVE_SURFACE_CODE_THRESHOLD", "NO_DISTANCE_MEETS_BUDGET", "DISTILLATION_FIXED_POINT_EXCEEDED"]>;
export type InfeasibilityCode = z.infer<typeof InfeasibilityCodeSchema>;
export declare const SensitivityParameterSchema: z.ZodEnum<["PHYSICAL_ERROR_RATE", "LOGICAL_ERROR_PREFACTOR", "LAYOUT_MODEL", "CYCLE_TIME", "ERROR_BUDGET", "RAW_MAGIC_STATE_ERROR"]>;
export type SensitivityParameter = z.infer<typeof SensitivityParameterSchema>;
export declare const EstimateSensitivityPointSchema: z.ZodObject<{
    parameter: z.ZodEnum<["PHYSICAL_ERROR_RATE", "LOGICAL_ERROR_PREFACTOR", "LAYOUT_MODEL", "CYCLE_TIME", "ERROR_BUDGET", "RAW_MAGIC_STATE_ERROR"]>;
    /** Human-readable value of the varied parameter: "1e-4", "Bare register". */
    label: z.ZodString;
    /** Numeric value where the parameter is numeric; null for categorical ones. */
    value: z.ZodNullable<z.ZodNumber>;
    /** Ratio to the point estimate's value, so the spread is legible without arithmetic. */
    relative_to_base: z.ZodNullable<z.ZodNumber>;
    feasible: z.ZodBoolean;
    code_distance: z.ZodNullable<z.ZodNumber>;
    total_physical_qubits: z.ZodNullable<z.ZodNumber>;
    runtime: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    parameter: "CYCLE_TIME" | "ERROR_BUDGET" | "LAYOUT_MODEL" | "LOGICAL_ERROR_PREFACTOR" | "PHYSICAL_ERROR_RATE" | "RAW_MAGIC_STATE_ERROR";
    label: string;
    value: number | null;
    relative_to_base: number | null;
    feasible: boolean;
    code_distance: number | null;
    total_physical_qubits: number | null;
    runtime: number | null;
}, {
    parameter: "CYCLE_TIME" | "ERROR_BUDGET" | "LAYOUT_MODEL" | "LOGICAL_ERROR_PREFACTOR" | "PHYSICAL_ERROR_RATE" | "RAW_MAGIC_STATE_ERROR";
    label: string;
    value: number | null;
    relative_to_base: number | null;
    feasible: boolean;
    code_distance: number | null;
    total_physical_qubits: number | null;
    runtime: number | null;
}>;
export type EstimateSensitivityPoint = z.infer<typeof EstimateSensitivityPointSchema>;
export declare const RuntimeLimiterSchema: z.ZodEnum<["LOGICAL_CYCLES", "MAGIC_STATE_THROUGHPUT", "NOT_DETERMINED"]>;
export type RuntimeLimiter = z.infer<typeof RuntimeLimiterSchema>;
export declare const ResourceEstimateSnapshotSchema: z.ZodObject<{
    schema_version: z.ZodString;
    scenario_name: z.ZodString;
    scenario_preset: z.ZodString;
    scenario_revision: z.ZodNumber;
    workload_name: z.ZodString;
    is_demo: z.ZodBoolean;
    feasible: z.ZodBoolean;
    infeasibility_code: z.ZodNullable<z.ZodEnum<["ABOVE_SURFACE_CODE_THRESHOLD", "NO_DISTANCE_MEETS_BUDGET", "DISTILLATION_FIXED_POINT_EXCEEDED"]>>;
    /** Present when infeasible. Explains why no distance helps, rather than giving a large number. */
    infeasibility_reason: z.ZodNullable<z.ZodString>;
    logical_qubits: import("./measurement.js").Contract<Quantity>;
    circuit_depth: import("./measurement.js").Contract<Quantity>;
    gate_count: import("./measurement.js").Contract<Quantity>;
    one_qubit_gate_count: import("./measurement.js").Contract<Quantity>;
    two_qubit_gate_count: import("./measurement.js").Contract<Quantity>;
    clifford_count: import("./measurement.js").Contract<Quantity>;
    t_count: import("./measurement.js").Contract<Quantity>;
    toffoli_count: import("./measurement.js").Contract<Quantity>;
    unsupported_gate_count: import("./measurement.js").Contract<Quantity>;
    measurement_count: import("./measurement.js").Contract<Quantity>;
    reset_count: import("./measurement.js").Contract<Quantity>;
    conditional_count: import("./measurement.js").Contract<Quantity>;
    code_distance: import("./measurement.js").Contract<Quantity>;
    logical_cycles: import("./measurement.js").Contract<Quantity>;
    magic_state_count: import("./measurement.js").Contract<Quantity>;
    raw_magic_state_input_count: import("./measurement.js").Contract<Quantity>;
    distillation_levels: import("./measurement.js").Contract<Quantity>;
    /** The algorithm's own patches. Not the machine size. */
    algorithm_physical_qubits: import("./measurement.js").Contract<Quantity>;
    /** Algorithm patches plus routing space under the scenario's layout model. */
    layout_adjusted_physical_qubits: import("./measurement.js").Contract<Quantity>;
    factory_physical_qubits: import("./measurement.js").Contract<Quantity>;
    /** Layout-adjusted plus factory. The machine. */
    total_physical_qubits: import("./measurement.js").Contract<Quantity>;
    factory_share: import("./measurement.js").Contract<Quantity>;
    /** Logical qubit patches occupied including routing, under the layout model. */
    occupied_logical_qubits: import("./measurement.js").Contract<Quantity>;
    runtime: import("./measurement.js").Contract<Quantity>;
    runtime_cycle_limited: import("./measurement.js").Contract<Quantity>;
    runtime_factory_limited: import("./measurement.js").Contract<Quantity>;
    runtime_limiter: z.ZodEnum<["LOGICAL_CYCLES", "MAGIC_STATE_THROUGHPUT", "NOT_DETERMINED"]>;
    magic_state_throughput: import("./measurement.js").Contract<Quantity>;
    achieved_logical_error_probability: import("./measurement.js").Contract<Quantity>;
    error_budget: import("./measurement.js").Contract<Quantity>;
    sensitivity: z.ZodArray<z.ZodObject<{
        parameter: z.ZodEnum<["PHYSICAL_ERROR_RATE", "LOGICAL_ERROR_PREFACTOR", "LAYOUT_MODEL", "CYCLE_TIME", "ERROR_BUDGET", "RAW_MAGIC_STATE_ERROR"]>;
        /** Human-readable value of the varied parameter: "1e-4", "Bare register". */
        label: z.ZodString;
        /** Numeric value where the parameter is numeric; null for categorical ones. */
        value: z.ZodNullable<z.ZodNumber>;
        /** Ratio to the point estimate's value, so the spread is legible without arithmetic. */
        relative_to_base: z.ZodNullable<z.ZodNumber>;
        feasible: z.ZodBoolean;
        code_distance: z.ZodNullable<z.ZodNumber>;
        total_physical_qubits: z.ZodNullable<z.ZodNumber>;
        runtime: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        parameter: "CYCLE_TIME" | "ERROR_BUDGET" | "LAYOUT_MODEL" | "LOGICAL_ERROR_PREFACTOR" | "PHYSICAL_ERROR_RATE" | "RAW_MAGIC_STATE_ERROR";
        label: string;
        value: number | null;
        relative_to_base: number | null;
        feasible: boolean;
        code_distance: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
    }, {
        parameter: "CYCLE_TIME" | "ERROR_BUDGET" | "LAYOUT_MODEL" | "LOGICAL_ERROR_PREFACTOR" | "PHYSICAL_ERROR_RATE" | "RAW_MAGIC_STATE_ERROR";
        label: string;
        value: number | null;
        relative_to_base: number | null;
        feasible: boolean;
        code_distance: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
    }>, "many">;
    exact_arithmetic: z.ZodArray<z.ZodString, "many">;
    model_assumptions: z.ZodArray<z.ZodString, "many">;
    warnings: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    scenario_name: string;
    scenario_preset: string;
    scenario_revision: number;
    workload_name: string;
    is_demo: boolean;
    feasible: boolean;
    infeasibility_code: "ABOVE_SURFACE_CODE_THRESHOLD" | "DISTILLATION_FIXED_POINT_EXCEEDED" | "NO_DISTANCE_MEETS_BUDGET" | null;
    infeasibility_reason: string | null;
    logical_qubits: Quantity;
    circuit_depth: Quantity;
    gate_count: Quantity;
    one_qubit_gate_count: Quantity;
    two_qubit_gate_count: Quantity;
    clifford_count: Quantity;
    t_count: Quantity;
    toffoli_count: Quantity;
    unsupported_gate_count: Quantity;
    measurement_count: Quantity;
    reset_count: Quantity;
    conditional_count: Quantity;
    code_distance: Quantity;
    logical_cycles: Quantity;
    magic_state_count: Quantity;
    raw_magic_state_input_count: Quantity;
    distillation_levels: Quantity;
    algorithm_physical_qubits: Quantity;
    layout_adjusted_physical_qubits: Quantity;
    factory_physical_qubits: Quantity;
    total_physical_qubits: Quantity;
    factory_share: Quantity;
    occupied_logical_qubits: Quantity;
    runtime: Quantity;
    runtime_cycle_limited: Quantity;
    runtime_factory_limited: Quantity;
    runtime_limiter: "LOGICAL_CYCLES" | "MAGIC_STATE_THROUGHPUT" | "NOT_DETERMINED";
    magic_state_throughput: Quantity;
    achieved_logical_error_probability: Quantity;
    error_budget: Quantity;
    sensitivity: {
        parameter: "CYCLE_TIME" | "ERROR_BUDGET" | "LAYOUT_MODEL" | "LOGICAL_ERROR_PREFACTOR" | "PHYSICAL_ERROR_RATE" | "RAW_MAGIC_STATE_ERROR";
        label: string;
        value: number | null;
        relative_to_base: number | null;
        feasible: boolean;
        code_distance: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
    }[];
    exact_arithmetic: string[];
    model_assumptions: string[];
    warnings: string[];
}, {
    schema_version: string;
    scenario_name: string;
    scenario_preset: string;
    scenario_revision: number;
    workload_name: string;
    is_demo: boolean;
    feasible: boolean;
    infeasibility_code: "ABOVE_SURFACE_CODE_THRESHOLD" | "DISTILLATION_FIXED_POINT_EXCEEDED" | "NO_DISTANCE_MEETS_BUDGET" | null;
    infeasibility_reason: string | null;
    logical_qubits?: unknown;
    circuit_depth?: unknown;
    gate_count?: unknown;
    one_qubit_gate_count?: unknown;
    two_qubit_gate_count?: unknown;
    clifford_count?: unknown;
    t_count?: unknown;
    toffoli_count?: unknown;
    unsupported_gate_count?: unknown;
    measurement_count?: unknown;
    reset_count?: unknown;
    conditional_count?: unknown;
    code_distance?: unknown;
    logical_cycles?: unknown;
    magic_state_count?: unknown;
    raw_magic_state_input_count?: unknown;
    distillation_levels?: unknown;
    algorithm_physical_qubits?: unknown;
    layout_adjusted_physical_qubits?: unknown;
    factory_physical_qubits?: unknown;
    total_physical_qubits?: unknown;
    factory_share?: unknown;
    occupied_logical_qubits?: unknown;
    runtime?: unknown;
    runtime_cycle_limited?: unknown;
    runtime_factory_limited?: unknown;
    runtime_limiter: "LOGICAL_CYCLES" | "MAGIC_STATE_THROUGHPUT" | "NOT_DETERMINED";
    magic_state_throughput?: unknown;
    achieved_logical_error_probability?: unknown;
    error_budget?: unknown;
    sensitivity: {
        parameter: "CYCLE_TIME" | "ERROR_BUDGET" | "LAYOUT_MODEL" | "LOGICAL_ERROR_PREFACTOR" | "PHYSICAL_ERROR_RATE" | "RAW_MAGIC_STATE_ERROR";
        label: string;
        value: number | null;
        relative_to_base: number | null;
        feasible: boolean;
        code_distance: number | null;
        total_physical_qubits: number | null;
        runtime: number | null;
    }[];
    exact_arithmetic: string[];
    model_assumptions: string[];
    warnings: string[];
}>;
export type ResourceEstimateSnapshot = z.infer<typeof ResourceEstimateSnapshotSchema>;
/** Logical qubit patches a register occupies, including routing space. */
export declare function occupiedLogicalQubits(algorithmQubits: number, layout: LayoutModel): number;
/**
 * The bare arithmetic, with no envelopes.
 *
 * Kept separate from the snapshot builder because sensitivity re-runs it dozens
 * of times, and because a function returning plain numbers is one a reader can
 * check against the formulas by hand.
 */
export interface CoreEvaluation {
    feasible: boolean;
    infeasibilityCode: InfeasibilityCode | null;
    infeasibilityReason: string | null;
    codeDistance: number | null;
    logicalCycles: number;
    magicStates: number;
    occupiedLogical: number;
    algorithmPhysical: number | null;
    layoutAdjustedPhysical: number | null;
    factoryPhysical: number | null;
    totalPhysical: number | null;
    factoryShare: number | null;
    distillationLevels: number;
    rawInputStates: number | null;
    distillationReachedTarget: boolean;
    distillationReason: string;
    runtimeCycleLimited: number | null;
    runtimeFactoryLimited: number | null;
    runtime: number | null;
    runtimeLimiter: RuntimeLimiter;
    throughputStatesPerSecond: number | null;
    achievedLogicalError: number | null;
}
export declare function evaluate(workload: QuantumWorkload, scenario: ResourceScenario): CoreEvaluation;
/**
 * Cost one workload under one scenario, with every number in its envelope.
 *
 * Deterministic: the same workload and the same scenario always produce the same
 * snapshot, which is what makes the bundle hash meaningful.
 */
export declare function estimateForScenario(workload: QuantumWorkload, scenario: ResourceScenario): ResourceEstimateSnapshot;
//# sourceMappingURL=estimate.d.ts.map