import type { QuantumCircuit } from "../circuit/graph.js";
import type { EquivalenceEvidence } from "../contracts/transformation.js";
import { type StatevectorState } from "./statevector.js";
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
    max_amplitude_difference: number;
    /** |<a|b>|, which is 1 for states equal up to global phase. */
    fidelity: number;
    global_phase_ignored: boolean;
}
/**
 * Compare two statevectors.
 *
 * With `ignoreGlobalPhase`, the second state is rotated by the phase of its
 * largest-magnitude shared amplitude before differencing, since a global phase
 * is unobservable and two circuits differing only by one are equivalent for
 * every measurement.
 */
export declare function compareStates(left: StatevectorState, right: StatevectorState, ignoreGlobalPhase?: boolean): StateComparison;
export interface EquivalenceOptions {
    tolerance?: number;
    ignoreGlobalPhase?: boolean;
    /** Above this width the check reports INCONCLUSIVE rather than allocating. */
    maxQubits?: number;
}
/**
 * Check two circuits for equivalence by exact simulation, returning evidence.
 *
 * Returns `INCONCLUSIVE` -- never `FAILED` -- when the check cannot be run:
 * too many qubits, an unsupported gate, or a measurement that makes the final
 * state undefined. `FAILED` is reserved for an actual counterexample.
 */
export declare function checkCircuitEquivalence(left: QuantumCircuit, right: QuantumCircuit, options?: EquivalenceOptions): EquivalenceEvidence;
export interface DifferentialRun {
    backend: string;
    counts: Record<string, number>;
    shots: number;
}
export interface DifferentialReport {
    agreed: boolean;
    /** Largest absolute difference in estimated probability across backends. */
    max_probability_difference: number;
    /** Statistical tolerance used, derived from shot noise unless overridden. */
    tolerance: number;
    outcomes: string[];
    detail: string;
}
/**
 * Compare shot-based results from two backends.
 *
 * The default tolerance is derived from binomial shot noise rather than being a
 * fixed constant, because a difference that matters at 10^6 shots is invisible
 * at 100. Disagreement here is reported as disagreement, not as proof that
 * either backend is wrong.
 */
export declare function compareShotResults(left: DifferentialRun, right: DifferentialRun, options?: {
    tolerance?: number;
    sigma?: number;
}): DifferentialReport;
//# sourceMappingURL=differential.d.ts.map