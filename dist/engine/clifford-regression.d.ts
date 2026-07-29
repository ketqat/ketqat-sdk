import type { QuantumCircuit } from "../circuit/graph.js";
import type { NoiseModel } from "./noise.js";
export declare class CdrError extends Error {
}
export interface CdrTrainingPoint {
    noisy: number;
    exact: number;
    /** How many gates were snapped to Clifford to build this variant. */
    substitutions: number;
}
export interface CdrResult {
    method: "cdr";
    raw_value: number;
    mitigated_value: number;
    /** Fitted exact = slope * noisy + intercept. */
    slope: number;
    intercept: number;
    /**
     * Coefficient of determination, or NaN when every training target was
     * identical -- in that case the quantity is undefined rather than perfect.
     */
    r_squared: number;
    training_points: CdrTrainingPoint[];
    /** True when the target's noisy value lies inside the training range. */
    interpolating: boolean;
    total_shots: number;
    warnings: string[];
    assumptions: string[];
}
/** Whether a gate is Clifford, accounting for rotation angles. */
export declare function isCliffordGate(name: string, parameters: ReadonlyArray<number | string>): boolean;
/**
 * Replace a random subset of non-Clifford gates with their nearest Clifford.
 *
 * Randomised so the training set spans a range of noisy values. A training set
 * clustered at one value is exactly the degenerate case the fit cannot use, so
 * spread is a requirement rather than a nicety.
 */
export declare function nearCliffordVariant(circuit: QuantumCircuit, random: () => number, substitutionRate?: number): {
    circuit: QuantumCircuit;
    substitutions: number;
};
/**
 * Exact <Z> on the qubit feeding a classical bit, from amplitudes.
 *
 * Computed from the statevector rather than sampled, so training targets carry
 * no shot noise. Shot noise in the targets would propagate into the fitted slope
 * and be indistinguishable from a genuinely non-linear noise map.
 */
export declare function exactExpectation(circuit: QuantumCircuit, clbitIndex?: number): number;
export interface CdrOptions {
    trainingCircuits?: number;
    shots?: number;
    seed?: number;
    clbitIndex?: number;
    substitutionRate?: number;
}
export declare function cliffordDataRegression(circuit: QuantumCircuit, noise: NoiseModel, options?: CdrOptions): CdrResult;
//# sourceMappingURL=clifford-regression.d.ts.map