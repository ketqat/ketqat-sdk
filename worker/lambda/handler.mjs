import { callbackConfigFromEnv, claimJob, reportResult, validateJob } from "../../dist/worker/index.js"
import { runIsolatedJob } from "./run-isolated.mjs"

export const MAX_LAMBDA_JOB_SECONDS = 780

function invocation(event, context, env, mode) {
  const maximum = mode === "batch" ? 900 : MAX_LAMBDA_JOB_SECONDS
  if (!event || typeof event !== "object" || Array.isArray(event) ||
      Object.keys(event).some(key => !["version", "jobId", "attempt", "timeoutSeconds"].includes(key)) ||
      event.version !== 1 || typeof event.jobId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(event.jobId) ||
      !Number.isSafeInteger(event.attempt) || event.attempt < 1 ||
      !Number.isInteger(event.timeoutSeconds) || event.timeoutSeconds < 1 || event.timeoutSeconds > maximum) {
    throw new Error(mode === "batch" ? "Invalid Batch worker invocation" : "Invalid Lambda worker invocation; longer jobs require Batch")
  }
  if (!["staging", "production"].includes(env.KETQAT_DEPLOYMENT_ENV)) throw new Error("Missing worker environment")
  const origin = new URL(env.KETQAT_API_BASE_URL)
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) throw new Error("Invalid worker callback origin")
  if (context.getRemainingTimeInMillis() < event.timeoutSeconds * 1000 + 90_000) throw new Error("Insufficient Lambda execution budget; job was not claimed")
  return { origin: origin.origin, parameter: `/ketqat-${env.KETQAT_DEPLOYMENT_ENV}/worker-callback` }
}

async function ssmSecret(name) {
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm")
  const client = new SSMClient({ region: process.env.AWS_REGION, maxAttempts: 2 })
  try {
    const response = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }), { abortSignal: AbortSignal.timeout(15_000) })
    if (response.Parameter?.Name !== name || response.Parameter?.Type !== "SecureString" || typeof response.Parameter.Value !== "string" || Buffer.byteLength(response.Parameter.Value) < 32) throw new Error()
    return response.Parameter.Value
  } catch { throw new Error("Worker secret initialization failed") }
  finally { client.destroy() }
}

export function createHandler({ env = process.env, mode = "lambda", getSecret = ssmSecret, claim = claimJob, report = reportResult, run = runIsolatedJob, fetchImpl = fetch } = {}) {
  if (!["lambda", "batch"].includes(mode)) throw new Error("Invalid worker runtime mode")
  let secretPromise
  return async (event, context) => {
    const config = invocation(event, context, env, mode)
    secretPromise ??= getSecret(config.parameter).catch(() => { secretPromise = undefined; throw new Error("Worker secret initialization failed") })
    const secret = await secretPromise
    const callback = callbackConfigFromEnv({
      KETQAT_API_BASE_URL: config.origin, KETQAT_JOB_ID: event.jobId,
      KETQAT_JOB_ATTEMPT: String(event.attempt), KETQAT_WORKER_AUTH_MODE: "signed-request",
      KETQAT_WORKER_CALLBACK_SECRET: secret,
    })
    callback.fetchImpl = (url, init) => fetchImpl(url, {
      ...init, signal: AbortSignal.any([init.signal, AbortSignal.timeout(Math.max(1, Math.min(30_000, context.getRemainingTimeInMillis() - 5000)))]),
    })
    let job
    try {
      const claimed = await claim(callback)
      job = validateJob(claimed?.job ?? claimed)
      if (job.job_id !== event.jobId || job.limits.timeout_seconds !== event.timeoutSeconds) throw new Error()
    } catch { throw new Error("Worker claim failed or did not match the dispatch") }
    const result = await run(job)
    try { await report(callback, result) }
    catch { throw new Error("Worker result delivery failed") }
    // Async destination/log metadata must not carry scientific inputs/results.
    return { jobId: event.jobId, attempt: event.attempt, status: result.status }
  }
}

export const handler = createHandler()
