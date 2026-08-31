import { z } from "zod";
import { isKnown } from "../intelligence/measurement.js";
import { ContentHashSchema, StudyCitationSchema, StudyQuantitySchema } from "./common.js";
import { calculateStudyHash, STUDY_HASH_RULES_ID } from "./hashing.js";
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
export const EvidenceNodeKindSchema = z.enum([
    /** An assertion someone will quote. Carries a machine-readable claim. */
    "claim",
    /** A number in the study, envelope and all. The one place UNKNOWN is representable. */
    "quantity",
    /** An input a run consumed. */
    "input",
    /** The model or estimator a result came out of. */
    "model_ref",
    /** A produced result record. */
    "result",
    /** A citation: the literature a figure was taken from. */
    "source",
    /** A dataset the study read. */
    "dataset_ref",
    /** A hardware or parameter snapshot, pinned at a date. */
    "snapshot_ref",
]);
export const EvidenceEdgeKindSchema = z.enum([
    "derived_from",
    "used_model",
    "used_input",
    "supports",
    "contradicts",
    "supersedes",
    "reproduces",
    "reviewed_by",
]);
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
export const ClaimComparatorSchema = z.enum([
    "LESS_THAN",
    "AT_MOST",
    "EQUAL",
    "AT_LEAST",
    "GREATER_THAN",
]);
export const ClaimStatementSchema = z
    .object({
    /** What the claim is about: a workload or scenario name, or a reference to one. */
    subject: z.string().min(1),
    /** Which quantity of the subject is being claimed: "total_physical_qubits", "runtime". */
    metric: z.string().min(1),
    comparator: ClaimComparatorSchema,
    value: StudyQuantitySchema,
})
    .strict()
    .superRefine((claim, context) => {
    if (!isKnown(claim.value)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A claim must assert a known value (CLAIM_VALUE_UNKNOWN). An unknown is not a weaker claim, it is the " +
                "absence of one, and it belongs in a quantity node or the study's open questions rather than in a " +
                "sentence someone will quote.",
            path: ["value"],
        });
    }
});
export const EvidenceReferenceSchema = z
    .object({
    /** Which kind of record is on the other end: "benchmark_result", "execution_capsule". */
    record_kind: z.string().min(1),
    hash: ContentHashSchema.nullable(),
    /**
     * Deliberately not named `slug`. `slug` is an excluded key, and the canonicalizer drops
     * excluded keys at every nesting level -- so a field named `slug` here would vanish from
     * the node's own hash, and two nodes referencing different registry records would be
     * content-addressed identically. The name carries the invariant.
     */
    record_slug: z.string().min(1).nullable(),
})
    .strict()
    .superRefine((reference, context) => {
    if (reference.hash === null && reference.record_slug === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A reference must name what it points at, by content hash or by registry slug. A reference to nothing " +
                "reads in a report exactly like a reference to something.",
            path: ["hash"],
        });
    }
});
const EVIDENCE_PAYLOAD_KEYS = ["claim", "quantity", "reference", "citation"];
/**
 * Which block each kind of node must carry, and by omission which it must not.
 *
 * Written as a table rather than as a chain of conditions so that adding a node
 * kind is a compile error until this map answers for it -- `Record` over the
 * enum has no default case to fall through.
 */
const NODE_PAYLOAD_KEY = {
    claim: "claim",
    quantity: "quantity",
    input: "reference",
    model_ref: "reference",
    result: "reference",
    source: "citation",
    dataset_ref: "reference",
    snapshot_ref: "reference",
};
export const EvidenceNodeSchema = z
    .object({
    schema_version: z.string().min(1),
    /** Required, never inferred: a record that does not name its rules is refused. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: ContentHashSchema,
    kind: EvidenceNodeKindSchema,
    /** What a reader sees in a table cell or a graph vertex. */
    label: z.string().min(1),
    claim: ClaimStatementSchema.nullable(),
    /** The one place an UNKNOWN value belongs: a number the study looked for and did not find. */
    quantity: StudyQuantitySchema.nullable(),
    reference: EvidenceReferenceSchema.nullable(),
    citation: StudyCitationSchema.nullable(),
    /** What this node does not account for. Travels with the node, not with the report. */
    limitations: z.array(z.string().min(1)),
    /** ISO date the underlying source was published, where there is one. */
    source_published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** ISO date it was read. Distinct from publication: a page can change after it is cited. */
    retrieved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** Excluded from the hash by name, at every level, like every other timestamp in this repository. */
    created_at: z.string().datetime({ offset: true }).optional(),
    /** A node's identity is the hash of its content. Excluded from its own digest. */
    content_hash: ContentHashSchema,
})
    .strict()
    .superRefine((node, context) => {
    const required = NODE_PAYLOAD_KEY[node.kind];
    for (const key of EVIDENCE_PAYLOAD_KEYS) {
        const present = node[key] !== null;
        if (key === required && !present) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `A ${node.kind} node must carry its ${key} block. The payload is what the node says; a node of this ` +
                    "kind without one is a label with nothing behind it, and it would still render as a graph vertex.",
                path: [key],
            });
        }
        if (key !== required && present) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `A ${node.kind} node must leave ${key} null; a ${node.kind} node carries ${required}. One kind, one ` +
                    "payload -- a node with two would be read as an assertion by one consumer and as a measurement by " +
                    "another, and both would be quoting it.",
                path: [key],
            });
        }
    }
});
export const EvidenceEdgeSchema = z
    .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: ContentHashSchema,
    kind: EvidenceEdgeKindSchema,
    /** Endpoints are content hashes: an edge survives being moved between stores. */
    from_node_hash: ContentHashSchema,
    to_node_hash: ContentHashSchema,
    /**
     * Who asserted this relation. A free string, deliberately: nothing here is
     * signed, and a field shaped like an identity would suggest otherwise
     * (ADR 0014 §3).
     */
    asserted_by: z.string().min(1),
    /**
     * Why the relation holds. Required, because an edge is where a study says
     * "this supports that" -- an unevidenced edge is an assertion wearing the
     * clothes of structure, and the basis is exactly what a reviewer needs.
     */
    rationale: z.string().min(1),
    created_at: z.string().datetime({ offset: true }).optional(),
    content_hash: ContentHashSchema,
})
    .strict()
    .superRefine((edge, context) => {
    if (edge.from_node_hash === edge.to_node_hash) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An edge must join two different nodes. A node that supports, contradicts or supersedes itself would " +
                "close every traversal in this module into a loop, and it asserts nothing.",
            path: ["to_node_hash"],
        });
    }
});
function nodesByHash(nodes) {
    const index = new Map();
    for (const node of nodes) {
        if (!index.has(node.content_hash))
            index.set(node.content_hash, node);
    }
    return index;
}
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
export function supersessionChain(nodes, edges, startHash) {
    const index = nodesByHash(nodes);
    const chain = [];
    const seen = new Set();
    let current = startHash;
    while (index.has(current) && !seen.has(current)) {
        seen.add(current);
        chain.push(index.get(current));
        const next = edges.find((edge) => edge.kind === "supersedes" && edge.from_node_hash === current);
        if (!next)
            break;
        current = next.to_node_hash;
    }
    return chain;
}
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
export function contradictionSet(nodes, edges, nodeHash) {
    const index = nodesByHash(nodes);
    const superseded = new Set(edges.filter((edge) => edge.kind === "supersedes").map((edge) => edge.to_node_hash));
    const found = [];
    const seen = new Set();
    for (const edge of edges) {
        if (edge.kind !== "contradicts")
            continue;
        const other = edge.from_node_hash === nodeHash
            ? edge.to_node_hash
            : edge.to_node_hash === nodeHash
                ? edge.from_node_hash
                : null;
        if (other === null || seen.has(other) || superseded.has(other))
            continue;
        const node = index.get(other);
        if (!node)
            continue;
        seen.add(other);
        found.push(node);
    }
    return found;
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
export function resolveClaimEvidence(nodes, edges, claimNodeHash) {
    const index = nodesByHash(nodes);
    const claim = index.get(claimNodeHash) ?? null;
    const refusals = [];
    if (claim === null) {
        refusals.push({
            subject: claimNodeHash,
            code: "EVIDENCE_NODE_UNRESOLVED",
            message: "The graph does not carry the claim node this hash names, so nothing can be said about what supports it.",
        });
        return { claim: null, supporting: [], contradicting: [], refusals };
    }
    const supporting = [];
    for (const edge of edges) {
        if (edge.kind !== "supports" || edge.to_node_hash !== claimNodeHash)
            continue;
        const source = index.get(edge.from_node_hash);
        if (!source) {
            refusals.push({
                subject: edge.content_hash,
                code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                message: `A supports edge names ${edge.from_node_hash} as its evidence, and the graph does not carry that node. ` +
                    "An edge to a missing node is indistinguishable from support in a rendered graph.",
            });
            continue;
        }
        supporting.push(source);
    }
    if (supporting.length === 0) {
        refusals.push({
            subject: claim.label,
            code: "CLAIM_WITHOUT_EVIDENCE_NODE",
            message: "This claim has no evidence node supporting it. A claim that cannot be walked back to a result, a source " +
                "or a measurement is an assertion, and this family does not export assertions as findings.",
        });
    }
    return { claim, supporting, contradicting: contradictionSet(nodes, edges, claimNodeHash), refusals };
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
export function verifyEvidenceGraph(nodes, edges) {
    const problems = [];
    const refusals = [];
    const present = new Set();
    let hashesMatch = true;
    for (const node of nodes) {
        const expected = calculateStudyHash(node);
        if (expected !== node.content_hash) {
            hashesMatch = false;
            problems.push(`Node '${node.label}' claims content hash ${node.content_hash} and its own contents canonicalize to ${expected}.`);
        }
        if (present.has(node.content_hash)) {
            problems.push(`Node hash ${node.content_hash} appears twice. A node is identified by its content, so one list entry is ` +
                "one node however many times it was copied in.");
        }
        present.add(node.content_hash);
    }
    for (const edge of edges) {
        const expected = calculateStudyHash(edge);
        if (expected !== edge.content_hash) {
            hashesMatch = false;
            problems.push(`Edge ${edge.content_hash} (${edge.kind}) canonicalizes to ${expected}; its recorded hash does not match ` +
                "what it says.");
        }
    }
    let edgesResolve = true;
    for (const edge of edges) {
        for (const [side, hash] of [
            ["from_node_hash", edge.from_node_hash],
            ["to_node_hash", edge.to_node_hash],
        ]) {
            if (present.has(hash))
                continue;
            edgesResolve = false;
            refusals.push({
                subject: edge.content_hash,
                code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                message: `The ${edge.kind} edge names ${hash} as its ${side}, and no node in this graph has that hash.`,
            });
            problems.push(`Edge ${edge.content_hash} (${edge.kind}) has an unresolved ${side}: ${hash}.`);
        }
    }
    return {
        valid: problems.length === 0,
        hashes_match: hashesMatch,
        edges_resolve: edgesResolve,
        problems,
        refusals,
    };
}
//# sourceMappingURL=evidence.js.map