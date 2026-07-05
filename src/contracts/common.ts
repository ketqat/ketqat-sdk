import { z } from "zod"

export const DomainSchema = z.enum(["QEC", "ALGORITHM"])
export type Domain = z.infer<typeof DomainSchema>

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
])
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>

export const VerificationStatusSchema = z.enum([
  "UNVERIFIED",
  "VALIDATED_SCHEMA",
  "REPRODUCED",
])
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>

export const VisibilitySchema = z.enum(["PUBLIC", "PRIVATE"])
export type Visibility = z.infer<typeof VisibilitySchema>

export const UrlSchema = z.string().url()
export const IsoDateTimeSchema = z.string().datetime({ offset: true })

export const CitationSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).default([]),
  year: z.number().int().min(1900).max(2200).optional(),
  doi: z.string().optional(),
  url: UrlSchema.optional(),
  bibtex: z.string().optional(),
})
export type Citation = z.infer<typeof CitationSchema>

export const MetricDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().optional(),
  lower_is_better: z.boolean().optional(),
})
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>

export const EnvironmentSchema = z.object({
  operating_system: z.string().optional(),
  architecture: z.string().optional(),
  python_version: z.string().optional(),
  node_version: z.string().optional(),
  packages: z.record(z.string()).default({}),
  hardware: z.record(z.unknown()).default({}),
})
export type Environment = z.infer<typeof EnvironmentSchema>
