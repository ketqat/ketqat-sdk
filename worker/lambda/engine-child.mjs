// Receives only a validated scientific job over IPC, never credentials or URLs.
import { validateJob, executeJob, enforceResultSize } from "../../dist/worker/index.js"

process.once("message", async input => {
  try {
    const job = validateJob(input)
    const result = enforceResultSize(await executeJob(job), job.limits.max_result_bytes)
    process.send({ result }, () => process.disconnect())
  } catch {
    process.send({ failed: true }, () => { process.disconnect(); process.exitCode = 1 })
  }
})
