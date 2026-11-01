import { z } from "zod";
export declare const ReproducibilityBundleSchema: z.ZodObject<{
    bundle_version: z.ZodString;
    experiment_manifest: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    benchmark_result: z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        slug: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        status: z.ZodEnum<{
            COMPLETED: "COMPLETED";
            FAILED: "FAILED";
            RUNNING: "RUNNING";
        }>;
        artifact_slug: z.ZodOptional<z.ZodString>;
        benchmark_suite: z.ZodString;
        benchmark_suite_version: z.ZodString;
        schema_version: z.ZodString;
        sdk_version: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        source_repository_url: z.ZodOptional<z.ZodString>;
        configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodPrefault<z.ZodObject<{
            operating_system: z.ZodOptional<z.ZodString>;
            architecture: z.ZodOptional<z.ZodString>;
            python_version: z.ZodOptional<z.ZodString>;
            node_version: z.ZodOptional<z.ZodString>;
            packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>>;
        summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        reproducibility_hash: z.ZodString;
        reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        finished_at: z.ZodOptional<z.ZodString>;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        visibility: z.ZodOptional<z.ZodEnum<{
            PRIVATE: "PRIVATE";
            PUBLIC: "PUBLIC";
        }>>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
        execution_class: z.ZodOptional<z.ZodEnum<{
            ANALYTICAL: "ANALYTICAL";
            DEMO: "DEMO";
            HARDWARE: "HARDWARE";
            SIMULATION: "SIMULATION";
        }>>;
        transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                CONVERSION: "CONVERSION";
                EXPORT: "EXPORT";
                IMPORT: "IMPORT";
                LAYOUT: "LAYOUT";
                MITIGATION: "MITIGATION";
                OPTIMIZATION: "OPTIMIZATION";
                ROUTING: "ROUTING";
                TRANSPILATION: "TRANSPILATION";
                ZX_REWRITE: "ZX_REWRITE";
            }>;
            adapter: z.ZodString;
            adapter_version: z.ZodString;
            library_version: z.ZodOptional<z.ZodString>;
            options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            input_circuit_hash: z.ZodOptional<z.ZodString>;
            output_circuit_hash: z.ZodOptional<z.ZodString>;
            loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
                feature: z.ZodString;
                severity: z.ZodEnum<{
                    cosmetic: "cosmetic";
                    semantic: "semantic";
                    structural: "structural";
                }>;
                action: z.ZodEnum<{
                    approximated: "approximated";
                    dropped: "dropped";
                    rejected: "rejected";
                }>;
                detail: z.ZodString;
                location: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            equivalence: z.ZodOptional<z.ZodObject<{
                level: z.ZodEnum<{
                    FAILED: "FAILED";
                    INCONCLUSIVE: "INCONCLUSIVE";
                    NOT_CHECKED: "NOT_CHECKED";
                    NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
                    PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
                    SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
                }>;
                method: z.ZodOptional<z.ZodString>;
                tolerance: z.ZodOptional<z.ZodNumber>;
                global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
                qubit_count: z.ZodOptional<z.ZodNumber>;
                counterexample: z.ZodOptional<z.ZodString>;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
        domain: z.ZodLiteral<"QEC">;
        metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
            metric: z.ZodString;
            shots: z.ZodOptional<z.ZodNumber>;
            runtime_seconds: z.ZodOptional<z.ZodNumber>;
            memory_bytes: z.ZodOptional<z.ZodNumber>;
            seed: z.ZodOptional<z.ZodNumber>;
            metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            code_distance: z.ZodOptional<z.ZodNumber>;
            physical_error_rate: z.ZodOptional<z.ZodNumber>;
            logical_failures: z.ZodOptional<z.ZodNumber>;
            logical_error_rate: z.ZodOptional<z.ZodNumber>;
            standard_error: z.ZodOptional<z.ZodNumber>;
            decoder_latency_ms: z.ZodOptional<z.ZodNumber>;
            sampling_runtime_seconds: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        slug: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        status: z.ZodEnum<{
            COMPLETED: "COMPLETED";
            FAILED: "FAILED";
            RUNNING: "RUNNING";
        }>;
        artifact_slug: z.ZodOptional<z.ZodString>;
        benchmark_suite: z.ZodString;
        benchmark_suite_version: z.ZodString;
        schema_version: z.ZodString;
        sdk_version: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        source_repository_url: z.ZodOptional<z.ZodString>;
        configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodPrefault<z.ZodObject<{
            operating_system: z.ZodOptional<z.ZodString>;
            architecture: z.ZodOptional<z.ZodString>;
            python_version: z.ZodOptional<z.ZodString>;
            node_version: z.ZodOptional<z.ZodString>;
            packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>>;
        summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        reproducibility_hash: z.ZodString;
        reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        finished_at: z.ZodOptional<z.ZodString>;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        visibility: z.ZodOptional<z.ZodEnum<{
            PRIVATE: "PRIVATE";
            PUBLIC: "PUBLIC";
        }>>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
        execution_class: z.ZodOptional<z.ZodEnum<{
            ANALYTICAL: "ANALYTICAL";
            DEMO: "DEMO";
            HARDWARE: "HARDWARE";
            SIMULATION: "SIMULATION";
        }>>;
        transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                CONVERSION: "CONVERSION";
                EXPORT: "EXPORT";
                IMPORT: "IMPORT";
                LAYOUT: "LAYOUT";
                MITIGATION: "MITIGATION";
                OPTIMIZATION: "OPTIMIZATION";
                ROUTING: "ROUTING";
                TRANSPILATION: "TRANSPILATION";
                ZX_REWRITE: "ZX_REWRITE";
            }>;
            adapter: z.ZodString;
            adapter_version: z.ZodString;
            library_version: z.ZodOptional<z.ZodString>;
            options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            input_circuit_hash: z.ZodOptional<z.ZodString>;
            output_circuit_hash: z.ZodOptional<z.ZodString>;
            loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
                feature: z.ZodString;
                severity: z.ZodEnum<{
                    cosmetic: "cosmetic";
                    semantic: "semantic";
                    structural: "structural";
                }>;
                action: z.ZodEnum<{
                    approximated: "approximated";
                    dropped: "dropped";
                    rejected: "rejected";
                }>;
                detail: z.ZodString;
                location: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            equivalence: z.ZodOptional<z.ZodObject<{
                level: z.ZodEnum<{
                    FAILED: "FAILED";
                    INCONCLUSIVE: "INCONCLUSIVE";
                    NOT_CHECKED: "NOT_CHECKED";
                    NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
                    PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
                    SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
                }>;
                method: z.ZodOptional<z.ZodString>;
                tolerance: z.ZodOptional<z.ZodNumber>;
                global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
                qubit_count: z.ZodOptional<z.ZodNumber>;
                counterexample: z.ZodOptional<z.ZodString>;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
        domain: z.ZodLiteral<"ALGORITHM">;
        metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
            metric: z.ZodString;
            shots: z.ZodOptional<z.ZodNumber>;
            runtime_seconds: z.ZodOptional<z.ZodNumber>;
            memory_bytes: z.ZodOptional<z.ZodNumber>;
            seed: z.ZodOptional<z.ZodNumber>;
            metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            qubit_count: z.ZodOptional<z.ZodNumber>;
            circuit_depth: z.ZodOptional<z.ZodNumber>;
            gate_count: z.ZodOptional<z.ZodNumber>;
            two_qubit_gate_count: z.ZodOptional<z.ZodNumber>;
            success_probability: z.ZodOptional<z.ZodNumber>;
            fidelity: z.ZodOptional<z.ZodNumber>;
            objective_value: z.ZodOptional<z.ZodNumber>;
            energy_error: z.ZodOptional<z.ZodNumber>;
            approximation_ratio: z.ZodOptional<z.ZodNumber>;
            simulation_runtime_seconds: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        slug: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        status: z.ZodEnum<{
            COMPLETED: "COMPLETED";
            FAILED: "FAILED";
            RUNNING: "RUNNING";
        }>;
        artifact_slug: z.ZodOptional<z.ZodString>;
        benchmark_suite: z.ZodString;
        benchmark_suite_version: z.ZodString;
        schema_version: z.ZodString;
        sdk_version: z.ZodOptional<z.ZodString>;
        commit_sha: z.ZodOptional<z.ZodString>;
        source_repository_url: z.ZodOptional<z.ZodString>;
        configuration: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodPrefault<z.ZodObject<{
            operating_system: z.ZodOptional<z.ZodString>;
            architecture: z.ZodOptional<z.ZodString>;
            python_version: z.ZodOptional<z.ZodString>;
            node_version: z.ZodOptional<z.ZodString>;
            packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>>;
        summary_metrics: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        reproducibility_hash: z.ZodString;
        reproducibility_hash_version: z.ZodOptional<z.ZodNumber>;
        started_at: z.ZodOptional<z.ZodString>;
        finished_at: z.ZodOptional<z.ZodString>;
        is_demo: z.ZodDefault<z.ZodBoolean>;
        owner_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        visibility: z.ZodOptional<z.ZodEnum<{
            PRIVATE: "PRIVATE";
            PUBLIC: "PUBLIC";
        }>>;
        created_at: z.ZodOptional<z.ZodString>;
        updated_at: z.ZodOptional<z.ZodString>;
        execution_class: z.ZodOptional<z.ZodEnum<{
            ANALYTICAL: "ANALYTICAL";
            DEMO: "DEMO";
            HARDWARE: "HARDWARE";
            SIMULATION: "SIMULATION";
        }>>;
        transformation_chain: z.ZodOptional<z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                CONVERSION: "CONVERSION";
                EXPORT: "EXPORT";
                IMPORT: "IMPORT";
                LAYOUT: "LAYOUT";
                MITIGATION: "MITIGATION";
                OPTIMIZATION: "OPTIMIZATION";
                ROUTING: "ROUTING";
                TRANSPILATION: "TRANSPILATION";
                ZX_REWRITE: "ZX_REWRITE";
            }>;
            adapter: z.ZodString;
            adapter_version: z.ZodString;
            library_version: z.ZodOptional<z.ZodString>;
            options: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            input_circuit_hash: z.ZodOptional<z.ZodString>;
            output_circuit_hash: z.ZodOptional<z.ZodString>;
            loss_report: z.ZodDefault<z.ZodArray<z.ZodObject<{
                feature: z.ZodString;
                severity: z.ZodEnum<{
                    cosmetic: "cosmetic";
                    semantic: "semantic";
                    structural: "structural";
                }>;
                action: z.ZodEnum<{
                    approximated: "approximated";
                    dropped: "dropped";
                    rejected: "rejected";
                }>;
                detail: z.ZodString;
                location: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            equivalence: z.ZodOptional<z.ZodObject<{
                level: z.ZodEnum<{
                    FAILED: "FAILED";
                    INCONCLUSIVE: "INCONCLUSIVE";
                    NOT_CHECKED: "NOT_CHECKED";
                    NUMERICALLY_CHECKED: "NUMERICALLY_CHECKED";
                    PROVED_BY_SUPPORTED_REWRITE: "PROVED_BY_SUPPORTED_REWRITE";
                    SYMBOLICALLY_REDUCED: "SYMBOLICALLY_REDUCED";
                }>;
                method: z.ZodOptional<z.ZodString>;
                tolerance: z.ZodOptional<z.ZodNumber>;
                global_phase_ignored: z.ZodOptional<z.ZodBoolean>;
                qubit_count: z.ZodOptional<z.ZodNumber>;
                counterexample: z.ZodOptional<z.ZodString>;
                reason: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
        domain: z.ZodLiteral<"PROTOCOL">;
        metric_points: z.ZodDefault<z.ZodArray<z.ZodObject<{
            metric: z.ZodString;
            shots: z.ZodOptional<z.ZodNumber>;
            runtime_seconds: z.ZodOptional<z.ZodNumber>;
            memory_bytes: z.ZodOptional<z.ZodNumber>;
            seed: z.ZodOptional<z.ZodNumber>;
            metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            sequence_length: z.ZodOptional<z.ZodNumber>;
            survival_probability: z.ZodOptional<z.ZodNumber>;
            standard_error: z.ZodOptional<z.ZodNumber>;
            sequences: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>], "domain">;
    benchmark_suite_definition: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    verification_evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        schema_version: z.ZodString;
        subject: z.ZodObject<{
            type: z.ZodEnum<{
                ARTIFACT: "ARTIFACT";
                BENCHMARK_RUN: "BENCHMARK_RUN";
                BENCHMARK_SUITE: "BENCHMARK_SUITE";
            }>;
            slug: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        status: z.ZodEnum<{
            REPRODUCED: "REPRODUCED";
            UNVERIFIED: "UNVERIFIED";
            VALIDATED_SCHEMA: "VALIDATED_SCHEMA";
        }>;
        evidence_kind: z.ZodEnum<{
            DEMO_FIXTURE_REPRODUCTION: "DEMO_FIXTURE_REPRODUCTION";
            HASH_VERIFICATION: "HASH_VERIFICATION";
            INDEPENDENT_REPRODUCTION: "INDEPENDENT_REPRODUCTION";
            REVIEW_NOTE: "REVIEW_NOTE";
            SCHEMA_VALIDATION: "SCHEMA_VALIDATION";
        }>;
        summary: z.ZodString;
        evidence_url: z.ZodOptional<z.ZodString>;
        reproducibility_hash: z.ZodOptional<z.ZodString>;
        source: z.ZodPrefault<z.ZodObject<{
            repository_url: z.ZodOptional<z.ZodString>;
            commit_sha: z.ZodOptional<z.ZodString>;
            command: z.ZodOptional<z.ZodString>;
            manifest_path: z.ZodOptional<z.ZodString>;
            runner: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        environment: z.ZodOptional<z.ZodObject<{
            operating_system: z.ZodOptional<z.ZodString>;
            architecture: z.ZodOptional<z.ZodString>;
            python_version: z.ZodOptional<z.ZodString>;
            node_version: z.ZodOptional<z.ZodString>;
            packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>>;
        is_demo_evidence: z.ZodDefault<z.ZodBoolean>;
        checked_at: z.ZodString;
        reviewer: z.ZodOptional<z.ZodString>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>>;
    artifact_metadata: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        slug: z.ZodString;
    }, z.core.$strip>>>;
    environment: z.ZodPrefault<z.ZodObject<{
        operating_system: z.ZodOptional<z.ZodString>;
        architecture: z.ZodOptional<z.ZodString>;
        python_version: z.ZodOptional<z.ZodString>;
        node_version: z.ZodOptional<z.ZodString>;
        packages: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        hardware: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    source_repository: z.ZodString;
    commit_sha: z.ZodString;
    reproducibility_hash: z.ZodString;
    citation: z.ZodString;
    reproduction_instructions: z.ZodObject<{
        command: z.ZodString;
        notes: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ReproducibilityBundle = z.infer<typeof ReproducibilityBundleSchema>;
//# sourceMappingURL=reproducibility-bundle.d.ts.map