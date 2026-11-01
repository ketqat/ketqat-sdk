import { z } from "zod";
export declare const VerificationSubjectTypeSchema: z.ZodEnum<{
    ARTIFACT: "ARTIFACT";
    BENCHMARK_RUN: "BENCHMARK_RUN";
    BENCHMARK_SUITE: "BENCHMARK_SUITE";
}>;
export type VerificationSubjectType = z.infer<typeof VerificationSubjectTypeSchema>;
export declare const VerificationEvidenceKindSchema: z.ZodEnum<{
    DEMO_FIXTURE_REPRODUCTION: "DEMO_FIXTURE_REPRODUCTION";
    HASH_VERIFICATION: "HASH_VERIFICATION";
    INDEPENDENT_REPRODUCTION: "INDEPENDENT_REPRODUCTION";
    REVIEW_NOTE: "REVIEW_NOTE";
    SCHEMA_VALIDATION: "SCHEMA_VALIDATION";
}>;
export type VerificationEvidenceKind = z.infer<typeof VerificationEvidenceKindSchema>;
export declare const VerificationSubjectSchema: z.ZodObject<{
    type: z.ZodEnum<{
        ARTIFACT: "ARTIFACT";
        BENCHMARK_RUN: "BENCHMARK_RUN";
        BENCHMARK_SUITE: "BENCHMARK_SUITE";
    }>;
    slug: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type VerificationSubject = z.infer<typeof VerificationSubjectSchema>;
export declare const VerificationEvidenceSourceSchema: z.ZodObject<{
    repository_url: z.ZodOptional<z.ZodString>;
    commit_sha: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodString>;
    manifest_path: z.ZodOptional<z.ZodString>;
    runner: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type VerificationEvidenceSource = z.infer<typeof VerificationEvidenceSourceSchema>;
export declare const VerificationEvidenceSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    schema_version: z.ZodString;
    subject: z.ZodObject<{
        type: z.ZodEnum<{
            ARTIFACT: "ARTIFACT";
            BENCHMARK_RUN: "BENCHMARK_RUN";
            BENCHMARK_SUITE: "BENCHMARK_SUITE";
        }>;
        slug: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    status: z.ZodEnum<{
        REPRODUCED: "REPRODUCED";
        UNVERIFIED: "UNVERIFIED";
        VALIDATED_SCHEMA: "VALIDATED_SCHEMA";
    }>;
    evidence_kind: z.ZodEnum<{
        DEMO_FIXTURE_REPRODUCTION: "DEMO_FIXTURE_REPRODUCTION";
        HASH_VERIFICATION: "HASH_VERIFICATION";
        INDEPENDENT_REPRODUCTION: "INDEPENDENT_REPRODUCTION";
        REVIEW_NOTE: "REVIEW_NOTE";
        SCHEMA_VALIDATION: "SCHEMA_VALIDATION";
    }>;
    summary: z.ZodString;
    evidence_url: z.ZodOptional<z.ZodString>;
    reproducibility_hash: z.ZodOptional<z.ZodString>;
    source: z.ZodPrefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodString>;
        manifest_path: z.ZodOptional<z.ZodString>;
        runner: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    is_demo_evidence: z.ZodDefault<z.ZodBoolean>;
    checked_at: z.ZodString;
    reviewer: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;
//# sourceMappingURL=verification-evidence.d.ts.map