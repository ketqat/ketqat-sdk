import { z } from "zod";
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
export declare const HardwareArchitectureSchema: z.ZodEnum<{
    GENERIC_REFERENCE: "GENERIC_REFERENCE";
    NEUTRAL_ATOM: "NEUTRAL_ATOM";
    PHOTONIC: "PHOTONIC";
    SPIN: "SPIN";
    SUPERCONDUCTING: "SUPERCONDUCTING";
    TRAPPED_ION: "TRAPPED_ION";
}>;
export type HardwareArchitecture = z.infer<typeof HardwareArchitectureSchema>;
/**
 * What kind of statement a hardware snapshot is.
 *
 * A vendor's current measured performance and a vendor's published roadmap
 * target are not the same data and must never be stored as though they were. The
 * distinction is a required enum rather than a note, so a query for "what do
 * devices do today" cannot accidentally return a projection.
 */
export declare const HardwareBasisSchema: z.ZodEnum<{
    OBSERVATION: "OBSERVATION";
    ROADMAP: "ROADMAP";
    USER_ASSUMPTION: "USER_ASSUMPTION";
}>;
export type HardwareBasis = z.infer<typeof HardwareBasisSchema>;
export declare const ConfidenceSchema: z.ZodEnum<{
    HIGH: "HIGH";
    LOW: "LOW";
    MEDIUM: "MEDIUM";
}>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export declare const HardwareModelSnapshotSchema: z.ZodObject<{
    schema_version: z.ZodString;
    name: z.ZodString;
    architecture: z.ZodEnum<{
        GENERIC_REFERENCE: "GENERIC_REFERENCE";
        NEUTRAL_ATOM: "NEUTRAL_ATOM";
        PHOTONIC: "PHOTONIC";
        SPIN: "SPIN";
        SUPERCONDUCTING: "SUPERCONDUCTING";
        TRAPPED_ION: "TRAPPED_ION";
    }>;
    basis: z.ZodEnum<{
        OBSERVATION: "OBSERVATION";
        ROADMAP: "ROADMAP";
        USER_ASSUMPTION: "USER_ASSUMPTION";
    }>;
    physical_error_rate: z.ZodNumber;
    cycle_time_ns: z.ZodNumber;
    physical_qubit_capacity: z.ZodNullable<z.ZodNumber>;
    operations: z.ZodArray<z.ZodString>;
    source: z.ZodString;
    source_url: z.ZodNullable<z.ZodString>;
    source_published_on: z.ZodNullable<z.ZodString>;
    retrieved_on: z.ZodNullable<z.ZodString>;
    confidence: z.ZodEnum<{
        HIGH: "HIGH";
        LOW: "LOW";
        MEDIUM: "MEDIUM";
    }>;
    limitations: z.ZodArray<z.ZodString>;
    snapshot_version: z.ZodString;
}, z.core.$strip>;
export type HardwareModelSnapshot = z.infer<typeof HardwareModelSnapshotSchema>;
export declare const QecSchemeSchema: z.ZodEnum<{
    SURFACE_CODE_ROTATED: "SURFACE_CODE_ROTATED";
}>;
export type QecScheme = z.infer<typeof QecSchemeSchema>;
export declare const QecModelSnapshotSchema: z.ZodObject<{
    schema_version: z.ZodString;
    scheme: z.ZodEnum<{
        SURFACE_CODE_ROTATED: "SURFACE_CODE_ROTATED";
    }>;
    threshold: z.ZodNumber;
    prefactor: z.ZodNumber;
    prefactor_model: z.ZodString;
    qubits_per_logical_d_squared: z.ZodNumber;
    rounds_per_logical_cycle: z.ZodEnum<{
        DISTANCE: "DISTANCE";
    }>;
    source: z.ZodString;
    limitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type QecModelSnapshot = z.infer<typeof QecModelSnapshotSchema>;
export declare const LayoutModelSchema: z.ZodEnum<{
    BARE_REGISTER: "BARE_REGISTER";
    LATTICE_SURGERY_2D: "LATTICE_SURGERY_2D";
}>;
export type LayoutModel = z.infer<typeof LayoutModelSchema>;
export declare const FactoryProtocolSchema: z.ZodEnum<{
    FIFTEEN_TO_ONE: "FIFTEEN_TO_ONE";
    NONE: "NONE";
}>;
export type FactoryProtocol = z.infer<typeof FactoryProtocolSchema>;
export declare const FactoryAssumptionsSchema: z.ZodObject<{
    protocol: z.ZodEnum<{
        FIFTEEN_TO_ONE: "FIFTEEN_TO_ONE";
        NONE: "NONE";
    }>;
    raw_state_error: z.ZodNumber;
    target_state_error: z.ZodNumber;
    factory_distance: z.ZodNullable<z.ZodNumber>;
    parallel_factories: z.ZodNumber;
    rounds_per_distillation: z.ZodNumber;
}, z.core.$strip>;
export type FactoryAssumptions = z.infer<typeof FactoryAssumptionsSchema>;
export declare const DecompositionSchema: z.ZodObject<{
    toffoli_t_cost: z.ZodNumber;
    unsupported_gate_policy: z.ZodEnum<{
        REFUSE: "REFUSE";
        REPORT_AS_UNDERESTIMATE: "REPORT_AS_UNDERESTIMATE";
    }>;
    source: z.ZodString;
}, z.core.$strip>;
export type Decomposition = z.infer<typeof DecompositionSchema>;
export declare const EconomicBasisSchema: z.ZodEnum<{
    MODELLED: "MODELLED";
    PUBLISHED_QUOTE: "PUBLISHED_QUOTE";
    USER_PROVIDED: "USER_PROVIDED";
}>;
export type EconomicBasis = z.infer<typeof EconomicBasisSchema>;
/**
 * What a quantum machine is assumed to cost.
 *
 * Optional, and absent by default in every preset. No price for a fault-tolerant
 * quantum computer exists to be looked up, and inventing one would turn every
 * economic threshold in this module into a number derived from a guess and
 * presented as a finding. With no economic model the economic thresholds are
 * refused by name.
 */
export declare const EconomicModelSchema: z.ZodObject<{
    schema_version: z.ZodString;
    currency: z.ZodString;
    basis: z.ZodEnum<{
        MODELLED: "MODELLED";
        PUBLISHED_QUOTE: "PUBLISHED_QUOTE";
        USER_PROVIDED: "USER_PROVIDED";
    }>;
    machine_cost_per_second: z.ZodNullable<z.ZodNumber>;
    physical_qubit_cost_per_second: z.ZodNullable<z.ZodNumber>;
    source: z.ZodString;
    limitations: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type EconomicModel = z.infer<typeof EconomicModelSchema>;
export declare const ScenarioPresetSchema: z.ZodEnum<{
    BASE: "BASE";
    CONSERVATIVE: "CONSERVATIVE";
    CUSTOM: "CUSTOM";
    OPTIMISTIC: "OPTIMISTIC";
}>;
export type ScenarioPreset = z.infer<typeof ScenarioPresetSchema>;
export declare const ResourceScenarioSchema: z.ZodObject<{
    schema_version: z.ZodString;
    name: z.ZodString;
    preset: z.ZodEnum<{
        BASE: "BASE";
        CONSERVATIVE: "CONSERVATIVE";
        CUSTOM: "CUSTOM";
        OPTIMISTIC: "OPTIMISTIC";
    }>;
    revision: z.ZodNumber;
    supersedes: z.ZodNullable<z.ZodString>;
    rationale: z.ZodString;
    hardware: z.ZodObject<{
        schema_version: z.ZodString;
        name: z.ZodString;
        architecture: z.ZodEnum<{
            GENERIC_REFERENCE: "GENERIC_REFERENCE";
            NEUTRAL_ATOM: "NEUTRAL_ATOM";
            PHOTONIC: "PHOTONIC";
            SPIN: "SPIN";
            SUPERCONDUCTING: "SUPERCONDUCTING";
            TRAPPED_ION: "TRAPPED_ION";
        }>;
        basis: z.ZodEnum<{
            OBSERVATION: "OBSERVATION";
            ROADMAP: "ROADMAP";
            USER_ASSUMPTION: "USER_ASSUMPTION";
        }>;
        physical_error_rate: z.ZodNumber;
        cycle_time_ns: z.ZodNumber;
        physical_qubit_capacity: z.ZodNullable<z.ZodNumber>;
        operations: z.ZodArray<z.ZodString>;
        source: z.ZodString;
        source_url: z.ZodNullable<z.ZodString>;
        source_published_on: z.ZodNullable<z.ZodString>;
        retrieved_on: z.ZodNullable<z.ZodString>;
        confidence: z.ZodEnum<{
            HIGH: "HIGH";
            LOW: "LOW";
            MEDIUM: "MEDIUM";
        }>;
        limitations: z.ZodArray<z.ZodString>;
        snapshot_version: z.ZodString;
    }, z.core.$strip>;
    qec: z.ZodObject<{
        schema_version: z.ZodString;
        scheme: z.ZodEnum<{
            SURFACE_CODE_ROTATED: "SURFACE_CODE_ROTATED";
        }>;
        threshold: z.ZodNumber;
        prefactor: z.ZodNumber;
        prefactor_model: z.ZodString;
        qubits_per_logical_d_squared: z.ZodNumber;
        rounds_per_logical_cycle: z.ZodEnum<{
            DISTANCE: "DISTANCE";
        }>;
        source: z.ZodString;
        limitations: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    layout_model: z.ZodEnum<{
        BARE_REGISTER: "BARE_REGISTER";
        LATTICE_SURGERY_2D: "LATTICE_SURGERY_2D";
    }>;
    factory: z.ZodObject<{
        protocol: z.ZodEnum<{
            FIFTEEN_TO_ONE: "FIFTEEN_TO_ONE";
            NONE: "NONE";
        }>;
        raw_state_error: z.ZodNumber;
        target_state_error: z.ZodNumber;
        factory_distance: z.ZodNullable<z.ZodNumber>;
        parallel_factories: z.ZodNumber;
        rounds_per_distillation: z.ZodNumber;
    }, z.core.$strip>;
    decomposition: z.ZodObject<{
        toffoli_t_cost: z.ZodNumber;
        unsupported_gate_policy: z.ZodEnum<{
            REFUSE: "REFUSE";
            REPORT_AS_UNDERESTIMATE: "REPORT_AS_UNDERESTIMATE";
        }>;
        source: z.ZodString;
    }, z.core.$strip>;
    error_budget: z.ZodNumber;
    runtime_target: z.ZodNullable<z.ZodNumber>;
    economics: z.ZodNullable<z.ZodObject<{
        schema_version: z.ZodString;
        currency: z.ZodString;
        basis: z.ZodEnum<{
            MODELLED: "MODELLED";
            PUBLISHED_QUOTE: "PUBLISHED_QUOTE";
            USER_PROVIDED: "USER_PROVIDED";
        }>;
        machine_cost_per_second: z.ZodNullable<z.ZodNumber>;
        physical_qubit_cost_per_second: z.ZodNullable<z.ZodNumber>;
        source: z.ZodString;
        limitations: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    estimator: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResourceScenario = z.infer<typeof ResourceScenarioSchema>;
export declare const INTELLIGENCE_ESTIMATOR = "ketqat-resource-intelligence";
export declare const INTELLIGENCE_ESTIMATOR_VERSION = "0.1.0";
/**
 * The conventional surface-code model.
 *
 * Identical in all three presets on purpose: see the module note. The prefactor
 * is fitted and its provenance is weak -- Qualtran's own implementation says of
 * it "The pre-factor $a$ has no clear provenance" -- so the alternative published
 * value is reported as model sensitivity on every estimate rather than being
 * assigned to one preset.
 */
export declare const CONVENTIONAL_QEC_MODEL: QecModelSnapshot;
export interface PresetOptions {
    /** Total logical error probability allowed. Same across presets by default. */
    errorBudget?: number;
    /** Seconds the computation must finish within. */
    runtimeTarget?: number | null;
    /** Quantum machine cost. Absent by default; nothing invents one. */
    economics?: EconomicModel | null;
    layoutModel?: LayoutModel;
    /** Device capacity, applied to every preset when the user knows their machine. */
    physicalQubitCapacity?: number | null;
}
/**
 * The three presets, as concrete assumption sets.
 *
 * Options apply uniformly. Giving one preset a looser error budget than another
 * would make the comparison meaningless, so the budget is not a per-preset knob.
 */
export declare function presetScenarios(options?: PresetOptions): ResourceScenario[];
/**
 * Whether two scenarios' estimates may be placed in the same comparison.
 *
 * Two scenarios differing in their *device* are exactly what this product
 * compares. Two differing in estimator, QEC scheme, threshold, prefactor, error
 * budget or Toffoli decomposition are measuring different things, and a table
 * placing them side by side under one column heading is a category error.
 */
export declare function scenariosComparable(left: ResourceScenario, right: ResourceScenario): {
    comparable: boolean;
    reasons: string[];
};
/** Produce the next revision of a scenario, superseding the current one. */
export declare function reviseScenario(current: ResourceScenario, changes: Partial<Omit<ResourceScenario, "revision" | "supersedes" | "schema_version">>, currentHash: string): ResourceScenario;
//# sourceMappingURL=scenario.d.ts.map