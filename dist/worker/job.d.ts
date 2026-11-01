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
export declare const JobOperationSchema: z.ZodEnum<{
    check_equivalence: "check_equivalence";
    estimate_resources: "estimate_resources";
    mitigate_zne: "mitigate_zne";
    optimize_zx: "optimize_zx";
    simulate: "simulate";
    transpile: "transpile";
}>;
export type JobOperation = z.infer<typeof JobOperationSchema>;
export declare const JobLimitsSchema: z.ZodObject<{
    timeout_seconds: z.ZodDefault<z.ZodNumber>;
    max_qubits: z.ZodDefault<z.ZodNumber>;
    max_shots: z.ZodDefault<z.ZodNumber>;
    max_result_bytes: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type JobLimits = z.infer<typeof JobLimitsSchema>;
export declare const JobParametersSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    qasm: z.ZodString;
    operation: z.ZodLiteral<"simulate">;
    shots: z.ZodOptional<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodNumber>;
    noise: z.ZodOptional<z.ZodObject<{
        model: z.ZodLiteral<"depolarizing">;
        one_qubit_error: z.ZodDefault<z.ZodNumber>;
        two_qubit_error: z.ZodDefault<z.ZodNumber>;
        readout_error: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strip>, z.ZodObject<{
    qasm: z.ZodString;
    operation: z.ZodLiteral<"transpile">;
    hardware_profile: z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    qasm: z.ZodString;
    operation: z.ZodLiteral<"estimate_resources">;
    hardware_profile: z.ZodOptional<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    qasm: z.ZodString;
    operation: z.ZodLiteral<"optimize_zx">;
}, z.core.$strip>, z.ZodObject<{
    operation: z.ZodLiteral<"check_equivalence">;
    left_qasm: z.ZodString;
    right_qasm: z.ZodString;
    tolerance: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    qasm: z.ZodString;
    operation: z.ZodLiteral<"mitigate_zne">;
    noise: z.ZodObject<{
        model: z.ZodLiteral<"depolarizing">;
        one_qubit_error: z.ZodDefault<z.ZodNumber>;
        two_qubit_error: z.ZodDefault<z.ZodNumber>;
        readout_error: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    shots: z.ZodOptional<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>], "operation">;
export type JobParameters = z.infer<typeof JobParametersSchema>;
export declare const ExecutionJobSchema: z.ZodObject<{
    schema_version: z.ZodString;
    job_id: z.ZodString;
    idempotency_key: z.ZodString;
    submitted_by: z.ZodString;
    parameters: z.ZodDiscriminatedUnion<[z.ZodObject<{
        qasm: z.ZodString;
        operation: z.ZodLiteral<"simulate">;
        shots: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
        noise: z.ZodOptional<z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            one_qubit_error: z.ZodDefault<z.ZodNumber>;
            two_qubit_error: z.ZodDefault<z.ZodNumber>;
            readout_error: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strip>, z.ZodObject<{
        qasm: z.ZodString;
        operation: z.ZodLiteral<"transpile">;
        hardware_profile: z.ZodObject<{
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
    }, z.core.$strip>, z.ZodObject<{
        qasm: z.ZodString;
        operation: z.ZodLiteral<"estimate_resources">;
        hardware_profile: z.ZodOptional<z.ZodObject<{
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
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        qasm: z.ZodString;
        operation: z.ZodLiteral<"optimize_zx">;
    }, z.core.$strip>, z.ZodObject<{
        operation: z.ZodLiteral<"check_equivalence">;
        left_qasm: z.ZodString;
        right_qasm: z.ZodString;
        tolerance: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        qasm: z.ZodString;
        operation: z.ZodLiteral<"mitigate_zne">;
        noise: z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            one_qubit_error: z.ZodDefault<z.ZodNumber>;
            two_qubit_error: z.ZodDefault<z.ZodNumber>;
            readout_error: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        shots: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>], "operation">;
    limits: z.ZodPrefault<z.ZodObject<{
        timeout_seconds: z.ZodDefault<z.ZodNumber>;
        max_qubits: z.ZodDefault<z.ZodNumber>;
        max_shots: z.ZodDefault<z.ZodNumber>;
        max_result_bytes: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ExecutionJob = z.infer<typeof ExecutionJobSchema>;
export declare const JobStatusSchema: z.ZodEnum<{
    CANCELLED: "CANCELLED";
    FAILED: "FAILED";
    QUEUED: "QUEUED";
    RUNNING: "RUNNING";
    SUCCEEDED: "SUCCEEDED";
    TIMED_OUT: "TIMED_OUT";
}>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export declare const JobResultSchema: z.ZodObject<{
    schema_version: z.ZodString;
    job_id: z.ZodString;
    status: z.ZodEnum<{
        CANCELLED: "CANCELLED";
        FAILED: "FAILED";
        QUEUED: "QUEUED";
        RUNNING: "RUNNING";
        SUCCEEDED: "SUCCEEDED";
        TIMED_OUT: "TIMED_OUT";
    }>;
    operation: z.ZodEnum<{
        check_equivalence: "check_equivalence";
        estimate_resources: "estimate_resources";
        mitigate_zne: "mitigate_zne";
        optimize_zx: "optimize_zx";
        simulate: "simulate";
        transpile: "transpile";
    }>;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    error: z.ZodOptional<z.ZodString>;
    started_at: z.ZodString;
    finished_at: z.ZodString;
    duration_ms: z.ZodNumber;
    execution_class: z.ZodLiteral<"SIMULATION">;
    worker_version: z.ZodString;
}, z.core.$strip>;
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