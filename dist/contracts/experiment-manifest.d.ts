import { z } from "zod";
export declare const QecExperimentManifestSchema: z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, z.core.$strip>;
    metrics: z.ZodArray<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    domain: z.ZodLiteral<"QEC">;
    qec: z.ZodObject<{
        experiment_type: z.ZodString;
        code: z.ZodObject<{
            family: z.ZodString;
            distances: z.ZodArray<z.ZodNumber>;
            rounds: z.ZodUnion<readonly [z.ZodLiteral<"distance">, z.ZodNumber]>;
        }, z.core.$strip>;
        noise: z.ZodObject<{
            model: z.ZodString;
            physical_error_rates: z.ZodArray<z.ZodNumber>;
            readout_error_rate: z.ZodOptional<z.ZodNumber>;
            reset_error_rate: z.ZodOptional<z.ZodNumber>;
            idle_error_rate: z.ZodOptional<z.ZodNumber>;
            crosstalk_error_rate: z.ZodOptional<z.ZodNumber>;
            drift_per_round: z.ZodOptional<z.ZodNumber>;
            wander_per_round: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        decoder: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        decoders: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type QecExperimentManifest = z.infer<typeof QecExperimentManifestSchema>;
export declare const AlgorithmExperimentManifestSchema: z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, z.core.$strip>;
    metrics: z.ZodArray<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    domain: z.ZodLiteral<"ALGORITHM">;
    algorithm: z.ZodObject<{
        family: z.ZodString;
        problem: z.ZodObject<{
            type: z.ZodString;
            qubit_counts: z.ZodArray<z.ZodNumber>;
            marked_state: z.ZodOptional<z.ZodString>;
            phase: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
        execution: z.ZodObject<{
            engine: z.ZodString;
            method: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AlgorithmExperimentManifest = z.infer<typeof AlgorithmExperimentManifestSchema>;
/**
 * Characterisation protocols: randomized benchmarking today, with room for
 * interleaved RB and quantum volume.
 *
 * A separate domain rather than an `ALGORITHM` family, because the output is
 * not a success probability on a problem instance. RB reports a decay parameter
 * fitted across sequence lengths, and a contract that called it an algorithm
 * would have no place to put the fit or its uncertainty.
 */
export declare const ProtocolExperimentManifestSchema: z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, z.core.$strip>;
    metrics: z.ZodArray<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    domain: z.ZodLiteral<"PROTOCOL">;
    protocol: z.ZodObject<{
        name: z.ZodLiteral<"randomized-benchmarking">;
        qubits: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
        sequence_lengths: z.ZodArray<z.ZodNumber>;
        sequences_per_length: z.ZodNumber;
        noise: z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            depolarizing_rate: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
}, z.core.$strip>;
export type ProtocolExperimentManifest = z.infer<typeof ProtocolExperimentManifestSchema>;
export declare const ExperimentManifestSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, z.core.$strip>;
    metrics: z.ZodArray<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    domain: z.ZodLiteral<"QEC">;
    qec: z.ZodObject<{
        experiment_type: z.ZodString;
        code: z.ZodObject<{
            family: z.ZodString;
            distances: z.ZodArray<z.ZodNumber>;
            rounds: z.ZodUnion<readonly [z.ZodLiteral<"distance">, z.ZodNumber]>;
        }, z.core.$strip>;
        noise: z.ZodObject<{
            model: z.ZodString;
            physical_error_rates: z.ZodArray<z.ZodNumber>;
            readout_error_rate: z.ZodOptional<z.ZodNumber>;
            reset_error_rate: z.ZodOptional<z.ZodNumber>;
            idle_error_rate: z.ZodOptional<z.ZodNumber>;
            crosstalk_error_rate: z.ZodOptional<z.ZodNumber>;
            drift_per_round: z.ZodOptional<z.ZodNumber>;
            wander_per_round: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
        decoder: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
        decoders: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, z.core.$strip>;
    metrics: z.ZodArray<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    domain: z.ZodLiteral<"ALGORITHM">;
    algorithm: z.ZodObject<{
        family: z.ZodString;
        problem: z.ZodObject<{
            type: z.ZodString;
            qubit_counts: z.ZodArray<z.ZodNumber>;
            marked_state: z.ZodOptional<z.ZodString>;
            phase: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
        execution: z.ZodObject<{
            engine: z.ZodString;
            method: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, z.core.$strip>;
    metrics: z.ZodArray<z.ZodString>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    domain: z.ZodLiteral<"PROTOCOL">;
    protocol: z.ZodObject<{
        name: z.ZodLiteral<"randomized-benchmarking">;
        qubits: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
        sequence_lengths: z.ZodArray<z.ZodNumber>;
        sequences_per_length: z.ZodNumber;
        noise: z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            depolarizing_rate: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
}, z.core.$strip>], "domain">;
export type ExperimentManifest = z.infer<typeof ExperimentManifestSchema>;
//# sourceMappingURL=experiment-manifest.d.ts.map