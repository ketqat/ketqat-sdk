import { z } from "zod";
/**
 * A typed edge between artifacts (RFC 0003).
 *
 * Relations record who asserted them and what supports them, because an
 * unevidenced edge is an assertion rather than a fact and must be displayed as
 * one. `compatible_with` matters most here: it is a claim that two artifacts'
 * assumptions line up, and it must never be inferred from surface similarity.
 */
export declare const RelationEvidenceSchema: z.ZodObject<{
    /** Free-text justification. Required so an edge cannot be added with no stated basis. */
    summary: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    /** Slug of a run, benchmark, or verification record supporting the claim. */
    supporting_record_slug: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    summary: string;
    url?: string | undefined;
    supporting_record_slug?: string | undefined;
}, {
    summary: string;
    url?: string | undefined;
    supporting_record_slug?: string | undefined;
}>;
export type RelationEvidence = z.infer<typeof RelationEvidenceSchema>;
export declare const ArtifactRelationSchema: z.ZodObject<{
    schema_version: z.ZodString;
    relation: z.ZodEnum<["derived_from", "forks", "implements", "supersedes", "benchmarked_by", "compatible_with", "requires", "cites", "decodes", "targets", "contradicts"]>;
    from_artifact_slug: z.ZodString;
    to_artifact_slug: z.ZodString;
    /** Version of the target this edge refers to; absent means "any version". */
    to_artifact_version: z.ZodOptional<z.ZodString>;
    /** Who asserted the edge. Not the same as who owns either artifact. */
    asserted_by: z.ZodString;
    asserted_at: z.ZodOptional<z.ZodString>;
    evidence: z.ZodOptional<z.ZodObject<{
        /** Free-text justification. Required so an edge cannot be added with no stated basis. */
        summary: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        /** Slug of a run, benchmark, or verification record supporting the claim. */
        supporting_record_slug: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        summary: string;
        url?: string | undefined;
        supporting_record_slug?: string | undefined;
    }, {
        summary: string;
        url?: string | undefined;
        supporting_record_slug?: string | undefined;
    }>>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    relation: "benchmarked_by" | "cites" | "compatible_with" | "contradicts" | "decodes" | "derived_from" | "forks" | "implements" | "requires" | "supersedes" | "targets";
    from_artifact_slug: string;
    to_artifact_slug: string;
    to_artifact_version?: string | undefined;
    asserted_by: string;
    asserted_at?: string | undefined;
    evidence?: {
        summary: string;
        url?: string | undefined;
        supporting_record_slug?: string | undefined;
    } | undefined;
    notes?: string | undefined;
}, {
    schema_version: string;
    relation: "benchmarked_by" | "cites" | "compatible_with" | "contradicts" | "decodes" | "derived_from" | "forks" | "implements" | "requires" | "supersedes" | "targets";
    from_artifact_slug: string;
    to_artifact_slug: string;
    to_artifact_version?: string | undefined;
    asserted_by: string;
    asserted_at?: string | undefined;
    evidence?: {
        summary: string;
        url?: string | undefined;
        supporting_record_slug?: string | undefined;
    } | undefined;
    notes?: string | undefined;
}>;
export type ArtifactRelation = z.infer<typeof ArtifactRelationSchema>;
/**
 * True when the edge carries evidence and may be displayed as a supported
 * claim. Everything else is displayed as an assertion attributed to
 * `asserted_by`.
 */
export declare function isEvidencedRelation(relation: ArtifactRelation): boolean;
//# sourceMappingURL=artifact-relation.d.ts.map