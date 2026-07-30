/**
 * Magic-state distillation factories (ketqat-sdk#196).
 *
 * `fault-tolerant.ts` counts magic states and says so explicitly: "Magic states are
 * counted, not costed: distillation factory footprint is not modelled", because
 * inventing a footprint would be a fabricated number carrying more authority than
 * the rest of the estimate. That reasoning was right, and this closes the gap by
 * grounding the cost in the protocol's arithmetic instead of inventing it.
 *
 * What is exact arithmetic and what is a model -- separated, because the
 * distinction is the whole value
 * ------------------------------------------------------------------------------
 * **Exact.** The 15-to-1 protocol consumes 15 input states per output and
 * suppresses error as `p -> 35 p^3` at leading order. Everything that follows from
 * that recursion is arithmetic: how many levels reach a target error, how many raw
 * states each output costs (15^levels), and the total input count. Those are
 * computed, and a reader can check them by hand.
 *
 * **A model.** Turning a level count into physical qubits requires a layout. The
 * footprint here is `15 * 2 * d^2` physical qubits per level -- fifteen logical
 * patches at the distillation distance -- which is a defensible reading of the
 * standard construction and *not* a measured or published figure. It is labelled
 * as a model in the output, the same way the surrounding logical-error formula is
 * labelled "fitted rather than derived".
 *
 * Why it matters that this was missing
 * ------------------------------------
 * A T count without a factory understates the physical qubit requirement, often by
 * a large factor: the factory can dominate the device. Reporting magic states
 * without their footprint is not a neutral omission -- it makes an algorithm look
 * runnable on hardware that could not hold its factory. The comparison is reported
 * directly so the size of the omission is visible.
 */

/** Input states consumed per output state by one 15-to-1 block. */
export const STATES_PER_BLOCK = 15

/** Leading-order error suppression of 15-to-1: p -> 35 p^3. */
export const DISTILLATION_PREFACTOR = 35

/** Refused beyond this: more levels than this means the target is unreachable in practice. */
export const MAX_DISTILLATION_LEVELS = 6

export class DistillationError extends Error {}

/** Output error of one 15-to-1 round on inputs of error `p`. */
export function distilledError(inputError: number): number {
  if (inputError < 0 || inputError > 1) {
    throw new DistillationError(`Input error must be in [0, 1], got ${inputError}.`)
  }
  return DISTILLATION_PREFACTOR * inputError ** 3
}

export interface DistillationLevels {
  levels: number
  /** Error after each round, so the convergence is visible rather than asserted. */
  errorPerLevel: number[]
  finalError: number
  /** Raw input states consumed per usable output: 15^levels. */
  statesPerOutput: number
  reachedTarget: boolean
  reason: string
}

/**
 * How many 15-to-1 rounds reach a target error.
 *
 * Pure arithmetic from the recursion, so the answer is checkable by hand. Refuses
 * rather than looping when the input error is above the protocol's fixed point:
 * distillation only improves states when 35 p^2 < 1, and below that threshold more
 * rounds make things worse, not better. Reporting a level count there would be
 * worse than refusing.
 */
export function requiredLevels(inputError: number, targetError: number): DistillationLevels {
  if (targetError <= 0 || targetError >= 1) {
    throw new DistillationError(`Target error must be in (0, 1), got ${targetError}.`)
  }

  // Fixed point: distillation improves a state only when 35 p^3 < p, i.e.
  // p < 1/sqrt(35) ~ 0.169. Above that each round makes the state worse.
  const fixedPoint = 1 / Math.sqrt(DISTILLATION_PREFACTOR)
  if (inputError >= fixedPoint) {
    return {
      levels: 0,
      errorPerLevel: [],
      finalError: inputError,
      statesPerOutput: 1,
      reachedTarget: inputError <= targetError,
      reason:
        `An input error of ${inputError} is at or above the 15-to-1 fixed point of ` +
        `${fixedPoint.toFixed(4)} (where 35 p^3 = p). Distillation makes states worse above it, so no ` +
        "number of levels helps -- the physical error rate has to come down first.",
    }
  }

  const errorPerLevel: number[] = []
  let current = inputError
  let levels = 0
  while (current > targetError && levels < MAX_DISTILLATION_LEVELS) {
    current = distilledError(current)
    errorPerLevel.push(current)
    levels += 1
  }

  const reached = current <= targetError
  return {
    levels,
    errorPerLevel,
    finalError: current,
    statesPerOutput: STATES_PER_BLOCK ** levels,
    reachedTarget: reached,
    reason: reached
      ? `${levels} level(s) of 15-to-1 take ${inputError} to ${current.toExponential(2)}, at or below the target ${targetError.toExponential(2)}.`
      : `${MAX_DISTILLATION_LEVELS} levels only reach ${current.toExponential(2)}, still above the target ${targetError.toExponential(2)}. Reported as not reached rather than by adding levels indefinitely.`,
  }
}

export interface FactoryCost {
  levels: number
  statesPerOutput: number
  /** Total raw input states for the whole algorithm. */
  totalInputStates: number
  finalStateError: number
  reachedTarget: boolean
  /** Physical qubits the factory occupies, under the layout model below. */
  factoryPhysicalQubits: number
  /** Physical qubits for the algorithm's logical patches, excluding the factory. */
  algorithmPhysicalQubits: number
  totalPhysicalQubits: number
  /**
   * How much larger the true requirement is than an algorithm-only count.
   *
   * The number that shows why counting magic states without costing them is not a
   * neutral omission.
   */
  factoryShareOfDevice: number
  exactArithmetic: string[]
  modelAssumptions: string[]
  warnings: string[]
}

export interface FactoryOptions {
  /** Physical error rate of raw magic states before distillation. */
  rawStateError?: number
  /** Error each distilled state must reach. */
  targetStateError?: number
  /** Code distance used inside the factory. */
  factoryDistance?: number
  /** Code distance for the algorithm's own logical qubits. */
  algorithmDistance?: number
}

/**
 * Cost a distillation factory alongside the algorithm it feeds.
 *
 * `magicStates` and `logicalQubits` come from the fault-tolerant estimate, so this
 * extends that result rather than replacing it.
 */
export function estimateFactoryCost(
  magicStates: number,
  logicalQubits: number,
  options: FactoryOptions = {},
): FactoryCost {
  const rawError = options.rawStateError ?? 1e-3
  const targetError = options.targetStateError ?? 1e-10
  const factoryDistance = options.factoryDistance ?? 15
  const algorithmDistance = options.algorithmDistance ?? 15

  if (magicStates < 0 || !Number.isFinite(magicStates)) {
    throw new DistillationError(`Magic state count must be finite and non-negative, got ${magicStates}.`)
  }
  if (logicalQubits < 1) {
    throw new DistillationError(`An algorithm needs at least one logical qubit, got ${logicalQubits}.`)
  }
  for (const [name, distance] of [
    ["factoryDistance", factoryDistance],
    ["algorithmDistance", algorithmDistance],
  ] as const) {
    if (!Number.isInteger(distance) || distance < 3 || distance % 2 === 0) {
      throw new DistillationError(`${name} must be an odd integer of at least 3, got ${distance}.`)
    }
  }

  const levels = requiredLevels(rawError, targetError)
  const warnings: string[] = []

  // 2 d^2 physical qubits per logical patch, the same convention the surrounding
  // fault-tolerant estimate uses.
  const perPatch = (distance: number): number => 2 * distance * distance
  const algorithmPhysical = logicalQubits * perPatch(algorithmDistance)
  const factoryPhysical =
    levels.levels === 0 ? 0 : levels.levels * STATES_PER_BLOCK * perPatch(factoryDistance)

  // A Clifford circuit needs no factory at all, so the footprint is zero
  // regardless of the level count. Computing the share from the un-zeroed
  // footprint made a T-count-of-zero circuit warn that its factory dominated the
  // device -- a warning about a factory it does not have.
  const needsFactory = magicStates > 0
  const effectiveFactoryPhysical = needsFactory ? factoryPhysical : 0
  const total = algorithmPhysical + effectiveFactoryPhysical
  const share = total === 0 ? 0 : effectiveFactoryPhysical / total

  if (!levels.reachedTarget && needsFactory) {
    warnings.push(levels.reason)
  }
  if (share > 0.5) {
    warnings.push(
      `The factory is ${(share * 100).toFixed(0)}% of the device -- larger than the algorithm it feeds. ` +
        "A T count reported without this footprint understates the hardware requirement by more than a " +
        "factor of two here.",
    )
  }
  if (magicStates === 0) {
    warnings.push(
      "This algorithm consumes no magic states, so no factory is needed. A Clifford circuit needs no " +
        "distillation at all.",
    )
  }

  return {
    levels: levels.levels,
    statesPerOutput: levels.statesPerOutput,
    totalInputStates: magicStates * levels.statesPerOutput,
    finalStateError: levels.finalError,
    reachedTarget: levels.reachedTarget,
    factoryPhysicalQubits: effectiveFactoryPhysical,
    algorithmPhysicalQubits: algorithmPhysical,
    totalPhysicalQubits: total,
    factoryShareOfDevice: share,
    exactArithmetic: [
      `15-to-1 consumes ${STATES_PER_BLOCK} inputs per output and suppresses error as p -> ${DISTILLATION_PREFACTOR} p^3.`,
      `${levels.levels} level(s) needed: ${[rawError, ...levels.errorPerLevel].map((value) => value.toExponential(1)).join(" -> ")}.`,
      `Raw states per usable output: ${STATES_PER_BLOCK}^${levels.levels} = ${levels.statesPerOutput}.`,
      `Total raw states: ${magicStates} x ${levels.statesPerOutput} = ${magicStates * levels.statesPerOutput}.`,
    ],
    modelAssumptions: [
      "Footprint model: 15 logical patches per level at the factory distance, 2d^2 physical qubits per patch.",
      "This is a reading of the standard construction, NOT a measured or published figure -- treat it as a model, as with the surrounding logical-error formula.",
      "Factory and algorithm are charged separately; no sharing of routing space is assumed either way.",
      "Only the leading order of the 15-to-1 error polynomial is used.",
      "Distillation throughput is not modelled, so this is a space estimate rather than a space-time one.",
    ],
    warnings,
  }
}
