import { z } from "zod";
import { type Quantity } from "./measurement.js";
import { type ResourceScenario } from "./scenario.js";
import type { QuantumWorkload } from "./workload.js";
import { type CoreEvaluation } from "./estimate.js";
import { type ClassicalBaseline } from "./baseline.js";
/**
 * What would have to be true (ketqat-sdk#236).
 *
 * A resource estimate answers "how much". It does not answer the question people
 * actually bring, which is "under what conditions would this be worth doing".
 * That question has an answer that does not require predicting the future: given
 * this algorithm and these assumptions, a device must reach *these* parameters.
 * Whether and when any device does is a separate matter, and this module does
 * not speculate about it.
 *
 * This is deliberately not a date. "Quantum wins in 2030" requires a hardware
 * forecast, and a forecast dressed as a calculation is the single most
 * misleading thing this product could emit. "A surface-code cycle below 420 ns
 * would be required to beat the supplied classical runtime" is checkable,
 * falsifiable, and useful, and it stays true regardless of what any vendor ships.
 *
 * **Economic thresholds are gated on evidence, structurally.** Every one of them
 * needs both a classical baseline and a stated quantum cost. Absent either, the
 * threshold is `UNKNOWN` and carries the name of the missing input. There is no
 * default price for a fault-tolerant quantum computer in this file, because
 * there is no such price in the world.
 */
export declare const ThresholdRefusalSchema: z.ZodEnum<["NO_CLASSICAL_BASELINE", "NO_CLASSICAL_RUNTIME", "NO_CLASSICAL_COST", "NO_ECONOMIC_MODEL", "NO_MACHINE_COST_RATE", "NO_HARDWARE_CAPACITY", "NO_RUNTIME_TARGET", "ESTIMATE_INFEASIBLE", "FACTORY_NOT_SIZED"]>;
export type ThresholdRefusal = z.infer<typeof ThresholdRefusalSchema>;
export declare const AdvantageThresholdSchema: z.ZodObject<{
    schema_version: z.ZodString;
    scenario_name: z.ZodString;
    scenario_revision: z.ZodNumber;
    /** Highest physical error rate at which any distance still meets the budget. */
    max_physical_error_rate: import("./measurement.js").Contract<Quantity>;
    /** Highest physical error rate whose machine still fits the stated capacity. */
    max_physical_error_rate_within_capacity: import("./measurement.js").Contract<Quantity>;
    /** Distance the error budget forces at the scenario's error rate. */
    required_code_distance: import("./measurement.js").Contract<Quantity>;
    /** Slowest surface-code cycle still meeting the scenario's runtime target. */
    max_cycle_time_for_runtime_target: import("./measurement.js").Contract<Quantity>;
    /** Slowest factory still meeting the scenario's runtime target. */
    min_factory_throughput_for_runtime_target: import("./measurement.js").Contract<Quantity>;
    required_logical_qubit_capacity: import("./measurement.js").Contract<Quantity>;
    required_total_physical_qubit_capacity: import("./measurement.js").Contract<Quantity>;
    /** Available capacity divided by required. Below 1 means the machine is too small. */
    capacity_headroom: import("./measurement.js").Contract<Quantity>;
    /** Slowest cycle still beating the measured classical runtime. The "420 ns" number. */
    max_cycle_time_to_beat_classical_runtime: import("./measurement.js").Contract<Quantity>;
    /** Speedup this scenario would deliver against the classical baseline. */
    runtime_speedup_over_classical: import("./measurement.js").Contract<Quantity>;
    max_machine_cost_per_second: import("./measurement.js").Contract<Quantity>;
    max_physical_qubit_second_cost: import("./measurement.js").Contract<Quantity>;
    break_even_runtime: import("./measurement.js").Contract<Quantity>;
    break_even_machine_cost_per_second: import("./measurement.js").Contract<Quantity>;
    projected_quantum_cost: import("./measurement.js").Contract<Quantity>;
    /** Projected quantum cost divided by classical cost. Below 1 favours quantum. */
    cost_ratio_to_classical: import("./measurement.js").Contract<Quantity>;
    /** Machine-readable reasons any threshold above is UNKNOWN. */
    refusals: z.ZodArray<z.ZodObject<{
        threshold: z.ZodString;
        code: z.ZodEnum<["NO_CLASSICAL_BASELINE", "NO_CLASSICAL_RUNTIME", "NO_CLASSICAL_COST", "NO_ECONOMIC_MODEL", "NO_MACHINE_COST_RATE", "NO_HARDWARE_CAPACITY", "NO_RUNTIME_TARGET", "ESTIMATE_INFEASIBLE", "FACTORY_NOT_SIZED"]>;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        threshold: string;
        code: "ESTIMATE_INFEASIBLE" | "FACTORY_NOT_SIZED" | "NO_CLASSICAL_BASELINE" | "NO_CLASSICAL_COST" | "NO_CLASSICAL_RUNTIME" | "NO_ECONOMIC_MODEL" | "NO_HARDWARE_CAPACITY" | "NO_MACHINE_COST_RATE" | "NO_RUNTIME_TARGET";
        message: string;
    }, {
        threshold: string;
        code: "ESTIMATE_INFEASIBLE" | "FACTORY_NOT_SIZED" | "NO_CLASSICAL_BASELINE" | "NO_CLASSICAL_COST" | "NO_CLASSICAL_RUNTIME" | "NO_ECONOMIC_MODEL" | "NO_HARDWARE_CAPACITY" | "NO_MACHINE_COST_RATE" | "NO_RUNTIME_TARGET";
        message: string;
    }>, "many">;
    /** Plain-language statements of what the quantum cost model would have to satisfy. */
    required_conditions: z.ZodArray<z.ZodString, "many">;
    limitations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    scenario_name: string;
    scenario_revision: number;
    max_physical_error_rate: Quantity;
    max_physical_error_rate_within_capacity: Quantity;
    required_code_distance: Quantity;
    max_cycle_time_for_runtime_target: Quantity;
    min_factory_throughput_for_runtime_target: Quantity;
    required_logical_qubit_capacity: Quantity;
    required_total_physical_qubit_capacity: Quantity;
    capacity_headroom: Quantity;
    max_cycle_time_to_beat_classical_runtime: Quantity;
    runtime_speedup_over_classical: Quantity;
    max_machine_cost_per_second: Quantity;
    max_physical_qubit_second_cost: Quantity;
    break_even_runtime: Quantity;
    break_even_machine_cost_per_second: Quantity;
    projected_quantum_cost: Quantity;
    cost_ratio_to_classical: Quantity;
    refusals: {
        threshold: string;
        code: "ESTIMATE_INFEASIBLE" | "FACTORY_NOT_SIZED" | "NO_CLASSICAL_BASELINE" | "NO_CLASSICAL_COST" | "NO_CLASSICAL_RUNTIME" | "NO_ECONOMIC_MODEL" | "NO_HARDWARE_CAPACITY" | "NO_MACHINE_COST_RATE" | "NO_RUNTIME_TARGET";
        message: string;
    }[];
    required_conditions: string[];
    limitations: string[];
}, {
    schema_version: string;
    scenario_name: string;
    scenario_revision: number;
    max_physical_error_rate?: unknown;
    max_physical_error_rate_within_capacity?: unknown;
    required_code_distance?: unknown;
    max_cycle_time_for_runtime_target?: unknown;
    min_factory_throughput_for_runtime_target?: unknown;
    required_logical_qubit_capacity?: unknown;
    required_total_physical_qubit_capacity?: unknown;
    capacity_headroom?: unknown;
    max_cycle_time_to_beat_classical_runtime?: unknown;
    runtime_speedup_over_classical?: unknown;
    max_machine_cost_per_second?: unknown;
    max_physical_qubit_second_cost?: unknown;
    break_even_runtime?: unknown;
    break_even_machine_cost_per_second?: unknown;
    projected_quantum_cost?: unknown;
    cost_ratio_to_classical?: unknown;
    refusals: {
        threshold: string;
        code: "ESTIMATE_INFEASIBLE" | "FACTORY_NOT_SIZED" | "NO_CLASSICAL_BASELINE" | "NO_CLASSICAL_COST" | "NO_CLASSICAL_RUNTIME" | "NO_ECONOMIC_MODEL" | "NO_HARDWARE_CAPACITY" | "NO_MACHINE_COST_RATE" | "NO_RUNTIME_TARGET";
        message: string;
    }[];
    required_conditions: string[];
    limitations: string[];
}>;
export type AdvantageThreshold = z.infer<typeof AdvantageThresholdSchema>;
export declare function computeAdvantageThresholds(workload: QuantumWorkload, scenario: ResourceScenario, baseline: ClassicalBaseline | null, core?: CoreEvaluation): AdvantageThreshold;
/**
 * Roadmap projection is deliberately absent from P0.
 *
 * The design is recorded here rather than implemented: given versioned,
 * source-attributed hardware roadmap snapshots, a threshold crossing could be
 * displayed under optimistic, base and conservative readings of those roadmaps.
 * It is not built, because the capability thresholds above are the part that is
 * checkable, and a crossing date computed from vendor marketing would be the
 * most quotable and least defensible number this product could emit.
 *
 * If it is built, this label is mandatory on every such display.
 */
export declare const ROADMAP_PROJECTION_LABEL = "Roadmap-based projection, not a prediction or guarantee";
//# sourceMappingURL=thresholds.d.ts.map