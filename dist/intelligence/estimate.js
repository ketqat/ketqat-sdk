import { z } from "zod";
import { INTELLIGENCE_SCHEMA_VERSION, QuantitySchema, quantity, unknownQuantity, } from "./measurement.js";
import { INTELLIGENCE_ESTIMATOR, INTELLIGENCE_ESTIMATOR_VERSION, } from "./scenario.js";
import { logicalErrorPerCycle, requiredCodeDistance, } from "../engine/fault-tolerant.js";
import { requiredLevels } from "../engine/distillation.js";
/**
 * Costing one workload under one scenario (ketqat-sdk#236).
 *
 * Everything here composes the existing engine rather than reimplementing it:
 * `requiredCodeDistance` and `logicalErrorPerCycle` from `engine/fault-tolerant`
 * and `requiredLevels` from `engine/distillation`. A second implementation of
 * the same arithmetic would drift from the Workbench panel, and the first
 * symptom would be two pages of this product disagreeing about one circuit.
 *
 * Four things this module does that the engine underneath deliberately does not:
 *
 * **It separates three footprints that are routinely reported as one.** The
 * algorithm's own patches, the routing space a lattice-surgery layout needs, and
 * the distillation factory are computed and reported apart. Their sum is the
 * machine; none of them alone is, and the largest is frequently the factory.
 *
 * **It refuses to total an unknown.** If distillation cannot reach the target
 * state error, the factory footprint is not computable, so the total is reported
 * `UNKNOWN` rather than as the algorithm footprint with a footnote. A total that
 * silently omits its largest term is the specific failure this product exists to
 * prevent.
 *
 * **It costs time twice.** A computation is limited either by how fast logical
 * cycles run or by how fast magic states arrive, and which one binds is the
 * actionable output. Reporting only the cycle-limited runtime attributes a
 * factory bottleneck to the wrong subsystem.
 *
 * **Sensitivity is an output, not an appendix.** Six parameters are varied and
 * reported alongside the point estimate, because the spread across reasonable
 * choices is usually wider than the precision the point estimate appears to
 * carry.
 */
export const InfeasibilityCodeSchema = z.enum([
    "ABOVE_SURFACE_CODE_THRESHOLD",
    "NO_DISTANCE_MEETS_BUDGET",
    "DISTILLATION_FIXED_POINT_EXCEEDED",
]);
export const SensitivityParameterSchema = z.enum([
    "PHYSICAL_ERROR_RATE",
    "LOGICAL_ERROR_PREFACTOR",
    "LAYOUT_MODEL",
    "CYCLE_TIME",
    "ERROR_BUDGET",
    "RAW_MAGIC_STATE_ERROR",
]);
export const EstimateSensitivityPointSchema = z.object({
    parameter: SensitivityParameterSchema,
    /** Human-readable value of the varied parameter: "1e-4", "Bare register". */
    label: z.string().min(1),
    /** Numeric value where the parameter is numeric; null for categorical ones. */
    value: z.number().nullable(),
    /** Ratio to the point estimate's value, so the spread is legible without arithmetic. */
    relative_to_base: z.number().nullable(),
    feasible: z.boolean(),
    code_distance: z.number().int().nullable(),
    total_physical_qubits: z.number().nullable(),
    runtime: z.number().nullable(),
});
export const RuntimeLimiterSchema = z.enum([
    "LOGICAL_CYCLES",
    "MAGIC_STATE_THROUGHPUT",
    "NOT_DETERMINED",
]);
export const ResourceEstimateSnapshotSchema = z.object({
    schema_version: z.string().min(1),
    scenario_name: z.string().min(1),
    scenario_preset: z.string().min(1),
    scenario_revision: z.number().int().positive(),
    workload_name: z.string().min(1),
    is_demo: z.boolean(),
    feasible: z.boolean(),
    infeasibility_code: InfeasibilityCodeSchema.nullable(),
    /** Present when infeasible. Explains why no distance helps, rather than giving a large number. */
    infeasibility_reason: z.string().nullable(),
    // Logical resources, restated so the estimate stands alone as a record.
    logical_qubits: QuantitySchema,
    circuit_depth: QuantitySchema,
    gate_count: QuantitySchema,
    one_qubit_gate_count: QuantitySchema,
    two_qubit_gate_count: QuantitySchema,
    clifford_count: QuantitySchema,
    t_count: QuantitySchema,
    toffoli_count: QuantitySchema,
    unsupported_gate_count: QuantitySchema,
    measurement_count: QuantitySchema,
    reset_count: QuantitySchema,
    conditional_count: QuantitySchema,
    // Fault-tolerant resources.
    code_distance: QuantitySchema,
    logical_cycles: QuantitySchema,
    magic_state_count: QuantitySchema,
    raw_magic_state_input_count: QuantitySchema,
    distillation_levels: QuantitySchema,
    /** The algorithm's own patches. Not the machine size. */
    algorithm_physical_qubits: QuantitySchema,
    /** Algorithm patches plus routing space under the scenario's layout model. */
    layout_adjusted_physical_qubits: QuantitySchema,
    factory_physical_qubits: QuantitySchema,
    /** Layout-adjusted plus factory. The machine. */
    total_physical_qubits: QuantitySchema,
    factory_share: QuantitySchema,
    /** Logical qubit patches occupied including routing, under the layout model. */
    occupied_logical_qubits: QuantitySchema,
    // Time.
    runtime: QuantitySchema,
    runtime_cycle_limited: QuantitySchema,
    runtime_factory_limited: QuantitySchema,
    runtime_limiter: RuntimeLimiterSchema,
    magic_state_throughput: QuantitySchema,
    // Error.
    achieved_logical_error_probability: QuantitySchema,
    error_budget: QuantitySchema,
    sensitivity: z.array(EstimateSensitivityPointSchema),
    exact_arithmetic: z.array(z.string().min(1)),
    model_assumptions: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
});
/** Logical qubit patches a register occupies, including routing space. */
export function occupiedLogicalQubits(algorithmQubits, layout) {
    if (layout === "BARE_REGISTER")
        return algorithmQubits;
    // 2n + ceil(sqrt(8n)) + 1, after Beverland et al. (2022), arXiv:2211.07629.
    // Verified against Microsoft's qdk 1.30.0 estimator at n = 4, 8, 16, 32, 100.
    return 2 * algorithmQubits + Math.ceil(Math.sqrt(8 * algorithmQubits)) + 1;
}
export function evaluate(workload, scenario) {
    const { logical } = workload;
    const magicStates = logical.t_count + scenario.decomposition.toffoli_t_cost * logical.toffoli_count;
    /**
     * A T count of zero means two different things, and only one of them is zero.
     *
     * A Clifford-only circuit needs no magic states: the zero is a measurement.
     * A circuit whose gates are neither Clifford nor T has a T count nobody has
     * computed: the zero is an absence. Before this distinction existed, the
     * second case reported "this circuit consumes no magic states, so it needs no
     * distillation factory at all" and a factory footprint of 0 -- a fabricated
     * reassurance about a circuit whose fault-tolerant cost is unknown.
     *
     * Found by building a real reference case that exercises the refusal path
     * (ketqat-web#305).
     */
    const magicStatesUndetermined = magicStates === 0 && logical.unsupported_for_ft_count > 0;
    const logicalCycles = Math.max(logical.circuit_depth, 1);
    const occupiedLogical = occupiedLogicalQubits(logical.logical_qubits, scenario.layout_model);
    const assumptions = {
        physical_error_rate: scenario.hardware.physical_error_rate,
        error_budget: scenario.error_budget,
        cycle_time_ns: scenario.hardware.cycle_time_ns,
        threshold: scenario.qec.threshold,
        prefactor: scenario.qec.prefactor,
        qubits_per_logical_d_squared: scenario.qec.qubits_per_logical_d_squared,
    };
    const base = {
        logicalCycles,
        magicStates,
        magicStatesUndetermined,
        occupiedLogical,
        distillationLevels: 0,
        rawInputStates: null,
        distillationReachedTarget: true,
        distillationReason: "",
    };
    if (scenario.hardware.physical_error_rate >= scenario.qec.threshold) {
        return {
            ...base,
            feasible: false,
            infeasibilityCode: "ABOVE_SURFACE_CODE_THRESHOLD",
            infeasibilityReason: `A physical error rate of ${scenario.hardware.physical_error_rate} is at or above the ` +
                `${scenario.qec.scheme} threshold of ${scenario.qec.threshold}. Increasing the code distance makes the ` +
                "logical error rate worse, not better, so no distance satisfies any budget. This is not an expensive " +
                "computation on this device; it is an impossible one.",
            codeDistance: null,
            algorithmPhysical: null,
            layoutAdjustedPhysical: null,
            factoryPhysical: null,
            totalPhysical: null,
            factoryShare: null,
            runtimeCycleLimited: null,
            runtimeFactoryLimited: null,
            runtime: null,
            runtimeLimiter: "NOT_DETERMINED",
            throughputStatesPerSecond: null,
            achievedLogicalError: null,
            distillationReason: "Not evaluated: the device is above threshold.",
        };
    }
    const distance = requiredCodeDistance(logical.logical_qubits, logicalCycles, assumptions);
    if (distance === null) {
        return {
            ...base,
            feasible: false,
            infeasibilityCode: "NO_DISTANCE_MEETS_BUDGET",
            infeasibilityReason: "No code distance within the search bound meets this error budget. The budget is too tight for this " +
                "physical error rate and circuit size; loosen the budget or improve the device.",
            codeDistance: null,
            algorithmPhysical: null,
            layoutAdjustedPhysical: null,
            factoryPhysical: null,
            totalPhysical: null,
            factoryShare: null,
            runtimeCycleLimited: null,
            runtimeFactoryLimited: null,
            runtime: null,
            runtimeLimiter: "NOT_DETERMINED",
            throughputStatesPerSecond: null,
            achievedLogicalError: null,
            distillationReason: "Not evaluated: no code distance meets the error budget.",
        };
    }
    const perPatch = (d) => scenario.qec.qubits_per_logical_d_squared * d * d;
    const algorithmPhysical = perPatch(distance) * logical.logical_qubits;
    const layoutAdjustedPhysical = perPatch(distance) * occupiedLogical;
    const needsFactory = magicStates > 0 && scenario.factory.protocol !== "NONE";
    const factoryDistance = scenario.factory.factory_distance ?? distance;
    let factoryPhysical = 0;
    let rawInputStates = 0;
    let levels = 0;
    let reachedTarget = true;
    let distillationReason = "This circuit consumes no magic states, so no factory is needed.";
    if (magicStatesUndetermined) {
        // Not zero -- unknown. Everything downstream of the magic-state count is
        // therefore unknown too, including the total machine size.
        factoryPhysical = null;
        rawInputStates = null;
        reachedTarget = false;
        distillationReason =
            `${logical.unsupported_for_ft_count} gate(s) are neither Clifford nor T and the circuit records no T or ` +
                "Toffoli gates, so the magic-state demand is undetermined rather than zero. No factory can be sized, and " +
                "no total machine size follows, until those gates are synthesized into a Clifford+T basis.";
    }
    else if (needsFactory) {
        const distillation = requiredLevels(scenario.factory.raw_state_error, scenario.factory.target_state_error);
        levels = distillation.levels;
        reachedTarget = distillation.reachedTarget;
        distillationReason = distillation.reason;
        if (reachedTarget) {
            rawInputStates = magicStates * distillation.statesPerOutput;
            factoryPhysical =
                levels * 15 * perPatch(factoryDistance) * scenario.factory.parallel_factories;
        }
        else {
            // The factory cannot be sized, so it is not sized. Reporting the algorithm
            // footprint as a total here would omit the term that usually dominates it.
            rawInputStates = null;
            factoryPhysical = null;
        }
    }
    const totalPhysical = factoryPhysical === null ? null : layoutAdjustedPhysical + factoryPhysical;
    const factoryShare = factoryPhysical === null || totalPhysical === null || totalPhysical === 0
        ? null
        : factoryPhysical / totalPhysical;
    const cycleSeconds = scenario.hardware.cycle_time_ns / 1e9;
    // One logical cycle takes `distance` surface-code rounds.
    const runtimeCycleLimited = logicalCycles * distance * cycleSeconds;
    let throughput = null;
    let runtimeFactoryLimited = null;
    if (needsFactory && reachedTarget) {
        const secondsPerState = scenario.factory.rounds_per_distillation * cycleSeconds;
        throughput = scenario.factory.parallel_factories / secondsPerState;
        runtimeFactoryLimited = magicStates / throughput;
    }
    else if (!needsFactory && !magicStatesUndetermined) {
        runtimeFactoryLimited = 0;
    }
    const runtime = runtimeFactoryLimited === null ? null : Math.max(runtimeCycleLimited, runtimeFactoryLimited);
    const runtimeLimiter = runtimeFactoryLimited === null
        ? "NOT_DETERMINED"
        : runtimeFactoryLimited > runtimeCycleLimited
            ? "MAGIC_STATE_THROUGHPUT"
            : "LOGICAL_CYCLES";
    const achievedLogicalError = logicalErrorPerCycle(distance, assumptions) * logical.logical_qubits * logicalCycles;
    return {
        ...base,
        feasible: true,
        infeasibilityCode: null,
        infeasibilityReason: null,
        codeDistance: distance,
        algorithmPhysical,
        layoutAdjustedPhysical,
        factoryPhysical,
        totalPhysical,
        factoryShare,
        distillationLevels: levels,
        rawInputStates,
        distillationReachedTarget: reachedTarget,
        distillationReason,
        runtimeCycleLimited,
        runtimeFactoryLimited,
        runtime,
        runtimeLimiter,
        throughputStatesPerSecond: throughput,
        achievedLogicalError,
    };
}
const MODEL = INTELLIGENCE_ESTIMATOR;
const VERSION = INTELLIGENCE_ESTIMATOR_VERSION;
function countQuantity(value, unit, workload) {
    return quantity({
        value,
        unit,
        evidence: workload.logical_counts_evidence,
        source: `Workload '${workload.name}', source kind ${workload.source.kind}.`,
        model: MODEL,
        modelVersion: VERSION,
        assumptions: [`Gate set: ${workload.gate_set.join(", ") || "unstated"}.`],
        limitations: workload.logical.unsupported_for_ft_count > 0
            ? [
                `${workload.logical.unsupported_for_ft_count} gate(s) are neither Clifford nor T, so counts derived ` +
                    "from the T count are an underestimate until those are synthesized.",
            ]
            : [],
    });
}
function scenarioAssumptions(scenario) {
    return [
        `Physical error rate ${scenario.hardware.physical_error_rate} (${scenario.hardware.basis}).`,
        `Surface-code cycle ${scenario.hardware.cycle_time_ns} ns.`,
        `${scenario.qec.scheme}, threshold ${scenario.qec.threshold}, prefactor ${scenario.qec.prefactor} (${scenario.qec.prefactor_model}).`,
        `Error budget ${scenario.error_budget} across the whole computation.`,
        `Layout model ${scenario.layout_model}.`,
        `Factory ${scenario.factory.protocol}, raw state error ${scenario.factory.raw_state_error}, target ${scenario.factory.target_state_error}.`,
        `One Toffoli charged ${scenario.decomposition.toffoli_t_cost} T gates.`,
    ];
}
function sensitivityFor(workload, scenario, base) {
    const points = [];
    const relative = (value) => value === null || base.totalPhysical === null || base.totalPhysical === 0
        ? null
        : value / base.totalPhysical;
    const push = (parameter, label, value, result) => {
        points.push({
            parameter,
            label,
            value,
            relative_to_base: relative(result.totalPhysical),
            feasible: result.feasible,
            code_distance: result.codeDistance,
            total_physical_qubits: result.totalPhysical,
            runtime: result.runtime,
        });
    };
    for (const factor of [0.25, 0.5, 1, 2, 4]) {
        const rate = scenario.hardware.physical_error_rate * factor;
        push("PHYSICAL_ERROR_RATE", rate.toExponential(2), rate, evaluate(workload, {
            ...scenario,
            hardware: { ...scenario.hardware, physical_error_rate: rate },
        }));
    }
    // Varies a property of the *model*, not of the device. Kept apart from the
    // error-rate curve because buying a better machine narrows one and does
    // nothing to the other.
    for (const [name, prefactor] of [
        ["Fowler conventional", 0.03],
        ["Gidney-Fowler (Qualtran)", 0.1],
    ]) {
        push("LOGICAL_ERROR_PREFACTOR", name, prefactor, evaluate(workload, {
            ...scenario,
            qec: { ...scenario.qec, prefactor, prefactor_model: name },
        }));
    }
    for (const layout of ["BARE_REGISTER", "LATTICE_SURGERY_2D"]) {
        push("LAYOUT_MODEL", layout, null, evaluate(workload, { ...scenario, layout_model: layout }));
    }
    for (const factor of [0.25, 0.5, 1, 2, 4]) {
        const cycle = scenario.hardware.cycle_time_ns * factor;
        push("CYCLE_TIME", `${cycle} ns`, cycle, evaluate(workload, {
            ...scenario,
            hardware: { ...scenario.hardware, cycle_time_ns: cycle },
        }));
    }
    for (const factor of [0.1, 1, 10]) {
        const budget = Math.min(scenario.error_budget * factor, 0.999);
        push("ERROR_BUDGET", budget.toExponential(2), budget, evaluate(workload, {
            ...scenario,
            error_budget: budget,
        }));
    }
    for (const factor of [0.1, 1, 10]) {
        const raw = Math.min(scenario.factory.raw_state_error * factor, 0.999);
        if (raw <= scenario.factory.target_state_error)
            continue;
        push("RAW_MAGIC_STATE_ERROR", raw.toExponential(2), raw, evaluate(workload, {
            ...scenario,
            factory: { ...scenario.factory, raw_state_error: raw },
        }));
    }
    return points;
}
/**
 * Cost one workload under one scenario, with every number in its envelope.
 *
 * Deterministic: the same workload and the same scenario always produce the same
 * snapshot, which is what makes the bundle hash meaningful.
 */
export function estimateForScenario(workload, scenario) {
    const core = evaluate(workload, scenario);
    const assumptions = scenarioAssumptions(scenario);
    const sensitivity = sensitivityFor(workload, scenario, core);
    const derived = (value, unit, source, options = {}) => {
        if (value === null) {
            return unknownQuantity(unit, source, MODEL, VERSION);
        }
        let uncertainty;
        if (options.uncertaintyFrom) {
            const scoped = sensitivity.filter((point) => point.parameter === options.uncertaintyFrom && point.total_physical_qubits !== null);
            const values = scoped.map((point) => point.total_physical_qubits);
            if (values.length > 0) {
                uncertainty = {
                    kind: options.uncertaintyFrom === "LOGICAL_ERROR_PREFACTOR"
                        ? "MODEL_SPREAD"
                        : "SENSITIVITY_RANGE",
                    low: Math.min(...values),
                    high: Math.max(...values),
                    basis: `Varying ${options.uncertaintyFrom.toLowerCase().replace(/_/g, " ")} across the reported range.`,
                };
            }
        }
        return quantity({
            value,
            unit,
            evidence: "MODELLED",
            source,
            model: MODEL,
            modelVersion: VERSION,
            assumptions,
            limitations: options.limitations ?? [],
            ...(uncertainty ? { uncertainty } : {}),
        });
    };
    const notComputable = (reason) => reason;
    const modelAssumptions = [
        `${scenario.qec.scheme} under circuit-level depolarizing noise.`,
        `Logical error model p_L = ${scenario.qec.prefactor} (p/${scenario.qec.threshold})^((d+1)/2), fitted rather than derived.`,
        `${scenario.qec.qubits_per_logical_d_squared} d^2 physical qubits per logical patch.`,
        "One logical cycle occupies `distance` surface-code rounds.",
        "The error budget is allocated across the algorithm's own logical qubits. Routing patches are charged for " +
            "space but not against the budget, which understates the required distance for routing-heavy layouts.",
        scenario.factory.protocol === "FIFTEEN_TO_ONE"
            ? "Factory footprint model: 15 logical patches per distillation level at the factory distance. A reading of " +
                "the standard construction, not a measured or published figure."
            : "No magic-state factory is modelled in this scenario.",
        `Factory throughput model: one distilled state per ${scenario.factory.rounds_per_distillation} surface-code ` +
            `rounds per factory, with ${scenario.factory.parallel_factories} factory(ies) in parallel. A model, not a measurement.`,
        "Only the leading order of the 15-to-1 error polynomial is used.",
    ];
    const warnings = [];
    if (core.feasible && !core.distillationReachedTarget && core.magicStates > 0) {
        warnings.push(core.distillationReason);
        warnings.push("The factory footprint could not be computed, so no total machine size is reported. The algorithm figure " +
            "below is a component of the requirement, not the requirement.");
    }
    if (core.factoryShare !== null && core.factoryShare > 0.5) {
        warnings.push(`The magic-state factory is ${(core.factoryShare * 100).toFixed(0)}% of the machine -- larger than the ` +
            "algorithm it feeds. A T count reported without this footprint understates the hardware requirement here " +
            "by more than a factor of two.");
    }
    if (workload.logical.unsupported_for_ft_count > 0) {
        warnings.push(`${workload.logical.unsupported_for_ft_count} gate(s) are neither Clifford nor T. Every figure derived from ` +
            "the T count is an underestimate until they are synthesized into a Clifford+T basis.");
    }
    if (core.magicStatesUndetermined) {
        warnings.push("The magic-state demand is undetermined, not zero: every gate that would contribute to it is still " +
            "un-synthesized. No factory footprint, no total machine size and no runtime are reported, because each " +
            "would be a number invented to fill the gap.");
    }
    else if (core.magicStates === 0) {
        warnings.push("This circuit consumes no magic states, so it needs no distillation factory at all. The factory footprint " +
            "is zero because there is no factory, not because one was assumed to be free.");
    }
    if (scenario.hardware.basis === "ROADMAP") {
        warnings.push("The hardware parameters come from a published roadmap, not an observation. Every figure below is " +
            "conditional on that roadmap being met.");
    }
    if (workload.is_demo) {
        warnings.push("This is a demonstration fixture. It is not evidence about any real workload, device, or organisation.");
    }
    const exactArithmetic = [
        // "0 T + 4 x 0 Toffoli = 0" is arithmetic that is technically correct and
        // reads as a finding. When the gates that would contribute have not been
        // synthesized, the sum is not zero -- it is unavailable, and printing the
        // zero puts it back on the page the fix above removed it from.
        core.magicStatesUndetermined
            ? `Magic states: not computed. ${workload.logical.unsupported_for_ft_count} gate(s) that would ` +
                "contribute are neither Clifford nor T and have not been synthesized."
            : `Magic states: ${workload.logical.t_count} T + ${scenario.decomposition.toffoli_t_cost} x ` +
                `${workload.logical.toffoli_count} Toffoli = ${core.magicStates}.`,
        `Logical cycles: max(depth ${workload.logical.circuit_depth}, 1) = ${core.logicalCycles}.`,
        `Occupied logical patches under ${scenario.layout_model}: ${core.occupiedLogical} ` +
            `(algorithm register ${workload.logical.logical_qubits}).`,
    ];
    if (core.codeDistance !== null) {
        exactArithmetic.push(`Per-patch footprint: ${scenario.qec.qubits_per_logical_d_squared} x ${core.codeDistance}^2 = ` +
            `${scenario.qec.qubits_per_logical_d_squared * core.codeDistance * core.codeDistance} physical qubits.`);
        exactArithmetic.push(`Cycle-limited runtime: ${core.logicalCycles} cycles x ${core.codeDistance} rounds x ` +
            `${scenario.hardware.cycle_time_ns} ns = ${(core.runtimeCycleLimited ?? 0).toExponential(3)} s.`);
    }
    if (core.magicStates > 0 && core.distillationReachedTarget) {
        exactArithmetic.push(`Distillation: ${core.distillationLevels} level(s) of 15-to-1, ${15 ** core.distillationLevels} raw states ` +
            `per output, ${core.rawInputStates} raw states total.`);
    }
    return ResourceEstimateSnapshotSchema.parse({
        schema_version: INTELLIGENCE_SCHEMA_VERSION,
        scenario_name: scenario.name,
        scenario_preset: scenario.preset,
        scenario_revision: scenario.revision,
        workload_name: workload.name,
        is_demo: workload.is_demo,
        feasible: core.feasible,
        infeasibility_code: core.infeasibilityCode,
        infeasibility_reason: core.infeasibilityReason,
        logical_qubits: countQuantity(workload.logical.logical_qubits, "logical qubits", workload),
        circuit_depth: countQuantity(workload.logical.circuit_depth, "layers", workload),
        gate_count: countQuantity(workload.logical.gate_count, "gates", workload),
        one_qubit_gate_count: countQuantity(workload.logical.one_qubit_gate_count, "gates", workload),
        two_qubit_gate_count: countQuantity(workload.logical.two_qubit_gate_count, "gates", workload),
        clifford_count: countQuantity(workload.logical.clifford_count, "gates", workload),
        t_count: countQuantity(workload.logical.t_count, "gates", workload),
        toffoli_count: countQuantity(workload.logical.toffoli_count, "gates", workload),
        unsupported_gate_count: countQuantity(workload.logical.unsupported_for_ft_count, "gates", workload),
        measurement_count: countQuantity(workload.logical.measurement_count, "measurements", workload),
        reset_count: countQuantity(workload.logical.reset_count, "resets", workload),
        conditional_count: countQuantity(workload.logical.conditional_count, "conditionals", workload),
        code_distance: derived(core.codeDistance, "code distance", core.infeasibilityReason ?? "Smallest odd distance whose logical error rate meets the per-qubit-per-cycle budget."),
        logical_cycles: derived(core.logicalCycles, "cycles", "Circuit depth, floored at one."),
        magic_state_count: derived(core.magicStatesUndetermined ? null : core.magicStates, "magic states", core.magicStatesUndetermined
            ? notComputable(core.distillationReason)
            : `T count plus ${scenario.decomposition.toffoli_t_cost} per Toffoli.`),
        raw_magic_state_input_count: derived(core.rawInputStates, "raw states", core.distillationReachedTarget
            ? `Magic states x 15^${core.distillationLevels}, the 15-to-1 input multiplier.`
            : notComputable(`Not computed: ${core.distillationReason}`)),
        distillation_levels: derived(core.magicStates > 0 && !core.distillationReachedTarget ? null : core.distillationLevels, "levels", core.distillationReason),
        algorithm_physical_qubits: derived(core.algorithmPhysical, "physical qubits", core.infeasibilityReason ?? "The algorithm register's own patches. Excludes routing space and the factory.", {
            limitations: [
                "This is not the machine size. Routing space and the magic-state factory are counted separately below.",
            ],
        }),
        layout_adjusted_physical_qubits: derived(core.layoutAdjustedPhysical, "physical qubits", core.infeasibilityReason ?? `Algorithm patches plus routing space under ${scenario.layout_model}.`, {
            limitations: ["Excludes the magic-state factory."],
            uncertaintyFrom: "LAYOUT_MODEL",
        }),
        factory_physical_qubits: derived(core.factoryPhysical, "physical qubits", core.factoryPhysical === null
            ? notComputable(`Not computed: ${core.distillationReason}`)
            : core.magicStates === 0 && !core.magicStatesUndetermined
                ? "No factory: this circuit consumes no magic states."
                : `${core.distillationLevels} level(s) x 15 patches x ${scenario.factory.parallel_factories} factory(ies).`),
        total_physical_qubits: derived(core.totalPhysical, "physical qubits", core.totalPhysical === null
            ? notComputable(core.feasible
                ? `Not computed: the factory could not be sized. ${core.distillationReason}`
                : core.infeasibilityReason)
            : "Layout-adjusted algorithm footprint plus factory footprint.", { uncertaintyFrom: "PHYSICAL_ERROR_RATE" }),
        factory_share: derived(core.factoryShare, "fraction", core.factoryShare === null
            ? notComputable("Not computed: the factory could not be sized.")
            : "Factory physical qubits divided by total physical qubits."),
        occupied_logical_qubits: derived(core.occupiedLogical, "logical qubits", `Logical patches occupied under ${scenario.layout_model}, including routing space.`, { uncertaintyFrom: "LAYOUT_MODEL" }),
        runtime: derived(core.runtime, "s", core.runtime === null
            ? notComputable(core.infeasibilityReason ?? `Not computed: ${core.distillationReason}`)
            : core.runtimeLimiter === "MAGIC_STATE_THROUGHPUT"
                ? "Limited by magic-state throughput, not by logical cycles."
                : "Limited by logical cycles.", { uncertaintyFrom: "CYCLE_TIME" }),
        runtime_cycle_limited: derived(core.runtimeCycleLimited, "s", core.runtimeCycleLimited === null
            ? notComputable(core.infeasibilityReason)
            : "Logical cycles x code distance x surface-code cycle time."),
        runtime_factory_limited: derived(core.runtimeFactoryLimited, "s", core.runtimeFactoryLimited === null
            ? notComputable(`Not computed: ${core.distillationReason}`)
            : core.magicStates === 0 && !core.magicStatesUndetermined
                ? "Zero: no magic states are consumed."
                : "Magic states divided by factory throughput."),
        runtime_limiter: core.runtimeLimiter,
        magic_state_throughput: derived(core.throughputStatesPerSecond, "states/s", core.throughputStatesPerSecond === null
            ? notComputable(core.magicStates === 0 && !core.magicStatesUndetermined
                ? "No factory: this circuit consumes no magic states."
                : `Not computed: ${core.distillationReason}`)
            : `${scenario.factory.parallel_factories} factory(ies), one state per ` +
                `${scenario.factory.rounds_per_distillation} rounds.`),
        achieved_logical_error_probability: derived(core.achievedLogicalError, "probability", core.achievedLogicalError === null
            ? notComputable(core.infeasibilityReason)
            : "Per-qubit-per-cycle logical error at the chosen distance, times logical qubits times cycles."),
        error_budget: quantity({
            value: scenario.error_budget,
            unit: "probability",
            evidence: "USER_PROVIDED",
            source: `Scenario '${scenario.name}' error budget.`,
            model: MODEL,
            modelVersion: VERSION,
            assumptions: ["Total probability of any logical error across the whole computation."],
            limitations: [],
        }),
        sensitivity,
        exact_arithmetic: exactArithmetic,
        model_assumptions: modelAssumptions,
        warnings,
    });
}
//# sourceMappingURL=estimate.js.map