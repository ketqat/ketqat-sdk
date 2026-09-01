import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type RevisionRef } from "./common.js";
import type { StudyRefusal } from "./refusals.js";
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
export declare const StudyTypeSchema: z.ZodEnum<["FTQC_FEASIBILITY", "QEC_LOGICAL_BENCHMARK"]>;
export type StudyType = z.infer<typeof StudyTypeSchema>;
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
export declare const StudyStatusSchema: z.ZodEnum<["DRAFT", "SPECIFIED", "PLANNED", "AWAITING_CONFIRMATION", "RUNNING", "CONCLUDED", "REFUSED", "SUPERSEDED"]>;
export type StudyStatus = z.infer<typeof StudyStatusSchema>;
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
export declare const STUDY_STATUS_TRANSITIONS: Record<StudyStatus, readonly StudyStatus[]>;
/**
 * Whether a study may move from one status to another.
 *
 * `from` is null for the creation event, which is the only way into `DRAFT`.
 * Modelling creation as a transition out of nothing rather than as a special
 * case keeps the trail total: every status the study has ever had is the
 * `to_status` of exactly one event.
 */
export declare function isValidStudyTransition(from: StudyStatus | null, to: StudyStatus): boolean;
export interface Study {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_type: StudyType;
    title: string;
    project_ref: string | null;
    is_demo: boolean;
    status: StudyStatus;
    latest_specification: RevisionRef | null;
    latest_plan: RevisionRef | null;
    created_at?: string;
    content_hash: string;
}
export declare const StudySchema: Contract<Study>;
export interface StudyEvent {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    sequence: number;
    previous_event_hash: string | null;
    from_status: StudyStatus | null;
    to_status: StudyStatus;
    actor: string;
    reason: string | null;
    plan_ref: RevisionRef | null;
    created_at?: string;
    content_hash: string;
}
export declare const StudyEventSchema: Contract<StudyEvent>;
/** What a caller supplies; the chain fields are derived, never passed in. */
export interface StudyEventInput {
    toStatus: StudyStatus;
    actor: string;
    reason?: string | null;
    planRef?: RevisionRef | null;
    /**
     * `RECEIPT_ONLY`, like every other field of an event: an event *is* audit
     * evidence, which is why its `content_hash` is the record digest rather than
     * the semantic one -- a semantic projection of an event reads no field at all
     * and refuses. Omit for a byte-stable trail.
     */
    createdAt?: string;
}
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
export declare function appendStudyEvent(study: Study, events: readonly StudyEvent[], input: StudyEventInput): {
    ok: true;
    event: StudyEvent;
} | {
    ok: false;
    refusal: StudyRefusal;
};
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
export declare function verifyStudyEventChain(events: readonly StudyEvent[], expectedHeadHash?: string | null): {
    valid: boolean;
    problems: StudyRefusal[];
};
//# sourceMappingURL=study.d.ts.map