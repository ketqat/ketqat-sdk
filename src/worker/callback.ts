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
  fetchIdentityToken(audience: string): Promise<string | null>
}

export interface CallbackConfig {
  /** Control-plane origin, e.g. `https://ketqat.com`. Also the token audience. */
  apiBaseUrl: string
  /** The job to claim. Supplied by the dispatcher; carries no authority itself. */
  jobId: string
  /** Attempt number, so the control plane can enforce a retry ceiling. */
  attempt: number
  fetchImpl?: typeof fetch
  identity?: IdentityTokenSource
}

export class CallbackError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = "CallbackError"
    this.retryable = retryable
  }
}

const METADATA_HOST = "http://metadata.google.internal"

/**
 * The platform's own identity endpoint.
 *
 * Only reachable from inside a Google-managed instance, and it requires the
 * `Metadata-Flavor` header, which a browser cannot set cross-origin. That is
 * what makes it safe to treat a token from here as proof of which service
 * account the container runs as.
 */
export const metadataIdentity: IdentityTokenSource = {
  async fetchIdentityToken(audience: string): Promise<string | null> {
    const url =
      `${METADATA_HOST}/computeMetadata/v1/instance/service-accounts/default/identity` +
      `?audience=${encodeURIComponent(audience)}&format=full`
    try {
      const response = await fetch(url, { headers: { "Metadata-Flavor": "Google" } })
      if (!response.ok) return null
      const token = (await response.text()).trim()
      return token.length > 0 ? token : null
    } catch {
      // Not running on the platform. The caller reports this as a configuration
      // error rather than falling back to an unauthenticated request, because a
      // silent fallback would turn a misconfiguration into an open endpoint.
      return null
    }
  },
}

/**
 * A 5xx or a network failure may succeed on another attempt; a 4xx will not.
 *
 * Distinguished so a rejected job is not retried until the attempt ceiling is
 * exhausted. Retrying a validation failure wastes the budget and delays the
 * error reaching the person who submitted it.
 */
function classify(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function authorizedFetch(
  config: CallbackConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch
  const identity = config.identity ?? metadataIdentity
  const token = await identity.fetchIdentityToken(config.apiBaseUrl)
  if (!token) {
    throw new CallbackError(
      "No workload identity token is available. The worker authenticates as its service " +
        "account; it has no fallback credential and will not send an unauthenticated request.",
      false,
    )
  }

  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${token}`)
  headers.set("content-type", "application/json")
  headers.set("x-ketqat-attempt", String(config.attempt))

  let response: Response
  try {
    response = await fetchImpl(`${config.apiBaseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
    })
  } catch (error) {
    throw new CallbackError(
      `Could not reach the control plane at ${config.apiBaseUrl}: ${(error as Error).message}`,
      true,
    )
  }

  if (!response.ok) {
    // The body may carry an explanation, but it may also carry anything the
    // control plane chose to say. Truncated so a large error page cannot become
    // the worker's own log volume.
    const detail = (await response.text().catch(() => "")).slice(0, 500)
    throw new CallbackError(
      `${init.method ?? "GET"} ${path} returned ${response.status}${detail ? `: ${detail}` : ""}`,
      classify(response.status),
    )
  }

  return response
}

/**
 * Claim the job, transitioning it to RUNNING under the control plane's lock.
 *
 * Claiming is a write, not a read: two workers started for the same job -- which
 * a retry or a duplicate dispatch can cause -- must not both execute it. The
 * control plane accepts exactly one claim and rejects the rest, so the guarantee
 * lives in one place rather than in every worker.
 */
export async function claimJob(config: CallbackConfig): Promise<unknown> {
  const response = await authorizedFetch(config, `/api/execution/jobs/${config.jobId}/claim`, {
    method: "POST",
    body: JSON.stringify({ attempt: config.attempt }),
  })
  return response.json()
}

/**
 * Report the outcome.
 *
 * Sent for failures and timeouts as well as successes. A worker that dies
 * silently leaves a job RUNNING until it is reaped, and a reaped job cannot say
 * why it failed -- so reporting a failure is more valuable than reporting a
 * success.
 */
export async function reportResult(config: CallbackConfig, result: unknown): Promise<void> {
  await authorizedFetch(config, `/api/execution/jobs/${config.jobId}/result`, {
    method: "POST",
    body: JSON.stringify(result),
  })
}

/** Read the callback configuration the dispatcher passes in the environment. */
export function callbackConfigFromEnv(
  env: Record<string, string | undefined>,
): CallbackConfig | null {
  const apiBaseUrl = env.KETQAT_API_BASE_URL?.trim()
  const jobId = env.KETQAT_JOB_ID?.trim()
  if (!apiBaseUrl || !jobId) return null

  const attempt = Number.parseInt(env.KETQAT_JOB_ATTEMPT ?? "1", 10)
  return {
    apiBaseUrl,
    jobId,
    attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : 1,
  }
}
