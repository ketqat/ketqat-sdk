import { z } from "zod";
import { DomainSchema, EnvironmentSchema, ExecutionClassSchema, IsoDateTimeSchema, VisibilitySchema, } from "./common.js";
import { TransformationChainSchema } from "./transformation.js";
const BaseMetricPointSchema = z.object({
    metric: z.string().min(1),
    shots: z.number().int().positive().optional(),
    runtime_seconds: z.number().nonnegative().optional(),
    memory_bytes: z.number().int().nonnegative().optional(),
    seed: z.number().int().nonnegative().optional(),
    metadata: z.record(z.unknown()).default({}),
});
export const QecMetricPointSchema = BaseMetricPointSchema.extend({
    code_distance: z.number().int().positive().optional(),
    physical_error_rate: z.number().min(0).max(1).optional(),
    logical_failures: z.number().int().nonnegative().optional(),
    logical_error_rate: z.number().min(0).max(1).optional(),
    standard_error: z.number().nonnegative().optional(),
    decoder_latency_ms: z.number().nonnegative().optional(),
    sampling_runtime_seconds: z.number().nonnegative().optional(),
});
export const AlgorithmMetricPointSchema = BaseMetricPointSchema.extend({
    qubit_count: z.number().int().positive().optional(),
    circuit_depth: z.number().int().nonnegative().optional(),
    gate_count: z.number().int().nonnegative().optional(),
    two_qubit_gate_count: z.number().int().nonnegative().optional(),
    success_probability: z.number().min(0).max(1).optional(),
    fidelity: z.number().min(0).max(1).optional(),
    objective_value: z.number().optional(),
    energy_error: z.number().optional(),
    approximation_ratio: z.number().optional(),
    simulation_runtime_seconds: z.number().nonnegative().optional(),
});
const BaseBenchmarkResultSchema = z.object({
    id: z.string().optional(),
    slug: z.string().optional(),
    name: z.string().min(1),
    domain: DomainSchema,
    status: z.enum(["COMPLETED", "FAILED", "RUNNING"]),
    artifact_slug: z.string().optional(),
    benchmark_suite: z.string().min(1),
    benchmark_suite_version: z.string().min(1),
    schema_version: z.string().min(1),
    sdk_version: z.string().optional(),
    commit_sha: z.string().optional(),
    source_repository_url: z.string().url().optional(),
    configuration: z.record(z.unknown()).default({}),
    environment: EnvironmentSchema.default({ packages: {}, hardware: {} }),
    summary_metrics: z.record(z.unknown()).default({}),
    reproducibility_hash: z.string().min(1),
    /**
     * Which hashing rules produced `reproducibility_hash`.
     *
     * Optional, because records written before ketqat-sdk#89 was fixed carry no
     * marker and are version 1 by definition. A verifier reads this to choose the
     * rules, so an older record still verifies against its own algorithm instead
     * of being reported as a mismatch.
     *
     * Version 2 excludes duration measurements, which is what makes the same
     * experiment hash the same twice.
     */
    reproducibility_hash_version: z.number().int().positive().optional(),
    started_at: IsoDateTimeSchema.optional(),
    finished_at: IsoDateTimeSchema.optional(),
    is_demo: z.boolean().default(false),
    owner_username: z.string().min(1).nullable().optional(),
    visibility: VisibilitySchema.optional(),
    created_at: IsoDateTimeSchema.optional(),
    updated_at: IsoDateTimeSchema.optional(),
    // Platform 2.0 additions (RFC 0002, RFC 0003).
    //
    // `.optional()` with no default is required here: these fields participate in
    // the reproducibility hash, so defaulting them would change the hash of every
    // existing result. An absent optional field is dropped by canonicalization
    // and leaves stored hashes untouched. Do not add `.default(...)`.
    //
    // `execution_class` is intentionally absent rather than inferred from
    // `is_demo`. A result that did not record how it was produced should read as
    // "not recorded", not as a guess.
    execution_class: ExecutionClassSchema.optional(),
    transformation_chain: TransformationChainSchema.optional(),
});
export const ProtocolMetricPointSchema = BaseMetricPointSchema.extend({
    /** Clifford sequence length this point was measured at. */
    sequence_length: z.number().int().nonnegative().optional(),
    /** Fraction of shots returning to the initial state. */
    survival_probability: z.number().min(0).max(1).optional(),
    standard_error: z.number().nonnegative().optional(),
    sequences: z.number().int().positive().optional(),
});
export const QecBenchmarkResultSchema = BaseBenchmarkResultSchema.extend({
    domain: z.literal("QEC"),
    metric_points: z.array(QecMetricPointSchema).default([]),
});
export const AlgorithmBenchmarkResultSchema = BaseBenchmarkResultSchema.extend({
    domain: z.literal("ALGORITHM"),
    metric_points: z.array(AlgorithmMetricPointSchema).default([]),
});
export const ProtocolBenchmarkResultSchema = BaseBenchmarkResultSchema.extend({
    domain: z.literal("PROTOCOL"),
    metric_points: z.array(ProtocolMetricPointSchema).default([]),
});
export const BenchmarkResultSchema = z.discriminatedUnion("domain", [
    QecBenchmarkResultSchema,
    AlgorithmBenchmarkResultSchema,
    ProtocolBenchmarkResultSchema,
]);
//# sourceMappingURL=benchmark-result.js.map