/**
 * Worker callback transport (RFC 0005).
 *
 * How the worker gets a job and returns a result, without a shared secret and
 * without the payload ever passing through an environment variable or a log
 * line.
 *
 * The worker is started with only a job id and a base URL. It then:
 *
 *   1. mints a Google-signed identity token from the instance metadata server,
 *      audienced to the control plane,
 *   2. claims the job, receiving the validated manifest over TLS,
 *   3. executes it,
 *   4. posts the result back.
 *
 * Three properties follow from that shape, and each is the reason for it:
 *
 * **No secret exists to leak or rotate.** The identity token is minted per call
 * by the platform, expires in an hour, and is bound to one audience. Nothing is
 * stored in the image, in an environment variable, or in a secret manager, so
 * there is no credential whose compromise would matter and none whose rotation
 * anyone has to remember.
 *
 * **The job payload stays out of the process environment.** Passing a manifest
 * through an env var would put a scientific payload into `gcloud run jobs
 * describe` output, into audit entries, and into any crash dump that captures
 * the environment. Fetching it over TLS keeps it in memory only.
 *
 * **The result never travels through stdout.** Worker stdout is captured by the
 * platform's logging, so returning results that way would write every scientific
 * result into a log sink with a different retention and access policy than the
 * registry. The stdout path is kept for local runs; in the callback path stdout
 * carries progress lines and nothing else.
 */
/** How the worker identifies itself. Resolved fresh for each request. */
export interface IdentityTokenSource {
    /** Return a bearer token valid for `audience`, or null when unavailable. */
    fetchIdentityToken(audience: string): Promise<string | null>;
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