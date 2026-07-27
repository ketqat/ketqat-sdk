#!/usr/bin/env node
/**
 * Build the worker container and run a real job through it.
 *
 * This exists because the image shipped broken. `worker/entrypoint.mjs` imports
 * `../dist/index.js`, which is correct in the repository, and the Dockerfile
 * copied the entrypoint to `/app/entrypoint.mjs`, where `../dist` resolves to
 * `/dist`. Every container exited immediately with ERR_MODULE_NOT_FOUND.
 *
 * Nothing caught it. `npm test` runs the entrypoint from the repository, where
 * the path is right. The image built and pushed without complaint, because a
 * Docker build does not run the entrypoint. The completion manifest recorded the
 * worker as verified on the strength of a local run.
 *
 * So: build the image, run a job through it, and check the output. A container
 * that cannot start is not a working worker, however well its source is tested.
 *
 * Skipped when Docker is unavailable, and it says so rather than passing
 * quietly -- a check that silently does nothing is worse than no check.
 */
import { execFileSync, spawnSync } from "node:child_process"

const IMAGE_TAG = "ketqat-worker:verify"

const BELL = `OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
`

const JOB = JSON.stringify({
  schema_version: "1.0",
  job_id: "worker-image-verification",
  idempotency_key: "worker-image-verification",
  submitted_by: "verify-worker-image",
  parameters: { operation: "simulate", qasm: BELL, shots: 256, seed: 11 },
})

function dockerAvailable() {
  const probe = spawnSync("docker", ["info"], { stdio: "ignore" })
  return probe.status === 0
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

if (!dockerAvailable()) {
  console.log("SKIP: Docker is not available, so the worker image was not built or run.")
  console.log("      This check did NOT verify the container. Run it where Docker is present.")
  process.exit(0)
}

console.log("Building the worker image...")
try {
  execFileSync("docker", ["build", "-f", "worker/Dockerfile", "-t", IMAGE_TAG, "."], {
    stdio: "inherit",
  })
} catch {
  fail("the worker image did not build")
}

console.log("Running a job through the container...")
const run = spawnSync(
  "docker",
  ["run", "--rm", "-i", "--network", "none", "--read-only", "--tmpfs", "/tmp", IMAGE_TAG],
  { input: JOB, encoding: "utf8" },
)

if (run.error) fail(`the container could not be started: ${run.error.message}`)

const stdout = (run.stdout ?? "").trim()
const stderr = (run.stderr ?? "").trim()

if (run.status !== 0) {
  console.error(stderr || "(no stderr)")
  fail(`the container exited ${run.status}; a worker that cannot run a job is not a worker`)
}

let result
try {
  result = JSON.parse(stdout.split("\n").filter(Boolean).at(-1))
} catch {
  console.error(stdout.slice(0, 2000))
  fail("the container did not emit a JSON result")
}

if (result.status !== "SUCCEEDED") {
  fail(`the job reported ${result.status}: ${result.error ?? "no reason given"}`)
}

// The class is asserted, not assumed. A container that reaches no hardware must
// never report a result that could be read as a device measurement.
if (result.execution_class !== "SIMULATION") {
  fail(`execution_class was ${result.execution_class}; this worker reaches no hardware`)
}

const counts = result.output?.counts ?? {}
const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
if (total !== 256) fail(`expected 256 shots, counted ${total}`)

// A Bell state produces only the correlated outcomes. Asserted so the check
// fails on a container that runs but computes the wrong thing, not merely on
// one that fails to start.
const unexpected = Object.keys(counts).filter((outcome) => outcome !== "00" && outcome !== "11")
if (unexpected.length > 0) {
  fail(`a Bell circuit produced uncorrelated outcomes: ${unexpected.join(", ")}`)
}

console.log(`PASS: the container ran a job and returned ${total} shots as ${result.execution_class}.`)
console.log(`      counts: ${JSON.stringify(counts)}`)
