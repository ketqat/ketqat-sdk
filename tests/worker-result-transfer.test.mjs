import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { callbackConfigFromEnv, reportResult, signedRequestIdentity } from "../dist/worker/index.js"

const base = { apiBaseUrl: "https://stage.example", jobId: "job", attempt: 2, resultTransport: "s3",
  identity: signedRequestIdentity("synthetic-secret-longer-than-thirty-two-bytes") }
const result = { job_id: "job", output: { value: "量子🐈".repeat(700_000) } }
const bytes = Buffer.from(JSON.stringify(result))
const headers = { "content-type": "application/json", "content-length": String(bytes.length), "if-none-match": "*",
  "x-amz-server-side-encryption": "AES256", "x-amz-checksum-sha256": createHash("sha256").update(bytes).digest("base64") }
const capability = { version: 1, method: "PUT", url: "https://ketqat-staging-result-transfer-291877508281.s3.ap-northeast-1.amazonaws.com/results/job/2.json?X-Amz-Signature=synthetic",
  headers, transfer: "synthetic.ticket" }

test("native worker sends exact large Unicode bytes to S3, with credentials only on small control callbacks", async () => {
  const calls = []
  await reportResult({ ...base, fetchImpl: async (url, init) => {
    calls.push({ url, init })
    assert.equal(init.redirect, "error")
    if (calls.length === 1) {
      assert.equal(new Headers(init.headers).get("x-ketqat-attempt"), "2")
      assert.ok(new Headers(init.headers).get("authorization")?.startsWith("Bearer "))
      assert.deepEqual(JSON.parse(init.body), { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
      return Response.json(capability)
    }
    if (calls.length === 2) {
      assert.equal(url, capability.url)
      assert.equal(new Headers(init.headers).has("authorization"), false)
      assert.deepEqual(Buffer.from(init.body), bytes)
      return new Response(null, { status: 200 })
    }
    assert.equal(url, `${base.apiBaseUrl}/api/execution/jobs/job/result`)
    assert.deepEqual(JSON.parse(init.body), { transfer: capability.transfer })
    assert.ok(new Headers(init.headers).get("authorization")?.startsWith("Bearer "))
    return Response.json({ job: { id: "job", status: "SUCCEEDED" } })
  } }, result)
  assert.equal(calls.length, 3)
})

test("wrong-host/key/method/headers and failed uploads never deliver a completion", async () => {
  for (const changed of [{ url: "https://attacker.example/result" }, { url: capability.url.replace("/2.json", "/1.json") },
    { method: "POST" }, { headers: { ...headers, authorization: "do-not-forward" } }, { headers: { ...headers, "content-length": "1" } }, { transfer: null }]) {
    let calls = 0
    await assert.rejects(() => reportResult({ ...base, fetchImpl: async () => { calls++; return Response.json({ ...capability, ...changed }) } }, result))
    assert.equal(calls, 1)
  }
  let calls = 0
  await assert.rejects(() => reportResult({ ...base, fetchImpl: async () => {
    calls++
    return calls === 1 ? Response.json(capability) : new Response("private S3 error", { status: 403 })
  } }, result), error => !error.retryable && !error.message.includes("private S3 error"))
  assert.equal(calls, 2)
})

test("lost PUT responses and conditional duplicates reconcile through the authenticated checksum check", async () => {
  for (const outcome of ["lost", "exists"]) {
    let calls = 0
    await reportResult({ ...base, fetchImpl: async (url, init) => {
      calls++
      if (calls === 1) return Response.json(capability)
      if (calls === 2) {
        if (outcome === "lost") throw new Error("synthetic lost PUT response")
        return new Response(null, { status: 412 })
      }
      assert.equal(url, `${base.apiBaseUrl}/api/execution/jobs/job/result`)
      assert.deepEqual(JSON.parse(init.body), { transfer: capability.transfer })
      return Response.json({ job: { status: "SUCCEEDED" } })
    } }, result)
    assert.equal(calls, 3)
  }
})

test("GCP remains inline, and only signed callbacks may enable the transfer", async () => {
  let calls = 0
  await reportResult({ ...base, resultTransport: undefined, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, `${base.apiBaseUrl}/api/execution/jobs/job/result`)
    assert.deepEqual(JSON.parse(init.body), { status: "TIMED_OUT" }); return Response.json({})
  } }, { status: "TIMED_OUT" })
  assert.equal(calls, 1)
  assert.throws(() => callbackConfigFromEnv({ KETQAT_API_BASE_URL: base.apiBaseUrl, KETQAT_JOB_ID: "job", KETQAT_RESULT_TRANSPORT: "s3" }))
  assert.equal(callbackConfigFromEnv({ KETQAT_API_BASE_URL: base.apiBaseUrl, KETQAT_JOB_ID: "job", KETQAT_WORKER_AUTH_MODE: "signed-request",
    KETQAT_WORKER_CALLBACK_SECRET: "synthetic-secret-longer-than-thirty-two-bytes", KETQAT_RESULT_TRANSPORT: "s3" }).resultTransport, "s3")
})
