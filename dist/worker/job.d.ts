import { z } from "zod";
/**
 * Execution job contract (RFC 0005).
 *
 * The central decision: a job names an **approved operation** and supplies
 * **validated parameters**. It does not carry code. There is no field here that
 * accepts a script, a package name, an image reference, or a command, and that
 * absence is the security model -- not a container flag that could be
 * misconfigured, but a shape that cannot express arbitrary execution.
 *
 * This is a real restriction. Most of what the platform is for -- simulate this
 * circuit, transpile it for this device, estimate its resources, optimize it,
 * check two circuits for equivalence -- is expressible as a manifest naming an
 * approved operation. Arbitrary code execution buys the remainder at a
 * disproportionate increase in risk surface, and can be added later behind a
 * stricter boundary if it proves necessary.
 */
/** Operations the worker will perform. Anything not listed cannot be requested. */
export declare const JobOperationSchema: z.ZodEnum<["simulate", "transpile", "estimate_resources", "optimize_zx", "check_equivalence", "mitigate_zne"]>;
export type JobOperation = z.infer<typeof JobOperationSchema>;
export declare const JobLimitsSchema: z.ZodObject<{
    /** Wall-clock ceiling. A job that exceeds it is cancelled, not extended. */
    timeout_seconds: z.ZodDefault<z.ZodNumber>;
    max_qubits: z.ZodDefault<z.ZodNumber>;
    max_shots: z.ZodDefault<z.ZodNumber>;
    /** Cap on result size, so a job cannot exhaust storage by succeeding. */
    max_result_bytes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    timeout_seconds: number;
    max_qubits: number;
    max_shots: number;
    max_result_bytes: number;
}, {
    timeout_seconds?: number | undefined;
    max_qubits?: number | undefined;
    max_shots?: number | undefined;
    max_result_bytes?: number | undefined;
}>;
export type JobLimits = z.infer<typeof JobLimitsSchema>;
export declare const JobParametersSchema: z.ZodDiscriminatedUnion<"operation", [z.ZodObject<{
    /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
    qasm: z.ZodString;
} & {
    operation: z.ZodLiteral<"simulate">;
    shots: z.ZodOptional<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodNumber>;
    noise: z.ZodOptional<z.ZodObject<{
        model: z.ZodLiteral<"depolarizing">;
        one_qubit_error: z.ZodDefault<z.ZodNumber>;
        two_qubit_error: z.ZodDefault<z.ZodNumber>;
        readout_error: z.ZodDefault<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        model: "depolarizing";
        one_qubit_error: number;
        two_qubit_error: number;
        readout_error: number;
    }, {
        model: "depolarizing";
        one_qubit_error?: number | undefined;
        two_qubit_error?: number | undefined;
        readout_error?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    qasm: string;
    operation: "simulate";
    shots?: number | undefined;
    seed?: number | undefined;
    noise?: {
        model: "depolarizing";
        one_qubit_error: number;
        two_qubit_error: number;
        readout_error: number;
    } | undefined;
}, {
    qasm: string;
    operation: "simulate";
    shots?: number | undefined;
    seed?: number | undefined;
    noise?: {
        model: "depolarizing";
        one_qubit_error?: number | undefined;
        two_qubit_error?: number | undefined;
        readout_error?: number | undefined;
    } | undefined;
}>, z.ZodObject<{
    /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
    qasm: z.ZodString;
} & {
    operation: z.ZodLiteral<"transpile">;
    hardware_profile: z.ZodObject<{
        schema_version: z.ZodString;
        provider: z.ZodString;
        backend: z.ZodString;
        snapshot_id: z.ZodString;
        modality: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "SEMICONDUCTOR", "BOSONIC_CAVITY", "CONTINUOUS_VARIABLE", "TOPOLOGICAL_CANDIDATE", "SIMULATED"]>;
        qubit_count: z.ZodNumber;
        native_gates: z.ZodArray<z.ZodString, "many">;
        basis_two_qubit_gate: z.ZodString;
        couplings: z.ZodDefault<z.ZodArray<z.ZodObject<{
            control: z.ZodNumber;
            target: z.ZodNumber;
            error_rate: z.ZodOptional<z.ZodNumber>;
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
            feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
            reset: z.ZodDefault<z.ZodBoolean>;
            leakage_detection: z.ZodDefault<z.ZodBoolean>;
            loss_detection: z.ZodDefault<z.ZodBoolean>;
            erasure_conversion: z.ZodDefault<z.ZodBoolean>;
            all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
            dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
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
        calibration_timestamp: z.ZodOptional<z.ZodString>;
        retrieved_at: z.ZodString;
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
}, "strip", z.ZodTypeAny, {
    qasm: string;
    operation: "transpile";
    hardware_profile: {
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
    };
}, {
    qasm: string;
    operation: "transpile";
    hardware_profile: {
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
    };
}>, z.ZodObject<{
    /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
    qasm: z.ZodString;
} & {
    operation: z.ZodLiteral<"estimate_resources">;
    hardware_profile: z.ZodOptional<z.ZodObject<{
        schema_version: z.ZodString;
        provider: z.ZodString;
        backend: z.ZodString;
        snapshot_id: z.ZodString;
        modality: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "SEMICONDUCTOR", "BOSONIC_CAVITY", "CONTINUOUS_VARIABLE", "TOPOLOGICAL_CANDIDATE", "SIMULATED"]>;
        qubit_count: z.ZodNumber;
        native_gates: z.ZodArray<z.ZodString, "many">;
        basis_two_qubit_gate: z.ZodString;
        couplings: z.ZodDefault<z.ZodArray<z.ZodObject<{
            control: z.ZodNumber;
            target: z.ZodNumber;
            error_rate: z.ZodOptional<z.ZodNumber>;
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
            feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
            reset: z.ZodDefault<z.ZodBoolean>;
            leakage_detection: z.ZodDefault<z.ZodBoolean>;
            loss_detection: z.ZodDefault<z.ZodBoolean>;
            erasure_conversion: z.ZodDefault<z.ZodBoolean>;
            all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
            dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
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
        calibration_timestamp: z.ZodOptional<z.ZodString>;
        retrieved_at: z.ZodString;
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
    }>>;
}, "strip", z.ZodTypeAny, {
    qasm: string;
    operation: "estimate_resources";
    hardware_profile?: {
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
    } | undefined;
}, {
    qasm: string;
    operation: "estimate_resources";
    hardware_profile?: {
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
    } | undefined;
}>, z.ZodObject<{
    /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
    qasm: z.ZodString;
} & {
    operation: z.ZodLiteral<"optimize_zx">;
}, "strip", z.ZodTypeAny, {
    qasm: string;
    operation: "optimize_zx";
}, {
    qasm: string;
    operation: "optimize_zx";
}>, z.ZodObject<{
    operation: z.ZodLiteral<"check_equivalence">;
    left_qasm: z.ZodString;
    right_qasm: z.ZodString;
    tolerance: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    operation: "check_equivalence";
    left_qasm: string;
    right_qasm: string;
    tolerance?: number | undefined;
}, {
    operation: "check_equivalence";
    left_qasm: string;
    right_qasm: string;
    tolerance?: number | undefined;
}>, z.ZodObject<{
    /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
    qasm: z.ZodString;
} & {
    operation: z.ZodLiteral<"mitigate_zne">;
    noise: z.ZodObject<{
        model: z.ZodLiteral<"depolarizing">;
        one_qubit_error: z.ZodDefault<z.ZodNumber>;
        two_qubit_error: z.ZodDefault<z.ZodNumber>;
        readout_error: z.ZodDefault<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        model: "depolarizing";
        one_qubit_error: number;
        two_qubit_error: number;
        readout_error: number;
    }, {
        model: "depolarizing";
        one_qubit_error?: number | undefined;
        two_qubit_error?: number | undefined;
        readout_error?: number | undefined;
    }>;
    shots: z.ZodOptional<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    qasm: string;
    operation: "mitigate_zne";
    noise: {
        model: "depolarizing";
        one_qubit_error: number;
        two_qubit_error: number;
        readout_error: number;
    };
    shots?: number | undefined;
    seed?: number | undefined;
}, {
    qasm: string;
    operation: "mitigate_zne";
    noise: {
        model: "depolarizing";
        one_qubit_error?: number | undefined;
        two_qubit_error?: number | undefined;
        readout_error?: number | undefined;
    };
    shots?: number | undefined;
    seed?: number | undefined;
}>]>;
export type JobParameters = z.infer<typeof JobParametersSchema>;
export declare const ExecutionJobSchema: z.ZodObject<{
    schema_version: z.ZodString;
    job_id: z.ZodString;
    /**
     * Deduplicates retries. A retried submission must not run twice, since a
     * second run would consume budget and could produce a second, differing
     * record of the same request.
     */
    idempotency_key: z.ZodString;
    submitted_by: z.ZodString;
    parameters: z.ZodDiscriminatedUnion<"operation", [z.ZodObject<{
        /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
        qasm: z.ZodString;
    } & {
        operation: z.ZodLiteral<"simulate">;
        shots: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
        noise: z.ZodOptional<z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            one_qubit_error: z.ZodDefault<z.ZodNumber>;
            two_qubit_error: z.ZodDefault<z.ZodNumber>;
            readout_error: z.ZodDefault<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            model: "depolarizing";
            one_qubit_error: number;
            two_qubit_error: number;
            readout_error: number;
        }, {
            model: "depolarizing";
            one_qubit_error?: number | undefined;
            two_qubit_error?: number | undefined;
            readout_error?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        qasm: string;
        operation: "simulate";
        shots?: number | undefined;
        seed?: number | undefined;
        noise?: {
            model: "depolarizing";
            one_qubit_error: number;
            two_qubit_error: number;
            readout_error: number;
        } | undefined;
    }, {
        qasm: string;
        operation: "simulate";
        shots?: number | undefined;
        seed?: number | undefined;
        noise?: {
            model: "depolarizing";
            one_qubit_error?: number | undefined;
            two_qubit_error?: number | undefined;
            readout_error?: number | undefined;
        } | undefined;
    }>, z.ZodObject<{
        /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
        qasm: z.ZodString;
    } & {
        operation: z.ZodLiteral<"transpile">;
        hardware_profile: z.ZodObject<{
            schema_version: z.ZodString;
            provider: z.ZodString;
            backend: z.ZodString;
            snapshot_id: z.ZodString;
            modality: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "SEMICONDUCTOR", "BOSONIC_CAVITY", "CONTINUOUS_VARIABLE", "TOPOLOGICAL_CANDIDATE", "SIMULATED"]>;
            qubit_count: z.ZodNumber;
            native_gates: z.ZodArray<z.ZodString, "many">;
            basis_two_qubit_gate: z.ZodString;
            couplings: z.ZodDefault<z.ZodArray<z.ZodObject<{
                control: z.ZodNumber;
                target: z.ZodNumber;
                error_rate: z.ZodOptional<z.ZodNumber>;
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
                feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
                reset: z.ZodDefault<z.ZodBoolean>;
                leakage_detection: z.ZodDefault<z.ZodBoolean>;
                loss_detection: z.ZodDefault<z.ZodBoolean>;
                erasure_conversion: z.ZodDefault<z.ZodBoolean>;
                all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
                dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
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
            calibration_timestamp: z.ZodOptional<z.ZodString>;
            retrieved_at: z.ZodString;
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
    }, "strip", z.ZodTypeAny, {
        qasm: string;
        operation: "transpile";
        hardware_profile: {
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
        };
    }, {
        qasm: string;
        operation: "transpile";
        hardware_profile: {
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
        };
    }>, z.ZodObject<{
        /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
        qasm: z.ZodString;
    } & {
        operation: z.ZodLiteral<"estimate_resources">;
        hardware_profile: z.ZodOptional<z.ZodObject<{
            schema_version: z.ZodString;
            provider: z.ZodString;
            backend: z.ZodString;
            snapshot_id: z.ZodString;
            modality: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "SEMICONDUCTOR", "BOSONIC_CAVITY", "CONTINUOUS_VARIABLE", "TOPOLOGICAL_CANDIDATE", "SIMULATED"]>;
            qubit_count: z.ZodNumber;
            native_gates: z.ZodArray<z.ZodString, "many">;
            basis_two_qubit_gate: z.ZodString;
            couplings: z.ZodDefault<z.ZodArray<z.ZodObject<{
                control: z.ZodNumber;
                target: z.ZodNumber;
                error_rate: z.ZodOptional<z.ZodNumber>;
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
                feed_forward_latency_ns: z.ZodOptional<z.ZodNumber>;
                reset: z.ZodDefault<z.ZodBoolean>;
                leakage_detection: z.ZodDefault<z.ZodBoolean>;
                loss_detection: z.ZodDefault<z.ZodBoolean>;
                erasure_conversion: z.ZodDefault<z.ZodBoolean>;
                all_to_all_connectivity: z.ZodDefault<z.ZodBoolean>;
                dynamic_connectivity: z.ZodDefault<z.ZodBoolean>;
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
            calibration_timestamp: z.ZodOptional<z.ZodString>;
            retrieved_at: z.ZodString;
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
        }>>;
    }, "strip", z.ZodTypeAny, {
        qasm: string;
        operation: "estimate_resources";
        hardware_profile?: {
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
        } | undefined;
    }, {
        qasm: string;
        operation: "estimate_resources";
        hardware_profile?: {
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
        } | undefined;
    }>, z.ZodObject<{
        /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
        qasm: z.ZodString;
    } & {
        operation: z.ZodLiteral<"optimize_zx">;
    }, "strip", z.ZodTypeAny, {
        qasm: string;
        operation: "optimize_zx";
    }, {
        qasm: string;
        operation: "optimize_zx";
    }>, z.ZodObject<{
        operation: z.ZodLiteral<"check_equivalence">;
        left_qasm: z.ZodString;
        right_qasm: z.ZodString;
        tolerance: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        operation: "check_equivalence";
        left_qasm: string;
        right_qasm: string;
        tolerance?: number | undefined;
    }, {
        operation: "check_equivalence";
        left_qasm: string;
        right_qasm: string;
        tolerance?: number | undefined;
    }>, z.ZodObject<{
        /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
        qasm: z.ZodString;
    } & {
        operation: z.ZodLiteral<"mitigate_zne">;
        noise: z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            one_qubit_error: z.ZodDefault<z.ZodNumber>;
            two_qubit_error: z.ZodDefault<z.ZodNumber>;
            readout_error: z.ZodDefault<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            model: "depolarizing";
            one_qubit_error: number;
            two_qubit_error: number;
            readout_error: number;
        }, {
            model: "depolarizing";
            one_qubit_error?: number | undefined;
            two_qubit_error?: number | undefined;
            readout_error?: number | undefined;
        }>;
        shots: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        qasm: string;
        operation: "mitigate_zne";
        noise: {
            model: "depolarizing";
            one_qubit_error: number;
            two_qubit_error: number;
            readout_error: number;
        };
        shots?: number | undefined;
        seed?: number | undefined;
    }, {
        qasm: string;
        operation: "mitigate_zne";
        noise: {
            model: "depolarizing";
            one_qubit_error?: number | undefined;
            two_qubit_error?: number | undefined;
            readout_error?: number | undefined;
        };
        shots?: number | undefined;
        seed?: number | undefined;
    }>]>;
    limits: z.ZodDefault<z.ZodObject<{
        /** Wall-clock ceiling. A job that exceeds it is cancelled, not extended. */
        timeout_seconds: z.ZodDefault<z.ZodNumber>;
        max_qubits: z.ZodDefault<z.ZodNumber>;
        max_shots: z.ZodDefault<z.ZodNumber>;
        /** Cap on result size, so a job cannot exhaust storage by succeeding. */
        max_result_bytes: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        timeout_seconds: number;
        max_qubits: number;
        max_shots: number;
        max_result_bytes: number;
    }, {
        timeout_seconds?: number | undefined;
        max_qubits?: number | undefined;
        max_shots?: number | undefined;
        max_result_bytes?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    job_id: string;
    idempotency_key: string;
    submitted_by: string;
    parameters: {
        qasm: string;
        operation: "simulate";
        shots?: number | undefined;
        seed?: number | undefined;
        noise?: {
            model: "depolarizing";
            one_qubit_error: number;
            two_qubit_error: number;
            readout_error: number;
        } | undefined;
    } | {
        qasm: string;
        operation: "transpile";
        hardware_profile: {
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
        };
    } | {
        qasm: string;
        operation: "estimate_resources";
        hardware_profile?: {
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
        } | undefined;
    } | {
        qasm: string;
        operation: "optimize_zx";
    } | {
        operation: "check_equivalence";
        left_qasm: string;
        right_qasm: string;
        tolerance?: number | undefined;
    } | {
        qasm: string;
        operation: "mitigate_zne";
        noise: {
            model: "depolarizing";
            one_qubit_error: number;
            two_qubit_error: number;
            readout_error: number;
        };
        shots?: number | undefined;
        seed?: number | undefined;
    };
    limits: {
        timeout_seconds: number;
        max_qubits: number;
        max_shots: number;
        max_result_bytes: number;
    };
}, {
    schema_version: string;
    job_id: string;
    idempotency_key: string;
    submitted_by: string;
    parameters: {
        qasm: string;
        operation: "simulate";
        shots?: number | undefined;
        seed?: number | undefined;
        noise?: {
            model: "depolarizing";
            one_qubit_error?: number | undefined;
            two_qubit_error?: number | undefined;
            readout_error?: number | undefined;
        } | undefined;
    } | {
        qasm: string;
        operation: "transpile";
        hardware_profile: {
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
        };
    } | {
        qasm: string;
        operation: "estimate_resources";
        hardware_profile?: {
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
        } | undefined;
    } | {
        qasm: string;
        operation: "optimize_zx";
    } | {
        operation: "check_equivalence";
        left_qasm: string;
        right_qasm: string;
        tolerance?: number | undefined;
    } | {
        qasm: string;
        operation: "mitigate_zne";
        noise: {
            model: "depolarizing";
            one_qubit_error?: number | undefined;
            two_qubit_error?: number | undefined;
            readout_error?: number | undefined;
        };
        shots?: number | undefined;
        seed?: number | undefined;
    };
    limits?: {
        timeout_seconds?: number | undefined;
        max_qubits?: number | undefined;
        max_shots?: number | undefined;
        max_result_bytes?: number | undefined;
    } | undefined;
}>;
export type ExecutionJob = z.infer<typeof ExecutionJobSchema>;
export declare const JobStatusSchema: z.ZodEnum<["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export declare const JobResultSchema: z.ZodObject<{
    schema_version: z.ZodString;
    job_id: z.ZodString;
    status: z.ZodEnum<["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]>;
    operation: z.ZodEnum<["simulate", "transpile", "estimate_resources", "optimize_zx", "check_equivalence", "mitigate_zne"]>;
    /** Present on success. Shape depends on the operation. */
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /** Present on failure, and never a raw stack trace. */
    error: z.ZodOptional<z.ZodString>;
    started_at: z.ZodString;
    finished_at: z.ZodString;
    duration_ms: z.ZodNumber;
    /** Execution class, so a sandboxed simulation is never read as hardware. */
    execution_class: z.ZodLiteral<"SIMULATION">;
    worker_version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    job_id: string;
    status: "CANCELLED" | "FAILED" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "TIMED_OUT";
    operation: "check_equivalence" | "estimate_resources" | "mitigate_zne" | "optimize_zx" | "simulate" | "transpile";
    output?: Record<string, unknown> | undefined;
    error?: string | undefined;
    started_at: string;
    finished_at: string;
    duration_ms: number;
    execution_class: "SIMULATION";
    worker_version: string;
}, {
    schema_version: string;
    job_id: string;
    status: "CANCELLED" | "FAILED" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "TIMED_OUT";
    operation: "check_equivalence" | "estimate_resources" | "mitigate_zne" | "optimize_zx" | "simulate" | "transpile";
    output?: Record<string, unknown> | undefined;
    error?: string | undefined;
    started_at: string;
    finished_at: string;
    duration_ms: number;
    execution_class: "SIMULATION";
    worker_version: string;
}>;
export type JobResult = z.infer<typeof JobResultSchema>;
/**
 * Fields a job must never contain.
 *
 * Checked explicitly rather than relying on the schema's shape alone, because a
 * future edit could add one of these without anyone noticing it re-opened
 * arbitrary execution. The test asserts each is rejected.
 */
export declare const FORBIDDEN_JOB_FIELDS: readonly ["code", "script", "command", "cmd", "entrypoint", "image", "package", "packages", "install", "requirements", "eval", "exec", "shell", "env", "credentials", "token", "secret", "password", "api_key"];
export declare class JobRejectedError extends Error {
    constructor(message: string);
}
/**
 * Validate a submitted job.
 *
 * Rejects any payload carrying a field that would imply code execution or a
 * credential, at any depth, before schema parsing. A credential in a job body
 * is a mistake worth refusing loudly: credentials belong in the execution
 * plane's own secret mount for the lifetime of one job, never in a record that
 * gets stored and logged.
 */
export declare function validateJob(input: unknown): ExecutionJob;
/** Enforce declared limits against the job's own parameters. */
export declare function assertWithinLimits(job: ExecutionJob): void;
//# sourceMappingURL=job.d.ts.map