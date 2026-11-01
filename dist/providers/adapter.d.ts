import { z } from "zod";
import type { QuantumCircuit } from "../circuit/graph.js";
import type { HardwareProfile } from "../hardware/profile.js";
/**
 * BYOC provider adapter contract (ADR 0004, RFC 0005).
 *
 * BYOC means the user already has an account with the provider and KetQat never
 * holds that relationship. The rules below are structural, not advisory:
 *
 * - **Credentials are passed as an argument, never stored on the adapter.** No
 *   field on any type here holds one, so there is nothing for a serializer, a
 *   logger, or a database write to pick up.
 * - **A credential is never logged.** `redactCredentials` exists because a
 *   stack trace or a debug dump containing a token is a normal accident, not a
 *   lapse in discipline.
 * - **Absent credentials produce a NOT_RUN record.** Never a fixture that
 *   imitates an executed hardware result -- such a fixture is indistinguishable
 *   from a real one in a screenshot, and eventually someone cites it.
 * - **Submission requires explicit confirmation** of provider, backend, shots,
 *   estimated cost, and quota. Confirmation is per submission and does not
 *   carry over.
 */
export declare const ProviderCredentialSchema: z.ZodObject<{
    token: z.ZodString;
    scope: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;
export declare const SubmissionEstimateSchema: z.ZodObject<{
    provider: z.ZodString;
    backend: z.ZodString;
    shots: z.ZodNumber;
    estimated_cost: z.ZodNullable<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodString;
    }, z.core.$strip>>;
    remaining_quota: z.ZodNullable<z.ZodNumber>;
    confirmation_prompt: z.ZodString;
    warnings: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type SubmissionEstimate = z.infer<typeof SubmissionEstimateSchema>;
export declare const NOT_RUN_REASONS: readonly ["credentials_unavailable", "confirmation_declined", "provider_unsupported_feature", "quota_exhausted"];
export type NotRunReason = (typeof NOT_RUN_REASONS)[number];
/**
 * The record produced when hardware execution did not happen.
 *
 * Its own type, distinct from a result, so it cannot be mistaken for one by a
 * consumer reading a field it happens to share.
 */
export declare const NotRunRecordSchema: z.ZodObject<{
    status: z.ZodLiteral<"NOT_RUN">;
    reason: z.ZodEnum<{
        confirmation_declined: "confirmation_declined";
        credentials_unavailable: "credentials_unavailable";
        provider_unsupported_feature: "provider_unsupported_feature";
        quota_exhausted: "quota_exhausted";
    }>;
    provider: z.ZodString;
    backend: z.ZodString;
    detail: z.ZodString;
    recorded_at: z.ZodString;
    counts: z.ZodOptional<z.ZodUndefined>;
}, z.core.$strip>;
export type NotRunRecord = z.infer<typeof NotRunRecordSchema>;
export declare const ProviderSubmissionSchema: z.ZodObject<{
    status: z.ZodEnum<{
        COMPLETED: "COMPLETED";
        FAILED: "FAILED";
        SUBMITTED: "SUBMITTED";
    }>;
    provider: z.ZodString;
    backend: z.ZodString;
    provider_job_id: z.ZodString;
    shots: z.ZodNumber;
    execution_class: z.ZodEnum<{
        HARDWARE: "HARDWARE";
        SIMULATION: "SIMULATION";
    }>;
    counts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    hardware_snapshot_id: z.ZodOptional<z.ZodString>;
    loss_report: z.ZodDefault<z.ZodArray<z.ZodCustom<{
        feature: string;
        severity: "cosmetic" | "semantic" | "structural";
        action: "approximated" | "dropped" | "rejected";
        detail: string;
        location?: string | undefined;
    }, {
        feature: string;
        severity: "cosmetic" | "semantic" | "structural";
        action: "approximated" | "dropped" | "rejected";
        detail: string;
        location?: string | undefined;
    }>>>;
    submitted_at: z.ZodString;
}, z.core.$strip>;
export type ProviderSubmission = z.infer<typeof ProviderSubmissionSchema>;
export interface ProviderAdapter {
    readonly provider: string;
    readonly version: string;
    /** Device snapshot, so a circuit can be compiled before any spend. */
    describeBackend(backend: string, credential?: ProviderCredential): Promise<HardwareProfile>;
    /** What the user must see and confirm. Must not submit anything. */
    estimate(circuit: QuantumCircuit, backend: string, shots: number, credential?: ProviderCredential): Promise<SubmissionEstimate>;
    /**
     * Submit, after confirmation.
     *
     * `credential` is an argument rather than adapter state, so it lives only for
     * the duration of this call. Returns a NotRunRecord rather than throwing when
     * execution legitimately did not happen.
     */
    submit(circuit: QuantumCircuit, backend: string, shots: number, options: {
        credential?: ProviderCredential;
        confirmed: boolean;
    }): Promise<ProviderSubmission | NotRunRecord>;
}
export declare class ProviderError extends Error {
    constructor(message: string);
}
export declare function notRun(provider: string, backend: string, reason: NotRunReason, detail: string): NotRunRecord;
/**
 * Deep-redact secret-looking values.
 *
 * Applied before anything is logged or serialized for storage. A stack trace or
 * a debug dump carrying a token is an ordinary accident, so the defence is a
 * function rather than a rule that reviewers must remember.
 */
export declare function redactCredentials<T>(value: T): T;
/**
 * Build the confirmation a user must accept before any spend.
 *
 * An unknown cost is reported as unknown, with a warning. Rendering it as zero
 * would be the difference between an informed decision and a surprise invoice.
 */
export declare function buildEstimate(input: {
    provider: string;
    backend: string;
    shots: number;
    estimatedCost?: {
        amount: number;
        currency: string;
    } | null;
    remainingQuota?: number | null;
    warnings?: string[];
}): SubmissionEstimate;
//# sourceMappingURL=adapter.d.ts.map