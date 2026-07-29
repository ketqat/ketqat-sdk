import { z } from "zod";
export declare const QecExperimentManifestSchema: z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        suite: string;
        version: string;
    }, {
        suite: string;
        version: string;
    }>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
    }, {
        name: string;
        description?: string | undefined;
    }>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        shots: number;
        seed: number;
    }, {
        shots: number;
        seed: number;
    }>;
    metrics: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"QEC">;
    qec: z.ZodObject<{
        experiment_type: z.ZodString;
        code: z.ZodObject<{
            family: z.ZodString;
            distances: z.ZodArray<z.ZodNumber, "many">;
            rounds: z.ZodUnion<[z.ZodLiteral<"distance">, z.ZodNumber]>;
        }, "strip", z.ZodTypeAny, {
            family: string;
            distances: number[];
            rounds: number | "distance";
        }, {
            family: string;
            distances: number[];
            rounds: number | "distance";
        }>;
        noise: z.ZodObject<{
            model: z.ZodString;
            /** Swept. Applied as depolarization after each Clifford. */
            physical_error_rates: z.ZodArray<z.ZodNumber, "many">;
            /**
             * Measurement flip probability, applied before each measurement.
             *
             * On real superconducting devices readout is frequently the *dominant*
             * error, and a decoder benchmarked without it is benchmarked on a model
             * no device matches. It also separates decoders that a pure gate-noise
             * benchmark cannot: matching and maximum-likelihood degrade differently
             * when the syndrome itself is unreliable.
             *
             * Absent means absent, not zero. A run that did not model readout error
             * says so, rather than claiming it measured a device with perfect
             * measurement.
             */
            readout_error_rate: z.ZodOptional<z.ZodNumber>;
            /** Bit-flip probability applied after each reset. */
            reset_error_rate: z.ZodOptional<z.ZodNumber>;
            /**
             * Depolarization applied to data qubits before each round, which is
             * where idling error lives. Distinct from `physical_error_rates`, since
             * a qubit waiting is not a qubit being operated on.
             */
            idle_error_rate: z.ZodOptional<z.ZodNumber>;
            /**
             * Correlated two-qubit depolarization between *neighbouring data
             * qubits*, applied once per round. This is crosstalk: qubits that are
             * not interacting picking up correlated error while they idle.
             *
             * It is `DEPOLARIZE2` rather than a fixed Pauli pair on purpose. A
             * correlated `ZZ` commutes with the memory-Z observable, so a
             * fixed-Pauli crosstalk model reports no effect at all for the default
             * experiment while dominating memory-X. Measured at d=3, 20,000 shots,
             * p=0.02: correlated ZZ gives 2 failures in memory-Z against a baseline
             * of 4, and 4739 in memory-X.
             *
             * Unlike the other rates this one has no `stim.Circuit.generated`
             * argument; the generated circuit is rewritten to carry it.
             */
            crosstalk_error_rate: z.ZodOptional<z.ZodNumber>;
            /**
             * Fractional change in every noise rate per stabilizer round.
             *
             * `rate_r = rate * (1 + drift * r)`, with `r` counting from zero, so
             * 0.1 means the error rate grows ten percent of its initial value each
             * round and round zero is unchanged.
             *
             * Negative values are allowed and model a device improving. Calibration
             * drift is not always downhill, and silently clamping to zero would
             * make one direction unrepresentable.
             *
             * Stim can carry per-round rates; the generated circuits use one
             * `REPEAT` block with fixed ones, so this rewrites the flattened
             * circuit. Not bounded to [0,1]: it is a rate of change, not a
             * probability, though the rates it produces are clamped.
             */
            drift_per_round: z.ZodOptional<z.ZodNumber>;
            /**
             * Amplitude of a correlated random walk on every noise rate, per round.
             *
             * Drift ramps; this wanders. Real calibration does the latter --
             * correlated between nearby rounds, uncorrelated between distant ones,
             * because the underlying parameters follow slow environmental variation
             * rather than a trend.
             *
             * The correlation is the point. A rate resampled independently each
             * round averages out and looks like a slightly different constant; a
             * walk stays somewhere for a while, so a run can spend a stretch in a
             * bad regime. Measured at d=3 over 11 rounds across twelve seeds, this
             * leaves the mean roughly unchanged (87 to 106 failures) while
             * multiplying the run-to-run spread by 16 (range 74-102 becomes
             * 15-507). That spread is the signature, not a shifted mean.
             *
             * The step is multiplicative, so the rate cannot walk negative. Seeded
             * from the coordinate seed, so a stochastic model is still reproducible.
             */
            wander_per_round: z.ZodOptional<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        }, {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        }>;
        decoder: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }>;
        /**
         * Benchmark several decoders against one identical set of syndrome samples
         * (RFC 0006).
         *
         * Optional and absent by default: manifests are hashed, and canonical
         * serialization drops `undefined`, so an absent field leaves every existing
         * manifest hash untouched. Do not give this a default.
         *
         * When present it supersedes `decoder` for execution. Every listed decoder
         * sees the same shots at the same coordinate seed, which is what makes the
         * comparison fair -- decoders benchmarked on different samples are not
         * competitors.
         */
        decoders: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    }, {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    };
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    domain: "QEC";
    qec: {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    };
}, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    } | undefined;
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    domain: "QEC";
    qec: {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    };
}>;
export type QecExperimentManifest = z.infer<typeof QecExperimentManifestSchema>;
export declare const AlgorithmExperimentManifestSchema: z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        suite: string;
        version: string;
    }, {
        suite: string;
        version: string;
    }>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
    }, {
        name: string;
        description?: string | undefined;
    }>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        shots: number;
        seed: number;
    }, {
        shots: number;
        seed: number;
    }>;
    metrics: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"ALGORITHM">;
    algorithm: z.ZodObject<{
        family: z.ZodString;
        problem: z.ZodObject<{
            type: z.ZodString;
            qubit_counts: z.ZodArray<z.ZodNumber, "many">;
            marked_state: z.ZodOptional<z.ZodString>;
            /**
             * Eigenphase to estimate, in [0, 1). Required by `phase-estimation`.
             *
             * A phase that is a dyadic rational -- k/2^n for the register width -- is
             * recovered exactly. Anything else is recovered to the nearest
             * representable bin, and the run records which case it was rather than
             * leaving a reader to infer it from the probability.
             */
            phase: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        }, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        }>;
        execution: z.ZodObject<{
            engine: z.ZodString;
            method: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            engine: string;
            method: string;
        }, {
            engine: string;
            method: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    }, {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    };
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    domain: "ALGORITHM";
    algorithm: {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    };
}, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    } | undefined;
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    domain: "ALGORITHM";
    algorithm: {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    };
}>;
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
    }, "strip", z.ZodTypeAny, {
        suite: string;
        version: string;
    }, {
        suite: string;
        version: string;
    }>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
    }, {
        name: string;
        description?: string | undefined;
    }>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        shots: number;
        seed: number;
    }, {
        shots: number;
        seed: number;
    }>;
    metrics: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"PROTOCOL">;
    protocol: z.ZodObject<{
        name: z.ZodLiteral<"randomized-benchmarking">;
        /** 1 or 2. Standard Clifford RB is defined per qubit count. */
        qubits: z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>]>;
        /**
         * Clifford sequence lengths to sample. Must span enough decay to fit:
         * a set clustered at short lengths fits a line to noise.
         */
        sequence_lengths: z.ZodArray<z.ZodNumber, "many">;
        /**
         * Independent random sequences per length. RB averages over sequences as
         * well as shots -- shots alone measure one sequence very precisely, which
         * is not the quantity RB is defined to report.
         */
        sequences_per_length: z.ZodNumber;
        noise: z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            /** Depolarizing probability applied after each Clifford. */
            depolarizing_rate: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            model: "depolarizing";
            depolarizing_rate: number;
        }, {
            model: "depolarizing";
            depolarizing_rate: number;
        }>;
    }, "strict", z.ZodTypeAny, {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    }, {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    };
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    domain: "PROTOCOL";
    protocol: {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    };
}, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    } | undefined;
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    domain: "PROTOCOL";
    protocol: {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    };
}>;
export type ProtocolExperimentManifest = z.infer<typeof ProtocolExperimentManifestSchema>;
export declare const ExperimentManifestSchema: z.ZodDiscriminatedUnion<"domain", [z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        suite: string;
        version: string;
    }, {
        suite: string;
        version: string;
    }>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
    }, {
        name: string;
        description?: string | undefined;
    }>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        shots: number;
        seed: number;
    }, {
        shots: number;
        seed: number;
    }>;
    metrics: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"QEC">;
    qec: z.ZodObject<{
        experiment_type: z.ZodString;
        code: z.ZodObject<{
            family: z.ZodString;
            distances: z.ZodArray<z.ZodNumber, "many">;
            rounds: z.ZodUnion<[z.ZodLiteral<"distance">, z.ZodNumber]>;
        }, "strip", z.ZodTypeAny, {
            family: string;
            distances: number[];
            rounds: number | "distance";
        }, {
            family: string;
            distances: number[];
            rounds: number | "distance";
        }>;
        noise: z.ZodObject<{
            model: z.ZodString;
            /** Swept. Applied as depolarization after each Clifford. */
            physical_error_rates: z.ZodArray<z.ZodNumber, "many">;
            /**
             * Measurement flip probability, applied before each measurement.
             *
             * On real superconducting devices readout is frequently the *dominant*
             * error, and a decoder benchmarked without it is benchmarked on a model
             * no device matches. It also separates decoders that a pure gate-noise
             * benchmark cannot: matching and maximum-likelihood degrade differently
             * when the syndrome itself is unreliable.
             *
             * Absent means absent, not zero. A run that did not model readout error
             * says so, rather than claiming it measured a device with perfect
             * measurement.
             */
            readout_error_rate: z.ZodOptional<z.ZodNumber>;
            /** Bit-flip probability applied after each reset. */
            reset_error_rate: z.ZodOptional<z.ZodNumber>;
            /**
             * Depolarization applied to data qubits before each round, which is
             * where idling error lives. Distinct from `physical_error_rates`, since
             * a qubit waiting is not a qubit being operated on.
             */
            idle_error_rate: z.ZodOptional<z.ZodNumber>;
            /**
             * Correlated two-qubit depolarization between *neighbouring data
             * qubits*, applied once per round. This is crosstalk: qubits that are
             * not interacting picking up correlated error while they idle.
             *
             * It is `DEPOLARIZE2` rather than a fixed Pauli pair on purpose. A
             * correlated `ZZ` commutes with the memory-Z observable, so a
             * fixed-Pauli crosstalk model reports no effect at all for the default
             * experiment while dominating memory-X. Measured at d=3, 20,000 shots,
             * p=0.02: correlated ZZ gives 2 failures in memory-Z against a baseline
             * of 4, and 4739 in memory-X.
             *
             * Unlike the other rates this one has no `stim.Circuit.generated`
             * argument; the generated circuit is rewritten to carry it.
             */
            crosstalk_error_rate: z.ZodOptional<z.ZodNumber>;
            /**
             * Fractional change in every noise rate per stabilizer round.
             *
             * `rate_r = rate * (1 + drift * r)`, with `r` counting from zero, so
             * 0.1 means the error rate grows ten percent of its initial value each
             * round and round zero is unchanged.
             *
             * Negative values are allowed and model a device improving. Calibration
             * drift is not always downhill, and silently clamping to zero would
             * make one direction unrepresentable.
             *
             * Stim can carry per-round rates; the generated circuits use one
             * `REPEAT` block with fixed ones, so this rewrites the flattened
             * circuit. Not bounded to [0,1]: it is a rate of change, not a
             * probability, though the rates it produces are clamped.
             */
            drift_per_round: z.ZodOptional<z.ZodNumber>;
            /**
             * Amplitude of a correlated random walk on every noise rate, per round.
             *
             * Drift ramps; this wanders. Real calibration does the latter --
             * correlated between nearby rounds, uncorrelated between distant ones,
             * because the underlying parameters follow slow environmental variation
             * rather than a trend.
             *
             * The correlation is the point. A rate resampled independently each
             * round averages out and looks like a slightly different constant; a
             * walk stays somewhere for a while, so a run can spend a stretch in a
             * bad regime. Measured at d=3 over 11 rounds across twelve seeds, this
             * leaves the mean roughly unchanged (87 to 106 failures) while
             * multiplying the run-to-run spread by 16 (range 74-102 becomes
             * 15-507). That spread is the signature, not a shifted mean.
             *
             * The step is multiplicative, so the rate cannot walk negative. Seeded
             * from the coordinate seed, so a stochastic model is still reproducible.
             */
            wander_per_round: z.ZodOptional<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        }, {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        }>;
        decoder: z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }>;
        /**
         * Benchmark several decoders against one identical set of syndrome samples
         * (RFC 0006).
         *
         * Optional and absent by default: manifests are hashed, and canonical
         * serialization drops `undefined`, so an absent field leaves every existing
         * manifest hash untouched. Do not give this a default.
         *
         * When present it supersedes `decoder` for execution. Every listed decoder
         * sees the same shots at the same coordinate seed, which is what makes the
         * comparison fair -- decoders benchmarked on different samples are not
         * competitors.
         */
        decoders: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }, {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    }, {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    };
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    domain: "QEC";
    qec: {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    };
}, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    } | undefined;
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    domain: "QEC";
    qec: {
        experiment_type: string;
        code: {
            family: string;
            distances: number[];
            rounds: number | "distance";
        };
        noise: {
            model: string;
            physical_error_rates: number[];
            readout_error_rate?: number | undefined;
            reset_error_rate?: number | undefined;
            idle_error_rate?: number | undefined;
            crosstalk_error_rate?: number | undefined;
            drift_per_round?: number | undefined;
            wander_per_round?: number | undefined;
        };
        decoder: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        };
        decoders?: {
            name: string;
            version?: string | undefined;
            options?: Record<string, unknown> | undefined;
        }[] | undefined;
    };
}>, z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        suite: string;
        version: string;
    }, {
        suite: string;
        version: string;
    }>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
    }, {
        name: string;
        description?: string | undefined;
    }>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        shots: number;
        seed: number;
    }, {
        shots: number;
        seed: number;
    }>;
    metrics: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"ALGORITHM">;
    algorithm: z.ZodObject<{
        family: z.ZodString;
        problem: z.ZodObject<{
            type: z.ZodString;
            qubit_counts: z.ZodArray<z.ZodNumber, "many">;
            marked_state: z.ZodOptional<z.ZodString>;
            /**
             * Eigenphase to estimate, in [0, 1). Required by `phase-estimation`.
             *
             * A phase that is a dyadic rational -- k/2^n for the register width -- is
             * recovered exactly. Anything else is recovered to the nearest
             * representable bin, and the run records which case it was rather than
             * leaving a reader to infer it from the probability.
             */
            phase: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        }, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        }>;
        execution: z.ZodObject<{
            engine: z.ZodString;
            method: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            engine: string;
            method: string;
        }, {
            engine: string;
            method: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    }, {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    };
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    domain: "ALGORITHM";
    algorithm: {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    };
}, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    } | undefined;
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    domain: "ALGORITHM";
    algorithm: {
        family: string;
        problem: {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
            phase?: number | undefined;
        };
        execution: {
            engine: string;
            method: string;
        };
    };
}>, z.ZodObject<{
    schema_version: z.ZodString;
    benchmark: z.ZodObject<{
        suite: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        suite: string;
        version: string;
    }, {
        suite: string;
        version: string;
    }>;
    experiment: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
    }, {
        name: string;
        description?: string | undefined;
    }>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    }>>;
    sampling: z.ZodObject<{
        shots: z.ZodNumber;
        seed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        shots: number;
        seed: number;
    }, {
        shots: number;
        seed: number;
    }>;
    metrics: z.ZodArray<z.ZodString, "many">;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"PROTOCOL">;
    protocol: z.ZodObject<{
        name: z.ZodLiteral<"randomized-benchmarking">;
        /** 1 or 2. Standard Clifford RB is defined per qubit count. */
        qubits: z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>]>;
        /**
         * Clifford sequence lengths to sample. Must span enough decay to fit:
         * a set clustered at short lengths fits a line to noise.
         */
        sequence_lengths: z.ZodArray<z.ZodNumber, "many">;
        /**
         * Independent random sequences per length. RB averages over sequences as
         * well as shots -- shots alone measure one sequence very precisely, which
         * is not the quantity RB is defined to report.
         */
        sequences_per_length: z.ZodNumber;
        noise: z.ZodObject<{
            model: z.ZodLiteral<"depolarizing">;
            /** Depolarizing probability applied after each Clifford. */
            depolarizing_rate: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            model: "depolarizing";
            depolarizing_rate: number;
        }, {
            model: "depolarizing";
            depolarizing_rate: number;
        }>;
    }, "strict", z.ZodTypeAny, {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    }, {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    };
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    domain: "PROTOCOL";
    protocol: {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    };
}, {
    schema_version: string;
    benchmark: {
        suite: string;
        version: string;
    };
    experiment: {
        name: string;
        description?: string | undefined;
    };
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
    } | undefined;
    sampling: {
        shots: number;
        seed: number;
    };
    metrics: string[];
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    domain: "PROTOCOL";
    protocol: {
        name: "randomized-benchmarking";
        qubits: 1 | 2;
        sequence_lengths: number[];
        sequences_per_length: number;
        noise: {
            model: "depolarizing";
            depolarizing_rate: number;
        };
    };
}>]>;
export type ExperimentManifest = z.infer<typeof ExperimentManifestSchema>;
//# sourceMappingURL=experiment-manifest.d.ts.map