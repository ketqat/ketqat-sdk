import { z } from "zod";
import { type ClassicalBaseline } from "./baseline.js";
import { type ResourceScenario } from "./scenario.js";
import { type QuantumWorkload } from "./workload.js";
import { type EvidenceSource } from "./bundle.js";
/**
 * The assessment document (ketqat-sdk#236).
 *
 * A file someone writes by hand, so it is deliberately thinner than the bundle
 * it produces: a workload, an optional classical baseline, and which scenarios
 * to run. Everything else -- estimates, thresholds, decisions, the hash -- is
 * computed, and computing it from a short input is what makes the output
 * reproducible from something a person can read and diff.
 *
 * ## Why there is a YAML reader in here
 *
 * The SDK's only runtime dependency is `zod`, and that constraint is load-bearing
 * rather than aesthetic: this is the package other people install. Adding a YAML
 * library to read a config file would be the first crack in it.
 *
 * So this reads a **declared subset** of YAML and refuses everything else, the
 * same approach the OpenQASM 3 parser takes. Anchors, aliases, tags, flow
 * collections, multiple documents, and complex keys are rejected by name rather
 * than mis-parsed -- a config reader that silently misreads a file is worse than
 * one that cannot read it, because the misreading becomes a number in a report.
 *
 * JSON is accepted too, and is the better choice for generated files.
 */
export declare class AssessmentFileError extends Error {
}
/** Read the supported YAML subset. Refuses the rest by name. */
export declare function parseYamlSubset(source: string): unknown;
export declare const AssessmentSpecSchema: z.ZodObject<{
    schema_version: z.ZodDefault<z.ZodString>;
    workload: z.ZodEffects<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        /** OpenQASM 3 source. Parsed here; no code is executed. */
        openqasm3: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            kind: z.ZodEnum<["OPENQASM3", "KETQAT_WORKBENCH_CIRCUIT", "KETQAT_ARTIFACT", "KETQAT_RUN", "MANUAL_LOGICAL_COUNTS", "ALGORITHM_FAMILY"]>;
            reference: z.ZodOptional<z.ZodString>;
            openqasm3: z.ZodOptional<z.ZodString>;
            source_digest: z.ZodOptional<z.ZodString>;
            citation: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        }, {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        }>, {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        }, {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        }>>;
        /** Counts supplied directly, when there is no circuit to parse. */
        logical: z.ZodOptional<z.ZodObject<{
            logical_qubits: z.ZodNumber;
            circuit_depth: z.ZodNumber;
            gate_count: z.ZodNumber;
            one_qubit_gate_count: z.ZodNumber;
            two_qubit_gate_count: z.ZodNumber;
            clifford_count: z.ZodNumber;
            t_count: z.ZodNumber;
            toffoli_count: z.ZodNumber;
            unsupported_for_ft_count: z.ZodNumber;
            measurement_count: z.ZodNumber;
            reset_count: z.ZodNumber;
            conditional_count: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        }, {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        }>>;
        logical_counts_evidence: z.ZodOptional<z.ZodEnum<["DERIVED", "USER_PROVIDED", "MODELLED"]>>;
        gate_set: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        problem_size: z.ZodOptional<z.ZodObject<{
            description: z.ZodString;
            value: z.ZodOptional<z.ZodNumber>;
            unit: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        }, {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        }>>;
        notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        is_demo: boolean;
        openqasm3?: string | undefined;
        source?: {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        } | undefined;
        logical?: {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        } | undefined;
        logical_counts_evidence?: "DERIVED" | "MODELLED" | "USER_PROVIDED" | undefined;
        gate_set?: string[] | undefined;
        problem_size?: {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        } | undefined;
        notes: string[];
    }, {
        name: string;
        description: string;
        is_demo?: boolean | undefined;
        openqasm3?: string | undefined;
        source?: {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        } | undefined;
        logical?: {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        } | undefined;
        logical_counts_evidence?: "DERIVED" | "MODELLED" | "USER_PROVIDED" | undefined;
        gate_set?: string[] | undefined;
        problem_size?: {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        } | undefined;
        notes?: string[] | undefined;
    }>, {
        name: string;
        description: string;
        is_demo: boolean;
        openqasm3?: string | undefined;
        source?: {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        } | undefined;
        logical?: {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        } | undefined;
        logical_counts_evidence?: "DERIVED" | "MODELLED" | "USER_PROVIDED" | undefined;
        gate_set?: string[] | undefined;
        problem_size?: {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        } | undefined;
        notes: string[];
    }, {
        name: string;
        description: string;
        is_demo?: boolean | undefined;
        openqasm3?: string | undefined;
        source?: {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        } | undefined;
        logical?: {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        } | undefined;
        logical_counts_evidence?: "DERIVED" | "MODELLED" | "USER_PROVIDED" | undefined;
        gate_set?: string[] | undefined;
        problem_size?: {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        } | undefined;
        notes?: string[] | undefined;
    }>;
    classical_baseline: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodObject<{
        schema_version: z.ZodString;
        evidence: z.ZodEnum<["MEASURED", "USER_PROVIDED", "DERIVED", "MODELLED", "UNKNOWN"]>;
        runtime: z.ZodNullable<z.ZodNumber>;
        monetary_cost: z.ZodNullable<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            amount: number;
            currency: string;
        }, {
            amount: number;
            currency: string;
        }>>;
        compute_environment: z.ZodString;
        hardware_description: z.ZodString;
        solution_quality: z.ZodNullable<z.ZodObject<{
            metric: z.ZodString;
            value: z.ZodNumber;
            unit: z.ZodOptional<z.ZodString>;
            lower_is_better: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        }, {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        }>>;
        workload_size: z.ZodString;
        measured_on: z.ZodNullable<z.ZodString>;
        evidence_url: z.ZodNullable<z.ZodString>;
        evidence_note: z.ZodNullable<z.ZodString>;
        limitations: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        schema_version: string;
        evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
        runtime: number | null;
        monetary_cost: {
            amount: number;
            currency: string;
        } | null;
        compute_environment: string;
        hardware_description: string;
        solution_quality: {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        } | null;
        workload_size: string;
        measured_on: string | null;
        evidence_url: string | null;
        evidence_note: string | null;
        limitations: string[];
    }, {
        schema_version: string;
        evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
        runtime: number | null;
        monetary_cost: {
            amount: number;
            currency: string;
        } | null;
        compute_environment: string;
        hardware_description: string;
        solution_quality: {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        } | null;
        workload_size: string;
        measured_on: string | null;
        evidence_url: string | null;
        evidence_note: string | null;
        limitations: string[];
    }>, {
        schema_version: string;
        evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
        runtime: number | null;
        monetary_cost: {
            amount: number;
            currency: string;
        } | null;
        compute_environment: string;
        hardware_description: string;
        solution_quality: {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        } | null;
        workload_size: string;
        measured_on: string | null;
        evidence_url: string | null;
        evidence_note: string | null;
        limitations: string[];
    }, {
        schema_version: string;
        evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
        runtime: number | null;
        monetary_cost: {
            amount: number;
            currency: string;
        } | null;
        compute_environment: string;
        hardware_description: string;
        solution_quality: {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        } | null;
        workload_size: string;
        measured_on: string | null;
        evidence_url: string | null;
        evidence_note: string | null;
        limitations: string[];
    }>>>;
    scenarios: z.ZodDefault<z.ZodObject<{
        presets: z.ZodDefault<z.ZodArray<z.ZodEnum<["CONSERVATIVE", "BASE", "OPTIMISTIC"]>, "many">>;
        error_budget: z.ZodOptional<z.ZodNumber>;
        runtime_target: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        physical_qubit_capacity: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        layout_model: z.ZodOptional<z.ZodEnum<["BARE_REGISTER", "LATTICE_SURGERY_2D"]>>;
        economics: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodObject<{
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
        }>>>;
        /** Fully specified scenarios, for anything the presets do not cover. */
        custom: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            schema_version: z.ZodString;
            name: z.ZodString;
            preset: z.ZodEnum<["CONSERVATIVE", "BASE", "OPTIMISTIC", "CUSTOM"]>;
            revision: z.ZodNumber;
            supersedes: z.ZodNullable<z.ZodString>;
            rationale: z.ZodString;
            hardware: z.ZodEffects<z.ZodObject<{
                schema_version: z.ZodString;
                name: z.ZodString;
                architecture: z.ZodEnum<["SUPERCONDUCTING", "TRAPPED_ION", "NEUTRAL_ATOM", "PHOTONIC", "SPIN", "GENERIC_REFERENCE"]>;
                basis: z.ZodEnum<["OBSERVATION", "ROADMAP", "USER_ASSUMPTION"]>;
                physical_error_rate: z.ZodNumber;
                cycle_time_ns: z.ZodNumber;
                physical_qubit_capacity: z.ZodNullable<z.ZodNumber>;
                operations: z.ZodArray<z.ZodString, "many">;
                source: z.ZodString;
                source_url: z.ZodNullable<z.ZodString>;
                source_published_on: z.ZodNullable<z.ZodString>;
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
                threshold: z.ZodNumber;
                prefactor: z.ZodNumber;
                prefactor_model: z.ZodString;
                qubits_per_logical_d_squared: z.ZodNumber;
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
                raw_state_error: z.ZodNumber;
                target_state_error: z.ZodNumber;
                factory_distance: z.ZodNullable<z.ZodNumber>;
                parallel_factories: z.ZodNumber;
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
                toffoli_t_cost: z.ZodNumber;
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
            error_budget: z.ZodNumber;
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
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        presets: ("BASE" | "CONSERVATIVE" | "OPTIMISTIC")[];
        error_budget?: number | undefined;
        runtime_target: number | null;
        physical_qubit_capacity: number | null;
        layout_model?: "BARE_REGISTER" | "LATTICE_SURGERY_2D" | undefined;
        economics: {
            schema_version: string;
            currency: string;
            basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
            machine_cost_per_second: number | null;
            physical_qubit_cost_per_second: number | null;
            source: string;
            limitations: string[];
        } | null;
        custom: {
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
        }[];
    }, {
        presets?: ("BASE" | "CONSERVATIVE" | "OPTIMISTIC")[] | undefined;
        error_budget?: number | undefined;
        runtime_target?: number | null | undefined;
        physical_qubit_capacity?: number | null | undefined;
        layout_model?: "BARE_REGISTER" | "LATTICE_SURGERY_2D" | undefined;
        economics?: {
            schema_version: string;
            currency: string;
            basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
            machine_cost_per_second: number | null;
            physical_qubit_cost_per_second: number | null;
            source: string;
            limitations: string[];
        } | null | undefined;
        custom?: {
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
        }[] | undefined;
    }>>;
    sources: z.ZodDefault<z.ZodArray<z.ZodObject<{
        supports: z.ZodString;
        title: z.ZodString;
        url: z.ZodNullable<z.ZodString>;
        published_on: z.ZodNullable<z.ZodString>;
        retrieved_on: z.ZodNullable<z.ZodString>;
        confidence: z.ZodEnum<["HIGH", "MEDIUM", "LOW"]>;
        limitations: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
    }, {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    workload: {
        name: string;
        description: string;
        is_demo: boolean;
        openqasm3?: string | undefined;
        source?: {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        } | undefined;
        logical?: {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        } | undefined;
        logical_counts_evidence?: "DERIVED" | "MODELLED" | "USER_PROVIDED" | undefined;
        gate_set?: string[] | undefined;
        problem_size?: {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        } | undefined;
        notes: string[];
    };
    classical_baseline: {
        schema_version: string;
        evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
        runtime: number | null;
        monetary_cost: {
            amount: number;
            currency: string;
        } | null;
        compute_environment: string;
        hardware_description: string;
        solution_quality: {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        } | null;
        workload_size: string;
        measured_on: string | null;
        evidence_url: string | null;
        evidence_note: string | null;
        limitations: string[];
    } | null;
    scenarios: {
        presets: ("BASE" | "CONSERVATIVE" | "OPTIMISTIC")[];
        error_budget?: number | undefined;
        runtime_target: number | null;
        physical_qubit_capacity: number | null;
        layout_model?: "BARE_REGISTER" | "LATTICE_SURGERY_2D" | undefined;
        economics: {
            schema_version: string;
            currency: string;
            basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
            machine_cost_per_second: number | null;
            physical_qubit_cost_per_second: number | null;
            source: string;
            limitations: string[];
        } | null;
        custom: {
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
        }[];
    };
    sources: {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
    }[];
}, {
    schema_version?: string | undefined;
    workload: {
        name: string;
        description: string;
        is_demo?: boolean | undefined;
        openqasm3?: string | undefined;
        source?: {
            kind: "ALGORITHM_FAMILY" | "KETQAT_ARTIFACT" | "KETQAT_RUN" | "KETQAT_WORKBENCH_CIRCUIT" | "MANUAL_LOGICAL_COUNTS" | "OPENQASM3";
            reference?: string | undefined;
            openqasm3?: string | undefined;
            source_digest?: string | undefined;
            citation?: string | undefined;
        } | undefined;
        logical?: {
            logical_qubits: number;
            circuit_depth: number;
            gate_count: number;
            one_qubit_gate_count: number;
            two_qubit_gate_count: number;
            clifford_count: number;
            t_count: number;
            toffoli_count: number;
            unsupported_for_ft_count: number;
            measurement_count: number;
            reset_count: number;
            conditional_count: number;
        } | undefined;
        logical_counts_evidence?: "DERIVED" | "MODELLED" | "USER_PROVIDED" | undefined;
        gate_set?: string[] | undefined;
        problem_size?: {
            description: string;
            value?: number | undefined;
            unit?: string | undefined;
        } | undefined;
        notes?: string[] | undefined;
    };
    classical_baseline?: {
        schema_version: string;
        evidence: "DERIVED" | "MEASURED" | "MODELLED" | "UNKNOWN" | "USER_PROVIDED";
        runtime: number | null;
        monetary_cost: {
            amount: number;
            currency: string;
        } | null;
        compute_environment: string;
        hardware_description: string;
        solution_quality: {
            metric: string;
            value: number;
            unit?: string | undefined;
            lower_is_better: boolean;
        } | null;
        workload_size: string;
        measured_on: string | null;
        evidence_url: string | null;
        evidence_note: string | null;
        limitations: string[];
    } | null | undefined;
    scenarios?: {
        presets?: ("BASE" | "CONSERVATIVE" | "OPTIMISTIC")[] | undefined;
        error_budget?: number | undefined;
        runtime_target?: number | null | undefined;
        physical_qubit_capacity?: number | null | undefined;
        layout_model?: "BARE_REGISTER" | "LATTICE_SURGERY_2D" | undefined;
        economics?: {
            schema_version: string;
            currency: string;
            basis: "MODELLED" | "PUBLISHED_QUOTE" | "USER_PROVIDED";
            machine_cost_per_second: number | null;
            physical_qubit_cost_per_second: number | null;
            source: string;
            limitations: string[];
        } | null | undefined;
        custom?: {
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
        }[] | undefined;
    } | undefined;
    sources?: {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: "HIGH" | "LOW" | "MEDIUM";
        limitations: string[];
    }[] | undefined;
}>;
export type AssessmentSpec = z.infer<typeof AssessmentSpecSchema>;
export interface ResolvedAssessment {
    workload: QuantumWorkload;
    baseline: ClassicalBaseline | null;
    scenarios: ResourceScenario[];
    sources: EvidenceSource[];
}
/** Turn a document into the three inputs `buildBundle` takes. */
export declare function resolveAssessment(spec: AssessmentSpec): ResolvedAssessment;
/** Read a `.json` or `.yaml` assessment document. */
export declare function readAssessmentDocument(source: string, filename: string): AssessmentSpec;
//# sourceMappingURL=assessment-file.d.ts.map