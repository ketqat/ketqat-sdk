import { type ExecutionClass } from "../contracts/common.js";
import type { Contract } from "../intelligence/measurement.js";
import { type ArtifactRef } from "./artifact.js";
import { type ExecutionResourceClass, type StudyEnvironment } from "./common.js";
import { type StudyRefusal } from "./refusals.js";
/**
 * One execution, recorded so it can be argued with (goal §15, ADR 0014).
 *
 * A capsule says what ran and what it produced: which source, which image,
 * which adapter and engine at which versions, which seed, what went in, what
 * came out, what the run was allowed to spend, and whether somebody stopped it.
 * It is the record a second party needs to attempt the same run, and the record
 * a reader needs to know why their attempt came out differently.
 *
 * ## Why the evidence is per execution class
 *
 * One flat set of fields could not describe three different kinds of run
 * honestly. A container this system pinned, a script on somebody's laptop and a
 * job on a physical device are reproducible to entirely different degrees, and
 * a shape that made every field optional would let the weakest of them be
 * written with the same completeness as the strongest -- a local run with a
 * null image digest and no environment would look exactly like a managed run
 * whose fields nobody had filled in yet.
 *
 * So `execution` is a discriminated union, and each member requires the
 * evidence that its class can actually produce:
 *
 * | class | requires | because |
 * | --- | --- | --- |
 * | `MANAGED_SIMULATION` | image digest, dependency lock, runner version, resource limits, execution receipt | every one of them is a fact this system controls and recorded, so a run missing one is a gap rather than a limitation |
 * | `LOCAL_SIMULATION` | the captured environment and an explicit attestation limitation; image digest may be null | with no image there is nothing to pull, so the environment is the whole of what a second party has -- and the limitation says so in the record rather than in a caption |
 * | `HARDWARE` | provider adapter, backend snapshot, confirmation receipt, provider result ref, cost and quota confirmation, execution class `HARDWARE` | it spends money on a device this repository does not control, and every one of those is what a reader needs to tell a charged run from a claimed one |
 *
 * ## What a capsule is not
 *
 * It is not proof. `attestation_level` is a closed enum with one member,
 * `hash_only`, hashed along with everything else, so a capsule states the
 * strength of its own evidence in a field that cannot be edited afterwards
 * without breaking its hash. Nothing in this repository signs anything, nothing
 * attests that the image digest recorded here is the image that ran, and a
 * level named `signed` would be a promise the code does not keep.
 *
 * ## No credential is stored, and that is structural
 *
 * A hardware run needs an API token to reach a provider. No field below can
 * hold one: every hardware field is a name, a version, a hash or a number, the
 * object is `.strict()` so an undeclared key is refused at the parse, and the
 * projection in `registry.ts` refuses an undeclared key again at the digest --
 * so a token added to a capsule by a well-meaning adapter fails twice rather
 * than being quietly hashed into a record that gets shipped in a bundle.
 * `resolution.locator` on an artifact is a store key or a provider job id and
 * never a signed URL, for the same reason and because a signed URL expires
 * while a capsule is read years later.
 *
 * Contents are referenced, never inlined: the manifest, the source tree, the
 * dependency lock, the logs and every input and output are named by hash and
 * described by an `ArtifactRef`. A capsule stays small enough to store per run,
 * and a referenced blob that changed after the fact stops resolving instead of
 * quietly disagreeing with the record that names it.
 */
/**
 * Where the safe-integer bound went, and what replaced it.
 *
 * `seed`, `resource_limits.max_memory_bytes` and every artifact's `byte_size`
 * carry integers a double cannot hold. The fix is a contract per field rather
 * than a bound per number (`values.ts`, goal §11): a seed and a byte count are
 * `exact_integer_string`, recorded as digits so the two languages hash what was
 * written rather than two roundings of it, and validated so that one value has
 * one spelling. A runtime ceiling and a credit ceiling are `finite_float`,
 * because they are magnitudes rather than identifiers and 2^53 is not a bound
 * either of them can reach.
 */
/** What the run was allowed to spend. Null where no limit was set, never zero standing in for one. */
export interface ResourceLimits {
    max_runtime: number | null;
    max_memory_bytes: string | null;
    max_credits: number | null;
}
export declare const ResourceLimitsSchema: Contract<ResourceLimits>;
/** Whether somebody stopped this run, and why they said they did. */
export interface Cancellation {
    cancelled: boolean;
    reason: string | null;
}
export declare const CancellationSchema: Contract<Cancellation>;
export interface NamedVersion {
    name: string;
    version: string;
}
/**
 * What the run cost, as the provider reported it, against what was authorised.
 *
 * Both numbers, not just the charge. A charge on its own is unreadable -- 340
 * credits is either well inside a ceiling or nearly double it -- and the
 * comparison is the thing a reader is actually making. `source` says whether
 * the figure came from the provider or was worked out by the adapter, because a
 * cost the adapter computed is an estimate wearing a receipt's clothes.
 */
export interface CostConfirmation {
    credits_charged: number;
    authorized_maximum: number;
    source: "PROVIDER_REPORTED" | "ADAPTER_COMPUTED";
}
export declare const CostConfirmationSchema: Contract<CostConfirmation>;
/**
 * That the run was inside the account's quota when it was submitted.
 *
 * `within_quota: false` is recordable, deliberately: a submission refused for
 * quota is a thing that happened, and a schema that could only express success
 * would push the failure into a free-text log. What it must not do is go
 * unexplained, so the two are paired the way a cancellation and its reason are.
 */
export interface QuotaConfirmation {
    quota: string;
    within_quota: boolean;
    source: "PROVIDER_REPORTED" | "ADAPTER_COMPUTED";
    exceeded_reason: string | null;
}
export declare const QuotaConfirmationSchema: Contract<QuotaConfirmation>;
/**
 * Which device, on which provider, in which calibration.
 *
 * The calibration is referenced rather than copied: a snapshot is a record with
 * its own identity and its own capture time, and inlining it here would put a
 * timestamp inside the semantic projection of every hardware capsule. What the
 * capsule needs is which snapshot, which is a hash.
 */
export interface BackendSnapshot {
    provider: string;
    backend: string;
    snapshot_hash: string;
}
export declare const BackendSnapshotSchema: Contract<BackendSnapshot>;
/**
 * The server's record of running the job: who, which job, which attempt, when.
 *
 * Every field here is `RECEIPT_ONLY`, which is what keeps it out of the
 * semantic digest. Two runs of identical inputs describe the same intended
 * computation whether they ran in March or in December, on attempt one or on
 * attempt four; a semantic digest that read a start time would report new
 * science every time a job was retried.
 *
 * It is also where the job id lives rather than on the capsule proper. An
 * `ExecutionJob` is mutable control-plane state and is not content-addressed
 * (`task.ts`), so a capsule that carried its id as semantic content would tie
 * an immutable record to a row that changes underneath it.
 */
export interface ExecutionReceipt {
    job_id: string;
    attempt: number;
    actor: string;
    started_at: string;
    finished_at: string;
}
export declare const ExecutionReceiptSchema: Contract<ExecutionReceipt>;
export type ExecutionEnvelope = {
    kind: "MANAGED_SIMULATION";
    image_digest: string;
    dependency_lock_ref: string;
    runner_version: NamedVersion;
    resource_limits: ResourceLimits;
} | {
    kind: "LOCAL_SIMULATION";
    image_digest: string | null;
    attestation_limitation: string;
} | {
    kind: "HARDWARE";
    provider_adapter: NamedVersion;
    backend_snapshot: BackendSnapshot;
    confirmation_receipt_ref: string;
    provider_result_ref: string;
    cost_confirmation: CostConfirmation;
    quota_confirmation: QuotaConfirmation;
};
export declare const ExecutionEnvelopeSchema: Contract<ExecutionEnvelope>;
/**
 * What each execution class must carry, as immutable plain data.
 *
 * Declared here rather than spelled out inside a validator so that the rule a
 * reviewer reads and the rule the parse applies are the same list, and so a
 * test can iterate it: `tests/study-execution.test.mjs` removes each named path
 * from a valid capsule of that class and asserts the capsule is refused. A
 * requirement expressed only in code is a requirement whose test has to be
 * written again by hand for every class, and the class that gets forgotten is
 * the one nobody was thinking about.
 *
 * `execution_classes` is the second half of the same statement. The union's
 * discriminant says which kind of machine ran; `execution_class` on the capsule
 * is the vendor-neutral measurement class that comparison code refuses to rank
 * across (`src/contracts/common.ts`). Neither is inferred from the other,
 * because a record that stated it once could not be checked -- and a hardware
 * result filed as `SIMULATION` is exactly the mislabelling the comparison rule
 * exists to prevent.
 */
export interface ExecutionEvidenceRequirement {
    readonly resource_class: ExecutionResourceClass;
    /** Dotted paths into the capsule that must be present and not null. */
    readonly required_fields: readonly string[];
    /** Whether the captured environment must name the machine rather than be an empty shell. */
    readonly requires_captured_environment: boolean;
    /** The measurement classes this kind of run may be filed under. */
    readonly execution_classes: readonly ExecutionClass[];
    readonly why: string;
}
export declare const EXECUTION_EVIDENCE_REQUIREMENTS: readonly ExecutionEvidenceRequirement[];
/** The requirement for one execution class, or null where this build declares none. */
export declare function executionEvidenceRequirement(resourceClass: string): ExecutionEvidenceRequirement | null;
export interface ExecutionCapsule {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    authorization_ref: string;
    manifest_hash: string;
    versions: {
        schema: string;
        adapter: NamedVersion | null;
        engine: NamedVersion;
    };
    source_hash: string;
    seed: string | null;
    environment: StudyEnvironment;
    inputs: ArtifactRef[];
    outputs: ArtifactRef[];
    execution_class: ExecutionClass;
    execution: ExecutionEnvelope;
    logs_ref: string | null;
    cancellation: Cancellation;
    attestation_level: "hash_only";
    execution_receipt?: ExecutionReceipt;
    created_at?: string;
    reproducibility_hash: string;
}
export declare const ExecutionCapsuleSchema: Contract<ExecutionCapsule>;
/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ExecutionCapsuleInput {
    studyRef: string;
    authorizationRef: string;
    manifestHash: string;
    engine: NamedVersion;
    adapter?: NamedVersion | null;
    sourceHash: string;
    seed?: string | null;
    environment: StudyEnvironment;
    inputs?: ArtifactRef[];
    outputs?: ArtifactRef[];
    logsRef?: string | null;
    executionClass: ExecutionClass;
    execution: ExecutionEnvelope;
    cancellation?: Cancellation;
    /**
     * `RECEIPT_ONLY`: who ran it, which job, which attempt, and when. Outside
     * `semanticHash`, so two runs of the same inputs describe the same
     * computation; inside `recordHash`, which is the digest a capsule's
     * `reproducibility_hash` is. Required for a managed simulation.
     */
    executionReceipt?: ExecutionReceipt;
    /** Recorded on the capsule and outside its semantic digest. Omit for a byte-stable artifact. */
    createdAt?: string;
}
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
export declare function buildExecutionCapsule(input: ExecutionCapsuleInput): ExecutionCapsule;
export interface CapsuleVerification {
    valid: boolean;
    hash_matches: boolean;
    rules_id: string | null;
    expected_hash: string;
    actual_hash: string;
    problems: string[];
    refusals: StudyRefusal[];
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
export declare function verifyExecutionCapsule(candidate: unknown): CapsuleVerification;
//# sourceMappingURL=capsule.d.ts.map