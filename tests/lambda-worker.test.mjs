import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fork } from "node:child_process"
import { executeJob, validateJob, JobResultSchema } from "../dist/worker/index.js"
import { createIsolatedRunner, runIsolatedJob } from "../worker/lambda/run-isolated.mjs"
import { createHandler } from "../worker/lambda/handler.mjs"

const makeJob = (timeout = 5) => validateJob({
  schema_version: "1.0", job_id: "lambda-test", idempotency_key: "lambda-test", submitted_by: "test",
  parameters: { operation: "simulate", qasm: 'OPENQASM 3.0; include "stdgates.inc"; qubit[2] q; bit[2] c; h q[0]; cx q[0], q[1]; c[0] = measure q[0]; c[1] = measure q[1];', shots: 64, seed: 17 },
  limits: { timeout_seconds: timeout },
})
const event = { version: 1, jobId: "lambda-test", attempt: 1, timeoutSeconds: 5 }
const context = { getRemainingTimeInMillis: () => 899_000 }
const env = { KETQAT_DEPLOYMENT_ENV: "staging", KETQAT_API_BASE_URL: "https://stage.example" }

test("isolated worker preserves seeded scientific output and result schema", async () => {
  const job = makeJob()
  const result = await runIsolatedJob(job)
  assert.equal(result.status, "SUCCEEDED")
  assert.equal(result.execution_class, "SIMULATION")
  assert.deepEqual(result.output, (await executeJob(job)).output)
  assert.equal(JobResultSchema.safeParse(result).success, true)
})

test("a CPU-blocked child is killed at the deadline and inherits no cloud secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ketqat-worker-timeout-"))
  const path = join(directory, "blocked.mjs")
  await writeFile(path, 'process.once("message", () => { while (true) {} });\n')
  let child
  try {
    const run = createIsolatedRunner({ executor: path, forkImpl: (file, args, options) => {
      assert.deepEqual(options.env, { TMPDIR: "/tmp", LANG: "C.UTF-8" })
      assert.deepEqual(options.execArgv, ["--disallow-code-generation-from-strings"])
      child = fork(file, args, options)
      return child
    } })
    const result = await run(makeJob(1))
    assert.equal(result.status, "TIMED_OUT")
    assert.equal(JobResultSchema.safeParse(result).success, true)
    assert.ok(result.duration_ms >= 950 && result.duration_ms < 5000)
    assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("child crash yields a schema-valid failure, never an invented success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ketqat-worker-crash-"))
  const path = join(directory, "crash.mjs")
  await writeFile(path, 'process.once("message", () => process.exit(9));\n')
  try {
    const result = await createIsolatedRunner({ executor: path })(makeJob())
    assert.equal(result.status, "FAILED")
    assert.equal(JobResultSchema.safeParse(result).success, true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("Lambda rejects long, injected, invalid or under-budget dispatches before secret reads or claims", async () => {
  let calls = 0
  const handler = createHandler({ env, getSecret: async () => { calls++; return "x".repeat(64) }, claim: async () => { calls++; return makeJob() } })
  for (const input of [
    { ...event, timeoutSeconds: 900 }, { ...event, jobId: "../other" }, { ...event, jobId: 123 },
    { ...event, apiBaseUrl: "https://attacker.example" }, { ...event, attempt: 0 },
  ]) await assert.rejects(() => handler(input, context))
  await assert.rejects(() => handler(event, { getRemainingTimeInMillis: () => 94_000 }))
  assert.equal(calls, 0)
})

test("Lambda uses signed callbacks, caches its named secret and returns only control metadata", async () => {
  let secrets = 0
  let claims = 0
  let reports = 0
  const handler = createHandler({ env,
    getSecret: async name => { assert.equal(name, "/ketqat-staging/worker-callback"); secrets++; return "x".repeat(64) },
    claim: async config => { assert.equal(config.apiBaseUrl, "https://stage.example"); assert.ok(config.identity); claims++; return { job: makeJob() } },
    report: async (config, result) => { assert.equal(config.attempt, 1); assert.equal(result.status, "SUCCEEDED"); reports++ },
  })
  for (let i = 0; i < 2; i++) assert.deepEqual(await handler(event, context), { jobId: event.jobId, attempt: 1, status: "SUCCEEDED" })
  assert.deepEqual({ secrets, claims, reports }, { secrets: 1, claims: 2, reports: 2 })
})

test("failed or mismatched claims never execute and transport errors do not leak payloads", async () => {
  const dependencies = { env, getSecret: async () => "x".repeat(64), run: async () => { assert.fail("must not execute") } }
  await assert.rejects(() => createHandler({ ...dependencies, claim: async () => { throw new Error("private-response-body") } })(event, context), { message: "Worker claim failed or did not match the dispatch" })
  await assert.rejects(() => createHandler({ ...dependencies, claim: async () => makeJob(900) })(event, context), { message: "Worker claim failed or did not match the dispatch" })
})
