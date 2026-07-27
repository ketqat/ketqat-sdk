import type { QuantumCircuit } from "../circuit/graph.js";
import { type NoiseModel } from "./noise.js";
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
export declare class SimulationError extends Error {
    constructor(message: string);
}
/** Above this width an exact statevector stops being reasonable to allocate. */
export declare const MAX_SIMULATED_QUBITS = 24;
export interface StatevectorState {
    qubitCount: number;
    real: Float64Array;
    imaginary: Float64Array;
}
export declare function zeroState(qubitCount: number): StatevectorState;
/** Probability that measuring `qubit` yields 1. */
export declare function probabilityOfOne(state: StatevectorState, qubit: number): number;
export interface RunOptions {
    shots?: number;
    /** Omitting the seed makes the run non-reproducible, and the result says so. */
    seed?: number;
    /**
     * Sample Pauli-error trajectories per shot. Requires shots: a noise model has
     * no meaning for an exact statevector, and silently ignoring it would produce
     * a noiseless result labelled as noisy.
     */
    noise?: NoiseModel;
}
export interface SimulationResult {
    qubit_count: number;
    /** Present only when the circuit has no measurement, so the state is well defined. */
    statevector?: {
        real: number[];
        imaginary: number[];
    };
    /** Bitstring counts, highest classical bit first. Present when shots were requested. */
    counts?: Record<string, number>;
    probabilities?: Record<string, number>;
    shots: number;
    seed: number | null;
    deterministic: boolean;
    backend: string;
    /** Present when a noise model was applied, so a noisy result cannot be mistaken for an ideal one. */
    noise?: NoiseModel;
}
export declare const STATEVECTOR_BACKEND = "ketqat-statevector";
export declare const STATEVECTOR_BACKEND_VERSION = "0.1.0";
export declare function formatBitstring(bits: number[]): string;
export declare function totalQubitCount(circuit: QuantumCircuit): number;
/**
 * Simulate a circuit.
 *
 * With `shots`, samples measurement outcomes and returns counts. Without shots
 * and without measurement, returns the exact final statevector.
 */
export declare function simulateStatevector(circuit: QuantumCircuit, options?: RunOptions): SimulationResult;
//# sourceMappingURL=statevector.d.ts.map