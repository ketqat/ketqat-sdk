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
            physical_error_rates: z.ZodArray<z.ZodNumber, "many">;
        }, "strip", z.ZodTypeAny, {
            model: string;
            physical_error_rates: number[];
        }, {
            model: string;
            physical_error_rates: number[];
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
        }, "strip", z.ZodTypeAny, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
        }, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
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
        };
        execution: {
            engine: string;
            method: string;
        };
    };
}>;
export type AlgorithmExperimentManifest = z.infer<typeof AlgorithmExperimentManifestSchema>;
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
            physical_error_rates: z.ZodArray<z.ZodNumber, "many">;
        }, "strip", z.ZodTypeAny, {
            model: string;
            physical_error_rates: number[];
        }, {
            model: string;
            physical_error_rates: number[];
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
        }, "strip", z.ZodTypeAny, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
        }, {
            type: string;
            qubit_counts: number[];
            marked_state?: string | undefined;
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
        };
        execution: {
            engine: string;
            method: string;
        };
    };
}>]>;
export type ExperimentManifest = z.infer<typeof ExperimentManifestSchema>;
//# sourceMappingURL=experiment-manifest.d.ts.map