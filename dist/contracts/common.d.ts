import { z } from "zod";
export declare const DomainSchema: z.ZodEnum<["QEC", "ALGORITHM"]>;
export type Domain = z.infer<typeof DomainSchema>;
export declare const ArtifactKindSchema: z.ZodEnum<["QEC_DECODER", "QEC_CODE", "NOISE_MODEL", "SYNDROME_DATASET", "QUANTUM_ALGORITHM", "PROBLEM_INSTANCE", "CLASSICAL_REFERENCE", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export declare const VerificationStatusSchema: z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export declare const UrlSchema: z.ZodString;
export declare const IsoDateTimeSchema: z.ZodString;
export declare const CitationSchema: z.ZodObject<{
    title: z.ZodString;
    authors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    year: z.ZodOptional<z.ZodNumber>;
    doi: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    bibtex: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    authors: string[];
    year?: number | undefined;
    doi?: string | undefined;
    url?: string | undefined;
    bibtex?: string | undefined;
}, {
    title: string;
    authors?: string[] | undefined;
    year?: number | undefined;
    doi?: string | undefined;
    url?: string | undefined;
    bibtex?: string | undefined;
}>;
export type Citation = z.infer<typeof CitationSchema>;
export declare const MetricDefinitionSchema: z.ZodObject<{
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
}>;
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;
export declare const EnvironmentSchema: z.ZodObject<{
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
}>;
export type Environment = z.infer<typeof EnvironmentSchema>;
//# sourceMappingURL=common.d.ts.map