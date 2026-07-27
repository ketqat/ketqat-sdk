import { z } from "zod";
/**
 * Quantum Card -- the descriptive record that makes an artifact usable and
 * citable by someone who did not write it (RFC 0003).
 *
 * Two design choices are deliberate and worth stating, because they add
 * friction on purpose:
 *
 * 1. `assumptions` and `known_limitations` are required and must be non-empty.
 *    An artifact whose assumptions are unstated cannot be validly compared with
 *    another, and valid comparison is the registry's core promise. "Answered"
 *    is the requirement, not "long": `["None identified"]` is an acceptable
 *    answer, an absent field is not.
 * 2. Cards are versioned with their artifact and are never edited retroactively
 *    to change a claim. A corrected claim produces a new version.
 */
export declare const QubitRangeSchema: z.ZodEffects<z.ZodObject<{
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
}>;
export type QubitRange = z.infer<typeof QubitRangeSchema>;
export declare const CardAssumptionsSchema: z.ZodObject<{
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
export type CardAssumptions = z.infer<typeof CardAssumptionsSchema>;
export declare const CardProvenanceSchema: z.ZodObject<{
    source_repository_url: z.ZodOptional<z.ZodString>;
    /** Immutable commit. A branch name is not provenance. */
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
export type CardProvenance = z.infer<typeof CardProvenanceSchema>;
export declare const CardInterfaceSchema: z.ZodObject<{
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
}>;
export type CardInterface = z.infer<typeof CardInterfaceSchema>;
export declare const CardApplicabilitySchema: z.ZodObject<{
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
}>;
export type CardApplicability = z.infer<typeof CardApplicabilitySchema>;
export declare const CardExampleSchema: z.ZodObject<{
    description: z.ZodString;
    command: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    command: string;
}, {
    description: string;
    command: string;
}>;
export type CardExample = z.infer<typeof CardExampleSchema>;
export declare const QuantumCardSchema: z.ZodObject<{
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
        /** Immutable commit. A branch name is not provenance. */
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
    /**
     * Required and non-empty. Use `["None identified"]` to answer explicitly
     * rather than leaving the field out.
     */
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
}>;
export type QuantumCard = z.infer<typeof QuantumCardSchema>;
//# sourceMappingURL=quantum-card.d.ts.map