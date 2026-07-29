/**
 * Virtual distillation (ketqat-sdk#180).
 *
 * The last of item 7's named methods. VD suppresses errors without a noise model
 * by computing an expectation against a *virtual* purified state:
 *
 *     <O>_M = Tr[O rho^M] / Tr[rho^M]
 *
 * Raising the density matrix to a power suppresses its small eigenvalues, so the
 * result is dominated by rho's largest eigenvector. On hardware this is realised
 * with M copies of the state and a derangement circuit; here the matrix is
 * available directly, which is what makes the method's behaviour checkable.
 *
 * **The limit is the interesting part, and it is not a caveat -- it is what the
 * method does.** VD converges to the dominant eigenvector of the *noisy* state,
 * which is not the ideal state. Two consequences, and both are measured here
 * rather than asserted:
 *
 * - Under depolarizing noise the ideal state *is* the dominant eigenvector, so VD
 *   converges to the exact noiseless value. Error goes to zero with M.
 * - Under a coherent error -- an over-rotation, say -- the dominant eigenvector is
 *   the *rotated* state. VD converges, but to the wrong answer, and no number of
 *   copies closes the gap. That residual is reported as a floor rather than left
 *   for a user to discover by watching M grow with no improvement.
 *
 * A mitigation that silently stalls is worse than one that declines, so this
 * estimates the floor and says which regime a run is in.
 */
export class VirtualDistillationError extends Error {
}
function dimensionOf(matrix) {
    const rows = matrix.real.length;
    if (rows === 0)
        throw new VirtualDistillationError("An empty matrix is not a density matrix.");
    if (matrix.imaginary.length !== rows) {
        throw new VirtualDistillationError("Real and imaginary parts have different row counts.");
    }
    for (let index = 0; index < rows; index += 1) {
        if (matrix.real[index].length !== rows || matrix.imaginary[index].length !== rows) {
            throw new VirtualDistillationError(`Row ${index} is not square; a density matrix must be n x n.`);
        }
    }
    return rows;
}
export function multiply(left, right) {
    const size = dimensionOf(left);
    if (dimensionOf(right) !== size) {
        throw new VirtualDistillationError("Cannot multiply matrices of different dimension.");
    }
    const real = [];
    const imaginary = [];
    for (let row = 0; row < size; row += 1) {
        const realRow = [];
        const imaginaryRow = [];
        for (let column = 0; column < size; column += 1) {
            let sumReal = 0;
            let sumImaginary = 0;
            for (let k = 0; k < size; k += 1) {
                const ar = left.real[row][k];
                const ai = left.imaginary[row][k];
                const br = right.real[k][column];
                const bi = right.imaginary[k][column];
                sumReal += ar * br - ai * bi;
                sumImaginary += ar * bi + ai * br;
            }
            realRow.push(sumReal);
            imaginaryRow.push(sumImaginary);
        }
        real.push(realRow);
        imaginary.push(imaginaryRow);
    }
    return { real, imaginary };
}
/** Tr[A]. Returns the real part, and refuses a non-negligible imaginary trace. */
export function trace(matrix) {
    const size = dimensionOf(matrix);
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < size; index += 1) {
        real += matrix.real[index][index];
        imaginary += matrix.imaginary[index][index];
    }
    if (Math.abs(imaginary) > 1e-9) {
        throw new VirtualDistillationError(`Trace has an imaginary part (${imaginary.toExponential(2)}); this is not a Hermitian operator.`);
    }
    return real;
}
export function power(matrix, exponent) {
    if (!Number.isInteger(exponent) || exponent < 1) {
        throw new VirtualDistillationError(`Exponent must be a positive integer, got ${exponent}.`);
    }
    let result = matrix;
    for (let index = 1; index < exponent; index += 1) {
        result = multiply(result, matrix);
    }
    return result;
}
/**
 * Apply virtual distillation to a noisy density matrix.
 *
 * The observable and state are supplied as matrices rather than circuits, because
 * the point of this module is the method's *behaviour* -- how the error falls with
 * M, and where it stops falling -- which a circuit-level interface would obscure
 * behind sampling noise.
 */
export function virtualDistillation(observable, noisy, options = {}) {
    const copies = options.copies ?? 2;
    if (!Number.isInteger(copies) || copies < 1) {
        throw new VirtualDistillationError(`copies must be a positive integer, got ${copies}.`);
    }
    const size = dimensionOf(noisy);
    if (dimensionOf(observable) !== size) {
        throw new VirtualDistillationError("The observable and the state have different dimensions.");
    }
    const normalisation = trace(noisy);
    if (Math.abs(normalisation - 1) > 1e-6) {
        throw new VirtualDistillationError(`The state has trace ${normalisation.toFixed(6)}, not 1. An unnormalised state would make every ` +
            "expectation below wrong by that factor, so it is refused rather than silently rescaled.");
    }
    const warnings = [];
    const rawValue = trace(multiply(observable, noisy));
    const powered = power(noisy, copies);
    const denominator = trace(powered);
    if (denominator <= 1e-12) {
        throw new VirtualDistillationError(`Tr[rho^${copies}] is ${denominator.toExponential(2)}, too small to divide by. The state is too ` +
            "mixed for this many copies.");
    }
    const mitigatedValue = trace(multiply(observable, powered)) / denominator;
    const doublePowered = power(noisy, 2 * copies);
    const virtualPurity = trace(doublePowered) / (denominator * denominator);
    const result = {
        method: "virtual_distillation",
        copies,
        raw_value: rawValue,
        mitigated_value: mitigatedValue,
        virtual_purity: virtualPurity,
        // M copies of an n-qubit register, plus nothing else: the derangement circuit
        // acts on those qubits rather than needing ancillas.
        physical_qubits: (options.qubitsPerCopy ?? Math.round(Math.log2(size))) * copies,
        // The estimator divides by Tr[rho^M], which shrinks as M grows, so the
        // variance grows by roughly its inverse. Reported as the cost, since VD is
        // often described as needing "only" M copies.
        sampling_overhead: 1 / denominator,
        warnings,
        assumptions: [
            "Expectation is Tr[O rho^M] / Tr[rho^M], the M-copy virtual-distillation estimator.",
            "Converges to the dominant eigenvector of the NOISY state, which is not the ideal state.",
            "Stochastic error is suppressed; a coherent error is not, at any M.",
            "Cost is M copies of the register plus a sampling overhead of 1 / Tr[rho^M].",
        ],
    };
    if (options.ideal) {
        if (dimensionOf(options.ideal) !== size) {
            throw new VirtualDistillationError("The ideal state has a different dimension from the noisy state.");
        }
        const idealValue = trace(multiply(observable, options.ideal));
        result.ideal_value = idealValue;
        result.raw_error = Math.abs(rawValue - idealValue);
        result.mitigated_error = Math.abs(mitigatedValue - idealValue);
        // Estimate what remains at large M by going further out. If the error stops
        // falling, the residue is a coherent component no number of copies removes --
        // the distinction between "use more copies" and "this will not improve".
        const far = power(noisy, Math.max(copies + 6, 8));
        const farDenominator = trace(far);
        if (farDenominator > 1e-12) {
            const farValue = trace(multiply(observable, far)) / farDenominator;
            const floor = Math.abs(farValue - idealValue);
            result.estimated_error_floor = floor;
            if (floor > 1e-6) {
                warnings.push(`Error does not vanish with more copies: about ${floor.toFixed(4)} remains at high M. That is a ` +
                    "coherent component, and virtual distillation cannot remove it -- it converges to the noisy " +
                    "state's dominant eigenvector, which here is not the ideal state. More copies will not help.");
            }
        }
        if (result.mitigated_error > result.raw_error) {
            warnings.push(`Mitigation made this worse: error rose from ${result.raw_error.toFixed(4)} to ` +
                `${result.mitigated_error.toFixed(4)}. Distilling toward the wrong state moves the estimate ` +
                "away from the ideal one, which is possible whenever the noise is not purely stochastic.");
        }
    }
    if (result.sampling_overhead > 1e3) {
        warnings.push(`A sampling overhead of ${result.sampling_overhead.toExponential(2)} means the denominator ` +
            "Tr[rho^M] is nearly zero, so the estimate is a ratio of two small numbers and its variance is " +
            "large regardless of the bias removed.");
    }
    return result;
}
/** Depolarized version of a state: (1 - p) rho + p I/d. */
export function depolarize(state, strength) {
    const size = dimensionOf(state);
    if (strength < 0 || strength > 1) {
        throw new VirtualDistillationError(`Depolarizing strength must be in [0, 1], got ${strength}.`);
    }
    const real = [];
    const imaginary = [];
    for (let row = 0; row < size; row += 1) {
        const realRow = [];
        const imaginaryRow = [];
        for (let column = 0; column < size; column += 1) {
            const mixed = row === column ? strength / size : 0;
            realRow.push((1 - strength) * state.real[row][column] + mixed);
            imaginaryRow.push((1 - strength) * state.imaginary[row][column]);
        }
        real.push(realRow);
        imaginary.push(imaginaryRow);
    }
    return { real, imaginary };
}
/** Density matrix of a pure state given as amplitudes. */
export function densityFromAmplitudes(real, imaginary) {
    if (real.length !== imaginary.length) {
        throw new VirtualDistillationError("Amplitude arrays have different lengths.");
    }
    const size = real.length;
    const outReal = [];
    const outImaginary = [];
    for (let row = 0; row < size; row += 1) {
        const realRow = [];
        const imaginaryRow = [];
        for (let column = 0; column < size; column += 1) {
            // |psi><psi|, so entry (r, c) is psi_r * conj(psi_c).
            realRow.push(real[row] * real[column] + imaginary[row] * imaginary[column]);
            imaginaryRow.push(imaginary[row] * real[column] - real[row] * imaginary[column]);
        }
        outReal.push(realRow);
        outImaginary.push(imaginaryRow);
    }
    return { real: outReal, imaginary: outImaginary };
}
//# sourceMappingURL=virtual-distillation.js.map