import type { BitRef, Operation, QuantumCircuit } from "../circuit/graph.js"

/**
 * Digital dynamical decoupling (ketqat-sdk#129).
 *
 * DDD inserts a self-inverse pulse sequence into a qubit's idle windows. The
 * sequence multiplies to the identity, so a noiseless circuit is unchanged;
 * under noise with **memory**, the pulses time-reverse the system-bath coupling
 * and part of the accumulated phase cancels.
 *
 * That last clause is the whole story, and it is why this module reports what
 * it does.
 *
 * **This engine's only noise model is depolarizing**, which is Markovian: each
 * gate's error is drawn independently, with no memory to reverse. There is
 * therefore no mechanism by which DDD can reduce error here.
 *
 * The inserted pulses are gates and carry error of their own, so the expectation
 * is that decoupling is a small net cost. Measured, that cost was *not*
 * resolvable: on a three-qubit circuit at 2% and 3% error over 200,000 shots,
 * XX moved the total variation distance by +0.0002 and XYXY by -0.0006 against
 * a baseline of 0.125 -- both within shot noise, in opposite directions. The
 * claim this module makes is therefore "no measurable difference", not "worse",
 * because only the first is something that was observed.
 *
 * So `applyDynamicalDecoupling` performs the transformation correctly and then
 * says plainly that it cannot help here. A mitigation routine that silently
 * inserted pulses and let a reader believe something had been mitigated would
 * be worse than not having one: the circuit would be measurably worse and the
 * label would say "mitigated".
 */

export const DECOUPLING_SEQUENCES = {
  /** Two X pulses. The simplest sequence that is its own inverse. */
  XX: ["x", "x"],
  /** X-Y-X-Y. Suppresses dephasing along both axes rather than one. */
  XYXY: ["x", "y", "x", "y"],
} as const

export type DecouplingSequence = keyof typeof DECOUPLING_SEQUENCES

export interface DecouplingResult {
  circuit: QuantumCircuit
  sequence: DecouplingSequence
  /** Idle windows the sequence was inserted into. */
  windows_filled: number
  /** Gates added, which is the cost. */
  gates_added: number
  /**
   * Whether the noise model this will run under can be suppressed by DDD at
   * all. False for every model this engine currently has.
   */
  can_help: boolean
  warnings: string[]
  assumptions: string[]
}

const key = (bit: BitRef): string => `${bit.register}[${bit.index}]`

function touchedQubits(operation: Operation): BitRef[] {
  switch (operation.kind) {
    case "gate":
      return operation.qubits
    case "measure":
    case "reset":
      return [operation.qubit]
    default:
      return []
  }
}

/**
 * Insert a decoupling sequence into every idle window.
 *
 * A window is a stretch where one qubit does nothing while another is busy.
 * Windows are found by layering the circuit the same way `circuitDepth` does,
 * so "idle" means the same thing here as it does in the depth a reader sees.
 *
 * Measurement and reset end a window rather than being idled through. A pulse
 * inserted after a measurement acts on a collapsed state, which is a different
 * circuit, not a decoupled one.
 */
export function applyDynamicalDecoupling(
  circuit: QuantumCircuit,
  options: { sequence?: DecouplingSequence; noiseHasMemory?: boolean } = {},
): DecouplingResult {
  const sequence = options.sequence ?? "XX"
  const pulses = DECOUPLING_SEQUENCES[sequence]
  // No noise model in this engine has memory. The flag exists so a caller that
  // introduces one does not have to edit this module to stop being warned.
  const canHelp = options.noiseHasMemory === true

  // Layer the circuit, then find qubits idle in each layer.
  const layerOf = new Map<string, number>()
  const layered: Array<{ operation: Operation; layer: number }> = []
  const allQubits = new Set<string>()
  const qubitByKey = new Map<string, BitRef>()

  for (const operation of circuit.operations) {
    const bits = touchedQubits(operation)
    for (const bit of bits) {
      allQubits.add(key(bit))
      qubitByKey.set(key(bit), bit)
    }
    if (bits.length === 0) {
      layered.push({ operation, layer: -1 })
      continue
    }
    const layer = Math.max(...bits.map((bit) => layerOf.get(key(bit)) ?? 0)) + 1
    for (const bit of bits) layerOf.set(key(bit), layer)
    layered.push({ operation, layer })
  }

  const busyInLayer = new Map<number, Set<string>>()
  const stopsIdling = new Map<string, number>()
  for (const { operation, layer } of layered) {
    if (layer < 0) continue
    const set = busyInLayer.get(layer) ?? new Set<string>()
    for (const bit of touchedQubits(operation)) {
      set.add(key(bit))
      // A measurement or reset ends any window on that qubit: a pulse after it
      // acts on a collapsed state, which is a different circuit.
      if (operation.kind !== "gate") {
        stopsIdling.set(key(bit), Math.min(stopsIdling.get(key(bit)) ?? layer, layer))
      }
    }
    busyInLayer.set(layer, set)
  }

  const maxLayer = Math.max(0, ...[...busyInLayer.keys()])
  const inserts = new Map<number, BitRef[]>()
  let windows = 0

  for (let layer = 1; layer <= maxLayer; layer += 1) {
    const busy = busyInLayer.get(layer) ?? new Set<string>()
    if (busy.size === 0) continue
    for (const qubitKey of allQubits) {
      if (busy.has(qubitKey)) continue
      const collapsesAt = stopsIdling.get(qubitKey)
      if (collapsesAt !== undefined && layer > collapsesAt) continue
      // Idle only counts once the qubit has actually entered the circuit.
      const firstUse = layered.find(
        (entry) => entry.layer >= 0 && touchedQubits(entry.operation).some((b) => key(b) === qubitKey),
      )
      if (!firstUse || firstUse.layer > layer) continue

      const bit = qubitByKey.get(qubitKey)
      if (!bit) continue
      const list = inserts.get(layer) ?? []
      list.push(bit)
      inserts.set(layer, list)
      windows += 1
    }
  }

  const operations: Operation[] = []
  let emitted = 0
  let current = 0
  for (const { operation, layer } of layered) {
    if (layer > current) {
      for (const bit of inserts.get(layer) ?? []) {
        for (const pulse of pulses) {
          operations.push({ kind: "gate", name: pulse, qubits: [bit], parameters: [] } as Operation)
          emitted += 1
        }
      }
      current = layer
    }
    operations.push(operation)
  }

  const warnings: string[] = []
  if (!canHelp) {
    warnings.push(
      `Dynamical decoupling cannot suppress this engine's noise model. Depolarizing noise is ` +
        `Markovian -- each gate's error is drawn independently, with no memory for the pulses to ` +
        `reverse -- so there is no mechanism by which these ${emitted} gates can reduce error. ` +
        `Measured on a three-qubit circuit at 2% one-qubit and 3% two-qubit error over 200,000 ` +
        `shots, the change in total variation distance was within shot noise in both directions: ` +
        `XX worse by 0.0002, XYXY better by 0.0006, against a baseline of 0.125. So the honest ` +
        `statement is that this makes no measurable difference here, not that it helps. It is ` +
        `provided so a pipeline can be built and compared against a model that does have memory.`,
    )
  }

  return {
    circuit: { ...circuit, operations },
    sequence,
    windows_filled: windows,
    gates_added: emitted,
    can_help: canHelp,
    warnings,
    assumptions: [
      `Sequence ${sequence} (${pulses.join("-")}), which multiplies to the identity.`,
      "Idle windows are found by layering the circuit, so 'idle' matches the reported depth.",
      "Measurement and reset end a window: a pulse after one acts on a collapsed state.",
      "Pulses are assumed instantaneous and perfect apart from the engine's gate error.",
    ],
  }
}
