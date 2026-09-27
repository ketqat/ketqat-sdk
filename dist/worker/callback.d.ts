/**
 * Authenticated worker callbacks. Scientific payloads stay in HTTPS bodies,
 * never deployment overrides or logs. Google metadata identity remains the
 * default for the current GCP deployment/rollback; AWS explicitly selects the
 * request-bound signer with an injected workload key. Local callers can supply
 * any IdentityTokenSource without coupling the quantum engine to a cloud.
 */
/** How the worker identifies itself. Resolved fresh for each request. */
export interface IdentityTokenSource {
    /** Return a bearer token valid for `audience`, or null when unavailable. */
    fetchIdentityToken(audience: string, request?: {
        method: string;
        path: string;
        body: string;
        attempt: number;
    }): Promise<string | null>;
}
export interface CallbackConfig {
    /** Control-plane origin, e.g. `https://ketqat.com`. Also the token audience. */
    apiBaseUrl: string;
    /** The job to claim. Supplied by the dispatcher; carries no authority itself. */
    jobId: string;
    /** Attempt number, so the control plane can enforce a retry ceiling. */
    attempt: number;
    fetchImpl?: typeof fetch;
    identity?: IdentityTokenSource;
}
export declare class CallbackError extends Error {
    readonly retryable: boolean;
    constructor(message: string, retryable: boolean);
}
/**
 * The platform's own identity endpoint.
 *
 * Only reachable from inside a Google-managed instance, and it requires the
 * `Metadata-Flavor` header, which a browser cannot set cross-origin. That is
 * what makes it safe to treat a token from here as proof of which service
 * account the container runs as.
 */
export declare const metadataIdentity: IdentityTokenSource;
/**
 * Claim the job, transitioning it to RUNNING under the control plane's lock.
 *
 * Claiming is a write, not a read: two workers started for the same job -- which
 * a retry or a duplicate dispatch can cause -- must not both execute it. The
 * control plane accepts exactly one claim and rejects the rest, so the guarantee
 * lives in one place rather than in every worker.
 */
export declare function claimJob(config: CallbackConfig): Promise<unknown>;
/**
 * Report the outcome.
 *
 * Sent for failures and timeouts as well as successes. A worker that dies
 * silently leaves a job RUNNING until it is reaped, and a reaped job cannot say
 * why it failed -- so reporting a failure is more valuable than reporting a
 * success.
 */
export declare function reportResult(config: CallbackConfig, result: unknown): Promise<void>;
/** Read the callback configuration the dispatcher passes in the environment. */
export declare function callbackConfigFromEnv(env: Record<string, string | undefined>): CallbackConfig | null;
//# sourceMappingURL=callback.d.ts.map