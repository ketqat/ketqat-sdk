import { z } from "zod";
import { ExecutionClassSchema, IsoDateTimeSchema } from "../contracts/common.js";
import { artifactRefListSchema, ArtifactRefSchema } from "./artifact.js";
import { AttestationLevelSchema, ContentHashSchema, STUDY_SCHEMA_VERSION, StudyEnvironmentSchema, } from "./common.js";
import { studySelfHash } from "./hash.js";
import { StudyIdSchema } from "./identity.js";
import { studyNotHashableRefusal, studyRulesIdRefusal } from "./refusals.js";
import { STUDY_HASH_RULES_ID, STUDY_HASH_RULES_KEY } from "./rules.js";
import { ExactIntegerStringSchema, FiniteFloatSchema } from "./values.js";
export const ResourceLimitsSchema = z
    .object({
    /**
     * Seconds the run was allowed, as a `finite_float`. A limit, not a
     * measurement: it is a decision made before the run, so it is part of what
     * the capsule says, unlike the durations that are artifacts of running and
     * are classified as receipt evidence.
     */
    max_runtime: FiniteFloatSchema.positive().nullable(),
    /**
     * A byte count, as an `exact_integer_string`.
     *
     * This is the field the number problem is named after: 8 GiB is 8589934592
     * and fits, 16 EiB does not, and above 2^53 a JSON number is a double here
     * and an arbitrary-precision integer in Python, so one file takes two
     * digests depending on which language read it. Digits are the one
     * representation both languages hash identically at any magnitude.
     */
    max_memory_bytes: ExactIntegerStringSchema.nullable(),
    max_credits: FiniteFloatSchema.positive().nullable(),
})
    .strict();
export const CancellationSchema = z
    .object({
    cancelled: z.boolean(),
    reason: z.string().min(1).nullable(),
})
    .strict()
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
const NamedVersionSchema = z
    .object({
    name: z.string().min(1),
    version: z.string().min(1),
})
    .strict();
export const CostConfirmationSchema = z
    .object({
    credits_charged: FiniteFloatSchema.nonnegative(),
    /** The ceiling the confirmation receipt carried. Copied here so the comparison survives in the record. */
    authorized_maximum: FiniteFloatSchema.positive(),
    source: z.enum(["PROVIDER_REPORTED", "ADAPTER_COMPUTED"]),
})
    .strict()
    .superRefine((cost, context) => {
    if (cost.credits_charged > cost.authorized_maximum) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `The run was charged ${cost.credits_charged} credits against an authorised maximum of ` +
                `${cost.authorized_maximum}. A capsule recording a charge above its own ceiling is a record of a limit ` +
                "that did not hold, which is a finding rather than a field.",
            path: ["credits_charged"],
        });
    }
});
export const QuotaConfirmationSchema = z
    .object({
    /** Which quota was checked, in the provider's own words: `monthly_shots`, `concurrent_jobs`. */
    quota: z.string().min(1).max(128),
    within_quota: z.boolean(),
    source: z.enum(["PROVIDER_REPORTED", "ADAPTER_COMPUTED"]),
    exceeded_reason: z.string().min(1).nullable(),
})
    .strict()
    .superRefine((quota, context) => {
    if (!quota.within_quota && quota.exceeded_reason === null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A submission outside quota must record what was exceeded. Without it a reader sees a run that happened " +
                "anyway and cannot tell whether the result is partial.",
            path: ["exceeded_reason"],
        });
    }
    if (quota.within_quota && quota.exceeded_reason !== null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A run inside quota exceeded nothing, so there is nothing for this reason to describe.",
            path: ["exceeded_reason"],
        });
    }
});
export const BackendSnapshotSchema = z
    .object({
    provider: z.string().min(1).max(128),
    backend: z.string().min(1).max(128),
    snapshot_hash: ContentHashSchema,
})
    .strict();
export const ExecutionReceiptSchema = z
    .object({
    /** The `ExecutionJob` this run came from. A control-plane id, not a content address. */
    job_id: StudyIdSchema,
    /** Which attempt produced this capsule. Retries are the control plane's; which one ran is audit evidence. */
    attempt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    /**
     * Who the server believed was running this, as a free string. Nothing here
     * is signed, and an attribution field that looked like a signature would
     * claim a guarantee this repository does not provide (ADR 0014 §3).
     */
    actor: z.string().min(1),
    started_at: IsoDateTimeSchema,
    finished_at: IsoDateTimeSchema,
})
    .strict()
    .superRefine((receipt, context) => {
    if (Date.parse(receipt.finished_at) < Date.parse(receipt.started_at)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A run that started at ${receipt.started_at} did not finish at ${receipt.finished_at}. A negative ` +
                "duration is a clock problem, and recording it would put an impossible figure into an audit trail.",
            path: ["finished_at"],
        });
    }
});
/** An OCI image digest in the form a registry accepts, so it can be pulled by exactly this string. */
const ImageDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/, {
    message: "An image digest is `sha256:` and 64 lowercase hex digits -- the form a registry accepts. A tag is not a " +
        "digest: a tag moves, and a capsule pinned to one names an image that may no longer exist in that form.",
});
/**
 * The three branch schemas are plain strict objects with no refinement of their
 * own, and that is a constraint rather than a preference: zod v3's
 * `discriminatedUnion` takes `ZodObject` options, and a `superRefine` produces a
 * `ZodEffects` that it will not accept. So a rule spanning two fields of one
 * branch -- a managed run's resource limits must all be set -- is expressed as a
 * required path in `EXECUTION_EVIDENCE_REQUIREMENTS` and checked by the
 * capsule's own refinement. That turns out to be the better arrangement anyway:
 * the requirement ends up in the table a reviewer reads and a test iterates,
 * rather than hidden inside one branch where only that branch's test would find
 * it.
 */
const ManagedSimulationSchema = z
    .object({
    kind: z.literal("MANAGED_SIMULATION"),
    /** Never null here. A managed run is defined by the image this system pinned and pulled. */
    image_digest: ImageDigestSchema,
    dependency_lock_ref: ContentHashSchema,
    /** Which runner executed it. Two runners at two versions are two environments. */
    runner_version: NamedVersionSchema,
    resource_limits: ResourceLimitsSchema,
})
    .strict();
const LocalSimulationSchema = z
    .object({
    kind: z.literal("LOCAL_SIMULATION"),
    /**
     * Nullable, and the only class where it is.
     *
     * A local run may have had no container at all. Recording `null` is the
     * honest answer; a placeholder digest nobody can pull would read as a
     * managed run to every consumer that only checked for presence.
     */
    image_digest: ImageDigestSchema.nullable(),
    /**
     * What a local run does not establish, in the record.
     *
     * Required and free text, because the limitation is specific to the machine:
     * "run on an operator laptop; no attestation that the installed packages are
     * the ones listed" is a different sentence from "run inside a developer
     * container with unpinned system libraries". A closed enum would make every
     * local capsule claim the same caveat, and a caption on a page would let the
     * caveat be dropped by whoever rendered it.
     */
    attestation_limitation: z.string().min(1),
})
    .strict();
const HardwareSchema = z
    .object({
    kind: z.literal("HARDWARE"),
    /** Which adapter spoke to the provider, at which version. A vendor API is not stable across them. */
    provider_adapter: NamedVersionSchema,
    backend_snapshot: BackendSnapshotSchema,
    /**
     * The confirmation receipt this submission was made under, named again here.
     *
     * The authorization already names one, and a hardware run names it a second
     * time on purpose: this is the record that spends money on a device outside
     * this system, and it has to be checkable on its own, from the capsule
     * alone, by a reader who was handed one file.
     */
    confirmation_receipt_ref: ContentHashSchema,
    /** The provider's own result record, by hash. What they returned, not what we made of it. */
    provider_result_ref: ContentHashSchema,
    cost_confirmation: CostConfirmationSchema,
    quota_confirmation: QuotaConfirmationSchema,
})
    .strict();
export const ExecutionEnvelopeSchema = z.discriminatedUnion("kind", [
    ManagedSimulationSchema,
    LocalSimulationSchema,
    HardwareSchema,
]);
export const EXECUTION_EVIDENCE_REQUIREMENTS = Object.freeze([
    Object.freeze({
        resource_class: "MANAGED_SIMULATION",
        required_fields: Object.freeze([
            "execution.image_digest",
            "execution.dependency_lock_ref",
            "execution.runner_version",
            // The limits are named one by one rather than as the object, because
            // the object is always present and a null inside it is the interesting
            // failure: this system set the limits and knows them, so a null says no
            // limit applied, which for a managed runner is not true.
            "execution.resource_limits.max_runtime",
            "execution.resource_limits.max_memory_bytes",
            "execution.resource_limits.max_credits",
            "execution_receipt",
        ]),
        requires_captured_environment: false,
        execution_classes: Object.freeze(["SIMULATION", "DEMO"]),
        why: "Every one of these is a fact this system controlled and recorded: it chose the image, resolved the lock, " +
            "ran the runner and enforced the limits. A managed capsule missing one is a gap in our own records rather " +
            "than a limitation of the run, and a second party can reproduce it exactly.",
    }),
    Object.freeze({
        resource_class: "LOCAL_SIMULATION",
        required_fields: Object.freeze(["execution.attestation_limitation"]),
        requires_captured_environment: true,
        execution_classes: Object.freeze(["SIMULATION", "DEMO"]),
        why: "With no image to pull, the captured environment is the whole of what a second party has, so an empty one " +
            "would make the capsule a claim rather than a record. The stated limitation is what stops a local run " +
            "from being read with the confidence a managed one has earned.",
    }),
    Object.freeze({
        resource_class: "HARDWARE",
        required_fields: Object.freeze([
            "execution.provider_adapter",
            "execution.backend_snapshot",
            "execution.confirmation_receipt_ref",
            "execution.provider_result_ref",
            "execution.cost_confirmation",
            "execution.quota_confirmation",
        ]),
        requires_captured_environment: false,
        execution_classes: Object.freeze(["HARDWARE"]),
        why: "A hardware run spends money on a device this repository does not control and cannot re-run. What a reader " +
            "has instead is the adapter that spoke to it, the calibration it ran under, the approval it was submitted " +
            "on, the provider's own result, and what it actually cost against what was allowed.",
    }),
]);
/** The working lookup, module-private and built from the frozen tuple. */
const evidenceByClass = new Map(EXECUTION_EVIDENCE_REQUIREMENTS.map((entry) => [entry.resource_class, entry]));
/** The requirement for one execution class, or null where this build declares none. */
export function executionEvidenceRequirement(resourceClass) {
    return evidenceByClass.get(resourceClass) ?? null;
}
/**
 * Read a dotted path off a record, own properties only.
 *
 * `hasOwnProperty` rather than `value[key]`, for the reason the projection
 * gives: a polluted `Object.prototype` would otherwise supply a value for a
 * field the capsule does not have, and every capsule in the process would
 * satisfy the same requirement it does not meet.
 */
function ownPath(record, path) {
    let current = record;
    for (const segment of path.split(".")) {
        if (typeof current !== "object" || current === null)
            return undefined;
        if (!Object.prototype.hasOwnProperty.call(current, segment))
            return undefined;
        current = current[segment];
    }
    return current;
}
export const ExecutionCapsuleSchema = z
    .object({
    schema_version: z.string().min(1),
    /** Required, never inferred. A capsule that does not name its rules is refused, not defaulted. */
    hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
    /** The study this record belongs to, by its stable id: a rename does not break this reference. */
    study_ref: StudyIdSchema,
    /**
     * The `StudyTaskAuthorization` this run answers, by its content hash.
     *
     * An authorization is immutable and carries no status, so this pointer does
     * not move when the job does -- which is the property the old `task_ref`
     * did not have, and the reason a task's identity used to change after it
     * ran.
     */
    authorization_ref: ContentHashSchema,
    /** The validated manifest, referenced by the hash it already has rather than copied in. */
    manifest_hash: ContentHashSchema,
    versions: z
        .object({
        schema: z.string().min(1),
        /** Null when no adapter was involved; an adapter that ran is always named and pinned. */
        adapter: NamedVersionSchema.nullable(),
        engine: NamedVersionSchema,
    })
        .strict(),
    source_hash: ContentHashSchema,
    /**
     * The seed, as an `exact_integer_string`: `"0"` is a seed, `null` means the
     * run was not seeded, and `"18446744073709551615"` is an ordinary value.
     *
     * A string rather than a number, because a seed is an identifier for a
     * pseudo-random stream rather than a magnitude, and Stim and NumPy hand out
     * 64-bit ones. As a JSON number, a seed past 2^53 is the nearest double here
     * and the integer as written in Python -- so the same capsule takes two
     * digests, and nothing on this side can tell which of the many seeds sharing
     * that double actually ran.
     */
    seed: ExactIntegerStringSchema.nullable(),
    /**
     * Study-local, and array-shaped where the shared `EnvironmentSchema` is a
     * map. A map's keys are chosen by whatever captured the environment, and a
     * projection reads *declared* fields -- so a map would have to be read
     * wholesale, keys and all, or not at all. A list of `{name, value}` pairs is
     * neither.
     */
    environment: StudyEnvironmentSchema,
    /**
     * What went in and what came out, described rather than listed.
     *
     * Two arrays of bare digests used to stand here. A digest is not a
     * description: it cannot say whether the file was the whole output or the
     * part that existed before a timeout, whether a field was removed before it
     * was written, or where a second party would find the bytes. Each of those
     * is a question somebody asks of a result they are about to quote, and
     * `ArtifactRef` is where the answers are (`artifact.ts`).
     */
    inputs: artifactRefListSchema("input"),
    outputs: artifactRefListSchema("output"),
    /** Simulated never reads as hardware: the distinction is carried, not captioned. */
    execution_class: ExecutionClassSchema,
    /** What ran, and the evidence its class can actually produce. */
    execution: ExecutionEnvelopeSchema,
    logs_ref: ContentHashSchema.nullable(),
    cancellation: CancellationSchema,
    attestation_level: AttestationLevelSchema,
    /**
     * Who ran it, on which job, which attempt, and when.
     *
     * Optional on the record and required for a managed simulation, because a
     * local run has no job and a hardware submission's timing belongs to the
     * provider. Everything in it is `RECEIPT_ONLY`, which is what keeps a
     * retried run from reading as different science.
     */
    execution_receipt: ExecutionReceiptSchema.optional(),
    /** `RECEIPT_ONLY`: when the server observed this record, not what the run was. */
    created_at: IsoDateTimeSchema.optional(),
    /**
     * The capsule's own digest: `recordHash` under `study-v1`, over every
     * declared field except the three `DERIVED` ones. A record's own hash cannot
     * be an input to itself, and `schema_version` and `hash_rules_id` are
     * already committed to by the preimage header rather than restated in the
     * body.
     */
    reproducibility_hash: ContentHashSchema,
})
    .strict()
    .superRefine((capsule, context) => {
    const requirement = executionEvidenceRequirement(capsule.execution.kind);
    if (requirement === null) {
        // Unreachable while the union and the table are built from one list, and a
        // refusal rather than an assumption because a table row silently missing
        // is how a whole class of run stops being checked.
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `No evidence requirement is declared for execution class ${capsule.execution.kind}, so nothing can say ` +
                "what a capsule of that class has to carry.",
            path: ["execution", "kind"],
        });
        return;
    }
    for (const path of requirement.required_fields) {
        if (ownPath(capsule, path) != null)
            continue;
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${requirement.resource_class} capsule must carry ${path}. ${requirement.why}`,
            path: path.split("."),
        });
    }
    if (requirement.requires_captured_environment) {
        const environment = capsule.environment;
        const missing = [
            environment.operating_system === undefined ? "operating_system" : null,
            environment.architecture === undefined ? "architecture" : null,
            environment.packages.length === 0 ? "packages" : null,
        ].filter((name) => name !== null);
        if (missing.length > 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `A ${requirement.resource_class} capsule must capture the machine it ran on, and ` +
                    `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing. ${requirement.why}`,
                path: ["environment"],
            });
        }
    }
    if (!requirement.execution_classes.includes(capsule.execution_class)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A ${requirement.resource_class} run is filed as ${requirement.execution_classes.join(" or ")}, and ` +
                `this capsule says ${capsule.execution_class}. The two fields answer different questions -- which ` +
                "machine ran, and what kind of measurement this is -- and comparison code refuses to rank across the " +
                "second, so a mislabelled capsule is a result that gets ranked against the wrong things.",
            path: ["execution_class"],
        });
    }
    if (capsule.execution.kind === "HARDWARE" &&
        capsule.execution.cost_confirmation.credits_charged > 0 &&
        capsule.execution.quota_confirmation.within_quota === false) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "This capsule records a charge for a submission it also records as outside quota. One of the two is " +
                "wrong, and a reader cannot tell which, so the run cannot be filed as either.",
            path: ["execution", "quota_confirmation", "within_quota"],
        });
    }
});
const NOT_CANCELLED = { cancelled: false, reason: null };
/**
 * Assemble a capsule and stamp it with its own hash.
 *
 * The order is the family's, and the order is the contract: parse the parts
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
    const environment = StudyEnvironmentSchema.parse(input.environment);
    const cancellation = CancellationSchema.parse(input.cancellation ?? NOT_CANCELLED);
    const execution = ExecutionEnvelopeSchema.parse(input.execution);
    const withoutHash = {
        schema_version: STUDY_SCHEMA_VERSION,
        [STUDY_HASH_RULES_KEY]: STUDY_HASH_RULES_ID,
        study_ref: input.studyRef,
        authorization_ref: input.authorizationRef,
        manifest_hash: input.manifestHash,
        versions: {
            schema: STUDY_SCHEMA_VERSION,
            adapter: input.adapter ?? null,
            engine: input.engine,
        },
        source_hash: input.sourceHash,
        seed: input.seed ?? null,
        environment,
        inputs: (input.inputs ?? []).map((artifact) => ArtifactRefSchema.parse(artifact)),
        outputs: (input.outputs ?? []).map((artifact) => ArtifactRefSchema.parse(artifact)),
        execution_class: input.executionClass,
        execution,
        logs_ref: input.logsRef ?? null,
        cancellation,
        attestation_level: "hash_only",
        ...(input.executionReceipt ? { execution_receipt: input.executionReceipt } : {}),
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
    };
    const hash = studySelfHash("execution_capsule", withoutHash);
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
 * The hash is then taken over the candidate as it arrived, not over the parsed
 * value. Schema validation is a question asked *about* the record, and a
 * question that rewrites its subject -- filling in an omitted container, or
 * stripping a key it does not declare -- would make this verifier answer about a
 * record the file does not contain, and disagree with the Python verifier, which
 * reads the same bytes and fills in nothing.
 *
 * A matching hash means the record is unedited and nothing more. It does not
 * mean the run happened, that the image named is the image that ran, or that
 * the outputs came out of it; `attestation_level` says so in the record itself,
 * and a local capsule's `attestation_limitation` says it again in its own words.
 *
 * "Unedited" is the record digest's question, and the record digest is what a
 * capsule's `reproducibility_hash` is (`registry.ts`). The other question a
 * reader has about a capsule -- *did this describe the same computation as that
 * one* -- is `semanticHash("execution_capsule", capsule)`, which ignores who
 * ran it, when, on which attempt, and whether it was cancelled.
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
    const rulesRefusal = studyRulesIdRefusal("execution_capsule", candidate);
    if (rulesRefusal !== null) {
        return {
            valid: false,
            ...empty,
            problems: [`${STUDY_HASH_RULES_KEY}: ${rulesRefusal.message}`],
            refusals: [rulesRefusal],
        };
    }
    const rulesId = candidate[STUDY_HASH_RULES_KEY];
    // "This cannot be hashed" is answered before "this is not a capsule", and the
    // order is the same one the rules id gets, for the same reason: a record the
    // projection refuses -- an undeclared key, a field of the wrong shape, a
    // non-finite number -- is a hashing-layer finding, and reporting a schema
    // problem in its place sends a reader looking for the wrong bug.
    let expected;
    try {
        expected = studySelfHash("execution_capsule", candidate);
    }
    catch (error) {
        const refusal = studyNotHashableRefusal("execution_capsule", error);
        return {
            valid: false,
            ...empty,
            rules_id: rulesId,
            problems: [refusal.message],
            refusals: [refusal],
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
    // The digest is taken over the capsule *as written*, never over `parsed.data`.
    // Nothing this schema declares carries a `.default()` and every object in it
    // is strict, so a candidate that parses is the record the file contains --
    // which is the property that makes the two languages agree, not a reason to
    // stop reading the file.
    const capsule = candidate;
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