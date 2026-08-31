import { z } from "zod";
import { EnvironmentSchema, ExecutionClassSchema, } from "../contracts/common.js";
import { AttestationLevelSchema, ContentHashSchema, STUDY_SCHEMA_VERSION } from "./common.js";
import { calculateStudyHash, STUDY_HASH_RULES_ID, STUDY_HASH_RULES_KEY, studyRulesIdOf, } from "./hashing.js";
export const ResourceLimitsSchema = z.object({
    /**
     * Seconds the run was allowed. A limit, not a measurement: it is a decision
     * the caller made before the run and it hashes, unlike the durations the
     * canonicalizer excludes, which are artifacts of the run itself.
     */
    max_runtime: z.number().positive().nullable(),
    max_memory_bytes: z.number().int().positive().nullable(),
    max_credits: z.number().positive().nullable(),
});
export const CancellationSchema = z
    .object({
    cancelled: z.boolean(),
    reason: z.string().min(1).nullable(),
})
    .superRefine((cancellation, context) => {
    if (cancellation.cancelled && cancellation.reason === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A cancelled run must record why it was cancelled. A partial result whose truncation has no stated reason " +
                "reads like a completed one that simply found less.",
            path: ["reason"],
        });
    }
    if (!cancellation.cancelled && cancellation.reason !== null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A run that was not cancelled has no cancellation reason. A reason recorded beside `cancelled: false` is " +
                "a note nobody can act on and a reader will read as a caveat.",
            path: ["reason"],
        });
    }
});
const NamedVersionSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
});
export const ExecutionCapsuleSchema = z.object({
    schema_version: z.string().min(1),
    /** Required, never inferred. A capsule that does not name its rules is refused, not defaulted. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    study_ref: ContentHashSchema,
    /** The task this run answers. A capsule with no task is a run nobody asked for. */
    task_ref: ContentHashSchema,
    /** The validated manifest, referenced by the hash it already has rather than copied in. */
    manifest_hash: ContentHashSchema,
    versions: z.object({
        schema: z.string().min(1),
        /** Null when no adapter was involved; an adapter that ran is always named and pinned. */
        adapter: NamedVersionSchema.nullable(),
        engine: NamedVersionSchema,
    }),
    source_hash: ContentHashSchema,
    /**
     * The OCI digest of the image that ran, in the form a registry accepts, so it
     * can be pulled by exactly this string. Null when the run was not containerised
     * -- an absence, not a placeholder digest nobody can resolve.
     */
    image_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable(),
    dependency_lock_ref: ContentHashSchema.nullable(),
    /** Non-negative integer, or null when the run was not seeded. Zero is a seed. */
    seed: z.number().int().min(0).nullable(),
    environment: EnvironmentSchema,
    resource_limits: ResourceLimitsSchema,
    /** Every input, by hash, in the order the run consumed them. */
    input_hashes: z.array(ContentHashSchema),
    output_hashes: z.array(ContentHashSchema),
    logs_ref: ContentHashSchema.nullable(),
    /** Simulated never reads as hardware: the distinction is carried, not captioned. */
    execution_class: ExecutionClassSchema,
    cancellation: CancellationSchema,
    attestation_level: AttestationLevelSchema,
    /**
     * Excluded from the hash by name, like every timestamp in this repository. Two
     * runs of the same capsule differ in when they started and in nothing else
     * this record hashes.
     */
    started_at: z.string().datetime({ offset: true }).optional(),
    finished_at: z.string().datetime({ offset: true }).optional(),
    created_at: z.string().datetime({ offset: true }).optional(),
    /** SHA-256 over the canonical form of this capsule under `study-v1`. Excluded from itself. */
    reproducibility_hash: ContentHashSchema,
});
const NO_LIMITS = { max_runtime: null, max_memory_bytes: null, max_credits: null };
const NOT_CANCELLED = { cancelled: false, reason: null };
/**
 * Assemble a capsule and stamp it with its own hash.
 *
 * The order is `buildBundle`'s, and the order is the contract: parse the parts
 * first so anything the schemas normalise is normalised before it is hashed,
 * assemble the record with its rules id already present, hash that, then parse
 * the whole thing again with the hash on it. Hashing before the final parse
 * would digest a record that had not yet been validated, and hashing a record
 * whose rules id was added afterwards would digest something no verifier ever
 * sees.
 *
 * `attestation_level` is not an input. There is one member and it describes what
 * this code does rather than what a caller wants it to claim.
 */
export function buildExecutionCapsule(input) {
    const environment = EnvironmentSchema.parse(input.environment);
    const resourceLimits = ResourceLimitsSchema.parse(input.resourceLimits ?? NO_LIMITS);
    const cancellation = CancellationSchema.parse(input.cancellation ?? NOT_CANCELLED);
    const withoutHash = {
        schema_version: STUDY_SCHEMA_VERSION,
        [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
        study_ref: input.studyRef,
        task_ref: input.taskRef,
        manifest_hash: input.manifestHash,
        versions: {
            schema: STUDY_SCHEMA_VERSION,
            adapter: input.adapter ?? null,
            engine: input.engine,
        },
        source_hash: input.sourceHash,
        image_digest: input.imageDigest ?? null,
        dependency_lock_ref: input.dependencyLockRef ?? null,
        seed: input.seed ?? null,
        environment,
        resource_limits: resourceLimits,
        input_hashes: input.inputHashes ?? [],
        output_hashes: input.outputHashes ?? [],
        logs_ref: input.logsRef ?? null,
        execution_class: input.executionClass,
        cancellation,
        attestation_level: "hash_only",
        ...(input.startedAt ? { started_at: input.startedAt } : {}),
        ...(input.finishedAt ? { finished_at: input.finishedAt } : {}),
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    const hash = calculateStudyHash(withoutHash, STUDY_HASH_RULES_ID);
    return ExecutionCapsuleSchema.parse({ ...withoutHash, reproducibility_hash: hash });
}
/**
 * Recompute a capsule's hash under the rules it names.
 *
 * The rules id is read before the shape is checked, and that order matters: "we
 * do not know how to hash this" and "this is not a capsule" are different
 * answers, and reporting the second when the first is true would send a reader
 * looking for a schema bug in a record that simply predates -- or postdates --
 * the rule set this build knows.
 *
 * Unlike `verifyBundle` there is nothing here to recompute from inputs. A
 * capsule records what happened rather than deriving anything, so a matching
 * hash means the record is unedited and nothing more. It does not mean the run
 * happened, that the image named is the image that ran, or that the outputs came
 * out of it; `attestation_level` says so in the record itself.
 */
export function verifyExecutionCapsule(candidate) {
    const empty = { hash_matches: false, rules_id: null, expected_hash: "", actual_hash: "" };
    if (typeof candidate !== "object" || candidate === null) {
        return {
            valid: false,
            ...empty,
            problems: ["(root): an execution capsule must be an object."],
            refusals: [],
        };
    }
    let rulesId;
    try {
        rulesId = studyRulesIdOf(candidate);
    }
    catch (error) {
        const recorded = candidate[STUDY_HASH_RULES_KEY];
        const named = typeof recorded === "string" && recorded.length > 0;
        return {
            valid: false,
            ...empty,
            problems: [`${STUDY_HASH_RULES_KEY}: ${error.message}`],
            refusals: [
                {
                    subject: "execution_capsule",
                    code: named ? "STUDY_HASH_RULES_ID_UNKNOWN" : "STUDY_HASH_RULES_ID_MISSING",
                    message: error.message,
                },
            ],
        };
    }
    const parsed = ExecutionCapsuleSchema.safeParse(candidate);
    if (!parsed.success) {
        return {
            valid: false,
            ...empty,
            rules_id: rulesId,
            problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
            refusals: [],
        };
    }
    const capsule = parsed.data;
    const expected = calculateStudyHash(capsule, rulesId);
    const hashMatches = expected === capsule.reproducibility_hash;
    const problems = hashMatches
        ? []
        : [
            `Reproducibility hash mismatch: the capsule claims ${capsule.reproducibility_hash} and its own contents ` +
                `canonicalize to ${expected} under ${rulesId}.`,
        ];
    return {
        valid: hashMatches,
        hash_matches: hashMatches,
        rules_id: rulesId,
        expected_hash: expected,
        actual_hash: capsule.reproducibility_hash,
        problems,
        refusals: [],
    };
}
//# sourceMappingURL=capsule.js.map