import { readFileSync } from "node:fs";
import { KetQatClient, TERMINAL_JOB_STATUSES } from "../client/index.js";
import { HardwareProfileSchema } from "../hardware/profile.js";
import { emitQasm3, parseQasm3, Qasm3ParseError } from "../circuit/qasm3.js";
import { gateCount, totalClbits, totalQubits, twoQubitGateCount, usesClassicalControl, usesMidCircuitMeasurement, usesReset, } from "../circuit/graph.js";
import { checkCircuitEquivalence } from "../engine/differential.js";
import { estimateResources } from "../engine/resources.js";
import { simulateStatevector } from "../engine/statevector.js";
import { circuitDepth, transpileForHardware } from "../engine/transpile.js";
import { optimizeWithZx } from "../engine/zx.js";
import { zeroNoiseExtrapolation } from "../engine/mitigation.js";
import { NoiseModelSchema } from "../engine/noise.js";
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

The local "simulate" command runs on this machine. "job submit" runs the same
engine in a sandboxed container with enforced limits and an audit trail, and is
what to use for anything whose result will be published.

Authentication reads KETQAT_TOKEN from the environment. A token is never
accepted as a command-line argument, because arguments appear in shell history
and in the process list.

Every command prints one JSON object to stdout.`;
function parseFlags(argv) {
    const positional = [];
    const flags = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token.startsWith("--")) {
            const [name, inline] = token.slice(2).split("=", 2);
            if (inline !== undefined) {
                flags.set(name, inline);
            }
            else {
                const next = argv[index + 1];
                if (next === undefined || next.startsWith("--")) {
                    flags.set(name, "true");
                }
                else {
                    flags.set(name, next);
                    index += 1;
                }
            }
        }
        else {
            positional.push(token);
        }
    }
    return { positional, flags };
}
function readCircuit(path) {
    const source = readFileSync(path, "utf8");
    const parsed = parseQasm3(source);
    return { circuit: parsed.circuit, loss: parsed.loss_report };
}
function readHardware(path) {
    return HardwareProfileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
function numberFlag(flags, name) {
    const raw = flags.get(name);
    if (raw === undefined)
        return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`--${name} must be a number, got '${raw}'.`);
    }
    return value;
}
function noiseFrom(flags) {
    const one = numberFlag(flags, "noise-1q") ?? 0;
    const two = numberFlag(flags, "noise-2q") ?? 0;
    const readout = numberFlag(flags, "readout") ?? 0;
    if (one === 0 && two === 0 && readout === 0)
        return undefined;
    return NoiseModelSchema.parse({
        model: "depolarizing",
        one_qubit_error: one,
        two_qubit_error: two,
        readout_error: readout,
    });
}
class RegistryConfigurationError extends Error {
}
/**
 * Build a registry client.
 *
 * The token is read from the environment only. Accepting it as a flag would put
 * it in shell history and in the process list, where other users on the machine
 * can read it.
 */
function registryClient(flags, options = {}) {
    const baseUrl = flags.get("registry") ?? process.env.KETQAT_URL;
    if (!baseUrl) {
        throw new RegistryConfigurationError("No registry URL. Pass --registry <url> or set KETQAT_URL.");
    }
    const token = process.env.KETQAT_TOKEN;
    if (options.requireToken && !token) {
        throw new RegistryConfigurationError("No API token. Set KETQAT_TOKEN in the environment. Tokens are not accepted as arguments, " +
            "because arguments appear in shell history and in the process list.");
    }
    return new KetQatClient({ baseUrl, ...(token ? { token } : {}) });
}
function circuitSummary(circuit) {
    return {
        qubits: totalQubits(circuit),
        clbits: totalClbits(circuit),
        gate_count: gateCount(circuit),
        two_qubit_gate_count: twoQubitGateCount(circuit),
        depth: circuitDepth(circuit),
        uses_mid_circuit_measurement: usesMidCircuitMeasurement(circuit),
        uses_classical_control: usesClassicalControl(circuit),
        uses_reset: usesReset(circuit),
    };
}
export async function runCli(argv) {
    const { positional, flags } = parseFlags(argv);
    const [command, subcommand] = positional;
    if (command === undefined || flags.has("help") || command === "help") {
        return { exitCode: command === undefined ? 2 : 0, stderr: USAGE };
    }
    try {
        switch (command) {
            case "circuit": {
                const path = positional[2];
                if (!path)
                    return { exitCode: 2, stderr: "circuit requires a file path.\n\n" + USAGE };
                const { circuit, loss } = readCircuit(path);
                if (subcommand === "inspect") {
                    return { exitCode: 0, stdout: { command: "circuit.inspect", summary: circuitSummary(circuit), loss_report: loss } };
                }
                if (subcommand === "convert") {
                    return { exitCode: 0, stdout: { command: "circuit.convert", qasm3: emitQasm3(circuit), loss_report: loss } };
                }
                return { exitCode: 2, stderr: `Unknown circuit subcommand '${subcommand}'.\n\n${USAGE}` };
            }
            case "simulate": {
                const path = positional[1];
                if (!path)
                    return { exitCode: 2, stderr: "simulate requires a file path." };
                const { circuit } = readCircuit(path);
                const result = simulateStatevector(circuit, {
                    shots: numberFlag(flags, "shots"),
                    seed: numberFlag(flags, "seed"),
                    noise: noiseFrom(flags),
                });
                return { exitCode: 0, stdout: { command: "simulate", ...result } };
            }
            case "transpile": {
                const path = positional[1];
                const hardwarePath = flags.get("hardware");
                if (!path || !hardwarePath) {
                    return { exitCode: 2, stderr: "transpile requires a file path and --hardware <profile.json>." };
                }
                const { circuit } = readCircuit(path);
                const result = transpileForHardware(circuit, readHardware(hardwarePath));
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
                };
            }
            case "resources": {
                const path = positional[1];
                if (!path)
                    return { exitCode: 2, stderr: "resources requires a file path." };
                const { circuit } = readCircuit(path);
                const hardwarePath = flags.get("hardware");
                const estimate = estimateResources(circuit, hardwarePath ? readHardware(hardwarePath) : undefined);
                return { exitCode: 0, stdout: { command: "resources", ...estimate } };
            }
            case "zx": {
                const path = positional[2];
                if (subcommand !== "optimize" || !path) {
                    return { exitCode: 2, stderr: "usage: zx optimize <file.qasm>" };
                }
                const { circuit } = readCircuit(path);
                const result = optimizeWithZx(circuit);
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
                };
            }
            case "equivalence": {
                const [, left, right] = positional;
                if (!left || !right)
                    return { exitCode: 2, stderr: "equivalence requires two file paths." };
                const evidence = checkCircuitEquivalence(readCircuit(left).circuit, readCircuit(right).circuit, {
                    tolerance: numberFlag(flags, "tolerance"),
                });
                // A FAILED equivalence is a real finding, not a tool error, so it still
                // exits 0 with the evidence. Exit 1 is reserved for the tool failing.
                return { exitCode: 0, stdout: { command: "equivalence", evidence } };
            }
            case "mitigate": {
                const path = positional[2];
                if (subcommand !== "zne" || !path) {
                    return { exitCode: 2, stderr: "usage: mitigate zne <file.qasm> --noise-1q <p>" };
                }
                const noise = noiseFrom(flags);
                if (!noise) {
                    return {
                        exitCode: 2,
                        stderr: "mitigate zne requires a noise model: --noise-1q, --noise-2q, or --readout.",
                    };
                }
                const { circuit } = readCircuit(path);
                const result = zeroNoiseExtrapolation(circuit, noise, {
                    shots: numberFlag(flags, "shots"),
                    seed: numberFlag(flags, "seed"),
                });
                return { exitCode: 0, stdout: { command: "mitigate.zne", ...result } };
            }
            case "search": {
                const term = positional.slice(1).join(" ");
                if (!term)
                    return { exitCode: 2, stderr: "search requires a query." };
                const client = registryClient(flags);
                return { exitCode: 0, stdout: { command: "search", results: await client.search.query(term) } };
            }
            case "pull": {
                const slug = positional[1];
                if (!slug)
                    return { exitCode: 2, stderr: "pull requires an artifact slug." };
                const client = registryClient(flags);
                const [artifact, versions, relations] = await Promise.all([
                    client.artifacts.get(slug),
                    client.artifactVersions.list(slug),
                    client.artifactRelations.list(slug),
                ]);
                return { exitCode: 0, stdout: { command: "pull", artifact, versions, relations } };
            }
            case "job": {
                // Every path here enqueues; none executes. A CLI that ran the circuit
                // locally and uploaded the answer would produce a registry record with
                // no audit trail and no enforced limits, indistinguishable from one the
                // worker produced.
                const client = registryClient(flags, { requireToken: true });
                switch (subcommand) {
                    case "submit": {
                        const path = positional[2];
                        if (!path)
                            return { exitCode: 2, stderr: "job submit requires a file path." };
                        // Read and parse locally so a malformed circuit fails here, naming
                        // the construct, rather than as a 400 from the server.
                        const { circuit, loss } = readCircuit(path);
                        const qasm = readFileSync(path, "utf8");
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
                        });
                        const job = (submitted.job ?? {});
                        const base = {
                            command: "job submit",
                            job,
                            dispatched: submitted.dispatched ?? false,
                            circuit: circuitSummary(circuit),
                            // Conversion loss is reported at submission, not swallowed. A
                            // result computed from a lossily-converted circuit answers a
                            // different question than the one the file asked.
                            ...(loss.length > 0 ? { conversion_loss: loss } : {}),
                        };
                        if (!flags.has("wait") || !job.id) {
                            return { exitCode: 0, stdout: base };
                        }
                        const finished = await client.execution.waitFor(job.id, {
                            timeoutMs: (numberFlag(flags, "timeout") ?? 180) * 1000,
                        });
                        const finalJob = (finished.job ?? finished);
                        return {
                            // A job that failed exits non-zero, so `job submit --wait` can be
                            // used in a script without parsing the JSON to find out.
                            exitCode: finalJob.status === "SUCCEEDED" ? 0 : 1,
                            stdout: { ...base, job: finalJob, waited: true },
                        };
                    }
                    case "status": {
                        const jobId = positional[2];
                        if (!jobId)
                            return { exitCode: 2, stderr: "job status requires a job id." };
                        return { exitCode: 0, stdout: { command: "job status", ...(await client.execution.get(jobId)) } };
                    }
                    case "watch": {
                        const jobId = positional[2];
                        if (!jobId)
                            return { exitCode: 2, stderr: "job watch requires a job id." };
                        // Each transition once, in order, so the output is a history rather
                        // than a repeated line.
                        const transitions = [];
                        const finished = await client.execution.waitFor(jobId, {
                            timeoutMs: (numberFlag(flags, "timeout") ?? 180) * 1000,
                            onStatusChange: (status) => transitions.push({ status, at: new Date().toISOString() }),
                        });
                        const job = (finished.job ?? finished);
                        const terminal = Boolean(job.status && TERMINAL_JOB_STATUSES.includes(job.status));
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
                                    note: "Stopped watching before the job reached a terminal state. The job has not " +
                                        "failed and is probably still running; re-run `job watch` or raise --timeout.",
                                },
                            };
                        }
                        return {
                            // Matches `job submit --wait`, so either is usable in a script
                            // without parsing the JSON to find out what happened.
                            exitCode: job.status === "SUCCEEDED" ? 0 : 1,
                            stdout: { command: "job watch", job, transitions },
                        };
                    }
                    case "list": {
                        const jobs = await client.execution.list({
                            ...(flags.get("status") ? { status: flags.get("status") } : {}),
                            ...(numberFlag(flags, "limit") !== undefined ? { limit: numberFlag(flags, "limit") } : {}),
                        });
                        return { exitCode: 0, stdout: { command: "job list", jobs, count: jobs.length } };
                    }
                    case "cancel": {
                        const jobId = positional[2];
                        if (!jobId)
                            return { exitCode: 2, stderr: "job cancel requires a job id." };
                        return { exitCode: 0, stdout: { command: "job cancel", ...(await client.execution.cancel(jobId)) } };
                    }
                    case "bundle": {
                        const jobId = positional[2];
                        if (!jobId)
                            return { exitCode: 2, stderr: "job bundle requires a job id." };
                        return { exitCode: 0, stdout: { command: "job bundle", ...(await client.execution.bundle(jobId)) } };
                    }
                    default:
                        return {
                            exitCode: 2,
                            stderr: "usage: job <submit|status|watch|list|cancel|bundle> [...]\n\n" + USAGE,
                        };
                }
            }
            case "push": {
                const [, slug, cardPath] = positional;
                const version = flags.get("version");
                if (!slug || !cardPath) {
                    return { exitCode: 2, stderr: "usage: push <slug> <card.json> --version <version>" };
                }
                const card = JSON.parse(readFileSync(cardPath, "utf8"));
                const resolved = version ?? card.version;
                if (!resolved) {
                    return {
                        exitCode: 2,
                        stderr: "push requires --version, or a version field in the card.",
                    };
                }
                const client = registryClient(flags, { requireToken: true });
                const published = await client.artifactVersions.publish(slug, {
                    version: resolved,
                    quantum_card: card,
                    ...(flags.get("commit") ? { commit_sha: flags.get("commit") } : {}),
                });
                return { exitCode: 0, stdout: { command: "push", version: published } };
            }
            default:
                return { exitCode: 2, stderr: `Unknown command '${command}'.\n\n${USAGE}` };
        }
    }
    catch (error) {
        if (error instanceof RegistryConfigurationError) {
            return { exitCode: 2, stderr: error.message };
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
            };
        }
        return { exitCode: 1, stdout: { error: "command_failed", message: error.message } };
    }
}
//# sourceMappingURL=index.js.map