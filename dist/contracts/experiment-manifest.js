import { z } from "zod";
import { DomainSchema, EnvironmentSchema, UrlSchema } from "./common.js";
const SourceSchema = z.object({
    repository_url: UrlSchema.optional(),
    commit_sha: z.string().optional(),
});
const BenchmarkReferenceSchema = z.object({
    suite: z.string().min(1),
    version: z.string().min(1),
});
const ExperimentDescriptionSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});
const SamplingSchema = z.object({
    shots: z.number().int().positive(),
    seed: z.number().int().nonnegative(),
});
const BaseExperimentManifestSchema = z.object({
    schema_version: z.string().min(1),
    domain: DomainSchema,
    benchmark: BenchmarkReferenceSchema,
    experiment: ExperimentDescriptionSchema,
    source: SourceSchema.default({}),
    sampling: SamplingSchema,
    metrics: z.array(z.string().min(1)).min(1),
    environment: EnvironmentSchema.optional(),
});
export const QecExperimentManifestSchema = BaseExperimentManifestSchema.extend({
    domain: z.literal("QEC"),
    qec: z.object({
        experiment_type: z.string().min(1),
        code: z.object({
            family: z.string().min(1),
            distances: z.array(z.number().int().positive()).min(1),
            rounds: z.union([z.literal("distance"), z.number().int().positive()]),
        }),
        noise: z.object({
            model: z.string().min(1),
            physical_error_rates: z.array(z.number().min(0).max(1)).min(1),
        }),
        decoder: z.object({
            name: z.string().min(1),
            version: z.string().optional(),
        }),
    }),
});
export const AlgorithmExperimentManifestSchema = BaseExperimentManifestSchema.extend({
    domain: z.literal("ALGORITHM"),
    algorithm: z.object({
        family: z.string().min(1),
        problem: z.object({
            type: z.string().min(1),
            qubit_counts: z.array(z.number().int().positive()).min(1),
            marked_state: z.string().optional(),
        }),
        execution: z.object({
            engine: z.string().min(1),
            method: z.string().min(1),
        }),
    }),
});
export const ExperimentManifestSchema = z.discriminatedUnion("domain", [
    QecExperimentManifestSchema,
    AlgorithmExperimentManifestSchema,
]);
//# sourceMappingURL=experiment-manifest.js.map