// Execute inside the built Lambda image with --read-only --network none.
// Scientific execution is real; the control-plane callbacks are local fixtures.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { connect } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { createHandler } from "/var/task/worker/lambda/handler.mjs"
import { JobResultSchema } from "/var/task/dist/worker/index.js"

assert.notEqual(process.getuid(), 0)
const job = {
  schema_version: "1", job_id: "container-probe", idempotency_key: "container-probe", submitted_by: "verification",
  parameters: { operation: "simulate", qasm: 'OPENQASM 3.0; include "stdgates.inc"; qubit[2] q; bit[2] c; h q[0]; cx q[0], q[1]; c[0] = measure q[0]; c[1] = measure q[1];', shots: 64, seed: 17 },
  limits: { timeout_seconds: 5 },
}
let deliveries = 0
const handler = createHandler({
  env: { KETQAT_DEPLOYMENT_ENV: "staging", KETQAT_API_BASE_URL: "https://stage.example" },
  getSecret: async () => "test-only-worker-secret".repeat(3),
  claim: async () => ({ job }),
  report: async (_, result) => {
    assert.equal(JobResultSchema.safeParse(result).success, true)
    assert.equal(result.status, "SUCCEEDED")
    assert.equal(result.execution_class, "SIMULATION")
    assert.ok(result.output)
    deliveries++
  },
})
const event = { version: 1, jobId: job.job_id, attempt: 1, timeoutSeconds: 5 }
assert.deepEqual(await handler(event, { getRemainingTimeInMillis: () => 899_000 }), { jobId: job.job_id, attempt: 1, status: "SUCCEEDED" })
assert.equal(deliveries, 1)

// Verify the actual AWS Runtime Interface Client can locate the exported
// handler. An invalid event must reach its validation guard before SSM access.
const runtime = spawn("/lambda-entrypoint.sh", ["worker/lambda/handler.handler"], { detached: true, stdio: ["ignore", "pipe", "pipe"] })
const closed = new Promise(resolve => runtime.once("close", resolve))
let logs = ""
runtime.stdout.on("data", value => { logs += value })
runtime.stderr.on("data", value => { logs += value })
async function ready() {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port: 8080 })
    socket.once("connect", () => { socket.destroy(); resolve(true) })
    socket.once("error", () => { socket.destroy(); resolve(false) })
  })
}
try {
  const deadline = Date.now() + 15_000
  while (!await ready()) {
    if (runtime.exitCode !== null || Date.now() > deadline) throw new Error(`Lambda runtime startup failed: ${logs}`)
    await delay(100)
  }
  const response = await fetch("http://127.0.0.1:8080/2015-03-31/functions/function/invocations", {
    method: "POST", body: "{}", signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json()
  assert.equal(body.errorMessage, "Invalid Lambda worker invocation; longer jobs require Batch")
  console.log("PASS: non-root read-only scientific execution, control-only result, and AWS runtime handler validation")
} finally {
  try { process.kill(-runtime.pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error }
  await closed
}
