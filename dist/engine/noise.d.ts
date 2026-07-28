import { z } from "zod";
import type { QuantumCircuit } from "../circuit/graph.js";
/**
 * Noise models for shot-based simulation.
 *
 * Implemented as **Monte Carlo Pauli trajectories**: before each shot, Pauli
 * errors are sampled after each gate according to the model, inserted into the
 * circuit, and that trajectory is simulated exactly. Averaging over shots
 * reproduces the density-matrix result in the limit of many shots, without
 * allocating a density matrix.
 *
 * That is a real approximation with a real cost, and it is stated rather than
 * hidden: trajectory sampling gives shot-noise-limited estimates, so an
 * expectation value from N shots carries roughly 1/sqrt(N) statistical error on
 * top of the physical noise being modelled.
 */
export declare const DepolarizingNoiseSchema: z.ZodObject<{
    model: z.ZodLiteral<"depolarizing">;
    /** Probability a one-qubit gate is followed by a random non-identity Pauli. */
    one_qubit_error: z.ZodDefault<z.ZodNumber>;
    /** Probability a two-qubit gate is followed by a random non-identity Pauli pair. */
    two_qubit_error: z.ZodDefault<z.ZodNumber>;
    /** Probability a measurement outcome is flipped. */
    readout_error: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    model: "depolarizing";
    one_qubit_error: number;
    two_qubit_error: number;
    readout_error: number;
}, {
    model: "depolarizing";
    one_qubit_error?: number | undefined;
    two_qubit_error?: number | undefined;
    readout_error?: number | undefined;
}>;
export type DepolarizingNoise = z.infer<typeof DepolarizingNoiseSchema>;
export declare const NoiseModelSchema: z.ZodObject<{
    model: z.ZodLiteral<"depolarizing">;
    /** Probability a one-qubit gate is followed by a random non-identity Pauli. */
    one_qubit_error: z.ZodDefault<z.ZodNumber>;
    /** Probability a two-qubit gate is followed by a random non-identity Pauli pair. */
    two_qubit_error: z.ZodDefault<z.ZodNumber>;
    /** Probability a measurement outcome is flipped. */
    readout_error: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    model: "depolarizing";
    one_qubit_error: number;
    two_qubit_error: number;
    readout_error: number;
}, {
    model: "depolarizing";
    one_qubit_error?: number | undefined;
    two_qubit_error?: number | undefined;
    readout_error?: number | undefined;
}>;
export type NoiseModel = z.infer<typeof NoiseModelSchema>;
/**
 * Insert sampled Pauli errors after each gate.
 *
 * `random` is supplied by the caller so noise sampling shares the run's seeded
 * generator: a noisy run stays exactly reproducible from its seed, which a
 * separately-seeded noise source would quietly destroy.
 */
export declare function applyPauliNoise(circuit: QuantumCircuit, noise: NoiseModel, random: () => number): QuantumCircuit;
/** True when the model would introduce no error at all. */
export declare function isNoiseless(noise: NoiseModel): boolean;
//# sourceMappingURL=noise.d.ts.map