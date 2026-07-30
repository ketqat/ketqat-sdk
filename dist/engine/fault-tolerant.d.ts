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
export declare const SURFACE_CODE_THRESHOLD = 0.01;
/**
 * Prefactor in p_L = A (p/p_th)^((d+1)/2).
 *
 * 0.03 is the conventional value. It is fitted, not derived, and moving it by a
 * factor of two changes the required distance by about one step.
 */
export declare const SURFACE_CODE_PREFACTOR = 0.03;
export declare const FaultTolerantAssumptionsSchema: z.ZodObject<{
    /** Physical two-qubit gate error rate. */
    physical_error_rate: z.ZodNumber;
    /** Total probability of any logical error across the whole computation. */
    error_budget: z.ZodNumber;
    /** Surface-code cycle time in nanoseconds. */
    cycle_time_ns: z.ZodNumber;
    threshold: z.ZodNumber;
    prefactor: z.ZodNumber;
    /**
     * Physical qubits per logical qubit at distance d, as a multiple of d^2.
     *
     * 2 is the rotated surface code including its measurement qubits. Routing
     * space and magic-state factories are counted separately rather than folded
     * into this number, so a reader can see which part of the footprint is which.
     */
    qubits_per_logical_d_squared: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    physical_error_rate: number;
    error_budget: number;
    cycle_time_ns: number;
    threshold: number;
    prefactor: number;
    qubits_per_logical_d_squared: number;
}, {
    physical_error_rate: number;
    error_budget: number;
    cycle_time_ns: number;
    threshold: number;
    prefactor: number;
    qubits_per_logical_d_squared: number;
}>;
export type FaultTolerantAssumptions = z.infer<typeof FaultTolerantAssumptionsSchema>;
export declare const DEFAULT_FT_ASSUMPTIONS: FaultTolerantAssumptions;
export interface FaultTolerantInput {
    /** Logical qubits the algorithm needs. */
    logical_qubits: number;
    /** T gates, each consuming one distilled magic state. */
    t_count: number;
    /** Toffoli gates, each costing 4 T gates in the standard decomposition. */
    toffoli_count: number;
    /** Logical circuit depth, used as the number of logical cycles. */
    logical_depth: number;
}
export interface SensitivityPoint {
    physical_error_rate: number;
    code_distance: number | null;
    physical_qubits: number | null;
    feasible: boolean;
}
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
export declare const PREFACTOR_MODELS: ReadonlyArray<{
    name: string;
    prefactor: number;
    source: string;
}>;
/**
 * How many logical qubits a layout actually occupies (ketqat-sdk#204).
 *
 * A logical qubit needs somewhere to route to. Lattice surgery moves information by
 * merging and splitting patches, which needs free space adjacent to the data, so a
 * register of n logical qubits does not occupy n patches. Microsoft's resource
 * estimator uses 2n + ceil(sqrt(8n)) + 1 -- verified here against `qdk` 1.30.0, exact
 * at n = 4, 8, 16, 32 and 100 -- and this project used bare n, which is 4 where QDK
 * says 15.
 *
 * That is not a convention difference like the prefactor. Routing space is real
 * hardware, and omitting it understates the algorithm footprint by ~3.75x at small n.
 * Reported rather than silently substituted, because the existing figure is what every
 * stored estimate used and changing its meaning without saying so would make old and
 * new numbers incomparable.
 */
export declare const LAYOUT_MODELS: ReadonlyArray<{
    name: string;
    source: string;
    logicalQubits: (algorithmQubits: number) => number;
}>;
/** The algorithm footprint under each layout convention. */
export interface LayoutSensitivityPoint {
    layout: string;
    source: string;
    logical_qubits: number;
    physical_qubits: number | null;
}
/** The same algorithm costed under each published prefactor. */
export interface ModelSensitivityPoint {
    model: string;
    prefactor: number;
    source: string;
    code_distance: number | null;
    physical_qubits: number | null;
    feasible: boolean;
}
export interface FaultTolerantEstimate {
    feasible: boolean;
    /** Why not, when `feasible` is false. Empty otherwise. */
    reason: string;
    code_distance: number | null;
    physical_qubits: number | null;
    /** Data qubits and measurement qubits for the algorithm's logical qubits. */
    algorithm_physical_qubits: number | null;
    /** Magic states consumed, one per T gate after Toffoli decomposition. */
    magic_state_count: number;
    logical_cycles: number;
    runtime_seconds: number | null;
    /** Achieved total logical error probability at the chosen distance. */
    logical_error_probability: number | null;
    assumptions: FaultTolerantAssumptions;
    /** How the answer moves when the physical error rate does. */
    sensitivity: SensitivityPoint[];
    /**
     * How the answer moves when the *model's* fitted prefactor does.
     *
     * Distinct from `sensitivity` and not a duplicate of it. A user can measure their
     * device's error rate; nobody can measure A. Varying the device parameter while
     * holding a fitted constant fixed reports the uncertainty the user can reduce and
     * hides the one they cannot.
     */
    model_sensitivity: ModelSensitivityPoint[];
    /**
     * The algorithm footprint under each layout convention.
     *
     * Unlike `model_sensitivity`, the entries here are not equally defensible: routing
     * space is real hardware, so the bare-register row is an underestimate rather than an
     * alternative reading. It is retained because it is the figure earlier estimates used.
     */
    layout_sensitivity: LayoutSensitivityPoint[];
    notes: string[];
}
/** Logical error probability per logical qubit per cycle at distance `d`. */
export declare function logicalErrorPerCycle(distance: number, assumptions: FaultTolerantAssumptions): number;
/**
 * Smallest odd distance meeting the budget, or null when none does.
 *
 * The search is bounded. An unbounded loop would spin forever exactly when the
 * physical error rate sits at the threshold, where the suppression factor is 1
 * and no distance ever helps.
 */
export declare function requiredCodeDistance(logicalQubits: number, logicalCycles: number, assumptions: FaultTolerantAssumptions, maxDistance?: number): number | null;
/**
 * Estimate the physical cost of running an algorithm fault-tolerantly.
 *
 * Magic-state factories are counted as magic *states*, not as a factory
 * footprint. Factory sizing depends on a distillation protocol this project has
 * not implemented, and inventing a footprint would be a fabricated number
 * carrying more authority than the rest of the estimate.
 */
export declare function estimateFaultTolerantResources(input: FaultTolerantInput, overrides?: Partial<FaultTolerantAssumptions>): FaultTolerantEstimate;
//# sourceMappingURL=fault-tolerant.d.ts.map