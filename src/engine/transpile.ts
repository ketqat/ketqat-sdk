import type { LossReportEntry } from "../contracts/common.js"
import type { CircuitTransformation } from "../contracts/transformation.js"
import type { BitRef, Operation, QuantumCircuit, SimpleOperation } from "../circuit/graph.js"
import { couplingAdjacency, shortestPath, type HardwareProfile } from "../hardware/profile.js"

/**
 * Hardware-aware transpilation: map logical qubits onto physical ones and
 * insert SWAPs so every two-qubit gate acts on a coupled pair.
 *
 * The routing is a deliberately simple, documented heuristic -- trivial initial
 * layout, then shortest-path SWAP insertion. It is not claimed to be optimal,
 * and `TranspileResult` reports the SWAP count and depth so a caller can
 * compare it against another compiler rather than take it on trust. Claiming
 * optimality here would be the kind of unsupported statement the platform is
 * built to avoid.
 */

export class TranspileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TranspileError"
  }
}

export const TRANSPILER_NAME = "ketqat-routing"
export const TRANSPILER_VERSION = "0.1.0"

export interface TranspileOptions {
  /**
   * Logical qubit i starts on physical `initial_layout[i]`. Defaults to the
   * identity layout, which is stated in the result so it is never mistaken for
   * an optimized choice.
   */
  initial_layout?: number[]
}

export interface TranspileResult {
  circuit: QuantumCircuit
  /** Physical qubit holding each logical qubit at the start. */
  initial_layout: number[]
  /** Physical qubit holding each logical qubit at the end, after routing. */
  final_layout: number[]
  swap_count: number
  two_qubit_gate_count: number
  depth: number
  loss_report: LossReportEntry[]
  transformation: CircuitTransformation
}

function flattenQubits(circuit: QuantumCircuit): { name: string; index: number }[] {
  const bits: { name: string; index: number }[] = []
  for (const register of circuit.qubit_registers) {
    for (let index = 0; index < register.size; index += 1) {
      bits.push({ name: register.name, index })
    }
  }
  return bits
}

function logicalIndex(circuit: QuantumCircuit, bit: BitRef): number {
  let offset = 0
  for (const register of circuit.qubit_registers) {
    if (register.name === bit.register) return offset + bit.index
    offset += register.size
  }
  throw new TranspileError(`Unknown qubit register '${bit.register}'.`)
}

/** Circuit depth counting each operation as one layer per qubit it touches. */
export function circuitDepth(circuit: QuantumCircuit): number {
  const depths = new Map<string, number>()
  const key = (bit: BitRef) => `${bit.register}[${bit.index}]`

  const touch = (bits: BitRef[]): void => {
    if (bits.length === 0) return
    const next = Math.max(...bits.map((bit) => depths.get(key(bit)) ?? 0)) + 1
    for (const bit of bits) depths.set(key(bit), next)
  }

  const visit = (operation: Operation): void => {
    switch (operation.kind) {
      case "gate":
        touch(operation.qubits)
        return
      case "measure":
        touch([operation.qubit])
        return
      case "reset":
        touch([operation.qubit])
        return
      case "barrier":
        return
      case "conditional":
        visit(operation.body)
        return
    }
  }

  circuit.operations.forEach(visit)
  return depths.size === 0 ? 0 : Math.max(...depths.values())
}

export function transpileForHardware(
  circuit: QuantumCircuit,
  profile: HardwareProfile,
  options: TranspileOptions = {},
): TranspileResult {
  const logicalBits = flattenQubits(circuit)
  const logicalCount = logicalBits.length
  if (logicalCount > profile.qubit_count) {
    throw new TranspileError(
      `Circuit needs ${logicalCount} qubits but ${profile.provider}/${profile.backend} has ${profile.qubit_count}.`,
    )
  }

  const adjacency = couplingAdjacency(profile)
  const operational = [...adjacency.keys()].sort((a, b) => a - b)
  if (operational.length < logicalCount) {
    throw new TranspileError(
      `Circuit needs ${logicalCount} qubits but only ${operational.length} are operational on ` +
        `${profile.provider}/${profile.backend}.`,
    )
  }

  const initialLayout =
    options.initial_layout ?? operational.slice(0, logicalCount)
  if (initialLayout.length !== logicalCount) {
    throw new TranspileError(
      `initial_layout has ${initialLayout.length} entries but the circuit has ${logicalCount} qubits.`,
    )
  }
  for (const physical of initialLayout) {
    if (!adjacency.has(physical)) {
      throw new TranspileError(`Physical qubit ${physical} is not operational on this device.`)
    }
  }

  // logicalToPhysical[l] = current physical qubit for logical qubit l
  const logicalToPhysical = [...initialLayout]
  const physicalToLogical = new Map<number, number>()
  logicalToPhysical.forEach((physical, logical) => physicalToLogical.set(physical, logical))

  const routedRegister = "q"
  const operations: Operation[] = []
  const loss: LossReportEntry[] = []
  let swapCount = 0
  let twoQubitGateCount = 0

  const physicalBit = (logical: number): BitRef => ({
    register: routedRegister,
    index: logicalToPhysical[logical] as number,
  })

  const swapLogical = (physicalA: number, physicalB: number): void => {
    const logicalA = physicalToLogical.get(physicalA)
    const logicalB = physicalToLogical.get(physicalB)
    if (logicalA !== undefined) logicalToPhysical[logicalA] = physicalB
    if (logicalB !== undefined) logicalToPhysical[logicalB] = physicalA
    if (logicalA !== undefined) physicalToLogical.set(physicalB, logicalA)
    else physicalToLogical.delete(physicalB)
    if (logicalB !== undefined) physicalToLogical.set(physicalA, logicalB)
    else physicalToLogical.delete(physicalA)
  }

  const emitRouting = (controlLogical: number, targetLogical: number): void => {
    const from = logicalToPhysical[controlLogical] as number
    const to = logicalToPhysical[targetLogical] as number
    if (adjacency.get(from)?.has(to)) return

    const path = shortestPath(adjacency, from, to)
    if (!path) {
      throw new TranspileError(
        `No route between physical qubits ${from} and ${to} on ${profile.provider}/${profile.backend}. ` +
          "The coupling graph is disconnected for this pair.",
      )
    }
    // Walk the control toward the target, leaving it adjacent.
    for (let step = 0; step < path.length - 2; step += 1) {
      const a = path[step] as number
      const b = path[step + 1] as number
      operations.push({
        kind: "gate",
        name: "swap",
        parameters: [],
        qubits: [
          { register: routedRegister, index: a },
          { register: routedRegister, index: b },
        ],
      })
      swapLogical(a, b)
      swapCount += 1
    }
  }

  const routeSimple = (operation: SimpleOperation): void => {
    switch (operation.kind) {
      case "gate": {
        const logicals = operation.qubits.map((bit) => logicalIndex(circuit, bit))
        if (logicals.length === 2) {
          emitRouting(logicals[0] as number, logicals[1] as number)
          twoQubitGateCount += 1
        } else if (logicals.length > 2) {
          throw new TranspileError(
            `Gate '${operation.name}' acts on ${logicals.length} qubits. Decompose gates wider than two ` +
              "qubits before routing; this router does not synthesize a decomposition.",
          )
        }
        if (!profile.native_gates.includes(operation.name.toLowerCase()) && logicals.length === 1) {
          loss.push({
            feature: "non_native_gate",
            severity: "structural",
            action: "approximated",
            detail:
              `Gate '${operation.name}' is not in the device's native set ` +
              `[${profile.native_gates.join(", ")}] and was emitted unchanged. ` +
              "Basis translation is not performed by this router.",
          })
        }
        operations.push({
          ...operation,
          qubits: logicals.map((logical) => physicalBit(logical)),
        })
        return
      }
      case "measure":
        operations.push({
          kind: "measure",
          qubit: physicalBit(logicalIndex(circuit, operation.qubit)),
          clbit: operation.clbit,
        })
        return
      case "reset":
        if (!profile.capabilities.reset) {
          loss.push({
            feature: "reset",
            severity: "semantic",
            action: "rejected",
            detail: `${profile.provider}/${profile.backend} does not report reset support.`,
          })
        }
        operations.push({ kind: "reset", qubit: physicalBit(logicalIndex(circuit, operation.qubit)) })
        return
      case "barrier":
        operations.push({
          kind: "barrier",
          qubits: operation.qubits.map((bit) => physicalBit(logicalIndex(circuit, bit))),
        })
        return
    }
  }

  for (const operation of circuit.operations) {
    if (operation.kind === "conditional") {
      // Feed-forward is a device capability, not a compilation detail. Emitting
      // the body unconditionally on a device that cannot branch would silently
      // change the program, so the loss is recorded as semantic.
      if (!profile.capabilities.feed_forward) {
        loss.push({
          feature: "classical_feed_forward",
          severity: "semantic",
          action: "rejected",
          detail:
            `${profile.provider}/${profile.backend} does not report feed-forward support, so the ` +
            `condition on register '${operation.register}' cannot be executed as written.`,
        })
      }
      const before = operations.length
      routeSimple(operation.body)
      const emitted = operations.splice(before)
      for (const inner of emitted) {
        if (inner.kind === "conditional") continue
        operations.push({ kind: "conditional", register: operation.register, equals: operation.equals, body: inner })
      }
      continue
    }
    routeSimple(operation)
  }

  if (circuit.operations.some((operation) => operation.kind === "measure") &&
      !profile.capabilities.mid_circuit_measurement) {
    const measureIndex = circuit.operations.findIndex((operation) => operation.kind === "measure")
    const laterOperation = circuit.operations
      .slice(measureIndex + 1)
      .some((operation) => operation.kind !== "measure" && operation.kind !== "barrier")
    if (laterOperation) {
      loss.push({
        feature: "mid_circuit_measurement",
        severity: "semantic",
        action: "rejected",
        detail: `${profile.provider}/${profile.backend} does not report mid-circuit measurement support.`,
      })
    }
  }

  const routed: QuantumCircuit = {
    name: circuit.name,
    qubit_registers: [{ name: routedRegister, size: profile.qubit_count }],
    clbit_registers: circuit.clbit_registers,
    operations,
  }

  return {
    circuit: routed,
    initial_layout: initialLayout,
    final_layout: [...logicalToPhysical],
    swap_count: swapCount,
    two_qubit_gate_count: twoQubitGateCount,
    depth: circuitDepth(routed),
    loss_report: loss,
    transformation: {
      kind: "ROUTING",
      adapter: TRANSPILER_NAME,
      adapter_version: TRANSPILER_VERSION,
      options: {
        provider: profile.provider,
        backend: profile.backend,
        snapshot_id: profile.snapshot_id,
        initial_layout: initialLayout,
      },
      loss_report: loss,
      // Routing preserves the unitary up to the final qubit permutation, which
      // is recorded in final_layout. That is a condition, not a proof, so the
      // level stays NOT_CHECKED until an equivalence check actually runs.
      equivalence: {
        level: "NOT_CHECKED",
        method: "SWAP routing preserves the circuit up to the recorded final_layout permutation.",
      },
    },
  }
}
