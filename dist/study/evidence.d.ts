import { z } from "zod";
import type { Citation } from "../contracts/common.js";
import { type Contract, type Quantity } from "../intelligence/measurement.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * The Evidence Graph (ketqat-sdk#259, ADR 0010).
 *
 * A study's output is a handful of sentences: "this workload needs at most 4.2
 * million physical qubits", "this beats the classical baseline above problem
 * size N". Those sentences are what leaves the building, and the failure this
 * module exists to prevent is the ordinary one -- the sentence travels, the
 * reasons stay behind, and a modelled figure with three assumptions under it
 * ends up in a slide as a fact.
 *
 * So a claim is not prose here. It is a node with a subject, a metric, a
 * comparator and a *reference* to the number, wired by edges to the results,
 * inputs, models and sources it rests on. A reader can walk from the sentence to
 * the number to the run that produced it without trusting anyone's summary, and
 * an export can refuse -- not warn -- when that walk does not terminate.
 *
 * Five decisions carry most of the weight.
 *
 * **One value, one place.** A claim names its number by reference and never
 * embeds it. A claim that carried its own `Quantity` while quantity nodes
 * existed beside it held the same decision-bearing number twice, free to
 * disagree -- and the copy inside the sentence is the one that gets quoted,
 * while the node beside it is the one a verifier checks. The reference is the
 * source of truth, and `value_ref` is checked against the node it names.
 *
 * **One kind, one payload.** A node declares its kind and carries exactly the
 * block that kind means; every other block is null, and the refinement below
 * enforces both directions. A single object with a discriminating field is the
 * shape the intelligence tier already uses, and it keeps the generated JSON
 * Schema readable, but the pairing has to be checked explicitly or a `claim`
 * node could quietly carry a measurement that no reader would know how to read.
 *
 * **An edge means one of a declared list of things.** `EVIDENCE_EDGE_MATRIX`
 * says which `(from kind, edge kind, to kind)` triples this family defines, and
 * `verifyEvidenceGraph` refuses the rest. Without it, "a source supersedes a
 * model" parses, stores and renders exactly like a relation that means
 * something, and the reader has no way to tell the difference.
 *
 * **Support is not grounding.** One `supports` edge proves that somebody
 * asserted a relation. `verifyProvenanceClosure` walks the whole tree and asks
 * whether it *terminates* -- in a measured result, an execution capsule, a
 * dataset, a primary source, a user-provided input, an explicitly modelled
 * assumption, or an explicit UNKNOWN. A ring of claims agreeing with each other
 * satisfies every local check and grounds nothing.
 *
 * **Validation state is not a field.** Whether a node has been reviewed or
 * reproduced changes over time; the node does not. Both are separate records
 * (`review.ts`), keyed to a node by hash, so nothing that moves can move a hash
 * (ADR 0014 §1) and a verdict has somewhere to live.
 *
 * Nothing here establishes that a graph is authentic, signed or scientifically
 * correct. A verified graph is one whose parts refer to each other the way they
 * say they do; every number in it can still be wrong.
 */
/**
 * Who a node may be shown to.
 *
 * Declared here rather than imported from `src/contracts/common.ts` for the
 * reason `StudyQuantitySchema` is declared in `common.ts`: the shared contracts
 * are published under other hash rules, and a study-local variant is how this
 * family reads a shared idea without moving anything outside it.
 *
 * The class is `RECORD_ONLY`, and an `evidence_node` self-hashes for the
 * `record` purpose, so visibility is inside the node's identity. Flipping a node
 * from `PRIVATE` to `PUBLIC` therefore changes its hash and every edge naming it
 * stops resolving -- which is what makes "a private node cannot enter a public
 * package" a structural fact rather than a check somebody remembers to run.
 */
export declare const EvidenceVisibilitySchema: z.ZodEnum<["PUBLIC", "PRIVATE"]>;
export type EvidenceVisibility = z.infer<typeof EvidenceVisibilitySchema>;
/** Which audience a graph is being verified for. */
export declare const EvidenceAudienceSchema: z.ZodEnum<["public", "internal"]>;
export type EvidenceAudience = z.infer<typeof EvidenceAudienceSchema>;
export declare const EvidenceNodeKindSchema: z.ZodEnum<["claim", "quantity", "assumption", "input", "model_ref", "result", "capsule_ref", "source", "dataset_ref", "snapshot_ref"]>;
export type EvidenceNodeKind = z.infer<typeof EvidenceNodeKindSchema>;
/**
 * The relations an edge can carry.
 *
 * All six are statements about how the content of one record follows from the
 * content of another, which is the only kind of statement an edge of this shape
 * can hold honestly. A review and a reproduction are not: one is about a
 * person's judgement and one about a process outcome, neither has a node at its
 * far end or a verdict an edge could carry, and both live in `review.ts` as
 * records with the fields their meaning requires.
 */
export declare const EvidenceEdgeKindSchema: z.ZodEnum<["derived_from", "used_model", "used_input", "supports", "contradicts", "supersedes"]>;
export type EvidenceEdgeKind = z.infer<typeof EvidenceEdgeKindSchema>;
/**
 * The record kinds a reference may name, as a closed and versioned vocabulary.
 *
 * Closed, because `record_kind` is what tells a reader how to open the thing on
 * the other end: a free string means every consumer invents its own reading, and
 * two of them disagreeing about whether `benchmark_result` and
 * `qec_benchmark_result` are the same record is a disagreement about whether the
 * evidence exists. Versioned, because the list will grow, and a record written
 * against one version of it must say so rather than being reinterpreted under a
 * later one.
 *
 * Written as a `z.enum` rather than checked in a refinement so the emitted JSON
 * Schema carries it and the Python validator applies the same list to the same
 * file -- the split-rule failure `values.ts` records at length.
 */
export declare const EVIDENCE_RECORD_KIND_VOCABULARY_VERSION = "evidence-record-kinds-v1";
export declare const EvidenceRecordKindSchema: z.ZodEnum<["artifact", "benchmark_suite", "qec_experiment_manifest", "algorithm_experiment_manifest", "protocol_experiment_manifest", "qec_benchmark_result", "algorithm_benchmark_result", "protocol_benchmark_result", "reproducibility_bundle", "verification_evidence", "quantum_workload", "classical_baseline", "resource_scenario", "hardware_model_snapshot", "qec_model_snapshot", "economic_model", "resource_estimate_snapshot", "advantage_threshold", "decision_assessment", "resource_intelligence_bundle", "study", "study_event", "problem_specification", "study_plan", "confirmation_receipt", "study_task_authorization", "task_outcome", "evidence_node", "evidence_edge", "execution_capsule", "research_package", "review_record", "reproduction_record"]>;
export type EvidenceRecordKind = z.infer<typeof EvidenceRecordKindSchema>;
export declare const EVIDENCE_RECORD_KINDS: readonly EvidenceRecordKind[];
/**
 * How a claim relates its metric to its value.
 *
 * Separate from the quantity's own `bound` and not a duplicate of it: `bound`
 * says what kind of statement the number is (a point estimate, a limit the model
 * computed), while the comparator says what the claim asserts about it. An
 * upper-bound quantity can appear in an `AT_LEAST` claim -- "at least this many
 * qubits, and that figure is itself an upper bound" -- and collapsing the two
 * would silently rewrite one of them.
 */
export declare const ClaimComparatorSchema: z.ZodEnum<["LESS_THAN", "AT_MOST", "EQUAL", "AT_LEAST", "GREATER_THAN"]>;
export type ClaimComparator = z.infer<typeof ClaimComparatorSchema>;
/**
 * How a node points at a record outside the graph.
 *
 * Both naming schemes in this repository are accepted because both are in use:
 * registry records are named by slug, and content-addressed records -- study
 * revisions, bundles, capsules -- by their 64-hex hash. What is not accepted is
 * neither, which would be a node claiming to reference something without saying
 * what.
 *
 * A reference that carries both is the strong form and the one to prefer: the
 * hash is the binding and the slug is what a reader recognises. The graph checks
 * that no two references disagree about the pair, because two readings of one
 * pointer is the same defect as no pointer at all, arriving later.
 */
export interface EvidenceReference {
    record_kind: EvidenceRecordKind;
    hash: string | null;
    record_slug: string | null;
}
export declare const EvidenceReferenceSchema: Contract<EvidenceReference>;
/**
 * Where a claim's number is read from.
 *
 * Two forms, because the study has two honest ways to hold a number. A
 * `value_node` names a node whose payload *is* the value -- a `quantity` or an
 * `assumption` -- and is the ordinary case. A `result_field` names a `result`
 * node together with the field of the referenced result record to read, for the
 * number that lives inside a benchmark result rather than having been lifted out
 * of it into a node of its own.
 *
 * The graph checks what it can see: that the node resolves, that its kind can
 * carry a value, and that a `value_node` claim does not rest on an explicit
 * UNKNOWN. It cannot open the referenced result record, so a `field_path` is
 * checked for being a path and not for naming a field that exists -- and this
 * comment says so rather than leaving a reader to assume the stronger check.
 */
export declare const ClaimValueRefKindSchema: z.ZodEnum<["value_node", "result_field"]>;
export type ClaimValueRefKind = z.infer<typeof ClaimValueRefKindSchema>;
export interface ClaimValueRef {
    kind: ClaimValueRefKind;
    node_hash: string;
    field_path: string | null;
}
export declare const ClaimValueRefSchema: Contract<ClaimValueRef>;
/**
 * What one claim node asserts, in a form a machine can check.
 *
 * Prose was the alternative, and prose cannot be compared with a later run,
 * contradicted by a second study, or refused for lacking evidence. Four fields
 * are the price of a claim that can be argued with, and none of them is the
 * number itself: `value_ref` names the node that holds it, so the sentence and
 * the figure cannot drift apart.
 */
export interface ClaimStatement {
    subject_ref: EvidenceReference;
    metric: string;
    comparator: ClaimComparator;
    value_ref: ClaimValueRef;
}
export declare const ClaimStatementSchema: Contract<ClaimStatement>;
export interface EvidenceNode {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    kind: EvidenceNodeKind;
    label: string;
    visibility: EvidenceVisibility;
    claim: ClaimStatement | null;
    quantity: Quantity | null;
    reference: EvidenceReference | null;
    citation: Citation | null;
    limitations: string[];
    source_published_on: string | null;
    retrieved_on: string | null;
    created_at?: string;
    content_hash: string;
}
export declare const EvidenceNodeSchema: Contract<EvidenceNode>;
export interface EvidenceEdge {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    kind: EvidenceEdgeKind;
    from_node_hash: string;
    to_node_hash: string;
    asserted_by: string;
    rationale: string;
    created_at?: string;
    content_hash: string;
}
export declare const EvidenceEdgeSchema: Contract<EvidenceEdge>;
/**
 * Which relations this family defines, as declared data.
 *
 * The rows are the source and `EVIDENCE_EDGE_MATRIX` below is their expansion
 * into triples. Written as a table for the reason the field classification is
 * written as a table: the alternative is a chain of conditions inside a
 * validator, where "may a model contradict a dataset" is answered by reading
 * code rather than by looking it up, and where the answer for a combination
 * nobody thought about is silently yes.
 *
 * Two rows are worth reading twice.
 *
 * **`claim supports claim` is legal.** One study's claim resting on another's is
 * an ordinary thing to record, and refusing it here would move the interesting
 * check into the schema, where it would report "not permitted" for a graph whose
 * real defect is that nothing under those claims was ever measured. Closure is
 * where that is caught, and it catches the ten-deep version too.
 *
 * **`supersedes` runs along the diagonal.** A node replaces a node of its own
 * kind. A result superseding a claim is not a replacement, it is two different
 * records with an edge between them, and reading it as a replacement would drop
 * the claim out of every traversal that follows supersession.
 */
export interface EvidenceEdgeRule {
    readonly from_kind: EvidenceNodeKind;
    readonly edge_kind: EvidenceEdgeKind;
    readonly to_kind: EvidenceNodeKind;
    readonly why: string;
}
export declare const EVIDENCE_EDGE_MATRIX: readonly EvidenceEdgeRule[];
/** Whether this family defines a relation between these two kinds of node. */
export declare function isEvidenceEdgePermitted(fromKind: EvidenceNodeKind, edgeKind: EvidenceEdgeKind, toKind: EvidenceNodeKind): boolean;
/**
 * What a supporting chain is allowed to end in, and why each one ends it.
 *
 * The list is the whole content of "grounded": a claim is grounded when every
 * path out of it reaches one of these, and a study that cannot reach one has
 * written a sentence it cannot back. Three of the ten kinds do not end a chain,
 * and those three are the point of the table:
 *
 * - a `claim` is what needs grounding, so a chain that only ever reaches claims
 *   has gone in a circle however long it is;
 * - a `model_ref` is an estimator, not an observation -- "this number came out
 *   of a model" is where the question starts;
 * - a `quantity` is a number the study reports, and a reported number is
 *   grounded by what produced it. The single exception is an explicit UNKNOWN,
 *   which is the study saying it looked and did not find one: that is a
 *   complete answer, and refusing it would push producers towards inventing a
 *   number instead.
 */
export type EvidenceGroundKind = "always" | "never" | "when_unknown";
export interface EvidenceGroundRule {
    readonly node_kind: EvidenceNodeKind;
    readonly grounds: EvidenceGroundKind;
    readonly why: string;
}
export declare const EVIDENCE_GROUND_RULES: readonly EvidenceGroundRule[];
/** The grounding rule for one node kind. */
export declare function evidenceGroundRule(kind: EvidenceNodeKind): EvidenceGroundRule;
/** Whether this particular node ends a supporting chain. */
export declare function groundsAChain(node: EvidenceNode): boolean;
/**
 * A node's replaced ancestry, newest first.
 *
 * `supersedes` points from the replacement to what it replaced, so following it
 * forward walks backwards in time. The chain starts with the node asked about,
 * which is what makes "this is revision three of that figure" a single call.
 *
 * A repeated hash ends the walk. Superseding is meant to be acyclic and the
 * schema forbids the one-step cycle, but a graph assembled from several stores
 * can contain a longer one, and a traversal helper that hangs on malformed input
 * is a worse failure than one that stops. A fork -- two nodes superseding one --
 * makes this walk pick an arbitrary branch, which is why `verifyEvidenceGraph`
 * refuses one rather than leaving the ambiguity for a reader to hit.
 */
export declare function supersessionChain(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[], startHash: string): EvidenceNode[];
/**
 * The nodes that stand against this one, minus the ones already withdrawn.
 *
 * Read in both directions. A contradiction is symmetric in meaning however the
 * asserter happened to orient the edge, and a reader who is shown the objections
 * to a claim only when someone wrote them pointing the right way is being shown
 * a filtered view of the disagreement.
 *
 * A contradicting node that a later node supersedes is dropped: it was replaced,
 * and reporting a withdrawn objection alongside a live one overstates the
 * dispute exactly as much as hiding a live one understates it.
 */
export declare function contradictionSet(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[], nodeHash: string): EvidenceNode[];
/** What a claim's supporting chain was found to terminate in, if anything. */
export interface ClaimProvenanceClosure {
    claim_node_hash: string;
    grounded: boolean;
    /** The nodes that ended a path: the measured, run, cited, supplied or assumed. */
    terminals: string[];
    refusals: StudyRefusal[];
}
/**
 * Walk a claim's supporting tree and ask whether it terminates in evidence.
 *
 * One direct `supports` edge is not grounding, and treating it as grounding is
 * the failure this function exists to close: it certifies "a result supports
 * this claim" without ever asking what the result came out of, so a graph of
 * claims agreeing with each other, or a number nobody says where they got,
 * passes every local check and reads to a consumer exactly like a study whose
 * figures were measured.
 *
 * The walk is a depth-first traversal with the path on the stack, which is what
 * lets a cycle be reported as a cycle rather than silently ending a branch: a
 * `derived_from` loop and a genuine terminal both stop the walk, and only one of
 * them is an answer.
 *
 * Three things are reported separately because they need three different fixes.
 * A claim nothing points at is `CLAIM_WITHOUT_EVIDENCE_NODE` -- add evidence. A
 * claim whose every path dies is `CLAIM_NOT_GROUNDED` -- the evidence is there
 * and rests on nothing. A claim with one good path and one dead branch is
 * `CLAIM_SUPPORT_BRANCH_UNGROUNDED`, which a verdict alone would never surface,
 * because the claim as a whole is grounded and the dead branch is still in the
 * graph a reader is shown.
 */
export declare function verifyProvenanceClosure(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[], claimNodeHash: string): ClaimProvenanceClosure;
/** What a claim node actually rests on, once the graph has been walked. */
export interface ClaimEvidence {
    claim: EvidenceNode | null;
    supporting: EvidenceNode[];
    contradicting: EvidenceNode[];
    grounded: boolean;
    terminals: string[];
    refusals: StudyRefusal[];
}
/**
 * Resolve one claim into the evidence for and against it.
 *
 * `supports` is read directionally -- evidence points at the claim, never the
 * other way -- because "the claim supports the measurement" is not a statement
 * anyone means, and accepting it would let a claim manufacture its own backing.
 * Contradictions come from `contradictionSet` and are therefore symmetric; the
 * asymmetry is deliberate and is the difference between what a claim rests on
 * and what argues with it.
 *
 * `grounded` is the answer from `verifyProvenanceClosure` rather than
 * `supporting.length > 0`, so a caller that reads one field gets the real
 * question answered. A claim with three supporters, none of which rests on
 * anything, has evidence and is not grounded.
 */
export declare function resolveClaimEvidence(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[], claimNodeHash: string): ClaimEvidence;
/**
 * One claim, and what an export asserts it rests on.
 *
 * The graph already holds the edges, so this map is redundant -- and that is the
 * point. It is the export's own assertion about which evidence it believes backs
 * which claim, written down where it can be checked against the graph instead of
 * recomputed from it by every consumer with its own idea of what "supports"
 * means. The two disagreeing is a finding, not a rounding error.
 *
 * Support and contradiction are **separate fields**, and that separation is the
 * whole reason this contract exists beside the one it is meant to replace. A
 * single list called "evidence" lets a `contradicts` edge satisfy the check that
 * an entry's evidence is joined to its claim, so an objection is counted in the
 * same total as the support -- and the reader is shown "4 pieces of evidence"
 * for a claim that three things back and one thing refutes.
 *
 * `supporting_edge_hashes` is not a list of edges that exist; it is the list of
 * edges that carry *these* relations. Every supporting node must be joined to
 * this claim by an edge named here, which is what stops an entry from citing an
 * unrelated edge for a relation nothing asserts.
 */
export interface ClaimMapEntry {
    claim_node_hash: string;
    supporting_node_hashes: string[];
    contradicting_node_hashes: string[];
    supporting_edge_hashes: string[];
    contradicting_edge_hashes: string[];
}
export declare const ClaimMapEntrySchema: Contract<ClaimMapEntry>;
/**
 * Check a claim map against the graph it describes.
 *
 * The question a resolution check cannot answer is whether the graph asserts the
 * relation the map claims -- not whether *an* edge exists, and not whether *an*
 * evidence node exists, but whether the edge the entry names joins that evidence
 * to that claim. A map checked only for resolution accepts an entry that cites a
 * real claim, a real node and a real edge that have nothing to do with each
 * other: every hash opens, and nothing anywhere says that anything supports
 * anything.
 */
export declare function verifyClaimMap(entries: readonly ClaimMapEntry[], nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[]): StudyRefusal[];
/** How strictly a graph is being read, and for whom. */
export interface EvidenceGraphOptions {
    /**
     * Who the graph is being verified for. Defaults to `public`, which is the
     * strict reading: a verifier that assumed the permissive one would report a
     * graph containing private nodes as fit to publish, and the caller who most
     * needs the check is the one who did not think to ask for it.
     */
    readonly audience?: EvidenceAudience;
}
export interface EvidenceGraphVerification {
    valid: boolean;
    hashes_match: boolean;
    edges_resolve: boolean;
    edges_permitted: boolean;
    claims_grounded: boolean;
    problems: string[];
    refusals: StudyRefusal[];
}
/**
 * Recompute a graph's identities and check that it means what it says.
 *
 * Several different failures, kept apart on purpose. A node whose `content_hash`
 * no longer matches its content was edited after it was written, which the hash
 * catches. A node re-hashed after editing passes that check and fails the next
 * one: every edge that named the old hash now points at nothing, because
 * identity in this graph *is* the hash. Fabricating a study therefore means
 * rewriting the edges too, and then the study says something different in a way
 * a reader can see -- which is the whole point of content addressing the nodes.
 *
 * Beyond identity, the checks are the invariants the graph would otherwise rely
 * on everyone remembering:
 *
 * - one graph, one study, so a node smuggled in from elsewhere cannot supply
 *   evidence a reader would attribute to this one;
 * - no duplicate hashes, no duplicate edges, no self edges;
 * - every edge a relation the matrix defines;
 * - no `derived_from` or `supersedes` cycle, and no supersession fork;
 * - references that agree with each other about what they point at, and that
 *   do not file a node of this graph under some other record's kind;
 * - every claim's number resolving to a node that can carry one;
 * - every claim grounded, which is `verifyProvenanceClosure` for each of them;
 * - and, for a public audience, no private node.
 *
 * A `valid` graph is one whose parts refer to each other the way they say they
 * do. It is not a graph whose content is correct, whose numbers are right, or
 * whose claims were authorised -- none of which a hash or a traversal can
 * establish.
 */
export declare function verifyEvidenceGraph(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[], options?: EvidenceGraphOptions): EvidenceGraphVerification;
/**
 * Claims whose number does not resolve to a node that can carry one.
 *
 * Exported because it is the check an export boundary has to run *before* it
 * parses: the node schema refuses a malformed claim by throwing, which is right
 * for a parser and wrong for a caller assembling a package, who deserves a
 * refusal it can read beside the other refusals rather than an exception it has
 * to catch to find out that one sentence in its report was never established.
 *
 * The reference is the source of truth for a claim's value, which is only worth
 * anything if the thing it names actually holds a value. Three ways it does not:
 * the node is missing, the node is of a kind with no number in it, or the number
 * it holds is an explicit UNKNOWN.
 *
 * The last is the rule a claim's own parse cannot state. An unknown is not a
 * weaker claim, it is the absence of one, and it belongs in a quantity node or
 * the study's open questions rather than in a sentence someone will quote -- but
 * the value lives in another record, so whether it is known is a question about
 * the graph and is answered where the graph is.
 */
export declare function verifyClaimValues(nodes: readonly EvidenceNode[], index?: ReadonlyMap<string, EvidenceNode>): StudyRefusal[];
//# sourceMappingURL=evidence.d.ts.map