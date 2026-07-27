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

/**
 * Platform 2.0 artifact taxonomy (RFC 0003).
 *
 * This is additive: `domain` and `kind` keep their existing meaning, and
 * `artifact_type` is recorded alongside them rather than replacing them, so
 * records written before this taxonomy existed stay valid and keep their hashes.
 */
export const ArtifactTypeSchema = z.enum([
  "ALGORITHM",
  "CIRCUIT",
  "QEC_CODE",
  "DECODER",
  "NOISE_MODEL",
  "HARDWARE_PROFILE",
  "BENCHMARK_SUITE",
  "DATASET",
  "MITIGATION_PIPELINE",
  "RESOURCE_MODEL",
  "COMPILER_OR_TRANSPILER",
  "EXPERIMENT_TEMPLATE",
])
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>

/**
 * How a result was produced (RFC 0003).
 *
 * Kept separate from the trust level: a `HARDWARE` result is not more
 * trustworthy than a `SIMULATION` one, it is a different kind of measurement.
 * Comparison code refuses to rank across classes unless the comparison is
 * explicitly scoped and labelled.
 */
export const ExecutionClassSchema = z.enum([
  "DEMO",
  "SIMULATION",
  "HARDWARE",
  "ANALYTICAL",
])
export type ExecutionClass = z.infer<typeof ExecutionClassSchema>

/**
 * Evidence level for a claim that two circuits are equivalent (RFC 0002).
 *
 * `INCONCLUSIVE` and `FAILED` are deliberately distinct. A rewrite system that
 * does not reduce a difference to the identity has failed to prove equality; it
 * has not proved inequality. Only an explicit counterexample justifies `FAILED`.
 */
export const EquivalenceLevelSchema = z.enum([
  "NOT_CHECKED",
  "NUMERICALLY_CHECKED",
  "SYMBOLICALLY_REDUCED",
  "PROVED_BY_SUPPORTED_REWRITE",
  "FAILED",
  "INCONCLUSIVE",
])
export type EquivalenceLevel = z.infer<typeof EquivalenceLevelSchema>

/** Ordered verification ladder (RFC 0004). Each level implies the ones before it. */
export const TrustLevelSchema = z.enum([
  "UNVERIFIED",
  "SCHEMA_VALIDATED",
  "HASH_VERIFIED",
  "SOURCE_VERIFIED",
  "ENVIRONMENT_RECORDED",
  "REPRODUCED",
  "INDEPENDENTLY_REPRODUCED",
  "REVIEWED",
])
export type TrustLevel = z.infer<typeof TrustLevelSchema>

export const TRUST_LEVEL_ORDER: readonly TrustLevel[] = [
  "UNVERIFIED",
  "SCHEMA_VALIDATED",
  "HASH_VERIFIED",
  "SOURCE_VERIFIED",
  "ENVIRONMENT_RECORDED",
  "REPRODUCED",
  "INDEPENDENTLY_REPRODUCED",
  "REVIEWED",
]

/**
 * `REVIEWED` means an identified reviewer examined the method and recorded
 * findings. It does not mean journal peer review, and must not be presented as
 * such. See RFC 0004.
 */
export function compareTrustLevels(left: TrustLevel, right: TrustLevel): number {
  return TRUST_LEVEL_ORDER.indexOf(left) - TRUST_LEVEL_ORDER.indexOf(right)
}

export const LossSeveritySchema = z.enum(["semantic", "structural", "cosmetic"])
export type LossSeverity = z.infer<typeof LossSeveritySchema>

/**
 * One feature a conversion could not carry across (RFC 0002).
 *
 * A conversion that cannot represent part of its input must reject, or record
 * entries like this. Converting silently is prohibited.
 */
export const LossReportEntrySchema = z.object({
  feature: z.string().min(1),
  severity: LossSeveritySchema,
  action: z.enum(["rejected", "dropped", "approximated"]),
  detail: z.string().min(1),
  location: z.string().optional(),
})
export type LossReportEntry = z.infer<typeof LossReportEntrySchema>

export const ArtifactRelationTypeSchema = z.enum([
  "derived_from",
  "forks",
  "implements",
  "supersedes",
  "benchmarked_by",
  "compatible_with",
  "requires",
  "cites",
  "decodes",
  "targets",
  "contradicts",
])
export type ArtifactRelationType = z.infer<typeof ArtifactRelationTypeSchema>

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
