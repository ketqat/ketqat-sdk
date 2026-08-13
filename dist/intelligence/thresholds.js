import { z } from "zod";
import { INTELLIGENCE_SCHEMA_VERSION, QuantitySchema, quantity, unknownQuantity, } from "./measurement.js";
import { INTELLIGENCE_ESTIMATOR, INTELLIGENCE_ESTIMATOR_VERSION } from "./scenario.js";
import { evaluate } from "./estimate.js";
import { INSUFFICIENT_ECONOMIC_EVIDENCE } from "./baseline.js";
/**
 * What would have to be true (ketqat-sdk#236).
 *
 * A resource estimate answers "how much". It does not answer the question people
 * actually bring, which is "under what conditions would this be worth doing".
 * That question has an answer that does not require predicting the future: given
 * this algorithm and these assumptions, a device must reach *these* parameters.
 * Whether and when any device does is a separate matter, and this module does
 * not speculate about it.
 *
 * This is deliberately not a date. "Quantum wins in 2030" requires a hardware
 * forecast, and a forecast dressed as a calculation is the single most
 * misleading thing this product could emit. "A surface-code cycle below 420 ns
 * would be required to beat the supplied classical runtime" is checkable,
 * falsifiable, and useful, and it stays true regardless of what any vendor ships.
 *
 * **Economic thresholds are gated on evidence, structurally.** Every one of them
 * needs both a classical baseline and a stated quantum cost. Absent either, the
 * threshold is `UNKNOWN` and carries the name of the missing input. There is no
 * default price for a fault-tolerant quantum computer in this file, because
 * there is no such price in the world.
 */
export const ThresholdRefusalSchema = z.enum([
    "NO_CLASSICAL_BASELINE",
    "NO_CLASSICAL_RUNTIME",
    "NO_CLASSICAL_COST",
    "NO_ECONOMIC_MODEL",
    "NO_MACHINE_COST_RATE",
    "NO_HARDWARE_CAPACITY",
    "NO_RUNTIME_TARGET",
    "ESTIMATE_INFEASIBLE",
    "FACTORY_NOT_SIZED",
]);
export const AdvantageThresholdSchema = z.object({
    schema_version: z.string().min(1),
    scenario_name: z.string().min(1),
    scenario_revision: z.number().int().positive(),
    // --- Technical conditions. Computable from a feasible estimate alone. ---
    /** Highest physical error rate at which any distance still meets the budget. */
    max_physical_error_rate: QuantitySchema,
    /** Highest physical error rate whose machine still fits the stated capacity. */
    max_physical_error_rate_within_capacity: QuantitySchema,
    /** Distance the error budget forces at the scenario's error rate. */
    required_code_distance: QuantitySchema,
    /** Slowest surface-code cycle still meeting the scenario's runtime target. */
    max_cycle_time_for_runtime_target: QuantitySchema,
    /** Slowest factory still meeting the scenario's runtime target. */
    min_factory_throughput_for_runtime_target: QuantitySchema,
    required_logical_qubit_capacity: QuantitySchema,
    required_total_physical_qubit_capacity: QuantitySchema,
    /** Available capacity divided by required. Below 1 means the machine is too small. */
    capacity_headroom: QuantitySchema,
    // --- Economic conditions. Refused unless baseline and cost model both exist. ---
    /** Slowest cycle still beating the measured classical runtime. The "420 ns" number. */
    max_cycle_time_to_beat_classical_runtime: QuantitySchema,
    /** Speedup this scenario would deliver against the classical baseline. */
    runtime_speedup_over_classical: QuantitySchema,
    max_machine_cost_per_second: QuantitySchema,
    max_physical_qubit_second_cost: QuantitySchema,
    break_even_runtime: QuantitySchema,
    break_even_machine_cost_per_second: QuantitySchema,
    projected_quantum_cost: QuantitySchema,
    /** Projected quantum cost divided by classical cost. Below 1 favours quantum. */
    cost_ratio_to_classical: QuantitySchema,
    /** Machine-readable reasons any threshold above is UNKNOWN. */
    refusals: z.array(z.object({
        threshold: z.string().min(1),
        code: ThresholdRefusalSchema,
        message: z.string().min(1),
    })),
    /** Plain-language statements of what the quantum cost model would have to satisfy. */
    required_conditions: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
});
const MODEL = INTELLIGENCE_ESTIMATOR;
const VERSION = INTELLIGENCE_ESTIMATOR_VERSION;
/**
 * Highest physical error rate at which some distance within the search bound
 * still meets the budget.
 *
 * Solved rather than searched. The condition is
 * `A (p/p_th)^((d+1)/2) <= B / (n c)`, which at the largest distance the
 * estimator will consider rearranges to `p <= p_th (B / (n c A))^(1/((d+1)/2))`.
 * Searching would give the same answer more slowly and to worse precision, and
 * this is a number people will quote.
 */
function maxErrorRateForFeasibility(workload, scenario, maxDistance = 201) {
    const cycles = Math.max(workload.logical.circuit_depth, 1);
    const perQubitCycleBudget = scenario.error_budget / (workload.logical.logical_qubits * cycles);
    const ratio = perQubitCycleBudget / scenario.qec.prefactor;
    if (ratio >= 1) {
        // The budget is already met at the smallest distance for any sub-threshold
        // rate, so the binding constraint is the threshold itself.
        return { value: scenario.qec.threshold, saturated: true };
    }
    const exponent = 2 / (maxDistance + 1);
    return { value: scenario.qec.threshold * Math.pow(ratio, exponent), saturated: false };
}
/**
 * Highest physical error rate whose resulting machine still fits a capacity.
 *
 * Bisection rather than algebra: the footprint is a step function of the error
 * rate, because the distance is an integer, so there is no closed form. Fifty
 * iterations resolve the boundary to well under one part in 10^12 of the
 * bracket, which is far finer than the step.
 */
function maxErrorRateWithinCapacity(workload, scenario, capacity, ceiling) {
    const fits = (rate) => {
        const result = evaluate(workload, {
            ...scenario,
            hardware: { ...scenario.hardware, physical_error_rate: rate },
            factory: { ...scenario.factory, raw_state_error: Math.max(rate, scenario.factory.target_state_error * 10) },
        });
        return result.feasible && result.totalPhysical !== null && result.totalPhysical <= capacity;
    };
    // A floor low enough that if it does not fit, nothing does.
    let low = ceiling * 1e-9;
    let high = ceiling;
    if (!fits(low))
        return null;
    if (fits(high))
        return high;
    for (let index = 0; index < 50; index += 1) {
        const middle = Math.sqrt(low * high);
        if (fits(middle))
            low = middle;
        else
            high = middle;
    }
    return low;
}
export function computeAdvantageThresholds(workload, scenario, baseline, core) {
    const evaluation = core ?? evaluate(workload, scenario);
    const refusals = [];
    const requiredConditions = [];
    const assumptions = [
        `Physical error rate ${scenario.hardware.physical_error_rate}.`,
        `${scenario.qec.scheme} with prefactor ${scenario.qec.prefactor} (${scenario.qec.prefactor_model}).`,
        `Error budget ${scenario.error_budget}.`,
        `Layout model ${scenario.layout_model}.`,
    ];
    const refuse = (threshold, code, message, unit) => {
        refusals.push({ threshold, code, message });
        return unknownQuantity(unit, message, MODEL, VERSION);
    };
    const bound = (value, unit, kind, source, limitations = []) => quantity({
        value,
        unit,
        bound: kind,
        evidence: "DERIVED",
        source,
        model: MODEL,
        modelVersion: VERSION,
        assumptions,
        limitations,
    });
    // ---------------------------------------------------------------- technical
    const feasibilityCeiling = maxErrorRateForFeasibility(workload, scenario);
    const maxErrorRate = bound(feasibilityCeiling.value, "probability", "UPPER_BOUND", feasibilityCeiling.saturated
        ? `The error budget is met at any sub-threshold rate, so the binding limit is the ${scenario.qec.scheme} ` +
            `threshold of ${scenario.qec.threshold} itself.`
        : "Solved from A (p/p_th)^((d+1)/2) <= budget / (logical qubits x cycles) at the estimator's largest distance.", [
        "A rate at this value is only feasible at the largest distance the estimator considers, which is not a " +
            "practical machine. Treat it as the point beyond which no distance helps at all.",
    ]);
    requiredConditions.push(`The physical two-qubit error rate must stay below ${feasibilityCeiling.value.toExponential(2)} for any code ` +
        "distance to meet this error budget.");
    const capacity = scenario.hardware.physical_qubit_capacity;
    let maxErrorRateWithinCapacityQuantity;
    if (capacity === null) {
        maxErrorRateWithinCapacityQuantity = refuse("max_physical_error_rate_within_capacity", "NO_HARDWARE_CAPACITY", "No physical qubit capacity was stated for this hardware model, so there is nothing to fit within. " +
            "A capacity was not assumed.", "probability");
    }
    else {
        const solved = maxErrorRateWithinCapacity(workload, scenario, capacity, feasibilityCeiling.value);
        maxErrorRateWithinCapacityQuantity =
            solved === null
                ? refuse("max_physical_error_rate_within_capacity", "ESTIMATE_INFEASIBLE", `No physical error rate produces a machine within ${capacity.toLocaleString("en-US")} physical qubits. ` +
                    "The capacity is the binding constraint, not the error rate.", "probability")
                : bound(solved, "probability", "UPPER_BOUND", `Highest error rate whose total machine still fits ${capacity.toLocaleString("en-US")} physical qubits.`);
        if (solved !== null) {
            requiredConditions.push(`To fit ${capacity.toLocaleString("en-US")} physical qubits, the physical error rate must be at or below ` +
                `${solved.toExponential(2)}.`);
        }
    }
    const requiredDistance = evaluation.codeDistance === null
        ? refuse("required_code_distance", "ESTIMATE_INFEASIBLE", evaluation.infeasibilityReason ?? "No distance meets the budget under these assumptions.", "code distance")
        : bound(evaluation.codeDistance, "code distance", "LOWER_BOUND", "Smallest odd distance whose logical error rate meets the per-qubit-per-cycle budget. A smaller " +
            "distance does not meet the budget; a larger one costs more.");
    // Runtime is linear in the cycle time under both limiters, so the slowest
    // acceptable cycle is a division rather than a search.
    const roundsPerRun = evaluation.codeDistance === null
        ? null
        : Math.max(evaluation.logicalCycles * evaluation.codeDistance, evaluation.magicStates > 0 && evaluation.distillationReachedTarget
            ? (evaluation.magicStates * scenario.factory.rounds_per_distillation) /
                scenario.factory.parallel_factories
            : 0);
    let maxCycleForTarget;
    if (scenario.runtime_target === null) {
        maxCycleForTarget = refuse("max_cycle_time_for_runtime_target", "NO_RUNTIME_TARGET", "This scenario states no runtime target, so there is no runtime to meet. A target was not assumed.", "ns");
    }
    else if (roundsPerRun === null || roundsPerRun === 0) {
        maxCycleForTarget = refuse("max_cycle_time_for_runtime_target", "ESTIMATE_INFEASIBLE", evaluation.infeasibilityReason ?? "The run length could not be determined under these assumptions.", "ns");
    }
    else {
        const nanoseconds = (scenario.runtime_target * 1e9) / roundsPerRun;
        maxCycleForTarget = bound(nanoseconds, "ns", "UPPER_BOUND", `Runtime target divided by the ${Math.round(roundsPerRun).toLocaleString("en-US")} surface-code rounds this ` +
            "run occupies under whichever limiter binds.");
        requiredConditions.push(`A surface-code cycle at or below ${nanoseconds.toPrecision(3)} ns would be required to finish within the ` +
            `${scenario.runtime_target} s target.`);
    }
    let minThroughputForTarget;
    if (scenario.runtime_target === null) {
        minThroughputForTarget = refuse("min_factory_throughput_for_runtime_target", "NO_RUNTIME_TARGET", "This scenario states no runtime target, so no throughput is required by one.", "states/s");
    }
    else if (evaluation.magicStates === 0) {
        minThroughputForTarget = bound(0, "states/s", "LOWER_BOUND", "Zero: this circuit consumes no magic states, so no factory throughput is required.");
    }
    else {
        const required = evaluation.magicStates / scenario.runtime_target;
        minThroughputForTarget = bound(required, "states/s", "LOWER_BOUND", `${evaluation.magicStates.toLocaleString("en-US")} magic states divided by the ${scenario.runtime_target} s target.`);
        requiredConditions.push(`The magic-state factory must deliver at least ${required.toPrecision(3)} states per second to finish within ` +
            `the ${scenario.runtime_target} s target.`);
    }
    const requiredLogicalCapacity = bound(evaluation.occupiedLogical, "logical qubits", "LOWER_BOUND", `Logical patches occupied under ${scenario.layout_model}, including routing space.`);
    const requiredTotalCapacity = evaluation.totalPhysical === null
        ? refuse("required_total_physical_qubit_capacity", evaluation.feasible ? "FACTORY_NOT_SIZED" : "ESTIMATE_INFEASIBLE", evaluation.feasible
            ? `The factory could not be sized, so no total is available. ${evaluation.distillationReason}`
            : evaluation.infeasibilityReason, "physical qubits")
        : bound(evaluation.totalPhysical, "physical qubits", "LOWER_BOUND", "Algorithm patches, routing space, and factory together. This is the machine, not a component of it.");
    let capacityHeadroom;
    if (capacity === null) {
        capacityHeadroom = refuse("capacity_headroom", "NO_HARDWARE_CAPACITY", "No physical qubit capacity was stated for this hardware model.", "ratio");
    }
    else if (evaluation.totalPhysical === null) {
        capacityHeadroom = refuse("capacity_headroom", evaluation.feasible ? "FACTORY_NOT_SIZED" : "ESTIMATE_INFEASIBLE", "The total machine size is not available, so it cannot be compared with a capacity.", "ratio");
    }
    else {
        const headroom = capacity / evaluation.totalPhysical;
        capacityHeadroom = bound(headroom, "ratio", "POINT", `Stated capacity ${capacity.toLocaleString("en-US")} divided by required ` +
            `${Math.round(evaluation.totalPhysical).toLocaleString("en-US")}.`, headroom < 1
            ? [`The machine is ${(1 / headroom).toPrecision(3)}x too small under these assumptions.`]
            : []);
        if (headroom < 1) {
            requiredConditions.push(`Physical qubit capacity would have to grow by ${(1 / headroom).toPrecision(3)}x to run this workload.`);
        }
    }
    // ---------------------------------------------------------------- economic
    const hasBaseline = baseline !== null && baseline.evidence !== "UNKNOWN";
    const classicalRuntime = hasBaseline ? baseline.runtime : null;
    const classicalCost = hasBaseline ? baseline.monetary_cost : null;
    const economics = scenario.economics;
    const noBaseline = (name, unit) => refuse(name, "NO_CLASSICAL_BASELINE", `${INSUFFICIENT_ECONOMIC_EVIDENCE}: no classical baseline was supplied, so there is nothing to be faster or ` +
        "cheaper than. No baseline was assumed.", unit);
    let maxCycleToBeatClassical;
    let speedup;
    if (!hasBaseline) {
        maxCycleToBeatClassical = noBaseline("max_cycle_time_to_beat_classical_runtime", "ns");
        speedup = noBaseline("runtime_speedup_over_classical", "ratio");
    }
    else if (classicalRuntime === null) {
        maxCycleToBeatClassical = refuse("max_cycle_time_to_beat_classical_runtime", "NO_CLASSICAL_RUNTIME", `${INSUFFICIENT_ECONOMIC_EVIDENCE}: the classical baseline records no runtime.`, "ns");
        speedup = refuse("runtime_speedup_over_classical", "NO_CLASSICAL_RUNTIME", `${INSUFFICIENT_ECONOMIC_EVIDENCE}: the classical baseline records no runtime.`, "ratio");
    }
    else if (roundsPerRun === null || roundsPerRun === 0 || evaluation.runtime === null) {
        maxCycleToBeatClassical = refuse("max_cycle_time_to_beat_classical_runtime", "ESTIMATE_INFEASIBLE", evaluation.infeasibilityReason ?? `The quantum runtime is not available. ${evaluation.distillationReason}`, "ns");
        speedup = refuse("runtime_speedup_over_classical", "ESTIMATE_INFEASIBLE", evaluation.infeasibilityReason ?? "The quantum runtime is not available.", "ratio");
    }
    else {
        const nanoseconds = (classicalRuntime * 1e9) / roundsPerRun;
        maxCycleToBeatClassical = bound(nanoseconds, "ns", "UPPER_BOUND", `Classical runtime ${classicalRuntime} s divided by the ` +
            `${Math.round(roundsPerRun).toLocaleString("en-US")} surface-code rounds this run occupies.`, [
            `Compares against a ${baseline.evidence} classical baseline on ${baseline.hardware_description}` +
                `${baseline.measured_on ? ` measured ${baseline.measured_on}` : ""}.`,
        ]);
        requiredConditions.push(`A surface-code cycle below ${nanoseconds.toPrecision(3)} ns would be required to beat the supplied ` +
            "classical runtime.");
        speedup = quantity({
            value: classicalRuntime / evaluation.runtime,
            unit: "ratio",
            evidence: "DERIVED",
            source: `Classical runtime ${classicalRuntime} s divided by projected quantum runtime ${evaluation.runtime.toPrecision(3)} s.`,
            model: MODEL,
            modelVersion: VERSION,
            assumptions,
            limitations: [
                "A ratio of a measured classical runtime to a modelled quantum runtime. The two halves are not the same " +
                    "kind of number.",
            ],
        });
    }
    const noEconomics = (name, unit) => refuse(name, "NO_ECONOMIC_MODEL", `${INSUFFICIENT_ECONOMIC_EVIDENCE}: this scenario states no quantum cost model. No price for quantum ` +
        "machine time was assumed, because none exists to look up.", unit);
    const noClassicalCost = (name, unit) => refuse(name, "NO_CLASSICAL_COST", `${INSUFFICIENT_ECONOMIC_EVIDENCE}: the classical baseline records no monetary cost.`, unit);
    let maxMachineCost;
    let maxQubitSecondCost;
    let breakEvenRuntime;
    let breakEvenMachineCost;
    let projectedCost;
    let costRatio;
    const quantumRuntime = evaluation.runtime;
    if (!hasBaseline) {
        maxMachineCost = noBaseline("max_machine_cost_per_second", "currency/s");
        maxQubitSecondCost = noBaseline("max_physical_qubit_second_cost", "currency/qubit/s");
        breakEvenRuntime = noBaseline("break_even_runtime", "s");
        breakEvenMachineCost = noBaseline("break_even_machine_cost_per_second", "currency/s");
        projectedCost = noBaseline("projected_quantum_cost", "currency");
        costRatio = noBaseline("cost_ratio_to_classical", "ratio");
    }
    else if (classicalCost === null) {
        maxMachineCost = noClassicalCost("max_machine_cost_per_second", "currency/s");
        maxQubitSecondCost = noClassicalCost("max_physical_qubit_second_cost", "currency/qubit/s");
        breakEvenRuntime = noClassicalCost("break_even_runtime", "s");
        breakEvenMachineCost = noClassicalCost("break_even_machine_cost_per_second", "currency/s");
        projectedCost = economics === null
            ? noEconomics("projected_quantum_cost", "currency")
            : noClassicalCost("projected_quantum_cost", "currency");
        costRatio = noClassicalCost("cost_ratio_to_classical", "ratio");
    }
    else if (quantumRuntime === null || quantumRuntime <= 0) {
        const message = evaluation.infeasibilityReason ?? `The quantum runtime is not available. ${evaluation.distillationReason}`;
        maxMachineCost = refuse("max_machine_cost_per_second", "ESTIMATE_INFEASIBLE", message, "currency/s");
        maxQubitSecondCost = refuse("max_physical_qubit_second_cost", "ESTIMATE_INFEASIBLE", message, "currency/qubit/s");
        breakEvenRuntime = refuse("break_even_runtime", "ESTIMATE_INFEASIBLE", message, "s");
        breakEvenMachineCost = refuse("break_even_machine_cost_per_second", "ESTIMATE_INFEASIBLE", message, "currency/s");
        projectedCost = refuse("projected_quantum_cost", "ESTIMATE_INFEASIBLE", message, "currency");
        costRatio = refuse("cost_ratio_to_classical", "ESTIMATE_INFEASIBLE", message, "ratio");
    }
    else {
        const currency = classicalCost.currency;
        const currencyMismatch = economics !== null && economics.currency !== currency
            ? [
                `The classical baseline is in ${currency} and the quantum cost model in ${economics.currency}. ` +
                    "No exchange rate was applied; these figures are not directly comparable.",
            ]
            : [];
        const perSecond = classicalCost.amount / quantumRuntime;
        maxMachineCost = bound(perSecond, `${currency}/s`, "UPPER_BOUND", `Classical cost ${classicalCost.amount} ${currency} divided by projected quantum runtime ` +
            `${quantumRuntime.toPrecision(3)} s.`, currencyMismatch);
        requiredConditions.push(`Quantum machine time would have to cost at most ${perSecond.toPrecision(3)} ${currency} per second to ` +
            "match the supplied classical cost.");
        if (evaluation.totalPhysical === null || evaluation.totalPhysical === 0) {
            maxQubitSecondCost = refuse("max_physical_qubit_second_cost", "FACTORY_NOT_SIZED", `The total machine size is not available, so a per-qubit-second cost cannot be derived. ${evaluation.distillationReason}`, `${currency}/qubit/s`);
        }
        else {
            const perQubitSecond = perSecond / evaluation.totalPhysical;
            maxQubitSecondCost = bound(perQubitSecond, `${currency}/qubit/s`, "UPPER_BOUND", `Maximum machine-second cost divided by ${Math.round(evaluation.totalPhysical).toLocaleString("en-US")} ` +
                "physical qubits.", currencyMismatch);
            requiredConditions.push(`That is at most ${perQubitSecond.toExponential(3)} ${currency} per physical qubit per second.`);
        }
        breakEvenMachineCost = bound(perSecond, `${currency}/s`, "POINT", "The machine-second cost at which quantum and classical cost the same for this workload.", currencyMismatch);
        if (economics === null) {
            breakEvenRuntime = noEconomics("break_even_runtime", "s");
            projectedCost = noEconomics("projected_quantum_cost", currency);
            costRatio = noEconomics("cost_ratio_to_classical", "ratio");
        }
        else if (economics.machine_cost_per_second === null) {
            const message = `${INSUFFICIENT_ECONOMIC_EVIDENCE}: the economic model states no machine-second rate, only a ` +
                "per-qubit-second rate. A machine rate was not inferred from it.";
            breakEvenRuntime = refuse("break_even_runtime", "NO_MACHINE_COST_RATE", message, "s");
            const rate = economics.physical_qubit_cost_per_second;
            if (rate !== null && evaluation.totalPhysical !== null) {
                const projected = rate * evaluation.totalPhysical * quantumRuntime;
                projectedCost = quantity({
                    value: projected,
                    unit: economics.currency,
                    evidence: economics.basis === "USER_PROVIDED" ? "USER_PROVIDED" : "MODELLED",
                    source: `${rate} ${economics.currency} per qubit-second x ${Math.round(evaluation.totalPhysical).toLocaleString("en-US")} qubits x ${quantumRuntime.toPrecision(3)} s.`,
                    model: MODEL,
                    modelVersion: VERSION,
                    assumptions: [...assumptions, `Economic model basis: ${economics.basis}. ${economics.source}`],
                    limitations: [...economics.limitations, ...currencyMismatch],
                });
                costRatio = bound(projected / classicalCost.amount, "ratio", "POINT", "Projected quantum cost divided by the supplied classical cost.", currencyMismatch);
            }
            else {
                projectedCost = refuse("projected_quantum_cost", "FACTORY_NOT_SIZED", message, economics.currency);
                costRatio = refuse("cost_ratio_to_classical", "FACTORY_NOT_SIZED", message, "ratio");
            }
        }
        else {
            const rate = economics.machine_cost_per_second;
            breakEvenRuntime = bound(classicalCost.amount / rate, "s", "UPPER_BOUND", `Classical cost ${classicalCost.amount} ${currency} divided by the stated machine rate ${rate} ` +
                `${economics.currency}/s: how long a quantum run may take before it costs more than classical.`, currencyMismatch);
            const projected = rate * quantumRuntime;
            projectedCost = quantity({
                value: projected,
                unit: economics.currency,
                evidence: economics.basis === "USER_PROVIDED" ? "USER_PROVIDED" : "MODELLED",
                source: `${rate} ${economics.currency}/s x projected quantum runtime ${quantumRuntime.toPrecision(3)} s.`,
                model: MODEL,
                modelVersion: VERSION,
                assumptions: [...assumptions, `Economic model basis: ${economics.basis}. ${economics.source}`],
                limitations: [...economics.limitations, ...currencyMismatch],
            });
            costRatio = bound(projected / classicalCost.amount, "ratio", "POINT", "Projected quantum cost divided by the supplied classical cost.", currencyMismatch);
        }
    }
    return AdvantageThresholdSchema.parse({
        schema_version: INTELLIGENCE_SCHEMA_VERSION,
        scenario_name: scenario.name,
        scenario_revision: scenario.revision,
        max_physical_error_rate: maxErrorRate,
        max_physical_error_rate_within_capacity: maxErrorRateWithinCapacityQuantity,
        required_code_distance: requiredDistance,
        max_cycle_time_for_runtime_target: maxCycleForTarget,
        min_factory_throughput_for_runtime_target: minThroughputForTarget,
        required_logical_qubit_capacity: requiredLogicalCapacity,
        required_total_physical_qubit_capacity: requiredTotalCapacity,
        capacity_headroom: capacityHeadroom,
        max_cycle_time_to_beat_classical_runtime: maxCycleToBeatClassical,
        runtime_speedup_over_classical: speedup,
        max_machine_cost_per_second: maxMachineCost,
        max_physical_qubit_second_cost: maxQubitSecondCost,
        break_even_runtime: breakEvenRuntime,
        break_even_machine_cost_per_second: breakEvenMachineCost,
        projected_quantum_cost: projectedCost,
        cost_ratio_to_classical: costRatio,
        refusals,
        required_conditions: requiredConditions,
        limitations: [
            "These are capability conditions, not predictions. Nothing here states that any device will meet them, or when.",
            "Every condition is conditional on this scenario's assumptions; a different layout or prefactor moves them.",
            "The classical side of any comparison is whatever baseline was supplied, on the hardware and date it records.",
        ],
    });
}
/**
 * Roadmap projection is deliberately absent from P0.
 *
 * The design is recorded here rather than implemented: given versioned,
 * source-attributed hardware roadmap snapshots, a threshold crossing could be
 * displayed under optimistic, base and conservative readings of those roadmaps.
 * It is not built, because the capability thresholds above are the part that is
 * checkable, and a crossing date computed from vendor marketing would be the
 * most quotable and least defensible number this product could emit.
 *
 * If it is built, this label is mandatory on every such display.
 */
export const ROADMAP_PROJECTION_LABEL = "Roadmap-based projection, not a prediction or guarantee";
//# sourceMappingURL=thresholds.js.map