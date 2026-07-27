import { readFileSync } from "node:fs"
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

Every command prints one JSON object to stdout.`

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

export function runCli(argv: string[]): CommandResult {
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

      default:
        return { exitCode: 2, stderr: `Unknown command '${command}'.\n\n${USAGE}` }
    }
  } catch (error) {
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
