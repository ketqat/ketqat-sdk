import { z } from "zod";
import { ArtifactRelationTypeSchema, IsoDateTimeSchema, UrlSchema, } from "./common.js";
/**
 * A typed edge between artifacts (RFC 0003).
 *
 * Relations record who asserted them and what supports them, because an
 * unevidenced edge is an assertion rather than a fact and must be displayed as
 * one. `compatible_with` matters most here: it is a claim that two artifacts'
 * assumptions line up, and it must never be inferred from surface similarity.
 */
export const RelationEvidenceSchema = z.object({
    /** Free-text justification. Required so an edge cannot be added with no stated basis. */
    summary: z.string().min(1),
    url: UrlSchema.optional(),
    /** Slug of a run, benchmark, or verification record supporting the claim. */
    supporting_record_slug: z.string().min(1).optional(),
});
export const ArtifactRelationSchema = z.object({
    schema_version: z.string().min(1),
    relation: ArtifactRelationTypeSchema,
    from_artifact_slug: z.string().min(1),
    to_artifact_slug: z.string().min(1),
    /** Version of the target this edge refers to; absent means "any version". */
    to_artifact_version: z.string().min(1).optional(),
    /** Who asserted the edge. Not the same as who owns either artifact. */
    asserted_by: z.string().min(1),
    asserted_at: IsoDateTimeSchema.optional(),
    evidence: RelationEvidenceSchema.optional(),
    notes: z.string().min(1).optional(),
});
/**
 * True when the edge carries evidence and may be displayed as a supported
 * claim. Everything else is displayed as an assertion attributed to
 * `asserted_by`.
 */
export function isEvidencedRelation(relation) {
    return relation.evidence !== undefined;
}
//# sourceMappingURL=artifact-relation.js.map