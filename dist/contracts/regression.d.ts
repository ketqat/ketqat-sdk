import { z } from "zod";
export declare const REGRESSION_EXIT_CODES: {
    readonly WITHIN_POLICY: 0;
    readonly REGRESSION: 1;
    readonly INCONCLUSIVE: 2;
    readonly INCOMPATIBLE: 3;
    readonly ERROR: 4;
    readonly NOT_RUN: 5;
};
export declare const RegressionVerdictSchema: z.ZodEnum<{
    ERROR: "ERROR";
    INCOMPATIBLE: "INCOMPATIBLE";
    INCONCLUSIVE: "INCONCLUSIVE";
    NOT_RUN: "NOT_RUN";
    REGRESSION: "REGRESSION";
    WITHIN_POLICY: "WITHIN_POLICY";
}>;
export declare const RegressionResourceLimitSchema: z.ZodObject<{
    absolute_increase: z.ZodNumber;
    relative_increase: z.ZodNumber;
}, z.core.$strict>;
export declare const RegressionPolicySchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"ketqat.regression.policy.v1">;
    changed_axes: z.ZodArray<z.ZodEnum<{
        circuit: "circuit";
        qiskit: "qiskit";
        source_commit: "source_commit";
    }>>;
    resources: z.ZodObject<{
        depth: z.ZodOptional<z.ZodObject<{
            absolute_increase: z.ZodNumber;
            relative_increase: z.ZodNumber;
        }, z.core.$strict>>;
        size: z.ZodOptional<z.ZodObject<{
            absolute_increase: z.ZodNumber;
            relative_increase: z.ZodNumber;
        }, z.core.$strict>>;
        two_qubit_gates: z.ZodOptional<z.ZodObject<{
            absolute_increase: z.ZodNumber;
            relative_increase: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    max_total_variation: z.ZodNullable<z.ZodNumber>;
    family_alpha: z.ZodNumber;
}, z.core.$strict>;
export type RegressionPolicy = z.infer<typeof RegressionPolicySchema>;
export declare const RegressionSummarySchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"ketqat.regression.summary.v1">;
    provenance: z.ZodLiteral<"CLIENT_REPORTED">;
    case_key: z.ZodString;
    baseline_sha256: z.ZodString;
    candidate_sha256: z.ZodString;
    baseline_status: z.ZodEnum<{
        ERROR: "ERROR";
        EXECUTED: "EXECUTED";
        NOT_RUN: "NOT_RUN";
    }>;
    candidate_status: z.ZodEnum<{
        ERROR: "ERROR";
        EXECUTED: "EXECUTED";
        NOT_RUN: "NOT_RUN";
    }>;
    policy: z.ZodObject<{
        schema_version: z.ZodLiteral<"ketqat.regression.policy.v1">;
        changed_axes: z.ZodArray<z.ZodEnum<{
            circuit: "circuit";
            qiskit: "qiskit";
            source_commit: "source_commit";
        }>>;
        resources: z.ZodObject<{
            depth: z.ZodOptional<z.ZodObject<{
                absolute_increase: z.ZodNumber;
                relative_increase: z.ZodNumber;
            }, z.core.$strict>>;
            size: z.ZodOptional<z.ZodObject<{
                absolute_increase: z.ZodNumber;
                relative_increase: z.ZodNumber;
            }, z.core.$strict>>;
            two_qubit_gates: z.ZodOptional<z.ZodObject<{
                absolute_increase: z.ZodNumber;
                relative_increase: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        max_total_variation: z.ZodNullable<z.ZodNumber>;
        family_alpha: z.ZodNumber;
    }, z.core.$strict>;
    changed_fields: z.ZodArray<z.ZodEnum<{
        case_id: "case_id";
        circuit_sha256: "circuit_sha256";
        "conditions.backend": "conditions.backend";
        "conditions.basis_gates": "conditions.basis_gates";
        "conditions.bit_order": "conditions.bit_order";
        "conditions.execution": "conditions.execution";
        "conditions.initial_state": "conditions.initial_state";
        "conditions.measurement": "conditions.measurement";
        "conditions.noise": "conditions.noise";
        "conditions.optimization_level": "conditions.optimization_level";
        "conditions.qubits": "conditions.qubits";
        "conditions.seed": "conditions.seed";
        "conditions.shots": "conditions.shots";
        "environment.kernel": "environment.kernel";
        "environment.ketqat": "environment.ketqat";
        "environment.ketqat_capture": "environment.ketqat_capture";
        "environment.machine": "environment.machine";
        "environment.numpy": "environment.numpy";
        "environment.python": "environment.python";
        "environment.qiskit": "environment.qiskit";
        "environment.scipy": "environment.scipy";
        "environment.system": "environment.system";
        factory: "factory";
        factory_sha256: "factory_sha256";
        source_commit: "source_commit";
        source_dirty: "source_dirty";
    }>>;
    resources: z.ZodObject<{
        baseline: z.ZodNullable<z.ZodObject<{
            depth: z.ZodOptional<z.ZodNumber>;
            size: z.ZodOptional<z.ZodNumber>;
            two_qubit_gates: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        candidate: z.ZodNullable<z.ZodObject<{
            depth: z.ZodOptional<z.ZodNumber>;
            size: z.ZodOptional<z.ZodNumber>;
            two_qubit_gates: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    distribution: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
        estimate: z.ZodNumber;
        method: z.ZodLiteral<"EXACT_IDEAL">;
        qubits: z.ZodNumber;
        baseline_shots: z.ZodNull;
        candidate_shots: z.ZodNull;
    }, z.core.$strict>, z.ZodObject<{
        estimate: z.ZodNumber;
        method: z.ZodLiteral<"HOEFFDING_ALL_OUTCOMES">;
        qubits: z.ZodNumber;
        baseline_shots: z.ZodNumber;
        candidate_shots: z.ZodNumber;
    }, z.core.$strict>], "method">>;
    verdict: z.ZodEnum<{
        ERROR: "ERROR";
        INCOMPATIBLE: "INCOMPATIBLE";
        INCONCLUSIVE: "INCONCLUSIVE";
        NOT_RUN: "NOT_RUN";
        REGRESSION: "REGRESSION";
        WITHIN_POLICY: "WITHIN_POLICY";
    }>;
    exit_code: z.ZodNumber;
}, z.core.$strict>;
export type RegressionSummary = z.infer<typeof RegressionSummarySchema>;
export type RegressionVerdict = z.infer<typeof RegressionVerdictSchema>;
export type RegressionCheck = {
    metric: "depth" | "size" | "two_qubit_gates" | "total_variation";
    verdict: "WITHIN_POLICY" | "REGRESSION" | "INCONCLUSIVE";
    baseline?: number;
    candidate?: number;
    maximum?: number;
    estimate?: number;
    lower?: number;
    upper?: number;
};
export declare function parseRegressionPolicy(input: unknown): RegressionPolicy;
/** Recheck summary arithmetic and verdict consistency, not the private simulation. */
export declare function inspectRegressionSummary(input: unknown): {
    summary: RegressionSummary;
    checks: RegressionCheck[];
};
//# sourceMappingURL=regression.d.ts.map