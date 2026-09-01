import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { SafeIntegerSchema } from "./values.js"

/**
 * What happens to the inputs and the outputs, as a policy rather than a
 * sentence (goal §10.4).
 *
 * A plan is what somebody confirms, and `data_handling: string` made the one
 * paragraph they read the only place the answer existed. "Inputs and outputs
 * stay in the customer's tenancy; only hashes leave it" is a promise no code
 * can check, no store can enforce and no reviewer can diff. Two plans could
 * make contradictory promises in prose and nothing would notice, because
 * nothing was reading it.
 *
 * So the eleven decisions are fields, each from a closed list, and the
 * paragraph is **generated from them** by `dataHandlingSummary`. That direction
 * is the point. A summary stored beside the policy is a second statement of the
 * same thing, free to disagree with it -- and when they disagree, the reader
 * believes the prose and the enforcement follows the fields, which is the worst
 * of both. Deriving it means the sentence a user confirms cannot say anything
 * the policy does not.
 *
 * The refinements at the bottom refuse policies that contradict themselves.
 * They are not style: a private study offered as a public dataset is two
 * decisions that cannot both hold, and the record is where the contradiction
 * has to fail rather than in whichever system reads it first.
 */

/** Who can see the study. */
export const DataVisibilitySchema = z.enum(["PRIVATE", "ORGANISATION", "PUBLIC"])
export type DataVisibility = z.infer<typeof DataVisibilitySchema>

export const RetentionKindSchema = z.enum([
  "DELETE_AFTER_DAYS",
  "RETAIN_WHILE_STUDY_LIVES",
  "RETAIN_INDEFINITELY",
])
export type RetentionKind = z.infer<typeof RetentionKindSchema>

export interface DataRetention {
  kind: RetentionKind
  days: number | null
}

/**
 * How long the data is kept by default.
 *
 * `days` is a `safe_integer` under the contracts in `values.ts`: a retention
 * period that reached 2^53 days would be a field classified wrong rather than a
 * long-lived study.
 */
export const DataRetentionSchema: Contract<DataRetention> = z
  .object({
    kind: RetentionKindSchema,
    days: SafeIntegerSchema.min(1).nullable(),
  })
  .strict()
  .superRefine((retention, context) => {
    const needsDays = retention.kind === "DELETE_AFTER_DAYS"
    if (needsDays && retention.days === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A policy that deletes after a period has to say what the period is.",
        path: ["days"],
      })
    }
    if (!needsDays && retention.days !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A period is stated beside ${retention.kind}, which does not delete on one. A reader would take the ` +
          "number for a deletion date.",
        path: ["days"],
      })
    }
  }) as unknown as Contract<DataRetention>

/** Who else receives the data. */
export const ThirdPartyTransferSchema = z.enum(["NONE", "QUANTUM_PROVIDER_ONLY", "NAMED_PROCESSORS"])
export type ThirdPartyTransfer = z.infer<typeof ThirdPartyTransferSchema>

/**
 * Whether the data may train a model.
 *
 * Three members, because the middle one is the one people actually mean:
 * aggregates over many studies are how a resource model improves, and a policy
 * with only "yes" and "no" pushes that use under whichever of the two is
 * looser.
 */
export const ModelTrainingUseSchema = z.enum(["FORBIDDEN", "PERMITTED_ON_AGGREGATES", "PERMITTED"])
export type ModelTrainingUse = z.infer<typeof ModelTrainingUseSchema>

export const EgressKindSchema = z.enum(["NONE", "HASHES_ONLY", "QUANTUM_PROVIDER_API", "NAMED_HOST"])
export type EgressKind = z.infer<typeof EgressKindSchema>

export interface AllowedEgress {
  kind: EgressKind
  host: string | null
}

export const AllowedEgressSchema: Contract<AllowedEgress> = z
  .object({
    kind: EgressKindSchema,
    /** The host, for `NAMED_HOST` and for nothing else: a host beside `NONE` would be a hole with a name. */
    host: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((egress, context) => {
    const needsHost = egress.kind === "NAMED_HOST"
    if (needsHost && egress.host === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NAMED_HOST names a host.",
        path: ["host"],
      })
    }
    if (!needsHost && egress.host !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A host is named beside ${egress.kind}, which does not reach one.`,
        path: ["host"],
      })
    }
  }) as unknown as Contract<AllowedEgress>

/** What may leave the study as a file a person takes with them. */
export const ExportPermissionSchema = z.enum(["NONE", "HASHES_ONLY", "SUMMARY", "FULL"])
export type ExportPermission = z.infer<typeof ExportPermissionSchema>

export const DeletionKindSchema = z.enum(["ON_REQUEST", "ON_SCHEDULE", "NOT_OFFERED"])
export type DeletionKind = z.infer<typeof DeletionKindSchema>

export interface DeletionPolicy {
  kind: DeletionKind
  within_days: number | null
}

/**
 * What happens when deletion is asked for.
 *
 * Separate from retention, and not a restatement of it: retention says how long
 * the data is kept if nobody intervenes, and this says whether intervening is
 * possible and how quickly it takes effect. A policy can retain indefinitely
 * and still delete on request; one that retains for thirty days may still not
 * offer deletion inside them.
 */
export const DeletionPolicySchema: Contract<DeletionPolicy> = z
  .object({
    kind: DeletionKindSchema,
    within_days: SafeIntegerSchema.min(1).nullable(),
  })
  .strict()
  .superRefine((deletion, context) => {
    const offered = deletion.kind !== "NOT_OFFERED"
    if (offered && deletion.within_days === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A deletion that is offered has a period inside which it happens; otherwise it is an intention.",
        path: ["within_days"],
      })
    }
    if (!offered && deletion.within_days !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A period is stated beside a deletion that is not offered.",
        path: ["within_days"],
      })
    }
  }) as unknown as Contract<DeletionPolicy>

/** How credentials are handled. `hash_only` attestation says nothing about this; the policy does. */
export const SecretHandlingSchema = z.enum(["NONE_PRESENT", "PER_JOB_NEVER_PERSISTED", "REFERENCED_BY_VAULT"])
export type SecretHandling = z.infer<typeof SecretHandlingSchema>

/** Whether personal data is in scope at all. */
export const PiiHandlingSchema = z.enum(["NONE_PRESENT", "PSEUDONYMISED", "PRESENT_RESTRICTED"])
export type PiiHandling = z.infer<typeof PiiHandlingSchema>

export interface DataHandlingPolicy {
  visibility: DataVisibility
  retention: DataRetention
  third_party_transfer: ThirdPartyTransfer
  model_training_use: ModelTrainingUse
  public_dataset_opt_in: boolean
  allowed_egress: AllowedEgress[]
  export_permission: ExportPermission
  deletion_policy: DeletionPolicy
  secret_handling: SecretHandling
  pii_handling: PiiHandling
  policy_version: string
}

export const DataHandlingPolicySchema: Contract<DataHandlingPolicy> = z
  .object({
    visibility: DataVisibilitySchema,
    retention: DataRetentionSchema,
    third_party_transfer: ThirdPartyTransferSchema,
    model_training_use: ModelTrainingUseSchema,
    public_dataset_opt_in: z.boolean(),
    /**
     * At least one entry, and `NONE` is written rather than implied.
     *
     * An empty list is indistinguishable from a policy nobody filled in, and
     * the two mean opposite things: no egress is a decision, and an unfilled
     * field is the absence of one.
     */
    allowed_egress: z.array(AllowedEgressSchema).min(1),
    export_permission: ExportPermissionSchema,
    deletion_policy: DeletionPolicySchema,
    secret_handling: SecretHandlingSchema,
    pii_handling: PiiHandlingSchema,
    /** Which version of the organisation's data policy this was written against. */
    policy_version: z.string().min(1),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.visibility === "PRIVATE" && policy.public_dataset_opt_in) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A private study cannot also be offered as a public dataset; one of the two decisions is wrong.",
        path: ["public_dataset_opt_in"],
      })
    }
    const kinds = policy.allowed_egress.map((entry) => entry.kind)
    if (kinds.includes("NONE") && policy.allowed_egress.length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NONE beside another destination is a policy that permits egress and says it permits none.",
        path: ["allowed_egress"],
      })
    }
    const spellings = policy.allowed_egress.map((entry) => `${entry.kind}:${entry.host ?? ""}`)
    if (new Set(spellings).size !== spellings.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A destination is permitted twice; one permission would then have two spellings.",
        path: ["allowed_egress"],
      })
    }
    const reachesOutward = kinds.includes("QUANTUM_PROVIDER_API") || kinds.includes("NAMED_HOST")
    if (policy.third_party_transfer === "NONE" && reachesOutward) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The policy permits egress to a third party and states that nothing is transferred to one. Egress is " +
          "how a transfer happens, so the two cannot both hold.",
        path: ["third_party_transfer"],
      })
    }
    if (policy.pii_handling === "PRESENT_RESTRICTED" && policy.model_training_use !== "FORBIDDEN") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Personal data is present under restricted access and the policy permits training on it. Restricted " +
          "access is not a property a trained model keeps.",
        path: ["model_training_use"],
      })
    }
  }) as unknown as Contract<DataHandlingPolicy>

/**
 * One clause per member of one field, as immutable plain data.
 *
 * The summary is assembled from these, so the sentence a user reads is a
 * function of the fields and nothing else. Each table is checked against its
 * enum at load: a member with no clause would otherwise produce a summary that
 * silently omits a decision, which is the failure this whole file exists to
 * prevent, reintroduced in the renderer.
 */
export interface DataHandlingClause {
  readonly member: string
  readonly clause: string
}

const clauses = (
  field: string,
  options: readonly string[],
  table: readonly DataHandlingClause[],
): ReadonlyMap<string, string> => {
  const lookup = new Map(table.map((entry) => [entry.member, entry.clause]))
  for (const option of options) {
    if (!lookup.has(option)) {
      throw new Error(`Data handling field ${field} has no summary clause for ${option}.`)
    }
  }
  if (lookup.size !== options.length) {
    throw new Error(`Data handling field ${field} has a summary clause for a member it does not declare.`)
  }
  return lookup
}

const VISIBILITY_CLAUSES = clauses("visibility", DataVisibilitySchema.options, [
  { member: "PRIVATE", clause: "Visible only to the study's owner." },
  { member: "ORGANISATION", clause: "Visible to the owning organisation." },
  { member: "PUBLIC", clause: "Publicly visible." },
])

const RETENTION_CLAUSES = clauses("retention", RetentionKindSchema.options, [
  { member: "DELETE_AFTER_DAYS", clause: "Inputs and outputs are deleted after {days} days." },
  { member: "RETAIN_WHILE_STUDY_LIVES", clause: "Inputs and outputs are kept while the study exists." },
  { member: "RETAIN_INDEFINITELY", clause: "Inputs and outputs are kept indefinitely." },
])

const TRANSFER_CLAUSES = clauses("third_party_transfer", ThirdPartyTransferSchema.options, [
  { member: "NONE", clause: "Nothing is transferred to a third party." },
  { member: "QUANTUM_PROVIDER_ONLY", clause: "Only the quantum provider a run is submitted to receives anything." },
  { member: "NAMED_PROCESSORS", clause: "Named processors receive study data." },
])

const TRAINING_CLAUSES = clauses("model_training_use", ModelTrainingUseSchema.options, [
  { member: "FORBIDDEN", clause: "Nothing here is used to train a model." },
  { member: "PERMITTED_ON_AGGREGATES", clause: "Aggregates across studies may be used to train a model." },
  { member: "PERMITTED", clause: "This study's data may be used to train a model." },
])

const EGRESS_CLAUSES = clauses("allowed_egress", EgressKindSchema.options, [
  { member: "NONE", clause: "nothing" },
  { member: "HASHES_ONLY", clause: "content hashes" },
  { member: "QUANTUM_PROVIDER_API", clause: "the quantum provider's API" },
  { member: "NAMED_HOST", clause: "{host}" },
])

const EXPORT_CLAUSES = clauses("export_permission", ExportPermissionSchema.options, [
  { member: "NONE", clause: "Nothing may be exported." },
  { member: "HASHES_ONLY", clause: "Only hashes may be exported." },
  { member: "SUMMARY", clause: "A summary may be exported." },
  { member: "FULL", clause: "The full record may be exported." },
])

const DELETION_CLAUSES = clauses("deletion_policy", DeletionKindSchema.options, [
  { member: "ON_REQUEST", clause: "Deleted on request, within {days} days." },
  { member: "ON_SCHEDULE", clause: "Deleted on a schedule, within {days} days." },
  { member: "NOT_OFFERED", clause: "Deletion on request is not offered." },
])

const SECRET_CLAUSES = clauses("secret_handling", SecretHandlingSchema.options, [
  { member: "NONE_PRESENT", clause: "No credentials are involved." },
  { member: "PER_JOB_NEVER_PERSISTED", clause: "Credentials are supplied per job and never persisted." },
  { member: "REFERENCED_BY_VAULT", clause: "Credentials are referenced from a vault and never held here." },
])

const PII_CLAUSES = clauses("pii_handling", PiiHandlingSchema.options, [
  { member: "NONE_PRESENT", clause: "No personal data is present." },
  { member: "PSEUDONYMISED", clause: "Personal data is pseudonymised." },
  { member: "PRESENT_RESTRICTED", clause: "Personal data is present, under restricted access." },
])

function clauseFor(lookup: ReadonlyMap<string, string>, member: string): string {
  const found = lookup.get(member)
  if (found === undefined) {
    throw new Error(`No summary clause for ${member}; the load-time check above should have caught this.`)
  }
  return found
}

/**
 * The human-readable summary, generated from the policy.
 *
 * There is deliberately no field to store this in. A stored summary is a second
 * statement of the same decisions, and a reader who is shown one and an
 * enforcement path that reads the other is exactly the arrangement that lets a
 * plan promise one thing and do another.
 */
export function dataHandlingSummary(policy: DataHandlingPolicy): string {
  const egress = policy.allowed_egress
    .map((entry) => clauseFor(EGRESS_CLAUSES, entry.kind).replace("{host}", entry.host ?? ""))
    .join(", ")
  return [
    clauseFor(VISIBILITY_CLAUSES, policy.visibility),
    clauseFor(RETENTION_CLAUSES, policy.retention.kind).replace("{days}", String(policy.retention.days ?? "")),
    clauseFor(TRANSFER_CLAUSES, policy.third_party_transfer),
    clauseFor(TRAINING_CLAUSES, policy.model_training_use),
    policy.public_dataset_opt_in
      ? "Offered as a public dataset."
      : "Not offered as a public dataset.",
    `Egress is limited to ${egress}.`,
    clauseFor(EXPORT_CLAUSES, policy.export_permission),
    clauseFor(DELETION_CLAUSES, policy.deletion_policy.kind).replace(
      "{days}",
      String(policy.deletion_policy.within_days ?? ""),
    ),
    clauseFor(SECRET_CLAUSES, policy.secret_handling),
    clauseFor(PII_CLAUSES, policy.pii_handling),
    `Data policy version ${policy.policy_version}.`,
  ].join(" ")
}
