import { z } from "zod";
/**
 * QEC code catalog (RFC 0006).
 *
 * This is the single source of truth for the catalog. The Python runner reads
 * the generated JSON rather than keeping its own copy, for the same reason the
 * JSON Schemas are generated: two hand-maintained copies drift, and a drifted
 * scientific catalog is worse than an absent one because it looks authoritative.
 *
 * Two things the catalog deliberately does not do:
 *
 * - It does not reproduce any external catalog's data or prose. Entries are
 *   structural facts stated in the project's own words; external catalogs are
 *   referenced as pointers.
 * - It does not emit recommendations. Suitability is *derived* from a hardware
 *   snapshot's capability fields so the claim can be checked, and capability
 *   matching never reports SIMULATED or DEMONSTRATED -- only a recorded run can
 *   raise the level that far.
 */
export declare const QecCodeFamilySchema: z.ZodEnum<{
    APPROXIMATE: "APPROXIMATE";
    BIVARIATE_BICYCLE: "BIVARIATE_BICYCLE";
    BOSONIC: "BOSONIC";
    CAT: "CAT";
    COLOR: "COLOR";
    CONCATENATED: "CONCATENATED";
    CSS: "CSS";
    ERASURE_TOLERANT: "ERASURE_TOLERANT";
    FLOQUET: "FLOQUET";
    GKP: "GKP";
    HYPERGRAPH_PRODUCT: "HYPERGRAPH_PRODUCT";
    QUANTUM_LDPC: "QUANTUM_LDPC";
    QUDIT: "QUDIT";
    STABILIZER: "STABILIZER";
    SUBSYSTEM: "SUBSYSTEM";
    SURFACE: "SURFACE";
    TOPOLOGICAL: "TOPOLOGICAL";
    TORIC: "TORIC";
}>;
export type QecCodeFamily = z.infer<typeof QecCodeFamilySchema>;
/**
 * How well a code and a device match. Ordered weakest to strongest, with the
 * negative and the unknown cases kept distinct: "we do not know" and "this does
 * not work" are different statements.
 */
export declare const SuitabilityLevelSchema: z.ZodEnum<{
    COMPATIBLE: "COMPATIBLE";
    DEMONSTRATED: "DEMONSTRATED";
    INCOMPATIBLE_UNDER_ASSUMPTIONS: "INCOMPATIBLE_UNDER_ASSUMPTIONS";
    REQUIRES_FAST_FEEDFORWARD: "REQUIRES_FAST_FEEDFORWARD";
    REQUIRES_LOSS_DETECTION: "REQUIRES_LOSS_DETECTION";
    REQUIRES_NONLOCAL_CONNECTIVITY: "REQUIRES_NONLOCAL_CONNECTIVITY";
    SIMULATED: "SIMULATED";
    THEORETICALLY_SUITABLE: "THEORETICALLY_SUITABLE";
    UNKNOWN: "UNKNOWN";
}>;
export type SuitabilityLevel = z.infer<typeof SuitabilityLevelSchema>;
export declare const QecCodeSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    families: z.ZodArray<z.ZodEnum<{
        APPROXIMATE: "APPROXIMATE";
        BIVARIATE_BICYCLE: "BIVARIATE_BICYCLE";
        BOSONIC: "BOSONIC";
        CAT: "CAT";
        COLOR: "COLOR";
        CONCATENATED: "CONCATENATED";
        CSS: "CSS";
        ERASURE_TOLERANT: "ERASURE_TOLERANT";
        FLOQUET: "FLOQUET";
        GKP: "GKP";
        HYPERGRAPH_PRODUCT: "HYPERGRAPH_PRODUCT";
        QUANTUM_LDPC: "QUANTUM_LDPC";
        QUDIT: "QUDIT";
        STABILIZER: "STABILIZER";
        SUBSYSTEM: "SUBSYSTEM";
        SURFACE: "SURFACE";
        TOPOLOGICAL: "TOPOLOGICAL";
        TORIC: "TORIC";
    }>>;
    description: z.ZodString;
    requires_mid_circuit_measurement: z.ZodDefault<z.ZodBoolean>;
    requires_feed_forward: z.ZodDefault<z.ZodBoolean>;
    requires_nonlocal_connectivity: z.ZodDefault<z.ZodBoolean>;
    requires_loss_detection: z.ZodDefault<z.ZodBoolean>;
    supported_distances: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    stim_generator: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    references: z.ZodDefault<z.ZodArray<z.ZodString>>;
    notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type QecCode = z.infer<typeof QecCodeSchema>;
export declare const QEC_CODE_CATALOG: QecCode[];
export declare function getQecCode(slug: string): QecCode | undefined;
export declare function qecCodesInFamily(family: string): QecCode[];
export interface SuitabilityAssessment {
    code: string;
    level: SuitabilityLevel;
    blockers: string[];
    evidence: string;
}
/** Capability fields a suitability assessment reads from a hardware snapshot. */
export interface SuitabilityCapabilities {
    mid_circuit_measurement?: boolean;
    feed_forward?: boolean;
    all_to_all_connectivity?: boolean;
    dynamic_connectivity?: boolean;
    loss_detection?: boolean;
    erasure_conversion?: boolean;
}
/**
 * Derive a code/hardware suitability level from a snapshot's capabilities.
 *
 * Derived rather than asserted: every blocking requirement is listed, so the
 * claim can be checked against the snapshot it came from. The result never
 * exceeds `THEORETICALLY_SUITABLE`, because `SIMULATED` and `DEMONSTRATED` are
 * claims about experiments that were actually run.
 */
export declare function assessQecSuitability(code: QecCode, capabilities: SuitabilityCapabilities): SuitabilityAssessment;
//# sourceMappingURL=qec-code.d.ts.map