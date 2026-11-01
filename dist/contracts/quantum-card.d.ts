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
export declare const QubitRangeSchema: z.ZodObject<{
    minimum: z.ZodNumber;
    maximum: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type QubitRange = z.infer<typeof QubitRangeSchema>;
export declare const CardAssumptionsSchema: z.ZodObject<{
    resource: z.ZodDefault<z.ZodArray<z.ZodString>>;
    noise: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hardware: z.ZodDefault<z.ZodArray<z.ZodString>>;
    other: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CardAssumptions = z.infer<typeof CardAssumptionsSchema>;
export declare const CardProvenanceSchema: z.ZodObject<{
    source_repository_url: z.ZodOptional<z.ZodString>;
    commit_sha: z.ZodOptional<z.ZodString>;
    license: z.ZodString;
    authors: z.ZodArray<z.ZodString>;
    contributors: z.ZodDefault<z.ZodArray<z.ZodString>>;
    citation: z.ZodOptional<z.ZodObject<{
        title: z.ZodString;
        authors: z.ZodDefault<z.ZodArray<z.ZodString>>;
        year: z.ZodOptional<z.ZodNumber>;
        doi: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        bibtex: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    reference_papers: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CardProvenance = z.infer<typeof CardProvenanceSchema>;
export declare const CardInterfaceSchema: z.ZodObject<{
    supported_frameworks: z.ZodDefault<z.ZodArray<z.ZodString>>;
    supported_input_formats: z.ZodDefault<z.ZodArray<z.ZodString>>;
    supported_output_formats: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CardInterface = z.infer<typeof CardInterfaceSchema>;
export declare const CardApplicabilitySchema: z.ZodObject<{
    qubit_range: z.ZodOptional<z.ZodObject<{
        minimum: z.ZodNumber;
        maximum: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    gate_set: z.ZodDefault<z.ZodArray<z.ZodString>>;
    classical_requirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CardApplicability = z.infer<typeof CardApplicabilitySchema>;
export declare const CardExampleSchema: z.ZodObject<{
    description: z.ZodString;
    command: z.ZodString;
}, z.core.$strip>;
export type CardExample = z.infer<typeof CardExampleSchema>;
export declare const QuantumCardSchema: z.ZodObject<{
    schema_version: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    version: z.ZodString;
    artifact_type: z.ZodEnum<{
        ALGORITHM: "ALGORITHM";
        BENCHMARK_SUITE: "BENCHMARK_SUITE";
        CIRCUIT: "CIRCUIT";
        COMPILER_OR_TRANSPILER: "COMPILER_OR_TRANSPILER";
        DATASET: "DATASET";
        DECODER: "DECODER";
        EXPERIMENT_TEMPLATE: "EXPERIMENT_TEMPLATE";
        HARDWARE_PROFILE: "HARDWARE_PROFILE";
        MITIGATION_PIPELINE: "MITIGATION_PIPELINE";
        NOISE_MODEL: "NOISE_MODEL";
        QEC_CODE: "QEC_CODE";
        RESOURCE_MODEL: "RESOURCE_MODEL";
    }>;
    description: z.ZodString;
    problem_definition: z.ZodString;
    category: z.ZodOptional<z.ZodString>;
    provenance: z.ZodObject<{
        source_repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        license: z.ZodString;
        authors: z.ZodArray<z.ZodString>;
        contributors: z.ZodDefault<z.ZodArray<z.ZodString>>;
        citation: z.ZodOptional<z.ZodObject<{
            title: z.ZodString;
            authors: z.ZodDefault<z.ZodArray<z.ZodString>>;
            year: z.ZodOptional<z.ZodNumber>;
            doi: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            bibtex: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        reference_papers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    interface: z.ZodPrefault<z.ZodObject<{
        supported_frameworks: z.ZodDefault<z.ZodArray<z.ZodString>>;
        supported_input_formats: z.ZodDefault<z.ZodArray<z.ZodString>>;
        supported_output_formats: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    applicability: z.ZodPrefault<z.ZodObject<{
        qubit_range: z.ZodOptional<z.ZodObject<{
            minimum: z.ZodNumber;
            maximum: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        gate_set: z.ZodDefault<z.ZodArray<z.ZodString>>;
        classical_requirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    assumptions: z.ZodObject<{
        resource: z.ZodDefault<z.ZodArray<z.ZodString>>;
        noise: z.ZodDefault<z.ZodArray<z.ZodString>>;
        hardware: z.ZodDefault<z.ZodArray<z.ZodString>>;
        other: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    known_limitations: z.ZodArray<z.ZodString>;
    verification_status: z.ZodDefault<z.ZodEnum<{
        ENVIRONMENT_RECORDED: "ENVIRONMENT_RECORDED";
        HASH_VERIFIED: "HASH_VERIFIED";
        INDEPENDENTLY_REPRODUCED: "INDEPENDENTLY_REPRODUCED";
        REPRODUCED: "REPRODUCED";
        REVIEWED: "REVIEWED";
        SCHEMA_VALIDATED: "SCHEMA_VALIDATED";
        SOURCE_VERIFIED: "SOURCE_VERIFIED";
        UNVERIFIED: "UNVERIFIED";
    }>>;
    security_notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    example_commands: z.ZodDefault<z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        command: z.ZodString;
    }, z.core.$strip>>>;
    benchmark_compatibility: z.ZodDefault<z.ZodArray<z.ZodString>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type QuantumCard = z.infer<typeof QuantumCardSchema>;
//# sourceMappingURL=quantum-card.d.ts.map