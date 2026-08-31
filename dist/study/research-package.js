import { z } from "zod";
import { IsoDateTimeSchema } from "../contracts/common.js";
import { isKnown } from "../intelligence/measurement.js";
import { ContentHashSchema, RevisionRefSchema, STUDY_SCHEMA_VERSION, StudyCitationSchema, StudyEnvironmentSchema, } from "./common.js";
import { EvidenceEdgeSchema, EvidenceNodeSchema, resolveClaimEvidence, verifyEvidenceGraph, } from "./evidence.js";
import { STUDY_HASH_RULES_ID, assertNoNestedExcludedKeys, assertNoUnrepresentableValues, calculateStudyHash, studyRulesIdOf, } from "./hashing.js";
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
export const ResultRowSchema = z.object({
    /** What the row is called in the table a reader sees. */
    label: z.string().min(1),
    /**
     * The node the value is read from. There is deliberately no `value` field
     * beside it: a row that carried its own copy of the number could disagree with
     * the node, and the copy is what would end up in the slide.
     *
     * A result row's node has to carry a quantity, which is checked at the build
     * and verify boundaries rather than here -- the schema sees one row at a time
     * and the node it names lives elsewhere in the package.
     */
    node_hash: ContentHashSchema,
}).strict();
export const FigureSchema = z.object({
    label: z.string().min(1),
    /** Inline SVG, so a figure cannot resolve to a different picture later. */
    svg: z.string().min(1),
}).strict();
/**
 * What one claim in the package rests on, stated rather than inferred.
 *
 * The graph already holds the edges, so this map is redundant -- and that is the
 * point. It is the export's own assertion about which evidence it believes backs
 * which claim, written down where it can be checked against the graph instead of
 * recomputed from it by every consumer with its own idea of what "supports"
 * means. The two disagreeing is a finding, not a rounding error.
 */
export const ClaimEvidenceEntrySchema = z.object({
    claim_node_hash: ContentHashSchema,
    /** At least one: an entry with an empty list is the absence this family refuses. */
    evidence_node_hashes: z.array(ContentHashSchema).min(1),
    /** The edges that carry the relation, so a reader can read the rationale rather than guess it. */
    edge_hashes: z.array(ContentHashSchema),
}).strict();
export const ResearchPackageSchema = z.object({
    schema_version: z.string().min(1),
    /** Required, never inferred. A package that does not name its rules is refused, not defaulted. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The discriminant, in the `bundle_kind` idiom: one string that says what this file is. */
    package_kind: z.literal("KETQAT_RESEARCH_PACKAGE"),
    study_ref: ContentHashSchema,
    /** The confirmed plan revision this package answers. A report for a plan nobody approved has no provenance. */
    plan_ref: RevisionRefSchema,
    report_markdown: z.string().min(1),
    /** How the numbers were produced, in prose. Required: a result with no method is an anecdote. */
    methods: z.string().min(1),
    assumption_rows: z.array(ResultRowSchema),
    /** Numbers in tables are nodes. The build refuses any row whose node the package does not carry. */
    result_rows: z.array(ResultRowSchema),
    csv: z.string(),
    figures: z.array(FigureSchema),
    references: z.array(StudyCitationSchema),
    /** Hashes of the `ResourceIntelligenceBundle` records behind this package. Referenced, never inlined. */
    bundle_refs: z.array(ContentHashSchema),
    /**
     * Study-local, and array-shaped where the shared `EnvironmentSchema` is a map.
     * A map's keys are data, and `study-v1` drops excluded names at every depth.
     */
    environment: StudyEnvironmentSchema,
    /** The command that regenerates this package from itself. */
    reproduction_command: z.string().min(1),
    /**
     * The graph travels with the report. A package whose evidence lived in a
     * database the recipient cannot reach would be a report with footnotes nobody
     * can follow, which is the state this family was built to end.
     */
    nodes: z.array(EvidenceNodeSchema),
    edges: z.array(EvidenceEdgeSchema),
    claim_evidence_map: z.array(ClaimEvidenceEntrySchema),
    /** What this package does not establish. Required and non-empty: every study has some. */
    limitations: z.array(z.string().min(1)).min(1),
    /**
     * Checks that ran and did not pass, carried rather than dropped (RFC §7). An
     * export that quietly omits its failures reads exactly like one that had none.
     */
    failed_checks: z.array(z.string().min(1)),
    is_demo: z.boolean(),
    /** Excluded from the hash by name, like every other timestamp in this family. */
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
 * Claim nodes asserting a value nobody knows.
 *
 * Checked against the raw input, before `EvidenceNodeSchema` sees it, and that
 * order is the whole reason this is a separate function. The node schema refuses
 * an unknown claim by throwing, which is right for a parser and wrong for an
 * export boundary: a caller assembling a package deserves a refusal it can read
 * beside the other refusals, not an exception it has to catch to find out that
 * one sentence in its report was never established.
 */
function unknownClaimRefusals(nodes) {
    const refusals = [];
    for (const node of nodes) {
        if (node.kind !== "claim" || node.claim === null)
            continue;
        if (isKnown(node.claim.value))
            continue;
        refusals.push({
            subject: node.label,
            code: "CLAIM_VALUE_UNKNOWN",
            message: `The claim '${node.claim.subject}.${node.claim.metric}' asserts a value that is UNKNOWN. An unknown is not ` +
                "a weaker claim, it is the absence of one, and it belongs in a quantity node or the study's open questions " +
                "rather than in a sentence this package would export as a finding.",
        });
    }
    return refusals;
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
 * and a chain of them is provenance, not support. If a study means "this backs
 * that", it says so with an edge that says so -- and then the rationale is on
 * the edge where a reviewer can read it.
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
 * Whether the claim map, the tables and the graph say the same thing.
 *
 * Two questions, and the second is the one a resolution check cannot answer.
 * *Does every hash name something the package carries* -- a row, a claim, a
 * cited node, a cited edge -- and *does the graph assert the relation the map
 * claims*. A map checked only for resolution accepted a claim citing itself as
 * its own evidence with no edges in the package at all: every hash resolved,
 * and nothing anywhere said that anything supported anything.
 *
 * So the codes stay separate, because they need separate fixes: a row naming a
 * node that was never included, a row naming a node with no value to read, a
 * claim nobody wired up, an entry whose evidence list is empty, an entry citing
 * an edge the package does not carry, an entry citing evidence no edge joins to
 * the claim, and an entry citing the claim itself. Collapsing them into one
 * "export failed" would leave the author guessing which of their tables is the
 * problem.
 */
function claimMapRefusals(body) {
    const refusals = [];
    const index = nodesByHash(body.nodes);
    const edgeHashes = new Set(body.edges.map((edge) => edge.content_hash));
    const sections = [
        ["assumption_rows", body.assumption_rows],
        ["result_rows", body.result_rows],
    ];
    for (const [section, rows] of sections) {
        for (const row of rows) {
            if (index.has(row.node_hash))
                continue;
            refusals.push({
                subject: `${section}: ${row.label}`,
                code: "EVIDENCE_NODE_UNRESOLVED",
                message: `The row names node ${row.node_hash}, and the package does not carry it. A table cell whose node is ` +
                    "missing renders as a number like any other, and a reader has no way to discover that it stands alone.",
            });
        }
    }
    // A result row is a number in a table, so the node under it has to be one. A
    // `quantity` block is what carries a value in this family -- envelope, unit,
    // evidence class and all -- and a row pointing at a claim, a reference or a
    // citation has nothing to read out: the label would render beside whatever the
    // renderer chose to show, which is how a sentence becomes a figure. An UNKNOWN
    // quantity passes: it is a value that says it is missing, which is the one
    // honest way for a table to have a gap in it.
    for (const row of body.result_rows) {
        const node = index.get(row.node_hash);
        if (!node || node.quantity !== null)
            continue;
        refusals.push({
            subject: `result_rows: ${row.label}`,
            code: "RESULT_ROW_WITHOUT_VALUE",
            message: `The row reads its value from the ${node.kind} node '${node.label}', which carries no quantity. A result ` +
                "row is a number in a table, and a row whose node has no number is a label a reader will still quote.",
        });
    }
    const mapped = new Set(body.claim_evidence_map.map((entry) => entry.claim_node_hash));
    for (const node of body.nodes) {
        if (node.kind !== "claim")
            continue;
        if (!mapped.has(node.content_hash)) {
            refusals.push({
                subject: node.label,
                code: "CLAIM_WITHOUT_EVIDENCE_NODE",
                message: "This claim node appears in the package with no entry in the claim evidence map, so nothing states what " +
                    "it rests on. The export refuses rather than shipping the sentence with the reasons left behind.",
            });
            continue;
        }
        // The graph's own answer to the question the map answers, from the function
        // that exists to give it. The map is the export's assertion and the edges are
        // the study's, and a claim the map wires up while no `supports` edge points at
        // it is a claim with nothing behind it however confident the map is.
        //
        // Only that finding is taken. `resolveClaimEvidence` also reports a supports
        // edge whose source node is missing, and both callers of this function run
        // `verifyEvidenceGraph`, which reports every unresolved endpoint already:
        // one defect, one finding is what keeps the refusal list a list of things to
        // fix rather than a transcript of who noticed.
        refusals.push(...resolveClaimEvidence(body.nodes, body.edges, node.content_hash).refusals.filter((refusal) => refusal.code === "CLAIM_WITHOUT_EVIDENCE_NODE"));
    }
    for (const entry of body.claim_evidence_map) {
        const claim = index.get(entry.claim_node_hash);
        const subject = claim?.label ?? entry.claim_node_hash;
        if (!claim) {
            refusals.push({
                subject: entry.claim_node_hash,
                code: "EVIDENCE_NODE_UNRESOLVED",
                message: "The claim evidence map names a claim node the package does not carry. The map would resolve to nothing " +
                    "for a recipient who has only this file, which is every recipient.",
            });
        }
        if (entry.evidence_node_hashes.length === 0) {
            refusals.push({
                subject,
                code: "CLAIM_WITHOUT_EVIDENCE_NODE",
                message: "The claim evidence map lists this claim with no evidence nodes at all. An empty list is a claim that was " +
                    "walked back to nothing, recorded as though it had been checked.",
            });
        }
        else if (entry.edge_hashes.length === 0) {
            // An entry that names evidence and cites no edge asserts a relation it
            // does not carry. The edge is where "this supports that" is written down
            // with a rationale and an asserter beside it, and without one the entry is
            // an opinion the package cannot show the basis for.
            refusals.push({
                subject,
                code: "CLAIM_EVIDENCE_UNLINKED",
                message: "The claim evidence map cites evidence for this claim and names no edge at all. The relation lives on the " +
                    "edge, together with who asserted it and why, so an entry without one states a belief a reader cannot check.",
            });
        }
        for (const hash of entry.evidence_node_hashes) {
            if (hash === entry.claim_node_hash) {
                refusals.push({
                    subject,
                    code: "CLAIM_EVIDENCE_SELF_REFERENTIAL",
                    message: "The claim is cited as its own evidence. Restating an assertion establishes nothing, and the edge that " +
                        "would carry the relation cannot exist -- an edge must join two different nodes -- so this entry can " +
                        "never be joined up in the graph.",
                });
                continue;
            }
            if (!index.has(hash)) {
                refusals.push({
                    subject,
                    code: "EVIDENCE_NODE_UNRESOLVED",
                    message: `The claim is said to rest on node ${hash}, and the package does not carry it. Evidence that cannot be ` +
                        "opened supports a claim exactly as much as no evidence does.",
                });
                continue;
            }
            if (body.edges.some((edge) => assertsRelation(edge, hash, entry.claim_node_hash)))
                continue;
            refusals.push({
                subject,
                code: "CLAIM_EVIDENCE_UNLINKED",
                message: `The claim is said to rest on node ${hash}, and no edge in this package joins the two. The map and the ` +
                    "graph are two statements about one relation, and this is them disagreeing: the node is carried, and " +
                    "nothing in the study asserts that it backs this claim.",
            });
        }
        for (const hash of entry.edge_hashes) {
            if (edgeHashes.has(hash))
                continue;
            // The vocabulary has one code for an edge that does not join up, and this
            // is that failure seen from the map's side: the relation the entry cites
            // has no edge in the package, so its rationale and its asserter are gone.
            refusals.push({
                subject,
                code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                message: `The claim evidence map cites edge ${hash}, and no edge in this package has that hash. The relation it ` +
                    "names cannot be read, so neither can who asserted it or why.",
            });
        }
    }
    return refusals;
}
/**
 * Nodes and edges whose stated identity is not the identity of their contents.
 *
 * A node *is* its hash here, so this is not a redundant integrity check bolted
 * onto a graph that was already valid: a node claiming a hash its contents do
 * not produce is not the node any row or edge naming that hash refers to, and
 * the package would ship with a table cell pointing at something else entirely.
 * Refused at build rather than left for the verifier, so a package that would
 * fail verification is never written in the first place.
 */
function identityRefusals(nodes, edges) {
    const refusals = [];
    for (const node of nodes) {
        const expected = calculateStudyHash(node);
        if (expected === node.content_hash)
            continue;
        refusals.push({
            subject: node.label,
            code: "EVIDENCE_NODE_UNRESOLVED",
            message: `The node states hash ${node.content_hash} and its own contents canonicalize to ${expected}. Identity in ` +
                "this graph is the content hash, so the node this package carries is not the node its rows name.",
        });
    }
    for (const edge of edges) {
        const expected = calculateStudyHash(edge);
        if (expected === edge.content_hash)
            continue;
        refusals.push({
            subject: edge.content_hash,
            code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
            message: `The ${edge.kind} edge states hash ${edge.content_hash} and canonicalizes to ${expected}. An edge that is ` +
                "not what it says it is cannot be cited by a claim map that names it.",
        });
    }
    return refusals;
}
/**
 * The hashing layer's two refusals, in this module's vocabulary.
 *
 * `assertNoNestedExcludedKeys` and `assertNoUnrepresentableValues` throw, which
 * is right for a hashing primitive and wrong at an export boundary: a caller
 * assembling a package deserves these beside the other refusals rather than as
 * an exception it has to catch to discover that one of its evidence nodes
 * carries a key the digest drops, or a figure the two languages read as two
 * different numbers.
 *
 * They stay two codes rather than one because they send a reader to different
 * places: `STUDY_EXCLUDED_KEY_NESTED` is fixed by renaming a field, and
 * `STUDY_VALUE_NOT_REPRESENTABLE` by changing the value itself.
 */
function hashingRefusals(record) {
    const checks = [
        [assertNoNestedExcludedKeys, "STUDY_EXCLUDED_KEY_NESTED"],
        [assertNoUnrepresentableValues, "STUDY_VALUE_NOT_REPRESENTABLE"],
    ];
    for (const [assert, code] of checks) {
        try {
            assert(record, STUDY_HASH_RULES_ID);
        }
        catch (error) {
            return [{ subject: "research_package", code, message: error.message }];
        }
    }
    return [];
}
/**
 * Assemble a package, or say why there is nothing to assemble.
 *
 * The order is `buildBundle`'s and the order is the contract. Inputs are parsed
 * first, so that a record refused by a schema is refused before anything is
 * hashed, and the record that gets hashed is the record that gets written.
 *
 * There is nothing left for that parse to normalise. `StudyCitationSchema`
 * requires its author list where the shared `CitationSchema` defaults it, and
 * that default was the last one a study record still met: a citation written
 * without `authors` hashed one way here and another way once parsed, so this
 * builder and `verifyResearchPackage` addressed two different nodes for one
 * file, and Python -- which fills in nothing -- agreed with neither.
 *
 * That is the writer's half of one invariant: **a package's hash is over the
 * package as it appears in the file.** The builder holds it by writing exactly
 * what it hashed; `verifyResearchPackage` holds it by hashing exactly what it
 * read. Only both halves together make the digest something the Python verifier
 * can recompute from the same bytes.
 *
 * Everything structural is then checked before the hash exists, because a
 * refusal is meant to be the ordinary outcome here rather than the error case. A
 * study with a number nobody wired up is not a broken program; it is a study
 * that is not finished, and the refusals say which part.
 */
export function buildResearchPackage(input) {
    const unknownClaims = unknownClaimRefusals(input.nodes);
    if (unknownClaims.length > 0)
        return { ok: false, refusals: unknownClaims };
    const nodes = input.nodes.map((node) => EvidenceNodeSchema.parse(node));
    const edges = input.edges.map((edge) => EvidenceEdgeSchema.parse(edge));
    const environment = StudyEnvironmentSchema.parse(input.environment);
    const references = (input.references ?? []).map((citation) => StudyCitationSchema.parse(citation));
    const assumptionRows = input.assumptionRows ?? [];
    const resultRows = input.resultRows ?? [];
    const body = {
        nodes,
        edges,
        assumption_rows: assumptionRows,
        result_rows: resultRows,
        claim_evidence_map: input.claimEvidenceMap,
    };
    const withoutHash = {
        schema_version: STUDY_SCHEMA_VERSION,
        hash_rules_id: STUDY_HASH_RULES_ID,
        package_kind: "KETQAT_RESEARCH_PACKAGE",
        study_ref: input.studyRef,
        plan_ref: input.planRef,
        report_markdown: input.reportMarkdown,
        methods: input.methods,
        assumption_rows: assumptionRows,
        result_rows: resultRows,
        csv: input.csv ?? "",
        figures: input.figures ?? [],
        references,
        bundle_refs: input.bundleRefs ?? [],
        environment,
        reproduction_command: input.reproductionCommand,
        nodes,
        edges,
        claim_evidence_map: input.claimEvidenceMap,
        limitations: input.limitations,
        failed_checks: input.failedChecks ?? [],
        is_demo: input.isDemo,
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    // Asked before anything hashes, over the assembled record rather than over its
    // parts, because everything below this line takes a digest: `identityRefusals`
    // recomputes every node's, and a node carrying a key the canonicalizer drops --
    // or a number the two languages read differently -- would throw out of an
    // export boundary whose whole contract is to return refusals instead.
    const unhashable = hashingRefusals(withoutHash);
    if (unhashable.length > 0)
        return { ok: false, refusals: unhashable };
    // The shared graph verifier reports an edge whose endpoint is missing; the
    // identity check names the node that lied about its own hash. Neither answers
    // for the other, and a package that would fail verification must not be
    // writable in the first place.
    const graph = verifyEvidenceGraph(nodes, edges);
    const refusals = [...identityRefusals(nodes, edges), ...graph.refusals, ...claimMapRefusals(body)];
    if (refusals.length > 0)
        return { ok: false, refusals };
    const hash = calculateStudyHash(withoutHash, STUDY_HASH_RULES_ID);
    return {
        ok: true,
        package: ResearchPackageSchema.parse({ ...withoutHash, reproducibility_hash: hash }),
    };
}
export const StudyVerificationSchema = z.object({
    valid: z.boolean(),
    /** The file is unedited: its contents canonicalize to the hash it carries. */
    hash_matches: z.boolean(),
    /**
     * Every row resolves to a node the package carries, every result row's node
     * carries a value, and every claim's cited evidence is joined to it by an edge
     * that asserts the relation. Resolution alone was the weaker half: a claim
     * citing itself resolved perfectly and rested on nothing.
     */
    claims_resolve: z.boolean(),
    /** Node and edge identities are their own contents, and every edge joins two nodes that are here. */
    graph_valid: z.boolean(),
    expected_hash: z.string(),
    actual_hash: z.string(),
    /** Every discrepancy found, named. Empty when `valid`. */
    problems: z.array(z.string().min(1)),
}).strict();
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
 * `claims_resolve` asks the graph as well as the map, and the same checks run
 * here as at the build boundary. A recipient is the party the checks are for: a
 * package assembled by something other than `buildResearchPackage` -- by hand, by
 * an older build, by a service with its own idea of what a claim map is -- gets
 * exactly the reading the builder would have refused to write.
 *
 * What this does not do is recompute the science. Nothing here re-derives an
 * estimate from a scenario or re-runs a decision rule; `verifyBundle` does that
 * for the intelligence tier, and a package that carries `bundle_refs` is
 * pointing at bundles that can be verified that way. Nor does the graph check
 * weigh the evidence: an edge asserting that a result supports a claim is the
 * study's assertion, checked for being present, joined up and attributed, never
 * for being right. A valid result here means the package is internally
 * consistent and unedited, and no more than that.
 */
export function verifyResearchPackage(candidate) {
    const parsed = ResearchPackageSchema.safeParse(candidate);
    if (!parsed.success) {
        return StudyVerificationSchema.parse({
            valid: false,
            hash_matches: false,
            claims_resolve: false,
            graph_valid: false,
            expected_hash: "",
            actual_hash: "",
            problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
        });
    }
    // Everything below reads the package *as written*, never `parsed.data`. The
    // parse above answers "is this shaped like a research package" and nothing
    // else; no schema in this family carries a `.default()` any more, so the two
    // values are the same one -- and this order is what keeps them the same if a
    // default is ever added back. A verifier that hashed a materialised container
    // would be answering about a record the file does not contain, and disagreeing
    // with the Python verifier, which reads the same bytes and fills in nothing.
    // The same applies to the node and edge identities below: they are recomputed
    // from the graph the recipient received.
    const pkg = candidate;
    const problems = [];
    // The literal on `hash_rules_id` has already refused a missing or unknown id,
    // so this reads the rules the record names rather than assuming the current
    // ones: a future `study-v2` package must be hashed the way it says it was.
    const rulesId = studyRulesIdOf(pkg);
    // A record the digest cannot represent honestly is refused rather than hashed,
    // here as at the build boundary. A key the canonicalizer drops lets a package's
    // contents be swapped for somebody else's while its hash still checks out; an
    // integer above 2**53 lets two packages reporting figures half a million apart
    // share one digest, one node identity and one clean verification.
    const hidden = hashingRefusals(pkg);
    if (hidden.length > 0) {
        return StudyVerificationSchema.parse({
            valid: false,
            hash_matches: false,
            claims_resolve: false,
            graph_valid: false,
            expected_hash: "",
            actual_hash: pkg.reproducibility_hash,
            problems: hidden.map((refusal) => `${refusal.code} (${refusal.subject}): ${refusal.message}`),
        });
    }
    const expected = calculateStudyHash(pkg, rulesId);
    const hashMatches = expected === pkg.reproducibility_hash;
    if (!hashMatches) {
        problems.push(`Reproducibility hash mismatch: the package claims ${pkg.reproducibility_hash} and its own contents ` +
            `canonicalize to ${expected} under ${rulesId}.`);
    }
    const graph = verifyEvidenceGraph(pkg.nodes, pkg.edges);
    problems.push(...graph.problems);
    const refusals = claimMapRefusals(pkg);
    const claimsResolve = refusals.length === 0;
    problems.push(...refusals.map((refusal) => `${refusal.code} (${refusal.subject}): ${refusal.message}`));
    return StudyVerificationSchema.parse({
        valid: problems.length === 0,
        hash_matches: hashMatches,
        claims_resolve: claimsResolve,
        graph_valid: graph.valid,
        expected_hash: expected,
        actual_hash: pkg.reproducibility_hash,
        problems,
    });
}
//# sourceMappingURL=research-package.js.map