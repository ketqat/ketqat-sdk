import { readFileSync, writeFileSync } from "node:fs"
import {
  ACCEPTED_TOKEN_VARIABLES,
  CANONICAL_TOKEN_VARIABLE,
  KetQatClient,
  missingApiTokenMessage,
  resolveApiToken,
  TERMINAL_JOB_STATUSES,
} from "../client/index.js"
import { HardwareProfileSchema } from "../hardware/profile.js"
import { emitQasm3, parseQasm3, Qasm3ParseError } from "../circuit/qasm3.js"
import {
  gateCount,
  totalClbits,
  totalQubits,
  twoQubitGateCount,
  usesClassicalControl,
  usesMidCircuitMeasurement,
  usesReset,
  type QuantumCircuit,
} from "../circuit/graph.js"
import { checkCircuitEquivalence } from "../engine/differential.js"
import { estimateResources } from "../engine/resources.js"
import { simulateStatevector } from "../engine/statevector.js"
import { circuitDepth, transpileForHardware } from "../engine/transpile.js"
import { optimizeWithZx } from "../engine/zx.js"
import { zeroNoiseExtrapolation } from "../engine/mitigation.js"
import { NoiseModelSchema } from "../engine/noise.js"
import {
  AssessmentFileError,
  buildBundle,
  buildReport,
  readAssessmentDocument,
  reportToCsv,
  resolveAssessment,
  verifyBundle,
  type ResourceScenario,
} from "../intelligence/index.js"

/**
 * Engine command line.
 *
 * Every command emits a single JSON object on stdout and nothing else, so
 * output is machine-readable by default and the MCP server can reuse the same
 * operations without a second implementation. Human-facing narration goes to
 * stderr, where it cannot corrupt a piped result.
 *
 * The Python `ketqat` command remains the entry point for QEC experiment
 * manifests; this covers the TypeScript engine.
 */

export interface CommandResult {
  exitCode: number
  stdout?: unknown
  stderr?: string
}

const USAGE = `ketqat-engine <command> [options]

Commands:
  circuit inspect <file.qasm>            Parse a circuit and report its structure
  circuit convert <file.qasm>            Re-emit canonical OpenQASM 3
  simulate <file.qasm>                   Simulate; --shots, --seed, --noise-1q, --noise-2q, --readout
  transpile <file.qasm> --hardware <f>   Route onto a hardware snapshot
  resources <file.qasm> [--hardware <f>] Estimate resources
  zx optimize <file.qasm>                Optimize and report checked equivalence
  equivalence <a.qasm> <b.qasm>          Compare two circuits
  mitigate zne <file.qasm>               Zero-noise extrapolation; requires --noise-1q or --noise-2q

Resource intelligence (all local; nothing is sent anywhere):
  intelligence validate <file>           Check an assessment document and report what it would compute
  intelligence estimate <file>           Resource estimates for every scenario; --output
  intelligence compare <file>            Scenario comparison table; --output, --csv
  intelligence report <file>             Full KetQat Decision Report; --output
  intelligence verify <file>             Recompute the hash AND the decisions from the bundle's own
                                         inputs. Accepts a bundle, or a report file containing one.

Registry commands (need --registry <url> or KETQAT_URL):
  search <query>                         Search artifacts, suites, and runs
  pull <slug>                            Fetch an artifact with its versions and relations
  push <slug> <card.json> --version <v>  Publish a Quantum Card version

Execution commands (need --registry <url> or KETQAT_URL, and a token):
  job submit <file.qasm>                 Queue a simulation; --shots, --seed, --wait
  job status <id>                        Status and audit trail for one job
  job watch <id>                         Follow a job until it finishes; --timeout
  job list                               Your queued and finished jobs; --status, --limit
  job cancel <id>                        Request cancellation
  job bundle <id>                        Download the result bundle as JSON

Review commands (need --registry <url> or KETQAT_URL, and a token):
  review list <assessment>               Reviews of one assessment (no token needed if public)
  review queue                           Open reviews you may decide
  review request <assessment> <text>     Ask for a review of the current inputs
  review claim <id>                      Take an open request
  review note <id> <text>                Add a durable note
  review approve <id> <reason>           Approve; the reason is required
  review changes <id> <reason>           Request changes; the reason is required

No rule is enforced here. A CLI that refused a self-review locally would let a
caller appear to satisfy a rule the server then applies differently, and these
decisions gate the strongest claim this platform makes.

The local "simulate" command runs on this machine. "job submit" runs the same
engine in a sandboxed container with enforced limits and an audit trail, and is
what to use for anything whose result will be published.

Authentication reads ${CANONICAL_TOKEN_VARIABLE} from the environment
(${ACCEPTED_TOKEN_VARIABLES[1]} is also accepted; setting both to different
tokens is refused rather than resolved). A token is never accepted as a
command-line argument, because arguments appear in shell history and in the
process list.

Every command prints one JSON object to stdout.`

/**
 * Write a result to `--output` when one was asked for.
 *
 * The object still goes to stdout either way, so a pipeline and a saved file
 * cannot disagree about what a command produced.
 */
function writeOutput(flags: Map<string, string>, value: unknown): void {
  const target = flags.get("output")
  if (!target || target === "true") return
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`)
}

function parseFlags(argv: string[]): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = []
  const flags = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string
    if (token.startsWith("--")) {
      const [name, inline] = token.slice(2).split("=", 2)
      if (inline !== undefined) {
        flags.set(name as string, inline)
      } else {
        const next = argv[index + 1]
        if (next === undefined || next.startsWith("--")) {
          flags.set(name as string, "true")
        } else {
          flags.set(name as string, next)
          index += 1
        }
      }
    } else {
      positional.push(token)
    }
  }
  return { positional, flags }
}

function readCircuit(path: string): { circuit: QuantumCircuit; loss: unknown[] } {
  const source = readFileSync(path, "utf8")
  const parsed = parseQasm3(source)
  return { circuit: parsed.circuit, loss: parsed.loss_report }
}

function readHardware(path: string) {
  return HardwareProfileSchema.parse(JSON.parse(readFileSync(path, "utf8")))
}

function numberFlag(flags: Map<string, string>, name: string): number | undefined {
  const raw = flags.get(name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} must be a number, got '${raw}'.`)
  }
  return value
}

function noiseFrom(flags: Map<string, string>) {
  const one = numberFlag(flags, "noise-1q") ?? 0
  const two = numberFlag(flags, "noise-2q") ?? 0
  const readout = numberFlag(flags, "readout") ?? 0
  if (one === 0 && two === 0 && readout === 0) return undefined
  return NoiseModelSchema.parse({
    model: "depolarizing",
    one_qubit_error: one,
    two_qubit_error: two,
    readout_error: readout,
  })
}

class RegistryConfigurationError extends Error {}

/**
 * Build a registry client.
 *
 * The token is read from the environment only. Accepting it as a flag would put
 * it in shell history and in the process list, where other users on the machine
 * can read it.
 */
function registryClient(flags: Map<string, string>, options: { requireToken?: boolean } = {}): KetQatClient {
  const baseUrl = flags.get("registry") ?? process.env.KETQAT_URL
  if (!baseUrl) {
    throw new RegistryConfigurationError(
      "No registry URL. Pass --registry <url> or set KETQAT_URL.",
    )
  }
  // Both KETQAT_API_TOKEN and KETQAT_TOKEN are accepted (#218). This CLI read only the
  // second while every document, including the page that mints the token, printed the
  // first -- so following the documentation produced "No API token" with the token set.
  // Two different values raise rather than resolve; see src/client/token.ts.
  let token: string | undefined
  try {
    token = resolveApiToken()
  } catch (error) {
    throw new RegistryConfigurationError((error as Error).message)
  }
  if (options.requireToken && !token) {
    throw new RegistryConfigurationError(missingApiTokenMessage())
  }
  return new KetQatClient({ baseUrl, ...(token ? { token } : {}) })
}

function circuitSummary(circuit: QuantumCircuit) {
  return {
    qubits: totalQubits(circuit),
    clbits: totalClbits(circuit),
    gate_count: gateCount(circuit),
    two_qubit_gate_count: twoQubitGateCount(circuit),
    depth: circuitDepth(circuit),
    uses_mid_circuit_measurement: usesMidCircuitMeasurement(circuit),
    uses_classical_control: usesClassicalControl(circuit),
    uses_reset: usesReset(circuit),
  }
}

export async function runCli(argv: string[]): Promise<CommandResult> {
  const { positional, flags } = parseFlags(argv)
  const [command, subcommand] = positional

  if (command === undefined || flags.has("help") || command === "help") {
    return { exitCode: command === undefined ? 2 : 0, stderr: USAGE }
  }

  try {
    switch (command) {
      case "circuit": {
        const path = positional[2]
        if (!path) return { exitCode: 2, stderr: "circuit requires a file path.\n\n" + USAGE }
        const { circuit, loss } = readCircuit(path)
        if (subcommand === "inspect") {
          return { exitCode: 0, stdout: { command: "circuit.inspect", summary: circuitSummary(circuit), loss_report: loss } }
        }
        if (subcommand === "convert") {
          return { exitCode: 0, stdout: { command: "circuit.convert", qasm3: emitQasm3(circuit), loss_report: loss } }
        }
        return { exitCode: 2, stderr: `Unknown circuit subcommand '${subcommand}'.\n\n${USAGE}` }
      }

      case "simulate": {
        const path = positional[1]
        if (!path) return { exitCode: 2, stderr: "simulate requires a file path." }
        const { circuit } = readCircuit(path)
        const result = simulateStatevector(circuit, {
          shots: numberFlag(flags, "shots"),
          seed: numberFlag(flags, "seed"),
          noise: noiseFrom(flags),
        })
        return { exitCode: 0, stdout: { command: "simulate", ...result } }
      }

      case "transpile": {
        const path = positional[1]
        const hardwarePath = flags.get("hardware")
        if (!path || !hardwarePath) {
          return { exitCode: 2, stderr: "transpile requires a file path and --hardware <profile.json>." }
        }
        const { circuit } = readCircuit(path)
        const result = transpileForHardware(circuit, readHardware(hardwarePath))
        return {
          exitCode: 0,
          stdout: {
            command: "transpile",
            qasm3: emitQasm3(result.circuit),
            initial_layout: result.initial_layout,
            final_layout: result.final_layout,
            swap_count: result.swap_count,
            depth: result.depth,
            loss_report: result.loss_report,
            transformation: result.transformation,
          },
        }
      }

      case "resources": {
        const path = positional[1]
        if (!path) return { exitCode: 2, stderr: "resources requires a file path." }
        const { circuit } = readCircuit(path)
        const hardwarePath = flags.get("hardware")
        const estimate = estimateResources(circuit, hardwarePath ? readHardware(hardwarePath) : undefined)
        return { exitCode: 0, stdout: { command: "resources", ...estimate } }
      }

      case "zx": {
        const path = positional[2]
        if (subcommand !== "optimize" || !path) {
          return { exitCode: 2, stderr: "usage: zx optimize <file.qasm>" }
        }
        const { circuit } = readCircuit(path)
        const result = optimizeWithZx(circuit)
        return {
          exitCode: 0,
          stdout: {
            command: "zx.optimize",
            qasm3: emitQasm3(result.circuit),
            before: result.before,
            after: result.after,
            rewrites: result.rewrites,
            equivalence: result.equivalence,
          },
        }
      }

      case "equivalence": {
        const [, left, right] = positional
        if (!left || !right) return { exitCode: 2, stderr: "equivalence requires two file paths." }
        const evidence = checkCircuitEquivalence(readCircuit(left).circuit, readCircuit(right).circuit, {
          tolerance: numberFlag(flags, "tolerance"),
        })
        // A FAILED equivalence is a real finding, not a tool error, so it still
        // exits 0 with the evidence. Exit 1 is reserved for the tool failing.
        return { exitCode: 0, stdout: { command: "equivalence", evidence } }
      }

      case "mitigate": {
        const path = positional[2]
        if (subcommand !== "zne" || !path) {
          return { exitCode: 2, stderr: "usage: mitigate zne <file.qasm> --noise-1q <p>" }
        }
        const noise = noiseFrom(flags)
        if (!noise) {
          return {
            exitCode: 2,
            stderr: "mitigate zne requires a noise model: --noise-1q, --noise-2q, or --readout.",
          }
        }
        const { circuit } = readCircuit(path)
        const result = zeroNoiseExtrapolation(circuit, noise, {
          shots: numberFlag(flags, "shots"),
          seed: numberFlag(flags, "seed"),
        })
        return { exitCode: 0, stdout: { command: "mitigate.zne", ...result } }
      }

      case "intelligence": {
        // Every path here is a pure local calculation over a file the user
        // wrote. Nothing reaches the network, nothing needs a token, and
        // nothing executes user code: OpenQASM goes through the same typed
        // parser the rest of this CLI uses.
        const path = positional[2]
        if (!subcommand || !path) {
          return {
            exitCode: 2,
            stderr: "usage: intelligence <validate|estimate|compare|report|verify> <file> [--output <file>]",
          }
        }
        const source = readFileSync(path, "utf8")

        if (subcommand === "verify") {
          let candidate: unknown
          try {
            candidate = JSON.parse(source)
          } catch (error) {
            return {
              exitCode: 2,
              stderr: `${path} is not valid JSON: ${(error as Error).message}`,
            }
          }
          const verification = verifyBundle(candidate)
          const output = { command: "intelligence verify", file: path, ...verification }
          writeOutput(flags, output)
          // A failed verification is a failure, not a report of one. A zero exit
          // here would let a CI step "verify" a fabricated bundle and pass.
          return { exitCode: verification.valid ? 0 : 1, stdout: output }
        }

        const spec = readAssessmentDocument(source, path)
        const resolved = resolveAssessment(spec)

        if (subcommand === "validate") {
          const output = {
            command: "intelligence validate",
            file: path,
            valid: true,
            workload: {
              name: resolved.workload.name,
              is_demo: resolved.workload.is_demo,
              logical_counts_evidence: resolved.workload.logical_counts_evidence,
              logical: resolved.workload.logical,
            },
            classical_baseline: resolved.baseline === null ? null : { evidence: resolved.baseline.evidence },
            // Named rather than counted: "3 scenarios" does not tell a reader
            // whether the one they meant to add is among them.
            scenarios: resolved.scenarios.map((scenario: ResourceScenario) => ({
              name: scenario.name,
              preset: scenario.preset,
              revision: scenario.revision,
            })),
            economic_comparison_available:
              resolved.baseline !== null &&
              resolved.scenarios.some((scenario: ResourceScenario) => scenario.economics !== null),
          }
          writeOutput(flags, output)
          return { exitCode: 0, stdout: output }
        }

        const bundle = buildBundle(resolved)

        if (subcommand === "estimate") {
          const output = {
            command: "intelligence estimate",
            reproducibility_hash: bundle.reproducibility_hash,
            is_demo: bundle.is_demo,
            estimates: bundle.estimates,
          }
          writeOutput(flags, output)
          return { exitCode: 0, stdout: output }
        }

        if (subcommand === "compare") {
          if (flags.has("csv")) {
            const csv = reportToCsv(bundle)
            const target = flags.get("output")
            if (target && target !== "true") {
              writeFileSync(target, csv)
              return { exitCode: 0, stdout: { command: "intelligence compare", written: target, format: "csv" } }
            }
            return { exitCode: 0, stderr: csv }
          }
          const output = {
            command: "intelligence compare",
            reproducibility_hash: bundle.reproducibility_hash,
            is_demo: bundle.is_demo,
            comparison: bundle.comparison,
            thresholds: bundle.thresholds,
          }
          writeOutput(flags, output)
          return { exitCode: 0, stdout: output }
        }

        if (subcommand === "report") {
          const output = {
            command: "intelligence report",
            report: buildReport(bundle),
            // The bundle travels with the report so `verify` has something to
            // recompute. A report alone carries a hash it cannot substantiate.
            bundle,
          }
          writeOutput(flags, output)
          return { exitCode: 0, stdout: output }
        }

        return {
          exitCode: 2,
          stderr: `Unknown intelligence subcommand '${subcommand}'. Expected validate, estimate, compare, report, or verify.`,
        }
      }

      case "search": {
        const term = positional.slice(1).join(" ")
        if (!term) return { exitCode: 2, stderr: "search requires a query." }
        const client = registryClient(flags)
        return { exitCode: 0, stdout: { command: "search", results: await client.search.query(term) } }
      }

      case "pull": {
        const slug = positional[1]
        if (!slug) return { exitCode: 2, stderr: "pull requires an artifact slug." }
        const client = registryClient(flags)
        const [artifact, versions, relations] = await Promise.all([
          client.artifacts.get(slug),
          client.artifactVersions.list(slug),
          client.artifactRelations.list(slug),
        ])
        return { exitCode: 0, stdout: { command: "pull", artifact, versions, relations } }
      }

      case "review": {
        // Registry commands, deliberately not under "intelligence": every other
        // intelligence subcommand is local and sends nothing anywhere, and
        // filing these beside them would make that promise ambiguous.
        //
        // No rule is enforced here. A CLI that refused a self-review locally
        // would let a caller appear to satisfy a rule the server then applies
        // differently, and these decisions gate the strongest claim this
        // platform makes.
        const action = positional[1]
        // `list` is readable without a token when the assessment is public, so
        // demanding one would be stricter than the API and would refuse a
        // command that works. Everything else writes or is owner-scoped.
        // Found by running the built CLI against production, not by reading it.
        const client = registryClient(flags, { requireToken: action !== "list" })

        const need = (value: string | undefined) =>
          value && value.trim().length > 0 ? value : null

        switch (action) {
          case "list": {
            const slug = need(positional[2])
            if (!slug) return { exitCode: 2, stderr: "review list requires an assessment slug." }
            return { exitCode: 0, stdout: { command: "review list", reviews: await client.reviews.list(slug) } }
          }
          case "queue":
            return { exitCode: 0, stdout: { command: "review queue", reviews: await client.reviews.queue() } }
          case "request": {
            const slug = need(positional[2])
            const text = need(positional.slice(3).join(" "))
            if (!slug || !text) {
              return { exitCode: 2, stderr: "review request requires an assessment slug and what to review." }
            }
            return {
              exitCode: 0,
              stdout: { command: "review request", review: await client.reviews.request(slug, { request: text }) },
            }
          }
          case "claim": {
            const id = need(positional[2])
            if (!id) return { exitCode: 2, stderr: "review claim requires a review id." }
            return { exitCode: 0, stdout: { command: "review claim", review: await client.reviews.claim(id) } }
          }
          case "note": {
            const id = need(positional[2])
            const body = need(positional.slice(3).join(" "))
            if (!id || !body) return { exitCode: 2, stderr: "review note requires a review id and note text." }
            return { exitCode: 0, stdout: { command: "review note", review: await client.reviews.note(id, body) } }
          }
          case "approve":
          case "changes": {
            const id = need(positional[2])
            const reason = need(positional.slice(3).join(" "))
            // Required here as well as on the server: finding out from a 400
            // that a decision needs a reason is worse than being told before
            // the request leaves.
            if (!id || !reason) {
              return { exitCode: 2, stderr: `review ${action} requires a review id and a reason.` }
            }
            return {
              exitCode: 0,
              stdout: {
                command: `review ${action}`,
                review: await client.reviews.decide(
                  id,
                  action === "approve" ? "APPROVED" : "CHANGES_REQUESTED",
                  reason,
                ),
              },
            }
          }
          default:
            return {
              exitCode: 2,
              stderr: "Usage: review list|queue|request|claim|note|approve|changes",
            }
        }
      }

      case "job": {
        // Every path here enqueues; none executes. A CLI that ran the circuit
        // locally and uploaded the answer would produce a registry record with
        // no audit trail and no enforced limits, indistinguishable from one the
        // worker produced.
        const client = registryClient(flags, { requireToken: true })

        switch (subcommand) {
          case "submit": {
            const path = positional[2]
            if (!path) return { exitCode: 2, stderr: "job submit requires a file path." }
            // Read and parse locally so a malformed circuit fails here, naming
            // the construct, rather than as a 400 from the server.
            const { circuit, loss } = readCircuit(path)
            const qasm = readFileSync(path, "utf8")

            const submitted = await client.execution.submit({
              schema_version: "1.0",
              parameters: {
                operation: "simulate",
                qasm,
                ...(numberFlag(flags, "shots") !== undefined ? { shots: numberFlag(flags, "shots") } : {}),
                ...(numberFlag(flags, "seed") !== undefined ? { seed: numberFlag(flags, "seed") } : {}),
              },
              ...(flags.get("idempotency-key")
                ? { idempotency_key: flags.get("idempotency-key") }
                : {}),
            })

            const job = (submitted.job ?? {}) as { id?: string; status?: string }
            const base = {
              command: "job submit",
              job,
              dispatched: submitted.dispatched ?? false,
              circuit: circuitSummary(circuit),
              // Conversion loss is reported at submission, not swallowed. A
              // result computed from a lossily-converted circuit answers a
              // different question than the one the file asked.
              ...(loss.length > 0 ? { conversion_loss: loss } : {}),
            }

            if (!flags.has("wait") || !job.id) {
              return { exitCode: 0, stdout: base }
            }

            const finished = await client.execution.waitFor(job.id, {
              timeoutMs: (numberFlag(flags, "timeout") ?? 180) * 1000,
            })
            const finalJob = (finished.job ?? finished) as { status?: string }
            return {
              // A job that failed exits non-zero, so `job submit --wait` can be
              // used in a script without parsing the JSON to find out.
              exitCode: finalJob.status === "SUCCEEDED" ? 0 : 1,
              stdout: { ...base, job: finalJob, waited: true },
            }
          }

          case "status": {
            const jobId = positional[2]
            if (!jobId) return { exitCode: 2, stderr: "job status requires a job id." }
            return { exitCode: 0, stdout: { command: "job status", ...(await client.execution.get(jobId)) } }
          }

          case "watch": {
            const jobId = positional[2]
            if (!jobId) return { exitCode: 2, stderr: "job watch requires a job id." }

            // Each transition once, in order, so the output is a history rather
            // than a repeated line.
            const transitions: Array<{ status: string; at: string }> = []
            const finished = await client.execution.waitFor(jobId, {
              timeoutMs: (numberFlag(flags, "timeout") ?? 180) * 1000,
              onStatusChange: (status) => transitions.push({ status, at: new Date().toISOString() }),
            })

            const job = (finished.job ?? finished) as { status?: string }
            const terminal = Boolean(job.status && TERMINAL_JOB_STATUSES.includes(job.status))

            // A timeout is not a failure. The job did not fail; the watching
            // stopped, and it is very likely still running. Reporting those the
            // same way tells the user something untrue about their experiment.
            if (!terminal) {
              return {
                exitCode: 2,
                stdout: {
                  command: "job watch",
                  job,
                  transitions,
                  timed_out: true,
                  note:
                    "Stopped watching before the job reached a terminal state. The job has not " +
                    "failed and is probably still running; re-run `job watch` or raise --timeout.",
                },
              }
            }

            return {
              // Matches `job submit --wait`, so either is usable in a script
              // without parsing the JSON to find out what happened.
              exitCode: job.status === "SUCCEEDED" ? 0 : 1,
              stdout: { command: "job watch", job, transitions },
            }
          }

          case "list": {
            const jobs = await client.execution.list({
              ...(flags.get("status") ? { status: flags.get("status") as string } : {}),
              ...(numberFlag(flags, "limit") !== undefined ? { limit: numberFlag(flags, "limit") as number } : {}),
            })
            return { exitCode: 0, stdout: { command: "job list", jobs, count: jobs.length } }
          }

          case "cancel": {
            const jobId = positional[2]
            if (!jobId) return { exitCode: 2, stderr: "job cancel requires a job id." }
            return { exitCode: 0, stdout: { command: "job cancel", ...(await client.execution.cancel(jobId)) } }
          }

          case "bundle": {
            const jobId = positional[2]
            if (!jobId) return { exitCode: 2, stderr: "job bundle requires a job id." }
            return { exitCode: 0, stdout: { command: "job bundle", ...(await client.execution.bundle(jobId)) } }
          }

          default:
            return {
              exitCode: 2,
              stderr: "usage: job <submit|status|watch|list|cancel|bundle> [...]\n\n" + USAGE,
            }
        }
      }

      case "push": {
        const [, slug, cardPath] = positional
        const version = flags.get("version")
        if (!slug || !cardPath) {
          return { exitCode: 2, stderr: "usage: push <slug> <card.json> --version <version>" }
        }
        const card = JSON.parse(readFileSync(cardPath, "utf8")) as { version?: string }
        const resolved = version ?? card.version
        if (!resolved) {
          return {
            exitCode: 2,
            stderr: "push requires --version, or a version field in the card.",
          }
        }
        const client = registryClient(flags, { requireToken: true })
        const published = await client.artifactVersions.publish(slug, {
          version: resolved,
          quantum_card: card,
          ...(flags.get("commit") ? { commit_sha: flags.get("commit") as string } : {}),
        })
        return { exitCode: 0, stdout: { command: "push", version: published } }
      }

      default:
        return { exitCode: 2, stderr: `Unknown command '${command}'.\n\n${USAGE}` }
    }
  } catch (error) {
    if (error instanceof RegistryConfigurationError) {
      return { exitCode: 2, stderr: error.message }
    }
    if (error instanceof AssessmentFileError) {
      return { exitCode: 2, stderr: error.message }
    }
    if (error instanceof Qasm3ParseError) {
      return {
        exitCode: 1,
        stdout: {
          error: "qasm_parse_error",
          message: error.message,
          feature: error.feature ?? null,
          line: error.line ?? null,
        },
      }
    }
    return { exitCode: 1, stdout: { error: "command_failed", message: (error as Error).message } }
  }
}
