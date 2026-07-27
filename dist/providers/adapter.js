import { z } from "zod";
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
export const ProviderCredentialSchema = z.object({
    /** Opaque token. Held in memory for one submission and never returned. */
    token: z.string().min(1),
    /** Optional provider-specific scoping, e.g. an instance or project. */
    scope: z.string().min(1).optional(),
});
export const SubmissionEstimateSchema = z.object({
    provider: z.string().min(1),
    backend: z.string().min(1),
    shots: z.number().int().positive(),
    /**
     * Estimated cost as the provider reports it, or null when unknown. Null is
     * shown as "unknown", never as zero: displaying an unknown cost as free is
     * how a user gets a surprise invoice.
     */
    estimated_cost: z.object({ amount: z.number().nonnegative(), currency: z.string().min(1) }).nullable(),
    /** Remaining quota as the provider reports it, or null when unknown. */
    remaining_quota: z.number().nonnegative().nullable(),
    /** What the user must confirm, in words. */
    confirmation_prompt: z.string().min(1),
    /** Anything the user should know before spending, e.g. a queue warning. */
    warnings: z.array(z.string().min(1)).default([]),
});
export const NOT_RUN_REASONS = [
    "credentials_unavailable",
    "confirmation_declined",
    "provider_unsupported_feature",
    "quota_exhausted",
];
/**
 * The record produced when hardware execution did not happen.
 *
 * Its own type, distinct from a result, so it cannot be mistaken for one by a
 * consumer reading a field it happens to share.
 */
export const NotRunRecordSchema = z.object({
    status: z.literal("NOT_RUN"),
    reason: z.enum(NOT_RUN_REASONS),
    provider: z.string().min(1),
    backend: z.string().min(1),
    detail: z.string().min(1),
    recorded_at: z.string().min(1),
    /** Always absent. Present in the schema to state that it is never populated. */
    counts: z.undefined().optional(),
});
export const ProviderSubmissionSchema = z.object({
    status: z.enum(["SUBMITTED", "COMPLETED", "FAILED"]),
    provider: z.string().min(1),
    backend: z.string().min(1),
    provider_job_id: z.string().min(1),
    shots: z.number().int().positive(),
    /** HARDWARE only when the provider actually executed on a device. */
    execution_class: z.enum(["HARDWARE", "SIMULATION"]),
    counts: z.record(z.number().int().nonnegative()).optional(),
    /** Snapshot the circuit was compiled against, so the result is interpretable. */
    hardware_snapshot_id: z.string().min(1).optional(),
    loss_report: z.array(z.custom()).default([]),
    submitted_at: z.string().min(1),
});
export class ProviderError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProviderError";
    }
}
export function notRun(provider, backend, reason, detail) {
    return {
        status: "NOT_RUN",
        reason,
        provider,
        backend,
        detail,
        recorded_at: new Date().toISOString(),
    };
}
/** Keys whose values are redacted wherever they appear. */
const SECRET_KEYS = new Set([
    "token",
    "apikey",
    "api_key",
    "secret",
    "password",
    "credential",
    "credentials",
    "authorization",
    "access_token",
    "refresh_token",
]);
/**
 * Deep-redact secret-looking values.
 *
 * Applied before anything is logged or serialized for storage. A stack trace or
 * a debug dump carrying a token is an ordinary accident, so the defence is a
 * function rather than a rule that reviewers must remember.
 */
export function redactCredentials(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => redactCredentials(entry));
    }
    if (value && typeof value === "object") {
        const result = {};
        for (const [key, nested] of Object.entries(value)) {
            result[key] = SECRET_KEYS.has(key.toLowerCase()) ? "[redacted]" : redactCredentials(nested);
        }
        return result;
    }
    return value;
}
/**
 * Build the confirmation a user must accept before any spend.
 *
 * An unknown cost is reported as unknown, with a warning. Rendering it as zero
 * would be the difference between an informed decision and a surprise invoice.
 */
export function buildEstimate(input) {
    const cost = input.estimatedCost ?? null;
    const quota = input.remainingQuota ?? null;
    const warnings = [...(input.warnings ?? [])];
    if (cost === null) {
        warnings.push("The provider did not report a cost for this submission. Unknown is not the same as free; " +
            "check your provider account before confirming.");
    }
    if (quota === null) {
        warnings.push("The provider did not report remaining quota, so this submission may be refused.");
    }
    else if (quota <= 0) {
        warnings.push("The provider reports no remaining quota. This submission will very likely fail.");
    }
    const costText = cost ? `${cost.amount} ${cost.currency}` : "unknown";
    return SubmissionEstimateSchema.parse({
        provider: input.provider,
        backend: input.backend,
        shots: input.shots,
        estimated_cost: cost,
        remaining_quota: quota,
        confirmation_prompt: `Submit ${input.shots} shots to ${input.provider}/${input.backend}. ` +
            `Estimated cost: ${costText}. Remaining quota: ${quota === null ? "unknown" : quota}. ` +
            "This runs on hardware you are billed for.",
        warnings,
    });
}
//# sourceMappingURL=adapter.js.map