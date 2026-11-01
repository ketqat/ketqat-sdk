import { z } from "zod";
export declare const DomainSchema: z.ZodEnum<{
    ALGORITHM: "ALGORITHM";
    PROTOCOL: "PROTOCOL";
    QEC: "QEC";
}>;
export type Domain = z.infer<typeof DomainSchema>;
export declare const ArtifactKindSchema: z.ZodEnum<{
    BENCHMARK_SUITE: "BENCHMARK_SUITE";
    CLASSICAL_REFERENCE: "CLASSICAL_REFERENCE";
    NOISE_MODEL: "NOISE_MODEL";
    PROBLEM_INSTANCE: "PROBLEM_INSTANCE";
    QEC_CODE: "QEC_CODE";
    QEC_DECODER: "QEC_DECODER";
    QUANTUM_ALGORITHM: "QUANTUM_ALGORITHM";
    RESOURCE_ANALYSIS_TOOL: "RESOURCE_ANALYSIS_TOOL";
    SIMULATION_TOOL: "SIMULATION_TOOL";
    SYNDROME_DATASET: "SYNDROME_DATASET";
}>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export declare const VerificationStatusSchema: z.ZodEnum<{
    REPRODUCED: "REPRODUCED";
    UNVERIFIED: "UNVERIFIED";
    VALIDATED_SCHEMA: "VALIDATED_SCHEMA";
}>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export declare const VisibilitySchema: z.ZodEnum<{
    PRIVATE: "PRIVATE";
    PUBLIC: "PUBLIC";
}>;
export type Visibility = z.infer<typeof VisibilitySchema>;
/**
 * Platform 2.0 artifact taxonomy (RFC 0003).
 *
 * This is additive: `domain` and `kind` keep their existing meaning, and
 * `artifact_type` is recorded alongside them rather than replacing them, so
 * records written before this taxonomy existed stay valid and keep their hashes.
 */
export declare const ArtifactTypeSchema: z.ZodEnum<{
    ALGORITHM: "ALGORITHM";
    BENCHMARK_SUITE: "BENCHMARK_SUITE";
    CIRCUIT: "CIRCUIT";
    COMPILER_OR_TRANSPILER: "COMPILER_OR_TRANSPILER";
    DATASET: "DATASET";
    DECODER: "DECODER";
    EXPERIMENT_TEMPLATE: "EXPERIMENT_TEMPLATE";
    HARDWARE_PROFILE: "HARDWARE_PROFILE";
    MITIGATION_PIPELINE: "MITIGATION_PIPELINE";
    NOISE_MODEL: "NOISE_MODEL";
    QEC_CODE: "QEC_CODE";
    RESOURCE_MODEL: "RESOURCE_MODEL";
}>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
/**
 * How a result was produced (RFC 0003).
 *
 * Kept separate from the trust level: a `HARDWARE` result is not more
 * trustworthy than a `SIMULATION` one, it is a different kind of measurement.
 * Comparison code refuses to rank across classes unless the comparison is
 * explicitly scoped and labelled.
 */
export declare const ExecutionClassSchema: z.ZodEnum<{
    ANALYTICAL: "ANALYTICAL";
    DEMO: "DEMO";
    HARDWARE: "HARDWARE";
    SIMULATION: "SIMULATION";
}>;
export type ExecutionClass = z.infer<typeof ExecutionClassSchema>;
/**
 * Evidence level for a claim that two circuits are equivalent (RFC 0002).
 *
 * `INCONCLUSIVE` and `FAILED` are deliberately distinct. A rewrite system that
 * does not reduce a difference to the identity has failed to prove equality; it
 * has not proved inequality. Only an explicit counterexample justifies `FAILED`.
 */
export declare const EquivalenceLevelSchema: z.ZodEnum<{
    FAILED: "FAILED";
    INCONCLUSIVE: "INCONCLUSIVE";
    NOT_CHECKED: "NOT_CHECKED";
    NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
    PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
    SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
}>;
export type EquivalenceLevel = z.infer<typeof EquivalenceLevelSchema>;
/** Ordered verification ladder (RFC 0004). Each level implies the ones before it. */
export declare const TrustLevelSchema: z.ZodEnum<{
    ENVIRONMENT_RECORDED: "ENVIRONMENT_RECORDED";
    HASH_VERIFIED: "HASH_VERIFIED";
    INDEPENDENTLY_REPRODUCED: "INDEPENDENTLY_REPRODUCED";
    REPRODUCED: "REPRODUCED";
    REVIEWED: "REVIEWED";
    SCHEMA_VALIDATED: "SCHEMA_VALIDATED";
    SOURCE_VERIFIED: "SOURCE_VERIFIED";
    UNVERIFIED: "UNVERIFIED";
}>;
export type TrustLevel = z.infer<typeof TrustLevelSchema>;
export declare const TRUST_LEVEL_ORDER: readonly TrustLevel[];
/**
 * `REVIEWED` means an identified reviewer examined the method and recorded
 * findings. It does not mean journal peer review, and must not be presented as
 * such. See RFC 0004.
 */
export declare function compareTrustLevels(left: TrustLevel, right: TrustLevel): number;
export declare const LossSeveritySchema: z.ZodEnum<{
    cosmetic: "cosmetic";
    semantic: "semantic";
    structural: "structural";
}>;
export type LossSeverity = z.infer<typeof LossSeveritySchema>;
/**
 * One feature a conversion could not carry across (RFC 0002).
 *
 * A conversion that cannot represent part of its input must reject, or record
 * entries like this. Converting silently is prohibited.
 */
export declare const LossReportEntrySchema: z.ZodObject<{
    feature: z.ZodString;
    severity: z.ZodEnum<{
        cosmetic: "cosmetic";
        semantic: "semantic";
        structural: "structural";
    }>;
    action: z.ZodEnum<{
        approximated: "approximated";
        dropped: "dropped";
        rejected: "rejected";
    }>;
    detail: z.ZodString;
    location: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type LossReportEntry = z.infer<typeof LossReportEntrySchema>;
export declare const ArtifactRelationTypeSchema: z.ZodEnum<{
    benchmarked_by: "benchmarked_by";
    cites: "cites";
    compatible_with: "compatible_with";
    contradicts: "contradicts";
    decodes: "decodes";
    derived_from: "derived_from";
    forks: "forks";
    implements: "implements";
    requires: "requires";
    supersedes: "supersedes";
    targets: "targets";
}>;
export type ArtifactRelationType = z.infer<typeof ArtifactRelationTypeSchema>;
export declare const UrlSchema: z.ZodString;
export declare const IsoDateTimeSchema: z.ZodString;
export declare const CitationSchema: z.ZodObject<{
    title: z.ZodString;
    authors: z.ZodDefault<z.ZodArray<z.ZodString>>;
    year: z.ZodOptional<z.ZodNumber>;
    doi: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    bibtex: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Citation = z.infer<typeof CitationSchema>;
export declare const MetricDefinitionSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    unit: z.ZodOptional<z.ZodString>;
    lower_is_better: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;
export declare const EnvironmentSchema: z.ZodObject<{
    operating_system: z.ZodOptional<z.ZodString>;
    architecture: z.ZodOptional<z.ZodString>;
    python_version: z.ZodOptional<z.ZodString>;
    node_version: z.ZodOptional<z.ZodString>;
    packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type Environment = z.infer<typeof EnvironmentSchema>;
//# sourceMappingURL=common.d.ts.map