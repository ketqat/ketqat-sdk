import { pathToFileURL } from "node:url"
import { createHandler } from "./handler.mjs"

// This entry point is selected by the reviewed image, never by invocation data.
// Both backends use the same canonical claim, signed report and scientific child.
export async function runBatch({ env = process.env, create = createHandler, now = Date.now } = {}) {
  const event = {
    version: 1, jobId: env.KETQAT_JOB_ID,
    attempt: Number(env.KETQAT_JOB_ATTEMPT), timeoutSeconds: Number(env.KETQAT_JOB_TIMEOUT_SECONDS),
  }
  if (!env.AWS_BATCH_JOB_ID || !Number.isInteger(event.timeoutSeconds) || event.timeoutSeconds < 1 || event.timeoutSeconds > 900) throw new Error("Invalid Batch execution metadata")
  // Dispatch sets the platform deadline to compute + 120s. The local budget
  // also reserves time for SSM, claim and report; CPU timeout stays unchanged.
  const deadline = now() + (event.timeoutSeconds + 120) * 1000
  return create({ env, mode: "batch" })(event, { getRemainingTimeInMillis: () => Math.max(0, deadline - now()) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runBatch()
    // No scientific body or raw error reaches Batch/CloudWatch logs.
    process.stdout.write(JSON.stringify(result) + "\n")
    process.exitCode = result.status === "SUCCEEDED" ? 0 : result.status === "TIMED_OUT" ? 124 : 1
  } catch {
    process.stderr.write("AWS worker execution failed; inspect the control-plane job attempt.\n")
    process.exitCode = 1
  }
}
