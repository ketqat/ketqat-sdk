import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"

/**
 * Hardware characterization snapshot (ADR 0004, accepted 2026-07-28).
 *
 * A snapshot is a **dated observation** of a device, used as a scientific input
 * to transpilation, resource estimation, and QEC analysis. It is not a live
 * status feed, and it is never refreshed in place: re-reading a device produces
 * a new snapshot, so a result can always be interpreted against the device as
 * it was when the result was produced.
 *
 * Out of scope by the same ADR, and deliberately absent from this schema:
 * availability, queue depth, pricing, and anything that would make this a
 * hardware-access catalog rather than a device model.
 */

export const QubitModalitySchema = z.enum([
  "SUPERCONDUCTING",
  "TRAPPED_ION",
  "NEUTRAL_ATOM",
  "PHOTONIC",
  "SPIN",
  "SEMICONDUCTOR",
  "BOSONIC_CAVITY",
  "CONTINUOUS_VARIABLE",
  "TOPOLOGICAL_CANDIDATE",
  "SIMULATED",
])
export type QubitModality = z.infer<typeof QubitModalitySchema>

/** An undirected physical connection between two qubits. */
export const CouplingSchema = z.object({
  control: z.number().int().nonnegative(),
  target: z.number().int().nonnegative(),
  /** Two-qubit gate error on this edge, when characterized. */
  error_rate: z.number().min(0).max(1).optional(),
  /** Gate duration in nanoseconds, when characterized. */
  duration_ns: z.number().nonnegative().optional(),
})
export type Coupling = z.infer<typeof CouplingSchema>

export const QubitPropertiesSchema = z.object({
  index: z.number().int().nonnegative(),
  t1_us: z.number().nonnegative().optional(),
  t2_us: z.number().nonnegative().optional(),
  readout_error: z.number().min(0).max(1).optional(),
  single_qubit_error: z.number().min(0).max(1).optional(),
  /** Excluded from routing when false, e.g. a qubit taken out of service. */
  operational: z.boolean().default(true),
})
export type QubitProperties = z.infer<typeof QubitPropertiesSchema>

/**
 * Capabilities that decide which QEC codes a device can actually run.
 *
 * These are the properties a code-to-hardware suitability claim depends on, so
 * they are modelled explicitly rather than left in free-form metadata.
 */
export const DeviceCapabilitiesSchema = z.object({
  mid_circuit_measurement: z.boolean().default(false),
  feed_forward: z.boolean().default(false),
  /** Feed-forward latency budget in nanoseconds, when characterized. */
  feed_forward_latency_ns: z.number().nonnegative().optional(),
  reset: z.boolean().default(false),
  leakage_detection: z.boolean().default(false),
  loss_detection: z.boolean().default(false),
  erasure_conversion: z.boolean().default(false),
  all_to_all_connectivity: z.boolean().default(false),
  dynamic_connectivity: z.boolean().default(false),
  /** Whether the device applies a biased noise channel, e.g. dominant dephasing. */
  noise_bias: z.string().min(1).optional(),
})
export type DeviceCapabilities = z.infer<typeof DeviceCapabilitiesSchema>

export const HardwareProfileSchema = z.object({
  schema_version: z.string().min(1),
  /** Provider namespace, e.g. "ibm", "ionq", or "simulator". */
  provider: z.string().min(1),
  backend: z.string().min(1),
  /** Identifies this observation. Two snapshots of one device differ here. */
  snapshot_id: z.string().min(1),
  modality: QubitModalitySchema,
  qubit_count: z.number().int().positive(),
  native_gates: z.array(z.string().min(1)).min(1),
  basis_two_qubit_gate: z.string().min(1),
  couplings: z.array(CouplingSchema).default([]),
  qubits: z.array(QubitPropertiesSchema).default([]),
  capabilities: DeviceCapabilitiesSchema,

  /**
   * When the device was characterized. Distinct from `retrieved_at`:
   * calibration can be hours old at the moment it is read.
   */
  calibration_timestamp: IsoDateTimeSchema.optional(),
  retrieved_at: IsoDateTimeSchema,
  /** Where this snapshot came from, so a reader can re-derive it. */
  source: z.string().min(1),
  notes: z.string().min(1).optional(),
})
export type HardwareProfile = z.infer<typeof HardwareProfileSchema>

/** Adjacency list over operational qubits, both directions per coupling. */
export function couplingAdjacency(profile: HardwareProfile): Map<number, Set<number>> {
  const inoperable = new Set(
    profile.qubits.filter((qubit) => qubit.operational === false).map((qubit) => qubit.index),
  )
  const adjacency = new Map<number, Set<number>>()
  for (let index = 0; index < profile.qubit_count; index += 1) {
    if (!inoperable.has(index)) {
      adjacency.set(index, new Set())
    }
  }
  if (profile.capabilities.all_to_all_connectivity) {
    for (const [qubit, neighbours] of adjacency) {
      for (const other of adjacency.keys()) {
        if (other !== qubit) neighbours.add(other)
      }
    }
    return adjacency
  }
  for (const coupling of profile.couplings) {
    if (inoperable.has(coupling.control) || inoperable.has(coupling.target)) continue
    adjacency.get(coupling.control)?.add(coupling.target)
    adjacency.get(coupling.target)?.add(coupling.control)
  }
  return adjacency
}

/**
 * Shortest path between two physical qubits, or null when disconnected.
 *
 * Breadth-first, so the path is minimal in SWAP count. Edge error rates are
 * deliberately not weighted here: a lowest-error path is a different objective
 * and would need its own, stated, cost model.
 */
export function shortestPath(
  adjacency: Map<number, Set<number>>,
  from: number,
  to: number,
): number[] | null {
  if (from === to) return [from]
  if (!adjacency.has(from) || !adjacency.has(to)) return null

  const previous = new Map<number, number>([[from, from]])
  const queue = [from]
  while (queue.length > 0) {
    const current = queue.shift() as number
    for (const neighbour of adjacency.get(current) ?? []) {
      if (previous.has(neighbour)) continue
      previous.set(neighbour, current)
      if (neighbour === to) {
        const path = [to]
        let step = to
        while (step !== from) {
          step = previous.get(step) as number
          path.unshift(step)
        }
        return path
      }
      queue.push(neighbour)
    }
  }
  return null
}

/** A line of `qubitCount` qubits: 0-1-2-...-n. Useful for tests and examples. */
export function linearTopology(qubitCount: number): Coupling[] {
  return Array.from({ length: Math.max(0, qubitCount - 1) }, (_unused, index) => ({
    control: index,
    target: index + 1,
  }))
}

/** A `rows` x `columns` grid with nearest-neighbour coupling. */
export function gridTopology(rows: number, columns: number): Coupling[] {
  const couplings: Coupling[] = []
  const index = (row: number, column: number) => row * columns + column
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (column + 1 < columns) couplings.push({ control: index(row, column), target: index(row, column + 1) })
      if (row + 1 < rows) couplings.push({ control: index(row, column), target: index(row + 1, column) })
    }
  }
  return couplings
}
