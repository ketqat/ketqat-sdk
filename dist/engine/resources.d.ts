import { z } from "zod";
import type { QuantumCircuit } from "../circuit/graph.js";
import type { HardwareProfile } from "../hardware/profile.js";
/**
 * Resource estimation (RFC 0001).
 *
 * Two rules shape this module:
 *
 * 1. **Assumptions travel with the numbers.** Every estimate records the gate
 *    set, estimator, and version it was produced under, because two estimates
 *    computed under different assumptions are not comparable.
 * 2. **Never average across estimators.** `NormalizedResourceEstimate` holds
 *    normalized fields *alongside* the raw tool output, never instead of it,
 *    and there is deliberately no function here that combines two estimates
 *    into one.
 */
export declare const CLIFFORD_GATES: Set<string>;
/** Gates counted as T or T-like for fault-tolerant costing. */
export declare const T_GATES: Set<string>;
export declare const NISQResourcesSchema: z.ZodObject<{
    logical_qubits: z.ZodNumber;
    circuit_depth: z.ZodNumber;
    gate_count: z.ZodNumber;
    one_qubit_gate_count: z.ZodNumber;
    two_qubit_gate_count: z.ZodNumber;
    measurement_count: z.ZodNumber;
    reset_count: z.ZodNumber;
    swap_count: z.ZodNumber;
    barrier_count: z.ZodNumber;
    conditional_count: z.ZodNumber;
    estimated_duration_ns: z.ZodOptional<z.ZodNumber>;
    estimated_success_probability: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type NISQResources = z.infer<typeof NISQResourcesSchema>;
export declare const FaultTolerantResourcesSchema: z.ZodObject<{
    t_count: z.ZodNumber;
    clifford_count: z.ZodNumber;
    toffoli_count: z.ZodNumber;
    unsupported_for_ft_count: z.ZodNumber;
}, z.core.$strip>;
export type FaultTolerantResources = z.infer<typeof FaultTolerantResourcesSchema>;
export declare const ResourceAssumptionsSchema: z.ZodObject<{
    estimator: z.ZodString;
    estimator_version: z.ZodString;
    gate_set: z.ZodArray<z.ZodString>;
    notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hardware_snapshot: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ResourceAssumptions = z.infer<typeof ResourceAssumptionsSchema>;
export declare const NormalizedResourceEstimateSchema: z.ZodObject<{
    schema_version: z.ZodString;
    nisq: z.ZodObject<{
        logical_qubits: z.ZodNumber;
        circuit_depth: z.ZodNumber;
        gate_count: z.ZodNumber;
        one_qubit_gate_count: z.ZodNumber;
        two_qubit_gate_count: z.ZodNumber;
        measurement_count: z.ZodNumber;
        reset_count: z.ZodNumber;
        swap_count: z.ZodNumber;
        barrier_count: z.ZodNumber;
        conditional_count: z.ZodNumber;
        estimated_duration_ns: z.ZodOptional<z.ZodNumber>;
        estimated_success_probability: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    fault_tolerant: z.ZodObject<{
        t_count: z.ZodNumber;
        clifford_count: z.ZodNumber;
        toffoli_count: z.ZodNumber;
        unsupported_for_ft_count: z.ZodNumber;
    }, z.core.$strip>;
    assumptions: z.ZodObject<{
        estimator: z.ZodString;
        estimator_version: z.ZodString;
        gate_set: z.ZodArray<z.ZodString>;
        notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
        hardware_snapshot: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    raw: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type NormalizedResourceEstimate = z.infer<typeof NormalizedResourceEstimateSchema>;
export declare const RESOURCE_ESTIMATOR = "ketqat-static";
export declare const RESOURCE_ESTIMATOR_VERSION = "0.1.0";
export declare function estimateResources(circuit: QuantumCircuit, profile?: HardwareProfile): NormalizedResourceEstimate;
/**
 * Whether two estimates may be compared.
 *
 * Estimates from different estimators, versions, or gate sets are not
 * comparable, and there is deliberately no function that averages them: two
 * numbers computed under different assumptions do not have a meaningful mean.
 */
export declare function resourceEstimatesComparable(left: NormalizedResourceEstimate, right: NormalizedResourceEstimate): {
    comparable: boolean;
    reasons: string[];
};
//# sourceMappingURL=resources.d.ts.map