import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type RevisionRef } from "./common.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * The study aggregate, and the trail of everything that happened to it
 * (ketqat-sdk#259, ADR 0010, goal §5, §6, §7).
 *
 * **A study is identified by an id, not by a digest.** It used to be
 * content-addressed, and that reading was inconsistent for an aggregate in a way
 * that showed the first time anyone used it: renaming a study changed its
 * identity while changing its status did not, so an edit to a display name
 * invalidated every `study_ref` in the graph -- five other record kinds carry
 * one -- and an edit to lifecycle state invalidated nothing. `study_id` is
 * generated once and never derived from content (`identity.ts`), so a rename is
 * a rename. Specification, plan and report revisions stay content-addressed,
 * because there a changed record genuinely is a different record, and that is
 * where content addressing earns its keep.
 *
 * The record is split accordingly. `core` is what cannot change for a given
 * `study_id`: the kind of study, the project it belongs to, and whether it is a
 * demonstration. `presentation` is everything a list view shows and everything
 * that moves underneath it: the title, the status, and the denormalized pointers
 * at the newest revisions. `content_hash` is the **semantic** digest, over the
 * id and the core, so it stands still while the study advances --
 * `updateStudyPresentation` returns a study with the same one, which is the
 * property in a testable form. `recordHash("study", study)` still answers "was
 * this row edited", presentation included, for a caller who wants that question
 * asked.
 *
 * **The trail is a typed event union.** It was a status transition with a
 * couple of optional fields, which meant the twenty-two things that actually
 * happen to a study were recorded as eight statuses and a free-text reason --
 * and meant `CONCLUDED -> REFUSED` stood for four different endings and a wait
 * at once.
 * `StudyEventSchema` is a discriminated union over `event_type`: each variant
 * declares the payload it needs and nothing else, so a `task_started` event
 * cannot carry a package reference and a `conclusion_retracted` event cannot
 * omit its reason. Which event types are legal from which status is declared in
 * `STUDY_EVENT_TYPES` rather than inferred from a pair of statuses, because the
 * pair was never the rule: `task_started` and `study_superseded` both leave
 * `RUNNING`, and they are not interchangeable.
 *
 * **Every timestamp on an event is `RECEIPT_ONLY`.** An event *is* audit
 * evidence, which is why its self-hash is the record digest and why its
 * semantic projection reads no field at all and refuses. `created_at` lands in
 * the receipt preimage, where "did this server observe this, in this order" is
 * the question being asked, and never in a digest that claims to be about
 * content.
 *
 * **What the chain proves, exactly.** Each event names the hash of the event
 * before it, so a trail somebody hands you is internally consistent or it is
 * not: reordering, splicing, replay from another study and rewriting in the
 * middle all break a link, and all are detectable offline by anyone holding the
 * events. Truncation is not. Drop the last two events and the remainder is a
 * shorter valid chain; append a fabricated event to the stub and it verifies
 * too, because the forger holds the same hash the honest writer would have.
 * Closing that needs one hash from outside the trail, and
 * `verifyStudyEventChain` takes it as an anchor -- `head_checked` in the result
 * says whether it got one, and `undetected` names what a verdict without one
 * does not cover. `appendStudyEvent` requires it rather than accepting it,
 * because appending to a stale read is how the fork gets written in the first
 * place. What neither can do is see a record the caller did not hand over;
 * `persistence.ts` says what a store owes underneath.
 */
export declare const StudyTypeSchema: z.ZodEnum<["FTQC_FEASIBILITY", "QEC_LOGICAL_BENCHMARK"]>;
export type StudyType = z.infer<typeof StudyTypeSchema>;
/**
 * Where a study is on its way from a question to an answer.
 *
 * Four endings and a wait used to be one word. `CONCLUDED -> REFUSED` was
 * written for a study that refused to conclude, a study whose user stopped it, a
 * study whose conclusion was withdrawn, a study replaced by a newer one, and a
 * study waiting on an answer that never came -- five things a reader would want
 * to tell apart, recorded as one. They are separate members now, and each says
 * what it means:
 *
 * - `REFUSED` -- the study will not conclude, because the evidence to conclude
 *   on is not there. Refusing is the correct outcome of a study that cannot be
 *   answered, not a failure of one, and it is recorded rather than deleted so
 *   the reasoning survives.
 * - `NEEDS_INPUT` -- waiting. Nothing is wrong; a question was asked and the
 *   answer has not come back. It is not terminal, and a study resumes from it
 *   to exactly the status it was in when it started waiting.
 * - `CANCELLED` -- the user stopped it. A statement about a decision somebody
 *   made, and deliberately not about the evidence.
 * - `RETRACTED` -- a conclusion was drawn and is being withdrawn. The
 *   difference from `REFUSED` is that something was published to withdraw;
 *   "invalidated" is the same state under another name, and this family names
 *   it once.
 * - `SUPERSEDED` -- a newer study replaces this one. Nothing here is wrong
 *   either; it has simply stopped being the current answer.
 *
 * `AWAITING_CONFIRMATION` stays a state of its own rather than a flag on
 * `PLANNED`, because the confirmation is the moment the user takes
 * responsibility for what is about to be spent, and a ladder that stepped
 * straight from planned to running would make that moment invisible.
 */
export declare const StudyStatusSchema: z.ZodEnum<["DRAFT", "SPECIFIED", "PLANNED", "AWAITING_CONFIRMATION", "RUNNING", "NEEDS_INPUT", "CONCLUDED", "REFUSED", "RETRACTED", "CANCELLED", "SUPERSEDED"]>;
export type StudyStatus = z.infer<typeof StudyStatusSchema>;
/** Every kind of thing that happens to a study. */
export declare const StudyEventTypeSchema: z.ZodEnum<["study_created", "specification_revised", "question_elicited", "answer_confirmed", "plan_created", "plan_superseded", "confirmation_requested", "confirmation_recorded", "task_authorised", "task_queued", "task_started", "task_completed", "task_failed", "task_cancelled", "conclusion_created", "conclusion_retracted", "study_refused", "study_cancelled", "study_superseded", "study_published", "reproduction_submitted", "review_recorded"]>;
export type StudyEventType = z.infer<typeof StudyEventTypeSchema>;
/** What an event does to the study's status. */
export type StudyEventOutcome = 
/** The status this event always produces, whatever the study was doing. */
{
    readonly kind: "fixed";
    readonly to: StudyStatus;
}
/** The study does not move. Most of the lifecycle is things happening inside a status. */
 | {
    readonly kind: "unchanged";
}
/** The study returns to whatever it was doing before it started waiting. */
 | {
    readonly kind: "resumes";
};
/**
 * Which events are legal when, and what each one does to the status.
 *
 * The rule used to be a pair of statuses, and a pair of statuses was never the
 * rule. `task_started` and `study_superseded` both leave `RUNNING` and are not
 * interchangeable; `task_completed` and `task_failed` leave it in the same
 * place and mean opposite things. What is actually legal is *this event, from
 * this status*, so that is what is declared -- and the pairwise view a reader
 * may still want is derived from this table below rather than maintained beside
 * it.
 *
 * Four things are worth stating once rather than at twenty-two rows.
 *
 * **Most events are `unchanged`.** A confirmation being recorded, a task being
 * queued, a package being published: the study is where it was, and something
 * happened inside it. Under the old model these had nowhere to go except a
 * status change that did not happen or a free-text reason nobody could query.
 *
 * **`answer_confirmed` is the only `resumes` event**, and it is why waiting is a
 * status rather than a flag. A study that asked a question from `PLANNED` is not
 * back in `DRAFT` when the answer arrives; it returns to `PLANNED`. A single
 * event cannot check that on its own -- the status before the wait is a fact
 * about the trail -- so `verifyStudyEventChain` checks it, which is a stronger
 * statement than any pairwise table could make.
 *
 * **`question_elicited` is not permitted from `NEEDS_INPUT`.** A second question
 * asked while already waiting would make the status before the wait be
 * `NEEDS_INPUT`, and there would be nothing to resume to. Further questions live
 * in the specification's `open_questions`, which is the list built for them;
 * the status records that the study is waiting, not how many things it is
 * waiting for.
 *
 * **`task_authorised` is permitted only from `AWAITING_CONFIRMATION`**, while
 * `task_queued` and `task_started` are also permitted from `RUNNING`. A plan
 * with three tasks records three authorisations while the study is awaiting
 * confirmation -- they are `unchanged` events, so nothing stops that -- and the
 * three runs start afterwards. What it cannot do is authorise a fourth once the
 * study is running: work is authorised by a confirmation, and getting back to
 * `AWAITING_CONFIRMATION` means asking for one.
 */
export interface StudyEventTypeRule {
    readonly event_type: StudyEventType;
    /**
     * The statuses this event may be recorded from, or null for the creation
     * event, which is recorded from no status at all.
     */
    readonly permitted_from: readonly StudyStatus[] | null;
    readonly outcome: StudyEventOutcome;
    /**
     * Whether the event is refused without a reason.
     *
     * Required exactly where a reader will ask why and the record is the only
     * place an answer could be: a study that refused, a study or a task somebody
     * stopped, a conclusion withdrawn, a task that failed. Everywhere else a
     * reason is welcome and not compelled, because a mandatory field with nothing
     * to say gets filled in with "n/a".
     */
    readonly requires_reason: boolean;
}
export declare const STUDY_EVENT_TYPES: readonly StudyEventTypeRule[];
/**
 * The statuses nothing leaves, derived rather than declared.
 *
 * A status is terminal when no event type permits itself from it, which is a
 * fact about the table above and not a second list beside it. Declared
 * separately, the two could disagree -- a status could be called terminal while
 * an event quietly left it -- and the disagreement would be invisible, because
 * each list would be self-consistent.
 */
export declare const STUDY_TERMINAL_STATUSES: readonly StudyStatus[];
/**
 * The rule for an event type, or null.
 *
 * A `Map` rather than an object literal, for the reason `registry.ts` gives: an
 * object literal answers to every name on `Object.prototype`, so an event type
 * of `"toString"` would resolve to a function and be handed on as a rule.
 */
export declare function studyEventRule(eventType: string): StudyEventTypeRule | null;
/**
 * Whether an event of this type may be recorded while the study is here.
 *
 * `null` for `from` means the study does not exist yet, which only the creation
 * event answers to. Modelling creation as an event out of nothing rather than as
 * a special case keeps the trail total: every status the study has ever been in
 * is the `to_status` of some event, including the first.
 */
export declare function isPermittedStudyEvent(eventType: string, from: StudyStatus | null): boolean;
/**
 * The status a study reaches, given where it was and where it was before it
 * started waiting.
 *
 * `resumeStatus` is null for every event but `answer_confirmed`, and for that
 * one it is what the trail says: a study resumes to what it was doing, and a
 * caller who does not know that cannot be told to guess.
 */
export declare function studyStatusAfter(eventType: string, from: StudyStatus | null, resumeStatus: StudyStatus | null): StudyStatus | null;
export declare const STUDY_STATUS_TRANSITIONS: Record<StudyStatus, readonly StudyStatus[]>;
/**
 * Whether a study may move from one status to another at all.
 *
 * The weaker of the two questions, and kept because it is the one a display
 * layer asks. `isPermittedStudyEvent` is the rule; this says only that some
 * event makes the move, not which, and a caller deciding whether to *record*
 * something must ask the other one.
 */
export declare function isValidStudyTransition(from: StudyStatus | null, to: StudyStatus): boolean;
/**
 * What cannot change for a given `study_id`.
 *
 * Immutable by construction rather than by convention: `updateStudyPresentation`
 * takes no argument that could reach these, so there is no code path that edits
 * one and forgets to mint a new study.
 */
export interface StudyCore {
    study_type: StudyType;
    project_ref: string | null;
    is_demo: boolean;
}
/** Everything a list view shows, and everything that moves underneath it. */
export interface StudyPresentation {
    title: string;
    status: StudyStatus;
    latest_specification: RevisionRef | null;
    latest_plan: RevisionRef | null;
}
export interface Study {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_id: string;
    core: StudyCore;
    presentation: StudyPresentation;
    created_at?: string;
    content_hash: string;
}
export declare const StudyCoreSchema: Contract<StudyCore>;
export declare const StudyPresentationSchema: Contract<StudyPresentation>;
export declare const StudySchema: Contract<Study>;
/** What a caller supplies to create a study; the id and the digest are produced here. */
export interface StudyInput {
    core: StudyCore;
    title: string;
    /** Supply one to reuse an id a store already minted. Omit and one is generated. */
    studyId?: string;
    /** Recorded on the record, and outside its identity. Omit for a byte-stable record. */
    createdAt?: string;
}
/**
 * Create a study.
 *
 * The status is `DRAFT` and the revision pointers are null, because those are
 * projections of a trail that has no events in it yet: a study that reported
 * anything else at creation would be reporting a history it does not have.
 */
export declare function buildStudy(input: StudyInput): Study;
/**
 * Restate the presentation, leaving the identity where it is.
 *
 * The whole point of the split, in a function: there is no parameter here that
 * could reach the core, so a rename cannot become a new study by accident, and
 * the returned record carries the same `content_hash` as the one passed in --
 * not because the hash was copied, but because it is recomputed over fields this
 * function cannot touch.
 */
export declare function updateStudyPresentation(study: Study, changes: Partial<StudyPresentation>): Study;
/**
 * The fields every event carries, whatever kind it is.
 *
 * Written once and spread into each variant, so that "the chain" is one list a
 * reader can check rather than twenty-two copies that could disagree. The
 * payload is what differs, which is the whole reason the union exists.
 */
export interface StudyEventEnvelope {
    schema_version: string;
    hash_rules_id: "study-v1";
    /** The `study_id` of the study this event belongs to. Not a hash: a rename is not a new study. */
    study_ref: string;
    sequence: number;
    previous_event_hash: string | null;
    from_status: StudyStatus | null;
    to_status: StudyStatus;
    actor: string;
    reason: string | null;
    created_at?: string;
    content_hash: string;
}
/**
 * One event, as the union of what can have happened.
 *
 * Each variant carries the payload its meaning needs, and a field that means
 * one thing carries one name family-wide: `plan_ref` is always the plan
 * revision an event acts on, `package_ref` is always a research package, and
 * `task_ref` is always the `content_hash` of a `study_task_authorization` --
 * the immutable half of the split in `task.ts`, so a reference recorded when the
 * work was authorised still resolves after the work has run. That discipline is
 * what lets the classification in `registry.ts` be one table over the union of
 * the payload fields rather than one table per variant.
 */
export type StudyEvent = (StudyEventEnvelope & {
    event_type: "study_created";
}) | (StudyEventEnvelope & {
    event_type: "specification_revised";
    specification_ref: RevisionRef;
}) | (StudyEventEnvelope & {
    event_type: "question_elicited";
    question: string;
}) | (StudyEventEnvelope & {
    event_type: "answer_confirmed";
    question: string;
}) | (StudyEventEnvelope & {
    event_type: "plan_created";
    plan_ref: RevisionRef;
}) | (StudyEventEnvelope & {
    event_type: "plan_superseded";
    plan_ref: RevisionRef;
    superseded_plan_ref: RevisionRef;
}) | (StudyEventEnvelope & {
    event_type: "confirmation_requested";
    plan_ref: RevisionRef;
}) | (StudyEventEnvelope & {
    event_type: "confirmation_recorded";
    plan_ref: RevisionRef;
    confirmed_hash: string;
    receipt_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "task_authorised";
    task_ref: string;
    plan_ref: RevisionRef;
}) | (StudyEventEnvelope & {
    event_type: "task_queued";
    task_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "task_started";
    task_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "task_completed";
    task_ref: string;
    capsule_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "task_failed";
    task_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "task_cancelled";
    task_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "conclusion_created";
    package_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "conclusion_retracted";
    package_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "study_refused";
}) | (StudyEventEnvelope & {
    event_type: "study_cancelled";
}) | (StudyEventEnvelope & {
    event_type: "study_superseded";
    superseding_study_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "study_published";
    package_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "reproduction_submitted";
    package_ref: string;
    reproduction_capsule_ref: string;
}) | (StudyEventEnvelope & {
    event_type: "review_recorded";
    package_ref: string;
    review_verdict: StudyReviewVerdict;
});
/**
 * What a reviewer said about a published package.
 *
 * A judgement by a person, and nothing to do with a hash: ADR 0014 forbids a
 * digest match being rendered as authentic or correct, and this field is where
 * an actual opinion is recorded instead.
 */
export declare const StudyReviewVerdictSchema: z.ZodEnum<["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"]>;
export type StudyReviewVerdict = z.infer<typeof StudyReviewVerdictSchema>;
export declare const StudyEventSchema: Contract<StudyEvent>;
/**
 * The fields the chain derives, which a caller therefore does not supply.
 *
 * Named as a type rather than restated as a second interface: the input *is* the
 * event minus the chain, and writing it that way means a payload field added to
 * a variant is accepted by `appendStudyEvent` without anything else changing.
 */
type StudyEventChainField = "schema_version" | "hash_rules_id" | "study_ref" | "sequence" | "previous_event_hash" | "from_status" | "to_status" | "content_hash";
/**
 * What a caller supplies.
 *
 * Distributed over the union, so `event_type` still selects the payload: an
 * input naming `task_completed` requires `capsule_ref` and refuses
 * `package_ref`, at the type level and again at the parse.
 *
 * `reason` is optional here and null on the record. Absent and null are the same
 * statement for this field -- nobody said why -- and the four event types that
 * do require one are refused at the parse rather than in the type, so the
 * requirement is stated once, in the table.
 */
export type StudyEventInput = StudyEvent extends infer Variant ? Variant extends StudyEvent ? Omit<Variant, StudyEventChainField | "reason"> & {
    reason?: string | null;
} : never : never;
/** What a chain verdict does not cover, as a closed list. */
export declare const STUDY_CHAIN_UNDETECTED_PROPERTIES: readonly ["TRUNCATION"];
export type StudyChainUndetectedProperty = (typeof STUDY_CHAIN_UNDETECTED_PROPERTIES)[number];
export interface StudyChainVerification {
    readonly valid: boolean;
    readonly problems: readonly StudyRefusal[];
    /** Whether the caller supplied an anchor, so the trail's far end was checked at all. */
    readonly head_checked: boolean;
    /**
     * What this verdict does not establish, named rather than left to a docstring.
     *
     * `TRUNCATION` when no anchor was supplied: a trail cut short is a shorter
     * valid chain, and a forgery appended to the cut end links to it exactly as an
     * honest event would. Empty when an anchor was supplied, because then the far
     * end was checked. Reordering, splicing, replay and rewriting are covered
     * either way -- they break a link, and a link is inside the trail.
     */
    readonly undetected: readonly StudyChainUndetectedProperty[];
}
/**
 * Recompute a whole trail: every hash, every link, every event's legality.
 *
 * What this establishes, stated exactly: **the trail passed in is internally
 * consistent.** No event was reordered, spliced in, replayed from another study,
 * or rewritten. The interesting tampering is in the middle -- an event edited to
 * say a plan was confirmed or the actor was somebody else -- and it is caught
 * twice over: the rewritten event no longer hashes to what it claims, and if it
 * is re-hashed to repair that, the event after it names a hash nobody has.
 *
 * What it does not establish, without `expectedHeadHash`, is that the trail is
 * the whole trail. That is reported rather than described: `head_checked` says
 * whether an anchor was supplied, and `undetected` names `TRUNCATION` when one
 * was not. The anchor has to come from somewhere the trail's author does not
 * control -- the store the events were read from, a receipt, a hash published
 * earlier -- because held by the party being audited it proves nothing, which is
 * exactly why the parameter is the caller's and not the record's.
 *
 * What it cannot do at all is see an event the caller did not hand over. Two
 * events written at one sequence are two trails, each internally consistent, and
 * nothing here can tell that the other one exists; `persistence.ts` says which
 * constraint the store owes for that.
 *
 * Problems are returned as coded refusals rather than prose, so a caller can
 * branch on what went wrong without matching English.
 */
export declare function verifyStudyEventChain(events: readonly StudyEvent[], expectedHeadHash?: string | null): StudyChainVerification;
/**
 * Add one event to a study's trail.
 *
 * The sequence, the previous-event link, the starting status and the resulting
 * status are all read from the trail rather than accepted from the caller: they
 * are what make the chain checkable, and a chain whose links the writer chooses
 * is a chain that proves nothing.
 *
 * `expectedHeadHash` is **required**, and null is a claim rather than a default:
 * it says the caller believes the trail is empty. Appending to a stale read is
 * how a fork gets written -- two events naming one predecessor, each in a chain
 * that verifies -- so the read is checked against the head the caller holds
 * before an event is built on it. What that does not close is the window between
 * this check and the store's write; `persistence.ts` names the compare-and-set
 * the store owes for that.
 *
 * The existing trail is verified before anything is appended. Extending a
 * history that does not verify would produce a longer history that does not
 * verify, and would put the break further from the event that caused it.
 */
export declare function appendStudyEvent(study: Study, events: readonly StudyEvent[], expectedHeadHash: string | null, input: StudyEventInput): {
    ok: true;
    event: StudyEvent;
} | {
    ok: false;
    refusal: StudyRefusal;
};
export {};
//# sourceMappingURL=study.d.ts.map