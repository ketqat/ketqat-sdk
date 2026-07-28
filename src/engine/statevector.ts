import type { BitRef, Operation, QuantumCircuit } from "../circuit/graph.js"
import { evaluateParameter } from "./parameters.js"
import { applyPauliNoise, isNoiseless, NoiseModelSchema, type NoiseModel } from "./noise.js"

/**
 * Exact statevector simulator for small circuits.
 *
 * Conventions, stated because getting them wrong silently produces plausible
 * wrong answers:
 *
 * - **Little-endian.** Qubit 0 is the least significant bit of a basis-state
 *   index, matching Qiskit. A bitstring printed by `formatBitstring` therefore
 *   reads highest-qubit-first, so `|q1 q0>`.
 * - Amplitudes are stored as parallel real and imaginary `Float64Array`s.
 * - Measurement and reset act on the state, so mid-circuit measurement and
 *   feed-forward are simulated rather than approximated.
 * - Sampling uses a seeded PRNG, so a run is reproducible from its seed. An
 *   unseeded run is explicitly non-reproducible and says so in its result.
 */

export class SimulationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SimulationError"
  }
}

/** Above this width an exact statevector stops being reasonable to allocate. */
export const MAX_SIMULATED_QUBITS = 24

/** Deterministic PRNG (mulberry32): small, fast, and stable across platforms. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface StatevectorState {
  qubitCount: number
  real: Float64Array
  imaginary: Float64Array
}

export function zeroState(qubitCount: number): StatevectorState {
  if (qubitCount > MAX_SIMULATED_QUBITS) {
    throw new SimulationError(
      `Exact statevector simulation is limited to ${MAX_SIMULATED_QUBITS} qubits; got ${qubitCount}. ` +
        "Use a shot-based or stabilizer backend for larger circuits.",
    )
  }
  const size = 2 ** qubitCount
  const real = new Float64Array(size)
  const imaginary = new Float64Array(size)
  real[0] = 1
  return { qubitCount, real, imaginary }
}

type Matrix2 = [number, number, number, number, number, number, number, number]

/** Single-qubit unitary as [re00, im00, re01, im01, re10, im10, re11, im11]. */
function singleQubitMatrix(name: string, parameters: number[]): Matrix2 {
  const SQRT1_2 = Math.SQRT1_2
  switch (name) {
    case "id":
    case "i":
      return [1, 0, 0, 0, 0, 0, 1, 0]
    case "x":
      return [0, 0, 1, 0, 1, 0, 0, 0]
    case "y":
      return [0, 0, 0, -1, 0, 1, 0, 0]
    case "z":
      return [1, 0, 0, 0, 0, 0, -1, 0]
    case "h":
      return [SQRT1_2, 0, SQRT1_2, 0, SQRT1_2, 0, -SQRT1_2, 0]
    case "s":
      return [1, 0, 0, 0, 0, 0, 0, 1]
    case "sdg":
      return [1, 0, 0, 0, 0, 0, 0, -1]
    case "t":
      return [1, 0, 0, 0, 0, 0, SQRT1_2, SQRT1_2]
    case "tdg":
      return [1, 0, 0, 0, 0, 0, SQRT1_2, -SQRT1_2]
    case "sx":
      return [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5]
    case "sxdg":
      return [0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5]
    case "rx": {
      const half = requireParameters(name, parameters, 1)[0] / 2
      return [Math.cos(half), 0, 0, -Math.sin(half), 0, -Math.sin(half), Math.cos(half), 0]
    }
    case "ry": {
      const half = requireParameters(name, parameters, 1)[0] / 2
      return [Math.cos(half), 0, -Math.sin(half), 0, Math.sin(half), 0, Math.cos(half), 0]
    }
    case "rz": {
      const half = requireParameters(name, parameters, 1)[0] / 2
      return [Math.cos(half), -Math.sin(half), 0, 0, 0, 0, Math.cos(half), Math.sin(half)]
    }
    case "p":
    case "u1": {
      const lambda = requireParameters(name, parameters, 1)[0]
      return [1, 0, 0, 0, 0, 0, Math.cos(lambda), Math.sin(lambda)]
    }
    case "u2": {
      const [phi, lambda] = requireParameters(name, parameters, 2)
      return u3Matrix(Math.PI / 2, phi, lambda)
    }
    case "u":
    case "u3": {
      const [theta, phi, lambda] = requireParameters(name, parameters, 3)
      return u3Matrix(theta, phi, lambda)
    }
    default:
      throw new SimulationError(
        `Gate '${name}' is not supported by the statevector backend. ` +
          "It is rejected rather than approximated, because a silently substituted gate changes the circuit.",
      )
  }
}

/**
 * U(θ, φ, λ) = [[ cos(θ/2),            -e^{iλ} sin(θ/2)     ],
 *               [ e^{iφ} sin(θ/2),      e^{i(φ+λ)} cos(θ/2) ]]
 */
function u3Matrix(theta: number, phi: number, lambda: number): Matrix2 {
  const cos = Math.cos(theta / 2)
  const sin = Math.sin(theta / 2)
  return [
    cos,
    0,
    -sin * Math.cos(lambda),
    -sin * Math.sin(lambda),
    sin * Math.cos(phi),
    sin * Math.sin(phi),
    cos * Math.cos(phi + lambda),
    cos * Math.sin(phi + lambda),
  ]
}

function requireParameters(name: string, parameters: number[], count: number): number[] {
  if (parameters.length !== count) {
    throw new SimulationError(`Gate '${name}' expects ${count} parameter(s), got ${parameters.length}.`)
  }
  return parameters
}

const TWO_QUBIT_GATES = new Set(["cx", "cnot", "cz", "cy", "ch", "swap", "crx", "cry", "crz", "cp", "cu1"])
const THREE_QUBIT_GATES = new Set(["ccx", "toffoli", "cswap", "fredkin"])

function applySingleQubit(state: StatevectorState, matrix: Matrix2, qubit: number): void {
  const { real, imaginary } = state
  const stride = 1 << qubit
  const [r00, i00, r01, i01, r10, i10, r11, i11] = matrix

  for (let base = 0; base < real.length; base += stride << 1) {
    for (let offset = 0; offset < stride; offset += 1) {
      const zero = base + offset
      const one = zero + stride
      const ar = real[zero] as number
      const ai = imaginary[zero] as number
      const br = real[one] as number
      const bi = imaginary[one] as number

      real[zero] = r00 * ar - i00 * ai + r01 * br - i01 * bi
      imaginary[zero] = r00 * ai + i00 * ar + r01 * bi + i01 * br
      real[one] = r10 * ar - i10 * ai + r11 * br - i11 * bi
      imaginary[one] = r10 * ai + i10 * ar + r11 * bi + i11 * br
    }
  }
}

/** Applies `matrix` to `target` only on basis states where every control is 1. */
function applyControlled(
  state: StatevectorState,
  matrix: Matrix2,
  controls: number[],
  target: number,
): void {
  const { real, imaginary } = state
  const stride = 1 << target
  const controlMask = controls.reduce((mask, control) => mask | (1 << control), 0)
  const [r00, i00, r01, i01, r10, i10, r11, i11] = matrix

  for (let base = 0; base < real.length; base += stride << 1) {
    for (let offset = 0; offset < stride; offset += 1) {
      const zero = base + offset
      if ((zero & controlMask) !== controlMask) continue
      const one = zero + stride
      const ar = real[zero] as number
      const ai = imaginary[zero] as number
      const br = real[one] as number
      const bi = imaginary[one] as number

      real[zero] = r00 * ar - i00 * ai + r01 * br - i01 * bi
      imaginary[zero] = r00 * ai + i00 * ar + r01 * bi + i01 * br
      real[one] = r10 * ar - i10 * ai + r11 * br - i11 * bi
      imaginary[one] = r10 * ai + i10 * ar + r11 * bi + i11 * br
    }
  }
}

function applySwap(state: StatevectorState, a: number, b: number): void {
  if (a === b) return
  const { real, imaginary } = state
  const maskA = 1 << a
  const maskB = 1 << b
  for (let index = 0; index < real.length; index += 1) {
    const hasA = (index & maskA) !== 0
    const hasB = (index & maskB) !== 0
    if (hasA && !hasB) {
      const partner = (index & ~maskA) | maskB
      const tr = real[index] as number
      const ti = imaginary[index] as number
      real[index] = real[partner] as number
      imaginary[index] = imaginary[partner] as number
      real[partner] = tr
      imaginary[partner] = ti
    }
  }
}

/** Probability that measuring `qubit` yields 1. */
export function probabilityOfOne(state: StatevectorState, qubit: number): number {
  const mask = 1 << qubit
  let total = 0
  for (let index = 0; index < state.real.length; index += 1) {
    if ((index & mask) !== 0) {
      const re = state.real[index] as number
      const im = state.imaginary[index] as number
      total += re * re + im * im
    }
  }
  return total
}

/** Projects onto `outcome` on `qubit` and renormalizes. */
function collapse(state: StatevectorState, qubit: number, outcome: 0 | 1): void {
  const mask = 1 << qubit
  let norm = 0
  for (let index = 0; index < state.real.length; index += 1) {
    const bit = (index & mask) !== 0 ? 1 : 0
    if (bit === outcome) {
      const re = state.real[index] as number
      const im = state.imaginary[index] as number
      norm += re * re + im * im
    } else {
      state.real[index] = 0
      state.imaginary[index] = 0
    }
  }
  if (norm === 0) {
    throw new SimulationError("Projected onto a zero-probability outcome; the state is not normalizable.")
  }
  const scale = 1 / Math.sqrt(norm)
  for (let index = 0; index < state.real.length; index += 1) {
    state.real[index] = (state.real[index] as number) * scale
    state.imaginary[index] = (state.imaginary[index] as number) * scale
  }
}

interface QubitLayout {
  index: (bit: BitRef) => number
  clbitIndex: (bit: BitRef) => number
  clbitCount: number
}

function buildLayout(circuit: QuantumCircuit): QubitLayout {
  const qubitOffsets = new Map<string, number>()
  let qubitTotal = 0
  for (const register of circuit.qubit_registers) {
    qubitOffsets.set(register.name, qubitTotal)
    qubitTotal += register.size
  }
  const clbitOffsets = new Map<string, number>()
  let clbitTotal = 0
  for (const register of circuit.clbit_registers) {
    clbitOffsets.set(register.name, clbitTotal)
    clbitTotal += register.size
  }
  return {
    index: (bit) => {
      const offset = qubitOffsets.get(bit.register)
      if (offset === undefined) throw new SimulationError(`Unknown qubit register '${bit.register}'.`)
      return offset + bit.index
    },
    clbitIndex: (bit) => {
      const offset = clbitOffsets.get(bit.register)
      if (offset === undefined) throw new SimulationError(`Unknown classical register '${bit.register}'.`)
      return offset + bit.index
    },
    clbitCount: clbitTotal,
  }
}

export interface RunOptions {
  shots?: number
  /** Omitting the seed makes the run non-reproducible, and the result says so. */
  seed?: number
  /**
   * Sample Pauli-error trajectories per shot. Requires shots: a noise model has
   * no meaning for an exact statevector, and silently ignoring it would produce
   * a noiseless result labelled as noisy.
   */
  noise?: NoiseModel
}

export interface SimulationResult {
  qubit_count: number
  /** Present only when the circuit has no measurement, so the state is well defined. */
  statevector?: { real: number[]; imaginary: number[] }
  /** Bitstring counts, highest classical bit first. Present when shots were requested. */
  counts?: Record<string, number>
  probabilities?: Record<string, number>
  shots: number
  seed: number | null
  deterministic: boolean
  backend: string
  /** Present when a noise model was applied, so a noisy result cannot be mistaken for an ideal one. */
  noise?: NoiseModel
}

export const STATEVECTOR_BACKEND = "ketqat-statevector"
export const STATEVECTOR_BACKEND_VERSION = "0.1.0"

function evaluateParameters(operation: Extract<Operation, { kind: "gate" }>): number[] {
  return operation.parameters.map((parameter) => evaluateParameter(parameter))
}

/** Runs the circuit once, mutating `state` and returning classical bit values. */
function executeOnce(
  circuit: QuantumCircuit,
  layout: QubitLayout,
  state: StatevectorState,
  random: () => number,
): number[] {
  const clbits = new Array<number>(layout.clbitCount).fill(0)

  const registerValue = (name: string): number => {
    const register = circuit.clbit_registers.find((entry) => entry.name === name)
    if (!register) throw new SimulationError(`Unknown classical register '${name}'.`)
    let value = 0
    for (let bit = 0; bit < register.size; bit += 1) {
      const index = layout.clbitIndex({ register: name, index: bit })
      value |= (clbits[index] as number) << bit
    }
    return value
  }

  const applyOperation = (operation: Operation): void => {
    switch (operation.kind) {
      case "gate": {
        const name = operation.name.toLowerCase()
        const parameters = evaluateParameters(operation)
        const qubits = operation.qubits.map((bit) => layout.index(bit))

        if (name === "swap" && qubits.length === 2) {
          applySwap(state, qubits[0] as number, qubits[1] as number)
          return
        }
        if (THREE_QUBIT_GATES.has(name)) {
          if (name === "cswap" || name === "fredkin") {
            // Controlled swap: swap only where the control is 1.
            const [control, a, b] = qubits as [number, number, number]
            applyControlledSwap(state, control, a, b)
            return
          }
          const [c1, c2, target] = qubits as [number, number, number]
          applyControlled(state, singleQubitMatrix("x", []), [c1, c2], target)
          return
        }
        if (TWO_QUBIT_GATES.has(name)) {
          const [control, target] = qubits as [number, number]
          const baseName =
            name === "cx" || name === "cnot"
              ? "x"
              : name === "cz"
                ? "z"
                : name === "cy"
                  ? "y"
                  : name === "ch"
                    ? "h"
                    : name === "crx"
                      ? "rx"
                      : name === "cry"
                        ? "ry"
                        : name === "crz"
                          ? "rz"
                          : "p"
          applyControlled(state, singleQubitMatrix(baseName, parameters), [control], target)
          return
        }
        if (qubits.length !== 1) {
          throw new SimulationError(
            `Gate '${operation.name}' with ${qubits.length} qubits is not supported by the statevector backend.`,
          )
        }
        applySingleQubit(state, singleQubitMatrix(name, parameters), qubits[0] as number)
        return
      }
      case "measure": {
        const qubit = layout.index(operation.qubit)
        const probability = probabilityOfOne(state, qubit)
        const outcome: 0 | 1 = random() < probability ? 1 : 0
        collapse(state, qubit, outcome)
        clbits[layout.clbitIndex(operation.clbit)] = outcome
        return
      }
      case "reset": {
        const qubit = layout.index(operation.qubit)
        const probability = probabilityOfOne(state, qubit)
        const outcome: 0 | 1 = random() < probability ? 1 : 0
        collapse(state, qubit, outcome)
        if (outcome === 1) {
          applySingleQubit(state, singleQubitMatrix("x", []), qubit)
        }
        return
      }
      case "barrier":
        return
      case "conditional": {
        if (registerValue(operation.register) === operation.equals) {
          applyOperation(operation.body)
        }
        return
      }
    }
  }

  for (const operation of circuit.operations) {
    applyOperation(operation)
  }
  return clbits
}

function applyControlledSwap(state: StatevectorState, control: number, a: number, b: number): void {
  const { real, imaginary } = state
  const controlMask = 1 << control
  const maskA = 1 << a
  const maskB = 1 << b
  for (let index = 0; index < real.length; index += 1) {
    if ((index & controlMask) === 0) continue
    const hasA = (index & maskA) !== 0
    const hasB = (index & maskB) !== 0
    if (hasA && !hasB) {
      const partner = (index & ~maskA) | maskB
      const tr = real[index] as number
      const ti = imaginary[index] as number
      real[index] = real[partner] as number
      imaginary[index] = imaginary[partner] as number
      real[partner] = tr
      imaginary[partner] = ti
    }
  }
}

export function formatBitstring(bits: number[]): string {
  // Highest classical bit first, matching how counts are conventionally read.
  return bits.map((bit) => String(bit)).reverse().join("")
}

function circuitHasMeasurement(circuit: QuantumCircuit): boolean {
  const visit = (operation: Operation): boolean => {
    if (operation.kind === "measure") return true
    return operation.kind === "conditional" ? visit(operation.body) : false
  }
  return circuit.operations.some(visit)
}

export function totalQubitCount(circuit: QuantumCircuit): number {
  return circuit.qubit_registers.reduce((sum, register) => sum + register.size, 0)
}

/**
 * Simulate a circuit.
 *
 * With `shots`, samples measurement outcomes and returns counts. Without shots
 * and without measurement, returns the exact final statevector.
 */
export function simulateStatevector(circuit: QuantumCircuit, options: RunOptions = {}): SimulationResult {
  const qubitCount = totalQubitCount(circuit)
  if (qubitCount === 0) {
    throw new SimulationError("Circuit declares no qubits.")
  }
  const layout = buildLayout(circuit)
  const hasMeasurement = circuitHasMeasurement(circuit)
  const seed = options.seed ?? null
  const shots = options.shots ?? 0

  // Validate the model before anything reads a field off it. TypeScript cannot
  // help here: callers reach this through JSON, a manifest, or a job payload,
  // and a misspelled rate arrives as a plain object that satisfies no check
  // until something indexes it. Parsing names the offending key instead.
  if (options.noise !== undefined) {
    options = { ...options, noise: NoiseModelSchema.parse(options.noise) }
  }

  if (options.noise && !isNoiseless(options.noise) && shots <= 0) {
    throw new SimulationError(
      "A noise model requires a positive shot count. Trajectory sampling has no meaning for an " +
        "exact statevector, and returning the noiseless state would mislabel it as noisy.",
    )
  }

  if (!hasMeasurement && shots === 0) {
    const state = zeroState(qubitCount)
    executeOnce(circuit, layout, state, createRandom(seed ?? 1))
    return {
      qubit_count: qubitCount,
      statevector: { real: Array.from(state.real), imaginary: Array.from(state.imaginary) },
      shots: 0,
      seed,
      deterministic: true,
      backend: STATEVECTOR_BACKEND,
    }
  }

  if (shots <= 0) {
    throw new SimulationError("A circuit with measurement requires a positive shot count.")
  }

  // Sampling a circuit with no classical bits would return one empty outcome for
  // every shot -- a histogram that looks like data and contains none. Refusing
  // is more useful than producing it.
  if (layout.clbitCount === 0) {
    throw new SimulationError(
      "This circuit declares no classical bits, so there is nothing to sample. Add a measurement, " +
        "or omit shots to get the exact statevector.",
    )
  }

  const random = createRandom(seed ?? Math.floor(Math.random() * 2 ** 32))
  const noise = options.noise && !isNoiseless(options.noise) ? options.noise : undefined
  const counts: Record<string, number> = {}
  for (let shot = 0; shot < shots; shot += 1) {
    const state = zeroState(qubitCount)
    // Noise is resampled per shot from the run's own generator, so a noisy run
    // stays exactly reproducible from its seed.
    const trajectory = noise ? applyPauliNoise(circuit, noise, random) : circuit
    const clbits = executeOnce(trajectory, layout, state, random)
    if (noise && noise.readout_error > 0) {
      for (let bit = 0; bit < clbits.length; bit += 1) {
        if (random() < noise.readout_error) {
          clbits[bit] = clbits[bit] === 1 ? 0 : 1
        }
      }
    }
    const key = formatBitstring(clbits)
    counts[key] = (counts[key] ?? 0) + 1
  }

  const probabilities: Record<string, number> = {}
  for (const [key, count] of Object.entries(counts)) {
    probabilities[key] = count / shots
  }

  return {
    qubit_count: qubitCount,
    counts,
    probabilities,
    shots,
    seed,
    // An unseeded run cannot be reproduced, and saying so is the point.
    deterministic: seed !== null,
    backend: STATEVECTOR_BACKEND,
    ...(noise ? { noise } : {}),
  }
}
