import { z } from "zod";
import { NoiseModelSchema } from "../engine/noise.js";
import { HardwareProfileSchema } from "../hardware/profile.js";
/**
 * Execution job contract (RFC 0005).
 *
 * The central decision: a job names an **approved operation** and supplies
 * **validated parameters**. It does not carry code. There is no field here that
 * accepts a script, a package name, an image reference, or a command, and that
 * absence is the security model -- not a container flag that could be
 * misconfigured, but a shape that cannot express arbitrary execution.
 *
 * This is a real restriction. Most of what the platform is for -- simulate this
 * circuit, transpile it for this device, estimate its resources, optimize it,
 * check two circuits for equivalence -- is expressible as a manifest naming an
 * approved operation. Arbitrary code execution buys the remainder at a
 * disproportionate increase in risk surface, and can be added later behind a
 * stricter boundary if it proves necessary.
 */
/** Operations the worker will perform. Anything not listed cannot be requested. */
export const JobOperationSchema = z.enum([
    "simulate",
    "transpile",
    "estimate_resources",
    "optimize_zx",
    "check_equivalence",
    "mitigate_zne",
]);
export const JobLimitsSchema = z.object({
    /** Wall-clock ceiling. A job that exceeds it is cancelled, not extended. */
    timeout_seconds: z.number().int().positive().max(900).default(120),
    max_qubits: z.number().int().positive().max(24).default(20),
    max_shots: z.number().int().positive().max(1000000).default(100000),
    /** Cap on result size, so a job cannot exhaust storage by succeeding. */
    max_result_bytes: z.number().int().positive().max(50000000).default(5000000),
});
const CircuitParameters = z.object({
    /** OpenQASM 3 source. Parsed by the declared subset; never evaluated. */
    qasm: z.string().min(1).max(1000000),
});
export const JobParametersSchema = z.discriminatedUnion("operation", [
    CircuitParameters.extend({
        operation: z.literal("simulate"),
        shots: z.number().int().positive().optional(),
        seed: z.number().int().nonnegative().optional(),
        noise: NoiseModelSchema.optional(),
    }),
    CircuitParameters.extend({
        operation: z.literal("transpile"),
        hardware_profile: HardwareProfileSchema,
    }),
    CircuitParameters.extend({
        operation: z.literal("estimate_resources"),
        hardware_profile: HardwareProfileSchema.optional(),
    }),
    CircuitParameters.extend({ operation: z.literal("optimize_zx") }),
    z.object({
        operation: z.literal("check_equivalence"),
        left_qasm: z.string().min(1).max(1000000),
        right_qasm: z.string().min(1).max(1000000),
        tolerance: z.number().positive().optional(),
    }),
    CircuitParameters.extend({
        operation: z.literal("mitigate_zne"),
        noise: NoiseModelSchema,
        shots: z.number().int().positive().optional(),
        seed: z.number().int().nonnegative().optional(),
    }),
]);
export const ExecutionJobSchema = z.object({
    schema_version: z.string().min(1),
    job_id: z.string().min(1),
    /**
     * Deduplicates retries. A retried submission must not run twice, since a
     * second run would consume budget and could produce a second, differing
     * record of the same request.
     */
    idempotency_key: z.string().min(1),
    submitted_by: z.string().min(1),
    parameters: JobParametersSchema,
    limits: JobLimitsSchema.default({
        timeout_seconds: 120,
        max_qubits: 20,
        max_shots: 100000,
        max_result_bytes: 5000000,
    }),
});
export const JobStatusSchema = z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
export const JobResultSchema = z.object({
    schema_version: z.string().min(1),
    job_id: z.string().min(1),
    status: JobStatusSchema,
    operation: JobOperationSchema,
    /** Present on success. Shape depends on the operation. */
    output: z.record(z.unknown()).optional(),
    /** Present on failure, and never a raw stack trace. */
    error: z.string().min(1).optional(),
    started_at: z.string().min(1),
    finished_at: z.string().min(1),
    duration_ms: z.number().nonnegative(),
    /** Execution class, so a sandboxed simulation is never read as hardware. */
    execution_class: z.literal("SIMULATION"),
    worker_version: z.string().min(1),
});
/**
 * Fields a job must never contain.
 *
 * Checked explicitly rather than relying on the schema's shape alone, because a
 * future edit could add one of these without anyone noticing it re-opened
 * arbitrary execution. The test asserts each is rejected.
 */
export const FORBIDDEN_JOB_FIELDS = [
    "code",
    "script",
    "command",
    "cmd",
    "entrypoint",
    "image",
    "package",
    "packages",
    "install",
    "requirements",
    "eval",
    "exec",
    "shell",
    "env",
    "credentials",
    "token",
    "secret",
    "password",
    "api_key",
];
export class JobRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = "JobRejectedError";
    }
}
/**
 * Validate a submitted job.
 *
 * Rejects any payload carrying a field that would imply code execution or a
 * credential, at any depth, before schema parsing. A credential in a job body
 * is a mistake worth refusing loudly: credentials belong in the execution
 * plane's own secret mount for the lifetime of one job, never in a record that
 * gets stored and logged.
 */
export function validateJob(input) {
    assertNoForbiddenFields(input, "");
    const parsed = ExecutionJobSchema.safeParse(input);
    if (!parsed.success) {
        throw new JobRejectedError(`Job failed validation: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; ")}`);
    }
    return parsed.data;
}
function assertNoForbiddenFields(value, path) {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertNoForbiddenFields(entry, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== "object")
        return;
    for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_JOB_FIELDS.includes(key.toLowerCase())) {
            throw new JobRejectedError(`Job contains a forbidden field '${path ? `${path}.` : ""}${key}'. Jobs name an approved ` +
                "operation and supply validated parameters; they never carry code, images, packages, or " +
                "credentials.");
        }
        assertNoForbiddenFields(nested, path ? `${path}.${key}` : key);
    }
}
/** Enforce declared limits against the job's own parameters. */
export function assertWithinLimits(job) {
    const { limits, parameters } = job;
    if ("shots" in parameters && parameters.shots !== undefined && parameters.shots > limits.max_shots) {
        throw new JobRejectedError(`Requested ${parameters.shots} shots, above this job's limit of ${limits.max_shots}.`);
    }
}
//# sourceMappingURL=job.js.map