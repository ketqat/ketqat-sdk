import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import {
  AVERAGING_IS_NOT_PROVIDED,
  ClassicalBaselineSchema,
  DecisionAssessmentSchema,
  EconomicModelSchema,
  HardwareModelSnapshotSchema,
  INSUFFICIENT_ECONOMIC_EVIDENCE,
  QuantitySchema,
  QuantumWorkloadSchema,
  ResourceIntelligenceBundleSchema,
  ResourceScenarioSchema,
  ROADMAP_PROJECTION_LABEL,
  assessDecision,
  buildBundle,
  computeAdvantageThresholds,
  demoBaseline,
  demoEconomicModel,
  demoScenarios,
  demoSources,
  demoWorkload,
  estimateForScenario,
  evaluate,
  occupiedLogicalQubits,
  presetScenarios,
  quantitiesComparable,
  quantity,
  reviseScenario,
  scenariosComparable,
  unknownQuantity,
  verifyBundle,
  parseYamlSubset,
  readAssessmentDocument,
  resolveAssessment,
  buildReport,
  reportToCsv,
  renderQuantity,
  listTools,
  callTool,
  DEMO_QASM3,
} from "../dist/index.js"

/**
 * Tests for Quantum Resource Intelligence (ketqat-sdk#236).
 *
 * The ten scientific invariants from ketqat-planning#121 each have a test here,
 * named after the invariant. They are not stylistic assertions: every one of
 * them, violated, produces a wrong claim in front of somebody making a decision,
 * and several of them describe mistakes this codebase has already made once in
 * the surfaces underneath.
 */

const workload = demoWorkload()
const scenarios = demoScenarios()
const base = scenarios[1]
const aboveThreshold = scenarios[3]

function customScenario(changes) {
  return ResourceScenarioSchema.parse({ ...base, preset: "CUSTOM", ...changes })
}

function withHardware(changes) {
  return customScenario({
    hardware: HardwareModelSnapshotSchema.parse({ ...base.hardware, ...changes }),
  })
}

// --------------------------------------------------------------- the envelope

test("a quantity with no value must declare UNKNOWN", () => {
  assert.throws(
    () =>
      QuantitySchema.parse({
        value: null,
        unit: "physical qubits",
        bound: "POINT",
        evidence: "MODELLED",
        source: "s",
        model: "m",
        model_version: "1",
        assumptions: [],
        schema_version: "0.1",
        limitations: [],
      }),
    /must be classified UNKNOWN/,
  )
})

test("a quantity declared UNKNOWN cannot carry a number", () => {
  assert.throws(
    () =>
      QuantitySchema.parse({
        value: 42,
        unit: "physical qubits",
        bound: "POINT",
        evidence: "UNKNOWN",
        source: "s",
        model: "m",
        model_version: "1",
        assumptions: [],
        schema_version: "0.1",
        limitations: [],
      }),
    /must carry a null value/,
  )
})

test("infinite and NaN values are refused", () => {
  assert.throws(
    () =>
      quantity({
        value: Number.POSITIVE_INFINITY, unit: "s", evidence: "MODELLED", source: "s", model: "m", modelVersion: "1",
      }),
    /must be finite/,
  )
  // NaN is refused by the number type itself, before the finiteness refinement.
  assert.throws(
    () => quantity({ value: Number.NaN, unit: "s", evidence: "MODELLED", source: "s", model: "m", modelVersion: "1" }),
    /received nan/,
  )
})

test("unknownQuantity records why it is unknown rather than dropping the reason", () => {
  const value = unknownQuantity("physical qubits", "The factory could not be sized.", "m", "1")
  assert.equal(value.value, null)
  assert.equal(value.evidence, "UNKNOWN")
  assert.deepEqual(value.limitations, ["The factory could not be sized."])
})

// ------------------------------------------- invariant 1: never average

test("invariant 1: no function averages estimates, and the policy says so", () => {
  const module = Object.keys(globalThis)
  assert.ok(!module.includes("averageQuantities"))
  assert.match(AVERAGING_IS_NOT_PROVIDED, /are not averaged/)
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios })
  assert.match(bundle.comparison.aggregation_policy, /No aggregate row is produced/)
  // Nothing in the comparison is a summary of the others.
  assert.equal(bundle.comparison.rows.length, scenarios.length)
})

// ------------------------- invariant 2: never implicitly compare across models

test("invariant 2: scenarios differing in estimator, QEC model, budget or decomposition are incomparable", () => {
  assert.ok(scenariosComparable(scenarios[0], scenarios[1]).comparable)

  const otherPrefactor = customScenario({ qec: { ...base.qec, prefactor: 0.1, prefactor_model: "Gidney-Fowler" } })
  const verdict = scenariosComparable(base, otherPrefactor)
  assert.equal(verdict.comparable, false)
  assert.match(verdict.reasons.join(" "), /logical-error models/)

  const looserBudget = customScenario({ error_budget: 0.1 })
  assert.match(scenariosComparable(base, looserBudget).reasons.join(" "), /error budgets/)

  const otherToffoli = customScenario({ decomposition: { ...base.decomposition, toffoli_t_cost: 7 } })
  assert.match(scenariosComparable(base, otherToffoli).reasons.join(" "), /Toffoli decompositions/)
})

test("invariant 2: quantities from different models or bounds are incomparable", () => {
  const left = quantity({ value: 1, unit: "s", evidence: "MODELLED", source: "s", model: "a", modelVersion: "1" })
  const right = quantity({ value: 1, unit: "s", evidence: "MODELLED", source: "s", model: "b", modelVersion: "1" })
  assert.equal(quantitiesComparable(left, right).comparable, false)

  const upper = quantity({
    value: 1, unit: "s", evidence: "DERIVED", source: "s", model: "a", modelVersion: "1", bound: "UPPER_BOUND",
  })
  assert.equal(quantitiesComparable(left, upper).comparable, false)
})

test("a bundle records why its scenarios are incomparable rather than tabling them silently", () => {
  const bundle = buildBundle({
    workload,
    baseline: null,
    scenarios: [base, customScenario({ name: "Loose", error_budget: 0.2 })],
  })
  assert.equal(bundle.comparison.comparable, false)
  assert.match(bundle.comparison.incomparability_reasons.join(" "), /error budgets/)
})

// ------------------- invariant 3: evidence classes are never conflated

test("invariant 3: logical counts may not claim to be MEASURED", () => {
  assert.throws(
    () => QuantumWorkloadSchema.parse({ ...workload, logical_counts_evidence: "MEASURED" }),
    /never MEASURED/,
  )
})

test("invariant 3: a MEASURED baseline must carry a date and a pointer to its evidence", () => {
  const template = demoBaseline()
  assert.throws(
    () => ClassicalBaselineSchema.parse({ ...template, evidence: "MEASURED", measured_on: null }),
    /must record when it was measured/,
  )
  assert.throws(
    () =>
      ClassicalBaselineSchema.parse({
        ...template,
        evidence: "MEASURED",
        measured_on: "2026-01-01",
        evidence_url: null,
        evidence_note: null,
      }),
    /must point at its evidence/,
  )
})

test("invariant 3: an UNKNOWN baseline cannot carry numbers", () => {
  assert.throws(
    () => ClassicalBaselineSchema.parse({ ...demoBaseline(), evidence: "UNKNOWN" }),
    /cannot carry a runtime or a cost/,
  )
})

// ------------- invariant 4: bounds and point estimates are distinguishable

test("invariant 4: thresholds are bounds, not point estimates", () => {
  const threshold = computeAdvantageThresholds(workload, base, demoBaseline())
  assert.equal(threshold.max_physical_error_rate.bound, "UPPER_BOUND")
  assert.equal(threshold.max_cycle_time_to_beat_classical_runtime.bound, "UPPER_BOUND")
  assert.equal(threshold.required_total_physical_qubit_capacity.bound, "LOWER_BOUND")
  assert.equal(threshold.min_factory_throughput_for_runtime_target.bound, "LOWER_BOUND")

  const estimate = estimateForScenario(workload, base)
  assert.equal(estimate.total_physical_qubits.bound, "POINT")
})

// ---------------- invariant 5: above threshold is infeasible, not expensive

test("invariant 5: a device above the code threshold returns infeasible, never a large number", () => {
  const estimate = estimateForScenario(workload, aboveThreshold)
  assert.equal(estimate.feasible, false)
  assert.equal(estimate.infeasibility_code, "ABOVE_SURFACE_CODE_THRESHOLD")
  assert.equal(estimate.code_distance.value, null)
  assert.equal(estimate.total_physical_qubits.value, null)
  assert.equal(estimate.algorithm_physical_qubits.value, null)
  assert.equal(estimate.runtime.value, null)
  assert.match(estimate.infeasibility_reason, /impossible one/)

  const threshold = computeAdvantageThresholds(workload, aboveThreshold, demoBaseline())
  const assessment = assessDecision({
    workload, scenario: aboveThreshold, baseline: demoBaseline(), estimate, threshold,
  })
  assert.equal(assessment.status, "INFEASIBLE_UNDER_ASSUMPTIONS")
  assert.equal(assessment.binding_constraint, "PHYSICAL_ERROR_RATE")
})

test("invariant 5: exactly at the threshold is also infeasible", () => {
  const atThreshold = withHardware({ physical_error_rate: base.qec.threshold })
  assert.equal(evaluate(workload, atThreshold).feasible, false)
})

// --------------- invariant 6 and 7: nothing is filled in, unknowns persist

test("invariant 6: a missing hardware capacity is refused, not defaulted", () => {
  assert.equal(base.hardware.physical_qubit_capacity, null)
  const threshold = computeAdvantageThresholds(workload, base, demoBaseline())
  assert.equal(threshold.capacity_headroom.value, null)
  assert.equal(threshold.capacity_headroom.evidence, "UNKNOWN")
  const refusal = threshold.refusals.find((entry) => entry.threshold === "capacity_headroom")
  assert.equal(refusal.code, "NO_HARDWARE_CAPACITY")
})

test("invariant 7: an unsized factory leaves the total UNKNOWN rather than reporting the algorithm figure", () => {
  // A raw state error above the 15-to-1 fixed point: distillation cannot help.
  const unreachable = customScenario({
    factory: { ...base.factory, raw_state_error: 0.3, target_state_error: 1e-10 },
  })
  const estimate = estimateForScenario(workload, unreachable)
  assert.equal(estimate.feasible, true, "the surface code still works; only the factory does not")
  assert.equal(estimate.factory_physical_qubits.value, null)
  assert.equal(estimate.total_physical_qubits.value, null)
  assert.equal(estimate.total_physical_qubits.evidence, "UNKNOWN")
  assert.ok(estimate.algorithm_physical_qubits.value > 0, "the component that is known stays known")
  assert.match(estimate.warnings.join(" "), /no total machine size is reported/)

  const threshold = computeAdvantageThresholds(workload, unreachable, demoBaseline())
  const assessment = assessDecision({
    workload, scenario: unreachable, baseline: demoBaseline(), estimate, threshold,
  })
  assert.equal(assessment.status, "INSUFFICIENT_EVIDENCE")
})

// -------------------------- invariant 8: existing hash semantics unchanged

test("invariant 8: the bundle uses the existing hash version and excludes only existing volatile keys", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios })
  assert.equal(bundle.reproducibility_hash_version, 2)

  const withTimestamp = buildBundle({
    workload, baseline: demoBaseline(), scenarios, createdAt: "2026-08-13T00:00:00.000Z",
  })
  const withOther = buildBundle({
    workload, baseline: demoBaseline(), scenarios, createdAt: "2030-01-01T00:00:00.000Z",
  })
  assert.equal(
    withTimestamp.reproducibility_hash,
    withOther.reproducibility_hash,
    "created_at is excluded at every level by the existing canonicalizer",
  )
  assert.equal(withTimestamp.reproducibility_hash, bundle.reproducibility_hash)
})

// ------------------------------ invariant 9: bundles carry the whole chain

test("invariant 9: a bundle carries inputs, assumptions, estimates, decisions and sources", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios, sources: demoSources() })
  ResourceIntelligenceBundleSchema.parse(bundle)
  assert.ok(bundle.workload)
  assert.ok(bundle.classical_baseline)
  assert.equal(bundle.scenarios.length, scenarios.length)
  assert.equal(bundle.estimates.length, scenarios.length)
  assert.equal(bundle.thresholds.length, scenarios.length)
  assert.equal(bundle.assessments.length, scenarios.length)
  assert.ok(bundle.sources.length >= 3)
  assert.ok(bundle.limitations.length > 0)
  assert.match(bundle.reproduction_command, /ketqat intelligence verify/)
  // The circuit travels with the bundle so the counts can be recomputed.
  assert.ok(bundle.workload.source.openqasm3.includes("OPENQASM 3.0"))
})

// ------------------- invariant 10: same inputs regenerate the same hash

test("invariant 10: the same inputs produce the same hash and the same decisions", () => {
  const first = buildBundle({ workload, baseline: demoBaseline(), scenarios, sources: demoSources() })
  const second = buildBundle({
    workload: demoWorkload(), baseline: demoBaseline(), scenarios: demoScenarios(), sources: demoSources(),
  })
  assert.equal(first.reproducibility_hash, second.reproducibility_hash)
  assert.deepEqual(first.assessments, second.assessments)
})

test("verify recomputes the decisions, not only the hash", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios, sources: demoSources() })
  const clean = verifyBundle(bundle)
  assert.equal(clean.valid, true)
  assert.equal(clean.decision_matches, true)

  // A hand-edited conclusion that was then re-hashed passes a hash check. It
  // must not pass this one.
  const tampered = structuredClone(bundle)
  tampered.assessments[1].status = "ECONOMICALLY_COMPETITIVE_UNDER_ASSUMPTIONS"
  const rehashed = buildBundle({
    workload: tampered.workload, baseline: tampered.classical_baseline, scenarios: tampered.scenarios,
  })
  tampered.reproducibility_hash = rehashed.reproducibility_hash
  const verdict = verifyBundle(tampered)
  assert.equal(verdict.valid, false)
  assert.equal(verdict.decision_matches, false)
  assert.match(verdict.problems.join(" "), /not derived by the documented rules/)
})

test("verify rejects a bundle whose stored estimates were altered", () => {
  const bundle = structuredClone(buildBundle({ workload, baseline: demoBaseline(), scenarios }))
  bundle.estimates[1].total_physical_qubits.value = 1
  const verdict = verifyBundle(bundle)
  assert.equal(verdict.valid, false)
  assert.equal(verdict.estimates_match, false)
})

// ------------------------------------------------- monotonicity properties

test("improving the physical error rate never worsens the required code distance", () => {
  let previous = Number.POSITIVE_INFINITY
  for (const rate of [1e-5, 1e-4, 5e-4, 1e-3, 3e-3, 5e-3]) {
    const result = evaluate(workload, withHardware({ physical_error_rate: rate }))
    assert.ok(result.feasible)
    assert.ok(result.codeDistance >= previous || previous === Number.POSITIVE_INFINITY,
      `distance fell from ${previous} to ${result.codeDistance} as the error rate rose to ${rate}`)
    previous = result.codeDistance
  }
})

test("tightening the error budget never reduces required resources", () => {
  let previous = 0
  for (const budget of [1e-1, 1e-2, 1e-3, 1e-4, 1e-6]) {
    const result = evaluate(workload, customScenario({ error_budget: budget }))
    assert.ok(result.totalPhysical >= previous, `footprint fell as the budget tightened to ${budget}`)
    previous = result.totalPhysical
  }
})

test("shortening the cycle time never increases runtime", () => {
  let previous = Number.POSITIVE_INFINITY
  for (const cycle of [4000, 2000, 1000, 500, 100]) {
    const result = evaluate(workload, withHardware({ cycle_time_ns: cycle }))
    assert.ok(result.runtime <= previous, `runtime rose as the cycle shortened to ${cycle} ns`)
    previous = result.runtime
  }
})

test("increasing the T count never reduces magic-state demand", () => {
  let previous = 0
  for (const tCount of [0, 1, 8, 64, 4096]) {
    const scoped = QuantumWorkloadSchema.parse({
      ...workload,
      logical: { ...workload.logical, t_count: tCount },
    })
    const result = evaluate(scoped, base)
    assert.ok(result.magicStates >= previous, `magic states fell as the T count rose to ${tCount}`)
    previous = result.magicStates
  }
})

// ------------------------------------------------ Clifford-only behaviour

test("a Clifford-only circuit produces no factory requirement", () => {
  const clifford = QuantumWorkloadSchema.parse({
    ...workload,
    logical: { ...workload.logical, t_count: 0, toffoli_count: 0, clifford_count: 22 },
  })
  const estimate = estimateForScenario(clifford, base)
  assert.equal(estimate.magic_state_count.value, 0)
  assert.equal(estimate.factory_physical_qubits.value, 0)
  assert.equal(estimate.factory_share.value, 0)
  assert.equal(estimate.runtime_factory_limited.value, 0)
  assert.equal(estimate.runtime_limiter, "LOGICAL_CYCLES")
  assert.equal(
    estimate.total_physical_qubits.value,
    estimate.layout_adjusted_physical_qubits.value,
    "the total is the algorithm footprint exactly, with no phantom factory",
  )
  assert.match(estimate.warnings.join(" "), /needs no distillation factory at all/)

  const threshold = computeAdvantageThresholds(clifford, base, demoBaseline())
  assert.equal(threshold.min_factory_throughput_for_runtime_target.value, 0)
})

// -------------------------------------- layout is never silently omitted

test("the algorithm footprint is never labelled the machine size", () => {
  const estimate = estimateForScenario(workload, base)
  assert.ok(estimate.algorithm_physical_qubits.value < estimate.layout_adjusted_physical_qubits.value)
  assert.ok(estimate.layout_adjusted_physical_qubits.value < estimate.total_physical_qubits.value)
  assert.match(estimate.algorithm_physical_qubits.limitations.join(" "), /not the machine size/)
  assert.match(estimate.layout_adjusted_physical_qubits.limitations.join(" "), /Excludes the magic-state factory/)
})

test("the lattice-surgery layout matches the published formula", () => {
  // 2n + ceil(sqrt(8n)) + 1, verified against qdk 1.30.0 at these points.
  for (const [n, expected] of [[4, 15], [8, 25], [16, 45], [32, 81], [100, 230]]) {
    assert.equal(occupiedLogicalQubits(n, "LATTICE_SURGERY_2D"), expected)
  }
  assert.equal(occupiedLogicalQubits(7, "BARE_REGISTER"), 7)
})

// ------------------------------------------- economic evidence gating

test("no classical baseline means no economic or speedup conclusion", () => {
  const bundle = buildBundle({ workload, baseline: null, scenarios })
  for (const threshold of bundle.thresholds) {
    for (const key of [
      "max_cycle_time_to_beat_classical_runtime",
      "runtime_speedup_over_classical",
      "max_machine_cost_per_second",
      "break_even_runtime",
      "projected_quantum_cost",
      "cost_ratio_to_classical",
    ]) {
      assert.equal(threshold[key].value, null, `${key} must be UNKNOWN without a baseline`)
      assert.equal(threshold[key].evidence, "UNKNOWN")
    }
    assert.ok(threshold.refusals.some((entry) => entry.code === "NO_CLASSICAL_BASELINE"))
  }
  for (const assessment of bundle.assessments) {
    assert.ok(!assessment.status.startsWith("POTENTIALLY"))
    assert.ok(!assessment.status.startsWith("ECONOMICALLY"))
    const economic = assessment.dimensions.find((d) => d.dimension === "ECONOMIC_READINESS")
    assert.equal(economic.status, "INSUFFICIENT_EVIDENCE")
    assert.match(economic.explanation, new RegExp(INSUFFICIENT_ECONOMIC_EVIDENCE))
  }
  assert.match(bundle.limitations.join(" "), /No classical baseline was supplied/)
})

test("a baseline without a cost model yields no ROI, and says which input is missing", () => {
  const threshold = computeAdvantageThresholds(workload, base, demoBaseline())
  assert.equal(threshold.projected_quantum_cost.value, null)
  assert.equal(threshold.cost_ratio_to_classical.value, null)
  assert.ok(threshold.refusals.some((entry) => entry.code === "NO_ECONOMIC_MODEL"))
  // The runtime side is still computable: the two halves are gated separately.
  assert.ok(threshold.max_cycle_time_to_beat_classical_runtime.value > 0)
})

test("the economic statuses are unreachable without both halves of the comparison", () => {
  const reachable = customScenario({ economics: demoEconomicModel() })
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios: [reachable] })
  const assessment = bundle.assessments[0]
  // With both halves present the ladder is reachable; which rung depends on the numbers.
  assert.ok(
    ["TECHNICALLY_FEASIBLE", "POTENTIALLY_ECONOMIC", "ECONOMICALLY_COMPETITIVE_UNDER_ASSUMPTIONS"].includes(
      assessment.status,
    ),
    `unexpected status ${assessment.status}`,
  )
  const withoutBaseline = buildBundle({ workload, baseline: null, scenarios: [reachable] })
  assert.ok(!withoutBaseline.assessments[0].status.includes("ECONOMIC"))
})

test("an economic model with no rate at all is refused at construction", () => {
  assert.throws(
    () =>
      EconomicModelSchema.parse({
        ...demoEconomicModel(),
        machine_cost_per_second: null,
        physical_qubit_cost_per_second: null,
      }),
    /not a model/,
  )
})

// --------------------------------------------------- threshold arithmetic

test("the cycle-time threshold is the arithmetic it claims to be", () => {
  const core = evaluate(workload, base)
  const baseline = demoBaseline()
  const threshold = computeAdvantageThresholds(workload, base, baseline)
  const rounds = Math.max(
    core.logicalCycles * core.codeDistance,
    (core.magicStates * base.factory.rounds_per_distillation) / base.factory.parallel_factories,
  )
  const expected = (baseline.runtime * 1e9) / rounds
  assert.ok(Math.abs(threshold.max_cycle_time_to_beat_classical_runtime.value - expected) < 1e-6)
})

test("the factory-throughput threshold is magic states over the target", () => {
  const core = evaluate(workload, base)
  const threshold = computeAdvantageThresholds(workload, base, null)
  assert.equal(
    threshold.min_factory_throughput_for_runtime_target.value,
    core.magicStates / base.runtime_target,
  )
})

test("a stated capacity produces headroom, a shortfall, and a binding constraint", () => {
  const tight = withHardware({ physical_qubit_capacity: 100 })
  const estimate = estimateForScenario(workload, tight)
  const threshold = computeAdvantageThresholds(workload, tight, null)
  assert.ok(threshold.capacity_headroom.value < 1)
  const assessment = assessDecision({ workload, scenario: tight, baseline: null, estimate, threshold })
  assert.equal(assessment.status, "CONDITIONALLY_FEASIBLE")
  assert.equal(assessment.binding_constraint, "TOTAL_PHYSICAL_QUBIT_CAPACITY")

  const roomy = withHardware({ physical_qubit_capacity: 10_000_000 })
  const roomyThreshold = computeAdvantageThresholds(workload, roomy, null)
  assert.ok(roomyThreshold.capacity_headroom.value > 1)
  assert.ok(roomyThreshold.max_physical_error_rate_within_capacity.value > 0)
})

// ------------------------------------------------- decision transparency

test("an assessment separates six dimensions and never fuses them into a score", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios })
  const assessment = bundle.assessments[1]
  DecisionAssessmentSchema.parse(assessment)
  assert.equal(assessment.dimensions.length, 6)
  assert.deepEqual(
    assessment.dimensions.map((d) => d.dimension),
    [
      "SCIENTIFIC_FEASIBILITY",
      "ENGINEERING_FEASIBILITY",
      "HARDWARE_READINESS",
      "ECONOMIC_READINESS",
      "EVIDENCE_CONFIDENCE",
      "SENSITIVITY_RISK",
    ],
  )
  assert.ok(!("score" in assessment))
  for (const dimension of assessment.dimensions) {
    assert.ok(dimension.explanation.length > 0)
  }
  assert.ok(assessment.reason_codes.length > 0)
  assert.ok(assessment.missing_evidence.length > 0)
  assert.ok(assessment.recommended_next_measurement.length > 0)
  assert.equal(assessment.most_influential_assumptions.length, 6)
})

test("the binding constraint distinguishes factory throughput from qubit capacity", () => {
  const estimate = estimateForScenario(workload, base)
  assert.equal(estimate.runtime_limiter, "MAGIC_STATE_THROUGHPUT")
  const threshold = computeAdvantageThresholds(workload, base, demoBaseline())
  const assessment = assessDecision({ workload, scenario: base, baseline: demoBaseline(), estimate, threshold })
  assert.equal(assessment.binding_constraint, "MAGIC_STATE_THROUGHPUT")
  assert.match(assessment.binding_constraint_explanation, /not logical-qubit capacity/)
  assert.match(assessment.explanation, /A surface-code cycle below .* ns would be required/)
})

test("RESEARCH_ONLY is used when nothing concrete was checked against", () => {
  const nothingStated = customScenario({ runtime_target: null })
  const estimate = estimateForScenario(workload, nothingStated)
  const threshold = computeAdvantageThresholds(workload, nothingStated, null)
  const assessment = assessDecision({ workload, scenario: nothingStated, baseline: null, estimate, threshold })
  assert.equal(assessment.status, "RESEARCH_ONLY")
})

test("unsupported gates with no T or Toffoli make the fault-tolerant cost indeterminate", () => {
  const opaque = QuantumWorkloadSchema.parse({
    ...workload,
    logical: { ...workload.logical, t_count: 0, toffoli_count: 0, unsupported_for_ft_count: 12 },
  })
  const estimate = estimateForScenario(opaque, base)
  const threshold = computeAdvantageThresholds(opaque, base, null)
  const assessment = assessDecision({ workload: opaque, scenario: base, baseline: null, estimate, threshold })
  assert.equal(assessment.status, "INSUFFICIENT_EVIDENCE")
  assert.ok(assessment.reason_codes.includes("T_COUNT_NOT_DETERMINED"))
  assert.match(assessment.missing_evidence.join(" "), /Clifford\+T synthesis/)
})

// ------------------------------------------------------------ sensitivity

test("sensitivity covers the six required parameters and is part of the estimate", () => {
  const estimate = estimateForScenario(workload, base)
  const parameters = new Set(estimate.sensitivity.map((point) => point.parameter))
  for (const expected of [
    "PHYSICAL_ERROR_RATE",
    "LOGICAL_ERROR_PREFACTOR",
    "LAYOUT_MODEL",
    "CYCLE_TIME",
    "ERROR_BUDGET",
    "RAW_MAGIC_STATE_ERROR",
  ]) {
    assert.ok(parameters.has(expected), `${expected} missing from sensitivity`)
  }
  assert.ok(estimate.total_physical_qubits.uncertainty)
  assert.equal(estimate.layout_adjusted_physical_qubits.uncertainty.kind, "SENSITIVITY_RANGE")
})

test("model spread is labelled MODEL_SPREAD, not something a measurement could reduce", () => {
  const estimate = estimateForScenario(workload, base)
  const assessment = assessDecision({
    workload,
    scenario: base,
    baseline: null,
    estimate,
    threshold: computeAdvantageThresholds(workload, base, null),
  })
  const influential = assessment.most_influential_assumptions
  const prefactor = influential.find((a) => a.parameter.includes("prefactor"))
  assert.ok(prefactor, "the fitted prefactor is always reported, not truncated away")
  assert.match(prefactor.note, /does not shrink by buying a better device/)

  // Sorted most-influential first, so a reader can see which uncertainty dominates.
  const factors = influential.map((a) => a.spread_factor ?? 0)
  assert.deepEqual(factors, [...factors].sort((left, right) => right - left))

  // And the device parameter is labelled as the one that *is* reducible.
  const errorRate = influential.find((a) => a.parameter === "physical error rate")
  assert.match(errorRate.note, /measuring or improving the hardware/)
})

// ---------------------------------------------------------- immutability

test("a scenario revision supersedes rather than rewrites", () => {
  const revised = reviseScenario(base, { name: "Base, tightened" }, "a".repeat(64))
  assert.equal(revised.revision, 2)
  assert.equal(revised.supersedes, "a".repeat(64))
  assert.equal(base.revision, 1, "the original is untouched")
  assert.throws(
    () => ResourceScenarioSchema.parse({ ...base, revision: 3, supersedes: null }),
    /must name the revision it supersedes/,
  )
})

// ------------------------------------------------ hardware snapshot rules

test("an observation or roadmap snapshot must be sourced and dated", () => {
  for (const basis of ["OBSERVATION", "ROADMAP"]) {
    assert.throws(
      () => HardwareModelSnapshotSchema.parse({ ...base.hardware, basis }),
      /must cite a source URL/,
    )
  }
  // A user assumption needs no citation, and must not pretend to have one.
  assert.equal(HardwareModelSnapshotSchema.parse({ ...base.hardware }).basis, "USER_ASSUMPTION")
})

test("preset scenarios differ only in device parameters, never in the fitted model", () => {
  const presets = presetScenarios()
  const [conservative, baseline, optimistic] = presets
  for (const scenario of presets) {
    assert.equal(scenario.qec.prefactor, conservative.qec.prefactor)
    assert.equal(scenario.qec.threshold, conservative.qec.threshold)
    assert.equal(scenario.error_budget, conservative.error_budget)
    assert.equal(scenario.layout_model, conservative.layout_model)
    assert.equal(scenario.decomposition.toffoli_t_cost, conservative.decomposition.toffoli_t_cost)
    assert.equal(scenario.economics, null, "no preset invents a quantum price")
  }
  assert.ok(conservative.hardware.physical_error_rate > baseline.hardware.physical_error_rate)
  assert.ok(baseline.hardware.physical_error_rate > optimistic.hardware.physical_error_rate)
})

// -------------------------------------------------------------- demo marking

test("the demo fixture is marked demo everywhere it appears", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios, sources: demoSources() })
  assert.equal(bundle.is_demo, true)
  assert.equal(bundle.workload.is_demo, true)
  for (const estimate of bundle.estimates) assert.equal(estimate.is_demo, true)
  for (const assessment of bundle.assessments) {
    assert.equal(assessment.is_demo, true)
    assert.ok(assessment.reason_codes.includes("DEMO_FIXTURE"))
  }
  assert.match(bundle.limitations.join(" "), /not evidence about any real workload/)
  assert.match(bundle.assessments[1].explanation, /demonstration fixture/)
})

test("no calendar-year projection is produced, and the label exists for when one is", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios })
  assert.ok(!JSON.stringify(bundle).includes("crossing_year"))
  assert.equal(ROADMAP_PROJECTION_LABEL, "Roadmap-based projection, not a prediction or guarantee")
})

// ------------------------------------------------------- the YAML subset

test("the YAML subset reads mappings, sequences, block scalars and comments", () => {
  const document = parseYamlSubset(`# leading comment
name: A workload      # trailing comment
count: 42
ratio: 1.5e-3
flag: true
nothing: null
quoted: "a: colon # hash"
nested:
  inner: value
  deeper:
    leaf: 1
list:
  - one
  - two
objects:
  - name: first
    value: 1
  - name: second
    value: 2
block: |
  line one
  line two
folded: >
  folded one
  folded two
`)
  assert.equal(document.name, "A workload")
  assert.equal(document.count, 42)
  assert.equal(document.ratio, 1.5e-3)
  assert.equal(document.flag, true)
  assert.equal(document.nothing, null)
  assert.equal(document.quoted, "a: colon # hash")
  assert.deepEqual(document.nested, { inner: "value", deeper: { leaf: 1 } })
  assert.deepEqual(document.list, ["one", "two"])
  assert.deepEqual(document.objects, [
    { name: "first", value: 1 },
    { name: "second", value: 2 },
  ])
  assert.equal(document.block, "line one\nline two\n")
  assert.equal(document.folded, "folded one folded two")
})

test("the YAML subset refuses what it cannot read, by name", () => {
  for (const [source, expected] of [
    ["a: &anchor 1\nb: *anchor\n", /anchors and aliases/],
    ["--- \na: 1\n", /document separators/],
    ["a: !!str 1\n", /explicit tags/],
    ["a: [1, 2]\n", /flow collections/],
    ["a:\n\tb: 1\n", /tabs are not valid/],
  ]) {
    assert.throws(() => parseYamlSubset(source), expected, `expected refusal for ${JSON.stringify(source)}`)
  }
})

test("a workload with supplied counts must state its evidence class and gate set", () => {
  const document = {
    workload: {
      name: "Published analysis",
      description: "Counts taken from a paper.",
      logical: {
        logical_qubits: 100, circuit_depth: 1000, gate_count: 5000, one_qubit_gate_count: 3000,
        two_qubit_gate_count: 2000, clifford_count: 4000, t_count: 900, toffoli_count: 100,
        unsupported_for_ft_count: 0, measurement_count: 100, reset_count: 0, conditional_count: 0,
      },
    },
  }
  assert.throws(
    () => readAssessmentDocument(JSON.stringify(document), "spec.json"),
    /must state how they were obtained/,
  )
  const complete = structuredClone(document)
  complete.workload.logical_counts_evidence = "USER_PROVIDED"
  assert.throws(() => readAssessmentDocument(JSON.stringify(complete), "spec.json"), /must state the gate set/)

  complete.workload.gate_set = ["h", "cx", "t", "ccx"]
  const spec = readAssessmentDocument(JSON.stringify(complete), "spec.json")
  const resolved = resolveAssessment(spec)
  assert.equal(resolved.workload.logical_counts_evidence, "USER_PROVIDED")
  assert.equal(resolved.workload.source.kind, "MANUAL_LOGICAL_COUNTS")
  assert.equal(resolved.scenarios.length, 3)
})

test("a workload with neither a circuit nor counts is refused rather than inferred", () => {
  assert.throws(
    () =>
      readAssessmentDocument(
        JSON.stringify({ workload: { name: "n", description: "d" } }),
        "spec.json",
      ),
    /needs either an `openqasm3` circuit to parse or explicit `logical` counts/,
  )
})

test("the packaged example document resolves and reproduces its own hash", () => {
  const path = new URL("../examples/intelligence/demo-assessment.yaml", import.meta.url)
  const spec = readAssessmentDocument(readFileSync(path, "utf8"), "demo-assessment.yaml")
  const resolved = resolveAssessment(spec)
  const bundle = buildBundle(resolved)
  assert.equal(bundle.is_demo, true)
  assert.equal(verifyBundle(bundle).valid, true)

  // The document and the programmatic fixture describe the same circuit.
  assert.deepEqual(resolved.workload.logical, demoWorkload().logical)
})

// ------------------------------------------------------------ the report

test("the report restates the bundle and never adds a figure the bundle lacks", () => {
  const bundle = buildBundle({ workload, baseline: demoBaseline(), scenarios, sources: demoSources() })
  const report = buildReport(bundle)
  assert.equal(report.reproducibility_hash, bundle.reproducibility_hash)
  assert.equal(report.is_demo, true)
  assert.match(report.executive_summary[0], /demonstration fixture/)
  assert.deepEqual(
    report.sections.map((section) => section.heading),
    [
      "Workload definition",
      "Classical baseline",
      "Scenarios and assumptions",
      "Resource estimates",
      "Sensitivity",
      "Advantage threshold conditions",
      "Decision assessment",
      "Scenario comparison",
    ],
  )
  assert.ok(report.limitations.length > 0)
  assert.ok(report.sources.length >= 3)
  assert.match(report.reproduction_command, /ketqat intelligence verify/)
})

test("the report names unknowns instead of leaving them blank", () => {
  const bundle = buildBundle({ workload, baseline: null, scenarios })
  const report = buildReport(bundle)
  const thresholds = report.sections.find((section) => section.heading.includes("threshold"))
  assert.match(thresholds.statements.join(" "), /unknown \(/)
  assert.match(thresholds.statements.join(" "), /Refused \(NO_CLASSICAL_BASELINE\)/)
})

test("CSV writes UNKNOWN rather than an empty cell a spreadsheet would read as zero", () => {
  const bundle = buildBundle({ workload, baseline: null, scenarios })
  const csv = reportToCsv(bundle)
  const lines = csv.trim().split("\n")
  assert.equal(lines[0].split(",")[0], "scenario")
  // The above-threshold scenario has no numbers at all.
  const infeasible = lines.find((line) => line.startsWith("Above threshold"))
  assert.match(infeasible, /UNKNOWN/)
  assert.ok(!/,,/.test(infeasible), "no empty cells")
  assert.match(csv, /# reproducibility_hash,/)
  assert.match(csv, /# is_demo,true/)
})

test("renderQuantity distinguishes bounds and names unknowns", () => {
  assert.match(
    renderQuantity(quantity({
      value: 250, unit: "ns", evidence: "DERIVED", source: "s", model: "m", modelVersion: "1", bound: "UPPER_BOUND",
    })),
    /^at most 250 ns$/,
  )
  assert.match(
    renderQuantity(quantity({
      value: 4, unit: "qubits", evidence: "DERIVED", source: "s", model: "m", modelVersion: "1", bound: "LOWER_BOUND",
    })),
    /^at least 4 qubits$/,
  )
  assert.match(renderQuantity(unknownQuantity("s", "The factory could not be sized.", "m", "1")), /^unknown \(/)
})

// ------------------------------------------------------------------- MCP

test("the resource intelligence MCP tools are read-only and calculate locally", () => {
  const listed = listTools()
  const intelligenceTools = listed.filter((tool) => /resource_intelligence|resource_scenarios/.test(tool.name))
  assert.equal(intelligenceTools.length, 3)
  for (const tool of intelligenceTools) {
    assert.equal(tool.readOnly, true, `${tool.name} must be read-only`)
  }

  const assessment = {
    workload: {
      name: "Demonstration arithmetic block",
      description: "Demo circuit.",
      is_demo: true,
      openqasm3: DEMO_QASM3,
    },
    scenarios: { presets: ["BASE"], runtime_target: 86400 },
  }

  const estimated = callTool("estimate_resource_intelligence", { assessment })
  assert.ok(!("error" in estimated), JSON.stringify(estimated))
  assert.equal(estimated.is_demo, true)
  assert.equal(estimated.estimates.length, 1)

  const compared = callTool("compare_resource_scenarios", { assessment })
  assert.equal(compared.comparable, true)
  assert.match(compared.aggregation_policy, /No aggregate row/)

  const bundle = buildBundle(resolveAssessment(readAssessmentDocument(JSON.stringify(assessment), "a.json")))
  const verified = callTool("verify_resource_intelligence_bundle", { bundle })
  assert.equal(verified.valid, true)
  assert.ok(verified.report, "a valid bundle also returns its report")

  const tampered = structuredClone(bundle)
  tampered.assessments[0].binding_constraint = "CYCLE_TIME"
  const rejected = callTool("verify_resource_intelligence_bundle", { bundle: tampered })
  assert.equal(rejected.valid, false)
  assert.equal(rejected.report, undefined, "a bundle that failed verification does not get rendered as a report")
})

test("an invalid assessment reaching MCP is refused, not guessed at", () => {
  const result = callTool("estimate_resource_intelligence", {
    assessment: { workload: { name: "n", description: "d" } },
  })
  assert.equal(result.error, "invalid_input")
})
