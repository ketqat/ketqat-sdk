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
    workload: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        openqasm3: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                ALGORITHM_FAMILY: "ALGORITHM_FAMILY";
                KETQAT_ARTIFACT: "KETQAT_ARTIFACT";
                KETQAT_RUN: "KETQAT_RUN";
                KETQAT_WORKBENCH_CIRCUIT: "KETQAT_WORKBENCH_CIRCUIT";
                MANUAL_LOGICAL_COUNTS: "MANUAL_LOGICAL_COUNTS";
                OPENQASM3: "OPENQASM3";
            }>;
            reference: z.ZodOptional<z.ZodString>;
            openqasm3: z.ZodOptional<z.ZodString>;
            source_digest: z.ZodOptional<z.ZodString>;
            citation: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
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
        }, z.core.$strip>>;
        logical_counts_evidence: z.ZodOptional<z.ZodEnum<{
            DERIVED: "DERIVED";
            MODELLED: "MODELLED";
            USER_PROVIDED: "USER_PROVIDED";
        }>>;
        gate_set: z.ZodOptional<z.ZodArray<z.ZodString>>;
        problem_size: z.ZodOptional<z.ZodObject<{
            description: z.ZodString;
            value: z.ZodOptional<z.ZodNumber>;
            unit: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    classical_baseline: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        schema_version: z.ZodString;
        evidence: z.ZodEnum<{
            DERIVED: "DERIVED";
            MEASURED: "MEASURED";
            MODELLED: "MODELLED";
            UNKNOWN: "UNKNOWN";
            USER_PROVIDED: "USER_PROVIDED";
        }>;
        runtime: z.ZodNullable<z.ZodNumber>;
        monetary_cost: z.ZodNullable<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodString;
        }, z.core.$strip>>;
        compute_environment: z.ZodString;
        hardware_description: z.ZodString;
        solution_quality: z.ZodNullable<z.ZodObject<{
            metric: z.ZodString;
            value: z.ZodNumber;
            unit: z.ZodOptional<z.ZodString>;
            lower_is_better: z.ZodBoolean;
        }, z.core.$strip>>;
        workload_size: z.ZodString;
        measured_on: z.ZodNullable<z.ZodString>;
        evidence_url: z.ZodNullable<z.ZodString>;
        evidence_note: z.ZodNullable<z.ZodString>;
        limitations: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>>;
    scenarios: z.ZodPrefault<z.ZodObject<{
        presets: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            BASE: "BASE";
            CONSERVATIVE: "CONSERVATIVE";
            OPTIMISTIC: "OPTIMISTIC";
        }>>>;
        error_budget: z.ZodOptional<z.ZodNumber>;
        runtime_target: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        physical_qubit_capacity: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        layout_model: z.ZodOptional<z.ZodEnum<{
            BARE_REGISTER: "BARE_REGISTER";
            LATTICE_SURGERY_2D: "LATTICE_SURGERY_2D";
        }>>;
        economics: z.ZodDefault<z.ZodNullable<z.ZodObject<{
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
        }, z.core.$strip>>>;
        custom: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    sources: z.ZodDefault<z.ZodArray<z.ZodObject<{
        supports: z.ZodString;
        title: z.ZodString;
        url: z.ZodNullable<z.ZodString>;
        published_on: z.ZodNullable<z.ZodString>;
        retrieved_on: z.ZodNullable<z.ZodString>;
        confidence: z.ZodEnum<{
            HIGH: "HIGH";
            LOW: "LOW";
            MEDIUM: "MEDIUM";
        }>;
        limitations: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
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