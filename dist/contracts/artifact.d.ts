import { z } from "zod";
export declare const QecArtifactMetadataSchema: z.ZodObject<{
    code_families: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    supported_distances: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
    decoder_family: z.ZodOptional<z.ZodString>;
    noise_models: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    syndrome_format: z.ZodOptional<z.ZodString>;
    decoder_interface_version: z.ZodOptional<z.ZodString>;
    supported_experiment_types: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    supported_distances: number[];
    code_families: string[];
    noise_models: string[];
    supported_experiment_types: string[];
    decoder_family?: string | undefined;
    syndrome_format?: string | undefined;
    decoder_interface_version?: string | undefined;
}, {
    supported_distances?: number[] | undefined;
    code_families?: string[] | undefined;
    decoder_family?: string | undefined;
    noise_models?: string[] | undefined;
    syndrome_format?: string | undefined;
    decoder_interface_version?: string | undefined;
    supported_experiment_types?: string[] | undefined;
}>;
export type QecArtifactMetadata = z.infer<typeof QecArtifactMetadataSchema>;
export declare const AlgorithmArtifactMetadataSchema: z.ZodObject<{
    algorithm_family: z.ZodOptional<z.ZodString>;
    problem_domains: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    supported_input_types: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    supported_qubit_ranges: z.ZodDefault<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, "many">>;
    classical_reference_available: z.ZodDefault<z.ZodBoolean>;
    simulator_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    problem_domains: string[];
    supported_input_types: string[];
    supported_qubit_ranges: [number, number][];
    classical_reference_available: boolean;
    simulator_requirements: string[];
    frameworks: string[];
    algorithm_family?: string | undefined;
}, {
    algorithm_family?: string | undefined;
    problem_domains?: string[] | undefined;
    supported_input_types?: string[] | undefined;
    supported_qubit_ranges?: [number, number][] | undefined;
    classical_reference_available?: boolean | undefined;
    simulator_requirements?: string[] | undefined;
    frameworks?: string[] | undefined;
}>;
export type AlgorithmArtifactMetadata = z.infer<typeof AlgorithmArtifactMetadataSchema>;
export declare const QecArtifactSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    repository_url: z.ZodOptional<z.ZodString>;
    repository_owner: z.ZodOptional<z.ZodString>;
    repository_name: z.ZodOptional<z.ZodString>;
    default_branch: z.ZodDefault<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    latest_commit_sha: z.ZodOptional<z.ZodString>;
    reference_paper_url: z.ZodOptional<z.ZodString>;
    citation: z.ZodOptional<z.ZodObject<{
        title: z.ZodString;
        authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        year: z.ZodOptional<z.ZodNumber>;
        doi: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        bibtex: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }, {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }>>;
    is_demo: z.ZodBoolean;
    verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    artifact_type: z.ZodOptional<z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>>;
    quantum_card: z.ZodOptional<z.ZodObject<{
        schema_version: z.ZodString;
        name: z.ZodString;
        slug: z.ZodString;
        version: z.ZodString;
        artifact_type: z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>;
        description: z.ZodString;
        problem_definition: z.ZodString;
        category: z.ZodOptional<z.ZodString>;
        provenance: z.ZodObject<{
            source_repository_url: z.ZodOptional<z.ZodString>;
            commit_sha: z.ZodOptional<z.ZodString>;
            license: z.ZodString;
            authors: z.ZodArray<z.ZodString, "many">;
            contributors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            citation: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                year: z.ZodOptional<z.ZodNumber>;
                doi: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                bibtex: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }, {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }>>;
            reference_papers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        }, {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        }>;
        interface: z.ZodDefault<z.ZodObject<{
            supported_frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_input_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_output_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        }, {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        }>>;
        applicability: z.ZodDefault<z.ZodObject<{
            qubit_range: z.ZodOptional<z.ZodEffects<z.ZodObject<{
                minimum: z.ZodNumber;
                maximum: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>>;
            gate_set: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            classical_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        }, {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        }>>;
        assumptions: z.ZodObject<{
            resource: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            noise: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            hardware: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            other: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        }, {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        }>;
        known_limitations: z.ZodArray<z.ZodString, "many">;
        verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "SCHEMA_VALIDATED", "HASH_VERIFIED", "SOURCE_VERIFIED", "ENVIRONMENT_RECORDED", "REPRODUCED", "INDEPENDENTLY_REPRODUCED", "REVIEWED"]>>;
        security_notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        example_commands: z.ZodDefault<z.ZodArray<z.ZodObject<{
            description: z.ZodString;
            command: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            description: string;
            command: string;
        }, {
            description: string;
            command: string;
        }>, "many">>;
        benchmark_compatibility: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"QEC">;
    kind: z.ZodEnum<["QEC_DECODER", "QEC_CODE", "NOISE_MODEL", "SYNDROME_DATASET", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>;
    qec: z.ZodObject<{
        code_families: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        supported_distances: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        decoder_family: z.ZodOptional<z.ZodString>;
        noise_models: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        syndrome_format: z.ZodOptional<z.ZodString>;
        decoder_interface_version: z.ZodOptional<z.ZodString>;
        supported_experiment_types: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        supported_distances: number[];
        code_families: string[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    }, {
        supported_distances?: number[] | undefined;
        code_families?: string[] | undefined;
        decoder_family?: string | undefined;
        noise_models?: string[] | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
        supported_experiment_types?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    authors: string[];
    name: string;
    description: string;
    slug: string;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "QEC";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    qec: {
        supported_distances: number[];
        code_families: string[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    };
    license?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    slug: string;
    created_at: string;
    updated_at: string;
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "QEC";
    is_demo: boolean;
    qec: {
        supported_distances?: number[] | undefined;
        code_families?: string[] | undefined;
        decoder_family?: string | undefined;
        noise_models?: string[] | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
        supported_experiment_types?: string[] | undefined;
    };
    authors?: string[] | undefined;
    license?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}>;
export type QecArtifact = z.infer<typeof QecArtifactSchema>;
export declare const AlgorithmArtifactSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    repository_url: z.ZodOptional<z.ZodString>;
    repository_owner: z.ZodOptional<z.ZodString>;
    repository_name: z.ZodOptional<z.ZodString>;
    default_branch: z.ZodDefault<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    latest_commit_sha: z.ZodOptional<z.ZodString>;
    reference_paper_url: z.ZodOptional<z.ZodString>;
    citation: z.ZodOptional<z.ZodObject<{
        title: z.ZodString;
        authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        year: z.ZodOptional<z.ZodNumber>;
        doi: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        bibtex: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }, {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }>>;
    is_demo: z.ZodBoolean;
    verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    artifact_type: z.ZodOptional<z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>>;
    quantum_card: z.ZodOptional<z.ZodObject<{
        schema_version: z.ZodString;
        name: z.ZodString;
        slug: z.ZodString;
        version: z.ZodString;
        artifact_type: z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>;
        description: z.ZodString;
        problem_definition: z.ZodString;
        category: z.ZodOptional<z.ZodString>;
        provenance: z.ZodObject<{
            source_repository_url: z.ZodOptional<z.ZodString>;
            commit_sha: z.ZodOptional<z.ZodString>;
            license: z.ZodString;
            authors: z.ZodArray<z.ZodString, "many">;
            contributors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            citation: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                year: z.ZodOptional<z.ZodNumber>;
                doi: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                bibtex: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }, {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }>>;
            reference_papers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        }, {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        }>;
        interface: z.ZodDefault<z.ZodObject<{
            supported_frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_input_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_output_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        }, {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        }>>;
        applicability: z.ZodDefault<z.ZodObject<{
            qubit_range: z.ZodOptional<z.ZodEffects<z.ZodObject<{
                minimum: z.ZodNumber;
                maximum: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>>;
            gate_set: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            classical_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        }, {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        }>>;
        assumptions: z.ZodObject<{
            resource: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            noise: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            hardware: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            other: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        }, {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        }>;
        known_limitations: z.ZodArray<z.ZodString, "many">;
        verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "SCHEMA_VALIDATED", "HASH_VERIFIED", "SOURCE_VERIFIED", "ENVIRONMENT_RECORDED", "REPRODUCED", "INDEPENDENTLY_REPRODUCED", "REVIEWED"]>>;
        security_notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        example_commands: z.ZodDefault<z.ZodArray<z.ZodObject<{
            description: z.ZodString;
            command: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            description: string;
            command: string;
        }, {
            description: string;
            command: string;
        }>, "many">>;
        benchmark_compatibility: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"ALGORITHM">;
    kind: z.ZodEnum<["QUANTUM_ALGORITHM", "PROBLEM_INSTANCE", "CLASSICAL_REFERENCE", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>;
    algorithm: z.ZodObject<{
        algorithm_family: z.ZodOptional<z.ZodString>;
        problem_domains: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        supported_input_types: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        supported_qubit_ranges: z.ZodDefault<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, "many">>;
        classical_reference_available: z.ZodDefault<z.ZodBoolean>;
        simulator_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        problem_domains: string[];
        supported_input_types: string[];
        supported_qubit_ranges: [number, number][];
        classical_reference_available: boolean;
        simulator_requirements: string[];
        frameworks: string[];
        algorithm_family?: string | undefined;
    }, {
        algorithm_family?: string | undefined;
        problem_domains?: string[] | undefined;
        supported_input_types?: string[] | undefined;
        supported_qubit_ranges?: [number, number][] | undefined;
        classical_reference_available?: boolean | undefined;
        simulator_requirements?: string[] | undefined;
        frameworks?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    authors: string[];
    name: string;
    description: string;
    slug: string;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "ALGORITHM";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    algorithm: {
        problem_domains: string[];
        supported_input_types: string[];
        supported_qubit_ranges: [number, number][];
        classical_reference_available: boolean;
        simulator_requirements: string[];
        frameworks: string[];
        algorithm_family?: string | undefined;
    };
    license?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    slug: string;
    created_at: string;
    updated_at: string;
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "ALGORITHM";
    is_demo: boolean;
    algorithm: {
        algorithm_family?: string | undefined;
        problem_domains?: string[] | undefined;
        supported_input_types?: string[] | undefined;
        supported_qubit_ranges?: [number, number][] | undefined;
        classical_reference_available?: boolean | undefined;
        simulator_requirements?: string[] | undefined;
        frameworks?: string[] | undefined;
    };
    authors?: string[] | undefined;
    license?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}>;
export type AlgorithmArtifact = z.infer<typeof AlgorithmArtifactSchema>;
export declare const ArtifactSchema: z.ZodDiscriminatedUnion<"domain", [z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    repository_url: z.ZodOptional<z.ZodString>;
    repository_owner: z.ZodOptional<z.ZodString>;
    repository_name: z.ZodOptional<z.ZodString>;
    default_branch: z.ZodDefault<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    latest_commit_sha: z.ZodOptional<z.ZodString>;
    reference_paper_url: z.ZodOptional<z.ZodString>;
    citation: z.ZodOptional<z.ZodObject<{
        title: z.ZodString;
        authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        year: z.ZodOptional<z.ZodNumber>;
        doi: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        bibtex: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }, {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }>>;
    is_demo: z.ZodBoolean;
    verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    artifact_type: z.ZodOptional<z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>>;
    quantum_card: z.ZodOptional<z.ZodObject<{
        schema_version: z.ZodString;
        name: z.ZodString;
        slug: z.ZodString;
        version: z.ZodString;
        artifact_type: z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>;
        description: z.ZodString;
        problem_definition: z.ZodString;
        category: z.ZodOptional<z.ZodString>;
        provenance: z.ZodObject<{
            source_repository_url: z.ZodOptional<z.ZodString>;
            commit_sha: z.ZodOptional<z.ZodString>;
            license: z.ZodString;
            authors: z.ZodArray<z.ZodString, "many">;
            contributors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            citation: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                year: z.ZodOptional<z.ZodNumber>;
                doi: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                bibtex: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }, {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }>>;
            reference_papers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        }, {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        }>;
        interface: z.ZodDefault<z.ZodObject<{
            supported_frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_input_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_output_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        }, {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        }>>;
        applicability: z.ZodDefault<z.ZodObject<{
            qubit_range: z.ZodOptional<z.ZodEffects<z.ZodObject<{
                minimum: z.ZodNumber;
                maximum: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>>;
            gate_set: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            classical_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        }, {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        }>>;
        assumptions: z.ZodObject<{
            resource: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            noise: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            hardware: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            other: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        }, {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        }>;
        known_limitations: z.ZodArray<z.ZodString, "many">;
        verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "SCHEMA_VALIDATED", "HASH_VERIFIED", "SOURCE_VERIFIED", "ENVIRONMENT_RECORDED", "REPRODUCED", "INDEPENDENTLY_REPRODUCED", "REVIEWED"]>>;
        security_notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        example_commands: z.ZodDefault<z.ZodArray<z.ZodObject<{
            description: z.ZodString;
            command: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            description: string;
            command: string;
        }, {
            description: string;
            command: string;
        }>, "many">>;
        benchmark_compatibility: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"QEC">;
    kind: z.ZodEnum<["QEC_DECODER", "QEC_CODE", "NOISE_MODEL", "SYNDROME_DATASET", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>;
    qec: z.ZodObject<{
        code_families: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        supported_distances: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        decoder_family: z.ZodOptional<z.ZodString>;
        noise_models: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        syndrome_format: z.ZodOptional<z.ZodString>;
        decoder_interface_version: z.ZodOptional<z.ZodString>;
        supported_experiment_types: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        supported_distances: number[];
        code_families: string[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    }, {
        supported_distances?: number[] | undefined;
        code_families?: string[] | undefined;
        decoder_family?: string | undefined;
        noise_models?: string[] | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
        supported_experiment_types?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    authors: string[];
    name: string;
    description: string;
    slug: string;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "QEC";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    qec: {
        supported_distances: number[];
        code_families: string[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    };
    license?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    slug: string;
    created_at: string;
    updated_at: string;
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "QEC";
    is_demo: boolean;
    qec: {
        supported_distances?: number[] | undefined;
        code_families?: string[] | undefined;
        decoder_family?: string | undefined;
        noise_models?: string[] | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
        supported_experiment_types?: string[] | undefined;
    };
    authors?: string[] | undefined;
    license?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    repository_url: z.ZodOptional<z.ZodString>;
    repository_owner: z.ZodOptional<z.ZodString>;
    repository_name: z.ZodOptional<z.ZodString>;
    default_branch: z.ZodDefault<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    latest_commit_sha: z.ZodOptional<z.ZodString>;
    reference_paper_url: z.ZodOptional<z.ZodString>;
    citation: z.ZodOptional<z.ZodObject<{
        title: z.ZodString;
        authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        year: z.ZodOptional<z.ZodNumber>;
        doi: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        bibtex: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }, {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    }>>;
    is_demo: z.ZodBoolean;
    verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    artifact_type: z.ZodOptional<z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>>;
    quantum_card: z.ZodOptional<z.ZodObject<{
        schema_version: z.ZodString;
        name: z.ZodString;
        slug: z.ZodString;
        version: z.ZodString;
        artifact_type: z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>;
        description: z.ZodString;
        problem_definition: z.ZodString;
        category: z.ZodOptional<z.ZodString>;
        provenance: z.ZodObject<{
            source_repository_url: z.ZodOptional<z.ZodString>;
            commit_sha: z.ZodOptional<z.ZodString>;
            license: z.ZodString;
            authors: z.ZodArray<z.ZodString, "many">;
            contributors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            citation: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                year: z.ZodOptional<z.ZodNumber>;
                doi: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                bibtex: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }, {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            }>>;
            reference_papers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        }, {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        }>;
        interface: z.ZodDefault<z.ZodObject<{
            supported_frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_input_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            supported_output_formats: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        }, {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        }>>;
        applicability: z.ZodDefault<z.ZodObject<{
            qubit_range: z.ZodOptional<z.ZodEffects<z.ZodObject<{
                minimum: z.ZodNumber;
                maximum: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>, {
                minimum: number;
                maximum?: number | undefined;
            }, {
                minimum: number;
                maximum?: number | undefined;
            }>>;
            gate_set: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            classical_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        }, {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        }>>;
        assumptions: z.ZodObject<{
            resource: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            noise: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            hardware: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            other: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        }, {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        }>;
        known_limitations: z.ZodArray<z.ZodString, "many">;
        verification_status: z.ZodDefault<z.ZodEnum<["UNVERIFIED", "SCHEMA_VALIDATED", "HASH_VERIFIED", "SOURCE_VERIFIED", "ENVIRONMENT_RECORDED", "REPRODUCED", "INDEPENDENTLY_REPRODUCED", "REVIEWED"]>>;
        security_notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        example_commands: z.ZodDefault<z.ZodArray<z.ZodObject<{
            description: z.ZodString;
            command: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            description: string;
            command: string;
        }, {
            description: string;
            command: string;
        }>, "many">>;
        benchmark_compatibility: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }, {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    }>>;
} & {
    domain: z.ZodLiteral<"ALGORITHM">;
    kind: z.ZodEnum<["QUANTUM_ALGORITHM", "PROBLEM_INSTANCE", "CLASSICAL_REFERENCE", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>;
    algorithm: z.ZodObject<{
        algorithm_family: z.ZodOptional<z.ZodString>;
        problem_domains: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        supported_input_types: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        supported_qubit_ranges: z.ZodDefault<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, "many">>;
        classical_reference_available: z.ZodDefault<z.ZodBoolean>;
        simulator_requirements: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        problem_domains: string[];
        supported_input_types: string[];
        supported_qubit_ranges: [number, number][];
        classical_reference_available: boolean;
        simulator_requirements: string[];
        frameworks: string[];
        algorithm_family?: string | undefined;
    }, {
        algorithm_family?: string | undefined;
        problem_domains?: string[] | undefined;
        supported_input_types?: string[] | undefined;
        supported_qubit_ranges?: [number, number][] | undefined;
        classical_reference_available?: boolean | undefined;
        simulator_requirements?: string[] | undefined;
        frameworks?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    authors: string[];
    name: string;
    description: string;
    slug: string;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "ALGORITHM";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    algorithm: {
        problem_domains: string[];
        supported_input_types: string[];
        supported_qubit_ranges: [number, number][];
        classical_reference_available: boolean;
        simulator_requirements: string[];
        frameworks: string[];
        algorithm_family?: string | undefined;
    };
    license?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            contributors: string[];
            reference_papers: string[];
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            citation?: {
                title: string;
                authors: string[];
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
        };
        interface: {
            supported_frameworks: string[];
            supported_input_formats: string[];
            supported_output_formats: string[];
        };
        applicability: {
            gate_set: string[];
            classical_requirements: string[];
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
        };
        assumptions: {
            hardware: string[];
            resource: string[];
            noise: string[];
            other: string[];
        };
        known_limitations: string[];
        verification_status: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED";
        security_notes: string[];
        example_commands: {
            description: string;
            command: string;
        }[];
        benchmark_compatibility: string[];
        category?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    slug: string;
    created_at: string;
    updated_at: string;
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    id: string;
    domain: "ALGORITHM";
    is_demo: boolean;
    algorithm: {
        algorithm_family?: string | undefined;
        problem_domains?: string[] | undefined;
        supported_input_types?: string[] | undefined;
        supported_qubit_ranges?: [number, number][] | undefined;
        classical_reference_available?: boolean | undefined;
        simulator_requirements?: string[] | undefined;
        frameworks?: string[] | undefined;
    };
    authors?: string[] | undefined;
    license?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    artifact_type?: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE" | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    quantum_card?: {
        name: string;
        description: string;
        schema_version: string;
        slug: string;
        version: string;
        artifact_type: "ALGORITHM" | "QEC_CODE" | "NOISE_MODEL" | "BENCHMARK_SUITE" | "CIRCUIT" | "DECODER" | "HARDWARE_PROFILE" | "DATASET" | "MITIGATION_PIPELINE" | "RESOURCE_MODEL" | "COMPILER_OR_TRANSPILER" | "EXPERIMENT_TEMPLATE";
        problem_definition: string;
        provenance: {
            authors: string[];
            license: string;
            source_repository_url?: string | undefined;
            commit_sha?: string | undefined;
            contributors?: string[] | undefined;
            citation?: {
                title: string;
                authors?: string[] | undefined;
                year?: number | undefined;
                doi?: string | undefined;
                url?: string | undefined;
                bibtex?: string | undefined;
            } | undefined;
            reference_papers?: string[] | undefined;
        };
        assumptions: {
            hardware?: string[] | undefined;
            resource?: string[] | undefined;
            noise?: string[] | undefined;
            other?: string[] | undefined;
        };
        known_limitations: string[];
        category?: string | undefined;
        interface?: {
            supported_frameworks?: string[] | undefined;
            supported_input_formats?: string[] | undefined;
            supported_output_formats?: string[] | undefined;
        } | undefined;
        applicability?: {
            qubit_range?: {
                minimum: number;
                maximum?: number | undefined;
            } | undefined;
            gate_set?: string[] | undefined;
            classical_requirements?: string[] | undefined;
        } | undefined;
        verification_status?: "UNVERIFIED" | "REPRODUCED" | "SCHEMA_VALIDATED" | "HASH_VERIFIED" | "SOURCE_VERIFIED" | "ENVIRONMENT_RECORDED" | "INDEPENDENTLY_REPRODUCED" | "REVIEWED" | undefined;
        security_notes?: string[] | undefined;
        example_commands?: {
            description: string;
            command: string;
        }[] | undefined;
        benchmark_compatibility?: string[] | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
    } | undefined;
}>]>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export declare const ArtifactListQuerySchema: z.ZodObject<{
    domain: z.ZodOptional<z.ZodEnum<["QEC", "ALGORITHM"]>>;
    kind: z.ZodOptional<z.ZodEnum<["QEC_DECODER", "QEC_CODE", "NOISE_MODEL", "SYNDROME_DATASET", "QUANTUM_ALGORITHM", "PROBLEM_INSTANCE", "CLASSICAL_REFERENCE", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>>;
    tag: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    kind?: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL" | undefined;
    domain?: "QEC" | "ALGORITHM" | undefined;
    is_demo?: boolean | undefined;
    tag?: string | undefined;
}, {
    kind?: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL" | undefined;
    domain?: "QEC" | "ALGORITHM" | undefined;
    is_demo?: boolean | undefined;
    tag?: string | undefined;
}>;
export type ArtifactListQuery = z.infer<typeof ArtifactListQuerySchema>;
//# sourceMappingURL=artifact.d.ts.map