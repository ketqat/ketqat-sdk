import { z } from "zod";
export declare const QecBenchmarkDefinitionSchema: z.ZodObject<{
    code_family: z.ZodString;
    noise_model: z.ZodString;
    decoder_interface_version: z.ZodString;
    syndrome_definition: z.ZodString;
    sampling_assumptions: z.ZodString;
    logical_failure_definition: z.ZodString;
}, z.core.$strip>;
export type QecBenchmarkDefinition = z.infer<typeof QecBenchmarkDefinitionSchema>;
export declare const AlgorithmBenchmarkDefinitionSchema: z.ZodObject<{
    algorithm_family: z.ZodString;
    problem_type: z.ZodString;
    problem_instance_definition: z.ZodString;
    simulation_method: z.ZodString;
    reference_solution_definition: z.ZodString;
    measurement_definition: z.ZodString;
    success_criterion: z.ZodString;
}, z.core.$strip>;
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
    }, z.core.$strip>>;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<{
        PRIVATE: "PRIVATE";
        PUBLIC: "PUBLIC";
    }>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    domain: z.ZodLiteral<"QEC">;
    definition: z.ZodObject<{
        code_family: z.ZodString;
        noise_model: z.ZodString;
        decoder_interface_version: z.ZodString;
        syndrome_definition: z.ZodString;
        sampling_assumptions: z.ZodString;
        logical_failure_definition: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
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
    }, z.core.$strip>>;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<{
        PRIVATE: "PRIVATE";
        PUBLIC: "PUBLIC";
    }>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    domain: z.ZodLiteral<"ALGORITHM">;
    definition: z.ZodObject<{
        algorithm_family: z.ZodString;
        problem_type: z.ZodString;
        problem_instance_definition: z.ZodString;
        simulation_method: z.ZodString;
        reference_solution_definition: z.ZodString;
        measurement_definition: z.ZodString;
        success_criterion: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AlgorithmBenchmarkSuite = z.infer<typeof AlgorithmBenchmarkSuiteSchema>;
export declare const BenchmarkSuiteSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>>;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<{
        PRIVATE: "PRIVATE";
        PUBLIC: "PUBLIC";
    }>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    domain: z.ZodLiteral<"QEC">;
    definition: z.ZodObject<{
        code_family: z.ZodString;
        noise_model: z.ZodString;
        decoder_interface_version: z.ZodString;
        syndrome_definition: z.ZodString;
        sampling_assumptions: z.ZodString;
        logical_failure_definition: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
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
    }, z.core.$strip>>;
    default_configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    repository_url: z.ZodOptional<z.ZodString>;
    is_demo: z.ZodBoolean;
    owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<{
        PRIVATE: "PRIVATE";
        PUBLIC: "PUBLIC";
    }>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    domain: z.ZodLiteral<"ALGORITHM">;
    definition: z.ZodObject<{
        algorithm_family: z.ZodString;
        problem_type: z.ZodString;
        problem_instance_definition: z.ZodString;
        simulation_method: z.ZodString;
        reference_solution_definition: z.ZodString;
        measurement_definition: z.ZodString;
        success_criterion: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>], "domain">;
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>;
//# sourceMappingURL=benchmark-suite.d.ts.map