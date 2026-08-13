import { z } from "zod";
import { INTELLIGENCE_SCHEMA_VERSION, isKnown } from "./measurement.js";
/**
 * The KetQat Decision Report (ketqat-sdk#236).
 *
 * A projection of the bundle for reading rather than a second source of truth:
 * every figure here is copied from the bundle, and the bundle's hash covers the
 * bundle, not this. A report that could say something the bundle does not would
 * be a way to state a conclusion nothing verifies.
 *
 * The executive summary is generated from the assessments rather than written,
 * for the same reason. A hand-written summary drifts from the numbers under it
 * the first time an assumption changes, and the drift is invisible.
 */
export const ReportSectionSchema = z.object({
    heading: z.string().min(1),
    /** Ordered statements. Each is displayable on its own without the others. */
    statements: z.array(z.string().min(1)),
});
export const DecisionReportSchema = z.object({
    schema_version: z.string().min(1),
    report_kind: z.literal("KETQAT_DECISION_REPORT"),
    title: z.string().min(1),
    is_demo: z.boolean(),
    /** Repeated from the bundle so a report cannot circulate without it. */
    reproducibility_hash: z.string().regex(/^[0-9a-f]{64}$/),
    reproducibility_hash_version: z.number().int().positive(),
    reproduction_command: z.string().min(1),
    estimator: z.object({ name: z.string().min(1), version: z.string().min(1) }),
    executive_summary: z.array(z.string().min(1)),
    sections: z.array(ReportSectionSchema),
    missing_evidence: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
    sources: z.array(z.object({
        supports: z.string().min(1),
        title: z.string().min(1),
        url: z.string().nullable(),
        published_on: z.string().nullable(),
        retrieved_on: z.string().nullable(),
        confidence: z.string().min(1),
    })),
});
/**
 * Render a quantity for prose.
 *
 * An unknown renders as the word, never as a blank or a zero: a blank cell in a
 * report is read as "small", and a zero is read as "measured to be nothing".
 */
export function renderQuantity(value) {
    if (!isKnown(value))
        return `unknown (${value.limitations[0] ?? "not computed"})`;
    const magnitude = Math.abs(value.value) >= 1e6 || (Math.abs(value.value) < 1e-3 && value.value !== 0)
        ? value.value.toExponential(3)
        : value.value.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const prefix = value.bound === "UPPER_BOUND" ? "at most " : value.bound === "LOWER_BOUND" ? "at least " : "";
    return `${prefix}${magnitude} ${value.unit}`;
}
export function buildReport(bundle) {
    const summary = [];
    if (bundle.is_demo) {
        summary.push("This report is built from a demonstration fixture. It is not evidence about any real workload, device, " +
            "organisation, or quantum advantage claim.");
    }
    summary.push(`Workload: ${bundle.workload.name}. ${bundle.workload.logical.logical_qubits} logical qubits, ` +
        `${bundle.workload.logical.t_count} T gates and ${bundle.workload.logical.toffoli_count} Toffoli gates, ` +
        `depth ${bundle.workload.logical.circuit_depth}. Counts are ${bundle.workload.logical_counts_evidence}.`);
    summary.push(bundle.classical_baseline === null
        ? "No classical baseline was supplied, so no speedup or economic conclusion appears anywhere in this report."
        : `Classical baseline: ${bundle.classical_baseline.runtime ?? "no"} s on ` +
            `${bundle.classical_baseline.hardware_description}, classified ${bundle.classical_baseline.evidence}` +
            `${bundle.classical_baseline.measured_on ? `, measured ${bundle.classical_baseline.measured_on}` : ""}.`);
    for (let index = 0; index < bundle.scenarios.length; index += 1) {
        const scenario = bundle.scenarios[index];
        const estimate = bundle.estimates[index];
        const assessment = bundle.assessments[index];
        summary.push(`${scenario.name}: ${assessment.status}. ` +
            (estimate.feasible
                ? `${renderQuantity(estimate.total_physical_qubits)} total, ` +
                    `${renderQuantity(estimate.runtime)} runtime, distance ${estimate.code_distance.value}. ` +
                    `Binding constraint: ${assessment.binding_constraint}.`
                : estimate.infeasibility_reason));
    }
    const sections = [];
    sections.push({
        heading: "Workload definition",
        statements: [
            bundle.workload.description,
            `Source: ${bundle.workload.source.kind}` +
                (bundle.workload.source.reference ? ` (${bundle.workload.source.reference})` : "") +
                ".",
            `Gate set: ${bundle.workload.gate_set.join(", ") || "unstated"}.`,
            `Logical qubits ${bundle.workload.logical.logical_qubits}, depth ${bundle.workload.logical.circuit_depth}, ` +
                `${bundle.workload.logical.gate_count} gates, ${bundle.workload.logical.clifford_count} Clifford, ` +
                `${bundle.workload.logical.t_count} T, ${bundle.workload.logical.toffoli_count} Toffoli, ` +
                `${bundle.workload.logical.unsupported_for_ft_count} needing synthesis.`,
            ...bundle.workload.notes,
        ],
    });
    sections.push({
        heading: "Classical baseline",
        statements: bundle.classical_baseline === null
            ? [
                "None supplied.",
                "Resource estimation runs without one. Every economic and speedup conclusion is refused, by name, " +
                    "wherever it would otherwise appear.",
            ]
            : [
                `Evidence class: ${bundle.classical_baseline.evidence}.`,
                `Runtime: ${bundle.classical_baseline.runtime ?? "not recorded"} s.`,
                `Cost: ${bundle.classical_baseline.monetary_cost
                    ? `${bundle.classical_baseline.monetary_cost.amount} ${bundle.classical_baseline.monetary_cost.currency}`
                    : "not recorded"}.`,
                `Environment: ${bundle.classical_baseline.compute_environment}.`,
                `Hardware: ${bundle.classical_baseline.hardware_description}.`,
                `Workload size: ${bundle.classical_baseline.workload_size}.`,
                bundle.classical_baseline.solution_quality
                    ? `Solution quality: ${bundle.classical_baseline.solution_quality.metric} = ` +
                        `${bundle.classical_baseline.solution_quality.value}.`
                    : "Solution quality: not recorded.",
                `Measured on: ${bundle.classical_baseline.measured_on ?? "not recorded"}.`,
                ...bundle.classical_baseline.limitations,
            ],
    });
    sections.push({
        heading: "Scenarios and assumptions",
        statements: bundle.scenarios.flatMap((scenario) => [
            `${scenario.name} (${scenario.preset}, revision ${scenario.revision}): ${scenario.rationale}`,
            `  Hardware: ${scenario.hardware.name}, ${scenario.hardware.basis}, physical error rate ` +
                `${scenario.hardware.physical_error_rate}, cycle ${scenario.hardware.cycle_time_ns} ns, capacity ` +
                `${scenario.hardware.physical_qubit_capacity ?? "unstated"}. ${scenario.hardware.source}`,
            `  QEC: ${scenario.qec.scheme}, threshold ${scenario.qec.threshold}, prefactor ${scenario.qec.prefactor} ` +
                `(${scenario.qec.prefactor_model}). Layout: ${scenario.layout_model}.`,
            `  Factory: ${scenario.factory.protocol}, raw state error ${scenario.factory.raw_state_error}, target ` +
                `${scenario.factory.target_state_error}, ${scenario.factory.parallel_factories} in parallel.`,
            `  Error budget ${scenario.error_budget}. Runtime target ${scenario.runtime_target ?? "none"}. ` +
                `Economic model: ${scenario.economics ? scenario.economics.basis : "none supplied"}.`,
        ]),
    });
    sections.push({
        heading: "Resource estimates",
        statements: bundle.estimates.flatMap((estimate) => [
            `${estimate.scenario_name}: ${estimate.feasible ? "feasible" : "INFEASIBLE"}.`,
            `  Algorithm patches: ${renderQuantity(estimate.algorithm_physical_qubits)} (not the machine size).`,
            `  With routing space: ${renderQuantity(estimate.layout_adjusted_physical_qubits)}.`,
            `  Magic-state factory: ${renderQuantity(estimate.factory_physical_qubits)}.`,
            `  Total machine: ${renderQuantity(estimate.total_physical_qubits)}.`,
            `  Code distance ${estimate.code_distance.value ?? "none"}, ` +
                `${renderQuantity(estimate.magic_state_count)}, ` +
                `${estimate.distillation_levels.value ?? "no"} distillation level(s), ` +
                `${renderQuantity(estimate.raw_magic_state_input_count)}.`,
            `  Runtime ${renderQuantity(estimate.runtime)}, limited by ${estimate.runtime_limiter}. ` +
                `Cycle-limited ${renderQuantity(estimate.runtime_cycle_limited)}, ` +
                `factory-limited ${renderQuantity(estimate.runtime_factory_limited)}.`,
            `  Achieved logical error ${renderQuantity(estimate.achieved_logical_error_probability)} against a budget of ` +
                `${renderQuantity(estimate.error_budget)}.`,
            ...estimate.exact_arithmetic.map((line) => `  Arithmetic: ${line}`),
            ...estimate.warnings.map((line) => `  Warning: ${line}`),
        ]),
    });
    sections.push({
        heading: "Sensitivity",
        statements: bundle.estimates.flatMap((estimate) => [
            `${estimate.scenario_name}:`,
            ...estimate.sensitivity.map((point) => `  ${point.parameter} = ${point.label}: ` +
                (point.feasible
                    ? `distance ${point.code_distance}, ${point.total_physical_qubits?.toLocaleString("en-US") ?? "unknown"} ` +
                        `physical qubits` +
                        (point.relative_to_base === null ? "" : ` (${point.relative_to_base.toPrecision(3)}x the estimate)`)
                    : "infeasible")),
        ]),
    });
    sections.push({
        heading: "Advantage threshold conditions",
        statements: bundle.thresholds.flatMap((threshold, index) => [
            `${threshold.scenario_name}:`,
            ...threshold.required_conditions.map((condition) => `  ${condition}`),
            `  Maximum physical error rate: ${renderQuantity(threshold.max_physical_error_rate)}.`,
            `  Required total capacity: ${renderQuantity(threshold.required_total_physical_qubit_capacity)}.`,
            `  Maximum cycle time to beat classical: ${renderQuantity(threshold.max_cycle_time_to_beat_classical_runtime)}.`,
            `  Maximum machine-second cost: ${renderQuantity(threshold.max_machine_cost_per_second)}.`,
            `  Break-even runtime: ${renderQuantity(threshold.break_even_runtime)}.`,
            ...threshold.refusals.map((refusal) => `  Refused (${refusal.code}): ${refusal.threshold} -- ${refusal.message}`),
            ...(bundle.estimates[index]?.is_demo ? ["  These conditions are computed from a demonstration fixture."] : []),
        ]),
    });
    sections.push({
        heading: "Decision assessment",
        statements: bundle.assessments.flatMap((assessment) => [
            `${assessment.scenario_name}: ${assessment.status}`,
            `  ${assessment.explanation}`,
            ...assessment.dimensions.map((dimension) => `  ${dimension.dimension}: ${dimension.status} -- ${dimension.explanation}`),
            `  Reason codes: ${assessment.reason_codes.join(", ")}.`,
            ...assessment.uncertainty_warnings.map((warning) => `  Uncertainty: ${warning}`),
            ...assessment.recommended_next_measurement.map((step) => `  Next: ${step}`),
        ]),
    });
    sections.push({
        heading: "Scenario comparison",
        statements: [
            bundle.comparison.aggregation_policy,
            ...(bundle.comparison.comparable
                ? []
                : [
                    "These scenarios are NOT directly comparable:",
                    ...bundle.comparison.incomparability_reasons.map((reason) => `  ${reason}`),
                ]),
            ...bundle.comparison.rows.map((row) => `${row.scenario_name}: ${row.decision_status}, ` +
                `${row.total_physical_qubits?.toLocaleString("en-US") ?? "unknown"} physical qubits, ` +
                `${row.runtime === null ? "unknown" : `${row.runtime.toPrecision(3)} s`}, ` +
                `distance ${row.code_distance ?? "none"}, ` +
                `factory share ${row.factory_share === null ? "unknown" : `${(row.factory_share * 100).toFixed(0)}%`}, ` +
                `economic ${row.economic_status}, evidence ${row.evidence_confidence}.`),
        ],
    });
    const missing = [...new Set(bundle.assessments.flatMap((assessment) => assessment.missing_evidence))];
    return DecisionReportSchema.parse({
        schema_version: INTELLIGENCE_SCHEMA_VERSION,
        report_kind: "KETQAT_DECISION_REPORT",
        title: `KetQat Decision Report -- ${bundle.workload.name}`,
        is_demo: bundle.is_demo,
        reproducibility_hash: bundle.reproducibility_hash,
        reproducibility_hash_version: bundle.reproducibility_hash_version,
        reproduction_command: bundle.reproduction_command,
        estimator: { name: bundle.generator.name, version: bundle.generator.version },
        executive_summary: summary,
        sections,
        missing_evidence: missing,
        limitations: bundle.limitations,
        sources: bundle.sources.map((source) => ({
            supports: source.supports,
            title: source.title,
            url: source.url,
            published_on: source.published_on,
            retrieved_on: source.retrieved_on,
            confidence: source.confidence,
        })),
    });
}
const CSV_COLUMNS = [
    "scenario",
    "preset",
    "revision",
    "decision_status",
    "feasible",
    "occupied_logical_qubits",
    "total_physical_qubits",
    "runtime_seconds",
    "code_distance",
    "factory_share",
    "achieved_logical_error",
    "required_cycle_time_ns",
    "required_factory_throughput_states_per_second",
    "economic_status",
    "evidence_confidence",
];
function csvCell(value) {
    // An unknown is written as the word, not as an empty cell. A spreadsheet reads
    // an empty numeric cell as zero, which turns "we could not compute the factory"
    // into "the factory is free".
    if (value === null || value === undefined)
        return "UNKNOWN";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/** The comparison table as CSV. Same numbers, no aggregate row. */
export function reportToCsv(bundle) {
    const header = CSV_COLUMNS.join(",");
    const rows = bundle.comparison.rows.map((row) => [
        row.scenario_name,
        row.scenario_preset,
        row.scenario_revision,
        row.decision_status,
        row.feasible,
        row.logical_qubits,
        row.total_physical_qubits,
        row.runtime,
        row.code_distance,
        row.factory_share,
        row.achieved_logical_error,
        row.required_cycle_time_ns,
        row.required_factory_throughput,
        row.economic_status,
        row.evidence_confidence,
    ]
        .map(csvCell)
        .join(","));
    const provenance = [
        "",
        `# reproducibility_hash,${bundle.reproducibility_hash}`,
        `# estimator,${bundle.generator.name} ${bundle.generator.version}`,
        `# schema_version,${bundle.schema_version}`,
        `# is_demo,${bundle.is_demo}`,
        `# aggregation,${csvCell(bundle.comparison.aggregation_policy)}`,
    ];
    return [header, ...rows, ...provenance].join("\n") + "\n";
}
//# sourceMappingURL=report.js.map