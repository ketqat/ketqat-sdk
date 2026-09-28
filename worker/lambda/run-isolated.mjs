import { fork } from "node:child_process"
import { JobResultSchema, WORKER_VERSION, validateJob } from "../../dist/worker/index.js"

// Injection is used only by the local process-boundary tests. Invocation data
// never selects a file, command, argument, package or environment variable.
export function createIsolatedRunner({ forkImpl = fork, executor = new URL("./engine-child.mjs", import.meta.url) } = {}) {
  return async input => {
    const job = validateJob(input)
    const started = Date.now()
    const failure = (status, error) => ({
      schema_version: "0.1", job_id: job.job_id, status, operation: job.parameters.operation,
      error, started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started, execution_class: "SIMULATION", worker_version: WORKER_VERSION,
    })
    return new Promise(resolve => {
      let result
      let timer
      const child = forkImpl(executor, [], {
        env: { TMPDIR: "/tmp", LANG: "C.UTF-8" },
        execArgv: ["--disallow-code-generation-from-strings"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      })
      const finish = value => {
        if (result) return
        result = value
        clearTimeout(timer)
        // Resolve only after the process has exited; no work survives a warm
        // Lambda invocation or continues after its scientific timeout.
        child.kill("SIGKILL")
      }
      child.once("message", message => {
        const parsed = JobResultSchema.safeParse(message?.result)
        if (!parsed.success || parsed.data.job_id !== job.job_id || !["SUCCEEDED", "FAILED"].includes(parsed.data.status)) {
          finish(failure("FAILED", "Worker returned an invalid result."))
        } else finish(parsed.data)
      })
      child.once("error", () => finish(failure("FAILED", "Worker process could not start.")))
      child.once("close", () => {
        clearTimeout(timer)
        resolve(result ?? failure("FAILED", "Worker exited before returning a result."))
      })
      timer = setTimeout(() => finish(failure("TIMED_OUT", `Exceeded the ${job.limits.timeout_seconds}s limit for this job.`)), job.limits.timeout_seconds * 1000)
      child.send(job, error => { if (error) finish(failure("FAILED", "Worker could not receive the job.")) })
    })
  }
}

export const runIsolatedJob = createIsolatedRunner()
