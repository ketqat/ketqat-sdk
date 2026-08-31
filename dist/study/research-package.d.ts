import { z } from "zod";
import { type Citation, type Environment } from "../contracts/common.js";
import { type Contract } from "../intelligence/measurement.js";
import { type RevisionRef } from "./common.js";
import { type EvidenceEdge, type EvidenceNode } from "./evidence.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * The bundle a study leaves the building in (ketqat-sdk#259, ADR 0010, RFC 0008 §7).
 *
 * A research package is what somebody actually receives: a report, a methods
 * section, tables of numbers, figures, a CSV, and the command that regenerates
 * all of it. Every one of those is a surface a number can be quoted from, and
 * the failure this module exists to prevent is the one that carries no error
 * message -- a figure in a table nobody can walk back to a run, sitting beside
 * four that they can, and indistinguishable from them to the reader.
 *
 * So the package carries its own evidence graph. `nodes` and `edges` travel with
 * the report rather than being resolved out of a store the recipient does not
 * have, and every table row names a node by hash instead of restating its value.
 * A number in a table *is* a node. A number without one is not a weaker
 * citation; it is unrepresentable.
 *
 * `buildResearchPackage` refuses. It does not warn, it does not drop the
 * offending row, and it does not export with a caveat attached: it returns the
 * refusals and no package at all. A warning is something a pipeline logs and a
 * reader never sees, and the property this family exists to hold is that the
 * caveat and the number cannot become separated.
 *
 * `verifyResearchPackage` recomputes rather than reads, for the same reason
 * `verifyBundle` does. A hash check alone catches an edit; it does not catch an
 * edit followed by a re-hash, which is what fabricating a result actually looks
 * like. Identity in this graph *is* the content hash, so re-hashing an edited
 * node changes what that node is, and every row, edge and claim-map entry naming
 * the old hash stops resolving. That structural check is reported separately
 * from the cryptographic one, because "this file was edited" and "these numbers
 * do not join up" send a reader to different places.
 */
export declare const ResultRowSchema: z.ZodObject<{
    /** What the row is called in the table a reader sees. */
    label: z.ZodString;
    /**
     * The node the value is read from. There is deliberately no `value` field
     * beside it: a row that carried its own copy of the number could disagree with
     * the node, and the copy is what would end up in the slide.
     */
    node_hash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    label: string;
    node_hash: string;
}, {
    label: string;
    node_hash: string;
}>;
export type ResultRow = z.infer<typeof ResultRowSchema>;
export declare const FigureSchema: z.ZodObject<{
    label: z.ZodString;
    /** Inline SVG, so a figure cannot resolve to a different picture later. */
    svg: z.ZodString;
}, "strip", z.ZodTypeAny, {
    label: string;
    svg: string;
}, {
    label: string;
    svg: string;
}>;
export type Figure = z.infer<typeof FigureSchema>;
/**
 * What one claim in the package rests on, stated rather than inferred.
 *
 * The graph already holds the edges, so this map is redundant -- and that is the
 * point. It is the export's own assertion about which evidence it believes backs
 * which claim, written down where it can be checked against the graph instead of
 * recomputed from it by every consumer with its own idea of what "supports"
 * means. The two disagreeing is a finding, not a rounding error.
 */
export declare const ClaimEvidenceEntrySchema: z.ZodObject<{
    claim_node_hash: z.ZodString;
    /** At least one: an entry with an empty list is the absence this family refuses. */
    evidence_node_hashes: z.ZodArray<z.ZodString, "many">;
    /** The edges that carry the relation, so a reader can read the rationale rather than guess it. */
    edge_hashes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    claim_node_hash: string;
    evidence_node_hashes: string[];
    edge_hashes: string[];
}, {
    claim_node_hash: string;
    evidence_node_hashes: string[];
    edge_hashes: string[];
}>;
export type ClaimEvidenceEntry = z.infer<typeof ClaimEvidenceEntrySchema>;
export interface ResearchPackage {
    schema_version: string;
    hash_rules_id: "study-v1";
    package_kind: "KETQAT_RESEARCH_PACKAGE";
    study_ref: string;
    plan_ref: RevisionRef;
    report_markdown: string;
    methods: string;
    assumption_rows: ResultRow[];
    result_rows: ResultRow[];
    csv: string;
    figures: Figure[];
    references: Citation[];
    bundle_refs: string[];
    environment: Environment;
    reproduction_command: string;
    nodes: EvidenceNode[];
    edges: EvidenceEdge[];
    claim_evidence_map: ClaimEvidenceEntry[];
    limitations: string[];
    failed_checks: string[];
    is_demo: boolean;
    created_at?: string;
    reproducibility_hash: string;
}
export declare const ResearchPackageSchema: Contract<ResearchPackage>;
/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ResearchPackageInput {
    studyRef: string;
    planRef: RevisionRef;
    reportMarkdown: string;
    methods: string;
    assumptionRows?: ResultRow[];
    resultRows?: ResultRow[];
    csv?: string;
    figures?: Figure[];
    references?: Citation[];
    bundleRefs?: string[];
    environment: Environment;
    reproductionCommand: string;
    nodes: EvidenceNode[];
    edges: EvidenceEdge[];
    claimEvidenceMap: ClaimEvidenceEntry[];
    limitations: string[];
    /** Recorded, never omitted. Absent means no check failed, not that none was run. */
    failedChecks?: string[];
    isDemo: boolean;
    /** Recorded but excluded from the hash. Omit for a byte-stable artifact. */
    createdAt?: string;
}
/**
 * Assemble a package, or say why there is nothing to assemble.
 *
 * The order is `buildBundle`'s and the order is the contract. Inputs are parsed
 * first so that anything the schemas normalise -- an omitted citation author
 * list, an environment's empty package map -- is normalised *before* it is
 * hashed; hashing first and parsing afterwards would stamp a digest onto a
 * record the final parse then quietly changes, and the package would fail its
 * own verifier the moment it was written.
 *
 * Everything structural is then checked before the hash exists, because a
 * refusal is meant to be the ordinary outcome here rather than the error case. A
 * study with a number nobody wired up is not a broken program; it is a study
 * that is not finished, and the refusals say which part.
 */
export declare function buildResearchPackage(input: ResearchPackageInput): {
    ok: true;
    package: ResearchPackage;
} | {
    ok: false;
    refusals: StudyRefusal[];
};
export declare const StudyVerificationSchema: z.ZodObject<{
    valid: z.ZodBoolean;
    /** The file is unedited: its contents canonicalize to the hash it carries. */
    hash_matches: z.ZodBoolean;
    /** Every row and every claim-map entry resolves to something the package carries. */
    claims_resolve: z.ZodBoolean;
    /** Node and edge identities are their own contents, and every edge joins two nodes that are here. */
    graph_valid: z.ZodBoolean;
    expected_hash: z.ZodString;
    actual_hash: z.ZodString;
    /** Every discrepancy found, named. Empty when `valid`. */
    problems: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    valid: boolean;
    hash_matches: boolean;
    claims_resolve: boolean;
    graph_valid: boolean;
    expected_hash: string;
    actual_hash: string;
    problems: string[];
}, {
    valid: boolean;
    hash_matches: boolean;
    claims_resolve: boolean;
    graph_valid: boolean;
    expected_hash: string;
    actual_hash: string;
    problems: string[];
}>;
export type StudyVerification = z.infer<typeof StudyVerificationSchema>;
/**
 * Check a package the way a recipient has to: from the file alone.
 *
 * Three questions, answered separately because they fail separately.
 *
 * `hash_matches` says the file was not edited after it was written. On its own
 * that is worth little -- anyone who edits a package can recompute its hash --
 * which is precisely why the other two exist.
 *
 * `graph_valid` and `claims_resolve` say the package still joins up. This is
 * where the edit-then-re-hash fabrication is caught: changing a node's value and
 * re-stamping it changes the node's identity, and every table row, edge endpoint
 * and claim-map entry that named the old hash now names something the package
 * does not contain. Making the numbers lie therefore means rewriting the whole
 * graph consistently, and a graph rewritten consistently is a different study
 * that says different things -- visibly, to a reader.
 *
 * What this does not do is recompute the science. Nothing here re-derives an
 * estimate from a scenario or re-runs a decision rule; `verifyBundle` does that
 * for the intelligence tier, and a package that carries `bundle_refs` is
 * pointing at bundles that can be verified that way. A valid result here means
 * the package is internally consistent and unedited, and no more than that.
 */
export declare function verifyResearchPackage(candidate: unknown): StudyVerification;
//# sourceMappingURL=research-package.d.ts.map