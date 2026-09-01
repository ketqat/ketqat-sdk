import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import {
  AttestationLevelSchema,
  ContentHashSchema,
  ExecutionResourceClassSchema,
  RevisionRefSchema,
  STUDY_SCHEMA_VERSION,
  type ExecutionResourceClass,
  type RevisionRef,
} from "./common.js"
import { semanticHash, studySelfHash } from "./hash.js"
import { AuthenticatedSubjectSchema, StudyIdSchema } from "./identity.js"
import { verifyPlanConfirmation, type StudyPlan } from "./plan.js"
import type { StudyRefusal } from "./refusals.js"
import { STUDY_HASH_RULES_ID } from "./rules.js"
import { FiniteFloatSchema } from "./values.js"

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
export const ConfirmationChannelSchema = z.enum([
  "WEB_CONSOLE",
  "REST_API",
  "CLI",
  "MCP_CLIENT",
])
export type ConfirmationChannel = z.infer<typeof ConfirmationChannelSchema>

/**
 * One authorization scope, in `resource:action` form.
 *
 * A pattern rather than a closed enum, because scopes are minted by the
 * authorization server and this family is not it. What is pinned is the
 * spelling: `study:execute` and `Study:Execute` name one permission and would
 * be two strings in a digest and two entries in a membership test, so the
 * non-canonical spellings are refused where they are written.
 */
const AUTHORIZATION_SCOPE = /^[a-z][a-z0-9_]{0,63}:[a-z][a-z0-9_]{0,63}$/

export const AuthorizationScopeSchema = z.string().regex(AUTHORIZATION_SCOPE, {
  message:
    "An authorization scope is `resource:action` in lowercase, letters, digits and underscores. Two spellings of " +
    "one permission are two entries in a membership test, and the test is what decides whether a run is allowed.",
})

/**
 * A nonce, as lowercase hex with at least 128 bits in it.
 *
 * Its job is to make two confirmations of one plan revision by one actor two
 * distinguishable records, so that a replayed request cannot be mistaken for
 * the original. 32 hex digits is the floor because a nonce a caller can guess
 * is a nonce that does not distinguish anything.
 */
export const ConfirmationNonceSchema = z.string().regex(/^[0-9a-f]{32,128}$/, {
  message:
    "A confirmation nonce is 32 to 128 lowercase hex digits: at least 128 bits, one spelling. It is what makes " +
    "two confirmations of one plan revision two records rather than one repeated.",
})

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
export const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, {
  message:
    "An idempotency key is 16 to 128 characters of unreserved URL-safe text. It is the client's statement that a " +
    "retry is the same request, and the store's unique index is what makes the statement mean anything.",
})

/**
 * What a receipt says it does not establish.
 *
 * Written by the builder rather than supplied by the caller, so that a receipt
 * cannot exist without them. They are the two sentences that ADR 0014 forbids
 * every surface from contradicting, and a caller who could omit them would
 * produce a receipt that a rendering layer would then have to be trusted to
 * caption correctly.
 */
export const CONFIRMATION_RECEIPT_LIMITATIONS: readonly string[] = Object.freeze([
  "This receipt is this server's record that an actor confirmed this plan revision. It is not a cryptographic " +
    "signature by that actor: no key of theirs is involved, and attestation_level is hash_only (ADR 0014).",
  "A matching hash establishes that two byte sequences are the same byte sequence. It does not establish that the " +
    "plan is correct, that the actor had authority to approve it, or that the summary they were shown was understood.",
])

export interface ConfirmationReceipt {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  plan_ref: RevisionRef
  plan_semantic_hash: string
  shown_summary_hash: string
  authorization_scope: string[]
  estimated_credits: number
  max_credits: number
  resource_class: ExecutionResourceClass
  data_handling_policy_revision: string
  expires_at: string
  limitations: string[]
  attestation_level: "hash_only"
  actor_subject_id: string
  tenant_id: string
  oauth_client_id: string
  confirmation_channel: ConfirmationChannel
  confirmed_at: string
  nonce: string
  idempotency_key: string
  content_hash: string
}

export const ConfirmationReceiptSchema: Contract<ConfirmationReceipt> = z
  .object({
    schema_version: z.string().min(1),
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /**
     * The exact plan revision that was confirmed.
     *
     * `SEMANTIC`, and the binding the whole record exists to carry: a receipt
     * for revision 4 and a receipt for revision 7 are different authorizations,
     * and this is the field that says which.
     */
    plan_ref: RevisionRefSchema,
    /**
     * The plan's semantic digest, recomputed from the plan's own contents at the
     * moment of confirmation.
     *
     * Carried beside `plan_ref` rather than derived from it, and the two answer
     * different questions. `plan_ref.revision_hash` is the record digest -- was
     * this file edited -- and it moves when a comment or a title moves.
     * `plan_semantic_hash` is what the plan *proposes*: the baselines, the
     * candidates, the pinned versions, the ceilings. A receipt that named only
     * the pointer would commit to a revision number; this commits to the science
     * the actor approved, and `verifyConfirmationReceipt` recomputes both.
     */
    plan_semantic_hash: ContentHashSchema,
    /**
     * The digest of the summary the actor was actually shown.
     *
     * A plan is a record; a summary is what a person reads. They are not the
     * same artifact and a confirmation is given against the second. Taken with
     * `artifactHash` over the rendered bytes, so a surface that omitted the
     * credit ceiling from what it displayed cannot later claim the ceiling was
     * approved.
     */
    shown_summary_hash: ContentHashSchema,
    /**
     * What this confirmation permits, as the scopes the token carried.
     *
     * Required and non-empty: a receipt with no scope authorises nothing, and an
     * empty list would read as "everything" to whichever consumer checked
     * membership with a length test rather than a lookup.
     */
    authorization_scope: z.array(AuthorizationScopeSchema).min(1),
    /**
     * What the plan expected this to cost, at the moment it was approved.
     *
     * A `finite_float`, and a number the actor saw rather than an envelope: the
     * estimate itself lives on the plan with its evidence class and its
     * uncertainty, and what belongs here is the figure that was put in front of
     * a person beside the ceiling they were agreeing to.
     */
    estimated_credits: FiniteFloatSchema.nonnegative(),
    /**
     * The hard ceiling this confirmation authorises. Copied from the plan, never
     * supplied by a caller: a receipt that could raise its own ceiling would let
     * an approval authorise a spend the plan did not propose.
     */
    max_credits: FiniteFloatSchema.positive(),
    /** Which kind of machine this confirmation authorises. A hardware run is not a simulation approval. */
    resource_class: ExecutionResourceClassSchema,
    /**
     * Which revision of the data-handling policy was in force.
     *
     * A revision identifier rather than the policy text: what the actor agreed
     * to is a document with its own history, and copying its prose here would
     * make a policy update an edit to every receipt ever written.
     */
    data_handling_policy_revision: z.string().min(1).max(128),
    /**
     * When this authorization stops being one.
     *
     * `SEMANTIC` although it is a timestamp, because it is a *limit the
     * confirmation carries* rather than an observation the server made -- the
     * same reading that puts `resource_limits.max_runtime` in the semantic
     * projection and `started_at` outside it. Two receipts differing only in
     * their expiry authorise different things.
     */
    expires_at: IsoDateTimeSchema,
    /** What this receipt does not establish, in the record rather than in a caption. */
    limitations: z.array(z.string().min(1)).min(1),
    attestation_level: AttestationLevelSchema,
    /**
     * The identity provider's subject for the person who confirmed.
     *
     * `RECEIPT_ONLY`: this is the server's record of who it believed was acting,
     * which is exactly what a receipt digest is for. It is not a signature and
     * no surface may render it as one.
     */
    actor_subject_id: AuthenticatedSubjectSchema,
    /** Which tenant the actor was acting within. */
    tenant_id: AuthenticatedSubjectSchema,
    /** Which OAuth client presented the token. A reporting integration is not a console session. */
    oauth_client_id: AuthenticatedSubjectSchema,
    confirmation_channel: ConfirmationChannelSchema,
    /** When the server observed the confirmation. */
    confirmed_at: IsoDateTimeSchema,
    nonce: ConfirmationNonceSchema,
    idempotency_key: IdempotencyKeySchema,
    /** The receipt's own digest: `recordHash`, over everything except the three `DERIVED` fields. */
    content_hash: ContentHashSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (Date.parse(receipt.expires_at) <= Date.parse(receipt.confirmed_at)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A receipt confirmed at ${receipt.confirmed_at} and expiring at ${receipt.expires_at} authorises ` +
          "nothing for any length of time. An expiry at or before the confirmation is a receipt that was never " +
          "valid, which is a different record from one that has lapsed.",
        path: ["expires_at"],
      })
    }
    if (receipt.estimated_credits > receipt.max_credits) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `The plan expects ${receipt.estimated_credits} credits and the ceiling is ${receipt.max_credits}. ` +
          "A confirmation whose own estimate exceeds the ceiling it carries is an approval of a run that cannot " +
          "be permitted to finish.",
        path: ["estimated_credits"],
      })
    }
  }) as unknown as Contract<ConfirmationReceipt>

export interface ConfirmationReceiptInput {
  /** The plan revision the actor was shown and confirmed. */
  plan: StudyPlan
  /**
   * The newest plan revision, **re-read inside the transaction that writes this
   * receipt**. Required rather than optional: an authorization built against a
   * plan somebody may have revised in the meantime is the failure this record
   * exists to prevent, and an optional argument is one a caller omits.
   */
  latestPlanRevision: RevisionRef
  /** `artifactHash` of the summary that was actually rendered to the actor. */
  shownSummaryHash: string
  actorSubjectId: string
  tenantId: string
  oauthClientId: string
  authorizationScope: string[]
  /** What the actor was shown this would cost. Refused above the plan's ceiling. */
  estimatedCredits: number
  resourceClass: ExecutionResourceClass
  dataHandlingPolicyRevision: string
  confirmationChannel: ConfirmationChannel
  confirmedAt: string
  expiresAt: string
  nonce: string
  idempotencyKey: string
  /** Additional limitations. The two standing ones are written whatever a caller passes. */
  limitations?: string[]
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
export function buildConfirmationReceipt(
  input: ConfirmationReceiptInput,
): { ok: true; receipt: ConfirmationReceipt } | { ok: false; refusal: StudyRefusal } {
  const subject = `study plan revision ${input.plan.revision}`

  const confirmation = verifyPlanConfirmation(
    input.plan,
    input.plan.content_hash,
    input.latestPlanRevision,
  )
  if (!confirmation.ok) return confirmation

  if (input.estimatedCredits > input.plan.max_credits) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CREDITS_MAXIMUM_EXCEEDED",
        message:
          `The estimate shown to the actor is ${input.estimatedCredits} credits and the plan's ceiling is ` +
          `${input.plan.max_credits}. Recording the confirmation would authorise a run that the plan's own limit ` +
          "would stop partway, which spends the credits and produces nothing quotable.",
      },
    }
  }

  const withoutHash = {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    study_ref: input.plan.study_ref,
    plan_ref: { revision_hash: input.plan.content_hash, revision: input.plan.revision },
    plan_semantic_hash: semanticHash("study_plan", input.plan),
    shown_summary_hash: input.shownSummaryHash,
    authorization_scope: [...input.authorizationScope],
    estimated_credits: input.estimatedCredits,
    max_credits: input.plan.max_credits,
    resource_class: input.resourceClass,
    data_handling_policy_revision: input.dataHandlingPolicyRevision,
    expires_at: input.expiresAt,
    limitations: [...CONFIRMATION_RECEIPT_LIMITATIONS, ...(input.limitations ?? [])],
    attestation_level: "hash_only" as const,
    actor_subject_id: input.actorSubjectId,
    tenant_id: input.tenantId,
    oauth_client_id: input.oauthClientId,
    confirmation_channel: input.confirmationChannel,
    confirmed_at: input.confirmedAt,
    nonce: input.nonce,
    idempotency_key: input.idempotencyKey,
  }

  return {
    ok: true,
    receipt: ConfirmationReceiptSchema.parse({
      ...withoutHash,
      content_hash: studySelfHash("confirmation_receipt", withoutHash),
    }),
  }
}

export interface ConfirmationReceiptCheck {
  /** The newest plan revision the store knows, where the caller has read one. */
  latestPlanRevision?: RevisionRef | null
  /** The moment to judge expiry against. Omit and expiry is not checked, and the result says so. */
  at?: string
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
export function verifyConfirmationReceipt(
  receipt: ConfirmationReceipt,
  plan: StudyPlan,
  check: ConfirmationReceiptCheck = {},
): { ok: true } | { ok: false; refusal: StudyRefusal } {
  const subject = `confirmation receipt for study plan revision ${receipt.plan_ref.revision}`

  const receiptHashNow = studySelfHash("confirmation_receipt", receipt)
  if (receiptHashNow !== receipt.content_hash) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_RECEIPT_EDITED",
        message:
          `The receipt claims hash ${receipt.content_hash} and its own contents canonicalize to ` +
          `${receiptHashNow}. It was edited after it was written, so it is no longer the server's record of what ` +
          "was confirmed -- and a receipt is only ever that.",
      },
    }
  }

  const planHashNow = studySelfHash("study_plan", plan)
  if (planHashNow !== plan.content_hash) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_HASH_MISMATCH",
        message:
          `The plan claims hash ${plan.content_hash} and its own contents canonicalize to ${planHashNow}. ` +
          "It was edited after it was written, so no confirmation applies to it.",
      },
    }
  }

  if (receipt.plan_ref.revision_hash !== planHashNow) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "PLAN_REVISION_SUPERSEDED",
        message:
          `The receipt authorises revision ${receipt.plan_ref.revision} ` +
          `(${receipt.plan_ref.revision_hash}), and the plan in hand is revision ${plan.revision} ` +
          `(${planHashNow}). What was approved and what would run are two different plans, and the answer is a ` +
          "new confirmation rather than an edit to this one.",
      },
    }
  }

  const planSemanticNow = semanticHash("study_plan", plan)
  if (receipt.plan_semantic_hash !== planSemanticNow) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_HASH_MISMATCH",
        message:
          `The receipt records the plan's semantic hash as ${receipt.plan_semantic_hash} and the plan's own ` +
          `contents canonicalize to ${planSemanticNow}. The pointer matches and the content does not, which is ` +
          "the case a revision-hash comparison alone would report as intact.",
      },
    }
  }

  if (receipt.study_ref !== plan.study_ref) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_RECEIPT_STUDY_MISMATCH",
        message:
          `The receipt belongs to study ${receipt.study_ref} and the plan to ${plan.study_ref}. An approval given ` +
          "inside one study does not authorise work inside another, however similar the two plans are.",
      },
    }
  }

  if (check.latestPlanRevision != null && check.latestPlanRevision.revision_hash !== planHashNow) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "PLAN_REVISION_SUPERSEDED",
        message:
          `Revision ${check.latestPlanRevision.revision} (${check.latestPlanRevision.revision_hash}) is now the ` +
          "newest plan. A confirmation of an earlier revision does not carry forward: the plan changed, so the " +
          "approval has to.",
      },
    }
  }

  if (check.at !== undefined && Date.parse(check.at) >= Date.parse(receipt.expires_at)) {
    return {
      ok: false,
      refusal: {
        subject,
        code: "CONFIRMATION_RECEIPT_EXPIRED",
        message:
          `The receipt expired at ${receipt.expires_at} and the run would start at ${check.at}. An approval has a ` +
          "shelf life because the thing it approved -- prices, queue depths, what the actor believed -- does not " +
          "stay true. A new confirmation is required.",
      },
    }
  }

  return { ok: true }
}

/**
 * Whether a receipt's scopes cover the permission an operation needs.
 *
 * A membership test over the declared list rather than a prefix or wildcard
 * match: `study:execute_all` starts with `study:execute` and is a different
 * permission, and a comparison that could not tell them apart would widen every
 * scope by accident.
 */
export function receiptGrantsScope(receipt: ConfirmationReceipt, scope: string): boolean {
  return receipt.authorization_scope.includes(scope)
}
