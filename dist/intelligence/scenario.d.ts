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
export declare const HardwareArchitectureSchema: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "GENERIC_REFERENCE"]>;
export type HardwareArchitecture = z.infer<typeof HardwareArchitectureSchema>;
/**
 * What kind of statement a hardware snapshot is.
 *
 * A vendor's current measured performance and a vendor's published roadmap
 * target are not the same data and must never be stored as though they were. The
 * distinction is a required enum rather than a note, so a query for "what do
 * devices do today" cannot accidentally return a projection.
 */
export declare const HardwareBasisSchema: z.ZodEnum<["OBSERVATION", "ROADMAP", "USER_ASSUMPTION"]>;
export type HardwareBasis = z.infer<typeof HardwareBasisSchema>;
export declare const ConfidenceSchema: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export declare const HardwareModelSnapshotSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodString;
    /** Provider name, or a generic architecture name when this is a convention. */
    name: z.ZodString;
    architecture: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "GENERIC_REFERENCE"]>;
    basis: z.ZodEnum<["OBSERVATION", "ROADMAP", "USER_ASSUMPTION"]>;
    /** Two-qubit physical error rate under circuit-level depolarizing noise. */
    physical_error_rate: z.ZodNumber;
    /** Surface-code cycle time in nanoseconds. */
    cycle_time_ns: z.ZodNumber;
    /** Physical qubits the device has, or null when unstated. Never guessed. */
    physical_qubit_capacity: z.ZodNullable<z.ZodNumber>;
    /** Operations this snapshot characterizes, so an uncharacterized gate is visible. */
    operations: z.ZodArray<z.ZodString, "many">;
    source: z.ZodString;
    source_url: z.ZodNullable<z.ZodString>;
    /** ISO date the source was published. */
    source_published_on: z.ZodNullable<z.ZodString>;
    /** ISO date the source was read. Distinct from publication: a page can change. */
    retrieved_on: z.ZodNullable<z.ZodString>;
    confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
    limitations: z.ZodArray<z.ZodString, "many">;
    snapshot_version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    name: string;
    architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
    basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
    physical_error_rate: number;
    cycle_time_ns: number;
    physical_qubit_capacity: number | null;
    operations: string[];
    source: string;
    source_url: string | null;
    source_published_on: string | null;
    retrieved_on: string | null;
    confidence: "HIGH" | "LOW" | "MEDIUM";
    limitations: string[];
    snapshot_version: string;
}, {
    schema_version: string;
    name: string;
    architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
    basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
    physical_error_rate: number;
    cycle_time_ns: number;
    physical_qubit_capacity: number | null;
    operations: string[];
    source: string;
    source_url: string | null;
    source_published_on: string | null;
    retrieved_on: string | null;
    confidence: "HIGH" | "LOW" | "MEDIUM";
    limitations: string[];
    snapshot_version: string;
}>, {
    schema_version: string;
    name: string;
    architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
    basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
    physical_error_rate: number;
    cycle_time_ns: number;
    physical_qubit_capacity: number | null;
    operations: string[];
    source: string;
    source_url: string | null;
    source_published_on: string | null;
    retrieved_on: string | null;
    confidence: "HIGH" | "LOW" | "MEDIUM";
    limitations: string[];
    snapshot_version: string;
}, {
    schema_version: string;
    name: string;
    architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
    basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
    physical_error_rate: number;
    cycle_time_ns: number;
    physical_qubit_capacity: number | null;
    operations: string[];
    source: string;
    source_url: string | null;
    source_published_on: string | null;
    retrieved_on: string | null;
    confidence: "HIGH" | "LOW" | "MEDIUM";
    limitations: string[];
    snapshot_version: string;
}>;
export type HardwareModelSnapshot = z.infer<typeof HardwareModelSnapshotSchema>;
export declare const QecSchemeSchema: z.ZodEnum<["SURFACE_CODE_ROTATED"]>;
export type QecScheme = z.infer<typeof QecSchemeSchema>;
export declare const QecModelSnapshotSchema: z.ZodObject<{
    schema_version: z.ZodString;
    scheme: z.ZodEnum<["SURFACE_CODE_ROTATED"]>;
    /** Threshold below which adding distance helps. A property of code and decoder. */
    threshold: z.ZodNumber;
    /** Fitted prefactor A in p_L = A (p/p_th)^((d+1)/2). Not derived; named below. */
    prefactor: z.ZodNumber;
    prefactor_model: z.ZodString;
    /** Physical qubits per logical patch, as a multiple of d^2. */
    qubits_per_logical_d_squared: z.ZodNumber;
    /** Surface-code rounds per logical cycle. `d` for the standard construction. */
    rounds_per_logical_cycle: z.ZodEnum<["DISTANCE"]>;
    source: z.ZodString;
    limitations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    scheme: "SURFACE_CODE_ROTATED";
    threshold: number;
    prefactor: number;
    prefactor_model: string;
    qubits_per_logical_d_squared: number;
    rounds_per_logical_cycle: "DISTANCE";
    source: string;
    limitations: string[];
}, {
    schema_version: string;
    scheme: "SURFACE_CODE_ROTATED";
    threshold: number;
    prefactor: number;
    prefactor_model: string;
    qubits_per_logical_d_squared: number;
    rounds_per_logical_cycle: "DISTANCE";
    source: string;
    limitations: string[];
}>;
export type QecModelSnapshot = z.infer<typeof QecModelSnapshotSchema>;
export declare const LayoutModelSchema: z.ZodEnum<["BARE_REGISTER", "LATTICE_SURGERY_2D"]>;
export type LayoutModel = z.infer<typeof LayoutModelSchema>;
export declare const FactoryProtocolSchema: z.ZodEnum<["FIFTEEN_TO_ONE", "NONE"]>;
export type FactoryProtocol = z.infer<typeof FactoryProtocolSchema>;
export declare const FactoryAssumptionsSchema: z.ZodEffects<z.ZodObject<{
    protocol: z.ZodEnum<["FIFTEEN_TO_ONE", "NONE"]>;
    /** Error of raw magic states before distillation. */
    raw_state_error: z.ZodNumber;
    /** Error each distilled state must reach. */
    target_state_error: z.ZodNumber;
    /** Code distance inside the factory. Null means "use the algorithm distance". */
    factory_distance: z.ZodNullable<z.ZodNumber>;
    /** Factories running in parallel. Sets throughput, and multiplies footprint. */
    parallel_factories: z.ZodNumber;
    /**
     * Surface-code rounds one distillation round occupies.
     *
     * Needed to turn a level count into a throughput. A space estimate alone
     * cannot answer "can the factory keep up", which is frequently the binding
     * constraint.
     */
    rounds_per_distillation: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    protocol: "FIFTEEN_TO_ONE" | "NONE";
    raw_state_error: number;
    target_state_error: number;
    factory_distance: number | null;
    parallel_factories: number;
    rounds_per_distillation: number;
}, {
    protocol: "FIFTEEN_TO_ONE" | "NONE";
    raw_state_error: number;
    target_state_error: number;
    factory_distance: number | null;
    parallel_factories: number;
    rounds_per_distillation: number;
}>, {
    protocol: "FIFTEEN_TO_ONE" | "NONE";
    raw_state_error: number;
    target_state_error: number;
    factory_distance: number | null;
    parallel_factories: number;
    rounds_per_distillation: number;
}, {
    protocol: "FIFTEEN_TO_ONE" | "NONE";
    raw_state_error: number;
    target_state_error: number;
    factory_distance: number | null;
    parallel_factories: number;
    rounds_per_distillation: number;
}>;
export type FactoryAssumptions = z.infer<typeof FactoryAssumptionsSchema>;
export declare const DecompositionSchema: z.ZodObject<{
    /** T gates one Toffoli costs. 4 in the standard decomposition. */
    toffoli_t_cost: z.ZodNumber;
    /** How unsupported gates are handled. Refusing is the honest default. */
    unsupported_gate_policy: z.ZodEnum<["REFUSE", "REPORT_AS_UNDERESTIMATE"]>;
    source: z.ZodString;
}, "strip", z.ZodTypeAny, {
    toffoli_t_cost: number;
    unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
    source: string;
}, {
    toffoli_t_cost: number;
    unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
    source: string;
}>;
export type Decomposition = z.infer<typeof DecompositionSchema>;
export declare const EconomicBasisSchema: z.ZodEnum<["USER_PROVIDED", "PUBLISHED_QUOTE", "MODELLED"]>;
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
export declare const EconomicModelSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodString;
    currency: z.ZodString;
    basis: z.ZodEnum<["USER_PROVIDED", "PUBLISHED_QUOTE", "MODELLED"]>;
    machine_cost_per_second: z.ZodNullable<z.ZodNumber>;
    physical_qubit_cost_per_second: z.ZodNullable<z.ZodNumber>;
    source: z.ZodString;
    limitations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    currency: string;
    basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
    machine_cost_per_second: number | null;
    physical_qubit_cost_per_second: number | null;
    source: string;
    limitations: string[];
}, {
    schema_version: string;
    currency: string;
    basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
    machine_cost_per_second: number | null;
    physical_qubit_cost_per_second: number | null;
    source: string;
    limitations: string[];
}>, {
    schema_version: string;
    currency: string;
    basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
    machine_cost_per_second: number | null;
    physical_qubit_cost_per_second: number | null;
    source: string;
    limitations: string[];
}, {
    schema_version: string;
    currency: string;
    basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
    machine_cost_per_second: number | null;
    physical_qubit_cost_per_second: number | null;
    source: string;
    limitations: string[];
}>;
export type EconomicModel = z.infer<typeof EconomicModelSchema>;
export declare const ScenarioPresetSchema: z.ZodEnum<["CONSERVATIVE", "BASE", "OPTIMISTIC", "CUSTOM"]>;
export type ScenarioPreset = z.infer<typeof ScenarioPresetSchema>;
export declare const ResourceScenarioSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodString;
    name: z.ZodString;
    preset: z.ZodEnum<["CONSERVATIVE", "BASE", "OPTIMISTIC", "CUSTOM"]>;
    /** Starts at 1. A change produces revision n+1; it never rewrites revision n. */
    revision: z.ZodNumber;
    /** Hash of the revision this one replaces, or null for the first. */
    supersedes: z.ZodNullable<z.ZodString>;
    /** Why these assumptions. A scenario without a stated rationale is an unlabelled knob. */
    rationale: z.ZodString;
    hardware: z.ZodEffects<z.ZodObject<{
        schema_version: z.ZodString;
        /** Provider name, or a generic architecture name when this is a convention. */
        name: z.ZodString;
        architecture: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "GENERIC_REFERENCE"]>;
        basis: z.ZodEnum<["OBSERVATION", "ROADMAP", "USER_ASSUMPTION"]>;
        /** Two-qubit physical error rate under circuit-level depolarizing noise. */
        physical_error_rate: z.ZodNumber;
        /** Surface-code cycle time in nanoseconds. */
        cycle_time_ns: z.ZodNumber;
        /** Physical qubits the device has, or null when unstated. Never guessed. */
        physical_qubit_capacity: z.ZodNullable<z.ZodNumber>;
        /** Operations this snapshot characterizes, so an uncharacterized gate is visible. */
        operations: z.ZodArray<z.ZodString, "many">;
        source: z.ZodString;
        source_url: z.ZodNullable<z.ZodString>;
        /** ISO date the source was published. */
        source_published_on: z.ZodNullable<z.ZodString>;
        /** ISO date the source was read. Distinct from publication: a page can change. */
        retrieved_on: z.ZodNullable<z.ZodString>;
        confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
        limitations: z.ZodArray<z.ZodString, "many">;
        snapshot_version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    }, {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    }>, {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    }, {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    }>;
    qec: z.ZodObject<{
        schema_version: z.ZodString;
        scheme: z.ZodEnum<["SURFACE_CODE_ROTATED"]>;
        /** Threshold below which adding distance helps. A property of code and decoder. */
        threshold: z.ZodNumber;
        /** Fitted prefactor A in p_L = A (p/p_th)^((d+1)/2). Not derived; named below. */
        prefactor: z.ZodNumber;
        prefactor_model: z.ZodString;
        /** Physical qubits per logical patch, as a multiple of d^2. */
        qubits_per_logical_d_squared: z.ZodNumber;
        /** Surface-code rounds per logical cycle. `d` for the standard construction. */
        rounds_per_logical_cycle: z.ZodEnum<["DISTANCE"]>;
        source: z.ZodString;
        limitations: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        schema_version: string;
        scheme: "SURFACE_CODE_ROTATED";
        threshold: number;
        prefactor: number;
        prefactor_model: string;
        qubits_per_logical_d_squared: number;
        rounds_per_logical_cycle: "DISTANCE";
        source: string;
        limitations: string[];
    }, {
        schema_version: string;
        scheme: "SURFACE_CODE_ROTATED";
        threshold: number;
        prefactor: number;
        prefactor_model: string;
        qubits_per_logical_d_squared: number;
        rounds_per_logical_cycle: "DISTANCE";
        source: string;
        limitations: string[];
    }>;
    layout_model: z.ZodEnum<["BARE_REGISTER", "LATTICE_SURGERY_2D"]>;
    factory: z.ZodEffects<z.ZodObject<{
        protocol: z.ZodEnum<["FIFTEEN_TO_ONE", "NONE"]>;
        /** Error of raw magic states before distillation. */
        raw_state_error: z.ZodNumber;
        /** Error each distilled state must reach. */
        target_state_error: z.ZodNumber;
        /** Code distance inside the factory. Null means "use the algorithm distance". */
        factory_distance: z.ZodNullable<z.ZodNumber>;
        /** Factories running in parallel. Sets throughput, and multiplies footprint. */
        parallel_factories: z.ZodNumber;
        /**
         * Surface-code rounds one distillation round occupies.
         *
         * Needed to turn a level count into a throughput. A space estimate alone
         * cannot answer "can the factory keep up", which is frequently the binding
         * constraint.
         */
        rounds_per_distillation: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    }, {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    }>, {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    }, {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    }>;
    decomposition: z.ZodObject<{
        /** T gates one Toffoli costs. 4 in the standard decomposition. */
        toffoli_t_cost: z.ZodNumber;
        /** How unsupported gates are handled. Refusing is the honest default. */
        unsupported_gate_policy: z.ZodEnum<["REFUSE", "REPORT_AS_UNDERESTIMATE"]>;
        source: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        toffoli_t_cost: number;
        unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
        source: string;
    }, {
        toffoli_t_cost: number;
        unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
        source: string;
    }>;
    /** Total probability of any logical error across the whole computation. */
    error_budget: z.ZodNumber;
    /** Seconds the computation must finish within, or null when unconstrained. */
    runtime_target: z.ZodNullable<z.ZodNumber>;
    economics: z.ZodNullable<z.ZodEffects<z.ZodObject<{
        schema_version: z.ZodString;
        currency: z.ZodString;
        basis: z.ZodEnum<["USER_PROVIDED", "PUBLISHED_QUOTE", "MODELLED"]>;
        machine_cost_per_second: z.ZodNullable<z.ZodNumber>;
        physical_qubit_cost_per_second: z.ZodNullable<z.ZodNumber>;
        source: z.ZodString;
        limitations: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    }, {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    }>, {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    }, {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    }>>;
    estimator: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        version: string;
    }, {
        name: string;
        version: string;
    }>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    name: string;
    preset: "BASE" | "CONSERVATIVE" | "CUSTOM" | "OPTIMISTIC";
    revision: number;
    supersedes: string | null;
    rationale: string;
    hardware: {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    };
    qec: {
        schema_version: string;
        scheme: "SURFACE_CODE_ROTATED";
        threshold: number;
        prefactor: number;
        prefactor_model: string;
        qubits_per_logical_d_squared: number;
        rounds_per_logical_cycle: "DISTANCE";
        source: string;
        limitations: string[];
    };
    layout_model: "BARE_REGISTER" | "LATTICE_SURGERY_2D";
    factory: {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    };
    decomposition: {
        toffoli_t_cost: number;
        unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
        source: string;
    };
    error_budget: number;
    runtime_target: number | null;
    economics: {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    } | null;
    estimator: {
        name: string;
        version: string;
    };
}, {
    schema_version: string;
    name: string;
    preset: "BASE" | "CONSERVATIVE" | "CUSTOM" | "OPTIMISTIC";
    revision: number;
    supersedes: string | null;
    rationale: string;
    hardware: {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    };
    qec: {
        schema_version: string;
        scheme: "SURFACE_CODE_ROTATED";
        threshold: number;
        prefactor: number;
        prefactor_model: string;
        qubits_per_logical_d_squared: number;
        rounds_per_logical_cycle: "DISTANCE";
        source: string;
        limitations: string[];
    };
    layout_model: "BARE_REGISTER" | "LATTICE_SURGERY_2D";
    factory: {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    };
    decomposition: {
        toffoli_t_cost: number;
        unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
        source: string;
    };
    error_budget: number;
    runtime_target: number | null;
    economics: {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    } | null;
    estimator: {
        name: string;
        version: string;
    };
}>, {
    schema_version: string;
    name: string;
    preset: "BASE" | "CONSERVATIVE" | "CUSTOM" | "OPTIMISTIC";
    revision: number;
    supersedes: string | null;
    rationale: string;
    hardware: {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    };
    qec: {
        schema_version: string;
        scheme: "SURFACE_CODE_ROTATED";
        threshold: number;
        prefactor: number;
        prefactor_model: string;
        qubits_per_logical_d_squared: number;
        rounds_per_logical_cycle: "DISTANCE";
        source: string;
        limitations: string[];
    };
    layout_model: "BARE_REGISTER" | "LATTICE_SURGERY_2D";
    factory: {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    };
    decomposition: {
        toffoli_t_cost: number;
        unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
        source: string;
    };
    error_budget: number;
    runtime_target: number | null;
    economics: {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    } | null;
    estimator: {
        name: string;
        version: string;
    };
}, {
    schema_version: string;
    name: string;
    preset: "BASE" | "CONSERVATIVE" | "CUSTOM" | "OPTIMISTIC";
    revision: number;
    supersedes: string | null;
    rationale: string;
    hardware: {
        schema_version: string;
        name: string;
        architecture: "GENERIC_REFERENCE" | "NEUTRAL_ATOM" | "PHOTONIC" | "SPIN" | "SUPERCONDUCTING" | "TRAPPED_ION";
        basis: "OBSERVATION" | "ROADMAP" | "USER_ASSUMPTION";
        physical_error_rate: number;
        cycle_time_ns: number;
        physical_qubit_capacity: number | null;
        operations: string[];
        source: string;
        source_url: string | null;
        source_published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
        snapshot_version: string;
    };
    qec: {
        schema_version: string;
        scheme: "SURFACE_CODE_ROTATED";
        threshold: number;
        prefactor: number;
        prefactor_model: string;
        qubits_per_logical_d_squared: number;
        rounds_per_logical_cycle: "DISTANCE";
        source: string;
        limitations: string[];
    };
    layout_model: "BARE_REGISTER" | "LATTICE_SURGERY_2D";
    factory: {
        protocol: "FIFTEEN_TO_ONE" | "NONE";
        raw_state_error: number;
        target_state_error: number;
        factory_distance: number | null;
        parallel_factories: number;
        rounds_per_distillation: number;
    };
    decomposition: {
        toffoli_t_cost: number;
        unsupported_gate_policy: "REFUSE" | "REPORT_AS_UNDERESTIMATE";
        source: string;
    };
    error_budget: number;
    runtime_target: number | null;
    economics: {
        schema_version: string;
        currency: string;
        basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
        machine_cost_per_second: number | null;
        physical_qubit_cost_per_second: number | null;
        source: string;
        limitations: string[];
    } | null;
    estimator: {
        name: string;
        version: string;
    };
}>;
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