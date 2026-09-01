import { z } from "zod";
import { IsoDateTimeSchema } from "../contracts/common.js";
import { BundleFieldRefSchema, BundleRefSchema, bundleFieldFindings, isBundleDerivedRecordKind, resolveBundles, } from "./bundles.js";
import { ContentHashSchema, RevisionRefSchema, STUDY_SCHEMA_VERSION, StudyCitationSchema, StudyEnvironmentSchema, } from "./common.js";
import { EvidenceEdgeSchema, EvidenceNodeSchema, resolveClaimEvidence, verifyClaimValues, verifyEvidenceGraph, } from "./evidence.js";
import { StudyFigureSchema, figureFindings, figureListFindings, indexTableCells, } from "./figures.js";
import { finding, findingFromRefusal, renderStudyFinding, studyPath, } from "./findings.js";
import { studySelfHash } from "./hash.js";
import { StudyIdSchema } from "./identity.js";
import { CheckLedgerEntrySchema, absentRequiredChecks, checkLedgerFindings, checkLedgerSummary, } from "./ledger.js";
import { packageLimitFindings } from "./package-limits.js";
import { ReproductionRecipeSchema, recipeFindings, } from "./recipe.js";
import { studyNotHashableRefusal, studyRulesIdRefusal } from "./refusals.js";
import { StudyReportDocumentSchema, reportFindings } from "./report.js";
import { ReproductionRecordSchema, ReviewRecordSchema, } from "./review.js";
import { STUDY_HASH_RULES_ID } from "./rules.js";
import { StudyTableSchema, tableCsvArtifact, tableCsvArtifactFindings, tableFindings, tableListFindings, } from "./tables.js";
import { StudyVerificationLevelsSchema, StudyVerificationPerformedSchema, StudyVerificationStatusSchema, deriveStudyVerificationStatus, notEstablished, refusedStudyVerificationLevels, } from "./verification.js";
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
export const PackageDistributionSchema = z.enum(["ONLINE", "OFFLINE_EXPORT"]);
export const ClaimEvidenceEntrySchema = z
    .object({
    claim_node_hash: ContentHashSchema,
    /** At least one: an entry with an empty list is the absence this family refuses. */
    evidence_node_hashes: z.array(ContentHashSchema).min(1),
    /** The edges that carry the relation, so a reader can read the rationale rather than guess it. */
    edge_hashes: z.array(ContentHashSchema),
    /**
     * Which field of which bundle this claim reads.
     *
     * Empty is correct for a claim that rests on a measurement rather than on a
     * model output. It is refused for a claim whose evidence points into a
     * resource intelligence bundle, because a bundle digest on its own cites a
     * document of several hundred fields and says nothing about which number
     * the sentence came from -- which is what `bundle_refs: string[]` did for
     * every claim in the previous shape of this record.
     */
    bundle_fields: z.array(BundleFieldRefSchema).max(64),
})
    .strict();
export const ResearchPackageSchema = z.object({
    schema_version: z.string().min(1),
    /** Required, never inferred. A package that does not name its rules is refused, not defaulted. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The discriminant, in the `bundle_kind` idiom: one string that says what this file is. */
    package_kind: z.literal("KETQAT_RESEARCH_PACKAGE"),
    distribution: PackageDistributionSchema,
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /** The confirmed plan revision this package answers. A report for a plan nobody approved has no provenance. */
    plan_ref: RevisionRefSchema,
    /**
     * The report as structure.
     *
     * Not `report_markdown`. Hashing prose establishes that the prose was not
     * edited and nothing at all about the numbers in it, and the numbers in it are
     * what a reader quotes.
     */
    report: StudyReportDocumentSchema,
    /** Tables, each generating its own CSV. Numbers in cells are nodes. */
    tables: z.array(StudyTableSchema),
    /** Figures as specifications. Supplied SVG never reaches a trusted surface. */
    figures: z.array(StudyFigureSchema),
    references: z.array(StudyCitationSchema),
    /** The bundles behind this package: resolved, hashed and recomputed at verification. */
    bundle_refs: z.array(BundleRefSchema),
    /**
     * Study-local, and array-shaped where the shared `EnvironmentSchema` is a map.
     * A map's keys arrive at run time and are declared by nobody, so the
     * projection would have to read one wholesale or refuse it. A list of
     * `{name, value}` pairs is neither.
     */
    environment: StudyEnvironmentSchema,
    /** How to run this again, as parts. The display command is generated from them. */
    recipe: ReproductionRecipeSchema,
    /**
     * The graph travels with the report. A package whose evidence lived in a
     * database the recipient cannot reach would be a report with footnotes nobody
     * can follow, which is the state this family was built to end.
     */
    nodes: z.array(EvidenceNodeSchema),
    edges: z.array(EvidenceEdgeSchema),
    claim_evidence_map: z.array(ClaimEvidenceEntrySchema),
    /** Verdicts people recorded on nodes this package carries. */
    reviews: z.array(ReviewRecordSchema),
    /** Second runs, and whether they matched. The only evidence a file can carry about reproduction. */
    reproductions: z.array(ReproductionRecordSchema),
    /**
     * Every check that was meant to run, with its status.
     *
     * Not `failed_checks: string[]`, which was empty both when everything passed
     * and when nothing was attempted, and read better in the second case.
     */
    check_ledger: z.array(CheckLedgerEntrySchema),
    /** What this package does not establish. Required and non-empty: every study has some. */
    limitations: z.array(z.string().min(1)).min(1),
    is_demo: z.boolean(),
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it says. */
    created_at: IsoDateTimeSchema.optional(),
    /** SHA-256 over the canonical form of this package under `study-v1`. Excluded from itself. */
    reproducibility_hash: ContentHashSchema,
}).strict();
function nodesByHash(nodes) {
    const index = new Map();
    for (const node of nodes) {
        if (!index.has(node.content_hash))
            index.set(node.content_hash, node);
    }
    return index;
}
/**
 * Every artifact digest the package itself carries.
 *
 * What a recipe's `INLINE_IN_BUNDLE` reference has to resolve against: the CSVs
 * the tables generate, the SVGs the figures name, and the bundles travelling
 * inside an offline export. A reference to anything else is a file this reader
 * does not have, which the recipe may legitimately record and which
 * `recipeFindings` will not treat as carried.
 */
function carriedArtifactHashes(body, bundleRefs) {
    const hashes = new Set();
    for (const table of body.tables)
        hashes.add(table.csv_artifact.content_hash);
    for (const figure of body.figures) {
        if (figure.svg_artifact !== null)
            hashes.add(figure.svg_artifact.content_hash);
    }
    for (const ref of bundleRefs) {
        if (ref.embedded !== null)
            hashes.add(ref.embedded.content_hash);
    }
    return hashes;
}
/**
 * Whether one edge asserts that this evidence bears on this claim.
 *
 * `supports` is read directionally -- evidence points at the claim, never the
 * other way -- for `resolveClaimEvidence`'s reason: "the claim supports the
 * measurement" is not a statement anyone means, and accepting it would let a
 * claim manufacture its own backing. `contradicts` is read in both directions,
 * because a disagreement is symmetric however the asserter happened to orient
 * it, and a claim map that cites what argues with it is citing something a
 * reader should see rather than something it should be refused for.
 *
 * Every other edge kind is a relation between records rather than a statement
 * about a claim: `derived_from` and `used_input` say where a number came from,
 * and a chain of them is provenance, not support.
 */
function assertsRelation(edge, evidenceHash, claimHash) {
    if (edge.kind === "supports") {
        return edge.from_node_hash === evidenceHash && edge.to_node_hash === claimHash;
    }
    if (edge.kind !== "contradicts")
        return false;
    return ((edge.from_node_hash === evidenceHash && edge.to_node_hash === claimHash) ||
        (edge.from_node_hash === claimHash && edge.to_node_hash === evidenceHash));
}
/**
 * Whether the claim map, the graph and the bundles say the same thing.
 *
 * Three questions, and the second and third are the ones a resolution check
 * cannot answer. *Does every hash name something the package carries* -- a
 * claim, a cited node, a cited edge. *Does the graph assert the relation the map
 * claims* -- a map checked only for resolution accepted a claim citing itself as
 * its own evidence with no edges in the package at all: every hash resolved, and
 * nothing anywhere said that anything supported anything. And *does the claim
 * say which number it read* -- a claim resting on bundle-derived evidence that
 * names no bundle field has cited a document rather than a value.
 *
 * The codes stay separate because they need separate fixes, and collapsing them
 * into one "export failed" would leave the author guessing which sentence is the
 * problem.
 */
function claimMapFindings(body, bundles, declaredBundles) {
    const findings = [];
    const index = nodesByHash(body.nodes);
    const edgeHashes = new Set(body.edges.map((edge) => edge.content_hash));
    const section = "claim_evidence_map";
    const entryByClaim = new Map();
    body.claim_evidence_map.forEach((entry, entryIndex) => {
        const first = entryByClaim.get(entry.claim_node_hash);
        if (first !== undefined) {
            findings.push(finding("CLAIM_MAP_DUPLICATE_ENTRY", studyPath(section, entryIndex, "claim_node_hash"), `Claim ${entry.claim_node_hash} already has an entry at index ${first}. Two entries for one claim are ` +
                "two answers about what it rests on, and a reader gets whichever a consumer indexed last."));
            return;
        }
        entryByClaim.set(entry.claim_node_hash, entryIndex);
    });
    body.nodes.forEach((node, nodeIndex) => {
        if (node.kind !== "claim")
            return;
        if (!entryByClaim.has(node.content_hash)) {
            findings.push(finding("CLAIM_WITHOUT_EVIDENCE_NODE", studyPath("nodes", nodeIndex, "content_hash"), `The claim ${JSON.stringify(node.label)} appears in the package with no entry in the claim evidence ` +
                "map, so nothing states what it rests on. The export refuses rather than shipping the sentence with " +
                "the reasons left behind."));
            return;
        }
        // The graph's own answer to the question the map answers. Only the
        // "no supports edge at all" finding is taken: `verifyEvidenceGraph` reports
        // every unresolved endpoint already, and one defect, one finding is what
        // keeps a findings list a list of things to fix.
        for (const refusal of resolveClaimEvidence(body.nodes, body.edges, node.content_hash).refusals) {
            if (refusal.code !== "CLAIM_WITHOUT_EVIDENCE_NODE")
                continue;
            findings.push(findingFromRefusal(refusal, studyPath("nodes", nodeIndex, "content_hash")));
        }
    });
    body.claim_evidence_map.forEach((entry, entryIndex) => {
        const at = (...parts) => studyPath(section, entryIndex, ...parts);
        const claim = index.get(entry.claim_node_hash);
        if (claim === undefined) {
            findings.push(finding("EVIDENCE_NODE_UNRESOLVED", at("claim_node_hash"), "The claim evidence map names a claim node the package does not carry. The map resolves to nothing for " +
                "a recipient who has only this file, which is every recipient."));
        }
        if (entry.evidence_node_hashes.length === 0) {
            findings.push(finding("CLAIM_WITHOUT_EVIDENCE_NODE", at("evidence_node_hashes"), "This claim is listed with no evidence nodes at all. An empty list is a claim that was walked back to " +
                "nothing, recorded as though it had been checked."));
        }
        else if (entry.edge_hashes.length === 0) {
            findings.push(finding("CLAIM_EVIDENCE_UNLINKED", at("edge_hashes"), "This entry cites evidence and names no edge at all. The relation lives on the edge, together with who " +
                "asserted it and why, so an entry without one states a belief a reader cannot check."));
        }
        let readsBundle = false;
        entry.evidence_node_hashes.forEach((hash, hashIndex) => {
            if (hash === entry.claim_node_hash) {
                findings.push(finding("CLAIM_EVIDENCE_SELF_REFERENTIAL", at("evidence_node_hashes", hashIndex), "The claim is cited as its own evidence. Restating an assertion establishes nothing, and the edge that " +
                    "would carry the relation cannot exist -- an edge must join two different nodes -- so this entry can " +
                    "never be joined up in the graph."));
                return;
            }
            const evidence = index.get(hash);
            if (evidence === undefined) {
                findings.push(finding("EVIDENCE_NODE_UNRESOLVED", at("evidence_node_hashes", hashIndex), `The claim is said to rest on node ${hash}, and the package does not carry it. Evidence that cannot be ` +
                    "opened supports a claim exactly as much as no evidence does."));
                return;
            }
            if (evidence.reference !== null &&
                isBundleDerivedRecordKind(evidence.reference.record_kind)) {
                readsBundle = true;
            }
            if (body.edges.some((edge) => assertsRelation(edge, hash, entry.claim_node_hash)))
                return;
            findings.push(finding("CLAIM_EVIDENCE_UNLINKED", at("evidence_node_hashes", hashIndex), `The claim is said to rest on node ${hash}, and no edge in this package joins the two. The map and the ` +
                "graph are two statements about one relation, and this is them disagreeing: the node is carried, and " +
                "nothing in the study asserts that it backs this claim."));
        });
        entry.edge_hashes.forEach((hash, hashIndex) => {
            if (edgeHashes.has(hash))
                return;
            findings.push(finding("EVIDENCE_EDGE_ENDPOINT_UNRESOLVED", at("edge_hashes", hashIndex), `The claim evidence map cites edge ${hash}, and no edge in this package has that hash. The relation it ` +
                "names cannot be read, so neither can who asserted it or why."));
        });
        if (readsBundle && entry.bundle_fields.length === 0) {
            findings.push(finding("CLAIM_BUNDLE_FIELD_MISSING", at("bundle_fields"), "This claim rests on evidence that points into a resource intelligence bundle, and it does not say which " +
                "field of which bundle it reads. A bundle digest cites a document of several hundred fields; the " +
                "sentence came from one of them, and a reader has to be able to open that one."));
        }
        findings.push(...bundleFieldFindings(entry.bundle_fields, bundles, declaredBundles, at("bundle_fields")));
    });
    return findings;
}
/**
 * Records whose stated identity is not the identity of their contents.
 *
 * A node *is* its hash here, so this is not a redundant integrity check bolted
 * onto a graph that was already valid: a node claiming a hash its contents do
 * not produce is not the node any cell, edge or report segment naming that hash
 * refers to, and the package would ship pointing at something else entirely.
 * Reviews and reproductions are checked the same way and for the same reason --
 * a review whose recorded hash is not its contents is a verdict that was edited.
 */
function recordIntegrityFindings(body, extra) {
    const findings = [];
    const check = (kind, section, records) => {
        records.forEach((record, index) => {
            const expected = studySelfHash(kind, record);
            if (expected === record.content_hash)
                return;
            findings.push(finding("STUDY_RECORD_NOT_HASHABLE", studyPath(section, index, "content_hash"), `This ${kind} states hash ${record.content_hash} and its own contents canonicalize to ${expected}. ` +
                "Identity in this package is the content hash, so the record carried here is not the record its " +
                "references name."));
        });
    };
    check("evidence_node", "nodes", body.nodes);
    check("evidence_edge", "edges", body.edges);
    check("review_record", "reviews", extra.reviews);
    check("reproduction_record", "reproductions", extra.reproductions);
    return findings;
}
/**
 * The refusals `verifyEvidenceGraph` raises about a claim's supporting tree
 * rather than about the graph's shape.
 *
 * Split out because they answer a different level. A graph whose every edge
 * resolves and whose claims rest on nothing is structurally sound and
 * provenance-open, and a result that reported one boolean for both would be
 * answering the easier question.
 */
const PROVENANCE_CODES = new Set([
    "CLAIM_NOT_GROUNDED",
    "CLAIM_SUPPORT_BRANCH_UNGROUNDED",
    // A claim nothing points at is a fact about its supporting tree rather than
    // about the graph's shape: every edge in the file may resolve, be permitted
    // and be unique while a claim rests on nothing. Classifying it as structural
    // made `graph_structurally_valid` answer a question it was not asked.
    "CLAIM_WITHOUT_EVIDENCE_NODE",
]);
/**
 * Codes the graph verifier raises that this module reports with a better path.
 *
 * `verifyEvidenceGraph` addresses its refusals by subject -- a node's label, an
 * edge's hash -- because it is called on bare lists as often as on a package,
 * and a path into a package is not a fact those callers have. That is right for
 * it and wrong here, so the one check a recipient acts on most often is made
 * again below with an index in it, and the collection-addressed copy is dropped
 * rather than reported twice.
 */
const GRAPH_CODES_REPORTED_WITH_A_PATH = new Set([
    "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
]);
/**
 * Edges whose endpoints are not nodes this package carries, addressed to the
 * endpoint.
 *
 * The finding a recipient acts on after an edit-and-re-hash: the node's identity
 * moved, so every edge that named the old one now points at nothing. Reported
 * per side rather than per edge, because an edge with one bad endpoint and an
 * edge with two are different amounts of broken, and the fix is at the side that
 * is wrong.
 */
function edgeEndpointFindings(nodes, edges) {
    const carried = new Set(nodes.map((node) => node.content_hash));
    const findings = [];
    edges.forEach((edge, index) => {
        for (const side of ["from_node_hash", "to_node_hash"]) {
            if (carried.has(edge[side]))
                continue;
            findings.push(finding("EVIDENCE_EDGE_ENDPOINT_UNRESOLVED", studyPath("edges", index, side), `This ${edge.kind} edge names node ${edge[side]}, and the package does not carry it. An edge that joins ` +
                "nothing to something asserts a relation a reader cannot follow at either end."));
        }
    });
    return findings;
}
/**
 * The graph verifier's refusals, addressed to the collection they are about.
 *
 * `$.nodes` and `$.edges` rather than an index, and that is a statement rather
 * than a shortcut: these are the checks `verifyEvidenceGraph` makes from a
 * subject -- the edge matrix, cycles, supersession forks, reference agreement,
 * provenance closure -- and a subject is a label, which two records may share.
 * A collection-addressed finding is the honest rendering of "somewhere in here",
 * and it is also the mark that separates the checks this build makes alone from
 * the ones both languages make: `fixtures/study/verification-vectors.json` pins
 * the indexed findings as the cross-language contract and records these
 * separately.
 */
function graphFindings(graph) {
    return graph.refusals
        .filter((refusal) => !GRAPH_CODES_REPORTED_WITH_A_PATH.has(refusal.code))
        .map((refusal) => findingFromRefusal(refusal, PROVENANCE_CODES.has(refusal.code) ? studyPath("nodes") : studyPath("edges")));
}
/**
 * The package's own digest, or the reason there is not one.
 *
 * The hashing core throws, which is right for a primitive and wrong at an
 * export boundary: a caller assembling a package deserves "one of your evidence
 * nodes carries a field nobody declared" beside the other findings, rather than
 * as an exception it has to catch to find out.
 *
 * Computing the digest *is* the check. A projection has no separate walk to run
 * first -- it reads the fields the record kind declares and refuses everything
 * else -- so the only way to ask whether a package can be hashed honestly is to
 * hash it.
 */
function selfHashOrFindings(record) {
    const rulesRefusal = studyRulesIdRefusal("research_package", record);
    if (rulesRefusal !== null) {
        return { ok: false, findings: [findingFromRefusal(rulesRefusal, studyPath("hash_rules_id"))] };
    }
    try {
        return { ok: true, hash: studySelfHash("research_package", record) };
    }
    catch (error) {
        return {
            ok: false,
            findings: [findingFromRefusal(studyNotHashableRefusal("research_package", error), studyPath())],
        };
    }
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
export function buildResearchPackage(input) {
    // Asked before the node schema sees the input: the schema refuses a malformed
    // claim by throwing, which is right for a parser and wrong at an export
    // boundary, where a caller deserves the finding beside the others.
    const unknownClaims = verifyClaimValues(input.nodes).map((refusal, index) => findingFromRefusal(refusal, studyPath("nodes", index)));
    if (unknownClaims.length > 0)
        return { ok: false, findings: unknownClaims };
    // A figure carrying markup is refused by name rather than by schema, because
    // the schema's message would be "unrecognized key" and the reason matters: a
    // picture is not checkable against the numbers, whoever drew it.
    const rawSvg = [];
    (input.figures ?? []).forEach((figure, index) => {
        if (!Object.prototype.hasOwnProperty.call(figure, "svg"))
            return;
        rawSvg.push(finding("FIGURE_RAW_SVG_REFUSED", studyPath("figures", index, "svg"), "This figure was supplied as SVG. A picture cannot be checked against the numbers it claims to show, and " +
            "supplied markup rendered beside verified results runs the package author's code there. Supply a spec " +
            "whose points name evidence nodes; a picture that no renderer here produces is sanitized with " +
            "sanitizeStudySvg, stored outside the package, and named by svg_artifact."));
    });
    if (rawSvg.length > 0)
        return { ok: false, findings: rawSvg };
    const nodes = input.nodes.map((node) => EvidenceNodeSchema.parse(node));
    const edges = input.edges.map((edge) => EvidenceEdgeSchema.parse(edge));
    const environment = StudyEnvironmentSchema.parse(input.environment);
    const references = (input.references ?? []).map((citation) => StudyCitationSchema.parse(citation));
    const report = input.report;
    const recipe = ReproductionRecipeSchema.parse(input.recipe);
    const figures = input.figures ?? [];
    const reviews = (input.reviews ?? []).map((review) => ReviewRecordSchema.parse(review));
    const reproductions = (input.reproductions ?? []).map((record) => ReproductionRecordSchema.parse(record));
    const checkLedger = (input.checkLedger ?? []).map((entry) => CheckLedgerEntrySchema.parse(entry));
    const bundleRefs = input.bundleRefs ?? [];
    const distribution = input.distribution ?? "ONLINE";
    const sources = nodesByHash(nodes);
    // The CSV is generated here and nowhere else. A caller cannot supply one, so
    // there is no path on which a package is written carrying a file its own rows
    // do not produce.
    //
    // The tables are deliberately *not* parsed by `StudyTableSchema` on the way
    // in, which is how the rows were treated before them. A parse would throw on
    // an undeclared key, and an undeclared key is exactly what the projection is
    // here to refuse with a finding a caller can read -- `selfHashOrFindings`
    // below reports it as `STUDY_RECORD_NOT_HASHABLE` with the path of the key.
    // The final `ResearchPackageSchema.parse` still refuses a malformed table
    // before anything is written.
    const tableInputs = input.tables ?? [];
    const tableShape = tableInputs.flatMap((table, index) => tableFindings({ ...table, csv_artifact: PLACEHOLDER_ARTIFACT }, sources, index));
    if (tableShape.length > 0)
        return { ok: false, findings: tableShape };
    const tables = tableInputs.map((table) => ({
        ...table,
        csv_artifact: tableCsvArtifact({ ...table, csv_artifact: PLACEHOLDER_ARTIFACT }, sources, STUDY_SCHEMA_VERSION),
    }));
    const withoutHash = {
        schema_version: STUDY_SCHEMA_VERSION,
        hash_rules_id: STUDY_HASH_RULES_ID,
        package_kind: "KETQAT_RESEARCH_PACKAGE",
        distribution,
        study_ref: input.studyRef,
        plan_ref: input.planRef,
        report,
        tables,
        figures,
        references,
        bundle_refs: bundleRefs,
        environment,
        recipe,
        nodes,
        edges,
        claim_evidence_map: input.claimEvidenceMap,
        reviews,
        reproductions,
        check_ledger: checkLedger,
        limitations: input.limitations,
        is_demo: input.isDemo,
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    // Asked before anything else hashes, over the assembled record rather than
    // over its parts, because everything below this line takes a digest and a
    // record the projection refuses would throw out of an export boundary whose
    // whole contract is to return findings instead.
    const selfHash = selfHashOrFindings(withoutHash);
    if (!selfHash.ok)
        return { ok: false, findings: selfHash.findings };
    const body = {
        nodes,
        edges,
        tables,
        figures,
        report,
        references,
        limitations: input.limitations,
        claim_evidence_map: input.claimEvidenceMap,
        recipe,
        check_ledger: checkLedger,
    };
    // `requireResolution: false` -- a builder assembling a package that references
    // bundles held in a store cannot resolve them, and refusing it would refuse
    // the ordinary online export. An offline export must still embed, and an
    // embedded bundle is still decoded and checked here.
    const bundles = resolveBundles(bundleRefs, STUDY_SCHEMA_VERSION, new Map(), distribution, "bundle_refs", false);
    const graph = verifyEvidenceGraph(nodes, edges);
    const findings = [
        ...recordIntegrityFindings(body, { reviews, reproductions }),
        ...edgeEndpointFindings(nodes, edges),
        ...graphFindings(graph),
        ...structuralFindings(body, bundles.bundles, bundleRefs),
        ...bundles.findings,
    ];
    if (findings.length > 0)
        return { ok: false, findings };
    return {
        ok: true,
        package: ResearchPackageSchema.parse({ ...withoutHash, reproducibility_hash: selfHash.hash }),
    };
}
/**
 * A stand-in digest, used only while a table's own digest is being computed.
 *
 * `tableFindings` needs a whole `StudyTable` to check the rows, and the rows
 * have to be checked before they can be rendered -- so the artifact field is
 * filled with a value that is never written anywhere: the builder replaces it
 * with the computed one, and every finding that could be raised about it is
 * raised after the replacement.
 */
const PLACEHOLDER_ARTIFACT = Object.freeze({
    media_type: "text/csv",
    byte_size: "0",
    content_hash: "0".repeat(64),
});
/**
 * Everything a package says about itself that the package itself can check.
 *
 * Collected in one function so the builder and the verifier ask exactly the same
 * questions: a package assembled by something other than `buildResearchPackage`
 * -- by hand, by an older build, by a service with its own idea of what a claim
 * map is -- gets the reading the builder would have refused to write.
 */
function structuralFindings(body, bundles, bundleRefs) {
    const sources = nodesByHash(body.nodes);
    const cells = indexTableCells(body.tables);
    // The CSV is only comparable once the rows resolve: rendering an unresolved
    // table would throw, and a throw here would replace a readable list of
    // findings with a stack trace about the first of them. So each table is asked
    // about its shape, and only a table with nothing wrong is rendered and its
    // file compared -- which is also the right order for a reader, who should be
    // sent to the graph rather than to the CSV when a cell names a node that is
    // not there.
    const tables = body.tables.flatMap((table, index) => {
        const shape = tableFindings(table, sources, index);
        if (shape.length > 0)
            return shape;
        return tableCsvArtifactFindings(table, sources, STUDY_SCHEMA_VERSION, index);
    });
    return [
        ...tableListFindings(body.tables),
        ...tables,
        ...figureListFindings(body.figures),
        ...body.figures.flatMap((figure, index) => figureFindings(figure, sources, cells, index)),
        ...reportFindings(body.report, {
            nodes: sources,
            tables: body.tables,
            figures: body.figures,
            citations: body.references,
            limitations: body.limitations,
        }),
        ...recipeFindings(body.recipe, carriedArtifactHashes(body, bundleRefs)),
        ...claimMapFindings(body, bundles, new Set(bundleRefs.map((ref) => ref.reproducibility_hash))),
    ];
}
export const StudyVerificationSchema = z
    .object({
    /**
     * Twelve independent answers.
     *
     * Nested rather than flattened into the result, so that a caller reading
     * `verification.levels` has all of them or none: a flat object invites
     * destructuring one field, and the field that would be destructured is
     * whichever reads most like "is it fine".
     */
    levels: StudyVerificationLevelsSchema,
    /** Derived from the levels by `deriveStudyVerificationStatus`, never asserted. */
    status: StudyVerificationStatusSchema,
    /** What this implementation did. TypeScript recomputes the science; Python does not. */
    verification_performed: StudyVerificationPerformedSchema,
    expected_hash: z.string(),
    actual_hash: z.string(),
    /** Every defect, with a code and a JSON path. The codes and paths are the cross-language contract. */
    findings: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() }).strict()),
    /** What a result at this status does not establish, in sentences a surface can render. */
    not_established: z.array(z.string().min(1)),
    /** What the ledger adds up to, without collapsing what it says. */
    check_ledger: z
        .object({
        total: z.number(),
        passed: z.number(),
        failed: z.number(),
        not_run: z.number(),
        inconclusive: z.number(),
        required_checks_passed: z.boolean(),
    })
        .strict(),
    /** The findings rendered one to a line, for a person. Never a contract. */
    problems: z.array(z.string().min(1)),
})
    .strict();
function refused(levels, findings, actualHash, ledger) {
    return StudyVerificationSchema.parse({
        levels,
        status: deriveStudyVerificationStatus(levels),
        verification_performed: "INTEGRITY_STRUCTURE_AND_SCIENCE",
        expected_hash: "",
        actual_hash: actualHash,
        findings,
        not_established: [...notEstablished(levels)],
        check_ledger: ledger,
        problems: findings.map(renderStudyFinding),
    });
}
const EMPTY_LEDGER = checkLedgerSummary([]);
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
export function verifyResearchPackage(candidate, options = {}) {
    const levels = refusedStudyVerificationLevels();
    if (candidate === null || typeof candidate !== "object") {
        return refused(levels, [
            finding("STUDY_RECORD_NOT_HASHABLE", studyPath(), "A research package is a JSON object, and this is not one."),
        ], "", EMPTY_LEDGER);
    }
    const raw = candidate;
    const ceilings = packageLimitFindings(raw);
    if (ceilings.length > 0) {
        return refused(levels, ceilings, String(raw["reproducibility_hash"] ?? ""), EMPTY_LEDGER);
    }
    const parsed = ResearchPackageSchema.safeParse(candidate);
    if (!parsed.success) {
        return refused(levels, parsed.error.issues.map((issue) => finding("STUDY_RECORD_NOT_HASHABLE", issue.path.length === 0 ? studyPath() : studyPath(...issue.path), issue.message)), String(raw["reproducibility_hash"] ?? ""), EMPTY_LEDGER);
    }
    // Everything below reads the package as written, never `parsed.data`.
    const pkg = candidate;
    const ledgerShape = checkLedgerFindings(pkg.check_ledger);
    const ledger = checkLedgerSummary(pkg.check_ledger);
    if (ledgerShape.length > 0) {
        return refused(levels, ledgerShape, pkg.reproducibility_hash, ledger);
    }
    levels.schema_valid = true;
    const selfHash = selfHashOrFindings(pkg);
    if (!selfHash.ok) {
        return refused(levels, selfHash.findings, pkg.reproducibility_hash, ledger);
    }
    levels.canonicalizable = true;
    const findings = [];
    const expected = selfHash.hash;
    levels.hash_matches = expected === pkg.reproducibility_hash;
    if (!levels.hash_matches) {
        findings.push(finding("STUDY_RECORD_NOT_HASHABLE", studyPath("reproducibility_hash"), `The package claims ${pkg.reproducibility_hash} and its own contents canonicalize to ${expected}. The file ` +
            "was edited after it was written -- which on its own says nothing about whether the numbers are right, " +
            "because anyone who can edit a package can recompute its hash."));
    }
    const body = {
        nodes: pkg.nodes,
        edges: pkg.edges,
        tables: pkg.tables,
        figures: pkg.figures,
        report: pkg.report,
        references: pkg.references,
        limitations: pkg.limitations,
        claim_evidence_map: pkg.claim_evidence_map,
        recipe: pkg.recipe,
        check_ledger: pkg.check_ledger,
    };
    const integrity = recordIntegrityFindings(body, {
        reviews: pkg.reviews,
        reproductions: pkg.reproductions,
    });
    levels.record_integrity_valid = integrity.length === 0;
    findings.push(...integrity);
    const graph = verifyEvidenceGraph(pkg.nodes, pkg.edges);
    const endpoints = edgeEndpointFindings(pkg.nodes, pkg.edges);
    const structural = graph.refusals.filter((refusal) => !PROVENANCE_CODES.has(refusal.code) && !GRAPH_CODES_REPORTED_WITH_A_PATH.has(refusal.code));
    levels.graph_structurally_valid =
        graph.edges_resolve && graph.edges_permitted && structural.length === 0;
    levels.provenance_closed = graph.claims_grounded;
    findings.push(...endpoints, ...graphFindings(graph));
    const bundles = resolveBundles(pkg.bundle_refs, pkg.schema_version, options.bundles ?? new Map(), pkg.distribution);
    levels.bundles_resolve = bundles.resolved;
    levels.science_recomputed = bundles.science_recomputed;
    findings.push(...bundles.findings);
    const resolution = [
        ...structuralFindings(body, bundles.bundles, pkg.bundle_refs),
        ...absentRequiredChecks(pkg.check_ledger, options.requiredChecks ?? []),
    ];
    levels.claims_resolve = resolution.length === 0 && endpoints.length === 0;
    findings.push(...resolution);
    const carried = new Set(pkg.nodes.map((node) => node.content_hash));
    levels.independent_reproduction_present = pkg.reproductions.some((record) => record.outcome === "MATCHED" &&
        carried.has(record.original_node_hash) &&
        record.observed_node_hash !== null &&
        carried.has(record.observed_node_hash));
    levels.review_present = pkg.reviews.some((review) => carried.has(review.subject_node_hash));
    return StudyVerificationSchema.parse({
        levels,
        status: deriveStudyVerificationStatus(levels),
        verification_performed: "INTEGRITY_STRUCTURE_AND_SCIENCE",
        expected_hash: expected,
        actual_hash: pkg.reproducibility_hash,
        findings,
        not_established: [...notEstablished(levels)],
        check_ledger: ledger,
        problems: findings.map(renderStudyFinding),
    });
}
//# sourceMappingURL=research-package.js.map