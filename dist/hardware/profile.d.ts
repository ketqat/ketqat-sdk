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
export declare const QubitModalitySchema: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "SEMICONDUCTOR", "BOSONIC_CAVITY", "CONTINUOUS_VARIABLE", "TOPOLOGICAL_CANDIDATE", "SIMULATED"]>;
export type QubitModality = z.infer<typeof QubitModalitySchema>;
/** An undirected physical connection between two qubits. */
export declare const CouplingSchema: z.ZodObject<{
    control: z.ZodNumber;
    target: z.ZodNumber;
    /** Two-qubit gate error on this edge, when characterized. */
    error_rate: z.ZodOptional<z.ZodNumber>;
    /** Gate duration in nanoseconds, when characterized. */
    duration_ns: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    control: number;
    target: number;
    error_rate?: number | undefined;
    duration_ns?: number | undefined;
}, {
    control: number;
    target: number;
    error_rate?: number | undefined;
    duration_ns?: number | undefined;
}>;
export type Coupling = z.infer<typeof CouplingSchema>;
export declare const QubitPropertiesSchema: z.ZodObject<{
    index: z.ZodNumber;
    t1_us: z.ZodOptional<z.ZodNumber>;
    t2_us: z.ZodOptional<z.ZodNumber>;
    readout_error: z.ZodOptional<z.ZodNumber>;
    single_qubit_error: z.ZodOptional<z.ZodNumber>;
    /** Excluded from routing when false, e.g. a qubit taken out of service. */
    operational: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    index: number;
    t1_us?: number | undefined;
    t2_us?: number | undefined;
    readout_error?: number | undefined;
    single_qubit_error?: number | undefined;
    operational: boolean;
}, {
    index: number;
    t1_us?: number | undefined;
    t2_us?: number | undefined;
    readout_error?: number | undefined;
    single_qubit_error?: number | undefined;
    operational?: boolean | undefined;
}>;
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
    /** Feed-forward latency budget in nanoseconds, when characterized. */
    feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
    reset: z.ZodDefault<z.ZodBoolean>;
    leakage_detection: z.ZodDefault<z.ZodBoolean>;
    loss_detection: z.ZodDefault<z.ZodBoolean>;
    erasure_conversion: z.ZodDefault<z.ZodBoolean>;
    all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
    dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
    /** Whether the device applies a biased noise channel, e.g. dominant dephasing. */
    noise_bias: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    mid_circuit_measurement: boolean;
    feed_forward: boolean;
    feed_forward_latency_ns?: number | undefined;
    reset: boolean;
    leakage_detection: boolean;
    loss_detection: boolean;
    erasure_conversion: boolean;
    all_to_all_connectivity: boolean;
    dynamic_connectivity: boolean;
    noise_bias?: string | undefined;
}, {
    mid_circuit_measurement?: boolean | undefined;
    feed_forward?: boolean | undefined;
    feed_forward_latency_ns?: number | undefined;
    reset?: boolean | undefined;
    leakage_detection?: boolean | undefined;
    loss_detection?: boolean | undefined;
    erasure_conversion?: boolean | undefined;
    all_to_all_connectivity?: boolean | undefined;
    dynamic_connectivity?: boolean | undefined;
    noise_bias?: string | undefined;
}>;
export type DeviceCapabilities = z.infer<typeof DeviceCapabilitiesSchema>;
export declare const HardwareProfileSchema: z.ZodObject<{
    schema_version: z.ZodString;
    /** Provider namespace, e.g. "ibm", "ionq", or "simulator". */
    provider: z.ZodString;
    backend: z.ZodString;
    /** Identifies this observation. Two snapshots of one device differ here. */
    snapshot_id: z.ZodString;
    modality: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "SEMICONDUCTOR", "BOSONIC_CAVITY", "CONTINUOUS_VARIABLE", "TOPOLOGICAL_CANDIDATE", "SIMULATED"]>;
    qubit_count: z.ZodNumber;
    native_gates: z.ZodArray<z.ZodString, "many">;
    basis_two_qubit_gate: z.ZodString;
    couplings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        control: z.ZodNumber;
        target: z.ZodNumber;
        /** Two-qubit gate error on this edge, when characterized. */
        error_rate: z.ZodOptional<z.ZodNumber>;
        /** Gate duration in nanoseconds, when characterized. */
        duration_ns: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        control: number;
        target: number;
        error_rate?: number | undefined;
        duration_ns?: number | undefined;
    }, {
        control: number;
        target: number;
        error_rate?: number | undefined;
        duration_ns?: number | undefined;
    }>, "many">>;
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        t1_us: z.ZodOptional<z.ZodNumber>;
        t2_us: z.ZodOptional<z.ZodNumber>;
        readout_error: z.ZodOptional<z.ZodNumber>;
        single_qubit_error: z.ZodOptional<z.ZodNumber>;
        /** Excluded from routing when false, e.g. a qubit taken out of service. */
        operational: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        index: number;
        t1_us?: number | undefined;
        t2_us?: number | undefined;
        readout_error?: number | undefined;
        single_qubit_error?: number | undefined;
        operational: boolean;
    }, {
        index: number;
        t1_us?: number | undefined;
        t2_us?: number | undefined;
        readout_error?: number | undefined;
        single_qubit_error?: number | undefined;
        operational?: boolean | undefined;
    }>, "many">>;
    capabilities: z.ZodObject<{
        mid_circuit_measurement: z.ZodDefault<z.ZodBoolean>;
        feed_forward: z.ZodDefault<z.ZodBoolean>;
        /** Feed-forward latency budget in nanoseconds, when characterized. */
        feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
        reset: z.ZodDefault<z.ZodBoolean>;
        leakage_detection: z.ZodDefault<z.ZodBoolean>;
        loss_detection: z.ZodDefault<z.ZodBoolean>;
        erasure_conversion: z.ZodDefault<z.ZodBoolean>;
        all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
        dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
        /** Whether the device applies a biased noise channel, e.g. dominant dephasing. */
        noise_bias: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        mid_circuit_measurement: boolean;
        feed_forward: boolean;
        feed_forward_latency_ns?: number | undefined;
        reset: boolean;
        leakage_detection: boolean;
        loss_detection: boolean;
        erasure_conversion: boolean;
        all_to_all_connectivity: boolean;
        dynamic_connectivity: boolean;
        noise_bias?: string | undefined;
    }, {
        mid_circuit_measurement?: boolean | undefined;
        feed_forward?: boolean | undefined;
        feed_forward_latency_ns?: number | undefined;
        reset?: boolean | undefined;
        leakage_detection?: boolean | undefined;
        loss_detection?: boolean | undefined;
        erasure_conversion?: boolean | undefined;
        all_to_all_connectivity?: boolean | undefined;
        dynamic_connectivity?: boolean | undefined;
        noise_bias?: string | undefined;
    }>;
    /**
     * When the device was characterized. Distinct from `retrieved_at`:
     * calibration can be hours old at the moment it is read.
     */
    calibration_timestamp: z.ZodOptional<z.ZodString>;
    retrieved_at: z.ZodString;
    /** Where this snapshot came from, so a reader can re-derive it. */
    source: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    provider: string;
    backend: string;
    snapshot_id: string;
    modality: "BOSONIC_CAVITY" | "CONTINUOUS_VARIABLE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SEMICONDUCTOR" | "SIMULATED" | "SPIN" | "SUPERCONDUCTING" | "TOPOLOGICAL_CANDIDATE" | "TRAPPED_ION";
    qubit_count: number;
    native_gates: string[];
    basis_two_qubit_gate: string;
    couplings: {
        control: number;
        target: number;
        error_rate?: number | undefined;
        duration_ns?: number | undefined;
    }[];
    qubits: {
        index: number;
        t1_us?: number | undefined;
        t2_us?: number | undefined;
        readout_error?: number | undefined;
        single_qubit_error?: number | undefined;
        operational: boolean;
    }[];
    capabilities: {
        mid_circuit_measurement: boolean;
        feed_forward: boolean;
        feed_forward_latency_ns?: number | undefined;
        reset: boolean;
        leakage_detection: boolean;
        loss_detection: boolean;
        erasure_conversion: boolean;
        all_to_all_connectivity: boolean;
        dynamic_connectivity: boolean;
        noise_bias?: string | undefined;
    };
    calibration_timestamp?: string | undefined;
    retrieved_at: string;
    source: string;
    notes?: string | undefined;
}, {
    schema_version: string;
    provider: string;
    backend: string;
    snapshot_id: string;
    modality: "BOSONIC_CAVITY" | "CONTINUOUS_VARIABLE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SEMICONDUCTOR" | "SIMULATED" | "SPIN" | "SUPERCONDUCTING" | "TOPOLOGICAL_CANDIDATE" | "TRAPPED_ION";
    qubit_count: number;
    native_gates: string[];
    basis_two_qubit_gate: string;
    couplings?: {
        control: number;
        target: number;
        error_rate?: number | undefined;
        duration_ns?: number | undefined;
    }[] | undefined;
    qubits?: {
        index: number;
        t1_us?: number | undefined;
        t2_us?: number | undefined;
        readout_error?: number | undefined;
        single_qubit_error?: number | undefined;
        operational?: boolean | undefined;
    }[] | undefined;
    capabilities: {
        mid_circuit_measurement?: boolean | undefined;
        feed_forward?: boolean | undefined;
        feed_forward_latency_ns?: number | undefined;
        reset?: boolean | undefined;
        leakage_detection?: boolean | undefined;
        loss_detection?: boolean | undefined;
        erasure_conversion?: boolean | undefined;
        all_to_all_connectivity?: boolean | undefined;
        dynamic_connectivity?: boolean | undefined;
        noise_bias?: string | undefined;
    };
    calibration_timestamp?: string | undefined;
    retrieved_at: string;
    source: string;
    notes?: string | undefined;
}>;
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