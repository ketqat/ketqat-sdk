import { z } from "zod";
export declare const VerificationSubjectTypeSchema: z.ZodEnum<["ARTIFACT", "BENCHMARK_SUITE", "BENCHMARK_RUN"]>;
export type VerificationSubjectType = z.infer<typeof VerificationSubjectTypeSchema>;
export declare const VerificationEvidenceKindSchema: z.ZodEnum<["SCHEMA_VALIDATION", "HASH_VERIFICATION", "INDEPENDENT_REPRODUCTION", "DEMO_FIXTURE_REPRODUCTION", "REVIEW_NOTE"]>;
export type VerificationEvidenceKind = z.infer<typeof VerificationEvidenceKindSchema>;
export declare const VerificationSubjectSchema: z.ZodObject<{
    type: z.ZodEnum<["ARTIFACT", "BENCHMARK_SUITE", "BENCHMARK_RUN"]>;
    slug: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
    slug: string;
    version?: string | undefined;
}, {
    type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
    slug: string;
    version?: string | undefined;
}>;
export type VerificationSubject = z.infer<typeof VerificationSubjectSchema>;
export declare const VerificationEvidenceSourceSchema: z.ZodObject<{
    repository_url: z.ZodOptional<z.ZodString>;
    commit_sha: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodString>;
    manifest_path: z.ZodOptional<z.ZodString>;
    runner: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    repository_url?: string | undefined;
    commit_sha?: string | undefined;
    command?: string | undefined;
    manifest_path?: string | undefined;
    runner?: string | undefined;
}, {
    repository_url?: string | undefined;
    commit_sha?: string | undefined;
    command?: string | undefined;
    manifest_path?: string | undefined;
    runner?: string | undefined;
}>;
export type VerificationEvidenceSource = z.infer<typeof VerificationEvidenceSourceSchema>;
export declare const VerificationEvidenceSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    schema_version: z.ZodString;
    subject: z.ZodObject<{
        type: z.ZodEnum<["ARTIFACT", "BENCHMARK_SUITE", "BENCHMARK_RUN"]>;
        slug: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
        slug: string;
        version?: string | undefined;
    }, {
        type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
        slug: string;
        version?: string | undefined;
    }>;
    status: z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>;
    evidence_kind: z.ZodEnum<["SCHEMA_VALIDATION", "HASH_VERIFICATION", "INDEPENDENT_REPRODUCTION", "DEMO_FIXTURE_REPRODUCTION", "REVIEW_NOTE"]>;
    summary: z.ZodString;
    evidence_url: z.ZodOptional<z.ZodString>;
    reproducibility_hash: z.ZodOptional<z.ZodString>;
    source: z.ZodDefault<z.ZodObject<{
        repository_url: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodString>;
        manifest_path: z.ZodOptional<z.ZodString>;
        runner: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
        command?: string | undefined;
        manifest_path?: string | undefined;
        runner?: string | undefined;
    }, {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
        command?: string | undefined;
        manifest_path?: string | undefined;
        runner?: string | undefined;
    }>>;
    environment: z.ZodOptional<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
    is_demo_evidence: z.ZodDefault<z.ZodBoolean>;
    checked_at: z.ZodString;
    reviewer: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    schema_version: string;
    subject: {
        type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
        slug: string;
        version?: string | undefined;
    };
    status: "REPRODUCED" | "UNVERIFIED" | "VALIDATED_SCHEMA";
    evidence_kind: "DEMO_FIXTURE_REPRODUCTION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "REVIEW_NOTE" | "SCHEMA_VALIDATION";
    summary: string;
    evidence_url?: string | undefined;
    reproducibility_hash?: string | undefined;
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
        command?: string | undefined;
        manifest_path?: string | undefined;
        runner?: string | undefined;
    };
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    is_demo_evidence: boolean;
    checked_at: string;
    reviewer?: string | undefined;
    metadata: Record<string, unknown>;
}, {
    id?: string | undefined;
    schema_version: string;
    subject: {
        type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
        slug: string;
        version?: string | undefined;
    };
    status: "REPRODUCED" | "UNVERIFIED" | "VALIDATED_SCHEMA";
    evidence_kind: "DEMO_FIXTURE_REPRODUCTION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "REVIEW_NOTE" | "SCHEMA_VALIDATION";
    summary: string;
    evidence_url?: string | undefined;
    reproducibility_hash?: string | undefined;
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
        command?: string | undefined;
        manifest_path?: string | undefined;
        runner?: string | undefined;
    } | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    is_demo_evidence?: boolean | undefined;
    checked_at: string;
    reviewer?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>, {
    id?: string | undefined;
    schema_version: string;
    subject: {
        type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
        slug: string;
        version?: string | undefined;
    };
    status: "REPRODUCED" | "UNVERIFIED" | "VALIDATED_SCHEMA";
    evidence_kind: "DEMO_FIXTURE_REPRODUCTION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "REVIEW_NOTE" | "SCHEMA_VALIDATION";
    summary: string;
    evidence_url?: string | undefined;
    reproducibility_hash?: string | undefined;
    source: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
        command?: string | undefined;
        manifest_path?: string | undefined;
        runner?: string | undefined;
    };
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    } | undefined;
    is_demo_evidence: boolean;
    checked_at: string;
    reviewer?: string | undefined;
    metadata: Record<string, unknown>;
}, {
    id?: string | undefined;
    schema_version: string;
    subject: {
        type: "ARTIFACT" | "BENCHMARK_RUN" | "BENCHMARK_SUITE";
        slug: string;
        version?: string | undefined;
    };
    status: "REPRODUCED" | "UNVERIFIED" | "VALIDATED_SCHEMA";
    evidence_kind: "DEMO_FIXTURE_REPRODUCTION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "REVIEW_NOTE" | "SCHEMA_VALIDATION";
    summary: string;
    evidence_url?: string | undefined;
    reproducibility_hash?: string | undefined;
    source?: {
        repository_url?: string | undefined;
        commit_sha?: string | undefined;
        command?: string | undefined;
        manifest_path?: string | undefined;
        runner?: string | undefined;
    } | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    is_demo_evidence?: boolean | undefined;
    checked_at: string;
    reviewer?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;
//# sourceMappingURL=verification-evidence.d.ts.map