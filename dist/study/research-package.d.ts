import { z } from "zod";
import { type Citation } from "../contracts/common.js";
import type { Contract } from "../intelligence/measurement.js";
import { type BundleFieldRef, type BundleRef, type BundleResolver } from "./bundles.js";
import { type RevisionRef, type StudyEnvironment } from "./common.js";
import { type EvidenceEdge, type EvidenceNode } from "./evidence.js";
import { type StudyFigure } from "./figures.js";
import { type StudyFinding } from "./findings.js";
import { type CheckLedgerEntry, type CheckLedgerSummary } from "./ledger.js";
import { type ReproductionRecipe } from "./recipe.js";
import { type StudyReportDocument } from "./report.js";
import { type ReproductionRecord, type ReviewRecord } from "./review.js";
import { type StudyTable } from "./tables.js";
import { StudyVerificationPerformedSchema, StudyVerificationStatusSchema, type StudyVerificationLevels } from "./verification.js";
/**
 * The bundle a study leaves the building in (ketqat-sdk#259, ADR 0010, RFC 0008 §7).
 *
 * A research package is what somebody actually receives, and every surface it
 * carries is a surface a number can be quoted from. The failure this module
 * exists to prevent carries no error message: a figure in a table nobody can
 * walk back to a run, sitting beside four that they can, indistinguishable from
 * them to the reader.
 *
 * So the package carries its own evidence graph -- `nodes` and `edges` travel
 * with the report rather than being resolved out of a store the recipient does
 * not have -- and **every decision-bearing number in it is a reference**. That
 * rule is now enforced on every surface rather than on one:
 *
 * - the report is a structured document whose numbers are `QUANTITY_REF`
 *   segments, and whose prose is refused if it carries a number standing on its
 *   own (`report.ts`);
 * - a table's value cells name nodes, and the CSV a reader forwards is
 *   *generated* from those cells and hashed, so the two cannot drift
 *   (`tables.ts`);
 * - a figure is a specification whose coordinates name nodes, and supplied SVG
 *   is refused from the trusted surface entirely (`figures.ts`);
 * - the reproduction command is a structure rather than a shell string
 *   (`recipe.ts`);
 * - every check that was meant to run is recorded with its status, including
 *   the ones that did not (`ledger.ts`);
 * - and every bundle the package cites is resolved, hashed and *recomputed*,
 *   with each claim naming the field it reads (`bundles.ts`).
 *
 * `buildResearchPackage` refuses. It does not warn, it does not drop the
 * offending row, and it does not export with a caveat attached: it returns the
 * findings and no package at all. A warning is something a pipeline logs and a
 * reader never sees, and the property this family exists to hold is that the
 * caveat and the number cannot become separated.
 *
 * `verifyResearchPackage` recomputes rather than reads. A hash check alone
 * catches an edit; it does not catch an edit followed by a re-hash, which is
 * what fabricating a result actually looks like. Identity in this graph *is*
 * the content hash, so re-hashing an edited node changes what that node is, and
 * every table cell, edge and report segment naming the old hash stops
 * resolving. Those checks are reported at separate levels from the
 * cryptographic one, because "this file was edited" and "these numbers do not
 * join up" send a reader to different places.
 */
/**
 * Whether the recipient is expected to have anything besides this file.
 *
 * The distinction is load-bearing rather than descriptive: an `OFFLINE_EXPORT`
 * must carry every bundle it references as a content-addressed blob, and
 * `resolveBundles` refuses one that does not. A package that calls itself
 * self-contained and cites a document nobody has is self-contained exactly
 * until somebody checks it.
 */
export declare const PackageDistributionSchema: z.ZodEnum<["ONLINE", "OFFLINE_EXPORT"]>;
export type PackageDistribution = z.infer<typeof PackageDistributionSchema>;
/**
 * What one claim in the package rests on, stated rather than inferred.
 *
 * The graph already holds the edges, so this map is redundant -- and that is the
 * point. It is the export's own assertion about which evidence it believes backs
 * which claim, written down where it can be checked against the graph instead of
 * recomputed from it by every consumer with its own idea of what "supports"
 * means. The two disagreeing is a finding, not a rounding error.
 */
export interface ClaimEvidenceEntry {
    claim_node_hash: string;
    evidence_node_hashes: string[];
    edge_hashes: string[];
    bundle_fields: BundleFieldRef[];
}
export declare const ClaimEvidenceEntrySchema: Contract<ClaimEvidenceEntry>;
export interface ResearchPackage {
    schema_version: string;
    hash_rules_id: "study-v1";
    package_kind: "KETQAT_RESEARCH_PACKAGE";
    distribution: PackageDistribution;
    study_ref: string;
    plan_ref: RevisionRef;
    report: StudyReportDocument;
    tables: StudyTable[];
    figures: StudyFigure[];
    references: Citation[];
    bundle_refs: BundleRef[];
    environment: StudyEnvironment;
    recipe: ReproductionRecipe;
    nodes: EvidenceNode[];
    edges: EvidenceEdge[];
    claim_evidence_map: ClaimEvidenceEntry[];
    reviews: ReviewRecord[];
    reproductions: ReproductionRecord[];
    check_ledger: CheckLedgerEntry[];
    limitations: string[];
    is_demo: boolean;
    created_at?: string;
    reproducibility_hash: string;
}
export declare const ResearchPackageSchema: Contract<ResearchPackage>;
/** A table as an author writes one: the CSV artifact is generated, never supplied. */
export type StudyTableInput = Omit<StudyTable, "csv_artifact">;
/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ResearchPackageInput {
    studyRef: string;
    planRef: RevisionRef;
    report: StudyReportDocument;
    tables?: StudyTableInput[];
    figures?: StudyFigure[];
    references?: Citation[];
    bundleRefs?: BundleRef[];
    environment: StudyEnvironment;
    recipe: ReproductionRecipe;
    nodes: EvidenceNode[];
    edges: EvidenceEdge[];
    claimEvidenceMap: ClaimEvidenceEntry[];
    reviews?: ReviewRecord[];
    reproductions?: ReproductionRecord[];
    /** Recorded, never omitted. An empty ledger means no check was recorded, not that none failed. */
    checkLedger?: CheckLedgerEntry[];
    limitations: string[];
    isDemo: boolean;
    distribution?: PackageDistribution;
    /**
     * `RECEIPT_ONLY`: the moment the server observed this package, not part of
     * what it reports. Outside `semanticHash`, inside `recordHash` -- which is the
     * digest a package's `reproducibility_hash` is -- so omit it for a
     * byte-stable artifact.
     */
    createdAt?: string;
}
/**
 * Assemble a package, or say why there is nothing to assemble.
 *
 * The order is the contract. Inputs are parsed first, so a record refused by a
 * schema is refused before anything is hashed and the record that gets hashed
 * is the record that gets written. Then the CSV artifacts are *generated* from
 * the tables, which is the point at which "the table and the file are one
 * statement" becomes true rather than asserted. Then the package is hashed, and
 * only then are the structural checks run -- because a refusal is the ordinary
 * outcome here rather than the error case. A study with a number nobody wired
 * up is not a broken program; it is a study that is not finished, and the
 * findings say which part.
 */
export declare function buildResearchPackage(input: ResearchPackageInput): {
    ok: true;
    package: ResearchPackage;
} | {
    ok: false;
    findings: StudyFinding[];
};
export declare const StudyVerificationSchema: z.ZodObject<{
    /**
     * Twelve independent answers.
     *
     * Nested rather than flattened into the result, so that a caller reading
     * `verification.levels` has all of them or none: a flat object invites
     * destructuring one field, and the field that would be destructured is
     * whichever reads most like "is it fine".
     */
    levels: z.ZodObject<{
        schema_valid: z.ZodBoolean;
        canonicalizable: z.ZodBoolean;
        hash_matches: z.ZodBoolean;
        record_integrity_valid: z.ZodBoolean;
        graph_structurally_valid: z.ZodBoolean;
        provenance_closed: z.ZodBoolean;
        claims_resolve: z.ZodBoolean;
        bundles_resolve: z.ZodBoolean;
        science_recomputed: z.ZodBoolean;
        independent_reproduction_present: z.ZodBoolean;
        review_present: z.ZodBoolean;
        attestation_level: z.ZodEnum<["hash_only"]>;
    }, "strict", z.ZodTypeAny, {
        schema_valid: boolean;
        canonicalizable: boolean;
        hash_matches: boolean;
        record_integrity_valid: boolean;
        graph_structurally_valid: boolean;
        provenance_closed: boolean;
        claims_resolve: boolean;
        bundles_resolve: boolean;
        science_recomputed: boolean;
        independent_reproduction_present: boolean;
        review_present: boolean;
        attestation_level: "hash_only";
    }, {
        schema_valid: boolean;
        canonicalizable: boolean;
        hash_matches: boolean;
        record_integrity_valid: boolean;
        graph_structurally_valid: boolean;
        provenance_closed: boolean;
        claims_resolve: boolean;
        bundles_resolve: boolean;
        science_recomputed: boolean;
        independent_reproduction_present: boolean;
        review_present: boolean;
        attestation_level: "hash_only";
    }>;
    /** Derived from the levels by `deriveStudyVerificationStatus`, never asserted. */
    status: z.ZodEnum<["REFUSED", "STRUCTURE_UNVERIFIED", "STRUCTURE_VERIFIED", "SCIENCE_RECOMPUTED", "INDEPENDENTLY_REPRODUCED"]>;
    /** What this implementation did. TypeScript recomputes the science; Python does not. */
    verification_performed: z.ZodEnum<["INTEGRITY_AND_STRUCTURE", "INTEGRITY_STRUCTURE_AND_SCIENCE"]>;
    expected_hash: z.ZodString;
    actual_hash: z.ZodString;
    /** Every defect, with a code and a JSON path. The codes and paths are the cross-language contract. */
    findings: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        path: z.ZodString;
        message: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        code: string;
        path: string;
        message: string;
    }, {
        code: string;
        path: string;
        message: string;
    }>, "many">;
    /** What a result at this status does not establish, in sentences a surface can render. */
    not_established: z.ZodArray<z.ZodString, "many">;
    /** What the ledger adds up to, without collapsing what it says. */
    check_ledger: z.ZodObject<{
        total: z.ZodNumber;
        passed: z.ZodNumber;
        failed: z.ZodNumber;
        not_run: z.ZodNumber;
        inconclusive: z.ZodNumber;
        required_checks_passed: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        total: number;
        passed: number;
        failed: number;
        not_run: number;
        inconclusive: number;
        required_checks_passed: boolean;
    }, {
        total: number;
        passed: number;
        failed: number;
        not_run: number;
        inconclusive: number;
        required_checks_passed: boolean;
    }>;
    /** The findings rendered one to a line, for a person. Never a contract. */
    problems: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    levels: {
        schema_valid: boolean;
        canonicalizable: boolean;
        hash_matches: boolean;
        record_integrity_valid: boolean;
        graph_structurally_valid: boolean;
        provenance_closed: boolean;
        claims_resolve: boolean;
        bundles_resolve: boolean;
        science_recomputed: boolean;
        independent_reproduction_present: boolean;
        review_present: boolean;
        attestation_level: "hash_only";
    };
    status: "INDEPENDENTLY_REPRODUCED" | "REFUSED" | "SCIENCE_RECOMPUTED" | "STRUCTURE_UNVERIFIED" | "STRUCTURE_VERIFIED";
    verification_performed: "INTEGRITY_AND_STRUCTURE" | "INTEGRITY_STRUCTURE_AND_SCIENCE";
    expected_hash: string;
    actual_hash: string;
    findings: {
        code: string;
        path: string;
        message: string;
    }[];
    not_established: string[];
    check_ledger: {
        total: number;
        passed: number;
        failed: number;
        not_run: number;
        inconclusive: number;
        required_checks_passed: boolean;
    };
    problems: string[];
}, {
    levels: {
        schema_valid: boolean;
        canonicalizable: boolean;
        hash_matches: boolean;
        record_integrity_valid: boolean;
        graph_structurally_valid: boolean;
        provenance_closed: boolean;
        claims_resolve: boolean;
        bundles_resolve: boolean;
        science_recomputed: boolean;
        independent_reproduction_present: boolean;
        review_present: boolean;
        attestation_level: "hash_only";
    };
    status: "INDEPENDENTLY_REPRODUCED" | "REFUSED" | "SCIENCE_RECOMPUTED" | "STRUCTURE_UNVERIFIED" | "STRUCTURE_VERIFIED";
    verification_performed: "INTEGRITY_AND_STRUCTURE" | "INTEGRITY_STRUCTURE_AND_SCIENCE";
    expected_hash: string;
    actual_hash: string;
    findings: {
        code: string;
        path: string;
        message: string;
    }[];
    not_established: string[];
    check_ledger: {
        total: number;
        passed: number;
        failed: number;
        not_run: number;
        inconclusive: number;
        required_checks_passed: boolean;
    };
    problems: string[];
}>;
export interface StudyVerification {
    levels: StudyVerificationLevels;
    status: z.infer<typeof StudyVerificationStatusSchema>;
    verification_performed: z.infer<typeof StudyVerificationPerformedSchema>;
    expected_hash: string;
    actual_hash: string;
    findings: StudyFinding[];
    not_established: string[];
    check_ledger: CheckLedgerSummary;
    problems: string[];
}
export interface StudyVerificationOptions {
    /**
     * Bundles the caller is checking against, by `reproducibility_hash`.
     *
     * A map rather than a fetch. A verifier that went to the network would give
     * two answers for one file depending on what the network said today, and the
     * recipient could not tell which they had. An offline export needs none of
     * this: it carries its bundles.
     */
    readonly bundles?: BundleResolver;
    /**
     * Checks this surface requires the package to have recorded.
     *
     * Supplied by the caller because which checks a package must carry is a
     * property of where it is being published rather than of this module: a
     * public export and an internal draft require different things of one study.
     */
    readonly requiredChecks?: readonly string[];
}
/**
 * Check a package the way a recipient has to: from the file alone.
 *
 * Every level is answered separately, because they fail separately and because
 * a single boolean is quoted at its strongest reading. `verification.ts` states
 * what each one does and does not establish; what this function adds is the
 * order, and the order is deliberate.
 *
 * The ceilings come first. A document past them is refused before anything
 * walks it, which is the only point at which a ceiling is worth having -- a
 * bound checked after the recursive walk it was meant to bound has already
 * happened.
 *
 * Then the schema, then the digest, then the records, then the graph, then the
 * report and tables and figures, then the bundles. Each stage reads the package
 * *as written* rather than a parsed copy: no schema in this family carries a
 * `.default()`, so the two values are the same one, and this order is what keeps
 * them the same if a default is ever added back. A verifier that hashed a
 * materialised container would be answering about a record the file does not
 * contain, and disagreeing with the Python verifier, which reads the same bytes
 * and fills in nothing.
 *
 * This implementation **does** recompute the science, which is what
 * `verification_performed` records: every bundle the package cites is rebuilt
 * from its own inputs by `verifyBundle`. The Python verifier does not and says
 * so in the same field. What neither does is weigh the evidence: an edge
 * asserting that a result supports a claim is the study's assertion, checked for
 * being present, joined up and attributed, never for being right.
 */
export declare function verifyResearchPackage(candidate: unknown, options?: StudyVerificationOptions): StudyVerification;
//# sourceMappingURL=research-package.d.ts.map