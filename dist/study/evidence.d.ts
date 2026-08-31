import { z } from "zod";
import { type Citation } from "../contracts/common.js";
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
 * comparator and a `Quantity`, wired by edges to the results, inputs, models and
 * sources it rests on. A reader can walk from the sentence to the number to the
 * run that produced it without trusting anyone's summary, and an export can
 * refuse -- not warn -- when that walk does not terminate.
 *
 * Three decisions carry most of the weight.
 *
 * **One kind, one payload.** A node declares its kind and carries exactly the
 * block that kind means; every other block is null, and the refinement below
 * enforces both directions. A single object with a discriminating field is the
 * shape the intelligence tier already uses, and it keeps the generated JSON
 * Schema readable, but the pairing has to be checked explicitly or a `claim`
 * node could quietly carry a measurement that no reader would know how to read.
 *
 * **A claim cannot be UNKNOWN.** Everywhere else in this family an absent number
 * is first-class and says so. An assertion is the exception: "we claim the qubit
 * count is unknown" is not a claim, it is an open question, and it belongs in a
 * `quantity` node or the specification's open questions. Refused at parse.
 *
 * **Validation state is not a field.** Whether a node has been reviewed,
 * reproduced or disputed changes over time; the node does not. Badges are
 * derived at display time from the edges pointing at a node, so nothing that
 * moves can move a hash (ADR 0014 §1).
 */
export declare const EvidenceNodeKindSchema: z.ZodEnum<["claim", "quantity", "input", "model_ref", "result", "source", "dataset_ref", "snapshot_ref"]>;
export type EvidenceNodeKind = z.infer<typeof EvidenceNodeKindSchema>;
export declare const EvidenceEdgeKindSchema: z.ZodEnum<["derived_from", "used_model", "used_input", "supports", "contradicts", "supersedes", "reproduces", "reviewed_by"]>;
export type EvidenceEdgeKind = z.infer<typeof EvidenceEdgeKindSchema>;
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
 * What one claim node asserts, in a form a machine can check.
 *
 * Prose was the alternative, and prose cannot be compared with a later run,
 * contradicted by a second study, or refused for lacking evidence. Four fields
 * are the price of a claim that can be argued with.
 */
export interface ClaimStatement {
    subject: string;
    metric: string;
    comparator: ClaimComparator;
    value: Quantity;
}
export declare const ClaimStatementSchema: Contract<ClaimStatement>;
/**
 * How a node points at a record outside the graph.
 *
 * Both naming schemes in this repository are accepted because both are in use:
 * registry records are named by slug, and content-addressed records -- study
 * revisions, bundles, capsules -- by their 64-hex hash. What is not accepted is
 * neither, which would be a node claiming to reference something without saying
 * what.
 */
export interface EvidenceReference {
    record_kind: string;
    hash: string | null;
    record_slug: string | null;
}
export declare const EvidenceReferenceSchema: Contract<EvidenceReference>;
export interface EvidenceNode {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    kind: EvidenceNodeKind;
    label: string;
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
 * A node's replaced ancestry, newest first.
 *
 * `supersedes` points from the replacement to what it replaced, so following it
 * forward walks backwards in time. The chain starts with the node asked about,
 * which is what makes "this is revision three of that figure" a single call.
 *
 * A repeated hash ends the walk. Superseding is meant to be acyclic and the
 * schema forbids the one-step cycle, but a graph assembled from several stores
 * can contain a longer one, and a traversal helper that hangs on malformed input
 * is a worse failure than one that stops.
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
/** What a claim node actually rests on, once the graph has been walked. */
export interface ClaimEvidence {
    claim: EvidenceNode | null;
    supporting: EvidenceNode[];
    contradicting: EvidenceNode[];
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
 * A claim with nothing behind it produces `CLAIM_WITHOUT_EVIDENCE_NODE`. That is
 * the refusal the research-package export is built on: a number in a table with
 * no node under it does not become a footnote, it stops the export.
 */
export declare function resolveClaimEvidence(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[], claimNodeHash: string): ClaimEvidence;
export interface EvidenceGraphVerification {
    valid: boolean;
    hashes_match: boolean;
    edges_resolve: boolean;
    problems: string[];
    refusals: StudyRefusal[];
}
/**
 * Recompute a graph's identities and check that it joins up.
 *
 * Two different failures, kept apart on purpose. A node whose `content_hash` no
 * longer matches its content was edited after it was written, which the hash
 * catches. A node re-hashed after editing passes that check and fails this one:
 * every edge that named the old hash now points at nothing, because identity in
 * this graph *is* the hash. Fabricating a study therefore means rewriting the
 * edges too, and then the study says something different in a way a reader can
 * see -- which is the whole point of content addressing the nodes.
 */
export declare function verifyEvidenceGraph(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[]): EvidenceGraphVerification;
//# sourceMappingURL=evidence.d.ts.map