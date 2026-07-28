import { z } from "zod";
export declare const DomainSchema: z.ZodEnum<["QEC", "ALGORITHM"]>;
export type Domain = z.infer<typeof DomainSchema>;
export declare const ArtifactKindSchema: z.ZodEnum<["QEC_DECODER", "QEC_CODE", "NOISE_MODEL", "SYNDROME_DATASET", "QUANTUM_ALGORITHM", "PROBLEM_INSTANCE", "CLASSICAL_REFERENCE", "BENCHMARK_SUITE", "SIMULATION_TOOL", "RESOURCE_ANALYSIS_TOOL"]>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export declare const VerificationStatusSchema: z.ZodEnum<["UNVERIFIED", "VALIDATED_SCHEMA", "REPRODUCED"]>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export declare const VisibilitySchema: z.ZodEnum<["PUBLIC", "PRIVATE"]>;
export type Visibility = z.infer<typeof VisibilitySchema>;
/**
 * Platform 2.0 artifact taxonomy (RFC 0003).
 *
 * This is additive: `domain` and `kind` keep their existing meaning, and
 * `artifact_type` is recorded alongside them rather than replacing them, so
 * records written before this taxonomy existed stay valid and keep their hashes.
 */
export declare const ArtifactTypeSchema: z.ZodEnum<["ALGORITHM", "CIRCUIT", "QEC_CODE", "DECODER", "NOISE_MODEL", "HARDWARE_PROFILE", "BENCHMARK_SUITE", "DATASET", "MITIGATION_PIPELINE", "RESOURCE_MODEL", "COMPILER_OR_TRANSPILER", "EXPERIMENT_TEMPLATE"]>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
/**
 * How a result was produced (RFC 0003).
 *
 * Kept separate from the trust level: a `HARDWARE` result is not more
 * trustworthy than a `SIMULATION` one, it is a different kind of measurement.
 * Comparison code refuses to rank across classes unless the comparison is
 * explicitly scoped and labelled.
 */
export declare const ExecutionClassSchema: z.ZodEnum<["DEMO", "SIMULATION", "HARDWARE", "ANALYTICAL"]>;
export type ExecutionClass = z.infer<typeof ExecutionClassSchema>;
/**
 * Evidence level for a claim that two circuits are equivalent (RFC 0002).
 *
 * `INCONCLUSIVE` and `FAILED` are deliberately distinct. A rewrite system that
 * does not reduce a difference to the identity has failed to prove equality; it
 * has not proved inequality. Only an explicit counterexample justifies `FAILED`.
 */
export declare const EquivalenceLevelSchema: z.ZodEnum<["NOT_CHECKED", "NUMERICALLY_CHECKED", "SYMBOLICALLY_REDUCED", "PROVED_BY_SUPPORTED_REWRITE", "FAILED", "INCONCLUSIVE"]>;
export type EquivalenceLevel = z.infer<typeof EquivalenceLevelSchema>;
/** Ordered verification ladder (RFC 0004). Each level implies the ones before it. */
export declare const TrustLevelSchema: z.ZodEnum<["UNVERIFIED", "SCHEMA_VALIDATED", "HASH_VERIFIED", "SOURCE_VERIFIED", "ENVIRONMENT_RECORDED", "REPRODUCED", "INDEPENDENTLY_REPRODUCED", "REVIEWED"]>;
export type TrustLevel = z.infer<typeof TrustLevelSchema>;
export declare const TRUST_LEVEL_ORDER: readonly TrustLevel[];
/**
 * `REVIEWED` means an identified reviewer examined the method and recorded
 * findings. It does not mean journal peer review, and must not be presented as
 * such. See RFC 0004.
 */
export declare function compareTrustLevels(left: TrustLevel, right: TrustLevel): number;
export declare const LossSeveritySchema: z.ZodEnum<["semantic", "structural", "cosmetic"]>;
export type LossSeverity = z.infer<typeof LossSeveritySchema>;
/**
 * One feature a conversion could not carry across (RFC 0002).
 *
 * A conversion that cannot represent part of its input must reject, or record
 * entries like this. Converting silently is prohibited.
 */
export declare const LossReportEntrySchema: z.ZodObject<{
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
}>;
export type LossReportEntry = z.infer<typeof LossReportEntrySchema>;
export declare const ArtifactRelationTypeSchema: z.ZodEnum<["derived_from", "forks", "implements", "supersedes", "benchmarked_by", "compatible_with", "requires", "cites", "decodes", "targets", "contradicts"]>;
export type ArtifactRelationType = z.infer<typeof ArtifactRelationTypeSchema>;
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
}>;
export type Environment = z.infer<typeof EnvironmentSchema>;
//# sourceMappingURL=common.d.ts.map