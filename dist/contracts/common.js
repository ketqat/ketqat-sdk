import { z } from "zod";
export const DomainSchema = z.enum(["QEC", "ALGORITHM"]);
export const ArtifactKindSchema = z.enum([
    "QEC_DECODER",
    "QEC_CODE",
    "NOISE_MODEL",
    "SYNDROME_DATASET",
    "QUANTUM_ALGORITHM",
    "PROBLEM_INSTANCE",
    "CLASSICAL_REFERENCE",
    "BENCHMARK_SUITE",
    "SIMULATION_TOOL",
    "RESOURCE_ANALYSIS_TOOL",
]);
export const VerificationStatusSchema = z.enum([
    "UNVERIFIED",
    "VALIDATED_SCHEMA",
    "REPRODUCED",
]);
export const UrlSchema = z.string().url();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const CitationSchema = z.object({
    title: z.string().min(1),
    authors: z.array(z.string().min(1)).default([]),
    year: z.number().int().min(1900).max(2200).optional(),
    doi: z.string().optional(),
    url: UrlSchema.optional(),
    bibtex: z.string().optional(),
});
export const MetricDefinitionSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    unit: z.string().optional(),
    lower_is_better: z.boolean().optional(),
});
export const EnvironmentSchema = z.object({
    operating_system: z.string().optional(),
    architecture: z.string().optional(),
    python_version: z.string().optional(),
    node_version: z.string().optional(),
    packages: z.record(z.string()).default({}),
    hardware: z.record(z.unknown()).default({}),
});
//# sourceMappingURL=common.js.map