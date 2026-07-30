import { z } from "zod";
/**
 * Physical resource estimation for a surface-code fault-tolerant machine
 * (ketqat-sdk#117).
 *
 * The existing estimator stopped at logical gate counts: T count, Clifford
 * count, Toffoli count. Those are the *input* to a physical estimate, not the
 * estimate. Nothing here previously reported physical qubits, code distance,
 * magic states, runtime, or an error budget.
 *
 * Three rules shape this module.
 *
 * **Above threshold there is no answer.** The surface code only suppresses
 * error when the physical error rate is below the threshold. Above it, adding
 * distance makes things *worse*, and no distance satisfies any budget. That is
 * reported as infeasible with the reason, never as a very large number -- a
 * large number reads as "expensive but possible", which is the opposite of
 * true.
 *
 * **The assumptions are part of the answer.** The prefactor, threshold, cycle
 * time and factory model are all choices, and a different reasonable choice
 * moves the result by more than the precision the number appears to carry. They
 * are returned with every estimate.
 *
 * **A single number without sensitivity is false precision.** The physical
 * qubit count depends on the physical error rate roughly exponentially through
 * the distance, so the estimate is reported alongside what it becomes at
 * neighbouring error rates. A reader who sees only the point estimate will
 * quote it as though it were measured.
 */
/**
 * Surface-code threshold under circuit-level depolarizing noise.
 *
 * ~1% is the standard figure from Fowler et al. (2012). It is a property of the
 * code and decoder, not of this project, and a device at or above it cannot be
 * error-corrected by adding distance.
 */
export const SURFACE_CODE_THRESHOLD = 0.01;
/**
 * Prefactor in p_L = A (p/p_th)^((d+1)/2).
 *
 * 0.03 is the conventional value. It is fitted, not derived, and moving it by a
 * factor of two changes the required distance by about one step.
 */
export const SURFACE_CODE_PREFACTOR = 0.03;
export const FaultTolerantAssumptionsSchema = z.object({
    /** Physical two-qubit gate error rate. */
    physical_error_rate: z.number().min(0).max(1),
    /** Total probability of any logical error across the whole computation. */
    error_budget: z.number().min(0).max(1),
    /** Surface-code cycle time in nanoseconds. */
    cycle_time_ns: z.number().positive(),
    threshold: z.number().min(0).max(1),
    prefactor: z.number().positive(),
    /**
     * Physical qubits per logical qubit at distance d, as a multiple of d^2.
     *
     * 2 is the rotated surface code including its measurement qubits. Routing
     * space and magic-state factories are counted separately rather than folded
     * into this number, so a reader can see which part of the footprint is which.
     */
    qubits_per_logical_d_squared: z.number().positive(),
});
export const DEFAULT_FT_ASSUMPTIONS = {
    physical_error_rate: 1e-3,
    error_budget: 1e-2,
    cycle_time_ns: 1000,
    threshold: SURFACE_CODE_THRESHOLD,
    prefactor: SURFACE_CODE_PREFACTOR,
    qubits_per_logical_d_squared: 2,
};
/**
 * Published values for the prefactor A in p_L = A (p/p_th)^((d+1)/2).
 *
 * A is fitted, not derived. Qualtran's own implementation says of it: "The pre-factor
 * $a$ has no clear provenance." It is nonetheless the difference between one code
 * distance and the next, and distance drives the qubit count quadratically -- so
 * reporting a single distance without saying which A produced it is false precision of
 * exactly the kind the sensitivity curve exists to prevent.
 *
 * Both entries are in use in published tooling. Neither is more correct than the other.
 */
export const PREFACTOR_MODELS = [
    {
        name: "Fowler conventional",
        prefactor: 0.03,
        source: "The conventional value; used by this project's default assumptions.",
    },
    {
        name: "Gidney-Fowler (Qualtran)",
        prefactor: 0.1,
        source: "Qualtran's QECScheme.make_gidney_fowler() default, after Fowler and Gidney (2018), arXiv:1808.06709 section XV.",
    },
];
/** Logical error probability per logical qubit per cycle at distance `d`. */
export function logicalErrorPerCycle(distance, assumptions) {
    const ratio = assumptions.physical_error_rate / assumptions.threshold;
    return assumptions.prefactor * Math.pow(ratio, (distance + 1) / 2);
}
/**
 * Smallest odd distance meeting the budget, or null when none does.
 *
 * The search is bounded. An unbounded loop would spin forever exactly when the
 * physical error rate sits at the threshold, where the suppression factor is 1
 * and no distance ever helps.
 */
export function requiredCodeDistance(logicalQubits, logicalCycles, assumptions, maxDistance = 201) {
    if (assumptions.physical_error_rate >= assumptions.threshold)
        return null;
    if (logicalQubits <= 0 || logicalCycles <= 0)
        return 1;
    const budgetPerQubitCycle = assumptions.error_budget / (logicalQubits * logicalCycles);
    for (let distance = 3; distance <= maxDistance; distance += 2) {
        if (logicalErrorPerCycle(distance, assumptions) <= budgetPerQubitCycle)
            return distance;
    }
    return null;
}
/**
 * Estimate the physical cost of running an algorithm fault-tolerantly.
 *
 * Magic-state factories are counted as magic *states*, not as a factory
 * footprint. Factory sizing depends on a distillation protocol this project has
 * not implemented, and inventing a footprint would be a fabricated number
 * carrying more authority than the rest of the estimate.
 */
export function estimateFaultTolerantResources(input, overrides = {}) {
    const assumptions = FaultTolerantAssumptionsSchema.parse({
        ...DEFAULT_FT_ASSUMPTIONS,
        ...overrides,
    });
    // Each Toffoli costs 4 T gates in the standard decomposition.
    const magicStates = input.t_count + 4 * input.toffoli_count;
    const logicalCycles = Math.max(input.logical_depth, 1);
    const notes = [
        "Surface code under circuit-level depolarizing noise.",
        `Logical error model p_L = ${assumptions.prefactor} (p/${assumptions.threshold})^((d+1)/2), fitted rather than derived.`,
        "Magic states are counted, not costed: distillation factory footprint is not modelled.",
        "Routing and layout overhead beyond the per-logical-qubit patch is not modelled.",
        "Each Toffoli is charged 4 T gates.",
    ];
    const sensitivity = sensitivityCurve(input, assumptions, logicalCycles);
    const modelSensitivity = modelSensitivityCurve(input, assumptions, logicalCycles);
    if (assumptions.physical_error_rate >= assumptions.threshold) {
        return {
            feasible: false,
            reason: `A physical error rate of ${assumptions.physical_error_rate} is at or above the surface-code ` +
                `threshold of ${assumptions.threshold}. Increasing the code distance makes the logical error ` +
                "rate worse, not better, so no distance satisfies any budget. This is not an expensive " +
                "computation; it is an impossible one on this device.",
            code_distance: null,
            physical_qubits: null,
            algorithm_physical_qubits: null,
            magic_state_count: magicStates,
            logical_cycles: logicalCycles,
            runtime_seconds: null,
            logical_error_probability: null,
            assumptions,
            sensitivity,
            model_sensitivity: modelSensitivity,
            notes,
        };
    }
    const distance = requiredCodeDistance(input.logical_qubits, logicalCycles, assumptions);
    if (distance === null) {
        return {
            feasible: false,
            reason: "No code distance within the search bound meets this error budget. The budget is too tight " +
                "for this physical error rate and circuit size; loosen the budget or improve the device.",
            code_distance: null,
            physical_qubits: null,
            algorithm_physical_qubits: null,
            magic_state_count: magicStates,
            logical_cycles: logicalCycles,
            runtime_seconds: null,
            logical_error_probability: null,
            assumptions,
            sensitivity,
            model_sensitivity: modelSensitivity,
            notes,
        };
    }
    const perLogicalQubit = assumptions.qubits_per_logical_d_squared * distance * distance;
    const algorithmQubits = perLogicalQubit * input.logical_qubits;
    // One logical cycle takes `distance` surface-code rounds.
    const runtimeSeconds = (logicalCycles * distance * assumptions.cycle_time_ns) / 1e9;
    const totalError = logicalErrorPerCycle(distance, assumptions) * input.logical_qubits * logicalCycles;
    return {
        feasible: true,
        reason: "",
        code_distance: distance,
        physical_qubits: algorithmQubits,
        algorithm_physical_qubits: algorithmQubits,
        magic_state_count: magicStates,
        logical_cycles: logicalCycles,
        runtime_seconds: runtimeSeconds,
        logical_error_probability: totalError,
        assumptions,
        sensitivity,
        model_sensitivity: modelSensitivity,
        notes,
    };
}
/**
 * The same estimate at neighbouring physical error rates.
 *
 * Reported because the distance enters the qubit count quadratically and the
 * error rate enters the distance logarithmically, so a factor-of-two change in
 * device quality moves the footprint substantially. A point estimate alone
 * invites being quoted as though it were measured.
 */
function sensitivityCurve(input, assumptions, logicalCycles) {
    const factors = [0.25, 0.5, 1, 2, 4];
    return factors.map((factor) => {
        const rate = assumptions.physical_error_rate * factor;
        const scoped = { ...assumptions, physical_error_rate: rate };
        if (rate >= assumptions.threshold) {
            return { physical_error_rate: rate, code_distance: null, physical_qubits: null, feasible: false };
        }
        const distance = requiredCodeDistance(input.logical_qubits, logicalCycles, scoped);
        if (distance === null) {
            return { physical_error_rate: rate, code_distance: null, physical_qubits: null, feasible: false };
        }
        return {
            physical_error_rate: rate,
            code_distance: distance,
            physical_qubits: assumptions.qubits_per_logical_d_squared * distance * distance * input.logical_qubits,
            feasible: true,
        };
    });
}
/**
 * The same algorithm costed under each published prefactor.
 *
 * Deliberately not folded into `sensitivityCurve`. That curve varies a property of the
 * device; this one varies a property of the *model*, and conflating them would suggest
 * the two uncertainties can be reduced the same way. They cannot: buying a better
 * device narrows the first and does nothing to the second.
 */
function modelSensitivityCurve(input, assumptions, logicalCycles) {
    return PREFACTOR_MODELS.map(({ name, prefactor, source }) => {
        const scoped = { ...assumptions, prefactor };
        const distance = assumptions.physical_error_rate >= assumptions.threshold
            ? null
            : requiredCodeDistance(input.logical_qubits, logicalCycles, scoped);
        return {
            model: name,
            prefactor,
            source,
            code_distance: distance,
            physical_qubits: distance === null
                ? null
                : assumptions.qubits_per_logical_d_squared * distance * distance * input.logical_qubits,
            feasible: distance !== null,
        };
    });
}
//# sourceMappingURL=fault-tolerant.js.map