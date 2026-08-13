import { z } from "zod"
import { INTELLIGENCE_SCHEMA_VERSION, isKnown } from "./measurement.js"
import type { ResourceScenario } from "./scenario.js"
import type { QuantumWorkload } from "./workload.js"
import type { ResourceEstimateSnapshot, SensitivityParameter } from "./estimate.js"
import type { AdvantageThreshold } from "./thresholds.js"
import { INSUFFICIENT_ECONOMIC_EVIDENCE, type ClassicalBaseline } from "./baseline.js"

/**
 * The judgement, made in the open (ketqat-sdk#236).
 *
 * The obvious product here is a single number -- a "quantum readiness score" --
 * and it would be the worst thing this module could produce. A score fuses
 * physics, engineering, procurement, economics and evidence quality into one
 * figure, so a result that is scientifically impossible and one that is merely
 * unfunded arrive at the same place, and the reader has no way to ask which.
 *
 * Six dimensions are therefore assessed separately and never combined. The
 * overall status is a function of them, but it is a *stated* function -- the
 * ladder below is written out, its inputs are recorded as reason codes, and a
 * reader can check the conclusion against the rule rather than trusting it.
 *
 * Two statuses are gated structurally rather than by convention:
 * `POTENTIALLY_ECONOMIC` and `ECONOMICALLY_COMPETITIVE_UNDER_ASSUMPTIONS` are
 * unreachable unless a classical baseline *and* a quantum cost model are both
 * present and the comparison actually computed. Without them the assessment says
 * `Insufficient evidence for economic comparison` and stops, because a
 * conclusion about money drawn from no cost data is not a cautious conclusion,
 * it is a fabricated one.
 */

export const DecisionStatusSchema = z.enum([
  /** The physics does not permit this on the assumed device. Not "expensive". */
  "INFEASIBLE_UNDER_ASSUMPTIONS",
  /** Something required to answer was missing or could not be computed. */
  "INSUFFICIENT_EVIDENCE",
  /** Resources computed, but nothing concrete was checked against, so this informs research, not deployment. */
  "RESEARCH_ONLY",
  /** Resources computed and a stated constraint is violated. */
  "CONDITIONALLY_FEASIBLE",
  /** Resources computed and every stated technical constraint is met. */
  "TECHNICALLY_FEASIBLE",
  /** Technically feasible and one side of the economic comparison favours quantum. */
  "POTENTIALLY_ECONOMIC",
  /** Technically feasible, faster, and cheaper, under the stated assumptions only. */
  "ECONOMICALLY_COMPETITIVE_UNDER_ASSUMPTIONS",
])
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>

export const ReasonCodeSchema = z.enum([
  "ABOVE_SURFACE_CODE_THRESHOLD",
  "NO_DISTANCE_MEETS_BUDGET",
  "DISTILLATION_TARGET_UNREACHED",
  "FACTORY_NOT_SIZED",
  "FACTORY_DOMINATES_DEVICE",
  "CLIFFORD_ONLY_CIRCUIT",
  "EXCEEDS_STATED_CAPACITY",
  "WITHIN_STATED_CAPACITY",
  "NO_STATED_CAPACITY",
  "RUNTIME_EXCEEDS_TARGET",
  "RUNTIME_WITHIN_TARGET",
  "NO_RUNTIME_TARGET",
  "RUNTIME_LIMITED_BY_FACTORY",
  "RUNTIME_LIMITED_BY_LOGICAL_CYCLES",
  "NO_CLASSICAL_BASELINE",
  "NO_CLASSICAL_RUNTIME",
  "NO_CLASSICAL_COST",
  "NO_ECONOMIC_MODEL",
  "PROJECTED_COST_BELOW_CLASSICAL",
  "PROJECTED_COST_ABOVE_CLASSICAL",
  "RUNTIME_ADVANTAGE_UNDER_ASSUMPTIONS",
  "NO_RUNTIME_ADVANTAGE",
  "UNSUPPORTED_GATES_PRESENT",
  "T_COUNT_NOT_DETERMINED",
  "WORKLOAD_COUNTS_DERIVED_FROM_CIRCUIT",
  "WORKLOAD_COUNTS_USER_PROVIDED",
  "HARDWARE_BASIS_OBSERVATION",
  "HARDWARE_BASIS_ROADMAP",
  "HARDWARE_BASIS_USER_ASSUMPTION",
  "HARDWARE_CONFIDENCE_LOW",
  "BASELINE_MEASURED",
  "BASELINE_NOT_MEASURED",
  "HIGH_SENSITIVITY_TO_ERROR_RATE",
  "HIGH_MODEL_SPREAD",
  "HIGH_LAYOUT_SPREAD",
  "SENSITIVITY_WITHIN_ONE_ORDER",
  "DEMO_FIXTURE",
])
export type ReasonCode = z.infer<typeof ReasonCodeSchema>

export const BindingConstraintSchema = z.enum([
  "PHYSICAL_ERROR_RATE",
  "CODE_DISTANCE_ERROR_BUDGET",
  "MAGIC_STATE_THROUGHPUT",
  "FACTORY_FOOTPRINT",
  "TOTAL_PHYSICAL_QUBIT_CAPACITY",
  "LOGICAL_QUBIT_CAPACITY",
  "CYCLE_TIME",
  "NOT_DETERMINED",
])
export type BindingConstraint = z.infer<typeof BindingConstraintSchema>

export const DimensionNameSchema = z.enum([
  "SCIENTIFIC_FEASIBILITY",
  "ENGINEERING_FEASIBILITY",
  "HARDWARE_READINESS",
  "ECONOMIC_READINESS",
  "EVIDENCE_CONFIDENCE",
  "SENSITIVITY_RISK",
])
export type DimensionName = z.infer<typeof DimensionNameSchema>

export const DimensionStatusSchema = z.enum(["SATISFIED", "NOT_SATISFIED", "INSUFFICIENT_EVIDENCE"])
export type DimensionStatus = z.infer<typeof DimensionStatusSchema>

export const DimensionGradeSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNCHARACTERIZED"])
export type DimensionGrade = z.infer<typeof DimensionGradeSchema>

export const AssessmentDimensionSchema = z.object({
  dimension: DimensionNameSchema,
  status: DimensionStatusSchema,
  /**
   * A graded reading where one is meaningful.
   *
   * For `EVIDENCE_CONFIDENCE` the grade is the strength of the evidence. For
   * `SENSITIVITY_RISK` it is the size of the *risk*, so `HIGH` there is bad
   * while `HIGH` on evidence confidence is good; `status` carries the
   * good-or-bad reading in both cases so a consumer never has to know which way
   * a particular grade points.
   */
  grade: DimensionGradeSchema,
  reason_codes: z.array(ReasonCodeSchema),
  explanation: z.string().min(1),
})
export type AssessmentDimension = z.infer<typeof AssessmentDimensionSchema>

export const InfluentialAssumptionSchema = z.object({
  parameter: z.string().min(1),
  /** Highest total physical qubit count over the swept range divided by the lowest. */
  spread_factor: z.number().nullable(),
  note: z.string().min(1),
})
export type InfluentialAssumption = z.infer<typeof InfluentialAssumptionSchema>

export const DecisionAssessmentSchema = z.object({
  schema_version: z.string().min(1),
  scenario_name: z.string().min(1),
  scenario_revision: z.number().int().positive(),
  workload_name: z.string().min(1),
  is_demo: z.boolean(),
  status: DecisionStatusSchema,
  dimensions: z.array(AssessmentDimensionSchema).length(6),
  reason_codes: z.array(ReasonCodeSchema),
  explanation: z.string().min(1),
  missing_evidence: z.array(z.string().min(1)),
  binding_constraint: BindingConstraintSchema,
  binding_constraint_explanation: z.string().min(1),
  most_influential_assumptions: z.array(InfluentialAssumptionSchema),
  recommended_next_measurement: z.array(z.string().min(1)),
  uncertainty_warnings: z.array(z.string().min(1)),
})
export type DecisionAssessment = z.infer<typeof DecisionAssessmentSchema>

/** Ratio between the largest and smallest total footprint over one swept parameter. */
function spreadFor(estimate: ResourceEstimateSnapshot, parameter: SensitivityParameter): number | null {
  const values = estimate.sensitivity
    .filter((point) => point.parameter === parameter && point.total_physical_qubits !== null)
    .map((point) => point.total_physical_qubits as number)
    .filter((value) => value > 0)
  if (values.length < 2) return null
  return Math.max(...values) / Math.min(...values)
}

const PARAMETER_LABELS: Record<SensitivityParameter, string> = {
  PHYSICAL_ERROR_RATE: "physical error rate",
  LOGICAL_ERROR_PREFACTOR: "logical-error prefactor",
  LAYOUT_MODEL: "layout model",
  CYCLE_TIME: "surface-code cycle time",
  ERROR_BUDGET: "error budget",
  RAW_MAGIC_STATE_ERROR: "raw magic-state error",
}

const PARAMETER_NOTES: Record<SensitivityParameter, string> = {
  PHYSICAL_ERROR_RATE:
    "A device property. This uncertainty shrinks by measuring or improving the hardware.",
  LOGICAL_ERROR_PREFACTOR:
    "A fitted constant with no clear provenance. This uncertainty does not shrink by buying a better device.",
  LAYOUT_MODEL:
    "A convention about routing space. The bare-register reading is an underestimate, not an alternative.",
  CYCLE_TIME: "A device property, affecting runtime directly and footprint not at all.",
  ERROR_BUDGET: "A requirement you set, not a fact about the world.",
  RAW_MAGIC_STATE_ERROR: "A device property, driving the number of distillation levels and so the factory footprint.",
}

export function assessDecision(input: {
  workload: QuantumWorkload
  scenario: ResourceScenario
  baseline: ClassicalBaseline | null
  estimate: ResourceEstimateSnapshot
  threshold: AdvantageThreshold
}): DecisionAssessment {
  const { workload, scenario, baseline, estimate, threshold } = input
  const reasons = new Set<ReasonCode>()
  const missingEvidence: string[] = []
  const nextMeasurement: string[] = []
  const uncertaintyWarnings: string[] = []

  if (workload.is_demo) reasons.add("DEMO_FIXTURE")

  // ------------------------------------------------- scientific feasibility
  const scientificCodes: ReasonCode[] = []
  let scientificStatus: DimensionStatus = "SATISFIED"
  let scientificExplanation =
    `A code distance of ${estimate.code_distance.value} meets the ${scenario.error_budget} error budget at a ` +
    `physical error rate of ${scenario.hardware.physical_error_rate}, under the ${scenario.qec.scheme} model.`

  if (estimate.infeasibility_code === "ABOVE_SURFACE_CODE_THRESHOLD") {
    scientificStatus = "NOT_SATISFIED"
    scientificCodes.push("ABOVE_SURFACE_CODE_THRESHOLD")
    scientificExplanation = estimate.infeasibility_reason as string
  } else if (estimate.infeasibility_code === "NO_DISTANCE_MEETS_BUDGET") {
    scientificStatus = "NOT_SATISFIED"
    scientificCodes.push("NO_DISTANCE_MEETS_BUDGET")
    scientificExplanation = estimate.infeasibility_reason as string
  }
  if (workload.logical.unsupported_for_ft_count > 0) {
    scientificCodes.push("UNSUPPORTED_GATES_PRESENT")
    if (workload.logical.t_count === 0 && workload.logical.toffoli_count === 0) {
      scientificCodes.push("T_COUNT_NOT_DETERMINED")
      scientificStatus = "INSUFFICIENT_EVIDENCE"
      scientificExplanation =
        `${workload.logical.unsupported_for_ft_count} gate(s) are neither Clifford nor T and the circuit records no ` +
        "T or Toffoli gates, so the fault-tolerant cost cannot be determined at all until those gates are " +
        "synthesized into a Clifford+T basis."
      missingEvidence.push(
        "A Clifford+T synthesis of the non-Clifford, non-T gates in this circuit. Without it the T count, and " +
          "therefore every magic-state and factory figure, is not merely approximate but absent.",
      )
      nextMeasurement.push("Synthesize the unsupported gates into Clifford+T and re-run the estimate.")
    }
  }
  scientificCodes.forEach((code) => reasons.add(code))

  // ------------------------------------------------ engineering feasibility
  const engineeringCodes: ReasonCode[] = []
  let engineeringStatus: DimensionStatus = "SATISFIED"
  let engineeringExplanation: string

  if (!estimate.feasible) {
    engineeringStatus = "INSUFFICIENT_EVIDENCE"
    engineeringExplanation =
      "Not assessed: no feasible fault-tolerant configuration exists under these assumptions, so there is no " +
      "machine to engineer."
  } else if (!isKnown(estimate.total_physical_qubits)) {
    engineeringStatus = "INSUFFICIENT_EVIDENCE"
    engineeringCodes.push("FACTORY_NOT_SIZED", "DISTILLATION_TARGET_UNREACHED")
    engineeringExplanation =
      "The magic-state factory could not be sized, so no total machine size exists. The algorithm footprint is " +
      "reported as a component of the requirement, never as the requirement."
    missingEvidence.push(
      "A distillation configuration that reaches the target magic-state error. Until one exists the factory " +
        "footprint, and therefore the machine size, is not computed.",
    )
    nextMeasurement.push(
      "Lower the raw magic-state error, loosen the target state error, or select a distillation protocol that " +
        "reaches the target.",
    )
  } else {
    const total = estimate.total_physical_qubits.value
    engineeringExplanation =
      `The machine is ${Math.round(total).toLocaleString("en-US")} physical qubits: ` +
      `${Math.round(estimate.layout_adjusted_physical_qubits.value ?? 0).toLocaleString("en-US")} for the algorithm ` +
      `including routing space, and ${Math.round(estimate.factory_physical_qubits.value ?? 0).toLocaleString("en-US")} ` +
      "for the magic-state factory."
    if (isKnown(estimate.factory_share) && estimate.factory_share.value > 0.5) {
      engineeringCodes.push("FACTORY_DOMINATES_DEVICE")
      engineeringExplanation +=
        ` The factory is ${(estimate.factory_share.value * 100).toFixed(0)}% of the device, larger than the ` +
        "algorithm it feeds."
    }
    if (estimate.magic_state_count.value === 0) {
      engineeringCodes.push("CLIFFORD_ONLY_CIRCUIT")
      engineeringExplanation +=
        " This circuit consumes no magic states, so it needs no distillation factory at all."
    }
    if (estimate.runtime_limiter === "MAGIC_STATE_THROUGHPUT") {
      engineeringCodes.push("RUNTIME_LIMITED_BY_FACTORY")
    } else if (estimate.runtime_limiter === "LOGICAL_CYCLES") {
      engineeringCodes.push("RUNTIME_LIMITED_BY_LOGICAL_CYCLES")
    }
    if (scenario.runtime_target === null) {
      engineeringCodes.push("NO_RUNTIME_TARGET")
    } else if (isKnown(estimate.runtime)) {
      if (estimate.runtime.value > scenario.runtime_target) {
        engineeringCodes.push("RUNTIME_EXCEEDS_TARGET")
        engineeringStatus = "NOT_SATISFIED"
        engineeringExplanation +=
          ` The projected runtime of ${estimate.runtime.value.toPrecision(3)} s exceeds the ` +
          `${scenario.runtime_target} s target.`
      } else {
        engineeringCodes.push("RUNTIME_WITHIN_TARGET")
      }
    }
  }
  engineeringCodes.forEach((code) => reasons.add(code))

  // ---------------------------------------------------- hardware readiness
  const hardwareCodes: ReasonCode[] = []
  let hardwareStatus: DimensionStatus
  let hardwareExplanation: string
  const capacity = scenario.hardware.physical_qubit_capacity

  if (capacity === null) {
    hardwareStatus = "INSUFFICIENT_EVIDENCE"
    hardwareCodes.push("NO_STATED_CAPACITY")
    hardwareExplanation =
      "No physical qubit capacity is stated for this hardware model, so there is nothing to compare the " +
      "requirement against. A capacity was not assumed."
    missingEvidence.push(
      "The physical qubit capacity of the device under consideration. Without it, 'does it fit' has no answer.",
    )
    nextMeasurement.push(
      "State the physical qubit capacity of the target device, with a source and a date.",
    )
  } else if (!isKnown(estimate.total_physical_qubits)) {
    hardwareStatus = "INSUFFICIENT_EVIDENCE"
    hardwareExplanation =
      "The total machine size could not be computed, so it cannot be compared with the stated capacity."
  } else if (isKnown(threshold.capacity_headroom) && threshold.capacity_headroom.value >= 1) {
    hardwareStatus = "SATISFIED"
    hardwareCodes.push("WITHIN_STATED_CAPACITY")
    hardwareExplanation =
      `The requirement fits the stated capacity of ${capacity.toLocaleString("en-US")} physical qubits, with ` +
      `${threshold.capacity_headroom.value.toPrecision(3)}x headroom.`
  } else {
    hardwareStatus = "NOT_SATISFIED"
    hardwareCodes.push("EXCEEDS_STATED_CAPACITY")
    const shortfall = isKnown(threshold.capacity_headroom) ? 1 / threshold.capacity_headroom.value : null
    hardwareExplanation =
      `The requirement exceeds the stated capacity of ${capacity.toLocaleString("en-US")} physical qubits` +
      (shortfall === null ? "." : ` by ${shortfall.toPrecision(3)}x.`)
  }

  const basisCode: ReasonCode =
    scenario.hardware.basis === "OBSERVATION"
      ? "HARDWARE_BASIS_OBSERVATION"
      : scenario.hardware.basis === "ROADMAP"
        ? "HARDWARE_BASIS_ROADMAP"
        : "HARDWARE_BASIS_USER_ASSUMPTION"
  hardwareCodes.push(basisCode)
  if (scenario.hardware.confidence === "LOW") hardwareCodes.push("HARDWARE_CONFIDENCE_LOW")
  if (scenario.hardware.basis !== "OBSERVATION") {
    hardwareExplanation +=
      ` The device parameters are ${scenario.hardware.basis === "ROADMAP" ? "a published roadmap target" : "an assumption"}, ` +
      "not an observation of a working machine, so this reading is conditional on them being reached."
    missingEvidence.push(
      "A dated observation of a real device meeting these physical error rate and cycle time parameters.",
    )
  }
  hardwareCodes.forEach((code) => reasons.add(code))

  // ---------------------------------------------------- economic readiness
  const economicCodes: ReasonCode[] = []
  let economicStatus: DimensionStatus = "INSUFFICIENT_EVIDENCE"
  let economicExplanation = INSUFFICIENT_ECONOMIC_EVIDENCE
  const hasBaseline = baseline !== null && baseline.evidence !== "UNKNOWN"
  const hasEconomics = scenario.economics !== null

  if (!hasBaseline) {
    economicCodes.push("NO_CLASSICAL_BASELINE")
    economicExplanation =
      `${INSUFFICIENT_ECONOMIC_EVIDENCE}: no classical baseline was supplied, so there is nothing to be faster or ` +
      "cheaper than."
    missingEvidence.push(
      "A classical baseline: runtime, cost, hardware, problem size, solution quality, and the date it was measured.",
    )
    nextMeasurement.push(
      "Measure the current classical solution on the real problem size and record the hardware and date.",
    )
  } else {
    economicCodes.push(baseline.evidence === "MEASURED" ? "BASELINE_MEASURED" : "BASELINE_NOT_MEASURED")
    if (!hasEconomics) {
      economicCodes.push("NO_ECONOMIC_MODEL")
      economicExplanation =
        `${INSUFFICIENT_ECONOMIC_EVIDENCE}: no quantum machine-cost assumption was supplied. No price for ` +
        "fault-tolerant quantum machine time was assumed, because none exists to look up."
      missingEvidence.push(
        "A quantum cost model: what a machine-second, or a physical-qubit-second, is assumed to cost, and on whose authority.",
      )
      nextMeasurement.push(
        "State a quantum machine-cost assumption, even a hypothetical one, so the economic thresholds become computable.",
      )
    }
    if (baseline.runtime === null) {
      economicCodes.push("NO_CLASSICAL_RUNTIME")
    }
    if (baseline.monetary_cost === null) {
      economicCodes.push("NO_CLASSICAL_COST")
    }
  }

  // Pulled into locals so the null checks narrow: a boolean flag does not.
  const speedup: number | null = isKnown(threshold.runtime_speedup_over_classical)
    ? threshold.runtime_speedup_over_classical.value
    : null
  const costRatio: number | null = isKnown(threshold.cost_ratio_to_classical)
    ? threshold.cost_ratio_to_classical.value
    : null

  if (speedup !== null) {
    economicCodes.push(speedup > 1 ? "RUNTIME_ADVANTAGE_UNDER_ASSUMPTIONS" : "NO_RUNTIME_ADVANTAGE")
  }
  if (costRatio !== null) {
    economicCodes.push(
      costRatio < 1 ? "PROJECTED_COST_BELOW_CLASSICAL" : "PROJECTED_COST_ABOVE_CLASSICAL",
    )
  }

  if (hasBaseline && hasEconomics && (speedup !== null || costRatio !== null)) {
    const parts: string[] = []
    if (speedup !== null) {
      parts.push(
        `a projected ${speedup.toPrecision(3)}x runtime ratio against the ` +
          `${baseline.evidence.toLowerCase().replace("_", " ")} classical baseline`,
      )
    }
    if (costRatio !== null) {
      parts.push(`a projected cost ${costRatio.toPrecision(3)}x the classical cost`)
    }
    economicStatus =
      (speedup === null || speedup > 1) && (costRatio === null || costRatio < 1)
        ? "SATISFIED"
        : "NOT_SATISFIED"
    economicExplanation = `Under this scenario's stated cost model: ${parts.join(", and ")}.`
  }
  economicCodes.forEach((code) => reasons.add(code))

  // --------------------------------------------------- evidence confidence
  const evidenceCodes: ReasonCode[] = []
  evidenceCodes.push(
    workload.logical_counts_evidence === "DERIVED"
      ? "WORKLOAD_COUNTS_DERIVED_FROM_CIRCUIT"
      : "WORKLOAD_COUNTS_USER_PROVIDED",
  )
  let evidenceScore = 0
  if (workload.logical_counts_evidence === "DERIVED") evidenceScore += 1
  if (scenario.hardware.basis === "OBSERVATION") evidenceScore += 1
  if (scenario.hardware.confidence === "HIGH") evidenceScore += 1
  if (hasBaseline && baseline.evidence === "MEASURED") evidenceScore += 1
  if (hasEconomics && scenario.economics?.basis === "PUBLISHED_QUOTE") evidenceScore += 1
  const evidenceGrade: DimensionGrade = evidenceScore >= 4 ? "HIGH" : evidenceScore >= 2 ? "MEDIUM" : "LOW"
  const evidenceStatus: DimensionStatus = evidenceGrade === "LOW" ? "NOT_SATISFIED" : "SATISFIED"
  const evidenceExplanation =
    `Logical counts are ${workload.logical_counts_evidence}; hardware parameters are ${scenario.hardware.basis} ` +
    `at ${scenario.hardware.confidence} confidence; the classical baseline is ` +
    `${hasBaseline ? baseline.evidence : "absent"}; the quantum cost model is ` +
    `${hasEconomics ? (scenario.economics?.basis ?? "absent") : "absent"}. ` +
    "These are different kinds of claim and are not averaged into a score."
  evidenceCodes.forEach((code) => reasons.add(code))

  // ------------------------------------------------------- sensitivity risk
  const sensitivityCodes: ReasonCode[] = []
  const spreads: InfluentialAssumption[] = (
    [
      "PHYSICAL_ERROR_RATE",
      "LOGICAL_ERROR_PREFACTOR",
      "LAYOUT_MODEL",
      "ERROR_BUDGET",
      "RAW_MAGIC_STATE_ERROR",
      "CYCLE_TIME",
    ] as SensitivityParameter[]
  )
    .map((parameter) => ({
      parameter: PARAMETER_LABELS[parameter],
      spread_factor: spreadFor(estimate, parameter),
      note: PARAMETER_NOTES[parameter],
    }))
    .sort((left, right) => (right.spread_factor ?? 0) - (left.spread_factor ?? 0))

  const worstSpread = spreads[0]?.spread_factor ?? null
  let sensitivityGrade: DimensionGrade
  if (worstSpread === null) {
    sensitivityGrade = "UNCHARACTERIZED"
  } else if (worstSpread >= 10) {
    sensitivityGrade = "HIGH"
  } else if (worstSpread >= 2) {
    sensitivityGrade = "MEDIUM"
  } else {
    sensitivityGrade = "LOW"
  }
  const sensitivityStatus: DimensionStatus =
    sensitivityGrade === "UNCHARACTERIZED"
      ? "INSUFFICIENT_EVIDENCE"
      : sensitivityGrade === "HIGH"
        ? "NOT_SATISFIED"
        : "SATISFIED"

  const errorRateSpread = spreadFor(estimate, "PHYSICAL_ERROR_RATE")
  const modelSpread = spreadFor(estimate, "LOGICAL_ERROR_PREFACTOR")
  const layoutSpread = spreadFor(estimate, "LAYOUT_MODEL")
  if (errorRateSpread !== null && errorRateSpread >= 10) sensitivityCodes.push("HIGH_SENSITIVITY_TO_ERROR_RATE")
  if (modelSpread !== null && modelSpread >= 2) sensitivityCodes.push("HIGH_MODEL_SPREAD")
  if (layoutSpread !== null && layoutSpread >= 2) sensitivityCodes.push("HIGH_LAYOUT_SPREAD")
  if (worstSpread !== null && worstSpread < 10) sensitivityCodes.push("SENSITIVITY_WITHIN_ONE_ORDER")

  const sensitivityExplanation =
    worstSpread === null
      ? "No sensitivity spread could be computed, because the estimate produced no total machine size to vary."
      : `The widest spread comes from the ${spreads[0].parameter}: a ${worstSpread.toPrecision(3)}x range in total ` +
        "physical qubits across the swept values. " +
        (modelSpread !== null && modelSpread >= 2
          ? `The fitted logical-error prefactor alone moves the answer by ${modelSpread.toPrecision(3)}x, and that ` +
            "uncertainty is not reducible by improving the hardware."
          : "")

  if (modelSpread !== null && modelSpread >= 2) {
    uncertaintyWarnings.push(
      `Choosing the other published logical-error prefactor changes the total physical qubit count by ` +
        `${modelSpread.toPrecision(3)}x. The prefactor is fitted and its provenance is weak; no measurement narrows it.`,
    )
  }
  if (layoutSpread !== null && layoutSpread >= 2) {
    uncertaintyWarnings.push(
      `The two layout conventions differ by ${layoutSpread.toPrecision(3)}x in total physical qubits. These are not ` +
        "equally defensible: routing space is real hardware, so the bare-register figure is an underestimate.",
    )
  }
  if (errorRateSpread !== null && errorRateSpread >= 10) {
    uncertaintyWarnings.push(
      `A factor-of-four change in the physical error rate changes the machine size by ${errorRateSpread.toPrecision(3)}x. ` +
        "Quoting the point estimate without this range presents it as more precise than it is.",
    )
  }
  sensitivityCodes.forEach((code) => reasons.add(code))

  // ------------------------------------------------------ binding constraint
  let binding: BindingConstraint = "NOT_DETERMINED"
  let bindingExplanation = "No binding constraint could be identified under these assumptions."

  if (estimate.infeasibility_code === "ABOVE_SURFACE_CODE_THRESHOLD") {
    binding = "PHYSICAL_ERROR_RATE"
    bindingExplanation =
      "The binding constraint is the physical error rate. It is at or above the code's threshold, where adding " +
      "distance makes the logical error rate worse rather than better."
  } else if (estimate.infeasibility_code === "NO_DISTANCE_MEETS_BUDGET") {
    binding = "CODE_DISTANCE_ERROR_BUDGET"
    bindingExplanation =
      "The binding constraint is the error budget against the achievable code distance: no distance within the " +
      "search bound meets it at this error rate and circuit size."
  } else if (hardwareStatus === "NOT_SATISFIED") {
    binding = "TOTAL_PHYSICAL_QUBIT_CAPACITY"
    bindingExplanation =
      "The binding constraint is total physical qubit capacity: the machine this workload needs is larger than " +
      "the device stated for it."
  } else if (engineeringCodes.includes("RUNTIME_EXCEEDS_TARGET")) {
    binding =
      estimate.runtime_limiter === "MAGIC_STATE_THROUGHPUT" ? "MAGIC_STATE_THROUGHPUT" : "CYCLE_TIME"
    bindingExplanation =
      binding === "MAGIC_STATE_THROUGHPUT"
        ? "The binding constraint is magic-state throughput, not logical-qubit capacity: the run misses its target " +
          "because distilled states cannot be produced fast enough, not because the logical circuit is long."
        : "The binding constraint is the surface-code cycle time: the run misses its target because logical cycles " +
          "take too long, and the factory keeps up."
  } else if (estimate.runtime_limiter === "MAGIC_STATE_THROUGHPUT") {
    binding = "MAGIC_STATE_THROUGHPUT"
    bindingExplanation =
      "The binding constraint is magic-state throughput, not logical-qubit capacity: the runtime is set by how " +
      "fast distilled states arrive rather than by the depth of the logical circuit."
  } else if (isKnown(estimate.factory_share) && estimate.factory_share.value > 0.5) {
    binding = "FACTORY_FOOTPRINT"
    bindingExplanation =
      `The binding constraint is the magic-state factory footprint: it occupies ` +
      `${(estimate.factory_share.value * 100).toFixed(0)}% of the machine, more than the algorithm it feeds.`
  } else if (estimate.feasible) {
    binding = "LOGICAL_QUBIT_CAPACITY"
    bindingExplanation =
      `The binding constraint is logical-qubit capacity: the algorithm register and its routing space occupy ` +
      `${estimate.occupied_logical_qubits.value} logical patches, which dominate the footprint.`
  }

  // ------------------------------------------------------------ overall status
  let status: DecisionStatus
  if (!estimate.feasible) {
    status = "INFEASIBLE_UNDER_ASSUMPTIONS"
  } else if (scientificStatus === "INSUFFICIENT_EVIDENCE" || engineeringStatus === "INSUFFICIENT_EVIDENCE") {
    status = "INSUFFICIENT_EVIDENCE"
  } else if (hardwareStatus === "NOT_SATISFIED" || engineeringStatus === "NOT_SATISFIED") {
    status = "CONDITIONALLY_FEASIBLE"
  } else if (capacity === null && scenario.runtime_target === null) {
    // Nothing concrete was checked against, so nothing concrete was established.
    status = "RESEARCH_ONLY"
  } else {
    status = "TECHNICALLY_FEASIBLE"
  }

  // The economic ladder is reachable only from a technically sound result with
  // both halves of the comparison present. This is the structural gate.
  const economicComparisonAvailable = hasBaseline && hasEconomics && (speedup !== null || costRatio !== null)
  if (
    economicComparisonAvailable &&
    (status === "TECHNICALLY_FEASIBLE" || status === "RESEARCH_ONLY")
  ) {
    const fasterThanClassical = speedup !== null && speedup > 1
    const cheaperThanClassical = costRatio !== null && costRatio < 1
    if (fasterThanClassical && cheaperThanClassical) {
      status = "ECONOMICALLY_COMPETITIVE_UNDER_ASSUMPTIONS"
    } else if (fasterThanClassical || cheaperThanClassical) {
      status = "POTENTIALLY_ECONOMIC"
    }
  }

  // ------------------------------------------------------------- explanation
  const sentences: string[] = []
  if (status === "INFEASIBLE_UNDER_ASSUMPTIONS") {
    sentences.push(estimate.infeasibility_reason as string)
  } else if (status === "INSUFFICIENT_EVIDENCE") {
    sentences.push(
      "The computation cannot be assessed under this model because a required component could not be computed.",
    )
    sentences.push(engineeringExplanation)
  } else {
    const machine = isKnown(estimate.total_physical_qubits)
      ? `${Math.round(estimate.total_physical_qubits.value).toLocaleString("en-US")} physical qubits`
      : "an undetermined machine size"
    const time = isKnown(estimate.runtime) ? `${estimate.runtime.value.toPrecision(3)} s` : "an undetermined runtime"
    sentences.push(
      `Under this model the computation needs ${machine} and ${time} at code distance ` +
        `${estimate.code_distance.value}.`,
    )
    if (!hasBaseline || !hasEconomics) {
      sentences.push(
        `The computation is technically feasible under this model, but no economic conclusion can be made because ` +
          (!hasBaseline
            ? "no classical baseline was supplied."
            : "no quantum machine-cost assumption was supplied."),
      )
    }
  }
  sentences.push(bindingExplanation)
  if (isKnown(threshold.max_cycle_time_to_beat_classical_runtime)) {
    sentences.push(
      `A surface-code cycle below ${threshold.max_cycle_time_to_beat_classical_runtime.value.toPrecision(3)} ns ` +
        "would be required to beat the supplied classical runtime.",
    )
  } else if (isKnown(threshold.max_cycle_time_for_runtime_target)) {
    sentences.push(
      `A surface-code cycle below ${threshold.max_cycle_time_for_runtime_target.value.toPrecision(3)} ns would be ` +
        `required to finish within the ${scenario.runtime_target} s target.`,
    )
  }
  if (workload.is_demo) {
    sentences.push(
      "This assessment is built from a demonstration fixture and is not evidence about any real workload or device.",
    )
  }

  if (binding === "MAGIC_STATE_THROUGHPUT") {
    nextMeasurement.push(
      "Characterize magic-state factory throughput on the target architecture: it, not logical-qubit count, sets " +
        "the runtime here.",
    )
  }
  if (binding === "PHYSICAL_ERROR_RATE" || (errorRateSpread !== null && errorRateSpread >= 10)) {
    nextMeasurement.push(
      "Measure the two-qubit physical error rate on the target device. It is the parameter this result depends on " +
        "most, and it is measurable.",
    )
  }
  if (nextMeasurement.length === 0) {
    nextMeasurement.push(
      "Replace the assumed device parameters with a dated measurement of a real device, so the result rests on an " +
        "observation rather than a convention.",
    )
  }

  return DecisionAssessmentSchema.parse({
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    scenario_name: scenario.name,
    scenario_revision: scenario.revision,
    workload_name: workload.name,
    is_demo: workload.is_demo,
    status,
    dimensions: [
      {
        dimension: "SCIENTIFIC_FEASIBILITY",
        status: scientificStatus,
        grade: "UNCHARACTERIZED",
        reason_codes: scientificCodes,
        explanation: scientificExplanation,
      },
      {
        dimension: "ENGINEERING_FEASIBILITY",
        status: engineeringStatus,
        grade: "UNCHARACTERIZED",
        reason_codes: engineeringCodes,
        explanation: engineeringExplanation,
      },
      {
        dimension: "HARDWARE_READINESS",
        status: hardwareStatus,
        grade: scenario.hardware.confidence,
        reason_codes: hardwareCodes,
        explanation: hardwareExplanation,
      },
      {
        dimension: "ECONOMIC_READINESS",
        status: economicStatus,
        grade: "UNCHARACTERIZED",
        reason_codes: economicCodes,
        explanation: economicExplanation,
      },
      {
        dimension: "EVIDENCE_CONFIDENCE",
        status: evidenceStatus,
        grade: evidenceGrade,
        reason_codes: evidenceCodes,
        explanation: evidenceExplanation,
      },
      {
        dimension: "SENSITIVITY_RISK",
        status: sensitivityStatus,
        grade: sensitivityGrade,
        reason_codes: sensitivityCodes,
        explanation: sensitivityExplanation,
      },
    ],
    reason_codes: [...reasons].sort(),
    explanation: sentences.join(" "),
    missing_evidence: [...new Set(missingEvidence)],
    binding_constraint: binding,
    binding_constraint_explanation: bindingExplanation,
    // All six, sorted most-influential first, rather than a top-three slice.
    // Truncating hides the ones a reader most needs to see are *not* the
    // device parameters -- the fitted prefactor routinely ranks below the
    // error rate while being the uncertainty nobody can measure away.
    most_influential_assumptions: spreads,
    recommended_next_measurement: [...new Set(nextMeasurement)],
    uncertainty_warnings: uncertaintyWarnings,
  })
}
