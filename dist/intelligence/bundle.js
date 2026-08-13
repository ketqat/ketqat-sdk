import { z } from "zod";
import { INTELLIGENCE_SCHEMA_VERSION, isKnown } from "./measurement.js";
import { QuantumWorkloadSchema } from "./workload.js";
import { ClassicalBaselineSchema } from "./baseline.js";
import { INTELLIGENCE_ESTIMATOR, INTELLIGENCE_ESTIMATOR_VERSION, ResourceScenarioSchema, scenariosComparable, } from "./scenario.js";
import { ResourceEstimateSnapshotSchema, estimateForScenario } from "./estimate.js";
import { AdvantageThresholdSchema, computeAdvantageThresholds } from "./thresholds.js";
import { DecisionAssessmentSchema, assessDecision } from "./decision.js";
import { CURRENT_HASH_VERSION, HASH_VERSION_KEY, calculateReproducibilityHash, } from "../reproducibility/index.js";
/**
 * One assessment, whole, under one hash (ketqat-sdk#236).
 *
 * The bundle is the unit that survives leaving this process. It carries the
 * inputs, the assumptions, every estimate, every threshold, every decision, and
 * the sources -- so a reader who receives only the bundle can check the
 * conclusion rather than take it, and a reader who receives only the conclusion
 * can be pointed at the bundle.
 *
 * Reproducibility comes from `src/reproducibility`, unchanged. Its canonicalizer
 * already drops `created_at` at every level, which is why every timestamp in
 * this module is called `created_at` rather than something more descriptive: a
 * new name would have needed a new exclusion, a new exclusion is a new hash
 * version, and a new hash version invalidates comparison with every record
 * already stored. Reusing the existing rule was free; extending it would not
 * have been.
 *
 * `buildBundle` is a pure function of workload, baseline and scenarios. Given
 * the same three it returns the same estimates, the same decisions, and the same
 * hash, in this process, in a week, and in Python.
 */
export const EvidenceSourceSchema = z.object({
    /** What this source supports: "classical baseline", "hardware parameters". */
    supports: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url().nullable(),
    /** ISO date the source was published. */
    published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** ISO date the source was read. A page can change after publication. */
    retrieved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    limitations: z.array(z.string().min(1)),
});
export const ScenarioComparisonRowSchema = z.object({
    scenario_name: z.string().min(1),
    scenario_preset: z.string().min(1),
    scenario_revision: z.number().int().positive(),
    feasible: z.boolean(),
    logical_qubits: z.number().nullable(),
    total_physical_qubits: z.number().nullable(),
    runtime: z.number().nullable(),
    code_distance: z.number().int().nullable(),
    factory_share: z.number().nullable(),
    achieved_logical_error: z.number().nullable(),
    /** Slowest cycle meeting whichever target applies, in ns. */
    required_cycle_time_ns: z.number().nullable(),
    required_factory_throughput: z.number().nullable(),
    economic_status: z.string().min(1),
    evidence_confidence: z.string().min(1),
    decision_status: z.string().min(1),
});
export const ScenarioComparisonSchema = z.object({
    comparable: z.boolean(),
    /** Why the scenarios may not be placed in one table, when they may not. */
    incomparability_reasons: z.array(z.string().min(1)),
    rows: z.array(ScenarioComparisonRowSchema),
    /**
     * Why there is no summary row.
     *
     * A mean of a conservative and an optimistic estimate is a number no model
     * predicts, presented with the authority of both. The absence of an aggregate
     * is the design; this string says so where a reader would look for one.
     */
    aggregation_policy: z.string().min(1),
});
export const ResourceIntelligenceBundleSchema = z.object({
    schema_version: z.string().min(1),
    bundle_kind: z.literal("RESOURCE_INTELLIGENCE"),
    /** Which canonicalization rules produced the hash. Never itself hashed. */
    reproducibility_hash_version: z.number().int().positive(),
    /** SHA-256 over the canonical form of this bundle, with volatile fields removed. */
    reproducibility_hash: z.string().regex(/^[0-9a-f]{64}$/),
    is_demo: z.boolean(),
    generator: z.object({
        name: z.string().min(1),
        version: z.string().min(1),
        schema_version: z.string().min(1),
    }),
    workload: QuantumWorkloadSchema,
    classical_baseline: ClassicalBaselineSchema.nullable(),
    scenarios: z.array(ResourceScenarioSchema).min(1),
    estimates: z.array(ResourceEstimateSnapshotSchema).min(1),
    thresholds: z.array(AdvantageThresholdSchema).min(1),
    assessments: z.array(DecisionAssessmentSchema).min(1),
    comparison: ScenarioComparisonSchema,
    sources: z.array(EvidenceSourceSchema),
    limitations: z.array(z.string().min(1)),
    /** The command that regenerates this bundle from itself. */
    reproduction_command: z.string().min(1),
    /** Excluded from the hash by the canonicalizer, at every level. */
    created_at: z.string().datetime({ offset: true }).optional(),
});
function comparisonRow(scenario, estimate, threshold, assessment) {
    const economicDimension = assessment.dimensions.find((d) => d.dimension === "ECONOMIC_READINESS");
    const evidenceDimension = assessment.dimensions.find((d) => d.dimension === "EVIDENCE_CONFIDENCE");
    const requiredCycle = isKnown(threshold.max_cycle_time_to_beat_classical_runtime)
        ? threshold.max_cycle_time_to_beat_classical_runtime.value
        : isKnown(threshold.max_cycle_time_for_runtime_target)
            ? threshold.max_cycle_time_for_runtime_target.value
            : null;
    return {
        scenario_name: scenario.name,
        scenario_preset: scenario.preset,
        scenario_revision: scenario.revision,
        feasible: estimate.feasible,
        logical_qubits: estimate.occupied_logical_qubits.value,
        total_physical_qubits: estimate.total_physical_qubits.value,
        runtime: estimate.runtime.value,
        code_distance: estimate.code_distance.value,
        factory_share: estimate.factory_share.value,
        achieved_logical_error: estimate.achieved_logical_error_probability.value,
        required_cycle_time_ns: requiredCycle,
        required_factory_throughput: threshold.min_factory_throughput_for_runtime_target.value,
        economic_status: economicDimension?.status ?? "INSUFFICIENT_EVIDENCE",
        evidence_confidence: evidenceDimension?.grade ?? "UNCHARACTERIZED",
        decision_status: assessment.status,
    };
}
const AGGREGATION_POLICY = "No aggregate row is produced. Scenarios differ in their assumptions, and a mean of results computed under " +
    "different assumptions is a number none of the models predicts, carrying the apparent authority of all of them. " +
    "Each row is read on its own terms.";
/**
 * Build the whole assessment and hash it.
 *
 * Ordering is fixed by the caller's scenario list and preserved everywhere, so
 * two bundles built from the same inputs are byte-identical after
 * canonicalization.
 */
export function buildBundle(input) {
    const workload = QuantumWorkloadSchema.parse(input.workload);
    const baseline = input.baseline === null ? null : ClassicalBaselineSchema.parse(input.baseline);
    const scenarios = input.scenarios.map((scenario) => ResourceScenarioSchema.parse(scenario));
    if (scenarios.length === 0) {
        throw new Error("A resource intelligence bundle needs at least one scenario.");
    }
    const estimates = [];
    const thresholds = [];
    const assessments = [];
    for (const scenario of scenarios) {
        const estimate = estimateForScenario(workload, scenario);
        const threshold = computeAdvantageThresholds(workload, scenario, baseline);
        const assessment = assessDecision({ workload, scenario, baseline, estimate, threshold });
        estimates.push(estimate);
        thresholds.push(threshold);
        assessments.push(assessment);
    }
    // Every pair is checked, not just adjacent ones: a table is only safe if every
    // column heading means the same thing in every row.
    const incomparability = [];
    for (let left = 0; left < scenarios.length; left += 1) {
        for (let right = left + 1; right < scenarios.length; right += 1) {
            const verdict = scenariosComparable(scenarios[left], scenarios[right]);
            if (!verdict.comparable) {
                for (const reason of verdict.reasons) {
                    incomparability.push(`'${scenarios[left].name}' vs '${scenarios[right].name}': ${reason}`);
                }
            }
        }
    }
    const comparison = {
        comparable: incomparability.length === 0,
        incomparability_reasons: incomparability,
        rows: scenarios.map((scenario, index) => comparisonRow(scenario, estimates[index], thresholds[index], assessments[index])),
        aggregation_policy: AGGREGATION_POLICY,
    };
    const limitations = [
        "Resource estimates are modelled, not measured. No device was run.",
        "The logical-error prefactor is fitted and its provenance is weak; the alternative published value is reported " +
            "as model sensitivity on every estimate.",
        "The magic-state factory footprint and throughput are models of the standard construction, not published or " +
            "measured figures.",
        "The error budget is allocated across the algorithm's own logical qubits; routing patches are charged for space " +
            "but not against the budget.",
        "One QEC scheme is modelled. Other codes, other layouts, and other hardware modalities are out of scope here.",
        "Nothing in this bundle predicts when any device will meet any condition it states.",
    ];
    if (baseline === null) {
        limitations.push("No classical baseline was supplied, so no economic or speedup conclusion is drawn anywhere in this bundle.");
    }
    if (workload.is_demo) {
        limitations.push("This bundle is built from a demonstration fixture. It is not evidence about any real workload, device, " +
            "organisation, or quantum advantage claim.");
    }
    const withoutHash = {
        schema_version: INTELLIGENCE_SCHEMA_VERSION,
        bundle_kind: "RESOURCE_INTELLIGENCE",
        [HASH_VERSION_KEY]: CURRENT_HASH_VERSION,
        is_demo: workload.is_demo,
        generator: {
            name: INTELLIGENCE_ESTIMATOR,
            version: INTELLIGENCE_ESTIMATOR_VERSION,
            schema_version: INTELLIGENCE_SCHEMA_VERSION,
        },
        workload,
        classical_baseline: baseline,
        scenarios,
        estimates,
        thresholds,
        assessments,
        comparison,
        sources: input.sources ?? [],
        limitations,
        reproduction_command: "ketqat intelligence verify <this-file>",
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    const hash = calculateReproducibilityHash(withoutHash, CURRENT_HASH_VERSION);
    return ResourceIntelligenceBundleSchema.parse({
        ...withoutHash,
        reproducibility_hash_version: CURRENT_HASH_VERSION,
        reproducibility_hash: hash,
    });
}
export const VerificationSchema = z.object({
    valid: z.boolean(),
    hash_matches: z.boolean(),
    decision_matches: z.boolean(),
    estimates_match: z.boolean(),
    expected_hash: z.string(),
    actual_hash: z.string(),
    /** Every discrepancy found, named. Empty when `valid`. */
    problems: z.array(z.string().min(1)),
});
/**
 * Recompute a bundle from its own inputs and compare.
 *
 * Checking the hash alone proves the file was not edited. It does not prove the
 * conclusions follow from the inputs, which is the claim a reader actually needs
 * -- a bundle whose decision section was written by hand and then re-hashed
 * passes a hash check and is a fabrication. So this rebuilds the estimates,
 * thresholds and assessments from the stored workload, baseline and scenarios,
 * and compares those too.
 */
export function verifyBundle(candidate) {
    const parsed = ResourceIntelligenceBundleSchema.safeParse(candidate);
    if (!parsed.success) {
        return {
            valid: false,
            hash_matches: false,
            decision_matches: false,
            estimates_match: false,
            expected_hash: "",
            actual_hash: "",
            problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
        };
    }
    const bundle = parsed.data;
    const problems = [];
    const rebuilt = buildBundle({
        workload: bundle.workload,
        baseline: bundle.classical_baseline,
        scenarios: bundle.scenarios,
        sources: bundle.sources,
        ...(bundle.created_at ? { createdAt: bundle.created_at } : {}),
    });
    const hashMatches = rebuilt.reproducibility_hash === bundle.reproducibility_hash;
    if (!hashMatches) {
        problems.push(`Reproducibility hash mismatch: the bundle claims ${bundle.reproducibility_hash} and its own contents ` +
            `canonicalize to ${rebuilt.reproducibility_hash}.`);
    }
    const estimatesMatch = JSON.stringify(rebuilt.estimates) === JSON.stringify(bundle.estimates) &&
        JSON.stringify(rebuilt.thresholds) === JSON.stringify(bundle.thresholds);
    if (!estimatesMatch) {
        problems.push("The stored estimates or thresholds do not match what the stored inputs and assumptions produce. The numbers " +
            "in this bundle were not computed from the inputs it carries.");
    }
    const decisionMatches = JSON.stringify(rebuilt.assessments) === JSON.stringify(bundle.assessments);
    if (!decisionMatches) {
        problems.push("The stored decision assessments do not match what the stored estimates produce. A conclusion in this bundle " +
            "was not derived by the documented rules.");
    }
    return VerificationSchema.parse({
        valid: problems.length === 0,
        hash_matches: hashMatches,
        decision_matches: decisionMatches,
        estimates_match: estimatesMatch,
        expected_hash: rebuilt.reproducibility_hash,
        actual_hash: bundle.reproducibility_hash,
        problems,
    });
}
//# sourceMappingURL=bundle.js.map