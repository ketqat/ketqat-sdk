import { z } from "zod";
import { IsoDateTimeSchema } from "../contracts/common.js";
import { ContentHashSchema, RevisionRefSchema, STUDY_SCHEMA_VERSION, StudyPositionSchema, } from "./common.js";
import { recordHash } from "./hash.js";
import { STUDY_HASH_RULES_ID } from "./rules.js";
/**
 * The study itself, and the trail of everything that happened to it
 * (ketqat-sdk#259, ADR 0010).
 *
 * A `Study` record is deliberately thin, and most of what it displays is
 * outside the digest that identifies it. That looks strange until you notice what
 * the alternative costs: a study's status changes six or seven times between
 * "someone asked a question" and "here is the answer", and if the identity moved
 * with it, the same study would stop matching itself between two reads of the
 * same row. Every reference to it -- from a specification revision, a plan, a
 * task, an evidence node -- would break on a state change that changed nothing
 * about what was being asked.
 *
 * So a study's `content_hash` is its **semantic** digest, and it is one of only
 * two kinds in the family whose self-hash is (`registry.ts` says which and why).
 * It covers the creation core: what kind of study, what it is called, whose
 * project it belongs to, and whether it is a demonstration. `status`,
 * `latest_specification` and `latest_plan` are `RECORD_ONLY` and
 * `created_at` is `RECEIPT_ONLY`, so `recordHash("study", study)` still answers
 * "was this row edited" for a caller who wants that question asked -- it is just
 * not what anything points at. Everything that moves lives in the append-only
 * `StudyEvent` trail, and the status field on the study is a projection of that
 * trail rather than a source of truth.
 *
 * **The trail is hash-chained, and the chain proves one thing.** ADR 0010
 * requires the history to be append-only but leaves the mechanism open, and
 * "append-only" enforced only by a database grant is a property that does not
 * survive an export, a backup restore, or a migration. Each event names the hash
 * of the event before it, so the trail somebody hands you is internally
 * consistent or it is not: no event can be reordered, spliced in, replayed from
 * another trail, or rewritten in the middle without breaking the link the next
 * event carries. That much is checkable offline by anyone holding the events.
 *
 * **What it cannot prove is that the trail you were given is the whole trail.**
 * Drop the last two events and the remainder is a valid five-event chain that
 * verifies; append a fabricated event onto that stub and it verifies too, because
 * the forger holds the same hash the honest writer would have. Nothing in the
 * `Study` record anchors the head: `status`, `latest_specification` and
 * `latest_plan` are outside its semantic digest by design -- that is what keeps
 * a study's identity from moving every time its state does -- so the study a
 * trail belongs to says nothing about how long that trail should be.
 *
 * Closing that needs one hash from outside the trail. `verifyStudyEventChain`
 * takes the head a caller holds -- from the store, from a receipt, from an
 * earlier export -- and refuses a trail that does not end there. Held by the
 * party being audited it proves nothing, which is exactly why the parameter is
 * the caller's and not the record's.
 */
export const StudyTypeSchema = z.enum([
    /** Could a fault-tolerant machine do this at all, and what would it have to reach. */
    "FTQC_FEASIBILITY",
    /** How a logical qubit built this way performs, measured against a stated code baseline. */
    "QEC_LOGICAL_BENCHMARK",
]);
/**
 * Where a study is on its way from a question to an answer.
 *
 * `AWAITING_CONFIRMATION` is a state of its own rather than a flag on
 * `PLANNED`, because the confirmation is the moment the user takes
 * responsibility for what is about to be spent. A ladder that stepped straight
 * from planned to running would make that moment invisible, and an invisible
 * approval is one nobody can be shown to have given.
 *
 * `REFUSED` and `SUPERSEDED` are terminal. A refused study is not a failed one:
 * refusing is the correct outcome when the question cannot be answered with the
 * evidence available, and it is recorded rather than deleted so the reasoning
 * survives.
 */
export const StudyStatusSchema = z.enum([
    "DRAFT",
    "SPECIFIED",
    "PLANNED",
    "AWAITING_CONFIRMATION",
    "RUNNING",
    "CONCLUDED",
    "REFUSED",
    "SUPERSEDED",
]);
/**
 * Every move a study is allowed to make.
 *
 * The ladder runs forward one rung at a time. There are no shortcuts and no
 * self-loops: a status event records a *change*, so adding a second
 * specification revision while the study is already `SPECIFIED` produces a new
 * revision and no event at all.
 *
 * `REFUSED` is reachable from everywhere the study is still alive, including
 * `CONCLUDED` -- a conclusion whose evidence is later found to be unsound is
 * withdrawn, and the withdrawal is a transition rather than a deletion.
 *
 * `SUPERSEDED` is reachable only from the states in which a study has something
 * to supersede: a confirmed plan, a run, or a conclusion. Before that there is
 * nothing another study could replace, only a draft somebody can keep editing.
 */
export const STUDY_STATUS_TRANSITIONS = {
    DRAFT: ["SPECIFIED", "REFUSED"],
    SPECIFIED: ["PLANNED", "REFUSED"],
    PLANNED: ["AWAITING_CONFIRMATION", "REFUSED"],
    AWAITING_CONFIRMATION: ["RUNNING", "REFUSED", "SUPERSEDED"],
    RUNNING: ["CONCLUDED", "REFUSED", "SUPERSEDED"],
    CONCLUDED: ["REFUSED", "SUPERSEDED"],
    REFUSED: [],
    SUPERSEDED: [],
};
/**
 * Whether a study may move from one status to another.
 *
 * `from` is null for the creation event, which is the only way into `DRAFT`.
 * Modelling creation as a transition out of nothing rather than as a special
 * case keeps the trail total: every status the study has ever had is the
 * `to_status` of exactly one event.
 */
export function isValidStudyTransition(from, to) {
    if (from === null)
        return to === "DRAFT";
    return STUDY_STATUS_TRANSITIONS[from].includes(to);
}
export const StudySchema = z.object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_type: StudyTypeSchema,
    /** What the person asking would call this. Hashed: renaming a study makes a different record. */
    title: z.string().min(1),
    /** Registry slug of the owning project, following the `from_artifact_slug` convention. */
    project_ref: z.string().min(1).nullable(),
    is_demo: z.boolean(),
    /**
     * A projection of the event trail, carried here so a list view does not have
     * to replay every study's history. Excluded from the hash under `study-v1`:
     * it is never a source of truth, and a study that changed status is the same
     * study.
     */
    status: StudyStatusSchema,
    /** Denormalized pointer at the newest specification revision. Excluded from the hash. */
    latest_specification: RevisionRefSchema.nullable(),
    /** Denormalized pointer at the newest plan revision. Excluded from the hash. */
    latest_plan: RevisionRefSchema.nullable(),
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it says. */
    created_at: IsoDateTimeSchema.optional(),
    /** SHA-256 over the creation core. Excluded from its own digest. */
    content_hash: ContentHashSchema,
}).strict();
export const StudyEventSchema = z
    .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The `content_hash` of the study this event belongs to. */
    study_ref: ContentHashSchema,
    /** Position in the trail, starting at 1. */
    sequence: StudyPositionSchema,
    /** The `content_hash` of event n-1, or null for the first. This is the chain. */
    previous_event_hash: ContentHashSchema.nullable(),
    /** Null only on the creation event, which comes from no status at all. */
    from_status: StudyStatusSchema.nullable(),
    to_status: StudyStatusSchema,
    /**
     * Who did this, as a free string. Nothing here is signed, and an
     * attribution field that looked like a signature would claim a guarantee
     * this repository does not provide (ADR 0014 §3).
     */
    actor: z.string().min(1),
    /** Why, when there is a why. Null rather than an empty string, so "unstated" is visible. */
    reason: z.string().min(1).nullable(),
    /** Which plan revision this event acts on. Required when the study starts running. */
    plan_ref: RevisionRefSchema.nullable(),
    /** When it happened. Excluded from the hash; the ordering lives in `sequence`. */
    created_at: IsoDateTimeSchema.optional(),
    content_hash: ContentHashSchema,
})
    .strict()
    .superRefine((event, context) => {
    if (event.sequence === 1 && event.previous_event_hash !== null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "The first event in a trail follows nothing.",
            path: ["previous_event_hash"],
        });
    }
    if (event.sequence > 1 && event.previous_event_hash === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An event after the first must name the event it follows. A link left null is a gap in the trail that " +
                "nothing downstream can detect.",
            path: ["previous_event_hash"],
        });
    }
    // Creation is the only way into DRAFT, and the only event with no prior
    // status. Pairing the two in both directions means a fabricated "back to
    // draft" event cannot be inserted into a trail that has already moved on.
    if (event.from_status === null && event.to_status !== "DRAFT") {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Only the creation event has no prior status, and it can only reach DRAFT, not ${event.to_status}.`,
            path: ["to_status"],
        });
    }
    if (event.from_status !== null && event.to_status === "DRAFT") {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A study is drafted once. Nothing returns to DRAFT.",
            path: ["to_status"],
        });
    }
    if (event.from_status === null && event.sequence !== 1) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "The creation event is the first event in the trail.",
            path: ["sequence"],
        });
    }
    if (event.from_status !== null && !isValidStudyTransition(event.from_status, event.to_status)) {
        const reachable = STUDY_STATUS_TRANSITIONS[event.from_status];
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A study cannot move from ${event.from_status} to ${event.to_status}. ` +
                (reachable.length === 0
                    ? `${event.from_status} is terminal.`
                    : `Reachable from ${event.from_status}: ${reachable.join(", ")}.`),
            path: ["to_status"],
        });
    }
    // Running costs money. The event that starts a run therefore has to name the
    // exact plan revision that was confirmed, so "what was approved" and "what
    // ran" are the same hash rather than two things a reader has to trust are
    // related.
    if (event.to_status === "RUNNING" && event.plan_ref === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An event that starts a run must name the confirmed plan revision it runs. A run with no plan reference " +
                "cannot be checked against what anyone approved.",
            path: ["plan_ref"],
        });
    }
});
/**
 * Add one event to a study's trail.
 *
 * The sequence, the previous-event link and the starting status are all read
 * from the trail rather than accepted from the caller: those three are what make
 * the chain checkable, and a chain whose links the writer chooses is a chain
 * that proves nothing.
 *
 * The existing trail is verified before anything is appended. Extending a
 * history that does not verify would produce a longer history that does not
 * verify, and would put the break further from the event that caused it.
 */
export function appendStudyEvent(study, events, input) {
    const existing = verifyStudyEventChain(events);
    if (!existing.valid) {
        return { ok: false, refusal: existing.problems[0] };
    }
    const previous = events.length === 0 ? null : events[events.length - 1];
    if (previous !== null && previous.study_ref !== study.content_hash) {
        return {
            ok: false,
            refusal: {
                subject: `study ${study.content_hash}`,
                code: "EVENT_CHAIN_BROKEN",
                message: `The trail belongs to study ${previous.study_ref}, not to ${study.content_hash}. ` +
                    "Two studies' events are two trails, and neither continues the other.",
            },
        };
    }
    const fromStatus = previous === null ? null : previous.to_status;
    if (!isValidStudyTransition(fromStatus, input.toStatus)) {
        const reachable = fromStatus === null ? ["DRAFT"] : STUDY_STATUS_TRANSITIONS[fromStatus];
        return {
            ok: false,
            refusal: {
                subject: `study ${study.content_hash}`,
                code: "INVALID_STATUS_TRANSITION",
                message: `A study at ${fromStatus ?? "no status yet"} cannot move to ${input.toStatus}. ` +
                    (reachable.length === 0
                        ? `${fromStatus} is terminal, and a terminal study is not reopened.`
                        : `It can move to: ${reachable.join(", ")}.`),
            },
        };
    }
    const withoutHash = {
        schema_version: STUDY_SCHEMA_VERSION,
        hash_rules_id: STUDY_HASH_RULES_ID,
        study_ref: study.content_hash,
        sequence: events.length + 1,
        previous_event_hash: previous === null ? null : previous.content_hash,
        from_status: fromStatus,
        to_status: input.toStatus,
        actor: input.actor,
        reason: input.reason ?? null,
        plan_ref: input.planRef ?? null,
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    // Stamp then hash, in `buildBundle`'s order. `recordHash` is what an event's
    // `content_hash` is: every declared field except the three `DERIVED` ones,
    // which is why stamping the record afterwards is not circular -- a record's
    // own hash cannot be an input to itself, and the projection does not read it.
    return {
        ok: true,
        event: StudyEventSchema.parse({ ...withoutHash, content_hash: recordHash("study_event", withoutHash) }),
    };
}
/**
 * Recompute a whole trail: every hash, every link, every transition.
 *
 * What this establishes, stated exactly: **the trail passed in is internally
 * consistent.** No event was reordered, spliced in, replayed from another study,
 * or rewritten -- the interesting tampering is in the middle, an event edited to
 * say the plan was confirmed or the actor was someone else, and it is caught
 * twice over. The rewritten event no longer hashes to what it claims, and if it
 * is re-hashed to repair that, the event after it now names a hash nobody has.
 *
 * What it does not establish, without `expectedHeadHash`, is that the trail is
 * the whole trail. A trail cut short is a shorter valid chain, and an event
 * fabricated onto the cut end links to it exactly as an honest one would: the
 * chain runs forward from an unanchored beginning, so only its far end can be
 * questioned, and nothing inside the trail can question it. `Study.status` and
 * the `latest_*` pointers are `RECORD_ONLY`, and a study's `content_hash` is
 * its semantic digest, so the record the trail belongs to cannot serve as the
 * anchor either -- deliberately, since an identity that moved with the status
 * would break every reference to the study each time it advanced.
 *
 * `expectedHeadHash` is that anchor, and it has to come from somewhere the
 * trail's author does not control -- the store the events were read from, a
 * receipt, a hash published earlier. Given one, a truncated trail and a forged
 * continuation both fail here rather than reading as history. Given none, the
 * head is not checked and this function says so by not claiming otherwise.
 *
 * Problems are returned as coded refusals rather than prose, so a caller can
 * branch on what went wrong without matching English.
 */
export function verifyStudyEventChain(events, expectedHeadHash = null) {
    const problems = [];
    let previous = null;
    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const subject = `study event ${event.sequence}`;
        const recomputed = recordHash("study_event", event);
        if (recomputed !== event.content_hash) {
            problems.push({
                subject,
                code: "EVENT_CHAIN_BROKEN",
                message: `The event claims hash ${event.content_hash} and its own contents canonicalize to ${recomputed}. ` +
                    "It was edited after it was written.",
            });
        }
        if (event.sequence !== index + 1) {
            problems.push({
                subject,
                code: "EVENT_CHAIN_BROKEN",
                message: `The event is at position ${index + 1} of the trail but numbers itself ${event.sequence}.`,
            });
        }
        const expectedLink = previous === null ? null : previous.content_hash;
        if (event.previous_event_hash !== expectedLink) {
            problems.push({
                subject,
                code: "EVENT_CHAIN_BROKEN",
                message: `The event follows ${event.previous_event_hash ?? "nothing"}, but the event before it in this trail is ` +
                    `${expectedLink ?? "nothing"}. Something between the two was rewritten or removed.`,
            });
        }
        if (previous !== null && event.study_ref !== previous.study_ref) {
            problems.push({
                subject,
                code: "EVENT_CHAIN_BROKEN",
                message: `The event belongs to study ${event.study_ref}, but the trail so far belongs to ${previous.study_ref}.`,
            });
        }
        const expectedFrom = previous === null ? null : previous.to_status;
        if (event.from_status !== expectedFrom) {
            problems.push({
                subject,
                code: "INVALID_STATUS_TRANSITION",
                message: `The event starts from ${event.from_status ?? "no status"}, but the trail had reached ` +
                    `${expectedFrom ?? "no status"}.`,
            });
        }
        else if (!isValidStudyTransition(event.from_status, event.to_status)) {
            problems.push({
                subject,
                code: "INVALID_STATUS_TRANSITION",
                message: `A study cannot move from ${event.from_status ?? "no status"} to ${event.to_status}.`,
            });
        }
        previous = event;
    }
    // The anchor, checked last: everything above is about the trail's own
    // consistency, and this is the one question it cannot ask itself. A caller
    // that holds no head passes none and is told nothing about completeness --
    // silence rather than a check that would have passed for a trail with its
    // last two events removed.
    if (expectedHeadHash !== null) {
        const head = events.length === 0 ? null : events[events.length - 1].content_hash;
        if (head !== expectedHeadHash) {
            const position = events.findIndex((event) => event.content_hash === expectedHeadHash);
            problems.push({
                subject: "study event trail",
                code: "EVENT_CHAIN_BROKEN",
                message: head === null
                    ? `The trail is empty, and the head it is checked against is ${expectedHeadHash}. Every event this ` +
                        "study recorded is missing, which a chain running forward from nothing cannot notice on its own."
                    : position === -1
                        ? `The trail ends at ${head}, and the expected head ${expectedHeadHash} is not in it at all. Either ` +
                            "events were removed from the end and the remainder re-presented as the history, or this trail " +
                            "continues a different one."
                        : `The trail ends at ${head}, and the expected head ${expectedHeadHash} is event ` +
                            `${position + 1} of ${events.length}. The trail continues past the head it was checked against: ` +
                            "either that head is stale, or events were appended to a history somebody else has already read.",
            });
        }
    }
    return { valid: problems.length === 0, problems };
}
//# sourceMappingURL=study.js.map