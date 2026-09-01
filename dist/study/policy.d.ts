import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
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
export declare const DataVisibilitySchema: z.ZodEnum<["PRIVATE", "ORGANISATION", "PUBLIC"]>;
export type DataVisibility = z.infer<typeof DataVisibilitySchema>;
export declare const RetentionKindSchema: z.ZodEnum<["DELETE_AFTER_DAYS", "RETAIN_WHILE_STUDY_LIVES", "RETAIN_INDEFINITELY"]>;
export type RetentionKind = z.infer<typeof RetentionKindSchema>;
export interface DataRetention {
    kind: RetentionKind;
    days: number | null;
}
/**
 * How long the data is kept by default.
 *
 * `days` is a `safe_integer` under the contracts in `values.ts`: a retention
 * period that reached 2^53 days would be a field classified wrong rather than a
 * long-lived study.
 */
export declare const DataRetentionSchema: Contract<DataRetention>;
/** Who else receives the data. */
export declare const ThirdPartyTransferSchema: z.ZodEnum<["NONE", "QUANTUM_PROVIDER_ONLY", "NAMED_PROCESSORS"]>;
export type ThirdPartyTransfer = z.infer<typeof ThirdPartyTransferSchema>;
/**
 * Whether the data may train a model.
 *
 * Three members, because the middle one is the one people actually mean:
 * aggregates over many studies are how a resource model improves, and a policy
 * with only "yes" and "no" pushes that use under whichever of the two is
 * looser.
 */
export declare const ModelTrainingUseSchema: z.ZodEnum<["FORBIDDEN", "PERMITTED_ON_AGGREGATES", "PERMITTED"]>;
export type ModelTrainingUse = z.infer<typeof ModelTrainingUseSchema>;
export declare const EgressKindSchema: z.ZodEnum<["NONE", "HASHES_ONLY", "QUANTUM_PROVIDER_API", "NAMED_HOST"]>;
export type EgressKind = z.infer<typeof EgressKindSchema>;
export interface AllowedEgress {
    kind: EgressKind;
    host: string | null;
}
export declare const AllowedEgressSchema: Contract<AllowedEgress>;
/** What may leave the study as a file a person takes with them. */
export declare const ExportPermissionSchema: z.ZodEnum<["NONE", "HASHES_ONLY", "SUMMARY", "FULL"]>;
export type ExportPermission = z.infer<typeof ExportPermissionSchema>;
export declare const DeletionKindSchema: z.ZodEnum<["ON_REQUEST", "ON_SCHEDULE", "NOT_OFFERED"]>;
export type DeletionKind = z.infer<typeof DeletionKindSchema>;
export interface DeletionPolicy {
    kind: DeletionKind;
    within_days: number | null;
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
export declare const DeletionPolicySchema: Contract<DeletionPolicy>;
/** How credentials are handled. `hash_only` attestation says nothing about this; the policy does. */
export declare const SecretHandlingSchema: z.ZodEnum<["NONE_PRESENT", "PER_JOB_NEVER_PERSISTED", "REFERENCED_BY_VAULT"]>;
export type SecretHandling = z.infer<typeof SecretHandlingSchema>;
/** Whether personal data is in scope at all. */
export declare const PiiHandlingSchema: z.ZodEnum<["NONE_PRESENT", "PSEUDONYMISED", "PRESENT_RESTRICTED"]>;
export type PiiHandling = z.infer<typeof PiiHandlingSchema>;
export interface DataHandlingPolicy {
    visibility: DataVisibility;
    retention: DataRetention;
    third_party_transfer: ThirdPartyTransfer;
    model_training_use: ModelTrainingUse;
    public_dataset_opt_in: boolean;
    allowed_egress: AllowedEgress[];
    export_permission: ExportPermission;
    deletion_policy: DeletionPolicy;
    secret_handling: SecretHandling;
    pii_handling: PiiHandling;
    policy_version: string;
}
export declare const DataHandlingPolicySchema: Contract<DataHandlingPolicy>;
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
    readonly member: string;
    readonly clause: string;
}
/**
 * The human-readable summary, generated from the policy.
 *
 * There is deliberately no field to store this in. A stored summary is a second
 * statement of the same decisions, and a reader who is shown one and an
 * enforcement path that reads the other is exactly the arrangement that lets a
 * plan promise one thing and do another.
 */
export declare function dataHandlingSummary(policy: DataHandlingPolicy): string;
//# sourceMappingURL=policy.d.ts.map