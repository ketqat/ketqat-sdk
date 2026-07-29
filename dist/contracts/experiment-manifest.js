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
            /**
             * Fractional change in every noise rate per stabilizer round.
             *
             * `rate_r = rate * (1 + drift * r)`, with `r` counting from zero, so
             * 0.1 means the error rate grows ten percent of its initial value each
             * round and round zero is unchanged.
             *
             * Negative values are allowed and model a device improving. Calibration
             * drift is not always downhill, and silently clamping to zero would
             * make one direction unrepresentable.
             *
             * Stim can carry per-round rates; the generated circuits use one
             * `REPEAT` block with fixed ones, so this rewrites the flattened
             * circuit. Not bounded to [0,1]: it is a rate of change, not a
             * probability, though the rates it produces are clamped.
             */
            drift_per_round: z.number().optional(),
            /**
             * Amplitude of a correlated random walk on every noise rate, per round.
             *
             * Drift ramps; this wanders. Real calibration does the latter --
             * correlated between nearby rounds, uncorrelated between distant ones,
             * because the underlying parameters follow slow environmental variation
             * rather than a trend.
             *
             * The correlation is the point. A rate resampled independently each
             * round averages out and looks like a slightly different constant; a
             * walk stays somewhere for a while, so a run can spend a stretch in a
             * bad regime. Measured at d=3 over 11 rounds across twelve seeds, this
             * leaves the mean roughly unchanged (87 to 106 failures) while
             * multiplying the run-to-run spread by 16 (range 74-102 becomes
             * 15-507). That spread is the signature, not a shifted mean.
             *
             * The step is multiplicative, so the rate cannot walk negative. Seeded
             * from the coordinate seed, so a stochastic model is still reproducible.
             */
            wander_per_round: z.number().min(0).optional(),
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
            /**
             * Eigenphase to estimate, in [0, 1). Required by `phase-estimation`.
             *
             * A phase that is a dyadic rational -- k/2^n for the register width -- is
             * recovered exactly. Anything else is recovered to the nearest
             * representable bin, and the run records which case it was rather than
             * leaving a reader to infer it from the probability.
             */
            phase: z.number().min(0).max(1).optional(),
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