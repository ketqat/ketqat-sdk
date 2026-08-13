import { z } from "zod"
import { INTELLIGENCE_SCHEMA_VERSION } from "./measurement.js"
import { SURFACE_CODE_PREFACTOR, SURFACE_CODE_THRESHOLD } from "../engine/fault-tolerant.js"

/**
 * A named, versioned set of assumptions (ketqat-sdk#236).
 *
 * The central claim of this module is that a resource estimate is a function of
 * its assumptions, and that the assumptions are more interesting than the
 * number. A scenario is therefore a first-class record with an identity, not a
 * bag of optional overrides passed to an estimator and then discarded.
 *
 * Scenarios are immutable. Editing one produces a new revision that supersedes
 * the old, because an estimate whose assumptions were quietly changed underneath
 * it is not reproducible, and a comparison between "the scenario before you
 * edited it" and "the scenario after" is the single most useful comparison the
 * product can offer.
 *
 * **The presets are not difficulty settings.** An "optimistic" preset that
 * reached better numbers by choosing a friendlier fitted constant would be
 * arbitrary in exactly the way this product exists to avoid. The three presets
 * therefore vary only *device* parameters -- the physical error rate, the cycle
 * time, the available capacity -- which are things a device either does or does
 * not achieve and which a reader can check. The fitted logical-error prefactor,
 * the threshold, the error budget and the layout convention are identical across
 * all three, and the uncertainty they carry is reported as model sensitivity on
 * every scenario rather than baked into one of them.
 */

export const HardwareArchitectureSchema = z.enum([
  "SUPERCONDUCTING",
  "TRAPPED_ION",
  "NEUTRAL_ATOM",
  "PHOTONIC",
  "SPIN",
  /** Not a specific device: a conventional set of numbers used in the literature. */
  "GENERIC_REFERENCE",
])
export type HardwareArchitecture = z.infer<typeof HardwareArchitectureSchema>

/**
 * What kind of statement a hardware snapshot is.
 *
 * A vendor's current measured performance and a vendor's published roadmap
 * target are not the same data and must never be stored as though they were. The
 * distinction is a required enum rather than a note, so a query for "what do
 * devices do today" cannot accidentally return a projection.
 */
export const HardwareBasisSchema = z.enum(["OBSERVATION", "ROADMAP", "USER_ASSUMPTION"])
export type HardwareBasis = z.infer<typeof HardwareBasisSchema>

export const ConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const HardwareModelSnapshotSchema = z
  .object({
    schema_version: z.string().min(1),
    /** Provider name, or a generic architecture name when this is a convention. */
    name: z.string().min(1),
    architecture: HardwareArchitectureSchema,
    basis: HardwareBasisSchema,
    /** Two-qubit physical error rate under circuit-level depolarizing noise. */
    physical_error_rate: z.number().positive().max(1),
    /** Surface-code cycle time in nanoseconds. */
    cycle_time_ns: z.number().positive(),
    /** Physical qubits the device has, or null when unstated. Never guessed. */
    physical_qubit_capacity: z.number().int().positive().nullable(),
    /** Operations this snapshot characterizes, so an uncharacterized gate is visible. */
    operations: z.array(z.string().min(1)),
    source: z.string().min(1),
    source_url: z.string().url().nullable(),
    /** ISO date the source was published. */
    source_published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** ISO date the source was read. Distinct from publication: a page can change. */
    retrieved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    confidence: ConfidenceSchema,
    limitations: z.array(z.string().min(1)),
    snapshot_version: z.string().min(1),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.basis === "OBSERVATION" || snapshot.basis === "ROADMAP") {
      if (!snapshot.source_url) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A ${snapshot.basis} snapshot must cite a source URL. An uncited observation is an assumption.`,
          path: ["source_url"],
        })
      }
      if (!snapshot.source_published_on) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A ${snapshot.basis} snapshot must record when its source was published.`,
          path: ["source_published_on"],
        })
      }
      if (!snapshot.retrieved_on) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A ${snapshot.basis} snapshot must record when its source was retrieved.`,
          path: ["retrieved_on"],
        })
      }
    }
  })
export type HardwareModelSnapshot = z.infer<typeof HardwareModelSnapshotSchema>

export const QecSchemeSchema = z.enum(["SURFACE_CODE_ROTATED"])
export type QecScheme = z.infer<typeof QecSchemeSchema>

export const QecModelSnapshotSchema = z.object({
  schema_version: z.string().min(1),
  scheme: QecSchemeSchema,
  /** Threshold below which adding distance helps. A property of code and decoder. */
  threshold: z.number().positive().max(1),
  /** Fitted prefactor A in p_L = A (p/p_th)^((d+1)/2). Not derived; named below. */
  prefactor: z.number().positive(),
  prefactor_model: z.string().min(1),
  /** Physical qubits per logical patch, as a multiple of d^2. */
  qubits_per_logical_d_squared: z.number().positive(),
  /** Surface-code rounds per logical cycle. `d` for the standard construction. */
  rounds_per_logical_cycle: z.enum(["DISTANCE"]),
  source: z.string().min(1),
  limitations: z.array(z.string().min(1)),
})
export type QecModelSnapshot = z.infer<typeof QecModelSnapshotSchema>

export const LayoutModelSchema = z.enum([
  /** One patch per logical qubit, no routing space. An underestimate, kept for continuity. */
  "BARE_REGISTER",
  /** 2n + ceil(sqrt(8n)) + 1, after Beverland et al. (2022). Verified against qdk 1.30.0. */
  "LATTICE_SURGERY_2D",
])
export type LayoutModel = z.infer<typeof LayoutModelSchema>

export const FactoryProtocolSchema = z.enum(["FIFTEEN_TO_ONE", "NONE"])
export type FactoryProtocol = z.infer<typeof FactoryProtocolSchema>

export const FactoryAssumptionsSchema = z
  .object({
    protocol: FactoryProtocolSchema,
    /** Error of raw magic states before distillation. */
    raw_state_error: z.number().positive().max(1),
    /** Error each distilled state must reach. */
    target_state_error: z.number().positive().max(1),
    /** Code distance inside the factory. Null means "use the algorithm distance". */
    factory_distance: z.number().int().positive().nullable(),
    /** Factories running in parallel. Sets throughput, and multiplies footprint. */
    parallel_factories: z.number().int().positive(),
    /**
     * Surface-code rounds one distillation round occupies.
     *
     * Needed to turn a level count into a throughput. A space estimate alone
     * cannot answer "can the factory keep up", which is frequently the binding
     * constraint.
     */
    rounds_per_distillation: z.number().int().positive(),
  })
  .superRefine((factory, context) => {
    if (
      factory.factory_distance !== null &&
      (factory.factory_distance < 3 || factory.factory_distance % 2 === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A surface-code distance must be an odd integer of at least 3, got ${factory.factory_distance}. ` +
          "Use null to inherit the algorithm's distance.",
        path: ["factory_distance"],
      })
    }
    if (factory.protocol === "FIFTEEN_TO_ONE" && factory.target_state_error >= factory.raw_state_error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The target state error is not below the raw state error, so distillation has nothing to do. " +
          "Either the raw error is already good enough, or the two were entered the wrong way round.",
        path: ["target_state_error"],
      })
    }
  })
export type FactoryAssumptions = z.infer<typeof FactoryAssumptionsSchema>

export const DecompositionSchema = z.object({
  /** T gates one Toffoli costs. 4 in the standard decomposition. */
  toffoli_t_cost: z.number().int().positive(),
  /** How unsupported gates are handled. Refusing is the honest default. */
  unsupported_gate_policy: z.enum(["REFUSE", "REPORT_AS_UNDERESTIMATE"]),
  source: z.string().min(1),
})
export type Decomposition = z.infer<typeof DecompositionSchema>

export const EconomicBasisSchema = z.enum(["USER_PROVIDED", "PUBLISHED_QUOTE", "MODELLED"])
export type EconomicBasis = z.infer<typeof EconomicBasisSchema>

/**
 * What a quantum machine is assumed to cost.
 *
 * Optional, and absent by default in every preset. No price for a fault-tolerant
 * quantum computer exists to be looked up, and inventing one would turn every
 * economic threshold in this module into a number derived from a guess and
 * presented as a finding. With no economic model the economic thresholds are
 * refused by name.
 */
export const EconomicModelSchema = z
  .object({
    schema_version: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/),
    basis: EconomicBasisSchema,
    machine_cost_per_second: z.number().nonnegative().nullable(),
    physical_qubit_cost_per_second: z.number().nonnegative().nullable(),
    source: z.string().min(1),
    limitations: z.array(z.string().min(1)),
  })
  .superRefine((model, context) => {
    if (model.machine_cost_per_second === null && model.physical_qubit_cost_per_second === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "An economic model with no cost at all is not a model. Supply one of the two rates, or omit the model " +
          "so the economic thresholds are refused rather than computed from nothing.",
        path: ["machine_cost_per_second"],
      })
    }
  })
export type EconomicModel = z.infer<typeof EconomicModelSchema>

export const ScenarioPresetSchema = z.enum(["CONSERVATIVE", "BASE", "OPTIMISTIC", "CUSTOM"])
export type ScenarioPreset = z.infer<typeof ScenarioPresetSchema>

export const ResourceScenarioSchema = z
  .object({
    schema_version: z.string().min(1),
    name: z.string().min(1),
    preset: ScenarioPresetSchema,
    /** Starts at 1. A change produces revision n+1; it never rewrites revision n. */
    revision: z.number().int().positive(),
    /** Hash of the revision this one replaces, or null for the first. */
    supersedes: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    /** Why these assumptions. A scenario without a stated rationale is an unlabelled knob. */
    rationale: z.string().min(1),
    hardware: HardwareModelSnapshotSchema,
    qec: QecModelSnapshotSchema,
    layout_model: LayoutModelSchema,
    factory: FactoryAssumptionsSchema,
    decomposition: DecompositionSchema,
    /** Total probability of any logical error across the whole computation. */
    error_budget: z.number().positive().max(1),
    /** Seconds the computation must finish within, or null when unconstrained. */
    runtime_target: z.number().positive().nullable(),
    economics: EconomicModelSchema.nullable(),
    estimator: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
    }),
  })
  .superRefine((scenario, context) => {
    if (scenario.revision > 1 && scenario.supersedes === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A revision after the first must name the revision it supersedes.",
        path: ["supersedes"],
      })
    }
    if (scenario.revision === 1 && scenario.supersedes !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The first revision supersedes nothing.",
        path: ["supersedes"],
      })
    }
  })
export type ResourceScenario = z.infer<typeof ResourceScenarioSchema>

export const INTELLIGENCE_ESTIMATOR = "ketqat-resource-intelligence"
export const INTELLIGENCE_ESTIMATOR_VERSION = "0.1.0"

/**
 * The conventional surface-code model.
 *
 * Identical in all three presets on purpose: see the module note. The prefactor
 * is fitted and its provenance is weak -- Qualtran's own implementation says of
 * it "The pre-factor $a$ has no clear provenance" -- so the alternative published
 * value is reported as model sensitivity on every estimate rather than being
 * assigned to one preset.
 */
export const CONVENTIONAL_QEC_MODEL: QecModelSnapshot = QecModelSnapshotSchema.parse({
  schema_version: INTELLIGENCE_SCHEMA_VERSION,
  scheme: "SURFACE_CODE_ROTATED",
  threshold: SURFACE_CODE_THRESHOLD,
  prefactor: SURFACE_CODE_PREFACTOR,
  prefactor_model: "Fowler conventional",
  qubits_per_logical_d_squared: 2,
  rounds_per_logical_cycle: "DISTANCE",
  source:
    "Rotated surface code under circuit-level depolarizing noise; threshold ~1% and p_L = 0.03 (p/p_th)^((d+1)/2) " +
    "after Fowler et al. (2012), arXiv:1208.0928.",
  limitations: [
    "The prefactor is fitted, not derived; the alternative published value 0.1 is reported as model sensitivity.",
    "Leading-order logical error only; no decoder-specific correction is applied.",
    "One QEC scheme is modelled in this version. Other codes are not costed.",
  ],
})

const STANDARD_DECOMPOSITION: Decomposition = {
  toffoli_t_cost: 4,
  unsupported_gate_policy: "REPORT_AS_UNDERESTIMATE",
  source: "Standard Clifford+T decomposition: one Toffoli costs 4 T gates.",
}

function referenceHardware(input: {
  name: string
  physicalErrorRate: number
  cycleTimeNs: number
  capacity: number | null
  source: string
  confidence: Confidence
  limitations: string[]
}): HardwareModelSnapshot {
  return HardwareModelSnapshotSchema.parse({
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    name: input.name,
    architecture: "GENERIC_REFERENCE",
    // These are conventions drawn from the literature, not observations of any
    // particular machine. Recording them as OBSERVATION would attribute a
    // measurement to a device that was never measured here.
    basis: "USER_ASSUMPTION",
    physical_error_rate: input.physicalErrorRate,
    cycle_time_ns: input.cycleTimeNs,
    physical_qubit_capacity: input.capacity,
    operations: ["two-qubit entangling gate", "measurement", "reset"],
    source: input.source,
    source_url: null,
    source_published_on: null,
    retrieved_on: null,
    confidence: input.confidence,
    limitations: input.limitations,
    snapshot_version: "0.1.0",
  })
}

function factoryFor(rawStateError: number): FactoryAssumptions {
  return FactoryAssumptionsSchema.parse({
    protocol: "FIFTEEN_TO_ONE",
    raw_state_error: rawStateError,
    target_state_error: 1e-10,
    factory_distance: null,
    parallel_factories: 1,
    // One 15-to-1 block is conventionally costed at a small constant multiple of
    // the code distance in rounds. 10d is the figure used here and it is a model,
    // not a measurement; it only affects throughput, never footprint.
    rounds_per_distillation: 10,
  })
}

interface PresetShape {
  name: string
  preset: ScenarioPreset
  rationale: string
  hardware: HardwareModelSnapshot
  factory: FactoryAssumptions
}

const PRESET_SHAPES: readonly PresetShape[] = [
  {
    name: "Conservative",
    preset: "CONSERVATIVE",
    rationale:
      "Device parameters at the pessimistic end of what good superconducting hardware has demonstrated. " +
      "Chosen so that a favourable answer here is not an artefact of favourable assumptions.",
    hardware: referenceHardware({
      name: "Generic reference device, conservative parameters",
      physicalErrorRate: 3e-3,
      cycleTimeNs: 1000,
      capacity: null,
      source:
        "A conventional pessimistic reading of demonstrated two-qubit error rates on superconducting devices, " +
        "with the 1 microsecond surface-code cycle used throughout the fault-tolerance literature.",
      confidence: "MEDIUM",
      limitations: [
        "Not an observation of any specific device; a convention chosen to bound the optimistic case.",
        "No capacity is asserted, so capacity-dependent thresholds are refused rather than guessed.",
      ],
    }),
    factory: factoryFor(3e-3),
  },
  {
    name: "Base",
    preset: "BASE",
    rationale:
      "The parameters most fault-tolerance resource analyses use: a 1e-3 physical error rate and a 1 microsecond " +
      "surface-code cycle. Comparable with published estimates that state the same assumptions.",
    hardware: referenceHardware({
      name: "Generic reference device, standard literature parameters",
      physicalErrorRate: 1e-3,
      cycleTimeNs: 1000,
      capacity: null,
      source:
        "The physical error rate and cycle time used as the standard case in surface-code resource analyses, " +
        "for example Gidney and Ekera (2019), arXiv:1905.09749.",
      confidence: "MEDIUM",
      limitations: [
        "A convention, not a device. Two machines meeting this error rate can differ in every other respect.",
        "No capacity is asserted, so capacity-dependent thresholds are refused rather than guessed.",
      ],
    }),
    factory: factoryFor(1e-3),
  },
  {
    name: "Optimistic",
    preset: "OPTIMISTIC",
    rationale:
      "Device parameters an order of magnitude better than the standard case, and a five-times faster cycle. " +
      "This is a target, not an observation: it states what hardware would have to reach, which is the question " +
      "the threshold engine answers rather than a prediction that it will.",
    hardware: referenceHardware({
      name: "Generic reference device, improvement-target parameters",
      physicalErrorRate: 1e-4,
      cycleTimeNs: 200,
      capacity: null,
      source:
        "An improvement target stated for comparison, not a measurement or a vendor roadmap. No device is claimed " +
        "to achieve these parameters.",
      confidence: "LOW",
      limitations: [
        "A target. Treating it as a forecast would make every downstream number a forecast too.",
        "No capacity is asserted, so capacity-dependent thresholds are refused rather than guessed.",
      ],
    }),
    factory: factoryFor(1e-4),
  },
]

export interface PresetOptions {
  /** Total logical error probability allowed. Same across presets by default. */
  errorBudget?: number
  /** Seconds the computation must finish within. */
  runtimeTarget?: number | null
  /** Quantum machine cost. Absent by default; nothing invents one. */
  economics?: EconomicModel | null
  layoutModel?: LayoutModel
  /** Device capacity, applied to every preset when the user knows their machine. */
  physicalQubitCapacity?: number | null
}

/**
 * The three presets, as concrete assumption sets.
 *
 * Options apply uniformly. Giving one preset a looser error budget than another
 * would make the comparison meaningless, so the budget is not a per-preset knob.
 */
export function presetScenarios(options: PresetOptions = {}): ResourceScenario[] {
  const errorBudget = options.errorBudget ?? 1e-2
  const runtimeTarget = options.runtimeTarget ?? null
  const economics = options.economics ?? null
  const layoutModel = options.layoutModel ?? "LATTICE_SURGERY_2D"
  const capacity = options.physicalQubitCapacity ?? null

  return PRESET_SHAPES.map((shape) =>
    ResourceScenarioSchema.parse({
      schema_version: INTELLIGENCE_SCHEMA_VERSION,
      name: shape.name,
      preset: shape.preset,
      revision: 1,
      supersedes: null,
      rationale: shape.rationale,
      hardware:
        capacity === null
          ? shape.hardware
          : HardwareModelSnapshotSchema.parse({ ...shape.hardware, physical_qubit_capacity: capacity }),
      qec: CONVENTIONAL_QEC_MODEL,
      layout_model: layoutModel,
      factory: shape.factory,
      decomposition: STANDARD_DECOMPOSITION,
      error_budget: errorBudget,
      runtime_target: runtimeTarget,
      economics,
      estimator: { name: INTELLIGENCE_ESTIMATOR, version: INTELLIGENCE_ESTIMATOR_VERSION },
    }),
  )
}

/**
 * Whether two scenarios' estimates may be placed in the same comparison.
 *
 * Two scenarios differing in their *device* are exactly what this product
 * compares. Two differing in estimator, QEC scheme, threshold, prefactor, error
 * budget or Toffoli decomposition are measuring different things, and a table
 * placing them side by side under one column heading is a category error.
 */
export function scenariosComparable(
  left: ResourceScenario,
  right: ResourceScenario,
): { comparable: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (left.estimator.name !== right.estimator.name) {
    reasons.push(
      `Different estimators ('${left.estimator.name}' and '${right.estimator.name}') define these quantities differently.`,
    )
  } else if (left.estimator.version !== right.estimator.version) {
    reasons.push(
      `Same estimator at different versions ('${left.estimator.version}' and '${right.estimator.version}').`,
    )
  }
  if (left.qec.scheme !== right.qec.scheme) {
    reasons.push(`Different QEC schemes ('${left.qec.scheme}' and '${right.qec.scheme}').`)
  }
  if (left.qec.threshold !== right.qec.threshold || left.qec.prefactor !== right.qec.prefactor) {
    reasons.push(
      `Different logical-error models ('${left.qec.prefactor_model}' and '${right.qec.prefactor_model}'). ` +
        "Varying a fitted constant between scenarios hides which difference caused the result.",
    )
  }
  if (left.error_budget !== right.error_budget) {
    reasons.push(
      `Different error budgets (${left.error_budget} and ${right.error_budget}). A cheaper result under a looser ` +
        "budget is not a better result.",
    )
  }
  if (left.decomposition.toffoli_t_cost !== right.decomposition.toffoli_t_cost) {
    reasons.push(
      `Different Toffoli decompositions (${left.decomposition.toffoli_t_cost} T and ${right.decomposition.toffoli_t_cost} T).`,
    )
  }
  return { comparable: reasons.length === 0, reasons }
}

/** Produce the next revision of a scenario, superseding the current one. */
export function reviseScenario(
  current: ResourceScenario,
  changes: Partial<Omit<ResourceScenario, "revision" | "supersedes" | "schema_version">>,
  currentHash: string,
): ResourceScenario {
  return ResourceScenarioSchema.parse({
    ...current,
    ...changes,
    preset: changes.preset ?? (current.preset === "CUSTOM" ? "CUSTOM" : "CUSTOM"),
    revision: current.revision + 1,
    supersedes: currentHash,
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
  })
}
