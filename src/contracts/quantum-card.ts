import { z } from "zod"
import {
  ArtifactTypeSchema,
  CitationSchema,
  IsoDateTimeSchema,
  TrustLevelSchema,
  UrlSchema,
} from "./common.js"

/**
 * Quantum Card -- the descriptive record that makes an artifact usable and
 * citable by someone who did not write it (RFC 0003).
 *
 * Two design choices are deliberate and worth stating, because they add
 * friction on purpose:
 *
 * 1. `assumptions` and `known_limitations` are required and must be non-empty.
 *    An artifact whose assumptions are unstated cannot be validly compared with
 *    another, and valid comparison is the registry's core promise. "Answered"
 *    is the requirement, not "long": `["None identified"]` is an acceptable
 *    answer, an absent field is not.
 * 2. Cards are versioned with their artifact and are never edited retroactively
 *    to change a claim. A corrected claim produces a new version.
 */

export const QubitRangeSchema = z
  .object({
    minimum: z.number().int().positive(),
    maximum: z.number().int().positive().optional(),
  })
  .refine((range) => range.maximum === undefined || range.maximum >= range.minimum, {
    message: "maximum must be greater than or equal to minimum",
    path: ["maximum"],
  })
export type QubitRange = z.infer<typeof QubitRangeSchema>

export const CardAssumptionsSchema = z.object({
  resource: z.array(z.string().min(1)).default([]),
  noise: z.array(z.string().min(1)).default([]),
  hardware: z.array(z.string().min(1)).default([]),
  other: z.array(z.string().min(1)).default([]),
})
export type CardAssumptions = z.infer<typeof CardAssumptionsSchema>

export const CardProvenanceSchema = z.object({
  source_repository_url: UrlSchema.optional(),
  /** Immutable commit. A branch name is not provenance. */
  commit_sha: z.string().min(7).optional(),
  license: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  contributors: z.array(z.string().min(1)).default([]),
  citation: CitationSchema.optional(),
  reference_papers: z.array(UrlSchema).default([]),
})
export type CardProvenance = z.infer<typeof CardProvenanceSchema>

export const CardInterfaceSchema = z.object({
  supported_frameworks: z.array(z.string().min(1)).default([]),
  supported_input_formats: z.array(z.string().min(1)).default([]),
  supported_output_formats: z.array(z.string().min(1)).default([]),
})
export type CardInterface = z.infer<typeof CardInterfaceSchema>

export const CardApplicabilitySchema = z.object({
  qubit_range: QubitRangeSchema.optional(),
  gate_set: z.array(z.string().min(1)).default([]),
  classical_requirements: z.array(z.string().min(1)).default([]),
})
export type CardApplicability = z.infer<typeof CardApplicabilitySchema>

export const CardExampleSchema = z.object({
  description: z.string().min(1),
  command: z.string().min(1),
})
export type CardExample = z.infer<typeof CardExampleSchema>

export const QuantumCardSchema = z.object({
  schema_version: z.string().min(1),

  // Identity
  name: z.string().min(1),
  slug: z.string().min(1),
  version: z.string().min(1),
  artifact_type: ArtifactTypeSchema,
  description: z.string().min(1),

  // Problem
  problem_definition: z.string().min(1),
  category: z.string().min(1).optional(),

  provenance: CardProvenanceSchema,
  interface: CardInterfaceSchema.default({
    supported_frameworks: [],
    supported_input_formats: [],
    supported_output_formats: [],
  }),
  applicability: CardApplicabilitySchema.default({
    gate_set: [],
    classical_requirements: [],
  }),
  assumptions: CardAssumptionsSchema,

  /**
   * Required and non-empty. Use `["None identified"]` to answer explicitly
   * rather than leaving the field out.
   */
  known_limitations: z.array(z.string().min(1)).min(1),

  verification_status: TrustLevelSchema.default("UNVERIFIED"),
  security_notes: z.array(z.string().min(1)).default([]),

  example_commands: z.array(CardExampleSchema).default([]),
  benchmark_compatibility: z.array(z.string().min(1)).default([]),

  created_at: IsoDateTimeSchema.optional(),
  updated_at: IsoDateTimeSchema.optional(),
})
export type QuantumCard = z.infer<typeof QuantumCardSchema>
