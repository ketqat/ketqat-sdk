import { z } from "zod";
import { BenchmarkResultSchema } from "./benchmark-result.js";
import { EnvironmentSchema } from "./common.js";
import { VerificationEvidenceSchema } from "./verification-evidence.js";
export const ReproducibilityBundleSchema = z
    .object({
    bundle_version: z.string().min(1),
    experiment_manifest: z.record(z.unknown()).default({}),
    benchmark_result: BenchmarkResultSchema,
    benchmark_suite_definition: z.record(z.unknown()).nullable(),
    verification_evidence: z.array(VerificationEvidenceSchema).default([]),
    artifact_metadata: z.object({ slug: z.string().min(1) }).nullable().default(null),
    environment: EnvironmentSchema.default({ packages: {}, hardware: {} }),
    source_repository: z.string().min(1),
    commit_sha: z.string().min(1),
    reproducibility_hash: z.string().min(1),
    citation: z.string().min(1),
    reproduction_instructions: z.object({
        command: z.string().min(1),
        notes: z.string().min(1),
    }),
})
    .superRefine((bundle, ctx) => {
    if (bundle.reproducibility_hash !== bundle.benchmark_result.reproducibility_hash) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reproducibility_hash"],
            message: "Bundle reproducibility hash must match the benchmark result hash.",
        });
    }
});
//# sourceMappingURL=reproducibility-bundle.js.map