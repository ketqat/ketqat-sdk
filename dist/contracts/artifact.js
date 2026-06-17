import { z } from "zod";
import { ArtifactKindSchema, CitationSchema, DomainSchema, IsoDateTimeSchema, UrlSchema, VerificationStatusSchema, } from "./common.js";
const BaseArtifactSchema = z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    domain: DomainSchema,
    kind: ArtifactKindSchema,
    description: z.string().min(1),
    repository_url: UrlSchema.optional(),
    repository_owner: z.string().optional(),
    repository_name: z.string().optional(),
    default_branch: z.string().default("main"),
    license: z.string().optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).default([]),
    authors: z.array(z.string()).default([]),
    latest_commit_sha: z.string().optional(),
    reference_paper_url: UrlSchema.optional(),
    citation: CitationSchema.optional(),
    is_demo: z.boolean(),
    verification_status: VerificationStatusSchema.default("UNVERIFIED"),
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
});
export const QecArtifactMetadataSchema = z.object({
    code_families: z.array(z.string()).default([]),
    supported_distances: z.array(z.number().int().positive()).default([]),
    decoder_family: z.string().optional(),
    noise_models: z.array(z.string()).default([]),
    syndrome_format: z.string().optional(),
    decoder_interface_version: z.string().optional(),
    supported_experiment_types: z.array(z.string()).default([]),
});
export const AlgorithmArtifactMetadataSchema = z.object({
    algorithm_family: z.string().optional(),
    problem_domains: z.array(z.string()).default([]),
    supported_input_types: z.array(z.string()).default([]),
    supported_qubit_ranges: z.array(z.tuple([z.number().int().positive(), z.number().int().positive()])).default([]),
    classical_reference_available: z.boolean().default(false),
    simulator_requirements: z.array(z.string()).default([]),
    frameworks: z.array(z.string()).default([]),
});
export const QecArtifactSchema = BaseArtifactSchema.extend({
    domain: z.literal("QEC"),
    kind: z.enum([
        "QEC_DECODER",
        "QEC_CODE",
        "NOISE_MODEL",
        "SYNDROME_DATASET",
        "BENCHMARK_SUITE",
        "SIMULATION_TOOL",
        "RESOURCE_ANALYSIS_TOOL",
    ]),
    qec: QecArtifactMetadataSchema,
});
export const AlgorithmArtifactSchema = BaseArtifactSchema.extend({
    domain: z.literal("ALGORITHM"),
    kind: z.enum([
        "QUANTUM_ALGORITHM",
        "PROBLEM_INSTANCE",
        "CLASSICAL_REFERENCE",
        "BENCHMARK_SUITE",
        "SIMULATION_TOOL",
        "RESOURCE_ANALYSIS_TOOL",
    ]),
    algorithm: AlgorithmArtifactMetadataSchema,
});
export const ArtifactSchema = z.discriminatedUnion("domain", [
    QecArtifactSchema,
    AlgorithmArtifactSchema,
]);
export const ArtifactListQuerySchema = z.object({
    domain: DomainSchema.optional(),
    kind: ArtifactKindSchema.optional(),
    tag: z.string().optional(),
    is_demo: z.boolean().optional(),
});
//# sourceMappingURL=artifact.js.map