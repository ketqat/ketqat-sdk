import { z } from "zod"
import type { Operation, QuantumCircuit } from "../circuit/graph.js"
import { circuitDepth } from "./transpile.js"
import type { HardwareProfile } from "../hardware/profile.js"

/**
 * Resource estimation (RFC 0001).
 *
 * Two rules shape this module:
 *
 * 1. **Assumptions travel with the numbers.** Every estimate records the gate
 *    set, estimator, and version it was produced under, because two estimates
 *    computed under different assumptions are not comparable.
 * 2. **Never average across estimators.** `NormalizedResourceEstimate` holds
 *    normalized fields *alongside* the raw tool output, never instead of it,
 *    and there is deliberately no function here that combines two estimates
 *    into one.
 */

export const CLIFFORD_GATES = new Set([
  "i", "id", "x", "y", "z", "h", "s", "sdg", "sx", "sxdg", "cx", "cnot", "cz", "cy", "swap",
])

/** Gates counted as T or T-like for fault-tolerant costing. */
export const T_GATES = new Set(["t", "tdg"])

export const NISQResourcesSchema = z.object({
  logical_qubits: z.number().int().nonnegative(),
  circuit_depth: z.number().int().nonnegative(),
  gate_count: z.number().int().nonnegative(),
  one_qubit_gate_count: z.number().int().nonnegative(),
  two_qubit_gate_count: z.number().int().nonnegative(),
  measurement_count: z.number().int().nonnegative(),
  reset_count: z.number().int().nonnegative(),
  swap_count: z.number().int().nonnegative(),
  barrier_count: z.number().int().nonnegative(),
  conditional_count: z.number().int().nonnegative(),
  /** Only present when a hardware profile supplied gate durations. */
  estimated_duration_ns: z.number().nonnegative().optional(),
  /** Product of per-gate success probabilities; requires characterized errors. */
  estimated_success_probability: z.number().min(0).max(1).optional(),
})
export type NISQResources = z.infer<typeof NISQResourcesSchema>

export const FaultTolerantResourcesSchema = z.object({
  t_count: z.number().int().nonnegative(),
  clifford_count: z.number().int().nonnegative(),
  toffoli_count: z.number().int().nonnegative(),
  /** Non-Clifford, non-T gates that would need synthesis before FT costing. */
  unsupported_for_ft_count: z.number().int().nonnegative(),
})
export type FaultTolerantResources = z.infer<typeof FaultTolerantResourcesSchema>

export const ResourceAssumptionsSchema = z.object({
  estimator: z.string().min(1),
  estimator_version: z.string().min(1),
  gate_set: z.array(z.string().min(1)),
  /** Named so a reader can tell what the numbers do and do not account for. */
  notes: z.array(z.string().min(1)).default([]),
  hardware_snapshot: z.string().min(1).optional(),
})
export type ResourceAssumptions = z.infer<typeof ResourceAssumptionsSchema>

export const NormalizedResourceEstimateSchema = z.object({
  schema_version: z.string().min(1),
  nisq: NISQResourcesSchema,
  fault_tolerant: FaultTolerantResourcesSchema,
  assumptions: ResourceAssumptionsSchema,
  /**
   * Verbatim output of an external estimator, when one produced this record.
   * Kept alongside the normalized fields because normalization is lossy and
   * discarding the original destroys the evidence that makes it checkable.
   */
  raw: z.record(z.unknown()).optional(),
})
export type NormalizedResourceEstimate = z.infer<typeof NormalizedResourceEstimateSchema>

export const RESOURCE_ESTIMATOR = "ketqat-static"
export const RESOURCE_ESTIMATOR_VERSION = "0.1.0"

interface Tally {
  gate: number
  oneQubit: number
  twoQubit: number
  measure: number
  reset: number
  swap: number
  barrier: number
  conditional: number
  t: number
  clifford: number
  toffoli: number
  unsupported: number
  durationNs: number
  durationKnown: boolean
  successProbability: number
  errorsKnown: boolean
}

function emptyTally(): Tally {
  return {
    gate: 0, oneQubit: 0, twoQubit: 0, measure: 0, reset: 0, swap: 0, barrier: 0,
    conditional: 0, t: 0, clifford: 0, toffoli: 0, unsupported: 0,
    durationNs: 0, durationKnown: true, successProbability: 1, errorsKnown: true,
  }
}

export function estimateResources(
  circuit: QuantumCircuit,
  profile?: HardwareProfile,
): NormalizedResourceEstimate {
  const tally = emptyTally()
  const couplingErrors = new Map<string, number>()
  const couplingDurations = new Map<string, number>()
  if (profile) {
    for (const coupling of profile.couplings) {
      const key = [coupling.control, coupling.target].sort((a, b) => a - b).join("-")
      if (coupling.error_rate !== undefined) couplingErrors.set(key, coupling.error_rate)
      if (coupling.duration_ns !== undefined) couplingDurations.set(key, coupling.duration_ns)
    }
  }
  const qubitErrors = new Map<number, number>()
  if (profile) {
    for (const qubit of profile.qubits) {
      if (qubit.single_qubit_error !== undefined) qubitErrors.set(qubit.index, qubit.single_qubit_error)
    }
  }

  const visit = (operation: Operation): void => {
    switch (operation.kind) {
      case "gate": {
        const name = operation.name.toLowerCase()
        tally.gate += 1
        if (name === "swap") tally.swap += 1

        if (operation.qubits.length === 1) {
          tally.oneQubit += 1
          const index = operation.qubits[0]?.index
          const error = index === undefined ? undefined : qubitErrors.get(index)
          if (error === undefined) tally.errorsKnown = false
          else tally.successProbability *= 1 - error
        } else if (operation.qubits.length === 2) {
          tally.twoQubit += 1
          const key = operation.qubits.map((bit) => bit.index).sort((a, b) => a - b).join("-")
          const error = couplingErrors.get(key)
          if (error === undefined) tally.errorsKnown = false
          else tally.successProbability *= 1 - error
          const duration = couplingDurations.get(key)
          if (duration === undefined) tally.durationKnown = false
          else tally.durationNs += duration
        }

        if (T_GATES.has(name)) tally.t += 1
        else if (CLIFFORD_GATES.has(name)) tally.clifford += 1
        else if (name === "ccx" || name === "toffoli") tally.toffoli += 1
        else tally.unsupported += 1
        return
      }
      case "measure":
        tally.measure += 1
        return
      case "reset":
        tally.reset += 1
        return
      case "barrier":
        tally.barrier += 1
        return
      case "conditional":
        tally.conditional += 1
        visit(operation.body)
        return
    }
  }

  circuit.operations.forEach(visit)

  const logicalQubits = circuit.qubit_registers.reduce((sum, register) => sum + register.size, 0)
  const notes: string[] = [
    "Static count over the circuit as written. No synthesis, decomposition, or optimization is applied.",
  ]
  if (tally.unsupported > 0) {
    notes.push(
      `${tally.unsupported} gate(s) are neither Clifford nor T, so the T count understates the ` +
        "fault-tolerant cost until they are synthesized into a Clifford+T basis.",
    )
  }
  if (!tally.durationKnown) {
    notes.push("Duration not estimated: the hardware snapshot does not characterize every gate used.")
  }
  if (!tally.errorsKnown) {
    notes.push("Success probability not estimated: the hardware snapshot does not characterize every gate used.")
  }
  if (!profile) {
    notes.push("No hardware snapshot supplied, so duration and fidelity are not estimated.")
  }

  return {
    schema_version: "0.1",
    nisq: {
      logical_qubits: logicalQubits,
      circuit_depth: circuitDepth(circuit),
      gate_count: tally.gate,
      one_qubit_gate_count: tally.oneQubit,
      two_qubit_gate_count: tally.twoQubit,
      measurement_count: tally.measure,
      reset_count: tally.reset,
      swap_count: tally.swap,
      barrier_count: tally.barrier,
      conditional_count: tally.conditional,
      ...(profile && tally.durationKnown && tally.twoQubit > 0 ? { estimated_duration_ns: tally.durationNs } : {}),
      ...(profile && tally.errorsKnown ? { estimated_success_probability: tally.successProbability } : {}),
    },
    fault_tolerant: {
      t_count: tally.t,
      clifford_count: tally.clifford,
      toffoli_count: tally.toffoli,
      unsupported_for_ft_count: tally.unsupported,
    },
    assumptions: {
      estimator: RESOURCE_ESTIMATOR,
      estimator_version: RESOURCE_ESTIMATOR_VERSION,
      gate_set: [...new Set(collectGateNames(circuit))].sort(),
      notes,
      ...(profile ? { hardware_snapshot: `${profile.provider}/${profile.backend}@${profile.snapshot_id}` } : {}),
    },
  }
}

function collectGateNames(circuit: QuantumCircuit): string[] {
  const names: string[] = []
  const visit = (operation: Operation): void => {
    if (operation.kind === "gate") names.push(operation.name.toLowerCase())
    else if (operation.kind === "conditional") visit(operation.body)
  }
  circuit.operations.forEach(visit)
  return names
}

/**
 * Whether two estimates may be compared.
 *
 * Estimates from different estimators, versions, or gate sets are not
 * comparable, and there is deliberately no function that averages them: two
 * numbers computed under different assumptions do not have a meaningful mean.
 */
export function resourceEstimatesComparable(
  left: NormalizedResourceEstimate,
  right: NormalizedResourceEstimate,
): { comparable: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (left.assumptions.estimator !== right.assumptions.estimator) {
    reasons.push(
      `Different estimators ('${left.assumptions.estimator}' and '${right.assumptions.estimator}') define ` +
        "these quantities differently.",
    )
  } else if (left.assumptions.estimator_version !== right.assumptions.estimator_version) {
    reasons.push(
      `Same estimator at different versions ('${left.assumptions.estimator_version}' and ` +
        `'${right.assumptions.estimator_version}').`,
    )
  }
  const leftGates = left.assumptions.gate_set.join(",")
  const rightGates = right.assumptions.gate_set.join(",")
  if (leftGates !== rightGates) {
    reasons.push(`Different gate sets ([${leftGates}] and [${rightGates}]) make counts incomparable.`)
  }
  return { comparable: reasons.length === 0, reasons }
}
