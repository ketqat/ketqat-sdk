import { z } from "zod";
/**
 * Hardware characterization snapshot (ADR 0004, accepted 2026-07-28).
 *
 * A snapshot is a **dated observation** of a device, used as a scientific input
 * to transpilation, resource estimation, and QEC analysis. It is not a live
 * status feed, and it is never refreshed in place: re-reading a device produces
 * a new snapshot, so a result can always be interpreted against the device as
 * it was when the result was produced.
 *
 * Out of scope by the same ADR, and deliberately absent from this schema:
 * availability, queue depth, pricing, and anything that would make this a
 * hardware-access catalog rather than a device model.
 */
export declare const QubitModalitySchema: z.ZodEnum<{
    BOSONIC_CAVITY: "BOSONIC_CAVITY";
    CONTINUOUS_VARIABLE: "CONTINUOUS_VARIABLE";
    NEUTRAL_ATOM: "NEUTRAL_ATOM";
    PHOTONIC: "PHOTONIC";
    SEMICONDUCTOR: "SEMICONDUCTOR";
    SIMULATED: "SIMULATED";
    SPIN: "SPIN";
    SUPERCONDUCTING: "SUPERCONDUCTING";
    TOPOLOGICAL_CANDIDATE: "TOPOLOGICAL_CANDIDATE";
    TRAPPED_ION: "TRAPPED_ION";
}>;
export type QubitModality = z.infer<typeof QubitModalitySchema>;
/** An undirected physical connection between two qubits. */
export declare const CouplingSchema: z.ZodObject<{
    control: z.ZodNumber;
    target: z.ZodNumber;
    error_rate: z.ZodOptional<z.ZodNumber>;
    duration_ns: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type Coupling = z.infer<typeof CouplingSchema>;
export declare const QubitPropertiesSchema: z.ZodObject<{
    index: z.ZodNumber;
    t1_us: z.ZodOptional<z.ZodNumber>;
    t2_us: z.ZodOptional<z.ZodNumber>;
    readout_error: z.ZodOptional<z.ZodNumber>;
    single_qubit_error: z.ZodOptional<z.ZodNumber>;
    operational: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type QubitProperties = z.infer<typeof QubitPropertiesSchema>;
/**
 * Capabilities that decide which QEC codes a device can actually run.
 *
 * These are the properties a code-to-hardware suitability claim depends on, so
 * they are modelled explicitly rather than left in free-form metadata.
 */
export declare const DeviceCapabilitiesSchema: z.ZodObject<{
    mid_circuit_measurement: z.ZodDefault<z.ZodBoolean>;
    feed_forward: z.ZodDefault<z.ZodBoolean>;
    feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
    reset: z.ZodDefault<z.ZodBoolean>;
    leakage_detection: z.ZodDefault<z.ZodBoolean>;
    loss_detection: z.ZodDefault<z.ZodBoolean>;
    erasure_conversion: z.ZodDefault<z.ZodBoolean>;
    all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
    dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
    noise_bias: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DeviceCapabilities = z.infer<typeof DeviceCapabilitiesSchema>;
export declare const HardwareProfileSchema: z.ZodObject<{
    schema_version: z.ZodString;
    provider: z.ZodString;
    backend: z.ZodString;
    snapshot_id: z.ZodString;
    modality: z.ZodEnum<{
        BOSONIC_CAVITY: "BOSONIC_CAVITY";
        CONTINUOUS_VARIABLE: "CONTINUOUS_VARIABLE";
        NEUTRAL_ATOM: "NEUTRAL_ATOM";
        PHOTONIC: "PHOTONIC";
        SEMICONDUCTOR: "SEMICONDUCTOR";
        SIMULATED: "SIMULATED";
        SPIN: "SPIN";
        SUPERCONDUCTING: "SUPERCONDUCTING";
        TOPOLOGICAL_CANDIDATE: "TOPOLOGICAL_CANDIDATE";
        TRAPPED_ION: "TRAPPED_ION";
    }>;
    qubit_count: z.ZodNumber;
    native_gates: z.ZodArray<z.ZodString>;
    basis_two_qubit_gate: z.ZodString;
    couplings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        control: z.ZodNumber;
        target: z.ZodNumber;
        error_rate: z.ZodOptional<z.ZodNumber>;
        duration_ns: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        t1_us: z.ZodOptional<z.ZodNumber>;
        t2_us: z.ZodOptional<z.ZodNumber>;
        readout_error: z.ZodOptional<z.ZodNumber>;
        single_qubit_error: z.ZodOptional<z.ZodNumber>;
        operational: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    capabilities: z.ZodObject<{
        mid_circuit_measurement: z.ZodDefault<z.ZodBoolean>;
        feed_forward: z.ZodDefault<z.ZodBoolean>;
        feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
        reset: z.ZodDefault<z.ZodBoolean>;
        leakage_detection: z.ZodDefault<z.ZodBoolean>;
        loss_detection: z.ZodDefault<z.ZodBoolean>;
        erasure_conversion: z.ZodDefault<z.ZodBoolean>;
        all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
        dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
        noise_bias: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    calibration_timestamp: z.ZodOptional<z.ZodString>;
    retrieved_at: z.ZodString;
    source: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;
/** Adjacency list over operational qubits, both directions per coupling. */
export declare function couplingAdjacency(profile: HardwareProfile): Map<number, Set<number>>;
/**
 * Shortest path between two physical qubits, or null when disconnected.
 *
 * Breadth-first, so the path is minimal in SWAP count. Edge error rates are
 * deliberately not weighted here: a lowest-error path is a different objective
 * and would need its own, stated, cost model.
 */
export declare function shortestPath(adjacency: Map<number, Set<number>>, from: number, to: number): number[] | null;
/** A line of `qubitCount` qubits: 0-1-2-...-n. Useful for tests and examples. */
export declare function linearTopology(qubitCount: number): Coupling[];
/** A `rows` x `columns` grid with nearest-neighbour coupling. */
export declare function gridTopology(rows: number, columns: number): Coupling[];
//# sourceMappingURL=profile.d.ts.map