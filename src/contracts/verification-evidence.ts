import { z } from "zod"
import {
  EnvironmentSchema,
  IsoDateTimeSchema,
  VerificationStatusSchema,
} from "./common.js"

export const VerificationSubjectTypeSchema = z.enum([
  "ARTIFACT",
  "BENCHMARK_SUITE",
  "BENCHMARK_RUN",
])
export type VerificationSubjectType = z.infer<typeof VerificationSubjectTypeSchema>

export const VerificationEvidenceKindSchema = z.enum([
  "SCHEMA_VALIDATION",
  "HASH_VERIFICATION",
  "INDEPENDENT_REPRODUCTION",
  "DEMO_FIXTURE_REPRODUCTION",
  "REVIEW_NOTE",
])
export type VerificationEvidenceKind = z.infer<typeof VerificationEvidenceKindSchema>

export const VerificationSubjectSchema = z.object({
  type: VerificationSubjectTypeSchema,
  slug: z.string().min(1),
  version: z.string().min(1).optional(),
})
export type VerificationSubject = z.infer<typeof VerificationSubjectSchema>

export const VerificationEvidenceSourceSchema = z.object({
  repository_url: z.string().url().optional(),
  commit_sha: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  manifest_path: z.string().min(1).optional(),
  runner: z.string().min(1).optional(),
})
export type VerificationEvidenceSource = z.infer<typeof VerificationEvidenceSourceSchema>

export const VerificationEvidenceSchema = z
  .object({
    id: z.string().min(1).optional(),
    schema_version: z.string().min(1),
    subject: VerificationSubjectSchema,
    status: VerificationStatusSchema,
    evidence_kind: VerificationEvidenceKindSchema,
    summary: z.string().min(1),
    evidence_url: z.string().url().optional(),
    reproducibility_hash: z.string().min(1).optional(),
    source: VerificationEvidenceSourceSchema.default({}),
    environment: EnvironmentSchema.optional(),
    is_demo_evidence: z.boolean().default(false),
    checked_at: IsoDateTimeSchema,
    reviewer: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((evidence, ctx) => {
    if (evidence.status === "REPRODUCED") {
      if (
        evidence.evidence_kind !== "INDEPENDENT_REPRODUCTION" &&
        evidence.evidence_kind !== "DEMO_FIXTURE_REPRODUCTION"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence_kind"],
          message: "REPRODUCED evidence must be an independent or explicit demo-fixture reproduction.",
        })
      }
      if (!evidence.evidence_url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence_url"],
          message: "REPRODUCED evidence requires a durable evidence URL.",
        })
      }
      if (!evidence.reproducibility_hash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reproducibility_hash"],
          message: "REPRODUCED evidence requires the verified reproducibility hash.",
        })
      }
      if (!evidence.source.command && !evidence.source.commit_sha) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source"],
          message: "REPRODUCED evidence requires a command or immutable source commit.",
        })
      }
    }

    if (evidence.evidence_kind === "HASH_VERIFICATION" && evidence.status === "REPRODUCED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Hash verification alone is not independent reproduction.",
      })
    }

    if (evidence.evidence_kind === "DEMO_FIXTURE_REPRODUCTION" && !evidence.is_demo_evidence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["is_demo_evidence"],
        message: "Demo fixture reproduction must be explicitly marked as demo evidence.",
      })
    }

    if (evidence.evidence_kind === "INDEPENDENT_REPRODUCTION" && evidence.is_demo_evidence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence_kind"],
        message: "Demo evidence must use DEMO_FIXTURE_REPRODUCTION instead of INDEPENDENT_REPRODUCTION.",
      })
    }
  })
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>
