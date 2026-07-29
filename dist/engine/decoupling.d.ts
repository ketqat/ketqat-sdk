import type { QuantumCircuit } from "../circuit/graph.js";
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
export declare const DECOUPLING_SEQUENCES: {
    /** Two X pulses. The simplest sequence that is its own inverse. */
    readonly XX: readonly ["x", "x"];
    /** X-Y-X-Y. Suppresses dephasing along both axes rather than one. */
    readonly XYXY: readonly ["x", "y", "x", "y"];
};
export type DecouplingSequence = keyof typeof DECOUPLING_SEQUENCES;
export interface DecouplingResult {
    circuit: QuantumCircuit;
    sequence: DecouplingSequence;
    /** Idle windows the sequence was inserted into. */
    windows_filled: number;
    /** Gates added, which is the cost. */
    gates_added: number;
    /**
     * Whether the noise model this will run under can be suppressed by DDD at
     * all. False for every model this engine currently has.
     */
    can_help: boolean;
    warnings: string[];
    assumptions: string[];
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
export declare function applyDynamicalDecoupling(circuit: QuantumCircuit, options?: {
    sequence?: DecouplingSequence;
    noiseHasMemory?: boolean;
}): DecouplingResult;
//# sourceMappingURL=decoupling.d.ts.map