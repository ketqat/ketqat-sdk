// Run inside the actual Batch image, read-only and without external networking.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { runBatch } from "/var/task/worker/lambda/batch.mjs"
import { createHandler } from "/var/task/worker/lambda/handler.mjs"
import { JobResultSchema } from "/var/task/dist/worker/index.js"

assert.notEqual(process.getuid(), 0)
const job = {
  schema_version: "1", job_id: "batch-container", idempotency_key: "batch-container", submitted_by: "verification",
  parameters: { operation: "simulate", qasm: 'OPENQASM 3.0; include "stdgates.inc"; qubit[2] q; bit[2] c; h q[0]; cx q[0], q[1]; c[0] = measure q[0]; c[1] = measure q[1];', shots: 64, seed: 17 },
  limits: { timeout_seconds: 900 },
}
let reports = 0
const result = await runBatch({
  env: {
    KETQAT_DEPLOYMENT_ENV: "staging", KETQAT_API_BASE_URL: "https://stage.example",
    AWS_BATCH_JOB_ID: "platform-fixture", KETQAT_JOB_ID: job.job_id, KETQAT_JOB_ATTEMPT: "1", KETQAT_JOB_TIMEOUT_SECONDS: "900",
  },
  create: options => createHandler({ ...options,
    getSecret: async () => "test-only-batch-secret".repeat(3),
    claim: async () => ({ job }),
    report: async (_, value) => {
      assert.equal(JobResultSchema.safeParse(value).success, true)
      assert.equal(value.status, "SUCCEEDED")
      assert.equal(value.execution_class, "SIMULATION")
      assert.equal(Object.values(value.output.counts).reduce((sum, count) => sum + count, 0), 64)
      reports++
    },
  }),
})
assert.deepEqual(result, { jobId: job.job_id, attempt: 1, status: "SUCCEEDED" })
assert.equal(reports, 1)
const cli = spawnSync(process.execPath, ["--disallow-code-generation-from-strings", "/var/task/worker/lambda/batch.mjs"], {
  encoding: "utf8", env: { KETQAT_API_BASE_URL: "private-invalid-url", KETQAT_WORKER_CALLBACK_SECRET: "private-secret" }, timeout: 5000,
})
assert.equal(cli.status, 1)
assert.equal(cli.stdout, "")
assert.equal(cli.stderr, "AWS worker execution failed; inspect the control-plane job attempt.\n")
console.log("PASS: Batch scientific execution, 900-second eligibility, metadata-only output and generic CLI failure")
