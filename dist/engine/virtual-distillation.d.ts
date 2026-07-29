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
export interface ComplexMatrix {
    /** Row-major real parts. */
    real: number[][];
    /** Row-major imaginary parts. */
    imaginary: number[][];
}
export interface VirtualDistillationResult {
    method: "virtual_distillation";
    copies: number;
    /** Unmitigated expectation, Tr[O rho]. */
    raw_value: number;
    /** Tr[O rho^M] / Tr[rho^M]. */
    mitigated_value: number;
    /** Tr[O |psi><psi|] for the ideal state, when one is supplied. */
    ideal_value?: number;
    raw_error?: number;
    mitigated_error?: number;
    /**
     * Purity of the state VD converges to, Tr[rho^2M]/Tr[rho^M]^2.
     *
     * Reported because it says whether the virtual state is nearly pure -- if it is
     * not, more copies are still buying something; if it is, they are not.
     */
    virtual_purity: number;
    /**
     * Error remaining at large M, estimated by extrapolating in M.
     *
     * Non-zero means a coherent component VD cannot remove. This is the number that
     * distinguishes "needs more copies" from "more copies will not help".
     */
    estimated_error_floor?: number;
    /** Qubits needed on hardware: M copies of an n-qubit register. */
    physical_qubits: number;
    /** Sampling overhead: the denominator Tr[rho^M] shrinks as M grows. */
    sampling_overhead: number;
    warnings: string[];
    assumptions: string[];
}
export declare class VirtualDistillationError extends Error {
}
export declare function multiply(left: ComplexMatrix, right: ComplexMatrix): ComplexMatrix;
/** Tr[A]. Returns the real part, and refuses a non-negligible imaginary trace. */
export declare function trace(matrix: ComplexMatrix): number;
export declare function power(matrix: ComplexMatrix, exponent: number): ComplexMatrix;
export interface VirtualDistillationOptions {
    /** Number of copies, M. */
    copies?: number;
    /** Ideal state's density matrix, when the noiseless answer is known. */
    ideal?: ComplexMatrix;
    /** Qubits in one copy, for the hardware cost figure. */
    qubitsPerCopy?: number;
}
/**
 * Apply virtual distillation to a noisy density matrix.
 *
 * The observable and state are supplied as matrices rather than circuits, because
 * the point of this module is the method's *behaviour* -- how the error falls with
 * M, and where it stops falling -- which a circuit-level interface would obscure
 * behind sampling noise.
 */
export declare function virtualDistillation(observable: ComplexMatrix, noisy: ComplexMatrix, options?: VirtualDistillationOptions): VirtualDistillationResult;
/** Depolarized version of a state: (1 - p) rho + p I/d. */
export declare function depolarize(state: ComplexMatrix, strength: number): ComplexMatrix;
/** Density matrix of a pure state given as amplitudes. */
export declare function densityFromAmplitudes(real: number[], imaginary: number[]): ComplexMatrix;
//# sourceMappingURL=virtual-distillation.d.ts.map