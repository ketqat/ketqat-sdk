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
            crosstalk_error_rate: z.number().min(0).max(1).optional(),
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
/**
 * Characterisation protocols: randomized benchmarking today, with room for
 * interleaved RB and quantum volume.
 *
 * A separate domain rather than an `ALGORITHM` family, because the output is
 * not a success probability on a problem instance. RB reports a decay parameter
 * fitted across sequence lengths, and a contract that called it an algorithm
 * would have no place to put the fit or its uncertainty.
 */
export const ProtocolExperimentManifestSchema = BaseExperimentManifestSchema.extend({
    domain: z.literal("PROTOCOL"),
    protocol: z
        .object({
        name: z.literal("randomized-benchmarking"),
        /** 1 or 2. Standard Clifford RB is defined per qubit count. */
        qubits: z.union([z.literal(1), z.literal(2)]),
        /**
         * Clifford sequence lengths to sample. Must span enough decay to fit:
         * a set clustered at short lengths fits a line to noise.
         */
        sequence_lengths: z.array(z.number().int().positive()).min(3),
        /**
         * Independent random sequences per length. RB averages over sequences as
         * well as shots -- shots alone measure one sequence very precisely, which
         * is not the quantity RB is defined to report.
         */
        sequences_per_length: z.number().int().positive(),
        noise: z
            .object({
            model: z.literal("depolarizing"),
            /** Depolarizing probability applied after each Clifford. */
            depolarizing_rate: z.number().min(0).max(1),
        })
            .strict(),
    })
        .strict(),
});
export const ExperimentManifestSchema = z.discriminatedUnion("domain", [
    QecExperimentManifestSchema,
    AlgorithmExperimentManifestSchema,
    ProtocolExperimentManifestSchema,
]);
//# sourceMappingURL=experiment-manifest.js.map