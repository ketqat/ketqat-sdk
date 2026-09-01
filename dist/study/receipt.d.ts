import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type ExecutionResourceClass, type RevisionRef } from "./common.js";
import { type StudyPlan } from "./plan.js";
import type { StudyRefusal } from "./refusals.js";
/**
 * What a server recorded when somebody said yes (goal §7, ADR 0014).
 *
 * A `confirmedPlanHash` -- one 64-hex string, passed as an argument -- used to
 * be the whole authorization for hosted execution. It answers exactly one
 * question: whether the contents somebody approved are the contents that would
 * run. Every other question a run raises it cannot answer, and each of them has
 * a way of going wrong that leaves the hash comparison passing:
 *
 * - **Who approved?** A hash carries no subject, so an approval by a read-only
 *   collaborator and an approval by the account owner are one string.
 * - **On whose behalf, through which client?** A token minted for a reporting
 *   integration and one minted for the console produce the same hash.
 * - **Approving what spend?** A plan revision can be confirmed once and then
 *   run a hundred times; a hash has no ceiling and no count.
 * - **Having seen what?** The plan is not what a user reads. A summary is, and
 *   a summary that omitted the credit ceiling would produce an approval for a
 *   plan the person never saw.
 * - **Until when?** A hash approved in March still matches in December.
 * - **Once, or once per retry?** Nothing about a hash is idempotent, so a
 *   retried confirmation request is a second authorization nobody made.
 *
 * A receipt answers all of them, and states plainly what it is not.
 *
 * ## What this record establishes
 *
 * **That this server recorded this actor confirming this plan revision.** That
 * is the whole of it. The receipt is the server's own statement, made with the
 * server's own integrity: a reader who does not trust the server that wrote it
 * has no reason to trust it, and a reader who does gets an audit record naming
 * the subject, the tenant, the client, the scope, the ceiling, the summary that
 * was actually rendered, and the moment.
 *
 * ## What it does not establish
 *
 * **It is not a user's cryptographic signature.** No key belonging to the
 * person named in `actor_subject_id` is involved at any point. Nothing here is
 * signed, `attestation_level` stays `hash_only` (ADR 0014), and no surface may
 * render a receipt as "signed", "authentic" or "verified by the user". A hash
 * that matches proves two byte sequences are the same byte sequence; every
 * further claim needs evidence this repository does not have.
 *
 * It does not establish that the summary in `shown_summary_hash` was
 * *understood*, that the actor had authority within their organisation, or that
 * the plan is scientifically sound. It establishes that a request arrived, that
 * it carried these credentials, and that the server wrote down what it saw.
 *
 * ## Creation, and why it is a transaction
 *
 * `buildConfirmationReceipt` requires the latest plan revision as an argument
 * rather than treating it as optional, and the caller must read it **inside the
 * same database transaction that inserts the receipt**
 * (`confirmation_receipt_plan_compare_and_set` in `persistence.ts`). Without
 * that, the window between reading the plan and writing the receipt is a window
 * in which the plan can be revised, and the receipt that lands authorises a
 * revision nobody was shown. The SDK can compare what the caller read; only the
 * store can make the read and the write atomic, and `persistence.ts` says so
 * rather than implying the check happened here.
 *
 * ## Revision, and why there is no edit
 *
 * A plan updated after confirmation invalidates the receipt. The plan's digest
 * moves, `plan_ref.revision_hash` stops matching, and `verifyConfirmationReceipt`
 * refuses -- structurally, not procedurally: nothing has to remember to revoke
 * anything. The answer is a **new confirmation**, from a person, against the new
 * revision. There is no function on this module that edits a receipt, and there
 * will not be one: a receipt is a record of something that happened, and
 * something that happened does not change.
 */
/**
 * Where the confirmation came from.
 *
 * Closed, because the channel changes what the actor can have seen: a console
 * user reads a rendered plan, and an API caller receives a summary they may have
 * generated themselves. `shown_summary_hash` is the field that pins what was
 * rendered, and the channel is what tells a reader how much weight it carries.
 */
export declare const ConfirmationChannelSchema: z.ZodEnum<["WEB_CONSOLE", "REST_API", "CLI", "MCP_CLIENT"]>;
export type ConfirmationChannel = z.infer<typeof ConfirmationChannelSchema>;
export declare const AuthorizationScopeSchema: z.ZodString;
/**
 * A nonce, as lowercase hex with at least 128 bits in it.
 *
 * Its job is to make two confirmations of one plan revision by one actor two
 * distinguishable records, so that a replayed request cannot be mistaken for
 * the original. 32 hex digits is the floor because a nonce a caller can guess
 * is a nonce that does not distinguish anything.
 */
export declare const ConfirmationNonceSchema: z.ZodString;
/**
 * The idempotency key the client sent.
 *
 * Distinct from the nonce and not interchangeable with it. The nonce is the
 * server's proof that two confirmations are different; the key is the client's
 * claim that two requests are the *same*, so a retried request produces the
 * receipt that already exists instead of a second authorization nobody made.
 * `confirmation_receipt_idempotency_unique` in `persistence.ts` is what makes
 * that claim enforceable.
 */
export declare const IdempotencyKeySchema: z.ZodString;
/**
 * What a receipt says it does not establish.
 *
 * Written by the builder rather than supplied by the caller, so that a receipt
 * cannot exist without them. They are the two sentences that ADR 0014 forbids
 * every surface from contradicting, and a caller who could omit them would
 * produce a receipt that a rendering layer would then have to be trusted to
 * caption correctly.
 */
export declare const CONFIRMATION_RECEIPT_LIMITATIONS: readonly string[];
export interface ConfirmationReceipt {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    plan_ref: RevisionRef;
    plan_semantic_hash: string;
    shown_summary_hash: string;
    authorization_scope: string[];
    estimated_credits: number;
    max_credits: number;
    resource_class: ExecutionResourceClass;
    data_handling_policy_revision: string;
    expires_at: string;
    limitations: string[];
    attestation_level: "hash_only";
    actor_subject_id: string;
    tenant_id: string;
    oauth_client_id: string;
    confirmation_channel: ConfirmationChannel;
    confirmed_at: string;
    nonce: string;
    idempotency_key: string;
    content_hash: string;
}
export declare const ConfirmationReceiptSchema: Contract<ConfirmationReceipt>;
export interface ConfirmationReceiptInput {
    /** The plan revision the actor was shown and confirmed. */
    plan: StudyPlan;
    /**
     * The newest plan revision, **re-read inside the transaction that writes this
     * receipt**. Required rather than optional: an authorization built against a
     * plan somebody may have revised in the meantime is the failure this record
     * exists to prevent, and an optional argument is one a caller omits.
     */
    latestPlanRevision: RevisionRef;
    /** `artifactHash` of the summary that was actually rendered to the actor. */
    shownSummaryHash: string;
    actorSubjectId: string;
    tenantId: string;
    oauthClientId: string;
    authorizationScope: string[];
    /** What the actor was shown this would cost. Refused above the plan's ceiling. */
    estimatedCredits: number;
    resourceClass: ExecutionResourceClass;
    dataHandlingPolicyRevision: string;
    confirmationChannel: ConfirmationChannel;
    confirmedAt: string;
    expiresAt: string;
    nonce: string;
    idempotencyKey: string;
    /** Additional limitations. The two standing ones are written whatever a caller passes. */
    limitations?: string[];
}
/**
 * Record a confirmation, or say why there is nothing to record.
 *
 * The plan is re-canonicalized before anything is written, so a receipt is
 * never produced for a plan that was edited after it was written or for a
 * revision a later one has replaced -- both are refusals with different codes,
 * because one asks somebody to look at the plan again and the other asks them
 * to approve the current one.
 *
 * `max_credits` is read off the plan rather than taken as input, and
 * `plan_semantic_hash` is recomputed rather than accepted: a receipt whose
 * ceiling or whose content digest came from the caller would let the
 * authorization say something the plan does not.
 */
export declare function buildConfirmationReceipt(input: ConfirmationReceiptInput): {
    ok: true;
    receipt: ConfirmationReceipt;
} | {
    ok: false;
    refusal: StudyRefusal;
};
export interface ConfirmationReceiptCheck {
    /** The newest plan revision the store knows, where the caller has read one. */
    latestPlanRevision?: RevisionRef | null;
    /** The moment to judge expiry against. Omit and expiry is not checked, and the result says so. */
    at?: string;
}
/**
 * Whether this receipt still authorises this plan.
 *
 * Five statements have to hold, and each failure is a separate code because
 * each needs a different fix:
 *
 * 1. the receipt hashes to the hash written on it -- otherwise it was edited,
 *    and whatever it authorises now is not what the server recorded;
 * 2. the plan hashes to the hash written on it -- otherwise the plan was
 *    edited, and no confirmation applies to it;
 * 3. the receipt's `plan_ref` and `plan_semantic_hash` are this plan's -- both,
 *    because the first is the pointer and the second is the content;
 * 4. the receipt and the plan belong to the same study;
 * 5. the receipt has not expired.
 *
 * A plan revised after confirmation fails (3) and the answer is a new
 * confirmation. The receipt is not edited to point at the new revision; a
 * receipt records something that happened, and pointing it at a plan the actor
 * never saw would make the record false.
 *
 * Expiry is checked only when `at` is supplied, and the absence is not silently
 * treated as "not expired": a caller with no clock gets the other four answers
 * and is told nothing about the fifth.
 */
export declare function verifyConfirmationReceipt(receipt: ConfirmationReceipt, plan: StudyPlan, check?: ConfirmationReceiptCheck): {
    ok: true;
} | {
    ok: false;
    refusal: StudyRefusal;
};
/**
 * Whether a receipt's scopes cover the permission an operation needs.
 *
 * A membership test over the declared list rather than a prefix or wildcard
 * match: `study:execute_all` starts with `study:execute` and is a different
 * permission, and a comparison that could not tell them apart would widen every
 * scope by accident.
 */
export declare function receiptGrantsScope(receipt: ConfirmationReceipt, scope: string): boolean;
//# sourceMappingURL=receipt.d.ts.map