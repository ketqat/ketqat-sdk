import { z } from "zod";
import { DomainSchema, EnvironmentSchema, IsoDateTimeSchema, VisibilitySchema } from "./common.js";
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
    started_at: IsoDateTimeSchema.optional(),
    finished_at: IsoDateTimeSchema.optional(),
    is_demo: z.boolean().default(false),
    owner_username: z.string().min(1).nullable().optional(),
    visibility: VisibilitySchema.optional(),
    created_at: IsoDateTimeSchema.optional(),
    updated_at: IsoDateTimeSchema.optional(),
});
export const QecBenchmarkResultSchema = BaseBenchmarkResultSchema.extend({
    domain: z.literal("QEC"),
    metric_points: z.array(QecMetricPointSchema).default([]),
});
export const AlgorithmBenchmarkResultSchema = BaseBenchmarkResultSchema.extend({
    domain: z.literal("ALGORITHM"),
    metric_points: z.array(AlgorithmMetricPointSchema).default([]),
});
export const BenchmarkResultSchema = z.discriminatedUnion("domain", [
    QecBenchmarkResultSchema,
    AlgorithmBenchmarkResultSchema,
]);
//# sourceMappingURL=benchmark-result.js.map