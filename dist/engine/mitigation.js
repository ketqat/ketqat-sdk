import { z } from "zod";
import { simulateStatevector } from "./statevector.js";
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
export const MITIGATION_ADAPTER = "ketqat-mitigation";
export const MITIGATION_ADAPTER_VERSION = "0.1.0";
export const MitigationMethodSchema = z.enum([
    "zero_noise_extrapolation",
    "readout_error_mitigation",
]);
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
export function foldCircuit(circuit, scale) {
    if (!Number.isInteger(scale) || scale < 1 || scale % 2 === 0) {
        throw new Error(`Unitary folding supports odd integer scale factors (1, 3, 5, ...); got ${scale}. ` +
            "Fractional folding changes the method's assumptions and is not implemented.");
    }
    if (scale === 1)
        return circuit;
    const gates = [];
    const tail = [];
    for (const operation of circuit.operations) {
        if (operation.kind === "gate") {
            gates.push(operation);
        }
        else {
            // Measurement, reset, barrier, and conditionals are not folded: folding a
            // measurement would change the program, not amplify its noise.
            tail.push(operation);
        }
    }
    const inverse = gates
        .slice()
        .reverse()
        .map((gate) => invertGate(gate));
    const folded = [...gates];
    const repeats = (scale - 1) / 2;
    for (let index = 0; index < repeats; index += 1) {
        folded.push(...inverse, ...gates);
    }
    folded.push(...tail);
    return { ...circuit, operations: folded };
}
const SELF_INVERSE = new Set(["x", "y", "z", "h", "cx", "cnot", "cz", "cy", "swap", "id", "i", "ccx", "toffoli"]);
const INVERSE_NAMES = { s: "sdg", sdg: "s", t: "tdg", tdg: "t", sx: "sxdg", sxdg: "sx" };
const NEGATED_PARAMETER = new Set(["rx", "ry", "rz", "p", "u1", "crx", "cry", "crz", "cp", "cu1"]);
function invertGate(gate) {
    const name = gate.name.toLowerCase();
    if (SELF_INVERSE.has(name) && gate.parameters.length === 0)
        return gate;
    const renamed = INVERSE_NAMES[name];
    if (renamed)
        return { ...gate, name: renamed };
    if (NEGATED_PARAMETER.has(name)) {
        return {
            ...gate,
            parameters: gate.parameters.map((parameter) => typeof parameter === "number" ? -parameter : `-(${parameter})`),
        };
    }
    throw new Error(`Cannot invert gate '${gate.name}' for unitary folding. It is rejected rather than ` +
        "approximated, because an incorrect inverse silently changes the circuit being measured.");
}
/** Estimate <Z> on `qubit` from measurement counts. */
export function expectationFromCounts(counts, clbitIndex) {
    let shots = 0;
    let sum = 0;
    for (const [bitstring, count] of Object.entries(counts)) {
        shots += count;
        // Bitstrings are printed highest-classical-bit first.
        const position = bitstring.length - 1 - clbitIndex;
        const bit = position >= 0 && position < bitstring.length ? bitstring[position] : "0";
        sum += (bit === "1" ? -1 : 1) * count;
    }
    return { value: shots === 0 ? 0 : sum / shots, shots };
}
/**
 * Zero-noise extrapolation.
 *
 * Runs the circuit at several noise scales via unitary folding and extrapolates
 * the observable back to zero noise.
 */
export function zeroNoiseExtrapolation(circuit, noise, options = {}) {
    const scaleFactors = options.scaleFactors ?? [1, 3, 5];
    const shots = options.shots ?? 4000;
    const seed = options.seed ?? null;
    const clbitIndex = options.clbitIndex ?? 0;
    const extrapolation = options.extrapolation ?? "richardson";
    if (!scaleFactors.includes(1)) {
        throw new Error("Scale factors must include 1, which anchors the extrapolation to the raw result.");
    }
    const warnings = [];
    const dataPoints = [];
    for (const scale of scaleFactors) {
        const folded = foldCircuit(circuit, scale);
        const result = simulateStatevector(folded, {
            shots,
            // Offsetting the seed per scale keeps every scale reproducible while
            // avoiding correlated trajectories across scales, which would bias the fit.
            seed: seed === null ? undefined : seed + scale,
            noise,
        });
        const expectation = expectationFromCounts(result.counts ?? {}, clbitIndex);
        dataPoints.push({ scale, value: expectation.value, shots: expectation.shots });
    }
    const raw = dataPoints.find((point) => point.scale === 1)?.value ?? 0;
    const mitigated = extrapolation === "linear"
        ? linearExtrapolateToZero(dataPoints)
        : richardsonExtrapolateToZero(dataPoints);
    // A <Z> outside [-1, 1] is unphysical. Extrapolation can produce one, and
    // saying so is more useful than clamping it into a plausible-looking number.
    if (mitigated < -1 || mitigated > 1) {
        warnings.push(`Extrapolated value ${mitigated.toFixed(6)} lies outside the physical range [-1, 1]. ` +
            "This indicates the extrapolation model does not fit the data, not a measurement.");
    }
    if (dataPoints.length < 2) {
        warnings.push("Fewer than two scale factors: no extrapolation was possible.");
    }
    // Propagate each point's shot noise through the extrapolation.
    //
    // Both extrapolators are linear in the measured values, so the weight on
    // point i is exactly the change in the result when that point moves by one.
    // Deriving the weights this way rather than hard-coding them means they can
    // never drift from the extrapolator actually used.
    const extrapolate = (points) => extrapolation === "linear" ? linearExtrapolateToZero(points) : richardsonExtrapolateToZero(points);
    const baseline = extrapolate(dataPoints);
    const weights = dataPoints.map((_point, index) => {
        const bumped = dataPoints.map((entry, other) => other === index ? { ...entry, value: entry.value + 1 } : entry);
        return extrapolate(bumped) - baseline;
    });
    const variance = dataPoints.reduce((total, point, index) => {
        const weight = weights[index] ?? 0;
        // Variance of a +/-1 valued expectation from `shots` samples.
        const pointVariance = (1 - point.value * point.value) / Math.max(1, point.shots);
        return total + weight * weight * pointVariance;
    }, 0);
    const rawUncertainty = Math.sqrt((1 - raw * raw) / Math.max(1, shots));
    const uncertainty = Math.sqrt(Math.max(variance, 0));
    const amplification = rawUncertainty > 0 ? uncertainty / rawUncertainty : 1;
    // Mitigation that costs more precision than it removes bias is worth
    // flagging, because the mitigated number looks more authoritative than the
    // raw one while being less well resolved.
    if (amplification > 3) {
        warnings.push(`Extrapolation multiplied the statistical uncertainty by ${amplification.toFixed(1)}x ` +
            `(${rawUncertainty.toFixed(4)} to ${uncertainty.toFixed(4)}). The mitigated estimate is ` +
            "less precisely resolved than the raw one; whether it is closer to the truth depends on " +
            "the extrapolation model being right, which this number does not measure.");
    }
    const loss = [];
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
    };
}
/**
 * Least-squares linear fit evaluated at zero noise.
 *
 * Exported so it can be differentially tested against Mitiq's `LinearFactory`. It was
 * private, which left the extrapolation -- the one piece of arithmetic that decides the
 * mitigated value -- unreachable by any test that could compare it with a reference
 * implementation.
 */
export function linearExtrapolateToZero(points) {
    const n = points.length;
    if (n === 0)
        return 0;
    if (n === 1)
        return points[0]?.value ?? 0;
    const sumX = points.reduce((total, point) => total + point.scale, 0);
    const sumY = points.reduce((total, point) => total + point.value, 0);
    const sumXY = points.reduce((total, point) => total + point.scale * point.value, 0);
    const sumXX = points.reduce((total, point) => total + point.scale * point.scale, 0);
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0)
        return sumY / n;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return intercept;
}
/** Lagrange interpolation through every point, evaluated at zero. */
/**
 * Richardson extrapolation: the polynomial through every point, evaluated at zero.
 *
 * Exported for the same reason as the linear fit. Mitiq's `RichardsonFactory` computes the
 * same quantity, so agreement is checkable rather than assumed.
 */
export function richardsonExtrapolateToZero(points) {
    if (points.length === 0)
        return 0;
    if (points.length === 1)
        return points[0]?.value ?? 0;
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
        const pointI = points[i];
        let term = pointI.value;
        for (let j = 0; j < points.length; j += 1) {
            if (i === j)
                continue;
            const pointJ = points[j];
            term *= (0 - pointJ.scale) / (pointI.scale - pointJ.scale);
        }
        total += term;
    }
    return total;
}
/**
 * Readout-error mitigation for a single classical bit.
 *
 * Inverts the 2x2 confusion matrix measured by preparing |0> and |1>. The
 * inversion is refused when the matrix is near-singular, because the resulting
 * estimate would be dominated by amplified noise rather than corrected.
 */
export function mitigateReadout(counts, confusion, clbitIndex = 0) {
    const { value: raw, shots } = expectationFromCounts(counts, clbitIndex);
    const warnings = [];
    // <Z>_measured = (p0|0 + p1|1 - 1) * <Z>_true  for a symmetric readout channel.
    const scale = confusion.p0_given_0 + confusion.p1_given_1 - 1;
    let mitigated = raw;
    if (Math.abs(scale) < 1e-6) {
        warnings.push(`Confusion matrix is singular (p0|0 + p1|1 - 1 = ${scale.toExponential(2)}); readout carries ` +
            "no information about the state, so no correction is possible. Returning the raw value.");
    }
    else {
        mitigated = raw / scale;
        if (mitigated < -1 || mitigated > 1) {
            warnings.push(`Corrected value ${mitigated.toFixed(6)} lies outside the physical range [-1, 1], which ` +
                "indicates the confusion matrix does not describe this data.");
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
    };
}
export function depolarizingInverse(rate) {
    if (rate < 0 || rate >= 0.75) {
        throw new Error(`A depolarizing rate of ${rate} has no usable inverse. At 3/4 the channel is completely ` +
            "depolarizing and destroys the state, so no quasi-probability recovers it.");
    }
    const lambda = 1 - (4 * rate) / 3;
    const identity = (1 + 3 / lambda) / 4;
    const pauli = (1 - 1 / lambda) / 4;
    const gamma = Math.abs(identity) + 3 * Math.abs(pauli);
    return {
        identity,
        pauli,
        gamma,
        overhead: gamma * gamma,
        hasNegativity: pauli < 0,
    };
}
/**
 * What PEC would cost on a circuit, before anyone runs it.
 *
 * The overhead compounds **per noisy location**, so it grows exponentially in
 * circuit size. That is not a footnote: it is the reason PEC is impractical for
 * anything but small circuits, and quoting a mitigated value without it invites
 * a reader to think the bias was removed for free.
 *
 * Reported rather than applied. Sampling from a quasi-probability needs an
 * execution loop this engine does not have, and computing the cost is the part
 * that tells someone whether to attempt it at all.
 */
export function pecCost(rate, noisyLocations, shots = 1000) {
    const inverse = depolarizingInverse(rate);
    const overhead = Math.pow(inverse.gamma, 2 * noisyLocations);
    const warnings = [];
    if (overhead > 1e6) {
        warnings.push(`A sampling overhead of ${overhead.toExponential(2)} means matching an unmitigated ` +
            `estimator's precision needs about ${Math.ceil(overhead * shots).toExponential(2)} shots. ` +
            "PEC is not practical at this circuit size and noise rate.");
    }
    if (!inverse.hasNegativity && rate > 0) {
        warnings.push("No negative coefficient at a non-zero rate, which should not happen.");
    }
    return {
        gamma: inverse.gamma,
        sampling_overhead: overhead,
        shots_for_parity: Math.ceil(overhead * shots),
        noisy_locations: noisyLocations,
        warnings,
        assumptions: [
            "Single-qubit depolarizing noise, inverted exactly as a Pauli quasi-probability.",
            "Every noisy location is assumed independent and identically distributed.",
            "Overhead is gamma^(2 x locations), so it compounds exponentially in circuit size.",
            "Cost is computed, not incurred: this reports what PEC would take, it does not sample.",
        ],
    };
}
//# sourceMappingURL=mitigation.js.map