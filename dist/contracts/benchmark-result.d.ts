import { z } from "zod";
export declare const QecMetricPointSchema: z.ZodObject<{
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
    shots?: number | undefined;
    runtime_seconds?: number | undefined;
    memory_bytes?: number | undefined;
    seed?: number | undefined;
    metadata: Record<string, unknown>;
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
    runtime_seconds?: number | undefined;
    memory_bytes?: number | undefined;
    seed?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    code_distance?: number | undefined;
    physical_error_rate?: number | undefined;
    logical_failures?: number | undefined;
    logical_error_rate?: number | undefined;
    standard_error?: number | undefined;
    decoder_latency_ms?: number | undefined;
    sampling_runtime_seconds?: number | undefined;
}>;
export type QecMetricPoint = z.infer<typeof QecMetricPointSchema>;
export declare const AlgorithmMetricPointSchema: z.ZodObject<{
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
    shots?: number | undefined;
    runtime_seconds?: number | undefined;
    memory_bytes?: number | undefined;
    seed?: number | undefined;
    metadata: Record<string, unknown>;
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
    runtime_seconds?: number | undefined;
    memory_bytes?: number | undefined;
    seed?: number | undefined;
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
}>;
export type AlgorithmMetricPoint = z.infer<typeof AlgorithmMetricPointSchema>;
export declare const ProtocolMetricPointSchema: z.ZodObject<{
    metric: z.ZodString;
    shots: z.ZodOptional<z.ZodNumber>;
    runtime_seconds: z.ZodOptional<z.ZodNumber>;
    memory_bytes: z.ZodOptional<z.ZodNumber>;
    seed: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
} & {
    /** Clifford sequence length this point was measured at. */
    sequence_length: z.ZodOptional<z.ZodNumber>;
    /** Fraction of shots returning to the initial state. */
    survival_probability: z.ZodOptional<z.ZodNumber>;
    standard_error: z.ZodOptional<z.ZodNumber>;
    sequences: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    metric: string;
    shots?: number | undefined;
    runtime_seconds?: number | undefined;
    memory_bytes?: number | undefined;
    seed?: number | undefined;
    metadata: Record<string, unknown>;
    sequence_length?: number | undefined;
    survival_probability?: number | undefined;
    standard_error?: number | undefined;
    sequences?: number | undefined;
}, {
    metric: string;
    shots?: number | undefined;
    runtime_seconds?: number | undefined;
    memory_bytes?: number | undefined;
    seed?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    sequence_length?: number | undefined;
    survival_probability?: number | undefined;
    standard_error?: number | undefined;
    sequences?: number | undefined;
}>;
export type ProtocolMetricPoint = z.infer<typeof ProtocolMetricPointSchema>;
export declare const QecBenchmarkResultSchema: z.ZodObject<{
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
    summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    finished_at: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodDefault<z.ZodBoolean>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    execution_class: z.ZodOptional<z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>>;
    transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
        adapter: z.ZodString;
        adapter_version: z.ZodString;
        library_version: z.ZodOptional<z.ZodString>;
        options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input_circuit_hash: z.ZodOptional<z.ZodString>;
        output_circuit_hash: z.ZodOptional<z.ZodString>;
        loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
            feature: z.ZodString;
            severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
            action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
            detail: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }>, "many">>;
        equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
            method: z.ZodOptional<z.ZodString>;
            tolerance: z.ZodOptional<z.ZodNumber>;
            global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            counterexample: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }>, "many">>;
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
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
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
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration: Record<string, unknown>;
    environment: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    };
    summary_metrics: Record<string, unknown>;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo: boolean;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "QEC";
    metric_points: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
        code_distance?: number | undefined;
        physical_error_rate?: number | undefined;
        logical_failures?: number | undefined;
        logical_error_rate?: number | undefined;
        standard_error?: number | undefined;
        decoder_latency_ms?: number | undefined;
        sampling_runtime_seconds?: number | undefined;
    }[];
}, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration?: Record<string, unknown> | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    summary_metrics?: Record<string, unknown> | undefined;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo?: boolean | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "QEC";
    metric_points?: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
        code_distance?: number | undefined;
        physical_error_rate?: number | undefined;
        logical_failures?: number | undefined;
        logical_error_rate?: number | undefined;
        standard_error?: number | undefined;
        decoder_latency_ms?: number | undefined;
        sampling_runtime_seconds?: number | undefined;
    }[] | undefined;
}>;
export type QecBenchmarkResult = z.infer<typeof QecBenchmarkResultSchema>;
export declare const AlgorithmBenchmarkResultSchema: z.ZodObject<{
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
    summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    finished_at: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodDefault<z.ZodBoolean>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    execution_class: z.ZodOptional<z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>>;
    transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
        adapter: z.ZodString;
        adapter_version: z.ZodString;
        library_version: z.ZodOptional<z.ZodString>;
        options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input_circuit_hash: z.ZodOptional<z.ZodString>;
        output_circuit_hash: z.ZodOptional<z.ZodString>;
        loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
            feature: z.ZodString;
            severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
            action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
            detail: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }>, "many">>;
        equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
            method: z.ZodOptional<z.ZodString>;
            tolerance: z.ZodOptional<z.ZodNumber>;
            global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            counterexample: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }>, "many">>;
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
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
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
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration: Record<string, unknown>;
    environment: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    };
    summary_metrics: Record<string, unknown>;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo: boolean;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "ALGORITHM";
    metric_points: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
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
}, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration?: Record<string, unknown> | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    summary_metrics?: Record<string, unknown> | undefined;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo?: boolean | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "ALGORITHM";
    metric_points?: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
}>;
export type AlgorithmBenchmarkResult = z.infer<typeof AlgorithmBenchmarkResultSchema>;
export declare const ProtocolBenchmarkResultSchema: z.ZodObject<{
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
    summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    finished_at: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodDefault<z.ZodBoolean>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    execution_class: z.ZodOptional<z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>>;
    transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
        adapter: z.ZodString;
        adapter_version: z.ZodString;
        library_version: z.ZodOptional<z.ZodString>;
        options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input_circuit_hash: z.ZodOptional<z.ZodString>;
        output_circuit_hash: z.ZodOptional<z.ZodString>;
        loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
            feature: z.ZodString;
            severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
            action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
            detail: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }>, "many">>;
        equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
            method: z.ZodOptional<z.ZodString>;
            tolerance: z.ZodOptional<z.ZodNumber>;
            global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            counterexample: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }>, "many">>;
} & {
    domain: z.ZodLiteral<"PROTOCOL">;
    metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
        metric: z.ZodString;
        shots: z.ZodOptional<z.ZodNumber>;
        runtime_seconds: z.ZodOptional<z.ZodNumber>;
        memory_bytes: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    } & {
        /** Clifford sequence length this point was measured at. */
        sequence_length: z.ZodOptional<z.ZodNumber>;
        /** Fraction of shots returning to the initial state. */
        survival_probability: z.ZodOptional<z.ZodNumber>;
        standard_error: z.ZodOptional<z.ZodNumber>;
        sequences: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }, {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration: Record<string, unknown>;
    environment: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    };
    summary_metrics: Record<string, unknown>;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo: boolean;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "PROTOCOL";
    metric_points: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }[];
}, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration?: Record<string, unknown> | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    summary_metrics?: Record<string, unknown> | undefined;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo?: boolean | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "PROTOCOL";
    metric_points?: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }[] | undefined;
}>;
export type ProtocolBenchmarkResult = z.infer<typeof ProtocolBenchmarkResultSchema>;
export declare const BenchmarkResultSchema: z.ZodDiscriminatedUnion<"domain", [z.ZodObject<{
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
    summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    finished_at: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodDefault<z.ZodBoolean>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    execution_class: z.ZodOptional<z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>>;
    transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
        adapter: z.ZodString;
        adapter_version: z.ZodString;
        library_version: z.ZodOptional<z.ZodString>;
        options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input_circuit_hash: z.ZodOptional<z.ZodString>;
        output_circuit_hash: z.ZodOptional<z.ZodString>;
        loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
            feature: z.ZodString;
            severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
            action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
            detail: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }>, "many">>;
        equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
            method: z.ZodOptional<z.ZodString>;
            tolerance: z.ZodOptional<z.ZodNumber>;
            global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            counterexample: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }>, "many">>;
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
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
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
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration: Record<string, unknown>;
    environment: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    };
    summary_metrics: Record<string, unknown>;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo: boolean;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "QEC";
    metric_points: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
        code_distance?: number | undefined;
        physical_error_rate?: number | undefined;
        logical_failures?: number | undefined;
        logical_error_rate?: number | undefined;
        standard_error?: number | undefined;
        decoder_latency_ms?: number | undefined;
        sampling_runtime_seconds?: number | undefined;
    }[];
}, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration?: Record<string, unknown> | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    summary_metrics?: Record<string, unknown> | undefined;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo?: boolean | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "QEC";
    metric_points?: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
    summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    finished_at: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodDefault<z.ZodBoolean>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    execution_class: z.ZodOptional<z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>>;
    transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
        adapter: z.ZodString;
        adapter_version: z.ZodString;
        library_version: z.ZodOptional<z.ZodString>;
        options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input_circuit_hash: z.ZodOptional<z.ZodString>;
        output_circuit_hash: z.ZodOptional<z.ZodString>;
        loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
            feature: z.ZodString;
            severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
            action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
            detail: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }>, "many">>;
        equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
            method: z.ZodOptional<z.ZodString>;
            tolerance: z.ZodOptional<z.ZodNumber>;
            global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            counterexample: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }>, "many">>;
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
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
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
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration: Record<string, unknown>;
    environment: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    };
    summary_metrics: Record<string, unknown>;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo: boolean;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "ALGORITHM";
    metric_points: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
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
}, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration?: Record<string, unknown> | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    summary_metrics?: Record<string, unknown> | undefined;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo?: boolean | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "ALGORITHM";
    metric_points?: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
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
    summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
    started_at: z.ZodOptional<z.ZodString>;
    finished_at: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodDefault<z.ZodBoolean>;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
    execution_class: z.ZodOptional<z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>>;
    transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["IMPORT", "EXPORT", "CONVERSION", "TRANSPILATION", "OPTIMIZATION", "ZX_REWRITE", "MITIGATION", "LAYOUT", "ROUTING"]>;
        adapter: z.ZodString;
        adapter_version: z.ZodString;
        library_version: z.ZodOptional<z.ZodString>;
        options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input_circuit_hash: z.ZodOptional<z.ZodString>;
        output_circuit_hash: z.ZodOptional<z.ZodString>;
        loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
            feature: z.ZodString;
            severity: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
            action: z.ZodEnum<["rejected", "dropped", "approximated"]>;
            detail: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }, {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }>, "many">>;
        equivalence: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            level: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
            method: z.ZodOptional<z.ZodString>;
            tolerance: z.ZodOptional<z.ZodNumber>;
            global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            counterexample: z.ZodOptional<z.ZodString>;
            reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }, {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }, {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }>, "many">>;
} & {
    domain: z.ZodLiteral<"PROTOCOL">;
    metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
        metric: z.ZodString;
        shots: z.ZodOptional<z.ZodNumber>;
        runtime_seconds: z.ZodOptional<z.ZodNumber>;
        memory_bytes: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    } & {
        /** Clifford sequence length this point was measured at. */
        sequence_length: z.ZodOptional<z.ZodNumber>;
        /** Fraction of shots returning to the initial state. */
        survival_probability: z.ZodOptional<z.ZodNumber>;
        standard_error: z.ZodOptional<z.ZodNumber>;
        sequences: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }, {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration: Record<string, unknown>;
    environment: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages: Record<string, string>;
        hardware: Record<string, unknown>;
    };
    summary_metrics: Record<string, unknown>;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo: boolean;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options: Record<string, unknown>;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[];
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "PROTOCOL";
    metric_points: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata: Record<string, unknown>;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }[];
}, {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    status: "COMPLETED" | "FAILED" | "RUNNING";
    artifact_slug?: string | undefined;
    benchmark_suite: string;
    benchmark_suite_version: string;
    schema_version: string;
    sdk_version?: string | undefined;
    commit_sha?: string | undefined;
    source_repository_url?: string | undefined;
    configuration?: Record<string, unknown> | undefined;
    environment?: {
        operating_system?: string | undefined;
        architecture?: string | undefined;
        python_version?: string | undefined;
        node_version?: string | undefined;
        packages?: Record<string, string> | undefined;
        hardware?: Record<string, unknown> | undefined;
    } | undefined;
    summary_metrics?: Record<string, unknown> | undefined;
    reproducibility_hash: string;
    reproducibility_hash_version?: number | undefined;
    started_at?: string | undefined;
    finished_at?: string | undefined;
    is_demo?: boolean | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PRIVATE" | "PUBLIC" | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
    execution_class?: "ANALYTICAL" | "DEMO" | "HARDWARE" | "SIMULATION" | undefined;
    transformation_chain?: {
        kind: "CONVERSION" | "EXPORT" | "IMPORT" | "LAYOUT" | "MITIGATION" | "OPTIMIZATION" | "ROUTING" | "TRANSPILATION" | "ZX_REWRITE";
        adapter: string;
        adapter_version: string;
        library_version?: string | undefined;
        options?: Record<string, unknown> | undefined;
        input_circuit_hash?: string | undefined;
        output_circuit_hash?: string | undefined;
        loss_report?: {
            feature: string;
            severity: "cosmetic" | "semantic" | "structural";
            action: "approximated" | "dropped" | "rejected";
            detail: string;
            location?: string | undefined;
        }[] | undefined;
        equivalence?: {
            level: "FAILED" | "INCONCLUSIVE" | "NOT_CHECKED" | "NUMERICALLY_CHECKED" | "PROVED_BY_SUPPORTED_REWRITE" | "SYMBOLICALLY_REDUCED";
            method?: string | undefined;
            tolerance?: number | undefined;
            global_phase_ignored?: boolean | undefined;
            qubit_count?: number | undefined;
            counterexample?: string | undefined;
            reason?: string | undefined;
        } | undefined;
    }[] | undefined;
    domain: "PROTOCOL";
    metric_points?: {
        metric: string;
        shots?: number | undefined;
        runtime_seconds?: number | undefined;
        memory_bytes?: number | undefined;
        seed?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
        sequence_length?: number | undefined;
        survival_probability?: number | undefined;
        standard_error?: number | undefined;
        sequences?: number | undefined;
    }[] | undefined;
}>]>;
export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;
//# sourceMappingURL=benchmark-result.d.ts.map