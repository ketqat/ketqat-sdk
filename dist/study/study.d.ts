import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type RevisionRef } from "./common.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * The study itself, and the trail of everything that happened to it
 * (ketqat-sdk#259, ADR 0010).
 *
 * A `Study` record is deliberately thin, and most of what it displays is
 * excluded from its own hash. That looks strange until you notice what the
 * alternative costs: a study's status changes six or seven times between "someone
 * asked a question" and "here is the answer", and if status were hashed, the same
 * study would stop matching itself between two reads of the same row. Every
 * reference to it -- from a specification revision, a plan, a task, an evidence
 * node -- would break on a state change that changed nothing about what was being
 * asked.
 *
 * So the hash covers the creation core: what kind of study, what it is called,
 * whose project it belongs to, and whether it is a demonstration. Everything that
 * moves lives in the append-only `StudyEvent` trail, and the status field on the
 * study is a projection of that trail rather than a source of truth.
 *
 * **The trail is hash-chained.** ADR 0010 requires the history to be append-only
 * but leaves the mechanism open, and "append-only" enforced only by a database
 * grant is a property that does not survive an export, a backup restore, or a
 * migration. Each event names the hash of the event before it, so a rewritten
 * history is detectable offline by anyone holding the events -- and detectable in
 * the middle, not just at the end, because rewriting event two breaks the link
 * event three carries.
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
    /** Recorded on the event but excluded from its hash. Omit for a byte-stable trail. */
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
 * Checking only the last event would catch a truncation and nothing else. The
 * interesting tampering is in the middle -- an event rewritten to say the plan
 * was confirmed, or the actor was someone else -- and it is caught here twice
 * over: the rewritten event no longer hashes to what it claims, and if it is
 * re-hashed to repair that, the event after it now names a hash nobody has.
 *
 * Problems are returned as coded refusals rather than prose, so a caller can
 * branch on what went wrong without matching English.
 */
export declare function verifyStudyEventChain(events: readonly StudyEvent[]): {
    valid: boolean;
    problems: StudyRefusal[];
};
//# sourceMappingURL=study.d.ts.map