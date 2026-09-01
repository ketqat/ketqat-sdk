import { z } from "zod"
import { ExecutionClassSchema, type ExecutionClass } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import {
  AttestationLevelSchema,
  ContentHashSchema,
  STUDY_SCHEMA_VERSION,
  StudyEnvironmentSchema,
  type StudyEnvironment,
} from "./common.js"
import { studySelfHash } from "./hash.js"
import {
  studyNotHashableRefusal,
  studyRulesIdRefusal,
  type StudyRefusal,
} from "./refusals.js"
import { STUDY_HASH_RULES_ID, STUDY_HASH_RULES_KEY } from "./rules.js"
import { ExactIntegerStringSchema, FiniteFloatSchema } from "./values.js"

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
  max_runtime: number | null
  max_memory_bytes: string | null
  max_credits: number | null
}

export const ResourceLimitsSchema: Contract<ResourceLimits> = z
  .object({
    /**
     * Seconds the run was allowed, as a `finite_float`. A limit, not a
     * measurement: it is a decision the caller made before the run, so it is
     * part of what the capsule says, unlike the durations that are artifacts of
     * running and are classified as receipt evidence.
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
  .strict()

/** Whether somebody stopped this run, and why they said they did. */
export interface Cancellation {
  cancelled: boolean
  reason: string | null
}

export const CancellationSchema: Contract<Cancellation> = z
  .object({
    cancelled: z.boolean(),
    reason: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((cancellation, context) => {
    if (cancellation.cancelled && cancellation.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A cancelled run must record why it was cancelled. A partial result whose truncation has no stated reason " +
          "reads like a completed one that simply found less.",
        path: ["reason"],
      })
    }
    if (!cancellation.cancelled && cancellation.reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A run that was not cancelled has no cancellation reason. A reason recorded beside `cancelled: false` is " +
          "a note nobody can act on and a reader will read as a caveat.",
        path: ["reason"],
      })
    }
  })

export interface ExecutionCapsule {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  task_ref: string
  manifest_hash: string
  versions: {
    schema: string
    adapter: { name: string; version: string } | null
    engine: { name: string; version: string }
  }
  source_hash: string
  image_digest: string | null
  dependency_lock_ref: string | null
  seed: string | null
  environment: StudyEnvironment
  resource_limits: ResourceLimits
  input_hashes: string[]
  output_hashes: string[]
  logs_ref: string | null
  execution_class: ExecutionClass
  cancellation: Cancellation
  attestation_level: "hash_only"
  started_at?: string
  finished_at?: string
  created_at?: string
  reproducibility_hash: string
}

const NamedVersionSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
  })
  .strict()

export const ExecutionCapsuleSchema: Contract<ExecutionCapsule> = z.object({
  schema_version: z.string().min(1),
  /** Required, never inferred. A capsule that does not name its rules is refused, not defaulted. */
  hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
  study_ref: ContentHashSchema,
  /** The task this run answers. A capsule with no task is a run nobody asked for. */
  task_ref: ContentHashSchema,
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
   * The OCI digest of the image that ran, in the form a registry accepts, so it
   * can be pulled by exactly this string. Null when the run was not containerised
   * -- an absence, not a placeholder digest nobody can resolve.
   */
  image_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable(),
  dependency_lock_ref: ContentHashSchema.nullable(),
  /**
   * The seed, as an `exact_integer_string`: `"0"` is a seed, `null` means the
   * run was not seeded, and `"18446744073709551615"` is an ordinary value.
   *
   * A string rather than a number, because a seed is an identifier for a
   * pseudo-random stream rather than a magnitude, and Stim and NumPy hand out
   * 64-bit ones. As a JSON number, a seed past 2^53 is the nearest double here
   * and the integer as written in Python -- so the same capsule takes two
   * digests, and nothing on this side can tell which of the many seeds sharing
   * that double actually ran. As digits it is one value with one spelling, and
   * `ExactIntegerStringSchema` refuses the others (`"+7"`, `"007"`, `"1e3"`,
   * `"-0"`) so that two spellings cannot become two digests.
   */
  seed: ExactIntegerStringSchema.nullable(),
  /**
   * Study-local, and array-shaped where the shared `EnvironmentSchema` is a map.
   * A map's keys are chosen by whatever captured the environment, and a
   * projection reads *declared* fields -- so a map would have to be read
   * wholesale, keys and all, or not at all. A list of `{name, value}` pairs is
   * neither: every key in it is a field name the schema declares.
   */
  environment: StudyEnvironmentSchema,
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
   * `RECEIPT_ONLY`: when the server observed this run, not what the run was.
   *
   * They are outside `semanticHash`, so two runs of the same inputs describe the
   * same intended computation whenever they started, and inside `recordHash` --
   * which is the digest this capsule's `reproducibility_hash` is, because the
   * question a reader asks of a stored capsule is whether the file was edited.
   */
  started_at: z.string().datetime({ offset: true }).optional(),
  finished_at: z.string().datetime({ offset: true }).optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  /**
   * The capsule's own digest: `recordHash` under `study-v1`, over every declared
   * field except the three `DERIVED` ones. A record's own hash cannot be an
   * input to itself, and `schema_version` and `hash_rules_id` are already
   * committed to by the preimage header rather than restated in the body.
   */
  reproducibility_hash: ContentHashSchema,
}).strict()

/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ExecutionCapsuleInput {
  studyRef: string
  taskRef: string
  manifestHash: string
  engine: { name: string; version: string }
  adapter?: { name: string; version: string } | null
  sourceHash: string
  imageDigest?: string | null
  dependencyLockRef?: string | null
  seed?: string | null
  environment: StudyEnvironment
  resourceLimits?: ResourceLimits
  inputHashes?: string[]
  outputHashes?: string[]
  logsRef?: string | null
  executionClass: ExecutionClass
  cancellation?: Cancellation
  /**
   * `RECEIPT_ONLY`: when the server observed this run, not what the run was.
   * Outside `semanticHash`, so two runs of the same inputs describe the same
   * computation; inside `recordHash`, which is the digest a capsule's
   * `reproducibility_hash` is. Omit all three for a byte-stable artifact.
   */
  startedAt?: string
  finishedAt?: string
  createdAt?: string
}

const NO_LIMITS: ResourceLimits = { max_runtime: null, max_memory_bytes: null, max_credits: null }
const NOT_CANCELLED: Cancellation = { cancelled: false, reason: null }

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
export function buildExecutionCapsule(input: ExecutionCapsuleInput): ExecutionCapsule {
  const environment = StudyEnvironmentSchema.parse(input.environment)
  const resourceLimits = ResourceLimitsSchema.parse(input.resourceLimits ?? NO_LIMITS)
  const cancellation = CancellationSchema.parse(input.cancellation ?? NOT_CANCELLED)

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
    attestation_level: "hash_only" as const,
    ...(input.startedAt ? { started_at: input.startedAt } : {}),
    ...(input.finishedAt ? { finished_at: input.finishedAt } : {}),
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  }

  const hash = studySelfHash("execution_capsule", withoutHash)

  return ExecutionCapsuleSchema.parse({ ...withoutHash, reproducibility_hash: hash })
}

export interface CapsuleVerification {
  valid: boolean
  hash_matches: boolean
  rules_id: string | null
  expected_hash: string
  actual_hash: string
  problems: string[]
  refusals: StudyRefusal[]
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
export function verifyExecutionCapsule(candidate: unknown): CapsuleVerification {
  const empty = { hash_matches: false, rules_id: null, expected_hash: "", actual_hash: "" }

  if (typeof candidate !== "object" || candidate === null) {
    return {
      valid: false,
      ...empty,
      problems: ["(root): an execution capsule must be an object."],
      refusals: [],
    }
  }

  const rulesRefusal = studyRulesIdRefusal("execution_capsule", candidate)
  if (rulesRefusal !== null) {
    return {
      valid: false,
      ...empty,
      problems: [`${STUDY_HASH_RULES_KEY}: ${rulesRefusal.message}`],
      refusals: [rulesRefusal],
    }
  }
  const rulesId = (candidate as Record<string, unknown>)[STUDY_HASH_RULES_KEY] as string

  // "This cannot be hashed" is answered before "this is not a capsule", and the
  // order is the same one the rules id gets, for the same reason: a record the
  // projection refuses -- an undeclared key, a field of the wrong shape, a
  // non-finite number -- is a hashing-layer finding, and reporting a schema
  // problem in its place sends a reader looking for the wrong bug.
  //
  // The digest is computed here, once, and reused below. Computing it is what
  // asks the question, so there is nothing to check separately first: under a
  // projection there is no walk that inspects the record and then a second walk
  // that hashes it.
  let expected: string
  try {
    expected = studySelfHash("execution_capsule", candidate)
  } catch (error) {
    const refusal = studyNotHashableRefusal("execution_capsule", error)
    return {
      valid: false,
      ...empty,
      rules_id: rulesId,
      problems: [refusal.message],
      refusals: [refusal],
    }
  }

  const parsed = ExecutionCapsuleSchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      valid: false,
      ...empty,
      rules_id: rulesId,
      problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
      refusals: [],
    }
  }

  // The digest is taken over the capsule *as written*, never over `parsed.data`.
  // Nothing this schema declares carries a `.default()` and every object in it
  // is strict, so a candidate that parses is the record the file contains --
  // which is the property that makes the two languages agree, not a reason to
  // stop reading the file. Hashing a parsed value would make this verifier
  // answer about whatever a future default filled in, while Python hashes the
  // dict it read and fills in nothing. Validation stays a separate,
  // still-reported step above; what it must not do is change what gets hashed.
  const capsule = candidate as ExecutionCapsule
  const hashMatches = expected === capsule.reproducibility_hash
  const problems = hashMatches
    ? []
    : [
        `Reproducibility hash mismatch: the capsule claims ${capsule.reproducibility_hash} and its own contents ` +
          `canonicalize to ${expected} under ${rulesId}.`,
      ]

  return {
    valid: hashMatches,
    hash_matches: hashMatches,
    rules_id: rulesId,
    expected_hash: expected,
    actual_hash: capsule.reproducibility_hash,
    problems,
    refusals: [],
  }
}
