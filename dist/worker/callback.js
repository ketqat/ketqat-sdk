/**
 * Authenticated worker callbacks. Scientific payloads stay in HTTPS bodies,
 * never deployment overrides or logs. Google metadata identity remains the
 * default for the current GCP deployment/rollback; AWS explicitly selects the
 * request-bound signer with an injected workload key. Local callers can supply
 * any IdentityTokenSource without coupling the quantum engine to a cloud.
 */
import { signedRequestIdentity } from "./signed-identity.js";
export class CallbackError extends Error {
    constructor(message, retryable) {
        super(message);
        this.name = "CallbackError";
        this.retryable = retryable;
    }
}
const METADATA_HOST = "http://metadata.google.internal";
/**
 * The platform's own identity endpoint.
 *
 * Only reachable from inside a Google-managed instance, and it requires the
 * `Metadata-Flavor` header, which a browser cannot set cross-origin. That is
 * what makes it safe to treat a token from here as proof of which service
 * account the container runs as.
 */
export const metadataIdentity = {
    async fetchIdentityToken(audience) {
        const url = `${METADATA_HOST}/computeMetadata/v1/instance/service-accounts/default/identity` +
            `?audience=${encodeURIComponent(audience)}&format=full`;
        try {
            const response = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
            if (!response.ok)
                return null;
            const token = (await response.text()).trim();
            return token.length > 0 ? token : null;
        }
        catch {
            // Not running on the platform. The caller reports this as a configuration
            // error rather than falling back to an unauthenticated request, because a
            // silent fallback would turn a misconfiguration into an open endpoint.
            return null;
        }
    },
};
/**
 * A 5xx or a network failure may succeed on another attempt; a 4xx will not.
 *
 * Distinguished so a rejected job is not retried until the attempt ceiling is
 * exhausted. Retrying a validation failure wastes the budget and delays the
 * error reaching the person who submitted it.
 */
function classify(status) {
    return status >= 500 || status === 408 || status === 429;
}
async function authorizedFetch(config, path, init) {
    const fetchImpl = config.fetchImpl ?? fetch;
    const identity = config.identity ?? metadataIdentity;
    const token = await identity.fetchIdentityToken(config.apiBaseUrl, {
        method: init.method ?? "GET", path, body: String(init.body ?? ""), attempt: config.attempt,
    });
    if (!token) {
        throw new CallbackError("No workload identity token is available. The worker authenticates as its service " +
            "account; it has no fallback credential and will not send an unauthenticated request.", false);
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("content-type", "application/json");
    headers.set("x-ketqat-attempt", String(config.attempt));
    let response;
    try {
        response = await fetchImpl(`${config.apiBaseUrl.replace(/\/$/, "")}${path}`, {
            ...init,
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(75000),
        });
    }
    catch (error) {
        throw new CallbackError(`Could not reach the control plane at ${config.apiBaseUrl}: ${error.message}`, true);
    }
    if (!response.ok) {
        // The body may carry an explanation, but it may also carry anything the
        // control plane chose to say. Truncated so a large error page cannot become
        // the worker's own log volume.
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        throw new CallbackError(`${init.method ?? "GET"} ${path} returned ${response.status}${detail ? `: ${detail}` : ""}`, classify(response.status));
    }
    return response;
}
/**
 * Claim the job, transitioning it to RUNNING under the control plane's lock.
 *
 * Claiming is a write, not a read: two workers started for the same job -- which
 * a retry or a duplicate dispatch can cause -- must not both execute it. The
 * control plane accepts exactly one claim and rejects the rest, so the guarantee
 * lives in one place rather than in every worker.
 */
export async function claimJob(config) {
    const response = await authorizedFetch(config, `/api/execution/jobs/${config.jobId}/claim`, {
        method: "POST",
        body: JSON.stringify({ attempt: config.attempt }),
    });
    return response.json();
}
/**
 * Report the outcome.
 *
 * Sent for failures and timeouts as well as successes. A worker that dies
 * silently leaves a job RUNNING until it is reaped, and a reaped job cannot say
 * why it failed -- so reporting a failure is more valuable than reporting a
 * success.
 */
export async function reportResult(config, result) {
    await authorizedFetch(config, `/api/execution/jobs/${config.jobId}/result`, {
        method: "POST",
        body: JSON.stringify(result),
    });
}
/** Read the callback configuration the dispatcher passes in the environment. */
export function callbackConfigFromEnv(env) {
    const apiBaseUrl = env.KETQAT_API_BASE_URL?.trim();
    const jobId = env.KETQAT_JOB_ID?.trim();
    if (!apiBaseUrl || !jobId)
        return null;
    const attempt = Number.parseInt(env.KETQAT_JOB_ATTEMPT ?? "1", 10);
    const mode = env.KETQAT_WORKER_AUTH_MODE ?? "google-oidc";
    if (!["google-oidc", "signed-request"].includes(mode))
        throw new Error("Unknown worker authentication mode");
    if (mode === "signed-request") {
        const origin = new URL(apiBaseUrl);
        if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
            throw new Error("Signed callbacks require an HTTPS origin");
        }
    }
    return {
        apiBaseUrl,
        jobId,
        attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : 1,
        ...(mode === "signed-request" ? { identity: signedRequestIdentity(env.KETQAT_WORKER_CALLBACK_SECRET ?? "") } : {}),
    };
}
//# sourceMappingURL=callback.js.map