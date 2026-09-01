import { z } from "zod";
import { isKnown } from "../intelligence/measurement.js";
import { ContentHashSchema, StudyCitationSchema, StudyQuantitySchema } from "./common.js";
import { studySelfHash } from "./hash.js";
import { StudyIdSchema } from "./identity.js";
import { STUDY_HASH_RULES_ID } from "./rules.js";
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
export const EvidenceVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
/** Which audience a graph is being verified for. */
export const EvidenceAudienceSchema = z.enum(["public", "internal"]);
export const EvidenceNodeKindSchema = z.enum([
    /** An assertion someone will quote. Carries a machine-readable claim. */
    "claim",
    /** A number in the study, envelope and all. The one place UNKNOWN is representable. */
    "quantity",
    /** A value the study assumed rather than established, stated so it can be argued with. */
    "assumption",
    /** An input a run consumed. */
    "input",
    /** The model or estimator a result came out of. */
    "model_ref",
    /** A produced result record. */
    "result",
    /** The execution capsule a run happened under. */
    "capsule_ref",
    /** A citation: the literature a figure was taken from. */
    "source",
    /** A dataset the study read. */
    "dataset_ref",
    /** A hardware or parameter snapshot, pinned at a date. */
    "snapshot_ref",
]);
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
export const EvidenceEdgeKindSchema = z.enum([
    "derived_from",
    "used_model",
    "used_input",
    "supports",
    "contradicts",
    "supersedes",
]);
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
export const EVIDENCE_RECORD_KIND_VOCABULARY_VERSION = "evidence-record-kinds-v1";
export const EvidenceRecordKindSchema = z.enum([
    // The registry's own records.
    "artifact",
    "benchmark_suite",
    "qec_experiment_manifest",
    "algorithm_experiment_manifest",
    "protocol_experiment_manifest",
    "qec_benchmark_result",
    "algorithm_benchmark_result",
    "protocol_benchmark_result",
    "reproducibility_bundle",
    "verification_evidence",
    // Resource intelligence (ketqat-sdk#236).
    "quantum_workload",
    "classical_baseline",
    "resource_scenario",
    "hardware_model_snapshot",
    "qec_model_snapshot",
    "economic_model",
    "resource_estimate_snapshot",
    "advantage_threshold",
    "decision_assessment",
    "resource_intelligence_bundle",
    // The study family itself. A study may cite its own records, and an evidence
    // node citing another evidence node is how one study's graph refers to
    // another's.
    //
    // `study_task` was a member and is not one now: the record it named no longer
    // exists, having been split into the authorization, the job, the outcome and
    // the capsule. The vocabulary version is unchanged rather than bumped, on the
    // evidence ADR 0015 records for `study-v1` itself -- nothing has been
    // published under it, so no stored reference names a kind this list has
    // dropped. Had one existed, this would have been v2 and the old member would
    // have stayed readable. The job is deliberately absent: it is control-plane
    // state and is not content-addressed, so there is no hash for a reference to
    // name.
    "study",
    "study_event",
    "problem_specification",
    "study_plan",
    "confirmation_receipt",
    "study_task_authorization",
    "task_outcome",
    "evidence_node",
    "evidence_edge",
    "execution_capsule",
    "research_package",
    "review_record",
    "reproduction_record",
]).describe(
// Carried into the emitted JSON Schema, which is where a reader who has the
// file and not this module finds out which list a record was written against.
// A vocabulary whose version nothing states is a vocabulary that has silently
// changed the day it grows.
`Record kinds an evidence reference may name, vocabulary ${EVIDENCE_RECORD_KIND_VOCABULARY_VERSION}.`);
export const EVIDENCE_RECORD_KINDS = Object.freeze([
    ...EvidenceRecordKindSchema.options,
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
export const EvidenceReferenceSchema = z
    .object({
    /** Which kind of record is on the other end, from the versioned vocabulary above. */
    record_kind: EvidenceRecordKindSchema,
    hash: ContentHashSchema.nullable(),
    /**
     * A human-readable label for the record on the other end, and `RECORD_ONLY`:
     * a slug may be renamed without the reference changing what it points at,
     * which is what `hash` beside it is for.
     *
     * It is not named `slug`, and the name is not what protects it: a field's
     * class is a fact about the field rather than about its spelling, so the
     * binding would survive whatever this were called.
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
export const ClaimValueRefKindSchema = z.enum(["value_node", "result_field"]);
export const ClaimValueRefSchema = z
    .object({
    kind: ClaimValueRefKindSchema,
    /** The node the value is read from. Always a node in the same graph. */
    node_hash: ContentHashSchema,
    /**
     * Which field of the referenced record carries the number, for a
     * `result_field` reference. A slash-separated path, one spelling per field:
     * no leading slash, no empty segments, for the reason `values.ts` gives
     * about numbers -- two spellings of one path are two records to a digest.
     */
    field_path: z
        .string()
        .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/)
        .nullable(),
})
    .strict()
    .superRefine((reference, context) => {
    if (reference.kind === "result_field" && reference.field_path === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A result_field reference must say which field of the result carries the number. Without one it names a " +
                "record and leaves the reader to guess which of its numbers the claim is about.",
            path: ["field_path"],
        });
    }
    if (reference.kind === "value_node" && reference.field_path !== null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A value_node reference reads the node's own value, so there is no field to name. A path beside it would " +
                "be a second reading of the same reference, and two readings are what this field exists to prevent.",
            path: ["field_path"],
        });
    }
});
export const ClaimStatementSchema = z
    .object({
    /**
     * What the claim is about, as a reference rather than a name.
     *
     * A workload named `"shor-2048"` in one study and `"Shor 2048"` in another
     * is two subjects to every machine and one to every reader, and a claim
     * whose subject is a display string cannot be joined to the workload record
     * it is about. The reference may still carry the slug -- that is what
     * `record_slug` is for -- but it has to say which record the slug names.
     */
    subject_ref: EvidenceReferenceSchema,
    /** Which quantity of the subject is being claimed: "total_physical_qubits", "runtime". */
    metric: z.string().min(1),
    comparator: ClaimComparatorSchema,
    value_ref: ClaimValueRefSchema,
})
    .strict();
const EVIDENCE_PAYLOAD_KEYS = ["claim", "quantity", "reference", "citation"];
/**
 * Which block each kind of node must carry, and by omission which it must not.
 *
 * Written as a table rather than as a chain of conditions so that adding a node
 * kind is a compile error until this map answers for it -- `Record` over the
 * enum has no default case to fall through.
 *
 * `assumption` and `quantity` share the `quantity` payload and are still two
 * kinds, because the envelope says how confident the number is and not who is
 * answerable for it being there at all. An assumed 0.1% error rate and a
 * measured one are the same shape and are not the same evidence, and the
 * grounding table below treats them differently.
 */
const NODE_PAYLOAD_KEY = {
    claim: "claim",
    quantity: "quantity",
    assumption: "quantity",
    input: "reference",
    model_ref: "reference",
    result: "reference",
    capsule_ref: "reference",
    source: "citation",
    dataset_ref: "reference",
    snapshot_ref: "reference",
};
/**
 * The node kinds whose name pins exactly one record kind on the other end.
 *
 * Only one does. `capsule_ref` names the execution capsule contract and nothing
 * else, so a `capsule_ref` node whose reference is filed under a benchmark
 * result is a pointer that will not open. The other reference-carrying kinds
 * name a *class* of record -- a model, a dataset, an input -- and pinning each
 * to a list would refuse legitimate references the day a new contract is added,
 * which is a worse failure than the check being absent: a wrong refusal stops a
 * true study, and there is no way for its author to tell the difference from a
 * bug.
 *
 * What guards the rest is the vocabulary on `record_kind` and the agreement
 * check in `verifyEvidenceGraph`, which are checks about what a reference says
 * rather than guesses about what it should have said.
 */
const NODE_REFERENCE_RECORD_KIND = {
    capsule_ref: "execution_capsule",
};
export const EvidenceNodeSchema = z
    .object({
    schema_version: z.string().min(1),
    /** Required, never inferred: a record that does not name its rules is refused. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    kind: EvidenceNodeKindSchema,
    /** What a reader sees in a table cell or a graph vertex. */
    label: z.string().min(1),
    /**
     * Who this node may be shown to. Required rather than defaulted: a node that
     * does not say is a node somebody has to decide about later, and the later
     * decision is made by an exporter with no idea what is in it.
     */
    visibility: EvidenceVisibilitySchema,
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
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it says. */
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
    // An assumption is a number the study chose to proceed on. "We assume the
    // error rate is unknown" is not an assumption, it is the absence of one,
    // and it grounds a claim in this family -- so it is refused here rather
    // than allowed to terminate a provenance walk with nothing in it.
    if (node.kind === "assumption" && node.quantity !== null && !isKnown(node.quantity)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An assumption must state the value it assumes. An UNKNOWN belongs in a quantity node, which is the kind " +
                "that means 'the study looked and did not find it' -- an assumption node with no number ends a " +
                "provenance chain in nothing while reading as though the study had decided something.",
            path: ["quantity"],
        });
    }
    const pinned = NODE_REFERENCE_RECORD_KIND[node.kind];
    if (pinned !== undefined && node.reference !== null && node.reference.record_kind !== pinned) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${node.kind} node references a ${pinned}; this one names a ${node.reference.record_kind}. The node ` +
                "kind is what tells a reader how to open the record on the other end, and a pointer that will not open " +
                "renders in a graph exactly like one that will.",
            path: ["reference", "record_kind"],
        });
    }
});
export const EvidenceEdgeSchema = z
    .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
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
const ASSERTION_KINDS = ["claim", "quantity", "result", "source"];
const EVIDENCE_EDGE_ROWS = [
    {
        edge_kind: "derived_from",
        from_kind: "result",
        to_kinds: ["capsule_ref", "result", "dataset_ref", "snapshot_ref", "input"],
        why: "a result is computed from the run that produced it and the material that run read",
    },
    {
        edge_kind: "derived_from",
        from_kind: "quantity",
        to_kinds: ["result", "capsule_ref", "quantity", "dataset_ref"],
        why: "a reported number comes out of a result, a run, or arithmetic over other numbers",
    },
    {
        edge_kind: "used_model",
        from_kind: "result",
        to_kinds: ["model_ref"],
        why: "a result produced by a model names the model, so two runs of two models are not compared as one",
    },
    {
        edge_kind: "used_model",
        from_kind: "quantity",
        to_kinds: ["model_ref"],
        why: "an estimated number names its estimator for the same reason",
    },
    {
        edge_kind: "used_input",
        from_kind: "result",
        to_kinds: ["input", "dataset_ref", "snapshot_ref", "quantity", "assumption"],
        why: "what the run consumed, including the assumptions it proceeded on",
    },
    {
        edge_kind: "used_input",
        from_kind: "quantity",
        to_kinds: ["input", "dataset_ref", "snapshot_ref", "quantity", "assumption"],
        why: "what a computed number was computed over",
    },
    {
        edge_kind: "supports",
        from_kind: "claim",
        to_kinds: ["claim"],
        why: "one claim may rest on another; closure is what checks that the chain reaches something measured",
    },
    {
        edge_kind: "supports",
        from_kind: "quantity",
        to_kinds: ["claim"],
        why: "the ordinary case: the number the sentence is about",
    },
    {
        edge_kind: "supports",
        from_kind: "assumption",
        to_kinds: ["claim"],
        why: "a claim that holds under a stated assumption says so in the graph, not in a caption",
    },
    {
        edge_kind: "supports",
        from_kind: "result",
        to_kinds: ["claim"],
        why: "the run the claim is read out of",
    },
    {
        edge_kind: "supports",
        from_kind: "capsule_ref",
        to_kinds: ["claim"],
        why: "a claim about a run itself -- that it completed, that it was deterministic",
    },
    {
        edge_kind: "supports",
        from_kind: "source",
        to_kinds: ["claim"],
        why: "the literature a figure was taken from",
    },
    {
        edge_kind: "supports",
        from_kind: "dataset_ref",
        to_kinds: ["claim"],
        why: "a claim about data the study read rather than produced",
    },
    {
        edge_kind: "supports",
        from_kind: "snapshot_ref",
        to_kinds: ["claim"],
        why: "a claim resting on device or model parameters as they stood on a date",
    },
    {
        edge_kind: "supports",
        from_kind: "input",
        to_kinds: ["claim"],
        why: "a claim about what the user supplied, which is the user's fact rather than the study's",
    },
    {
        edge_kind: "supports",
        from_kind: "model_ref",
        to_kinds: ["claim"],
        why: "a claim about the model itself -- its scope, its validity range",
    },
    ...ASSERTION_KINDS.map((fromKind) => ({
        edge_kind: "contradicts",
        from_kind: fromKind,
        to_kinds: ASSERTION_KINDS,
        why: "two records that assert incompatible things about the world; a model or a dataset asserts nothing to disagree with",
    })),
    ...EvidenceNodeKindSchema.options.map((kind) => ({
        edge_kind: "supersedes",
        from_kind: kind,
        to_kinds: [kind],
        why: "a newer record of the same kind replaces an older one",
    })),
];
export const EVIDENCE_EDGE_MATRIX = Object.freeze(EVIDENCE_EDGE_ROWS.flatMap((row) => row.to_kinds.map((toKind) => Object.freeze({
    from_kind: row.from_kind,
    edge_kind: row.edge_kind,
    to_kind: toKind,
    why: row.why,
}))));
/**
 * The working lookup, module-private and built from the frozen tuple.
 *
 * A `Set` handed to a consumer is a rule set that consumer can edit, and
 * `Object.freeze` does not stop it -- the reason `limits.ts` gives for exporting
 * rules as plain data and keeping the structures that make lookups cheap inside
 * the module.
 *
 * The key is separated by a byte that cannot occur in an enum member, so
 * `("a", "b_c", "d")` and `("a_b", "c", "d")` cannot collide into one rule.
 */
const permittedEdges = new Set(EVIDENCE_EDGE_MATRIX.map((rule) => `${rule.from_kind}\u0000${rule.edge_kind}\u0000${rule.to_kind}`));
/** Whether this family defines a relation between these two kinds of node. */
export function isEvidenceEdgePermitted(fromKind, edgeKind, toKind) {
    return permittedEdges.has(`${fromKind}\u0000${edgeKind}\u0000${toKind}`);
}
export const EVIDENCE_GROUND_RULES = Object.freeze([
    Object.freeze({
        node_kind: "claim",
        grounds: "never",
        why: "a claim is the thing being grounded; a chain of them establishes agreement, not evidence",
    }),
    Object.freeze({
        node_kind: "quantity",
        grounds: "when_unknown",
        why: "a reported number is grounded by what produced it, unless it is the explicit absence of one",
    }),
    Object.freeze({
        node_kind: "assumption",
        grounds: "always",
        why: "an explicitly modelled assumption: stated, arguable, and not presented as a measurement",
    }),
    Object.freeze({
        node_kind: "input",
        grounds: "always",
        why: "a user-provided input is the user's fact about their own situation",
    }),
    Object.freeze({
        node_kind: "model_ref",
        grounds: "never",
        why: "a model produces numbers; naming it is where the question of where a number came from begins",
    }),
    Object.freeze({
        node_kind: "result",
        grounds: "always",
        why: "a measured result is an observation with a record behind it",
    }),
    Object.freeze({
        node_kind: "capsule_ref",
        grounds: "always",
        why: "an execution capsule is the run itself, with its seed, versions and environment",
    }),
    Object.freeze({
        node_kind: "source",
        grounds: "always",
        why: "a primary source is somebody else's measurement, cited rather than restated",
    }),
    Object.freeze({
        node_kind: "dataset_ref",
        grounds: "always",
        why: "a dataset version is material that exists independently of this study",
    }),
    Object.freeze({
        node_kind: "snapshot_ref",
        grounds: "always",
        why: "a snapshot is a dated observation of parameters, which is a dataset version by another name",
    }),
]);
const groundRuleByKind = new Map(EVIDENCE_GROUND_RULES.map((rule) => [rule.node_kind, rule]));
/** The grounding rule for one node kind. */
export function evidenceGroundRule(kind) {
    const rule = groundRuleByKind.get(kind);
    if (rule === undefined) {
        throw new Error(`No grounding rule is declared for evidence node kind ${JSON.stringify(kind)}.`);
    }
    return rule;
}
/** Whether this particular node ends a supporting chain. */
export function groundsAChain(node) {
    const rule = evidenceGroundRule(node.kind);
    if (rule.grounds === "always")
        return true;
    if (rule.grounds === "never")
        return false;
    return node.quantity !== null && !isKnown(node.quantity);
}
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
 * is a worse failure than one that stops. A fork -- two nodes superseding one --
 * makes this walk pick an arbitrary branch, which is why `verifyEvidenceGraph`
 * refuses one rather than leaving the ambiguity for a reader to hit.
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
 * The edges a provenance walk follows out of one node.
 *
 * From a claim, the walk goes *backwards* along `supports`: evidence points at
 * the claim, so the things a claim rests on are the sources of its incoming
 * edges. From anything else it goes forwards along `derived_from` and
 * `used_input`, which are the two relations that say where content came from.
 *
 * `used_model` is deliberately not followed. A `model_ref` never grounds a
 * chain, so following it can only add steps that end in nothing -- and reporting
 * a model as an ungrounded branch would turn every honestly-modelled figure into
 * a finding.
 */
const PROVENANCE_EDGE_KINDS = ["derived_from", "used_input"];
function provenanceParents(node, edges) {
    if (node.kind === "claim") {
        return edges
            .filter((edge) => edge.kind === "supports" && edge.to_node_hash === node.content_hash)
            .map((edge) => ({ hash: edge.from_node_hash, via: edge }));
    }
    return edges
        .filter((edge) => PROVENANCE_EDGE_KINDS.includes(edge.kind) && edge.from_node_hash === node.content_hash)
        .map((edge) => ({ hash: edge.to_node_hash, via: edge }));
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
export function verifyProvenanceClosure(nodes, edges, claimNodeHash) {
    const index = nodesByHash(nodes);
    const refusals = [];
    const claim = index.get(claimNodeHash);
    if (claim === undefined) {
        refusals.push({
            subject: claimNodeHash,
            code: "EVIDENCE_NODE_UNRESOLVED",
            message: "The graph does not carry the claim node this hash names, so nothing can be said about what grounds it.",
        });
        return { claim_node_hash: claimNodeHash, grounded: false, terminals: [], refusals };
    }
    if (claim.kind !== "claim") {
        refusals.push({
            subject: claim.label,
            code: "EVIDENCE_NODE_KIND_MISMATCH",
            message: `Closure was asked about node ${claimNodeHash}, which is a ${claim.kind} node rather than a claim. Only a ` +
                "claim has a supporting tree to walk; asking the question of anything else returns an answer about a " +
                "question nobody asked.",
        });
        return { claim_node_hash: claimNodeHash, grounded: false, terminals: [], refusals };
    }
    const terminals = new Set();
    const groundedByHash = new Map();
    const reportedBranches = new Set();
    const reportedCycles = new Set();
    const walk = (hash, path) => {
        if (path.includes(hash)) {
            const key = [...path.slice(path.indexOf(hash)), hash].join(">");
            if (!reportedCycles.has(key)) {
                reportedCycles.add(key);
                refusals.push({
                    subject: claim.label,
                    code: "EVIDENCE_GRAPH_CYCLE",
                    message: `Following what this claim rests on returns to node ${hash}. Provenance that comes back to where it ` +
                        "started is not deep, it is unanswerable: every node in the loop is grounded by the others and none " +
                        "of them by anything outside it.",
                });
            }
            return false;
        }
        const memo = groundedByHash.get(hash);
        if (memo !== undefined)
            return memo;
        const node = index.get(hash);
        if (node === undefined) {
            // The endpoint refusal itself belongs to `verifyEvidenceGraph`, which
            // reports every unresolved endpoint once. Here the missing node is only a
            // path that cannot be walked, and the claim is ungrounded along it.
            groundedByHash.set(hash, false);
            return false;
        }
        if (hash !== claimNodeHash && groundsAChain(node)) {
            terminals.add(hash);
            groundedByHash.set(hash, true);
            return true;
        }
        const parents = provenanceParents(node, edges);
        if (parents.length === 0) {
            if (!reportedBranches.has(hash) && hash !== claimNodeHash) {
                reportedBranches.add(hash);
                refusals.push({
                    subject: claim.label,
                    code: "CLAIM_SUPPORT_BRANCH_UNGROUNDED",
                    message: `The ${node.kind} node '${node.label}' is offered in support of this claim and rests on nothing: no ` +
                        "edge says where its content came from. A branch that ends here is a reason the study wrote down and " +
                        "did not follow, and it is shown to a reader beside the branches it did.",
                });
            }
            groundedByHash.set(hash, false);
            return false;
        }
        const nextPath = [...path, hash];
        let grounded = false;
        for (const parent of parents) {
            // Every branch is walked, not just enough of them to answer: a claim can
            // be grounded through one parent and rest on a dead end through another,
            // and short-circuiting would hide exactly the branch a reader should see.
            if (walk(parent.hash, nextPath))
                grounded = true;
        }
        groundedByHash.set(hash, grounded);
        return grounded;
    };
    const supporting = provenanceParents(claim, edges);
    if (supporting.length === 0) {
        refusals.push({
            subject: claim.label,
            code: "CLAIM_WITHOUT_EVIDENCE_NODE",
            message: "This claim has no evidence node supporting it. A claim that cannot be walked back to a result, a source " +
                "or a measurement is an assertion, and this family does not export assertions as findings.",
        });
        return { claim_node_hash: claimNodeHash, grounded: false, terminals: [], refusals };
    }
    const grounded = walk(claimNodeHash, []);
    if (!grounded) {
        refusals.push({
            subject: claim.label,
            code: "CLAIM_NOT_GROUNDED",
            message: "Every path out of this claim ends in another claim, in a number nobody says where they got, or in " +
                "nothing at all. A supporting chain has to reach something that was measured, run, cited, supplied or " +
                "explicitly assumed -- or an explicit UNKNOWN, which at least says so. Support that never lands is what " +
                "a reader cannot see and would most want to.",
        });
    }
    return {
        claim_node_hash: claimNodeHash,
        grounded,
        terminals: [...terminals].sort(),
        refusals,
    };
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
        return {
            claim: null,
            supporting: [],
            contradicting: [],
            grounded: false,
            terminals: [],
            refusals,
        };
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
    const closure = verifyProvenanceClosure(nodes, edges, claimNodeHash);
    refusals.push(...closure.refusals);
    return {
        claim,
        supporting,
        contradicting: contradictionSet(nodes, edges, claimNodeHash),
        grounded: closure.grounded,
        terminals: closure.terminals,
        refusals,
    };
}
export const ClaimMapEntrySchema = z
    .object({
    claim_node_hash: ContentHashSchema,
    /** At least one: an entry with an empty list is the absence this family refuses. */
    supporting_node_hashes: z.array(ContentHashSchema).min(1),
    /** What argues with the claim. Empty is an ordinary answer; absent is not. */
    contradicting_node_hashes: z.array(ContentHashSchema),
    /** The edges that carry the support, so a reader can read the rationale rather than guess it. */
    supporting_edge_hashes: z.array(ContentHashSchema).min(1),
    contradicting_edge_hashes: z.array(ContentHashSchema),
})
    .strict();
/**
 * Whether one edge asserts, in the direction it was written, that this evidence
 * supports this claim.
 *
 * Directional, and only `supports`. `derived_from` and `used_input` say where a
 * number came from: a chain of them is provenance, and provenance is what
 * `verifyProvenanceClosure` walks. If a study means "this backs that", it says
 * so with an edge that says so, and then the rationale is on the edge where a
 * reviewer can read it.
 */
function assertsSupport(edge, evidenceHash, claimHash) {
    return (edge.kind === "supports" &&
        edge.from_node_hash === evidenceHash &&
        edge.to_node_hash === claimHash);
}
/** Whether one edge records a disagreement between these two nodes, in either orientation. */
function assertsContradiction(edge, otherHash, claimHash) {
    if (edge.kind !== "contradicts")
        return false;
    return ((edge.from_node_hash === otherHash && edge.to_node_hash === claimHash) ||
        (edge.from_node_hash === claimHash && edge.to_node_hash === otherHash));
}
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
export function verifyClaimMap(entries, nodes, edges) {
    const refusals = [];
    const index = nodesByHash(nodes);
    const edgesByHash = new Map(edges.map((edge) => [edge.content_hash, edge]));
    const seenClaims = new Set();
    for (const entry of entries) {
        const claim = index.get(entry.claim_node_hash);
        const subject = claim?.label ?? entry.claim_node_hash;
        if (seenClaims.has(entry.claim_node_hash)) {
            refusals.push({
                subject,
                code: "CLAIM_MAP_DUPLICATE_ENTRY",
                message: "Two entries in this claim map name the same claim, so the map has two answers to what that claim rests " +
                    "on. A consumer reads one of them, and which one is an accident of ordering.",
            });
            continue;
        }
        seenClaims.add(entry.claim_node_hash);
        if (claim === undefined) {
            refusals.push({
                subject: entry.claim_node_hash,
                code: "EVIDENCE_NODE_UNRESOLVED",
                message: "The claim map names a claim node the graph does not carry. The map would resolve to nothing for a " +
                    "recipient who has only this file, which is every recipient.",
            });
            continue;
        }
        if (claim.kind !== "claim") {
            refusals.push({
                subject: subject,
                code: "EVIDENCE_NODE_KIND_MISMATCH",
                message: `The claim map has an entry for a ${claim.kind} node. The map says what a sentence rests on, and a ` +
                    "measurement, a citation or a model reference is not a sentence -- an entry for one states support for " +
                    "a claim nobody made.",
            });
            continue;
        }
        for (const hash of entry.supporting_edge_hashes) {
            if (edgesByHash.has(hash))
                continue;
            refusals.push({
                subject,
                code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                message: `The claim map cites edge ${hash}, and no edge in this graph has that hash. The relation it names cannot ` +
                    "be read, so neither can who asserted it or why.",
            });
        }
        for (const hash of entry.contradicting_edge_hashes) {
            if (edgesByHash.has(hash))
                continue;
            refusals.push({
                subject,
                code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                message: `The claim map cites edge ${hash} as a contradiction, and no edge in this graph has that hash.`,
            });
        }
        const citedSupport = entry.supporting_edge_hashes
            .map((hash) => edgesByHash.get(hash))
            .filter((edge) => edge !== undefined);
        const citedContradiction = entry.contradicting_edge_hashes
            .map((hash) => edgesByHash.get(hash))
            .filter((edge) => edge !== undefined);
        for (const hash of entry.supporting_node_hashes) {
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
                    message: `The claim is said to rest on node ${hash}, and the graph does not carry it. Evidence that cannot be ` +
                        "opened supports a claim exactly as much as no evidence does.",
                });
                continue;
            }
            // The edge has to be one this entry named. An edge that merely exists
            // somewhere in the graph is the weaker check: it lets an entry cite edge A
            // while relying on edge B, so the rationale a reader is sent to is not the
            // rationale for the relation they are reading about.
            if (citedSupport.some((edge) => assertsSupport(edge, hash, entry.claim_node_hash)))
                continue;
            if (edges.some((edge) => assertsContradiction(edge, hash, entry.claim_node_hash))) {
                refusals.push({
                    subject,
                    code: "CLAIM_EVIDENCE_CONTRADICTS",
                    message: `Node ${hash} is listed as support for this claim, and the edge joining them says it contradicts it. ` +
                        "An objection counted among the reasons to believe something is worse than an objection left out: it " +
                        "raises the number a reader weighs.",
                });
                continue;
            }
            refusals.push({
                subject,
                code: "CLAIM_EVIDENCE_UNLINKED",
                message: `The claim is said to rest on node ${hash}, and none of the edges this entry names joins the two. The ` +
                    "map and the graph are two statements about one relation, and this is them disagreeing: the node is " +
                    "carried, and nothing this entry cites asserts that it backs this claim.",
            });
        }
        for (const hash of entry.contradicting_node_hashes) {
            if (!index.has(hash)) {
                refusals.push({
                    subject,
                    code: "EVIDENCE_NODE_UNRESOLVED",
                    message: `The claim is said to be contradicted by node ${hash}, and the graph does not carry it. An objection a ` +
                        "reader cannot open is an objection they cannot weigh.",
                });
                continue;
            }
            if (citedContradiction.some((edge) => assertsContradiction(edge, hash, entry.claim_node_hash))) {
                continue;
            }
            refusals.push({
                subject,
                code: "CLAIM_EVIDENCE_UNLINKED",
                message: `Node ${hash} is listed as contradicting this claim, and none of the edges this entry names says so. A ` +
                    "disagreement recorded in a map and not in the graph is one nobody can read the basis for.",
            });
        }
    }
    for (const node of nodes) {
        if (node.kind !== "claim")
            continue;
        if (seenClaims.has(node.content_hash))
            continue;
        refusals.push({
            subject: node.label,
            code: "CLAIM_WITHOUT_EVIDENCE_NODE",
            message: "This claim node appears in the graph with no entry in the claim map, so nothing states what it rests on. " +
                "The export refuses rather than shipping the sentence with the reasons left behind.",
        });
    }
    return refusals;
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
export function verifyEvidenceGraph(nodes, edges, options = {}) {
    const audience = options.audience ?? "public";
    const problems = [];
    const refusals = [];
    const index = new Map();
    let hashesMatch = true;
    for (const node of nodes) {
        const expected = studySelfHash("evidence_node", node);
        if (expected !== node.content_hash) {
            hashesMatch = false;
            problems.push(`Node '${node.label}' claims content hash ${node.content_hash} and its own contents canonicalize to ${expected}.`);
        }
        if (index.has(node.content_hash)) {
            refusals.push({
                subject: node.label,
                code: "EVIDENCE_NODE_DUPLICATE",
                message: `Node hash ${node.content_hash} appears twice. A node is identified by its content, so one list entry is ` +
                    "one node however many times it was copied in.",
            });
            problems.push(`Node hash ${node.content_hash} appears twice.`);
            continue;
        }
        index.set(node.content_hash, node);
    }
    const edgeHashes = new Set();
    for (const edge of edges) {
        const expected = studySelfHash("evidence_edge", edge);
        if (expected !== edge.content_hash) {
            hashesMatch = false;
            problems.push(`Edge ${edge.content_hash} (${edge.kind}) canonicalizes to ${expected}; its recorded hash does not match ` +
                "what it says.");
        }
        if (edgeHashes.has(edge.content_hash)) {
            refusals.push({
                subject: edge.content_hash,
                code: "EVIDENCE_EDGE_DUPLICATE",
                message: `Edge hash ${edge.content_hash} appears twice. An edge is identified by its content for the same reason a ` +
                    "node is, so one relation asserted once is one entry.",
            });
            problems.push(`Edge hash ${edge.content_hash} appears twice.`);
        }
        edgeHashes.add(edge.content_hash);
    }
    // One study per graph. A node carrying another study's ref would be evidence
    // a reader attributes to this study, cited by this study's claims, and
    // verified clean -- the graph's own boundary is the only thing that says
    // where its evidence came from.
    const studyRefs = new Set([
        ...nodes.map((node) => node.study_ref),
        ...edges.map((edge) => edge.study_ref),
    ]);
    if (studyRefs.size > 1) {
        refusals.push({
            subject: [...studyRefs].sort().join(", "),
            code: "EVIDENCE_GRAPH_STUDY_MISMATCH",
            message: "The nodes and edges in this graph name more than one study. A graph is one study's account of what it " +
                "found, and a record from another study inside it is evidence a reader would credit to the wrong one.",
        });
        problems.push(`This graph names ${studyRefs.size} different studies.`);
    }
    if (audience === "public") {
        for (const node of nodes) {
            if (node.visibility === "PUBLIC")
                continue;
            refusals.push({
                subject: node.label,
                code: "EVIDENCE_NODE_NOT_PUBLIC",
                message: "This node is marked PRIVATE and the graph is being verified for a public audience. Visibility is inside " +
                    "the node's identity, so it cannot be relaxed for the export without changing the hash every edge names.",
            });
            problems.push(`Node '${node.label}' is PRIVATE.`);
        }
    }
    let edgesResolve = true;
    let edgesPermitted = true;
    const seenRelations = new Set();
    for (const edge of edges) {
        for (const [side, hash] of [
            ["from_node_hash", edge.from_node_hash],
            ["to_node_hash", edge.to_node_hash],
        ]) {
            if (index.has(hash))
                continue;
            edgesResolve = false;
            refusals.push({
                subject: edge.content_hash,
                code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                message: `The ${edge.kind} edge names ${hash} as its ${side}, and no node in this graph has that hash.`,
            });
            problems.push(`Edge ${edge.content_hash} (${edge.kind}) has an unresolved ${side}: ${hash}.`);
        }
        if (edge.from_node_hash === edge.to_node_hash) {
            edgesPermitted = false;
            refusals.push({
                subject: edge.content_hash,
                code: "EVIDENCE_EDGE_NOT_PERMITTED",
                message: "An edge joins one node to itself. It asserts nothing, and it closes every traversal in this module " +
                    "into a loop.",
            });
            problems.push(`Edge ${edge.content_hash} (${edge.kind}) joins a node to itself.`);
            continue;
        }
        const relation = `${edge.from_node_hash}\u0000${edge.kind}\u0000${edge.to_node_hash}`;
        if (seenRelations.has(relation)) {
            refusals.push({
                subject: edge.content_hash,
                code: "EVIDENCE_EDGE_DUPLICATE",
                message: `The same ${edge.kind} relation between the same two nodes is asserted more than once. Two edges with ` +
                    "two rationales are two answers to one question, and a count of support would total them both.",
            });
            problems.push(`Edge ${edge.content_hash} repeats a ${edge.kind} relation already asserted.`);
        }
        seenRelations.add(relation);
        const from = index.get(edge.from_node_hash);
        const to = index.get(edge.to_node_hash);
        if (from === undefined || to === undefined)
            continue;
        if (isEvidenceEdgePermitted(from.kind, edge.kind, to.kind))
            continue;
        edgesPermitted = false;
        refusals.push({
            subject: edge.content_hash,
            code: "EVIDENCE_EDGE_NOT_PERMITTED",
            message: `This family defines no relation '${from.kind} ${edge.kind} ${to.kind}'. An edge whose triple is not in ` +
                "the matrix parses, stores and renders exactly like one that means something, so it is refused where it " +
                "is written rather than interpreted by whoever reads the graph next.",
        });
        problems.push(`Edge ${edge.content_hash} asserts '${from.kind} ${edge.kind} ${to.kind}', which the matrix does not define.`);
    }
    refusals.push(...cycleRefusals(nodes, edges, "derived_from"));
    refusals.push(...cycleRefusals(nodes, edges, "supersedes"));
    refusals.push(...supersessionForkRefusals(index, edges));
    refusals.push(...referenceAgreementRefusals(nodes, index));
    refusals.push(...verifyClaimValues(nodes, index));
    let claimsGrounded = true;
    for (const node of nodes) {
        if (node.kind !== "claim")
            continue;
        const closure = verifyProvenanceClosure(nodes, edges, node.content_hash);
        if (!closure.grounded)
            claimsGrounded = false;
        refusals.push(...closure.refusals);
    }
    // `problems` is prose for a reader and `refusals` is the machine vocabulary,
    // and they are not two views of one list: a hash that does not recompute
    // produces prose and no refusal, and several graph checks produce a refusal
    // whose message is already the prose. `valid` is therefore read off both. A
    // verification that reported `valid` while carrying refusals would be
    // answering a narrower question than the one it was asked.
    return {
        valid: problems.length === 0 && refusals.length === 0,
        hashes_match: hashesMatch,
        edges_resolve: edgesResolve,
        edges_permitted: edgesPermitted,
        claims_grounded: claimsGrounded,
        problems,
        refusals,
    };
}
/**
 * Cycles in a one-way relation.
 *
 * `derived_from` and `supersedes` both run in one direction through time: a
 * value is not computed from itself, and a record does not replace its own
 * replacement. A cycle in either is reported once per relation rather than once
 * per node in it, because it is one defect and a list of seven findings for one
 * loop is a transcript rather than a fix list.
 */
function cycleRefusals(nodes, edges, kind) {
    const outgoing = new Map();
    for (const edge of edges) {
        if (edge.kind !== kind)
            continue;
        const list = outgoing.get(edge.from_node_hash) ?? [];
        list.push(edge.to_node_hash);
        outgoing.set(edge.from_node_hash, list);
    }
    const refusals = [];
    const settled = new Set();
    const onPath = new Set();
    const reported = new Set();
    const visit = (hash) => {
        if (settled.has(hash))
            return;
        if (onPath.has(hash)) {
            if (!reported.has(hash)) {
                reported.add(hash);
                refusals.push({
                    subject: hash,
                    code: "EVIDENCE_GRAPH_CYCLE",
                    message: `Following ${kind} edges from node ${hash} returns to it. That relation runs one way through time: a ` +
                        "value is not computed from itself, and a record does not replace its own replacement. A cycle makes " +
                        "every traversal that follows it either loop or stop at a node the graph did not choose.",
                });
            }
            return;
        }
        onPath.add(hash);
        for (const next of outgoing.get(hash) ?? [])
            visit(next);
        onPath.delete(hash);
        settled.add(hash);
    };
    for (const node of nodes)
        visit(node.content_hash);
    // A cycle among hashes no node in this graph carries is still a cycle in the
    // edges, and the endpoint check reports the missing nodes separately.
    for (const hash of outgoing.keys())
        visit(hash);
    return refusals;
}
/**
 * Two nodes replacing one node.
 *
 * Supersession is how this family records that a figure was revised, and a
 * reader follows it forward expecting one answer. Two replacements for one node
 * is a forked history: `supersessionChain` picks whichever edge comes first in
 * the list, so the same graph read twice can report two different ancestries.
 */
function supersessionForkRefusals(index, edges) {
    const replacements = new Map();
    for (const edge of edges) {
        if (edge.kind !== "supersedes")
            continue;
        replacements.set(edge.to_node_hash, (replacements.get(edge.to_node_hash) ?? 0) + 1);
    }
    const refusals = [];
    for (const [hash, count] of replacements) {
        if (count < 2)
            continue;
        refusals.push({
            subject: index.get(hash)?.label ?? hash,
            code: "EVIDENCE_SUPERSESSION_BRANCH",
            message: `${count} nodes supersede node ${hash}. A reader following supersession forward is asking which record ` +
                "replaced this one, and a fork gives them two answers with nothing to choose between them.",
        });
    }
    return refusals;
}
/**
 * References that disagree about what they point at.
 *
 * A reference may name a record by hash, by slug, or by both, and the graph
 * cannot open the record on the other end. What it can check is that its own
 * references are consistent: one hash under two slugs, one slug under two
 * hashes, or one hash filed under two record kinds is the graph holding two
 * readings of one pointer.
 *
 * The one case where the graph *can* check a kind against the thing itself is a
 * reference whose hash names a node of this graph. A node's hash is the digest
 * of an `evidence_node`, so a reference calling it a benchmark result is
 * pointing at something that will not open as one -- which is how a package
 * makes a reference resolve without carrying the record it claims.
 */
function referenceAgreementRefusals(nodes, index) {
    const refusals = [];
    const kindByHash = new Map();
    const slugByHash = new Map();
    const hashBySlug = new Map();
    const references = [];
    for (const node of nodes) {
        if (node.reference !== null)
            references.push({ node, reference: node.reference });
        if (node.claim !== null)
            references.push({ node, reference: node.claim.subject_ref });
    }
    for (const { node, reference } of references) {
        const { hash, record_slug: slug, record_kind: recordKind } = reference;
        if (hash !== null && index.has(hash) && recordKind !== "evidence_node") {
            refusals.push({
                subject: node.label,
                code: "EVIDENCE_NODE_KIND_MISMATCH",
                message: `A reference names ${hash} as a ${recordKind}, and that hash is an evidence node of this graph. The ` +
                    "reference resolves and does not open: whatever the reader is sent to is not the kind of record the " +
                    "reference says it is.",
            });
        }
        if (hash !== null) {
            const seenKind = kindByHash.get(hash);
            if (seenKind !== undefined && seenKind !== recordKind) {
                refusals.push({
                    subject: node.label,
                    code: "EVIDENCE_REFERENCE_DISAGREES",
                    message: `Record ${hash} is referenced as a ${seenKind} elsewhere in this graph and as a ${recordKind} here. ` +
                        "One record has one kind, and two answers means one of the two pointers opens the wrong thing.",
                });
            }
            kindByHash.set(hash, recordKind);
        }
        if (hash !== null && slug !== null) {
            const seenSlug = slugByHash.get(hash);
            if (seenSlug !== undefined && seenSlug !== slug) {
                refusals.push({
                    subject: node.label,
                    code: "EVIDENCE_REFERENCE_DISAGREES",
                    message: `Record ${hash} is called '${seenSlug}' elsewhere in this graph and '${slug}' here. A slug may be ` +
                        "renamed and a hash may not, so two names for one hash inside one graph is a reference written " +
                        "against two different readings of the registry.",
                });
            }
            slugByHash.set(hash, slug);
            const slugKey = `${recordKind}\u0000${slug}`;
            const seenHash = hashBySlug.get(slugKey);
            if (seenHash !== undefined && seenHash !== hash) {
                refusals.push({
                    subject: node.label,
                    code: "EVIDENCE_REFERENCE_DISAGREES",
                    message: `The ${recordKind} '${slug}' is referenced as ${seenHash} elsewhere in this graph and as ${hash} here. ` +
                        "The slug is the same and the content is not, so one of the two references is to a record that has " +
                        "since changed underneath it.",
                });
            }
            hashBySlug.set(slugKey, hash);
        }
    }
    return refusals;
}
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
export function verifyClaimValues(nodes, index = nodesByHash(nodes)) {
    const refusals = [];
    for (const node of nodes) {
        if (node.kind !== "claim" || node.claim === null)
            continue;
        const { value_ref: valueRef } = node.claim;
        const target = index.get(valueRef.node_hash);
        if (target === undefined) {
            refusals.push({
                subject: node.label,
                code: "EVIDENCE_NODE_UNRESOLVED",
                message: `This claim reads its value from node ${valueRef.node_hash}, and the graph does not carry it. The ` +
                    "sentence would render with no number a reader could check, or with one a renderer supplied.",
            });
            continue;
        }
        if (valueRef.kind === "result_field") {
            if (target.kind === "result")
                continue;
            refusals.push({
                subject: node.label,
                code: "EVIDENCE_NODE_KIND_MISMATCH",
                message: `This claim reads a field of a result, and node ${valueRef.node_hash} is a ${target.kind} node. Only a ` +
                    "result names a record whose fields can be read; every other kind carries its value in the graph, where " +
                    "a value_node reference belongs.",
            });
            continue;
        }
        if (target.kind !== "quantity" && target.kind !== "assumption") {
            refusals.push({
                subject: node.label,
                code: "EVIDENCE_NODE_KIND_MISMATCH",
                message: `This claim reads its value from a ${target.kind} node, which carries no value. A claim's number lives ` +
                    "in a quantity or an assumption node, or in a named field of a result.",
            });
            continue;
        }
        if (target.quantity !== null && !isKnown(target.quantity)) {
            refusals.push({
                subject: node.label,
                code: "CLAIM_VALUE_UNKNOWN",
                message: `The claim '${node.claim.metric}' reads its value from '${target.label}', which is UNKNOWN. An unknown ` +
                    "is not a weaker claim, it is the absence of one, and it belongs in a quantity node or the study's open " +
                    "questions rather than in a sentence someone will quote.",
            });
        }
    }
    return refusals;
}
//# sourceMappingURL=evidence.js.map