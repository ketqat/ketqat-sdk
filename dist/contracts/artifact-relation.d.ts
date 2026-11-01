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
    summary: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    supporting_record_slug: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RelationEvidence = z.infer<typeof RelationEvidenceSchema>;
export declare const ArtifactRelationSchema: z.ZodObject<{
    schema_version: z.ZodString;
    relation: z.ZodEnum<{
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
    from_artifact_slug: z.ZodString;
    to_artifact_slug: z.ZodString;
    to_artifact_version: z.ZodOptional<z.ZodString>;
    asserted_by: z.ZodString;
    asserted_at: z.ZodOptional<z.ZodString>;
    evidence: z.ZodOptional<z.ZodObject<{
        summary: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
        supporting_record_slug: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ArtifactRelation = z.infer<typeof ArtifactRelationSchema>;
/**
 * True when the edge carries evidence and may be displayed as a supported
 * claim. Everything else is displayed as an assertion attributed to
 * `asserted_by`.
 */
export declare function isEvidencedRelation(relation: ArtifactRelation): boolean;
//# sourceMappingURL=artifact-relation.d.ts.map