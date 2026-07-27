#!/usr/bin/env node
/**
 * Worker entry point.
 *
 * Reads one job from stdin or from KETQAT_JOB, executes it, and writes the
 * result to stdout as a single JSON object. It does not listen on a socket, does
 * not read a credential, and does not write outside TMPDIR.
 *
 * A rejected job and a failed job exit differently on purpose: exit 2 means the
 * submission was invalid and retrying it unchanged will not help, while exit 1
 * means a valid job ran and did not succeed.
 */
import { enforceResultSize, executeJob, validateJob } from "../dist/index.js"

async function readStdin() {
  if (process.stdin.isTTY) return ""
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

async function main() {
  const raw = process.env.KETQAT_JOB ?? (await readStdin())
  if (!raw.trim()) {
    process.stderr.write("No job supplied. Provide it on stdin or in KETQAT_JOB.\n")
    process.exit(2)
  }

  let job
  try {
    job = validateJob(JSON.parse(raw))
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "REJECTED", error: error.message })}\n`)
    process.exit(2)
  }

  // A wall-clock ceiling enforced in-process, in addition to the platform's own
  // task timeout. Belt and braces: the container timeout kills the task without
  // producing a record, while this one emits a TIMED_OUT result first.
  const timer = setTimeout(() => {
    process.stdout.write(
      `${JSON.stringify({
        job_id: job.job_id,
        status: "TIMED_OUT",
        error: `Exceeded the ${job.limits.timeout_seconds}s limit for this job.`,
      })}\n`,
    )
    process.exit(124)
  }, job.limits.timeout_seconds * 1000)

  const result = enforceResultSize(await executeJob(job), job.limits.max_result_bytes)
  clearTimeout(timer)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.status === "SUCCEEDED" ? 0 : 1)
}

main().catch((error) => {
  process.stderr.write(`Worker failed: ${error.message}\n`)
  process.exit(1)
})
