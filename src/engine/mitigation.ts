import { z } from "zod"
import type { LossReportEntry } from "../contracts/common.js"
import type { CircuitTransformation } from "../contracts/transformation.js"
import type { Operation, QuantumCircuit, SimpleOperation } from "../circuit/graph.js"
import type { NoiseModel } from "./noise.js"
import { simulateStatevector, type SimulationResult } from "./statevector.js"

/**
 * Quantum error mitigation (RFC 0001).
 *
 * Implements zero-noise extrapolation by unitary folding, and readout-error
 * mitigation by inverting a measured confusion matrix.
 *
 * The rule that governs this module: **raw and mitigated results are both
 * kept**. A mitigated number is a model-dependent estimate, not a measurement,
 * and discarding the raw data would make that impossible to check. Every result
 * records the method, its version, the scale factors, the shot counts, the seed,
 * and the assumptions the estimate rests on.
 *
 * Mitigation is also not free of failure modes, and they are reported rather
 * than smoothed over: extrapolation can leave the physical range, and a
 * confusion matrix can be singular.
 */

export const MITIGATION_ADAPTER = "ketqat-mitigation"
export const MITIGATION_ADAPTER_VERSION = "0.1.0"

export const MitigationMethodSchema = z.enum([
  "zero_noise_extrapolation",
  "readout_error_mitigation",
])
export type MitigationMethod = z.infer<typeof MitigationMethodSchema>

export interface MitigationResult {
  method: MitigationMethod
  method_version: string
  /** The unmitigated estimate, always retained. */
  raw_value: number
  mitigated_value: number
  /**
   * Statistical uncertainty on the *mitigated* estimate, propagated through the
   * extrapolation rather than copied from the raw point.
   *
   * Extrapolation amplifies variance: it is an extrapolation, so the weights
   * that cancel the noise term also add the input variances in quadrature with
   * coefficients larger than one. Reporting raw shot noise here understated the
   * real figure, sometimes several-fold (ketqat-sdk#121).
   */
  uncertainty?: number
  /** Shot noise on the unmitigated point, for comparison. */
  raw_uncertainty?: number
  /**
   * How much the extrapolation multiplied the statistical uncertainty.
   *
   * This is the statistical price of mitigation, and it is the number that
   * tells a reader whether the mitigated estimate is actually better resolved
   * than the raw one.
   */
  uncertainty_amplification?: number
  /** Total shots consumed across every scaled circuit. */
  total_shots: number
  seed: number | null
  assumptions: string[]
  warnings: string[]
  /** Per-scale measurements, so the extrapolation can be re-derived. */
  data_points?: Array<{ scale: number; value: number; shots: number }>
  transformation: CircuitTransformation
}

/**
 * Fold a circuit to scale its noise.
 *
 * Global unitary folding: `C -> C (C^-1 C)^n`, giving an odd scale factor
 * `2n + 1`. The folded circuit implements the same unitary but runs roughly
 * `scale` times as many gates, so it experiences roughly `scale` times the
 * noise -- which is the premise ZNE rests on.
 *
 * Only odd integer scales are supported. Fractional folding exists but changes
 * the method's assumptions, and silently rounding a requested 1.5 to 1 would
 * make the reported scale factor a lie.
 */
export function foldCircuit(circuit: QuantumCircuit, scale: number): QuantumCircuit {
  if (!Number.isInteger(scale) || scale < 1 || scale % 2 === 0) {
    throw new Error(
      `Unitary folding supports odd integer scale factors (1, 3, 5, ...); got ${scale}. ` +
        "Fractional folding changes the method's assumptions and is not implemented.",
    )
  }
  if (scale === 1) return circuit

  const gates: Array<Extract<SimpleOperation, { kind: "gate" }>> = []
  const tail: Operation[] = []
  for (const operation of circuit.operations) {
    if (operation.kind === "gate") {
      gates.push(operation)
    } else {
      // Measurement, reset, barrier, and conditionals are not folded: folding a
      // measurement would change the program, not amplify its noise.
      tail.push(operation)
    }
  }

  const inverse = gates
    .slice()
    .reverse()
    .map((gate) => invertGate(gate))

  const folded: Operation[] = [...gates]
  const repeats = (scale - 1) / 2
  for (let index = 0; index < repeats; index += 1) {
    folded.push(...inverse, ...gates)
  }
  folded.push(...tail)

  return { ...circuit, operations: folded }
}

const SELF_INVERSE = new Set(["x", "y", "z", "h", "cx", "cnot", "cz", "cy", "swap", "id", "i", "ccx", "toffoli"])
const INVERSE_NAMES: Record<string, string> = { s: "sdg", sdg: "s", t: "tdg", tdg: "t", sx: "sxdg", sxdg: "sx" }
const NEGATED_PARAMETER = new Set(["rx", "ry", "rz", "p", "u1", "crx", "cry", "crz", "cp", "cu1"])

function invertGate(gate: Extract<SimpleOperation, { kind: "gate" }>): SimpleOperation {
  const name = gate.name.toLowerCase()
  if (SELF_INVERSE.has(name) && gate.parameters.length === 0) return gate
  const renamed = INVERSE_NAMES[name]
  if (renamed) return { ...gate, name: renamed }
  if (NEGATED_PARAMETER.has(name)) {
    return {
      ...gate,
      parameters: gate.parameters.map((parameter) =>
        typeof parameter === "number" ? -parameter : `-(${parameter})`,
      ),
    }
  }
  throw new Error(
    `Cannot invert gate '${gate.name}' for unitary folding. It is rejected rather than ` +
      "approximated, because an incorrect inverse silently changes the circuit being measured.",
  )
}

/** Estimate <Z> on `qubit` from measurement counts. */
export function expectationFromCounts(
  counts: Record<string, number>,
  clbitIndex: number,
): { value: number; shots: number } {
  let shots = 0
  let sum = 0
  for (const [bitstring, count] of Object.entries(counts)) {
    shots += count
    // Bitstrings are printed highest-classical-bit first.
    const position = bitstring.length - 1 - clbitIndex
    const bit = position >= 0 && position < bitstring.length ? bitstring[position] : "0"
    sum += (bit === "1" ? -1 : 1) * count
  }
  return { value: shots === 0 ? 0 : sum / shots, shots }
}

export interface ZneOptions {
  /** Odd integer noise scale factors. Must include 1 to anchor the fit. */
  scaleFactors?: number[]
  shots?: number
  seed?: number
  /** Classical bit whose <Z> is being estimated. */
  clbitIndex?: number
  /** "linear" or "richardson" (polynomial through every point). */
  extrapolation?: "linear" | "richardson"
}

/**
 * Zero-noise extrapolation.
 *
 * Runs the circuit at several noise scales via unitary folding and extrapolates
 * the observable back to zero noise.
 */
export function zeroNoiseExtrapolation(
  circuit: QuantumCircuit,
  noise: NoiseModel,
  options: ZneOptions = {},
): MitigationResult {
  const scaleFactors = options.scaleFactors ?? [1, 3, 5]
  const shots = options.shots ?? 4000
  const seed = options.seed ?? null
  const clbitIndex = options.clbitIndex ?? 0
  const extrapolation = options.extrapolation ?? "richardson"

  if (!scaleFactors.includes(1)) {
    throw new Error("Scale factors must include 1, which anchors the extrapolation to the raw result.")
  }

  const warnings: string[] = []
  const dataPoints: Array<{ scale: number; value: number; shots: number }> = []

  for (const scale of scaleFactors) {
    const folded = foldCircuit(circuit, scale)
    const result: SimulationResult = simulateStatevector(folded, {
      shots,
      // Offsetting the seed per scale keeps every scale reproducible while
      // avoiding correlated trajectories across scales, which would bias the fit.
      seed: seed === null ? undefined : seed + scale,
      noise,
    })
    const expectation = expectationFromCounts(result.counts ?? {}, clbitIndex)
    dataPoints.push({ scale, value: expectation.value, shots: expectation.shots })
  }

  const raw = dataPoints.find((point) => point.scale === 1)?.value ?? 0
  const mitigated =
    extrapolation === "linear"
      ? linearExtrapolateToZero(dataPoints)
      : richardsonExtrapolateToZero(dataPoints)

  // A <Z> outside [-1, 1] is unphysical. Extrapolation can produce one, and
  // saying so is more useful than clamping it into a plausible-looking number.
  if (mitigated < -1 || mitigated > 1) {
    warnings.push(
      `Extrapolated value ${mitigated.toFixed(6)} lies outside the physical range [-1, 1]. ` +
        "This indicates the extrapolation model does not fit the data, not a measurement.",
    )
  }
  if (dataPoints.length < 2) {
    warnings.push("Fewer than two scale factors: no extrapolation was possible.")
  }

  // Propagate each point's shot noise through the extrapolation.
  //
  // Both extrapolators are linear in the measured values, so the weight on
  // point i is exactly the change in the result when that point moves by one.
  // Deriving the weights this way rather than hard-coding them means they can
  // never drift from the extrapolator actually used.
  const extrapolate = (points: typeof dataPoints): number =>
    extrapolation === "linear" ? linearExtrapolateToZero(points) : richardsonExtrapolateToZero(points)

  const baseline = extrapolate(dataPoints)
  const weights = dataPoints.map((_point, index) => {
    const bumped = dataPoints.map((entry, other) =>
      other === index ? { ...entry, value: entry.value + 1 } : entry,
    )
    return extrapolate(bumped) - baseline
  })

  const variance = dataPoints.reduce((total, point, index) => {
    const weight = weights[index] ?? 0
    // Variance of a +/-1 valued expectation from `shots` samples.
    const pointVariance = (1 - point.value * point.value) / Math.max(1, point.shots)
    return total + weight * weight * pointVariance
  }, 0)

  const rawUncertainty = Math.sqrt((1 - raw * raw) / Math.max(1, shots))
  const uncertainty = Math.sqrt(Math.max(variance, 0))
  const amplification = rawUncertainty > 0 ? uncertainty / rawUncertainty : 1

  // Mitigation that costs more precision than it removes bias is worth
  // flagging, because the mitigated number looks more authoritative than the
  // raw one while being less well resolved.
  if (amplification > 3) {
    warnings.push(
      `Extrapolation multiplied the statistical uncertainty by ${amplification.toFixed(1)}x ` +
        `(${rawUncertainty.toFixed(4)} to ${uncertainty.toFixed(4)}). The mitigated estimate is ` +
        "less precisely resolved than the raw one; whether it is closer to the truth depends on " +
        "the extrapolation model being right, which this number does not measure.",
    )
  }

  const loss: LossReportEntry[] = []
  return {
    method: "zero_noise_extrapolation",
    method_version: MITIGATION_ADAPTER_VERSION,
    raw_value: raw,
    mitigated_value: mitigated,
    uncertainty,
    raw_uncertainty: rawUncertainty,
    uncertainty_amplification: amplification,
    total_shots: shots * scaleFactors.length,
    seed,
    assumptions: [
      "Noise scales approximately linearly with circuit depth under global unitary folding.",
      `Extrapolation model: ${extrapolation}.`,
      "Trajectory sampling gives shot-noise-limited estimates; reported uncertainty is statistical only.",
      "The mitigated value is a model-dependent estimate, not a measurement.",
    ],
    warnings,
    data_points: dataPoints,
    transformation: {
      kind: "MITIGATION",
      adapter: MITIGATION_ADAPTER,
      adapter_version: MITIGATION_ADAPTER_VERSION,
      options: { method: "zero_noise_extrapolation", scale_factors: scaleFactors, extrapolation, shots, seed },
      loss_report: loss,
      // Folding preserves the unitary by construction, but the *measured*
      // quantity is deliberately different (more noise), so no equivalence
      // claim is made about the folded circuits' results.
      equivalence: {
        level: "NOT_CHECKED",
        method: "Unitary folding preserves the ideal unitary; the noisy results are intentionally different.",
      },
    },
  }
}

function linearExtrapolateToZero(points: Array<{ scale: number; value: number }>): number {
  const n = points.length
  if (n === 0) return 0
  if (n === 1) return points[0]?.value ?? 0
  const sumX = points.reduce((total, point) => total + point.scale, 0)
  const sumY = points.reduce((total, point) => total + point.value, 0)
  const sumXY = points.reduce((total, point) => total + point.scale * point.value, 0)
  const sumXX = points.reduce((total, point) => total + point.scale * point.scale, 0)
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return sumY / n
  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  return intercept
}

/** Lagrange interpolation through every point, evaluated at zero. */
function richardsonExtrapolateToZero(points: Array<{ scale: number; value: number }>): number {
  if (points.length === 0) return 0
  if (points.length === 1) return points[0]?.value ?? 0
  let total = 0
  for (let i = 0; i < points.length; i += 1) {
    const pointI = points[i] as { scale: number; value: number }
    let term = pointI.value
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue
      const pointJ = points[j] as { scale: number; value: number }
      term *= (0 - pointJ.scale) / (pointI.scale - pointJ.scale)
    }
    total += term
  }
  return total
}

/**
 * Readout-error mitigation for a single classical bit.
 *
 * Inverts the 2x2 confusion matrix measured by preparing |0> and |1>. The
 * inversion is refused when the matrix is near-singular, because the resulting
 * estimate would be dominated by amplified noise rather than corrected.
 */
export function mitigateReadout(
  counts: Record<string, number>,
  confusion: { p0_given_0: number; p1_given_1: number },
  clbitIndex = 0,
): MitigationResult {
  const { value: raw, shots } = expectationFromCounts(counts, clbitIndex)
  const warnings: string[] = []

  // <Z>_measured = (p0|0 + p1|1 - 1) * <Z>_true  for a symmetric readout channel.
  const scale = confusion.p0_given_0 + confusion.p1_given_1 - 1
  let mitigated = raw
  if (Math.abs(scale) < 1e-6) {
    warnings.push(
      `Confusion matrix is singular (p0|0 + p1|1 - 1 = ${scale.toExponential(2)}); readout carries ` +
        "no information about the state, so no correction is possible. Returning the raw value.",
    )
  } else {
    mitigated = raw / scale
    if (mitigated < -1 || mitigated > 1) {
      warnings.push(
        `Corrected value ${mitigated.toFixed(6)} lies outside the physical range [-1, 1], which ` +
          "indicates the confusion matrix does not describe this data.",
      )
    }
  }

  return {
    method: "readout_error_mitigation",
    method_version: MITIGATION_ADAPTER_VERSION,
    raw_value: raw,
    mitigated_value: mitigated,
    uncertainty: shots > 0 ? Math.sqrt((1 - raw * raw) / shots) / Math.max(Math.abs(scale), 1e-6) : undefined,
    total_shots: shots,
    seed: null,
    assumptions: [
      "Readout error is symmetric and uncorrelated across qubits.",
      "The confusion matrix was calibrated on the same device and configuration as the data.",
      "The mitigated value is a model-dependent estimate, not a measurement.",
    ],
    warnings,
    transformation: {
      kind: "MITIGATION",
      adapter: MITIGATION_ADAPTER,
      adapter_version: MITIGATION_ADAPTER_VERSION,
      options: { method: "readout_error_mitigation", confusion },
      loss_report: [],
      equivalence: { level: "NOT_CHECKED", method: "Post-processing of counts; the circuit is unchanged." },
    },
  }
}
