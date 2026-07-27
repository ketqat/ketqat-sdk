#!/usr/bin/env node
/**
 * Worker entry point.
 *
 * Two modes, chosen by what the environment supplies:
 *
 * **Local mode** reads one job from stdin or KETQAT_JOB and writes the result to
 * stdout. Used for development and for the container smoke test.
 *
 * **Callback mode** is what runs in the execution plane. Given only a job id and
 * a control-plane URL, the worker authenticates as its own service account,
 * claims the job, executes it, and posts the result back. The manifest never
 * passes through an environment variable and the result never passes through
 * stdout -- see src/worker/callback.ts for why each of those matters.
 *
 * It does not listen on a socket, does not read a credential from disk, and does
 * not write outside TMPDIR.
 *
 * Exit codes are meaningful to the dispatcher:
 *   0   the job ran and succeeded
 *   1   the job ran and did not succeed, or a retryable transport failure
 *   2   the submission was invalid; retrying it unchanged will not help
 *   124 the job exceeded its own wall-clock limit
 */
import {
  callbackConfigFromEnv,
  claimJob,
  enforceResultSize,
  executeJob,
  reportResult,
  validateJob,
} from "../dist/index.js"

async function readStdin() {
  if (process.stdin.isTTY) return ""
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * Run one validated job under its own wall-clock ceiling.
 *
 * Enforced here as well as by the platform's task timeout, because the platform
 * kills the container without producing a record. This one resolves first and
 * yields a TIMED_OUT result, so the submitter learns the job timed out rather
 * than that it vanished.
 */
async function runWithTimeout(job) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          job_id: job.job_id,
          status: "TIMED_OUT",
          operation: job.parameters.operation,
          error: `Exceeded the ${job.limits.timeout_seconds}s limit for this job.`,
        }),
      job.limits.timeout_seconds * 1000,
    )
  })

  try {
    return await Promise.race([
      executeJob(job).then((value) => enforceResultSize(value, job.limits.max_result_bytes)),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function runCallbackMode(config) {
  let job
  try {
    const claimed = await claimJob(config)
    job = validateJob(claimed?.job ?? claimed)
  } catch (error) {
    // A claim that fails leaves no job to report against, so there is nothing to
    // post back. The control plane owns the timeout that reaps a job whose
    // worker never claimed it; a worker inventing a failure record for a job it
    // never held would be asserting something it does not know.
    process.stderr.write(`Could not claim job ${config.jobId}: ${error.message}\n`)
    process.exit(error.retryable === false ? 2 : 1)
  }

  const result = await runWithTimeout(job)

  try {
    await reportResult(config, result)
  } catch (error) {
    // The job ran. Losing the result to a transport failure is the one case
    // worth retrying at this level, since re-running would cost the work again.
    process.stderr.write(`Could not report result for ${config.jobId}: ${error.message}\n`)
    process.exit(1)
  }

  if (result.status === "TIMED_OUT") process.exit(124)
  process.exit(result.status === "SUCCEEDED" ? 0 : 1)
}

async function runLocalMode() {
  const raw = process.env.KETQAT_JOB ?? (await readStdin())
  if (!raw.trim()) {
    process.stderr.write(
      "No job supplied. Provide it on stdin or in KETQAT_JOB, or set KETQAT_API_BASE_URL and " +
        "KETQAT_JOB_ID to run against a control plane.\n",
    )
    process.exit(2)
  }

  let job
  try {
    job = validateJob(JSON.parse(raw))
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "REJECTED", error: error.message })}\n`)
    process.exit(2)
  }

  const result = await runWithTimeout(job)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status === "TIMED_OUT") process.exit(124)
  process.exit(result.status === "SUCCEEDED" ? 0 : 1)
}

async function main() {
  const config = callbackConfigFromEnv(process.env)
  if (config) {
    await runCallbackMode(config)
    return
  }
  await runLocalMode()
}

main().catch((error) => {
  process.stderr.write(`Worker failed: ${error.message}\n`)
  process.exit(1)
})
