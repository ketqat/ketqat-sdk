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
        noise: z
            .object({
            model: z.string().min(1),
            /** Swept. Applied as depolarization after each Clifford. */
            physical_error_rates: z.array(z.number().min(0).max(1)).min(1),
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
            readout_error_rate: z.number().min(0).max(1).optional(),
            /** Bit-flip probability applied after each reset. */
            reset_error_rate: z.number().min(0).max(1).optional(),
            /**
             * Depolarization applied to data qubits before each round, which is
             * where idling error lives. Distinct from `physical_error_rates`, since
             * a qubit waiting is not a qubit being operated on.
             */
            idle_error_rate: z.number().min(0).max(1).optional(),
        })
            // Strict: a misspelled rate must be refused rather than silently ignored,
            // which would report a run as modelling readout error when it did not.
            // The same failure mode as ketqat-sdk#99, one level up.
            .strict(),
        decoder: z.object({
            name: z.string().min(1),
            version: z.string().optional(),
            options: z.record(z.unknown()).optional(),
        }),
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
        decoders: z
            .array(z.object({
            name: z.string().min(1),
            version: z.string().optional(),
            options: z.record(z.unknown()).optional(),
        }))
            .min(1)
            .optional(),
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