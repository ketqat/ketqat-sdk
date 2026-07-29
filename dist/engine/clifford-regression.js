import { expectationFromCounts } from "./mitigation.js";
import { simulateStatevector } from "./statevector.js";
/**
 * Clifford data regression (ketqat-sdk#161).
 *
 * CDR learns the map from noisy to noiseless expectation values on circuits
 * whose exact answers are known, then applies that map to the circuit you
 * actually care about. Its appeal is that it needs no noise model: the training
 * data carries whatever the device actually does.
 *
 * Its weakness is the part usually left implicit, so it is made explicit here.
 * **CDR is a regression, and a regression can be unjustified in ways that do not
 * look like failure.** Three of those are detected rather than absorbed:
 *
 * - If the training circuits all give nearly the same noisy value, the slope is
 *   unidentifiable. Least squares will still return a number, and that number is
 *   noise amplified by a near-zero denominator. This refuses instead.
 * - If the target's noisy value lies outside the training range, the fitted line
 *   is being extrapolated rather than interpolated, and nothing in the training
 *   data supports it. That is reported.
 * - If the fit is poor, the linear assumption is wrong for this circuit and
 *   noise. R^2 is returned so the caller can see that rather than infer it.
 *
 * On scale, honestly: the training targets here come from exact statevector
 * simulation, which bounds this implementation to small circuits. That is not a
 * shortcut around CDR's real constraint -- in practice CDR needs its training
 * circuits to be classically simulable too, which is why they are chosen
 * near-Clifford and evaluated with a stabiliser simulator. The limit is the same
 * one, reached by a different route.
 */
/** Gates that generate the Clifford group, so a circuit of these is simulable. */
const CLIFFORD_NAMES = new Set([
    "i", "id", "x", "y", "z", "h", "s", "sdg", "sx", "sxdg",
    "cx", "cnot", "cy", "cz", "swap",
]);
/** Rotation gates whose angle decides whether they are Clifford. */
const ROTATION_NAMES = new Set(["rx", "ry", "rz", "p", "u1"]);
const HALF_PI = Math.PI / 2;
export class CdrError extends Error {
}
/** Whether a gate is Clifford, accounting for rotation angles. */
export function isCliffordGate(name, parameters) {
    const lower = name.toLowerCase();
    if (CLIFFORD_NAMES.has(lower))
        return true;
    if (lower === "t" || lower === "tdg")
        return false;
    if (ROTATION_NAMES.has(lower)) {
        const angle = parameters[0];
        if (typeof angle !== "number")
            return false;
        // Clifford exactly at multiples of pi/2.
        return Math.abs(angle / HALF_PI - Math.round(angle / HALF_PI)) < 1e-9;
    }
    // Anything unrecognised is treated as non-Clifford: assuming otherwise would
    // silently put an unsimulable gate into a "classically exact" training set.
    return false;
}
/** Nearest Clifford angle, which is what makes a variant classically cheap. */
function snapAngle(angle) {
    return Math.round(angle / HALF_PI) * HALF_PI;
}
/**
 * Replace a random subset of non-Clifford gates with their nearest Clifford.
 *
 * Randomised so the training set spans a range of noisy values. A training set
 * clustered at one value is exactly the degenerate case the fit cannot use, so
 * spread is a requirement rather than a nicety.
 */
export function nearCliffordVariant(circuit, random, substitutionRate = 0.5) {
    let substitutions = 0;
    const operations = circuit.operations.map((operation) => {
        if (operation.kind !== "gate")
            return operation;
        if (isCliffordGate(operation.name, operation.parameters))
            return operation;
        if (random() > substitutionRate)
            return operation;
        substitutions += 1;
        const lower = operation.name.toLowerCase();
        if (lower === "t")
            return { ...operation, name: "s", parameters: [] };
        if (lower === "tdg")
            return { ...operation, name: "sdg", parameters: [] };
        if (ROTATION_NAMES.has(lower) && typeof operation.parameters[0] === "number") {
            return { ...operation, parameters: [snapAngle(operation.parameters[0]), ...operation.parameters.slice(1)] };
        }
        // Unrecognised non-Clifford: drop to identity rather than guess a nearby
        // gate, and count it so the caller sees the circuit was altered.
        return { ...operation, name: "id", parameters: [], qubits: [operation.qubits[0]] };
    });
    return { circuit: { ...circuit, operations }, substitutions };
}
/**
 * Exact <Z> on the qubit feeding a classical bit, from amplitudes.
 *
 * Computed from the statevector rather than sampled, so training targets carry
 * no shot noise. Shot noise in the targets would propagate into the fitted slope
 * and be indistinguishable from a genuinely non-linear noise map.
 */
export function exactExpectation(circuit, clbitIndex = 0) {
    let target = null;
    for (const operation of circuit.operations) {
        if (operation.kind === "measure" && operation.clbit.index === clbitIndex) {
            target = operation.qubit.index;
            break;
        }
    }
    if (target === null) {
        throw new CdrError(`No measurement writes classical bit ${clbitIndex}, so there is no observable to compute.`);
    }
    // Measurements collapse the state, so the statevector is only defined without
    // them. Removing them changes nothing about <Z> on the measured qubit.
    const unmeasured = {
        ...circuit,
        operations: circuit.operations.filter((operation) => operation.kind !== "measure" && operation.kind !== "reset"),
    };
    const result = simulateStatevector(unmeasured, {});
    const state = result.statevector;
    if (!state) {
        throw new CdrError("The simulator returned no statevector, so no exact value is available.");
    }
    let value = 0;
    for (let index = 0; index < state.real.length; index += 1) {
        const probability = state.real[index] ** 2 + state.imaginary[index] ** 2;
        // Little-endian: index bit q is qubit q. Verified against x/h on known qubits.
        value += probability * (((index >> target) & 1) === 1 ? -1 : 1);
    }
    return value;
}
/** Deterministic generator, so a CDR run is reproducible from its seed. */
function seededRandom(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x100000000;
    };
}
export function cliffordDataRegression(circuit, noise, options = {}) {
    const trainingCircuits = options.trainingCircuits ?? 12;
    const shots = options.shots ?? 4000;
    const seed = options.seed ?? 1;
    const clbitIndex = options.clbitIndex ?? 0;
    const substitutionRate = options.substitutionRate ?? 0.5;
    if (trainingCircuits < 3) {
        throw new CdrError(`A regression through ${trainingCircuits} points cannot be assessed. At least 3 are needed for ` +
            "R^2 to mean anything.");
    }
    const nonClifford = circuit.operations.filter((operation) => operation.kind === "gate" && !isCliffordGate(operation.name, operation.parameters)).length;
    const warnings = [];
    if (nonClifford === 0) {
        warnings.push("This circuit is already Clifford, so every training variant is identical to it and the " +
            "regression has nothing to learn. Its exact value is directly computable -- mitigation is " +
            "unnecessary here.");
    }
    const random = seededRandom(seed);
    const points = [];
    let totalShots = 0;
    for (let index = 0; index < trainingCircuits; index += 1) {
        const variant = nearCliffordVariant(circuit, random, substitutionRate);
        const noisy = simulateStatevector(variant.circuit, {
            shots,
            seed: seed + index + 1,
            noise,
        });
        const measured = expectationFromCounts(noisy.counts ?? {}, clbitIndex);
        totalShots += measured.shots;
        points.push({
            noisy: measured.value,
            exact: exactExpectation(variant.circuit, clbitIndex),
            substitutions: variant.substitutions,
        });
    }
    // Least squares through the training pairs.
    const count = points.length;
    const meanNoisy = points.reduce((sum, point) => sum + point.noisy, 0) / count;
    const meanExact = points.reduce((sum, point) => sum + point.exact, 0) / count;
    let covariance = 0;
    let variance = 0;
    for (const point of points) {
        covariance += (point.noisy - meanNoisy) * (point.exact - meanExact);
        variance += (point.noisy - meanNoisy) ** 2;
    }
    // The degenerate case. Least squares would happily divide by this and return a
    // slope determined entirely by shot noise, which looks like a result.
    if (variance < 1e-12) {
        throw new CdrError("The training circuits all produced essentially the same noisy value, so the slope is " +
            "unidentifiable and any fitted line would be shot noise divided by nearly zero. Raise the " +
            "substitution rate or use a circuit with more non-Clifford gates.");
    }
    const slope = covariance / variance;
    const intercept = meanExact - slope * meanNoisy;
    let residual = 0;
    let total = 0;
    for (const point of points) {
        residual += (point.exact - (slope * point.noisy + intercept)) ** 2;
        total += (point.exact - meanExact) ** 2;
    }
    // A constant target makes R^2 undefined, not perfect. Reporting 1 here would
    // be the worst kind of wrong: the regression has learned nothing -- it will
    // return the same value for any input -- and the headline diagnostic would say
    // the fit is flawless. Found while probing a circuit whose observable was
    // invariant under every substitution, where slope and intercept both came out
    // 0 and R^2 read 1.0000.
    const targetIsConstant = total < 1e-12;
    const rSquared = targetIsConstant ? Number.NaN : 1 - residual / total;
    const targetRun = simulateStatevector(circuit, { shots, seed, noise });
    const rawMeasured = expectationFromCounts(targetRun.counts ?? {}, clbitIndex);
    totalShots += rawMeasured.shots;
    const raw = rawMeasured.value;
    const mitigated = slope * raw + intercept;
    const noisyValues = points.map((point) => point.noisy);
    const interpolating = raw >= Math.min(...noisyValues) && raw <= Math.max(...noisyValues);
    if (!interpolating) {
        warnings.push(`The target's noisy value (${raw.toFixed(4)}) lies outside the training range ` +
            `[${Math.min(...noisyValues).toFixed(4)}, ${Math.max(...noisyValues).toFixed(4)}]. The fit is ` +
            "being extrapolated, and the training data does not support it there.");
    }
    if (targetIsConstant) {
        warnings.push("Every training circuit had the same exact value, so the regression is vacuous: it predicts that " +
            "constant for any input and its slope carries no information. R^2 is reported as NaN rather than " +
            "1, because a perfect-looking fit here would be misleading. Pick an observable the Clifford " +
            "substitutions actually change.");
    }
    if (!targetIsConstant && rSquared < 0.9) {
        warnings.push(`R^2 is ${rSquared.toFixed(3)}, so a straight line describes this noise map poorly. The mitigated ` +
            "value inherits that error and should not be quoted as a correction.");
    }
    if (mitigated < -1 || mitigated > 1) {
        warnings.push(`The mitigated value ${mitigated.toFixed(4)} is outside [-1, 1] and so unphysical. It is reported ` +
            "unclamped, because clamping would hide that the regression left the valid range.");
    }
    return {
        method: "cdr",
        raw_value: raw,
        mitigated_value: mitigated,
        slope,
        intercept,
        r_squared: rSquared,
        training_points: points,
        interpolating,
        total_shots: totalShots,
        warnings,
        assumptions: [
            "The map from noisy to exact expectation is linear, and the same for training and target.",
            "Training targets are exact statevector values, so they carry no shot noise.",
            "Training variants are the target circuit with non-Clifford gates snapped to nearest Clifford.",
            "Requires classically computable training values, which bounds circuit size.",
        ],
    };
}
//# sourceMappingURL=clifford-regression.js.map