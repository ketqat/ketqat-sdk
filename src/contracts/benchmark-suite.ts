import { z } from "zod"
import { DomainSchema, IsoDateTimeSchema, MetricDefinitionSchema, UrlSchema, VisibilitySchema } from "./common.js"

const BaseBenchmarkSuiteSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  domain: DomainSchema,
  description: z.string().min(1),
  version: z.string().min(1),
  schema_version: z.string().min(1),
  experiment_type: z.string().min(1),
  metric_definitions: z.array(MetricDefinitionSchema).min(1),
  default_configuration: z.record(z.unknown()).default({}),
  repository_url: UrlSchema.optional(),
  is_demo: z.boolean(),
  owner_username: z.string().min(1).nullable().optional(),
  visibility: VisibilitySchema.optional(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
})

export const QecBenchmarkDefinitionSchema = z.object({
  code_family: z.string().min(1),
  noise_model: z.string().min(1),
  decoder_interface_version: z.string().min(1),
  syndrome_definition: z.string().min(1),
  sampling_assumptions: z.string().min(1),
  logical_failure_definition: z.string().min(1),
})
export type QecBenchmarkDefinition = z.infer<typeof QecBenchmarkDefinitionSchema>

export const AlgorithmBenchmarkDefinitionSchema = z.object({
  algorithm_family: z.string().min(1),
  problem_type: z.string().min(1),
  problem_instance_definition: z.string().min(1),
  simulation_method: z.string().min(1),
  reference_solution_definition: z.string().min(1),
  measurement_definition: z.string().min(1),
  success_criterion: z.string().min(1),
})
export type AlgorithmBenchmarkDefinition = z.infer<typeof AlgorithmBenchmarkDefinitionSchema>

export const QecBenchmarkSuiteSchema = BaseBenchmarkSuiteSchema.extend({
  domain: z.literal("QEC"),
  definition: QecBenchmarkDefinitionSchema,
})
export type QecBenchmarkSuite = z.infer<typeof QecBenchmarkSuiteSchema>

export const AlgorithmBenchmarkSuiteSchema = BaseBenchmarkSuiteSchema.extend({
  domain: z.literal("ALGORITHM"),
  definition: AlgorithmBenchmarkDefinitionSchema,
})
export type AlgorithmBenchmarkSuite = z.infer<typeof AlgorithmBenchmarkSuiteSchema>

export const BenchmarkSuiteSchema = z.discriminatedUnion("domain", [
  QecBenchmarkSuiteSchema,
  AlgorithmBenchmarkSuiteSchema,
])
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>
