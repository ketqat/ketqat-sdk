import { type ExecutionClass } from "../contracts/common.js";
import type { Contract } from "../intelligence/measurement.js";
import { type StudyEnvironment } from "./common.js";
import { type StudyRefusal } from "./refusals.js";
/**
 * One execution, recorded so it can be argued with (ketqat-sdk#259, ADR 0014).
 *
 * A capsule is written per run and says what ran: which source, which image,
 * which adapter and engine at which versions, which seed, what went in, what
 * came out, what the run was allowed to spend, and whether somebody cancelled
 * it. It is the record a second party needs to attempt the same run, and the
 * record a reader needs to know why their attempt came out differently.
 *
 * What it is not is proof. `attestation_level` is a closed enum with one member,
 * `hash_only`, and that member is hashed along with everything else -- so a
 * capsule states the strength of its own evidence in a field that cannot be
 * edited afterwards without breaking its hash. Nothing in this repository signs
 * anything, nothing attests that the image digest recorded here is the image
 * that ran, and a level named `signed` would be a promise the code does not
 * keep. When signing exists, it arrives as a new member and every capsule
 * written before it keeps saying exactly what it always said.
 *
 * Contents are referenced, never inlined: the manifest, the source tree, the
 * dependency lock, the logs and every input and output are named by hash. A
 * capsule stays small enough to store per run, and a referenced blob that
 * changed after the fact stops resolving instead of quietly disagreeing with the
 * record that names it.
 */
/**
 * Where the safe-integer bound went, and what replaced it.
 *
 * `seed` and `resource_limits.max_memory_bytes` used to carry
 * `.max(Number.MAX_SAFE_INTEGER)` each, then briefly nothing at all while a
 * blanket rule in the hashing layer refused every integer past 2^53 in every
 * field. Both readings were wrong in the same direction: they treated a 64-bit
 * seed as a mistake. It is not. It is what Stim and NumPy hand out, and a byte
 * count is exactly the quantity that outgrows a double.
 *
 * The fix is a contract per field rather than a bound per number (`values.ts`,
 * goal §11). A seed and a byte count are `exact_integer_string`: recorded as
 * digits, so the two languages hash what was written rather than two roundings
 * of it, and validated so that one value has one spelling. A runtime ceiling
 * and a credit ceiling are `finite_float`, because they are magnitudes rather
 * than identifiers and 2^53 is not a bound either of them can reach.
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
export interface ExecutionCapsule {
    schema_version: string;
    hash_rules_id: "study-v1";
    study_ref: string;
    task_ref: string;
    manifest_hash: string;
    versions: {
        schema: string;
        adapter: {
            name: string;
            version: string;
        } | null;
        engine: {
            name: string;
            version: string;
        };
    };
    source_hash: string;
    image_digest: string | null;
    dependency_lock_ref: string | null;
    seed: string | null;
    environment: StudyEnvironment;
    resource_limits: ResourceLimits;
    input_hashes: string[];
    output_hashes: string[];
    logs_ref: string | null;
    execution_class: ExecutionClass;
    cancellation: Cancellation;
    attestation_level: "hash_only";
    started_at?: string;
    finished_at?: string;
    created_at?: string;
    reproducibility_hash: string;
}
export declare const ExecutionCapsuleSchema: Contract<ExecutionCapsule>;
/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ExecutionCapsuleInput {
    studyRef: string;
    taskRef: string;
    manifestHash: string;
    engine: {
        name: string;
        version: string;
    };
    adapter?: {
        name: string;
        version: string;
    } | null;
    sourceHash: string;
    imageDigest?: string | null;
    dependencyLockRef?: string | null;
    seed?: string | null;
    environment: StudyEnvironment;
    resourceLimits?: ResourceLimits;
    inputHashes?: string[];
    outputHashes?: string[];
    logsRef?: string | null;
    executionClass: ExecutionClass;
    cancellation?: Cancellation;
    /**
     * `RECEIPT_ONLY`: when the server observed this run, not what the run was.
     * Outside `semanticHash`, so two runs of the same inputs describe the same
     * computation; inside `recordHash`, which is the digest a capsule's
     * `reproducibility_hash` is. Omit all three for a byte-stable artifact.
     */
    startedAt?: string;
    finishedAt?: string;
    createdAt?: string;
}
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
 * reads the same bytes and fills in nothing. No schema in this family carries a
 * `.default()` any more, which is what makes the two readings the same one; the
 * order here is what keeps them the same if one ever does.
 *
 * Unlike `verifyBundle` there is nothing here to recompute from inputs. A
 * capsule records what happened rather than deriving anything, so a matching
 * hash means the record is unedited and nothing more. It does not mean the run
 * happened, that the image named is the image that ran, or that the outputs came
 * out of it; `attestation_level` says so in the record itself.
 *
 * "Unedited" is the record digest's question, and the record digest is what a
 * capsule's `reproducibility_hash` is (`registry.ts`). The other question a
 * reader has about a capsule -- *did this describe the same computation as that
 * one* -- is `semanticHash("execution_capsule", capsule)`, which ignores when
 * the run started, whether it was cancelled and where its logs went. Neither
 * digest answers both, which is why there are four of them.
 */
export declare function verifyExecutionCapsule(candidate: unknown): CapsuleVerification;
//# sourceMappingURL=capsule.d.ts.map