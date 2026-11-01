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
export declare const InfeasibilityCodeSchema: z.ZodEnum<{
    ABOVE_SURFACE_CODE_THRESHOLD: "ABOVE_SURFACE_CODE_THRESHOLD";
    DISTILLATION_FIXED_POINT_EXCEEDED: "DISTILLATION_FIXED_POINT_EXCEEDED";
    NO_DISTANCE_MEETS_BUDGET: "NO_DISTANCE_MEETS_BUDGET";
}>;
export type InfeasibilityCode = z.infer<typeof InfeasibilityCodeSchema>;
export declare const SensitivityParameterSchema: z.ZodEnum<{
    CYCLE_TIME: "CYCLE_TIME";
    ERROR_BUDGET: "ERROR_BUDGET";
    LAYOUT_MODEL: "LAYOUT_MODEL";
    LOGICAL_ERROR_PREFACTOR: "LOGICAL_ERROR_PREFACTOR";
    PHYSICAL_ERROR_RATE: "PHYSICAL_ERROR_RATE";
    RAW_MAGIC_STATE_ERROR: "RAW_MAGIC_STATE_ERROR";
}>;
export type SensitivityParameter = z.infer<typeof SensitivityParameterSchema>;
export declare const EstimateSensitivityPointSchema: z.ZodObject<{
    parameter: z.ZodEnum<{
        CYCLE_TIME: "CYCLE_TIME";
        ERROR_BUDGET: "ERROR_BUDGET";
        LAYOUT_MODEL: "LAYOUT_MODEL";
        LOGICAL_ERROR_PREFACTOR: "LOGICAL_ERROR_PREFACTOR";
        PHYSICAL_ERROR_RATE: "PHYSICAL_ERROR_RATE";
        RAW_MAGIC_STATE_ERROR: "RAW_MAGIC_STATE_ERROR";
    }>;
    label: z.ZodString;
    value: z.ZodNullable<z.ZodNumber>;
    relative_to_base: z.ZodNullable<z.ZodNumber>;
    feasible: z.ZodBoolean;
    code_distance: z.ZodNullable<z.ZodNumber>;
    total_physical_qubits: z.ZodNullable<z.ZodNumber>;
    runtime: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type EstimateSensitivityPoint = z.infer<typeof EstimateSensitivityPointSchema>;
export declare const RuntimeLimiterSchema: z.ZodEnum<{
    LOGICAL_CYCLES: "LOGICAL_CYCLES";
    MAGIC_STATE_THROUGHPUT: "MAGIC_STATE_THROUGHPUT";
    NOT_DETERMINED: "NOT_DETERMINED";
}>;
export type RuntimeLimiter = z.infer<typeof RuntimeLimiterSchema>;
export declare const ResourceEstimateSnapshotSchema: z.ZodObject<{
    schema_version: z.ZodString;
    scenario_name: z.ZodString;
    scenario_preset: z.ZodString;
    scenario_revision: z.ZodNumber;
    workload_name: z.ZodString;
    is_demo: z.ZodBoolean;
    feasible: z.ZodBoolean;
    infeasibility_code: z.ZodNullable<z.ZodEnum<{
        ABOVE_SURFACE_CODE_THRESHOLD: "ABOVE_SURFACE_CODE_THRESHOLD";
        DISTILLATION_FIXED_POINT_EXCEEDED: "DISTILLATION_FIXED_POINT_EXCEEDED";
        NO_DISTANCE_MEETS_BUDGET: "NO_DISTANCE_MEETS_BUDGET";
    }>>;
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
    algorithm_physical_qubits: import("./measurement.js").Contract<Quantity>;
    layout_adjusted_physical_qubits: import("./measurement.js").Contract<Quantity>;
    factory_physical_qubits: import("./measurement.js").Contract<Quantity>;
    total_physical_qubits: import("./measurement.js").Contract<Quantity>;
    factory_share: import("./measurement.js").Contract<Quantity>;
    occupied_logical_qubits: import("./measurement.js").Contract<Quantity>;
    runtime: import("./measurement.js").Contract<Quantity>;
    runtime_cycle_limited: import("./measurement.js").Contract<Quantity>;
    runtime_factory_limited: import("./measurement.js").Contract<Quantity>;
    runtime_limiter: z.ZodEnum<{
        LOGICAL_CYCLES: "LOGICAL_CYCLES";
        MAGIC_STATE_THROUGHPUT: "MAGIC_STATE_THROUGHPUT";
        NOT_DETERMINED: "NOT_DETERMINED";
    }>;
    magic_state_throughput: import("./measurement.js").Contract<Quantity>;
    achieved_logical_error_probability: import("./measurement.js").Contract<Quantity>;
    error_budget: import("./measurement.js").Contract<Quantity>;
    sensitivity: z.ZodArray<z.ZodObject<{
        parameter: z.ZodEnum<{
            CYCLE_TIME: "CYCLE_TIME";
            ERROR_BUDGET: "ERROR_BUDGET";
            LAYOUT_MODEL: "LAYOUT_MODEL";
            LOGICAL_ERROR_PREFACTOR: "LOGICAL_ERROR_PREFACTOR";
            PHYSICAL_ERROR_RATE: "PHYSICAL_ERROR_RATE";
            RAW_MAGIC_STATE_ERROR: "RAW_MAGIC_STATE_ERROR";
        }>;
        label: z.ZodString;
        value: z.ZodNullable<z.ZodNumber>;
        relative_to_base: z.ZodNullable<z.ZodNumber>;
        feasible: z.ZodBoolean;
        code_distance: z.ZodNullable<z.ZodNumber>;
        total_physical_qubits: z.ZodNullable<z.ZodNumber>;
        runtime: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    exact_arithmetic: z.ZodArray<z.ZodString>;
    model_assumptions: z.ZodArray<z.ZodString>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
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
    /**
     * True when the magic-state count could not be determined at all.
     *
     * Distinct from a magic-state count of zero, and the distinction is the whole
     * point: a Clifford-only circuit genuinely needs no factory, while a circuit
     * of un-synthesized arbitrary rotations has a T count nobody has computed yet.
     * Both arrive here as `t_count: 0`, and reporting the second as "no factory
     * needed" turns a gap into a claim.
     */
    magicStatesUndetermined: boolean;
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