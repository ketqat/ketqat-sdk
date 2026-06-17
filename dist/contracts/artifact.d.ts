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
    code_families: string[];
    supported_distances: number[];
    noise_models: string[];
    supported_experiment_types: string[];
    decoder_family?: string | undefined;
    syndrome_format?: string | undefined;
    decoder_interface_version?: string | undefined;
}, {
    code_families?: string[] | undefined;
    supported_distances?: number[] | undefined;
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
    created_at: z.ZodString;
    updated_at: z.ZodString;
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
        code_families: string[];
        supported_distances: number[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    }, {
        code_families?: string[] | undefined;
        supported_distances?: number[] | undefined;
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
    id: string;
    slug: string;
    domain: "QEC";
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    qec: {
        code_families: string[];
        supported_distances: number[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    };
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "QEC";
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    qec: {
        code_families?: string[] | undefined;
        supported_distances?: number[] | undefined;
        decoder_family?: string | undefined;
        noise_models?: string[] | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
        supported_experiment_types?: string[] | undefined;
    };
    authors?: string[] | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
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
    created_at: z.ZodString;
    updated_at: z.ZodString;
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
    id: string;
    slug: string;
    domain: "ALGORITHM";
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    algorithm: {
        problem_domains: string[];
        supported_input_types: string[];
        supported_qubit_ranges: [number, number][];
        classical_reference_available: boolean;
        simulator_requirements: string[];
        frameworks: string[];
        algorithm_family?: string | undefined;
    };
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "ALGORITHM";
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
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
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
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
    created_at: z.ZodString;
    updated_at: z.ZodString;
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
        code_families: string[];
        supported_distances: number[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    }, {
        code_families?: string[] | undefined;
        supported_distances?: number[] | undefined;
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
    id: string;
    slug: string;
    domain: "QEC";
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    qec: {
        code_families: string[];
        supported_distances: number[];
        noise_models: string[];
        supported_experiment_types: string[];
        decoder_family?: string | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
    };
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "QEC";
    kind: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    qec: {
        code_families?: string[] | undefined;
        supported_distances?: number[] | undefined;
        decoder_family?: string | undefined;
        noise_models?: string[] | undefined;
        syndrome_format?: string | undefined;
        decoder_interface_version?: string | undefined;
        supported_experiment_types?: string[] | undefined;
    };
    authors?: string[] | undefined;
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
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
    created_at: z.ZodString;
    updated_at: z.ZodString;
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
    id: string;
    slug: string;
    domain: "ALGORITHM";
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    default_branch: string;
    tags: string[];
    is_demo: boolean;
    verification_status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
    created_at: string;
    updated_at: string;
    algorithm: {
        problem_domains: string[];
        supported_input_types: string[];
        supported_qubit_ranges: [number, number][];
        classical_reference_available: boolean;
        simulator_requirements: string[];
        frameworks: string[];
        algorithm_family?: string | undefined;
    };
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors: string[];
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "ALGORITHM";
    kind: "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
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
    repository_url?: string | undefined;
    repository_owner?: string | undefined;
    repository_name?: string | undefined;
    default_branch?: string | undefined;
    license?: string | undefined;
    language?: string | undefined;
    tags?: string[] | undefined;
    latest_commit_sha?: string | undefined;
    reference_paper_url?: string | undefined;
    citation?: {
        title: string;
        authors?: string[] | undefined;
        year?: number | undefined;
        doi?: string | undefined;
        url?: string | undefined;
        bibtex?: string | undefined;
    } | undefined;
    verification_status?: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED" | undefined;
}>]>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export declare const ArtifactListQuerySchema: z.ZodObject<{
    domain: z.ZodOptional<z.ZodEnum<["QEC", "ALGORITHM"]>>;
    kind: z.ZodOptional<z.ZodEnum<["QEC_DECODER", "QEC_CODE", "NOISE_MODEL", "SYNDROME_DATASET", "QUANTUM_ALGORITHM", "PROBLEM_INSTANCE", "CLASSICAL_REFERENCE", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>>;
    tag: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    domain?: "QEC" | "ALGORITHM" | undefined;
    kind?: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL" | undefined;
    is_demo?: boolean | undefined;
    tag?: string | undefined;
}, {
    domain?: "QEC" | "ALGORITHM" | undefined;
    kind?: "QEC_DECODER" | "QEC_CODE" | "NOISE_MODEL" | "SYNDROME_DATASET" | "QUANTUM_ALGORITHM" | "PROBLEM_INSTANCE" | "CLASSICAL_REFERENCE" | "BENCHMARK_SUITE" | "SIMULATION_TOOL" | "RESOURCE_ANALYSIS_TOOL" | undefined;
    is_demo?: boolean | undefined;
    tag?: string | undefined;
}>;
export type ArtifactListQuery = z.infer<typeof ArtifactListQuerySchema>;
//# sourceMappingURL=artifact.d.ts.map