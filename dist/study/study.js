import { z } from "zod";
import { IsoDateTimeSchema } from "../contracts/common.js";
import { ContentHashSchema, RevisionRefSchema, STUDY_SCHEMA_VERSION, StudyPositionSchema, } from "./common.js";
import { recordHash, studySelfHash } from "./hash.js";
import { ProjectRefSchema, StudyIdSchema, newStudyId } from "./identity.js";
import { STUDY_HASH_RULES_ID } from "./rules.js";
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
export const StudyTypeSchema = z.enum([
    /** Could a fault-tolerant machine do this at all, and what would it have to reach. */
    "FTQC_FEASIBILITY",
    /** How a logical qubit built this way performs, measured against a stated code baseline. */
    "QEC_LOGICAL_BENCHMARK",
]);
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
export const StudyStatusSchema = z.enum([
    "DRAFT",
    "SPECIFIED",
    "PLANNED",
    "AWAITING_CONFIRMATION",
    "RUNNING",
    "NEEDS_INPUT",
    "CONCLUDED",
    "REFUSED",
    "RETRACTED",
    "CANCELLED",
    "SUPERSEDED",
]);
/** Every kind of thing that happens to a study. */
export const StudyEventTypeSchema = z.enum([
    "study_created",
    "specification_revised",
    "question_elicited",
    "answer_confirmed",
    "plan_created",
    "plan_superseded",
    "confirmation_requested",
    "confirmation_recorded",
    "task_authorised",
    "task_queued",
    "task_started",
    "task_completed",
    "task_failed",
    "task_cancelled",
    "conclusion_created",
    "conclusion_retracted",
    "study_refused",
    "study_cancelled",
    "study_superseded",
    "study_published",
    "reproduction_submitted",
    "review_recorded",
]);
/** Every status a study can be in while it is still going. */
const ALIVE = Object.freeze([
    "DRAFT",
    "SPECIFIED",
    "PLANNED",
    "AWAITING_CONFIRMATION",
    "RUNNING",
    "NEEDS_INPUT",
]);
/** The statuses a study can be doing something in, which is where a question interrupts. */
const INTERRUPTIBLE = Object.freeze([
    "DRAFT",
    "SPECIFIED",
    "PLANNED",
    "AWAITING_CONFIRMATION",
    "RUNNING",
]);
const rule = (event_type, permitted_from, outcome, requires_reason = false) => Object.freeze({
    event_type,
    permitted_from: permitted_from === null ? null : Object.freeze([...permitted_from]),
    outcome: Object.freeze(outcome),
    requires_reason,
});
const fixed = (to) => ({ kind: "fixed", to });
const unchanged = Object.freeze({ kind: "unchanged" });
const resumes = Object.freeze({ kind: "resumes" });
export const STUDY_EVENT_TYPES = Object.freeze([
    rule("study_created", null, fixed("DRAFT")),
    rule("specification_revised", ["DRAFT", "SPECIFIED"], fixed("SPECIFIED")),
    rule("question_elicited", INTERRUPTIBLE, fixed("NEEDS_INPUT")),
    rule("answer_confirmed", ["NEEDS_INPUT"], resumes),
    rule("plan_created", ["SPECIFIED", "PLANNED"], fixed("PLANNED")),
    rule("plan_superseded", ["PLANNED", "AWAITING_CONFIRMATION"], unchanged),
    rule("confirmation_requested", ["PLANNED"], fixed("AWAITING_CONFIRMATION")),
    rule("confirmation_recorded", ["AWAITING_CONFIRMATION"], unchanged),
    rule("task_authorised", ["AWAITING_CONFIRMATION"], unchanged),
    rule("task_queued", ["AWAITING_CONFIRMATION", "RUNNING"], unchanged),
    rule("task_started", ["AWAITING_CONFIRMATION", "RUNNING"], fixed("RUNNING")),
    rule("task_completed", ["RUNNING"], unchanged),
    rule("task_failed", ["RUNNING"], unchanged, true),
    rule("task_cancelled", ["RUNNING"], unchanged, true),
    rule("conclusion_created", ["RUNNING"], fixed("CONCLUDED")),
    rule("conclusion_retracted", ["CONCLUDED"], fixed("RETRACTED"), true),
    rule("study_refused", ALIVE, fixed("REFUSED"), true),
    rule("study_cancelled", ALIVE, fixed("CANCELLED"), true),
    rule("study_superseded", ["AWAITING_CONFIRMATION", "RUNNING", "CONCLUDED"], fixed("SUPERSEDED")),
    rule("study_published", ["CONCLUDED"], unchanged),
    rule("reproduction_submitted", ["CONCLUDED"], unchanged),
    rule("review_recorded", ["CONCLUDED"], unchanged),
]);
/**
 * The statuses nothing leaves, derived rather than declared.
 *
 * A status is terminal when no event type permits itself from it, which is a
 * fact about the table above and not a second list beside it. Declared
 * separately, the two could disagree -- a status could be called terminal while
 * an event quietly left it -- and the disagreement would be invisible, because
 * each list would be self-consistent.
 */
export const STUDY_TERMINAL_STATUSES = Object.freeze(StudyStatusSchema.options.filter((status) => STUDY_EVENT_TYPES.every((entry) => entry.permitted_from === null || !entry.permitted_from.includes(status))));
/** The working lookup, module-private and built from the frozen tuple. */
const rulesByEventType = new Map(STUDY_EVENT_TYPES.map((entry) => [entry.event_type, entry]));
/**
 * The rule for an event type, or null.
 *
 * A `Map` rather than an object literal, for the reason `registry.ts` gives: an
 * object literal answers to every name on `Object.prototype`, so an event type
 * of `"toString"` would resolve to a function and be handed on as a rule.
 */
export function studyEventRule(eventType) {
    return rulesByEventType.get(eventType) ?? null;
}
/**
 * Whether an event of this type may be recorded while the study is here.
 *
 * `null` for `from` means the study does not exist yet, which only the creation
 * event answers to. Modelling creation as an event out of nothing rather than as
 * a special case keeps the trail total: every status the study has ever been in
 * is the `to_status` of some event, including the first.
 */
export function isPermittedStudyEvent(eventType, from) {
    const entry = studyEventRule(eventType);
    if (entry === null)
        return false;
    if (entry.permitted_from === null)
        return from === null;
    return from !== null && entry.permitted_from.includes(from);
}
/**
 * The status a study reaches, given where it was and where it was before it
 * started waiting.
 *
 * `resumeStatus` is null for every event but `answer_confirmed`, and for that
 * one it is what the trail says: a study resumes to what it was doing, and a
 * caller who does not know that cannot be told to guess.
 */
export function studyStatusAfter(eventType, from, resumeStatus) {
    const entry = studyEventRule(eventType);
    if (entry === null)
        return null;
    if (entry.outcome.kind === "fixed")
        return entry.outcome.to;
    if (entry.outcome.kind === "unchanged")
        return from;
    return resumeStatus;
}
/**
 * The pairwise view, derived rather than declared.
 *
 * A reader who wants "what can a study at `RUNNING` become" gets it here, and it
 * cannot drift from the event table because it is computed from it at load.
 * Only events that *change* the status contribute: an `unchanged` event does not
 * move the study, so listing a status as reachable from itself would report
 * every non-transition event as a transition.
 *
 * `answer_confirmed` contributes the statuses a study can be waiting from, since
 * those are exactly the ones it can resume to. The one thing this view cannot
 * say is *which* of them any particular study resumes to -- that is a fact about
 * a trail, and `verifyStudyEventChain` is where it is checked.
 */
function deriveTransitions() {
    const out = {};
    for (const status of StudyStatusSchema.options)
        out[status] = [];
    for (const entry of STUDY_EVENT_TYPES) {
        if (entry.permitted_from === null)
            continue;
        for (const from of entry.permitted_from) {
            const targets = entry.outcome.kind === "fixed"
                ? [entry.outcome.to]
                : entry.outcome.kind === "resumes"
                    ? // A wait is resumed to whatever could have started it.
                        STUDY_EVENT_TYPES.filter((candidate) => candidate.outcome.kind === "fixed" && candidate.outcome.to === from)
                            .flatMap((candidate) => candidate.permitted_from ?? [])
                    : [];
            for (const to of targets) {
                if (to !== from && !out[from].includes(to))
                    out[from].push(to);
            }
        }
    }
    return Object.freeze(Object.fromEntries(Object.entries(out).map(([from, targets]) => [from, Object.freeze(targets.sort())])));
}
export const STUDY_STATUS_TRANSITIONS = deriveTransitions();
/**
 * Whether a study may move from one status to another at all.
 *
 * The weaker of the two questions, and kept because it is the one a display
 * layer asks. `isPermittedStudyEvent` is the rule; this says only that some
 * event makes the move, not which, and a caller deciding whether to *record*
 * something must ask the other one.
 */
export function isValidStudyTransition(from, to) {
    if (from === null)
        return to === "DRAFT";
    return STUDY_STATUS_TRANSITIONS[from].includes(to);
}
export const StudyCoreSchema = z
    .object({
    study_type: StudyTypeSchema,
    /**
     * The project this study belongs to, as an immutable ref.
     *
     * Was a registry slug. A slug is chosen for reading and edited when an
     * organisation renames itself, so a reference to one keeps resolving after
     * the thing it named has moved -- and this field is `SEMANTIC`, so a rename
     * would have read as a different study.
     */
    project_ref: ProjectRefSchema.nullable(),
    is_demo: z.boolean(),
})
    .strict();
export const StudyPresentationSchema = z
    .object({
    /** What the person asking would call this. Presentation: renaming is not a new study. */
    title: z.string().min(1),
    /**
     * A projection of the event trail, carried here so a list view does not have
     * to replay every study's history. Never a source of truth, and outside the
     * digest the study's identity is.
     */
    status: StudyStatusSchema,
    /** Denormalized pointer at the newest specification revision. */
    latest_specification: RevisionRefSchema.nullable(),
    /** Denormalized pointer at the newest plan revision. */
    latest_plan: RevisionRefSchema.nullable(),
})
    .strict();
export const StudySchema = z
    .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** Minted once by `newStudyId`, never derived from content. This is what `study_ref` points at. */
    study_id: StudyIdSchema,
    core: StudyCoreSchema,
    presentation: StudyPresentationSchema,
    /** `RECEIPT_ONLY`: the moment the server observed this record, not part of what it says. */
    created_at: IsoDateTimeSchema.optional(),
    /** SHA-256 over the id and the immutable core. Excluded from its own digest. */
    content_hash: ContentHashSchema,
})
    .strict();
/**
 * Create a study.
 *
 * The status is `DRAFT` and the revision pointers are null, because those are
 * projections of a trail that has no events in it yet: a study that reported
 * anything else at creation would be reporting a history it does not have.
 */
export function buildStudy(input) {
    const withoutHash = {
        schema_version: STUDY_SCHEMA_VERSION,
        hash_rules_id: STUDY_HASH_RULES_ID,
        study_id: input.studyId ?? newStudyId(),
        core: input.core,
        presentation: {
            title: input.title,
            status: "DRAFT",
            latest_specification: null,
            latest_plan: null,
        },
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    return StudySchema.parse({ ...withoutHash, content_hash: studySelfHash("study", withoutHash) });
}
/**
 * Restate the presentation, leaving the identity where it is.
 *
 * The whole point of the split, in a function: there is no parameter here that
 * could reach the core, so a rename cannot become a new study by accident, and
 * the returned record carries the same `content_hash` as the one passed in --
 * not because the hash was copied, but because it is recomputed over fields this
 * function cannot touch.
 */
export function updateStudyPresentation(study, changes) {
    const withoutHash = {
        ...study,
        presentation: { ...study.presentation, ...changes },
        content_hash: undefined,
    };
    return StudySchema.parse({ ...withoutHash, content_hash: studySelfHash("study", withoutHash) });
}
/**
 * What a reviewer said about a published package.
 *
 * A judgement by a person, and nothing to do with a hash: ADR 0014 forbids a
 * digest match being rendered as authentic or correct, and this field is where
 * an actual opinion is recorded instead.
 */
export const StudyReviewVerdictSchema = z.enum(["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"]);
const eventEnvelopeShape = {
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: StudyIdSchema,
    /** Position in the trail, starting at 1. */
    sequence: StudyPositionSchema,
    /** The `content_hash` of event n-1, or null for the first. This is the chain. */
    previous_event_hash: ContentHashSchema.nullable(),
    /** Null only on the creation event, which comes from no status at all. */
    from_status: StudyStatusSchema.nullable(),
    /** Where the study is after this event. Equal to `from_status` when the event moves nothing. */
    to_status: StudyStatusSchema,
    /**
     * Who did this, as a free string. Nothing here is signed, and an attribution
     * field that looked like a signature would claim a guarantee this repository
     * does not provide (ADR 0014 §3).
     */
    actor: z.string().min(1),
    /** Why, when there is a why. Null rather than an empty string, so "unstated" is visible. */
    reason: z.string().min(1).nullable(),
    /** `RECEIPT_ONLY`, like every other field of an event. Excluded from the semantic projection. */
    created_at: IsoDateTimeSchema.optional(),
    content_hash: ContentHashSchema,
};
const variant = (eventType, payload) => z.object({ event_type: z.literal(eventType), ...eventEnvelopeShape, ...payload }).strict();
const eventVariants = [
    variant("study_created", {}),
    variant("specification_revised", { specification_ref: RevisionRefSchema }),
    variant("question_elicited", { question: z.string().min(1) }),
    variant("answer_confirmed", { question: z.string().min(1) }),
    variant("plan_created", { plan_ref: RevisionRefSchema }),
    variant("plan_superseded", {
        plan_ref: RevisionRefSchema,
        superseded_plan_ref: RevisionRefSchema,
    }),
    variant("confirmation_requested", { plan_ref: RevisionRefSchema }),
    variant("confirmation_recorded", {
        plan_ref: RevisionRefSchema,
        /**
         * The hash the user actually confirmed.
         *
         * Carried beside `plan_ref` rather than assumed equal to it: the two agreeing
         * is what `verifyPlanConfirmation` establishes, and a record that stated it
         * once could not be checked.
         */
        confirmed_hash: ContentHashSchema,
        /**
         * The `ConfirmationReceipt` this confirmation produced.
         *
         * Required, because a trail that recorded only `confirmed_hash` recorded
         * that somebody approved a digest and nothing about who, through which
         * client, under which scope, or until when. Those are the questions a bare
         * hash cannot answer and that hosted execution has to (`receipt.ts`), and
         * an event that did not name the receipt would leave the audit trail unable
         * to reach it.
         */
        receipt_ref: ContentHashSchema,
    }),
    variant("task_authorised", { task_ref: ContentHashSchema, plan_ref: RevisionRefSchema }),
    variant("task_queued", { task_ref: ContentHashSchema }),
    variant("task_started", { task_ref: ContentHashSchema }),
    variant("task_completed", { task_ref: ContentHashSchema, capsule_ref: ContentHashSchema }),
    variant("task_failed", { task_ref: ContentHashSchema }),
    variant("task_cancelled", { task_ref: ContentHashSchema }),
    variant("conclusion_created", { package_ref: ContentHashSchema }),
    variant("conclusion_retracted", { package_ref: ContentHashSchema }),
    variant("study_refused", {}),
    variant("study_cancelled", {}),
    variant("study_superseded", { superseding_study_ref: StudyIdSchema }),
    variant("study_published", { package_ref: ContentHashSchema }),
    variant("reproduction_submitted", {
        package_ref: ContentHashSchema,
        reproduction_capsule_ref: ContentHashSchema,
    }),
    variant("review_recorded", {
        package_ref: ContentHashSchema,
        review_verdict: StudyReviewVerdictSchema,
    }),
];
export const StudyEventSchema = z
    .discriminatedUnion("event_type", [...eventVariants])
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
    // Creation is the only event recorded out of nothing, and the only event
    // recorded out of nothing is creation. Pairing the two in both directions
    // means a second creation cannot be spliced into a trail that has already
    // moved on, and no other event can claim the trail had not started.
    //
    // Reaching DRAFT is a weaker claim and is not pinned here: a study that
    // asked a question while still in DRAFT returns to DRAFT when the answer
    // arrives, which is the resumption rule working rather than a study being
    // drafted twice.
    if ((event.from_status === null) !== (event.event_type === "study_created")) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Only a study_created event has no prior status, and a study_created event has no prior status. " +
                `${event.event_type} at ${event.from_status ?? "no status"} is one of those two rules broken.`,
            path: ["from_status"],
        });
    }
    if (event.event_type === "study_created" && event.sequence !== 1) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A study is created once, and the creation event is the first event in the trail.",
            path: ["sequence"],
        });
    }
    const entry = studyEventRule(event.event_type);
    // Unreachable while the union and the table are built from one enum, and a
    // refusal rather than an assumption because a table row silently missing is
    // how a whole class of event stops being checked.
    if (entry === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `No rule is declared for event type ${event.event_type}, so nothing can say whether it is legal.`,
            path: ["event_type"],
        });
        return;
    }
    if (event.from_status !== null && !isPermittedStudyEvent(event.event_type, event.from_status)) {
        const permitted = entry.permitted_from ?? [];
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${event.event_type} event cannot be recorded while the study is at ${event.from_status}. ` +
                (permitted.length === 0
                    ? "It is recorded from no status at all, which only the creation event is."
                    : `It is permitted from: ${permitted.join(", ")}.`),
            path: ["event_type"],
        });
    }
    // `resumes` is deliberately not checked here: the status a study returns to
    // is a fact about its trail, not about one event, and asserting it from a
    // single record would mean asserting something this value cannot know.
    if (entry.outcome.kind === "fixed" && event.to_status !== entry.outcome.to) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${event.event_type} event leaves the study at ${entry.outcome.to}, not at ${event.to_status}.`,
            path: ["to_status"],
        });
    }
    if (entry.outcome.kind === "unchanged" && event.to_status !== event.from_status) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${event.event_type} event does not move the study, so it cannot record a change from ` +
                `${event.from_status ?? "no status"} to ${event.to_status}.`,
            path: ["to_status"],
        });
    }
    if (entry.requires_reason && event.reason === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${event.event_type} event must say why. This is the record a reader goes to when they ask what ` +
                "happened, and it is the only place an answer could be.",
            path: ["reason"],
        });
    }
});
/** What a chain verdict does not cover, as a closed list. */
export const STUDY_CHAIN_UNDETECTED_PROPERTIES = Object.freeze(["TRUNCATION"]);
/**
 * The status a trail was in before it started waiting, for the events that
 * resume.
 *
 * Read forward with the rest of the walk rather than searched for backwards, so
 * a trail that entered `NEEDS_INPUT` twice resumes each time to the status that
 * preceded *that* wait.
 */
function enteringWait(event) {
    return event.to_status === "NEEDS_INPUT" && event.from_status !== "NEEDS_INPUT";
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
export function verifyStudyEventChain(events, expectedHeadHash = null) {
    const problems = [];
    let previous = null;
    let resumeStatus = null;
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
        else if (!isPermittedStudyEvent(event.event_type, event.from_status)) {
            const entry = studyEventRule(event.event_type);
            problems.push({
                subject,
                code: "EVENT_TYPE_NOT_PERMITTED",
                message: `A ${event.event_type} event cannot be recorded while the study is at ` +
                    `${event.from_status ?? "no status"}. ` +
                    (entry === null
                        ? "This build declares no rule for that event type."
                        : `It is permitted from: ${(entry.permitted_from ?? ["no status"]).join(", ")}.`),
            });
        }
        else {
            // The resumption check, which is the one a pairwise status table cannot
            // make: a study that asked a question from PLANNED comes back to PLANNED,
            // not to whatever the ladder would also allow.
            const expectedTo = studyStatusAfter(event.event_type, event.from_status, resumeStatus);
            if (expectedTo !== null && event.to_status !== expectedTo) {
                problems.push({
                    subject,
                    code: "INVALID_STATUS_TRANSITION",
                    message: `A ${event.event_type} event here leaves the study at ${expectedTo}, and this one records ` +
                        `${event.to_status}.`,
                });
            }
            else if (expectedTo === null) {
                problems.push({
                    subject,
                    code: "INVALID_STATUS_TRANSITION",
                    message: "The event resumes a wait, and the trail records no status to resume to. A study cannot return to " +
                        "where it was if it was never anywhere.",
                });
            }
        }
        if (enteringWait(event))
            resumeStatus = event.from_status;
        previous = event;
    }
    // The anchor, checked last: everything above is about the trail's own
    // consistency, and this is the one question it cannot ask itself.
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
    return {
        valid: problems.length === 0,
        problems,
        head_checked: expectedHeadHash !== null,
        undetected: expectedHeadHash === null ? STUDY_CHAIN_UNDETECTED_PROPERTIES : Object.freeze([]),
    };
}
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
export function appendStudyEvent(study, events, expectedHeadHash, input) {
    const subject = `study ${study.study_id}`;
    const existing = verifyStudyEventChain(events);
    if (!existing.valid) {
        return { ok: false, refusal: existing.problems[0] };
    }
    const previous = events.length === 0 ? null : events[events.length - 1];
    const head = previous === null ? null : previous.content_hash;
    if (head !== expectedHeadHash) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "EVENT_HEAD_MISMATCH",
                message: `The trail in hand ends at ${head ?? "nothing"}, and the head this caller holds is ` +
                    `${expectedHeadHash ?? "nothing"}. One of the two is a stale read, and appending to a stale read is ` +
                    "how two events come to name one predecessor.",
            },
        };
    }
    if (previous !== null && previous.study_ref !== study.study_id) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "EVENT_CHAIN_BROKEN",
                message: `The trail belongs to study ${previous.study_ref}, not to ${study.study_id}. ` +
                    "Two studies' events are two trails, and neither continues the other.",
            },
        };
    }
    const fromStatus = previous === null ? null : previous.to_status;
    if (!isPermittedStudyEvent(input.event_type, fromStatus)) {
        const entry = studyEventRule(input.event_type);
        return {
            ok: false,
            refusal: {
                subject,
                code: "EVENT_TYPE_NOT_PERMITTED",
                message: `A ${input.event_type} event cannot be recorded while the study is at ` +
                    `${fromStatus ?? "no status yet"}. ` +
                    (entry === null
                        ? "This build declares no rule for that event type."
                        : entry.permitted_from === null
                            ? "It is recorded from no status at all, which is only true of a study that does not exist yet."
                            : `It is permitted from: ${entry.permitted_from.join(", ")}.`),
            },
        };
    }
    // Where the study resumes to, read off the trail: the status it was in when
    // it last started waiting.
    let resumeStatus = null;
    for (const event of events)
        if (enteringWait(event))
            resumeStatus = event.from_status;
    const toStatus = studyStatusAfter(input.event_type, fromStatus, resumeStatus);
    if (toStatus === null) {
        return {
            ok: false,
            refusal: {
                subject,
                code: "INVALID_STATUS_TRANSITION",
                message: `A ${input.event_type} event resumes a wait, and this trail records no status to resume to. A study ` +
                    "cannot return to where it was if it was never anywhere.",
            },
        };
    }
    const withoutHash = {
        ...input,
        reason: input.reason ?? null,
        schema_version: STUDY_SCHEMA_VERSION,
        hash_rules_id: STUDY_HASH_RULES_ID,
        study_ref: study.study_id,
        sequence: events.length + 1,
        previous_event_hash: head,
        from_status: fromStatus,
        to_status: toStatus,
    };
    // Stamp then hash, in `buildBundle`'s order. `recordHash` is what an event's
    // `content_hash` is: every declared field except the three `DERIVED` ones,
    // which is why stamping the record afterwards is not circular -- a record's
    // own hash cannot be an input to itself, and the projection does not read it.
    return {
        ok: true,
        event: StudyEventSchema.parse({
            ...withoutHash,
            content_hash: recordHash("study_event", withoutHash),
        }),
    };
}
//# sourceMappingURL=study.js.map