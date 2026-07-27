import { z } from "zod"
import type { Operation, QuantumCircuit, SimpleOperation } from "../circuit/graph.js"

/**
 * Noise models for shot-based simulation.
 *
 * Implemented as **Monte Carlo Pauli trajectories**: before each shot, Pauli
 * errors are sampled after each gate according to the model, inserted into the
 * circuit, and that trajectory is simulated exactly. Averaging over shots
 * reproduces the density-matrix result in the limit of many shots, without
 * allocating a density matrix.
 *
 * That is a real approximation with a real cost, and it is stated rather than
 * hidden: trajectory sampling gives shot-noise-limited estimates, so an
 * expectation value from N shots carries roughly 1/sqrt(N) statistical error on
 * top of the physical noise being modelled.
 */

export const DepolarizingNoiseSchema = z.object({
  model: z.literal("depolarizing"),
  /** Probability a one-qubit gate is followed by a random non-identity Pauli. */
  one_qubit_error: z.number().min(0).max(1).default(0),
  /** Probability a two-qubit gate is followed by a random non-identity Pauli pair. */
  two_qubit_error: z.number().min(0).max(1).default(0),
  /** Probability a measurement outcome is flipped. */
  readout_error: z.number().min(0).max(1).default(0),
})
export type DepolarizingNoise = z.infer<typeof DepolarizingNoiseSchema>

export const NoiseModelSchema = DepolarizingNoiseSchema
export type NoiseModel = z.infer<typeof NoiseModelSchema>

const PAULIS = ["x", "y", "z"] as const

/**
 * Insert sampled Pauli errors after each gate.
 *
 * `random` is supplied by the caller so noise sampling shares the run's seeded
 * generator: a noisy run stays exactly reproducible from its seed, which a
 * separately-seeded noise source would quietly destroy.
 */
export function applyPauliNoise(
  circuit: QuantumCircuit,
  noise: NoiseModel,
  random: () => number,
): QuantumCircuit {
  const operations: Operation[] = []

  const noisyGate = (operation: SimpleOperation): void => {
    operations.push(operation)
    if (operation.kind !== "gate") return

    const probability =
      operation.qubits.length === 1
        ? noise.one_qubit_error
        : operation.qubits.length === 2
          ? noise.two_qubit_error
          : 0
    if (probability <= 0) return

    for (const qubit of operation.qubits) {
      if (random() >= probability) continue
      // Uniform over the three non-identity Paulis, which is what
      // "depolarizing" means for this channel.
      const pauli = PAULIS[Math.floor(random() * PAULIS.length)] ?? "x"
      operations.push({ kind: "gate", name: pauli, parameters: [], qubits: [qubit] })
    }
  }

  for (const operation of circuit.operations) {
    if (operation.kind === "conditional") {
      operations.push(operation)
      continue
    }
    noisyGate(operation)
  }

  return { ...circuit, operations }
}

/** True when the model would introduce no error at all. */
export function isNoiseless(noise: NoiseModel): boolean {
  return noise.one_qubit_error === 0 && noise.two_qubit_error === 0 && noise.readout_error === 0
}
