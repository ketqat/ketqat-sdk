import { z } from "zod";
export declare const ReproducibilityBundleSchema: z.ZodEffects<z.ZodObject<{
    bundle_version: z.ZodString;
    experiment_manifest: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    benchmark_result: z.ZodDiscriminatedUnion<"domain", [z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        slug: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        status: z.ZodEnum<["COMPLETED", "FAILED", "RUNNING"]>;
        artifact_slug: z.ZodOptional<z.ZodString>;
        benchmark_suite: z.ZodString;
        benchmark_suite_version: z.ZodString;
        schema_version: z.ZodString;
        sdk_version: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        source_repository_url: z.ZodOptional<z.ZodString>;
        configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodDefault<z.ZodObject<{
            operating_system: z.ZodOptional<z.ZodString>;
            architecture: z.ZodOptional<z.ZodString>;
            python_version: z.ZodOptional<z.ZodString>;
            node_version: z.ZodOptional<z.ZodString>;
            packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        }, {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        }>>;
        summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        reproducibility_hash: z.ZodString;
        started_at: z.ZodOptional<z.ZodString>;
        finished_at: z.ZodOptional<z.ZodString>;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
    } & {
        domain: z.ZodLiteral<"QEC">;
        metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
            metric: z.ZodString;
            shots: z.ZodOptional<z.ZodNumber>;
            runtime_seconds: z.ZodOptional<z.ZodNumber>;
            memory_bytes: z.ZodOptional<z.ZodNumber>;
            seed: z.ZodOptional<z.ZodNumber>;
            metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        } & {
            code_distance: z.ZodOptional<z.ZodNumber>;
            physical_error_rate: z.ZodOptional<z.ZodNumber>;
            logical_failures: z.ZodOptional<z.ZodNumber>;
            logical_error_rate: z.ZodOptional<z.ZodNumber>;
            standard_error: z.ZodOptional<z.ZodNumber>;
            decoder_latency_ms: z.ZodOptional<z.ZodNumber>;
            sampling_runtime_seconds: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }, {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "QEC";
        is_demo: boolean;
        schema_version: string;
        environment: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        };
        benchmark_suite: string;
        benchmark_suite_version: string;
        configuration: Record<string, unknown>;
        summary_metrics: Record<string, unknown>;
        reproducibility_hash: string;
        metric_points: {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }[];
        id?: string | undefined;
        slug?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
    }, {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "QEC";
        schema_version: string;
        benchmark_suite: string;
        benchmark_suite_version: string;
        reproducibility_hash: string;
        id?: string | undefined;
        slug?: string | undefined;
        is_demo?: boolean | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        environment?: {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        } | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        configuration?: Record<string, unknown> | undefined;
        summary_metrics?: Record<string, unknown> | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
        metric_points?: {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }[] | undefined;
    }>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        slug: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        status: z.ZodEnum<["COMPLETED", "FAILED", "RUNNING"]>;
        artifact_slug: z.ZodOptional<z.ZodString>;
        benchmark_suite: z.ZodString;
        benchmark_suite_version: z.ZodString;
        schema_version: z.ZodString;
        sdk_version: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        source_repository_url: z.ZodOptional<z.ZodString>;
        configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodDefault<z.ZodObject<{
            operating_system: z.ZodOptional<z.ZodString>;
            architecture: z.ZodOptional<z.ZodString>;
            python_version: z.ZodOptional<z.ZodString>;
            node_version: z.ZodOptional<z.ZodString>;
            packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        }, {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        }>>;
        summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        reproducibility_hash: z.ZodString;
        started_at: z.ZodOptional<z.ZodString>;
        finished_at: z.ZodOptional<z.ZodString>;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
    } & {
        domain: z.ZodLiteral<"ALGORITHM">;
        metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
            metric: z.ZodString;
            shots: z.ZodOptional<z.ZodNumber>;
            runtime_seconds: z.ZodOptional<z.ZodNumber>;
            memory_bytes: z.ZodOptional<z.ZodNumber>;
            seed: z.ZodOptional<z.ZodNumber>;
            metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        } & {
            qubit_count: z.ZodOptional<z.ZodNumber>;
            circuit_depth: z.ZodOptional<z.ZodNumber>;
            gate_count: z.ZodOptional<z.ZodNumber>;
            two_qubit_gate_count: z.ZodOptional<z.ZodNumber>;
            success_probability: z.ZodOptional<z.ZodNumber>;
            fidelity: z.ZodOptional<z.ZodNumber>;
            objective_value: z.ZodOptional<z.ZodNumber>;
            energy_error: z.ZodOptional<z.ZodNumber>;
            approximation_ratio: z.ZodOptional<z.ZodNumber>;
            simulation_runtime_seconds: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }, {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "ALGORITHM";
        is_demo: boolean;
        schema_version: string;
        environment: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        };
        benchmark_suite: string;
        benchmark_suite_version: string;
        configuration: Record<string, unknown>;
        summary_metrics: Record<string, unknown>;
        reproducibility_hash: string;
        metric_points: {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }[];
        id?: string | undefined;
        slug?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
    }, {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "ALGORITHM";
        schema_version: string;
        benchmark_suite: string;
        benchmark_suite_version: string;
        reproducibility_hash: string;
        id?: string | undefined;
        slug?: string | undefined;
        is_demo?: boolean | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        environment?: {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        } | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        configuration?: Record<string, unknown> | undefined;
        summary_metrics?: Record<string, unknown> | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
        metric_points?: {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }[] | undefined;
    }>]>;
    benchmark_suite_definition: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    verification_evidence: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        schema_version: z.ZodString;
        subject: z.ZodObject<{
            type: z.ZodEnum<["ARTIFACT", "BENCHMARK_SUITE", "BENCHMARK_RUN"]>;
            slug: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        }, {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
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
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
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
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        source: {
            repository_url?: string | undefined;
            commit_sha?: string | undefined;
            command?: string | undefined;
            manifest_path?: string | undefined;
            runner?: string | undefined;
        };
        metadata: Record<string, unknown>;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        is_demo_evidence: boolean;
        checked_at: string;
        id?: string | undefined;
        environment?: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        } | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        reviewer?: string | undefined;
    }, {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        checked_at: string;
        id?: string | undefined;
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
        metadata?: Record<string, unknown> | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        is_demo_evidence?: boolean | undefined;
        reviewer?: string | undefined;
    }>, {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        source: {
            repository_url?: string | undefined;
            commit_sha?: string | undefined;
            command?: string | undefined;
            manifest_path?: string | undefined;
            runner?: string | undefined;
        };
        metadata: Record<string, unknown>;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        is_demo_evidence: boolean;
        checked_at: string;
        id?: string | undefined;
        environment?: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        } | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        reviewer?: string | undefined;
    }, {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        checked_at: string;
        id?: string | undefined;
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
        metadata?: Record<string, unknown> | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        is_demo_evidence?: boolean | undefined;
        reviewer?: string | undefined;
    }>, "many">>;
    artifact_metadata: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        slug: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        slug: string;
    }, {
        slug: string;
    }>>>;
    environment: z.ZodDefault<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
    }, {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    }>>;
    source_repository: z.ZodString;
    commit_sha: z.ZodString;
    reproducibility_hash: z.ZodString;
    citation: z.ZodString;
    reproduction_instructions: z.ZodObject<{
        command: z.ZodString;
        notes: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        command: string;
        notes: string;
    }, {
        command: string;
        notes: string;
    }>;
}, "strip", z.ZodTypeAny, {
    citation: string;
    commit_sha: string;
    environment: {
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
    };
    reproducibility_hash: string;
    bundle_version: string;
    experiment_manifest: Record<string, unknown>;
    benchmark_result: {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "QEC";
        is_demo: boolean;
        schema_version: string;
        environment: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        };
        benchmark_suite: string;
        benchmark_suite_version: string;
        configuration: Record<string, unknown>;
        summary_metrics: Record<string, unknown>;
        reproducibility_hash: string;
        metric_points: {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }[];
        id?: string | undefined;
        slug?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
    } | {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "ALGORITHM";
        is_demo: boolean;
        schema_version: string;
        environment: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        };
        benchmark_suite: string;
        benchmark_suite_version: string;
        configuration: Record<string, unknown>;
        summary_metrics: Record<string, unknown>;
        reproducibility_hash: string;
        metric_points: {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }[];
        id?: string | undefined;
        slug?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
    };
    benchmark_suite_definition: Record<string, unknown> | null;
    verification_evidence: {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        source: {
            repository_url?: string | undefined;
            commit_sha?: string | undefined;
            command?: string | undefined;
            manifest_path?: string | undefined;
            runner?: string | undefined;
        };
        metadata: Record<string, unknown>;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        is_demo_evidence: boolean;
        checked_at: string;
        id?: string | undefined;
        environment?: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        } | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        reviewer?: string | undefined;
    }[];
    artifact_metadata: {
        slug: string;
    } | null;
    source_repository: string;
    reproduction_instructions: {
        command: string;
        notes: string;
    };
}, {
    citation: string;
    commit_sha: string;
    reproducibility_hash: string;
    bundle_version: string;
    benchmark_result: {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "QEC";
        schema_version: string;
        benchmark_suite: string;
        benchmark_suite_version: string;
        reproducibility_hash: string;
        id?: string | undefined;
        slug?: string | undefined;
        is_demo?: boolean | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        environment?: {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        } | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        configuration?: Record<string, unknown> | undefined;
        summary_metrics?: Record<string, unknown> | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
        metric_points?: {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }[] | undefined;
    } | {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "ALGORITHM";
        schema_version: string;
        benchmark_suite: string;
        benchmark_suite_version: string;
        reproducibility_hash: string;
        id?: string | undefined;
        slug?: string | undefined;
        is_demo?: boolean | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        environment?: {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        } | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        configuration?: Record<string, unknown> | undefined;
        summary_metrics?: Record<string, unknown> | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
        metric_points?: {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }[] | undefined;
    };
    benchmark_suite_definition: Record<string, unknown> | null;
    source_repository: string;
    reproduction_instructions: {
        command: string;
        notes: string;
    };
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    experiment_manifest?: Record<string, unknown> | undefined;
    verification_evidence?: {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        checked_at: string;
        id?: string | undefined;
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
        metadata?: Record<string, unknown> | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        is_demo_evidence?: boolean | undefined;
        reviewer?: string | undefined;
    }[] | undefined;
    artifact_metadata?: {
        slug: string;
    } | null | undefined;
}>, {
    citation: string;
    commit_sha: string;
    environment: {
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
    };
    reproducibility_hash: string;
    bundle_version: string;
    experiment_manifest: Record<string, unknown>;
    benchmark_result: {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "QEC";
        is_demo: boolean;
        schema_version: string;
        environment: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        };
        benchmark_suite: string;
        benchmark_suite_version: string;
        configuration: Record<string, unknown>;
        summary_metrics: Record<string, unknown>;
        reproducibility_hash: string;
        metric_points: {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }[];
        id?: string | undefined;
        slug?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
    } | {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "ALGORITHM";
        is_demo: boolean;
        schema_version: string;
        environment: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        };
        benchmark_suite: string;
        benchmark_suite_version: string;
        configuration: Record<string, unknown>;
        summary_metrics: Record<string, unknown>;
        reproducibility_hash: string;
        metric_points: {
            metric: string;
            metadata: Record<string, unknown>;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }[];
        id?: string | undefined;
        slug?: string | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
    };
    benchmark_suite_definition: Record<string, unknown> | null;
    verification_evidence: {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        source: {
            repository_url?: string | undefined;
            commit_sha?: string | undefined;
            command?: string | undefined;
            manifest_path?: string | undefined;
            runner?: string | undefined;
        };
        metadata: Record<string, unknown>;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        is_demo_evidence: boolean;
        checked_at: string;
        id?: string | undefined;
        environment?: {
            packages: Record<string, string>;
            hardware: Record<string, unknown>;
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
        } | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        reviewer?: string | undefined;
    }[];
    artifact_metadata: {
        slug: string;
    } | null;
    source_repository: string;
    reproduction_instructions: {
        command: string;
        notes: string;
    };
}, {
    citation: string;
    commit_sha: string;
    reproducibility_hash: string;
    bundle_version: string;
    benchmark_result: {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "QEC";
        schema_version: string;
        benchmark_suite: string;
        benchmark_suite_version: string;
        reproducibility_hash: string;
        id?: string | undefined;
        slug?: string | undefined;
        is_demo?: boolean | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        environment?: {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        } | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        configuration?: Record<string, unknown> | undefined;
        summary_metrics?: Record<string, unknown> | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
        metric_points?: {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            code_distance?: number | undefined;
            physical_error_rate?: number | undefined;
            logical_failures?: number | undefined;
            logical_error_rate?: number | undefined;
            standard_error?: number | undefined;
            decoder_latency_ms?: number | undefined;
            sampling_runtime_seconds?: number | undefined;
        }[] | undefined;
    } | {
        status: "COMPLETED" | "FAILED" | "RUNNING";
        name: string;
        domain: "ALGORITHM";
        schema_version: string;
        benchmark_suite: string;
        benchmark_suite_version: string;
        reproducibility_hash: string;
        id?: string | undefined;
        slug?: string | undefined;
        is_demo?: boolean | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        commit_sha?: string | undefined;
        environment?: {
            operating_system?: string | undefined;
            architecture?: string | undefined;
            python_version?: string | undefined;
            node_version?: string | undefined;
            packages?: Record<string, string> | undefined;
            hardware?: Record<string, unknown> | undefined;
        } | undefined;
        artifact_slug?: string | undefined;
        sdk_version?: string | undefined;
        source_repository_url?: string | undefined;
        configuration?: Record<string, unknown> | undefined;
        summary_metrics?: Record<string, unknown> | undefined;
        started_at?: string | undefined;
        finished_at?: string | undefined;
        metric_points?: {
            metric: string;
            shots?: number | undefined;
            seed?: number | undefined;
            runtime_seconds?: number | undefined;
            memory_bytes?: number | undefined;
            metadata?: Record<string, unknown> | undefined;
            qubit_count?: number | undefined;
            circuit_depth?: number | undefined;
            gate_count?: number | undefined;
            two_qubit_gate_count?: number | undefined;
            success_probability?: number | undefined;
            fidelity?: number | undefined;
            objective_value?: number | undefined;
            energy_error?: number | undefined;
            approximation_ratio?: number | undefined;
            simulation_runtime_seconds?: number | undefined;
        }[] | undefined;
    };
    benchmark_suite_definition: Record<string, unknown> | null;
    source_repository: string;
    reproduction_instructions: {
        command: string;
        notes: string;
    };
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    experiment_manifest?: Record<string, unknown> | undefined;
    verification_evidence?: {
        status: "UNVERIFIED" | "VALIDATED_SCHEMA" | "REPRODUCED";
        schema_version: string;
        subject: {
            type: "BENCHMARK_SUITE" | "ARTIFACT" | "BENCHMARK_RUN";
            slug: string;
            version?: string | undefined;
        };
        evidence_kind: "SCHEMA_VALIDATION" | "HASH_VERIFICATION" | "INDEPENDENT_REPRODUCTION" | "DEMO_FIXTURE_REPRODUCTION" | "REVIEW_NOTE";
        summary: string;
        checked_at: string;
        id?: string | undefined;
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
        metadata?: Record<string, unknown> | undefined;
        reproducibility_hash?: string | undefined;
        evidence_url?: string | undefined;
        is_demo_evidence?: boolean | undefined;
        reviewer?: string | undefined;
    }[] | undefined;
    artifact_metadata?: {
        slug: string;
    } | null | undefined;
}>;
export type ReproducibilityBundle = z.infer<typeof ReproducibilityBundleSchema>;
//# sourceMappingURL=reproducibility-bundle.d.ts.map