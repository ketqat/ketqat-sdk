import type { QuantumCircuit } from "../circuit/graph.js"
import type { EquivalenceEvidence } from "../contracts/transformation.js"
import {
  MAX_SIMULATED_QUBITS,
  simulateStatevector,
  totalQubitCount,
  zeroState,
  type StatevectorState,
} from "./statevector.js"

/**
 * Differential verification: run the same circuit through more than one path
 * and compare, producing evidence at a stated level (RFC 0002).
 *
 * The rule this module exists to enforce: a check that does not decide returns
 * `INCONCLUSIVE` with a reason, never `FAILED`. Failing to show two circuits
 * agree is not showing that they differ.
 */

export interface StateComparison {
  /** Max |a_i - b_i| over amplitudes, after optional global-phase alignment. */
  max_amplitude_difference: number
  /** |<a|b>|, which is 1 for states equal up to global phase. */
  fidelity: number
  global_phase_ignored: boolean
}

function stateFromCircuit(circuit: QuantumCircuit): StatevectorState {
  const result = simulateStatevector(circuit)
  if (!result.statevector) {
    throw new Error("Circuit contains measurement, so it has no single final statevector to compare.")
  }
  const qubitCount = totalQubitCount(circuit)
  const state = zeroState(qubitCount)
  state.real.set(result.statevector.real)
  state.imaginary.set(result.statevector.imaginary)
  return state
}

/**
 * Compare two statevectors.
 *
 * With `ignoreGlobalPhase`, the second state is rotated by the phase of its
 * largest-magnitude shared amplitude before differencing, since a global phase
 * is unobservable and two circuits differing only by one are equivalent for
 * every measurement.
 */
export function compareStates(
  left: StatevectorState,
  right: StatevectorState,
  ignoreGlobalPhase = true,
): StateComparison {
  if (left.real.length !== right.real.length) {
    throw new Error("Cannot compare statevectors of different dimension.")
  }

  let innerReal = 0
  let innerImaginary = 0
  for (let index = 0; index < left.real.length; index += 1) {
    const ar = left.real[index] as number
    const ai = left.imaginary[index] as number
    const br = right.real[index] as number
    const bi = right.imaginary[index] as number
    // <left|right> = sum conj(left) * right
    innerReal += ar * br + ai * bi
    innerImaginary += ar * bi - ai * br
  }
  const fidelity = Math.hypot(innerReal, innerImaginary)

  let phaseReal = 1
  let phaseImaginary = 0
  if (ignoreGlobalPhase && fidelity > 1e-12) {
    // Align right onto left by the phase of <left|right>.
    phaseReal = innerReal / fidelity
    phaseImaginary = -innerImaginary / fidelity
  }

  let maxDifference = 0
  for (let index = 0; index < left.real.length; index += 1) {
    const br = right.real[index] as number
    const bi = right.imaginary[index] as number
    const rotatedReal = br * phaseReal - bi * phaseImaginary
    const rotatedImaginary = br * phaseImaginary + bi * phaseReal
    const difference = Math.hypot(
      (left.real[index] as number) - rotatedReal,
      (left.imaginary[index] as number) - rotatedImaginary,
    )
    if (difference > maxDifference) maxDifference = difference
  }

  return { max_amplitude_difference: maxDifference, fidelity, global_phase_ignored: ignoreGlobalPhase }
}

export interface EquivalenceOptions {
  tolerance?: number
  ignoreGlobalPhase?: boolean
  /** Above this width the check reports INCONCLUSIVE rather than allocating. */
  maxQubits?: number
}

/**
 * Check two circuits for equivalence by exact simulation, returning evidence.
 *
 * Returns `INCONCLUSIVE` -- never `FAILED` -- when the check cannot be run:
 * too many qubits, an unsupported gate, or a measurement that makes the final
 * state undefined. `FAILED` is reserved for an actual counterexample.
 */
export function checkCircuitEquivalence(
  left: QuantumCircuit,
  right: QuantumCircuit,
  options: EquivalenceOptions = {},
): EquivalenceEvidence {
  const tolerance = options.tolerance ?? 1e-9
  const ignoreGlobalPhase = options.ignoreGlobalPhase ?? true
  const maxQubits = options.maxQubits ?? MAX_SIMULATED_QUBITS

  const leftQubits = totalQubitCount(left)
  const rightQubits = totalQubitCount(right)

  if (leftQubits !== rightQubits) {
    return {
      level: "FAILED",
      method: "statevector",
      counterexample: `Circuits act on different numbers of qubits: ${leftQubits} and ${rightQubits}.`,
    }
  }

  if (leftQubits > maxQubits) {
    return {
      level: "INCONCLUSIVE",
      method: "statevector",
      qubit_count: leftQubits,
      reason:
        `Exact comparison needs 2^${leftQubits} amplitudes, above the ${maxQubits}-qubit limit. ` +
        "Not attempted; this is not evidence that the circuits differ.",
    }
  }

  let leftState: StatevectorState
  let rightState: StatevectorState
  try {
    leftState = stateFromCircuit(left)
    rightState = stateFromCircuit(right)
  } catch (error) {
    return {
      level: "INCONCLUSIVE",
      method: "statevector",
      qubit_count: leftQubits,
      reason: `Could not simulate both circuits: ${(error as Error).message}`,
    }
  }

  const comparison = compareStates(leftState, rightState, ignoreGlobalPhase)
  if (comparison.max_amplitude_difference <= tolerance) {
    return {
      level: "NUMERICALLY_CHECKED",
      method: "statevector",
      tolerance,
      global_phase_ignored: ignoreGlobalPhase,
      qubit_count: leftQubits,
    }
  }

  return {
    level: "FAILED",
    method: "statevector",
    tolerance,
    global_phase_ignored: ignoreGlobalPhase,
    qubit_count: leftQubits,
    counterexample:
      `Maximum amplitude difference ${comparison.max_amplitude_difference.toExponential(3)} exceeds ` +
      `tolerance ${tolerance.toExponential(3)} (state fidelity ${comparison.fidelity.toFixed(12)}).`,
  }
}

export interface DifferentialRun {
  backend: string
  counts: Record<string, number>
  shots: number
}

export interface DifferentialReport {
  agreed: boolean
  /** Largest absolute difference in estimated probability across backends. */
  max_probability_difference: number
  /** Statistical tolerance used, derived from shot noise unless overridden. */
  tolerance: number
  outcomes: string[]
  detail: string
}

/**
 * Compare shot-based results from two backends.
 *
 * The default tolerance is derived from binomial shot noise rather than being a
 * fixed constant, because a difference that matters at 10^6 shots is invisible
 * at 100. Disagreement here is reported as disagreement, not as proof that
 * either backend is wrong.
 */
export function compareShotResults(
  left: DifferentialRun,
  right: DifferentialRun,
  options: { tolerance?: number; sigma?: number } = {},
): DifferentialReport {
  const outcomes = [...new Set([...Object.keys(left.counts), ...Object.keys(right.counts)])].sort()
  const sigma = options.sigma ?? 5
  // Worst-case binomial standard error at p = 0.5 for the smaller sample.
  const shots = Math.min(left.shots, right.shots)
  const tolerance = options.tolerance ?? (shots > 0 ? (sigma * 0.5) / Math.sqrt(shots) : 1)

  let maxDifference = 0
  let worst = ""
  for (const outcome of outcomes) {
    const leftProbability = (left.counts[outcome] ?? 0) / left.shots
    const rightProbability = (right.counts[outcome] ?? 0) / right.shots
    const difference = Math.abs(leftProbability - rightProbability)
    if (difference > maxDifference) {
      maxDifference = difference
      worst = outcome
    }
  }

  const agreed = maxDifference <= tolerance
  return {
    agreed,
    max_probability_difference: maxDifference,
    tolerance,
    outcomes,
    detail: agreed
      ? `${left.backend} and ${right.backend} agree within ${sigma}-sigma shot noise ` +
        `(largest difference ${maxDifference.toFixed(4)} on '${worst || "n/a"}').`
      : `${left.backend} and ${right.backend} differ by ${maxDifference.toFixed(4)} on outcome ` +
        `'${worst}', above the ${sigma}-sigma tolerance ${tolerance.toFixed(4)}. ` +
        "This records a disagreement; it does not establish which backend is correct.",
  }
}
