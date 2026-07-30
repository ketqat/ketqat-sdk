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
export declare const STATES_PER_BLOCK = 15;
/** Leading-order error suppression of 15-to-1: p -> 35 p^3. */
export declare const DISTILLATION_PREFACTOR = 35;
/** Refused beyond this: more levels than this means the target is unreachable in practice. */
export declare const MAX_DISTILLATION_LEVELS = 6;
export declare class DistillationError extends Error {
}
/** Output error of one 15-to-1 round on inputs of error `p`. */
export declare function distilledError(inputError: number): number;
export interface DistillationLevels {
    levels: number;
    /** Error after each round, so the convergence is visible rather than asserted. */
    errorPerLevel: number[];
    finalError: number;
    /** Raw input states consumed per usable output: 15^levels. */
    statesPerOutput: number;
    reachedTarget: boolean;
    reason: string;
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
export declare function requiredLevels(inputError: number, targetError: number): DistillationLevels;
export interface FactoryCost {
    levels: number;
    statesPerOutput: number;
    /** Total raw input states for the whole algorithm. */
    totalInputStates: number;
    finalStateError: number;
    reachedTarget: boolean;
    /** Physical qubits the factory occupies, under the layout model below. */
    factoryPhysicalQubits: number;
    /** Physical qubits for the algorithm's logical patches, excluding the factory. */
    algorithmPhysicalQubits: number;
    totalPhysicalQubits: number;
    /**
     * How much larger the true requirement is than an algorithm-only count.
     *
     * The number that shows why counting magic states without costing them is not a
     * neutral omission.
     */
    factoryShareOfDevice: number;
    exactArithmetic: string[];
    modelAssumptions: string[];
    warnings: string[];
}
export interface FactoryOptions {
    /** Physical error rate of raw magic states before distillation. */
    rawStateError?: number;
    /** Error each distilled state must reach. */
    targetStateError?: number;
    /** Code distance used inside the factory. */
    factoryDistance?: number;
    /** Code distance for the algorithm's own logical qubits. */
    algorithmDistance?: number;
}
/**
 * Cost a distillation factory alongside the algorithm it feeds.
 *
 * `magicStates` and `logicalQubits` come from the fault-tolerant estimate, so this
 * extends that result rather than replacing it.
 */
export declare function estimateFactoryCost(magicStates: number, logicalQubits: number, options?: FactoryOptions): FactoryCost;
//# sourceMappingURL=distillation.d.ts.map