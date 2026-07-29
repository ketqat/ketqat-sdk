import { z } from "zod";
import type { CircuitTransformation } from "../contracts/transformation.js";
import type { QuantumCircuit } from "../circuit/graph.js";
import type { NoiseModel } from "./noise.js";
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
export declare const MITIGATION_ADAPTER = "ketqat-mitigation";
export declare const MITIGATION_ADAPTER_VERSION = "0.1.0";
export declare const MitigationMethodSchema: z.ZodEnum<["zero_noise_extrapolation", "readout_error_mitigation"]>;
export type MitigationMethod = z.infer<typeof MitigationMethodSchema>;
export interface MitigationResult {
    method: MitigationMethod;
    method_version: string;
    /** The unmitigated estimate, always retained. */
    raw_value: number;
    mitigated_value: number;
    /**
     * Statistical uncertainty on the *mitigated* estimate, propagated through the
     * extrapolation rather than copied from the raw point.
     *
     * Extrapolation amplifies variance: it is an extrapolation, so the weights
     * that cancel the noise term also add the input variances in quadrature with
     * coefficients larger than one. Reporting raw shot noise here understated the
     * real figure, sometimes several-fold (ketqat-sdk#121).
     */
    uncertainty?: number;
    /** Shot noise on the unmitigated point, for comparison. */
    raw_uncertainty?: number;
    /**
     * How much the extrapolation multiplied the statistical uncertainty.
     *
     * This is the statistical price of mitigation, and it is the number that
     * tells a reader whether the mitigated estimate is actually better resolved
     * than the raw one.
     */
    uncertainty_amplification?: number;
    /** Total shots consumed across every scaled circuit. */
    total_shots: number;
    seed: number | null;
    assumptions: string[];
    warnings: string[];
    /** Per-scale measurements, so the extrapolation can be re-derived. */
    data_points?: Array<{
        scale: number;
        value: number;
        shots: number;
    }>;
    transformation: CircuitTransformation;
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
export declare function foldCircuit(circuit: QuantumCircuit, scale: number): QuantumCircuit;
/** Estimate <Z> on `qubit` from measurement counts. */
export declare function expectationFromCounts(counts: Record<string, number>, clbitIndex: number): {
    value: number;
    shots: number;
};
export interface ZneOptions {
    /** Odd integer noise scale factors. Must include 1 to anchor the fit. */
    scaleFactors?: number[];
    shots?: number;
    seed?: number;
    /** Classical bit whose <Z> is being estimated. */
    clbitIndex?: number;
    /** "linear" or "richardson" (polynomial through every point). */
    extrapolation?: "linear" | "richardson";
}
/**
 * Zero-noise extrapolation.
 *
 * Runs the circuit at several noise scales via unitary folding and extrapolates
 * the observable back to zero noise.
 */
export declare function zeroNoiseExtrapolation(circuit: QuantumCircuit, noise: NoiseModel, options?: ZneOptions): MitigationResult;
/**
 * Readout-error mitigation for a single classical bit.
 *
 * Inverts the 2x2 confusion matrix measured by preparing |0> and |1>. The
 * inversion is refused when the matrix is near-singular, because the resulting
 * estimate would be dominated by amplified noise rather than corrected.
 */
export declare function mitigateReadout(counts: Record<string, number>, confusion: {
    p0_given_0: number;
    p1_given_1: number;
}, clbitIndex?: number): MitigationResult;
//# sourceMappingURL=mitigation.d.ts.map