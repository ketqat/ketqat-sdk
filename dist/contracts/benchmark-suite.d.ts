import { z } from "zod";
export declare const QecBenchmarkDefinitionSchema: z.ZodObject<{
    code_family: z.ZodString;
    noise_model: z.ZodString;
    decoder_interface_version: z.ZodString;
    syndrome_definition: z.ZodString;
    sampling_assumptions: z.ZodString;
    logical_failure_definition: z.ZodString;
}, "strip", z.ZodTypeAny, {
    decoder_interface_version: string;
    code_family: string;
    noise_model: string;
    syndrome_definition: string;
    sampling_assumptions: string;
    logical_failure_definition: string;
}, {
    decoder_interface_version: string;
    code_family: string;
    noise_model: string;
    syndrome_definition: string;
    sampling_assumptions: string;
    logical_failure_definition: string;
}>;
export type QecBenchmarkDefinition = z.infer<typeof QecBenchmarkDefinitionSchema>;
export declare const AlgorithmBenchmarkDefinitionSchema: z.ZodObject<{
    algorithm_family: z.ZodString;
    problem_type: z.ZodString;
    problem_instance_definition: z.ZodString;
    simulation_method: z.ZodString;
    reference_solution_definition: z.ZodString;
    measurement_definition: z.ZodString;
    success_criterion: z.ZodString;
}, "strip", z.ZodTypeAny, {
    algorithm_family: string;
    problem_type: string;
    problem_instance_definition: string;
    simulation_method: string;
    reference_solution_definition: string;
    measurement_definition: string;
    success_criterion: string;
}, {
    algorithm_family: string;
    problem_type: string;
    problem_instance_definition: string;
    simulation_method: string;
    reference_solution_definition: string;
    measurement_definition: string;
    success_criterion: string;
}>;
export type AlgorithmBenchmarkDefinition = z.infer<typeof AlgorithmBenchmarkDefinitionSchema>;
export declare const QecBenchmarkSuiteSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    version: z.ZodString;
    schema_version: z.ZodString;
    experiment_type: z.ZodString;
    metric_definitions: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        unit: z.ZodOptional<z.ZodString>;
        lower_is_better: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }>, "many">;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
} & {
    domain: z.ZodLiteral<"QEC">;
    definition: z.ZodObject<{
        code_family: z.ZodString;
        noise_model: z.ZodString;
        decoder_interface_version: z.ZodString;
        syndrome_definition: z.ZodString;
        sampling_assumptions: z.ZodString;
        logical_failure_definition: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    }, {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "QEC";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    default_configuration: Record<string, unknown>;
    definition: {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "QEC";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    definition: {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    default_configuration?: Record<string, unknown> | undefined;
}>;
export type QecBenchmarkSuite = z.infer<typeof QecBenchmarkSuiteSchema>;
export declare const AlgorithmBenchmarkSuiteSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    version: z.ZodString;
    schema_version: z.ZodString;
    experiment_type: z.ZodString;
    metric_definitions: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        unit: z.ZodOptional<z.ZodString>;
        lower_is_better: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }>, "many">;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
} & {
    domain: z.ZodLiteral<"ALGORITHM">;
    definition: z.ZodObject<{
        algorithm_family: z.ZodString;
        problem_type: z.ZodString;
        problem_instance_definition: z.ZodString;
        simulation_method: z.ZodString;
        reference_solution_definition: z.ZodString;
        measurement_definition: z.ZodString;
        success_criterion: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    }, {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "ALGORITHM";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    default_configuration: Record<string, unknown>;
    definition: {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "ALGORITHM";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    definition: {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    default_configuration?: Record<string, unknown> | undefined;
}>;
export type AlgorithmBenchmarkSuite = z.infer<typeof AlgorithmBenchmarkSuiteSchema>;
export declare const BenchmarkSuiteSchema: z.ZodDiscriminatedUnion<"domain", [z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    version: z.ZodString;
    schema_version: z.ZodString;
    experiment_type: z.ZodString;
    metric_definitions: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        unit: z.ZodOptional<z.ZodString>;
        lower_is_better: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }>, "many">;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
} & {
    domain: z.ZodLiteral<"QEC">;
    definition: z.ZodObject<{
        code_family: z.ZodString;
        noise_model: z.ZodString;
        decoder_interface_version: z.ZodString;
        syndrome_definition: z.ZodString;
        sampling_assumptions: z.ZodString;
        logical_failure_definition: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    }, {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "QEC";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    default_configuration: Record<string, unknown>;
    definition: {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "QEC";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    definition: {
        decoder_interface_version: string;
        code_family: string;
        noise_model: string;
        syndrome_definition: string;
        sampling_assumptions: string;
        logical_failure_definition: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    default_configuration?: Record<string, unknown> | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    version: z.ZodString;
    schema_version: z.ZodString;
    experiment_type: z.ZodString;
    metric_definitions: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        unit: z.ZodOptional<z.ZodString>;
        lower_is_better: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }, {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }>, "many">;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["PUBLIC", "PRIVATE"]>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
} & {
    domain: z.ZodLiteral<"ALGORITHM">;
    definition: z.ZodObject<{
        algorithm_family: z.ZodString;
        problem_type: z.ZodString;
        problem_instance_definition: z.ZodString;
        simulation_method: z.ZodString;
        reference_solution_definition: z.ZodString;
        measurement_definition: z.ZodString;
        success_criterion: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    }, {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "ALGORITHM";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    default_configuration: Record<string, unknown>;
    definition: {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
}, {
    name: string;
    description: string;
    id: string;
    slug: string;
    domain: "ALGORITHM";
    is_demo: boolean;
    created_at: string;
    updated_at: string;
    version: string;
    schema_version: string;
    experiment_type: string;
    metric_definitions: {
        name: string;
        description: string;
        unit?: string | undefined;
        lower_is_better?: boolean | undefined;
    }[];
    definition: {
        algorithm_family: string;
        problem_type: string;
        problem_instance_definition: string;
        simulation_method: string;
        reference_solution_definition: string;
        measurement_definition: string;
        success_criterion: string;
    };
    repository_url?: string | undefined;
    owner_username?: string | null | undefined;
    visibility?: "PUBLIC" | "PRIVATE" | undefined;
    default_configuration?: Record<string, unknown> | undefined;
}>]>;
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>;
//# sourceMappingURL=benchmark-suite.d.ts.map