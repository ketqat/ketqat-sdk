import type { LossReportEntry } from "../contracts/common.js"
import type { Operation, QuantumCircuit } from "./graph.js"
import { PHYSICAL_QUBIT_REGISTER } from "./qasm3.js"

/**
 * Emit OpenQASM 2 (ketqat-sdk#182).
 *
 * KetQat could already *read* OpenQASM 2 -- that landed so Cirq's output could be
 * imported -- but it only ever *wrote* OpenQASM 3. So interoperability with the
 * two toolchains that speak OpenQASM 2 was a one-way door: pytket and Cirq
 * circuits could come in and nothing could go back out. pytket rejects OpenQASM 3
 * outright ("Header stdgates is not known"), so there was no route at all.
 *
 * Emitting an older dialect loses expressiveness, and the interesting part of this
 * module is which losses are acceptable and which are not.
 *
 * **Refused, because emitting them would change the program.** OpenQASM 2's
 * conditional is `if (creg == N)` over a whole register. A single-bit condition --
 * `if (c[1])`, which Qiskit emits for dynamic circuits -- has no equivalent, and
 * widening it to a whole-register test is not a degraded translation but a
 * different program: `c[1] == 1` is true for many register values that `c == 1` is
 * false for. So it is refused rather than approximated. Hardware qubits (`$n`) are
 * likewise refused: OpenQASM 2 has no physical-qubit syntax, and declaring them as
 * a virtual register would assert a layout the circuit does not have.
 *
 * **Recorded, because the meaning survives.** The version and include line change,
 * and `qubit`/`bit` become `qreg`/`creg`. Those are spellings, not semantics, so
 * they are noted in the loss report and emitted.
 */

export interface Qasm2EmitResult {
  qasm: string
  lossReport: LossReportEntry[]
}

export class Qasm2EmitError extends Error {
  readonly feature: string

  constructor(message: string, feature: string) {
    super(message)
    this.feature = feature
  }
}

/** Gates in `qelib1.inc`, the only ones an OpenQASM 2 reader is required to know. */
const QELIB1_GATES = new Set([
  "u3", "u2", "u1", "cx", "id", "u0", "u", "p", "x", "y", "z", "h", "s", "sdg",
  "t", "tdg", "rx", "ry", "rz", "sx", "sxdg", "cz", "cy", "swap", "ch", "ccx",
  "cswap", "crx", "cry", "crz", "cu1", "cp", "cu3", "csx", "cu", "rxx", "rzz",
  "rccx", "rc3x", "c3x", "c3sqrtx", "c4x",
])

function formatBit(bit: { register: string; index: number }): string {
  return `${bit.register}[${bit.index}]`
}

function formatParameters(parameters: ReadonlyArray<number | string>): string {
  if (parameters.length === 0) return ""
  return `(${parameters.map((parameter) => String(parameter)).join(", ")})`
}

function formatSimple(operation: Operation): string {
  switch (operation.kind) {
    case "gate": {
      const name = operation.name.toLowerCase()
      if (!QELIB1_GATES.has(name)) {
        throw new Qasm2EmitError(
          `'${operation.name}' is not in qelib1.inc, so an OpenQASM 2 reader is not required to know ` +
            "it. Emitting it would produce a file that parses for some tools and not others.",
          "gate_outside_qelib1",
        )
      }
      const qubits = operation.qubits.map(formatBit).join(", ")
      return `${name}${formatParameters(operation.parameters)} ${qubits};`
    }
    case "measure":
      // OpenQASM 2 has only the arrow form; the assignment form is OpenQASM 3.
      return `measure ${formatBit(operation.qubit)} -> ${formatBit(operation.clbit)};`
    case "reset":
      return `reset ${formatBit(operation.qubit)};`
    case "barrier":
      return `barrier ${operation.qubits.map(formatBit).join(", ")};`
    default:
      throw new Qasm2EmitError(
        `'${(operation as { kind: string }).kind}' has no OpenQASM 2 form.`,
        "unsupported_operation",
      )
  }
}

/**
 * Emit a circuit as OpenQASM 2, with everything lost or refused reported.
 *
 * Returns the loss report alongside the text rather than only on failure, because
 * a caller sending this to another tool needs to know what changed even when the
 * emission succeeded.
 */
export function emitQasm2(circuit: QuantumCircuit): Qasm2EmitResult {
  const lossReport: LossReportEntry[] = []

  const physical = circuit.qubit_registers.find((register) => register.name === PHYSICAL_QUBIT_REGISTER)
  if (physical) {
    throw new Qasm2EmitError(
      "This circuit uses hardware qubits ($n), which OpenQASM 2 cannot express. Declaring them as a " +
        "virtual register would assert a layout the circuit does not have, so it is refused rather " +
        "than approximated.",
      "hardware_qubit_syntax",
    )
  }

  const lines: string[] = ["OPENQASM 2.0;", 'include "qelib1.inc";', ""]

  for (const register of circuit.qubit_registers) {
    lines.push(`qreg ${register.name}[${register.size}];`)
  }
  for (const register of circuit.clbit_registers) {
    lines.push(`creg ${register.name}[${register.size}];`)
  }
  if (circuit.qubit_registers.length > 0 || circuit.clbit_registers.length > 0) {
    lines.push("")
    lossReport.push({
      feature: "openqasm2_register_syntax",
      severity: "cosmetic",
      action: "approximated",
      detail:
        "Registers are emitted as OpenQASM 2 `qreg`/`creg` rather than OpenQASM 3 `qubit`/`bit`. The " +
        "declarations mean the same thing; only the spelling differs.",
    })
  }

  for (const operation of circuit.operations) {
    if (operation.kind === "conditional") {
      if (operation.bit !== undefined) {
        throw new Qasm2EmitError(
          `This circuit tests a single classical bit (${operation.register}[${operation.bit}]), which ` +
            "OpenQASM 2 cannot express -- its conditional compares a whole register. Widening it to " +
            `'if (${operation.register} == ${operation.equals})' would be a different program, not a ` +
            "degraded one, so it is refused.",
          "single_bit_condition",
        )
      }
      lines.push(`if (${operation.register} == ${operation.equals}) ${formatSimple(operation.body)}`)
      continue
    }
    lines.push(formatSimple(operation))
  }

  lossReport.push({
    feature: "openqasm2_target",
    severity: "cosmetic",
    action: "approximated",
    detail:
      "Emitted as OpenQASM 2 for tools that cannot read OpenQASM 3 -- pytket rejects it outright. " +
      "Constructs with no OpenQASM 2 equivalent are refused rather than approximated, so anything " +
      "present here means the same as it did in OpenQASM 3.",
  })

  return { qasm: `${lines.join("\n")}\n`, lossReport }
}
