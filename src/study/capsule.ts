import { z } from "zod"
import { ExecutionClassSchema, IsoDateTimeSchema, type ExecutionClass } from "../contracts/common.js"
import type { Contract } from "../intelligence/measurement.js"
import { artifactRefListSchema, ArtifactRefSchema, type ArtifactRef } from "./artifact.js"
import {
  AttestationLevelSchema,
  ContentHashSchema,
  STUDY_SCHEMA_VERSION,
  StudyEnvironmentSchema,
  type ExecutionResourceClass,
  type StudyEnvironment,
} from "./common.js"
import { studySelfHash } from "./hash.js"
import { StudyIdSchema } from "./identity.js"
import { studyNotHashableRefusal, studyRulesIdRefusal, type StudyRefusal } from "./refusals.js"
import { STUDY_HASH_RULES_ID, STUDY_HASH_RULES_KEY } from "./rules.js"
import { ExactIntegerStringSchema, FiniteFloatSchema } from "./values.js"

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
  max_runtime: number | null
  max_memory_bytes: string | null
  max_credits: number | null
}

export const ResourceLimitsSchema: Contract<ResourceLimits> = z
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

const NamedVersionSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
  })
  .strict()

export interface NamedVersion {
  name: string
  version: string
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
  credits_charged: number
  authorized_maximum: number
  source: "PROVIDER_REPORTED" | "ADAPTER_COMPUTED"
}

export const CostConfirmationSchema: Contract<CostConfirmation> = z
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
        message:
          `The run was charged ${cost.credits_charged} credits against an authorised maximum of ` +
          `${cost.authorized_maximum}. A capsule recording a charge above its own ceiling is a record of a limit ` +
          "that did not hold, which is a finding rather than a field.",
        path: ["credits_charged"],
      })
    }
  })

/**
 * That the run was inside the account's quota when it was submitted.
 *
 * `within_quota: false` is recordable, deliberately: a submission refused for
 * quota is a thing that happened, and a schema that could only express success
 * would push the failure into a free-text log. What it must not do is go
 * unexplained, so the two are paired the way a cancellation and its reason are.
 */
export interface QuotaConfirmation {
  quota: string
  within_quota: boolean
  source: "PROVIDER_REPORTED" | "ADAPTER_COMPUTED"
  exceeded_reason: string | null
}

export const QuotaConfirmationSchema: Contract<QuotaConfirmation> = z
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
        message:
          "A submission outside quota must record what was exceeded. Without it a reader sees a run that happened " +
          "anyway and cannot tell whether the result is partial.",
        path: ["exceeded_reason"],
      })
    }
    if (quota.within_quota && quota.exceeded_reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A run inside quota exceeded nothing, so there is nothing for this reason to describe.",
        path: ["exceeded_reason"],
      })
    }
  })

/**
 * Which device, on which provider, in which calibration.
 *
 * The calibration is referenced rather than copied: a snapshot is a record with
 * its own identity and its own capture time, and inlining it here would put a
 * timestamp inside the semantic projection of every hardware capsule. What the
 * capsule needs is which snapshot, which is a hash.
 */
export interface BackendSnapshot {
  provider: string
  backend: string
  snapshot_hash: string
}

export const BackendSnapshotSchema: Contract<BackendSnapshot> = z
  .object({
    provider: z.string().min(1).max(128),
    backend: z.string().min(1).max(128),
    snapshot_hash: ContentHashSchema,
  })
  .strict()

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
  job_id: string
  attempt: number
  actor: string
  started_at: string
  finished_at: string
}

export const ExecutionReceiptSchema: Contract<ExecutionReceipt> = z
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
        message:
          `A run that started at ${receipt.started_at} did not finish at ${receipt.finished_at}. A negative ` +
          "duration is a clock problem, and recording it would put an impossible figure into an audit trail.",
        path: ["finished_at"],
      })
    }
  })

/** An OCI image digest in the form a registry accepts, so it can be pulled by exactly this string. */
const ImageDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/, {
  message:
    "An image digest is `sha256:` and 64 lowercase hex digits -- the form a registry accepts. A tag is not a " +
    "digest: a tag moves, and a capsule pinned to one names an image that may no longer exist in that form.",
})

export type ExecutionEnvelope =
  | {
      kind: "MANAGED_SIMULATION"
      image_digest: string
      dependency_lock_ref: string
      runner_version: NamedVersion
      resource_limits: ResourceLimits
    }
  | {
      kind: "LOCAL_SIMULATION"
      image_digest: string | null
      attestation_limitation: string
    }
  | {
      kind: "HARDWARE"
      provider_adapter: NamedVersion
      backend_snapshot: BackendSnapshot
      confirmation_receipt_ref: string
      provider_result_ref: string
      cost_confirmation: CostConfirmation
      quota_confirmation: QuotaConfirmation
    }

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
  .strict()

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
  .strict()

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
  .strict()

export const ExecutionEnvelopeSchema: Contract<ExecutionEnvelope> = z.discriminatedUnion("kind", [
  ManagedSimulationSchema,
  LocalSimulationSchema,
  HardwareSchema,
]) as unknown as Contract<ExecutionEnvelope>

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
  readonly resource_class: ExecutionResourceClass
  /** Dotted paths into the capsule that must be present and not null. */
  readonly required_fields: readonly string[]
  /** Whether the captured environment must name the machine rather than be an empty shell. */
  readonly requires_captured_environment: boolean
  /** The measurement classes this kind of run may be filed under. */
  readonly execution_classes: readonly ExecutionClass[]
  readonly why: string
}

export const EXECUTION_EVIDENCE_REQUIREMENTS: readonly ExecutionEvidenceRequirement[] =
  Object.freeze([
    Object.freeze({
      resource_class: "MANAGED_SIMULATION" as const,
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
      execution_classes: Object.freeze(["SIMULATION" as const, "DEMO" as const]),
      why:
        "Every one of these is a fact this system controlled and recorded: it chose the image, resolved the lock, " +
        "ran the runner and enforced the limits. A managed capsule missing one is a gap in our own records rather " +
        "than a limitation of the run, and a second party can reproduce it exactly.",
    }),
    Object.freeze({
      resource_class: "LOCAL_SIMULATION" as const,
      required_fields: Object.freeze(["execution.attestation_limitation"]),
      requires_captured_environment: true,
      execution_classes: Object.freeze(["SIMULATION" as const, "DEMO" as const]),
      why:
        "With no image to pull, the captured environment is the whole of what a second party has, so an empty one " +
        "would make the capsule a claim rather than a record. The stated limitation is what stops a local run " +
        "from being read with the confidence a managed one has earned.",
    }),
    Object.freeze({
      resource_class: "HARDWARE" as const,
      required_fields: Object.freeze([
        "execution.provider_adapter",
        "execution.backend_snapshot",
        "execution.confirmation_receipt_ref",
        "execution.provider_result_ref",
        "execution.cost_confirmation",
        "execution.quota_confirmation",
      ]),
      requires_captured_environment: false,
      execution_classes: Object.freeze(["HARDWARE" as const]),
      why:
        "A hardware run spends money on a device this repository does not control and cannot re-run. What a reader " +
        "has instead is the adapter that spoke to it, the calibration it ran under, the approval it was submitted " +
        "on, the provider's own result, and what it actually cost against what was allowed.",
    }),
  ])

/** The working lookup, module-private and built from the frozen tuple. */
const evidenceByClass = new Map<string, ExecutionEvidenceRequirement>(
  EXECUTION_EVIDENCE_REQUIREMENTS.map((entry) => [entry.resource_class, entry]),
)

/** The requirement for one execution class, or null where this build declares none. */
export function executionEvidenceRequirement(
  resourceClass: string,
): ExecutionEvidenceRequirement | null {
  return evidenceByClass.get(resourceClass) ?? null
}

/**
 * Read a dotted path off a record, own properties only.
 *
 * `hasOwnProperty` rather than `value[key]`, for the reason the projection
 * gives: a polluted `Object.prototype` would otherwise supply a value for a
 * field the capsule does not have, and every capsule in the process would
 * satisfy the same requirement it does not meet.
 */
function ownPath(record: unknown, path: string): unknown {
  let current: unknown = record
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

export interface ExecutionCapsule {
  schema_version: string
  hash_rules_id: "study-v1"
  study_ref: string
  authorization_ref: string
  manifest_hash: string
  versions: {
    schema: string
    adapter: NamedVersion | null
    engine: NamedVersion
  }
  source_hash: string
  seed: string | null
  environment: StudyEnvironment
  inputs: ArtifactRef[]
  outputs: ArtifactRef[]
  execution_class: ExecutionClass
  execution: ExecutionEnvelope
  logs_ref: string | null
  cancellation: Cancellation
  attestation_level: "hash_only"
  execution_receipt?: ExecutionReceipt
  created_at?: string
  reproducibility_hash: string
}

export const ExecutionCapsuleSchema: Contract<ExecutionCapsule> = z
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
    inputs: artifactRefListSchema("input") as unknown as z.ZodType<ArtifactRef[]>,
    outputs: artifactRefListSchema("output") as unknown as z.ZodType<ArtifactRef[]>,
    /** Simulated never reads as hardware: the distinction is carried, not captioned. */
    execution_class: ExecutionClassSchema,
    /** What ran, and the evidence its class can actually produce. */
    execution: ExecutionEnvelopeSchema as unknown as z.ZodType<ExecutionEnvelope>,
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
    const requirement = executionEvidenceRequirement(capsule.execution.kind)
    if (requirement === null) {
      // Unreachable while the union and the table are built from one list, and a
      // refusal rather than an assumption because a table row silently missing
      // is how a whole class of run stops being checked.
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `No evidence requirement is declared for execution class ${capsule.execution.kind}, so nothing can say ` +
          "what a capsule of that class has to carry.",
        path: ["execution", "kind"],
      })
      return
    }

    for (const path of requirement.required_fields) {
      if (ownPath(capsule, path) != null) continue
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A ${requirement.resource_class} capsule must carry ${path}. ${requirement.why}`,
        path: path.split("."),
      })
    }

    if (requirement.requires_captured_environment) {
      const environment = capsule.environment
      const missing = [
        environment.operating_system === undefined ? "operating_system" : null,
        environment.architecture === undefined ? "architecture" : null,
        environment.packages.length === 0 ? "packages" : null,
      ].filter((name): name is string => name !== null)
      if (missing.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A ${requirement.resource_class} capsule must capture the machine it ran on, and ` +
            `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing. ${requirement.why}`,
          path: ["environment"],
        })
      }
    }

    if (!requirement.execution_classes.includes(capsule.execution_class)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A ${requirement.resource_class} run is filed as ${requirement.execution_classes.join(" or ")}, and ` +
          `this capsule says ${capsule.execution_class}. The two fields answer different questions -- which ` +
          "machine ran, and what kind of measurement this is -- and comparison code refuses to rank across the " +
          "second, so a mislabelled capsule is a result that gets ranked against the wrong things.",
        path: ["execution_class"],
      })
    }

    if (
      capsule.execution.kind === "HARDWARE" &&
      capsule.execution.cost_confirmation.credits_charged > 0 &&
      capsule.execution.quota_confirmation.within_quota === false
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "This capsule records a charge for a submission it also records as outside quota. One of the two is " +
          "wrong, and a reader cannot tell which, so the run cannot be filed as either.",
        path: ["execution", "quota_confirmation", "within_quota"],
      })
    }
  }) as unknown as Contract<ExecutionCapsule>

/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ExecutionCapsuleInput {
  studyRef: string
  authorizationRef: string
  manifestHash: string
  engine: NamedVersion
  adapter?: NamedVersion | null
  sourceHash: string
  seed?: string | null
  environment: StudyEnvironment
  inputs?: ArtifactRef[]
  outputs?: ArtifactRef[]
  logsRef?: string | null
  executionClass: ExecutionClass
  execution: ExecutionEnvelope
  cancellation?: Cancellation
  /**
   * `RECEIPT_ONLY`: who ran it, which job, which attempt, and when. Outside
   * `semanticHash`, so two runs of the same inputs describe the same
   * computation; inside `recordHash`, which is the digest a capsule's
   * `reproducibility_hash` is. Required for a managed simulation.
   */
  executionReceipt?: ExecutionReceipt
  /** Recorded on the capsule and outside its semantic digest. Omit for a byte-stable artifact. */
  createdAt?: string
}

const NOT_CANCELLED: Cancellation = { cancelled: false, reason: null }

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
export function buildExecutionCapsule(input: ExecutionCapsuleInput): ExecutionCapsule {
  const environment = StudyEnvironmentSchema.parse(input.environment)
  const cancellation = CancellationSchema.parse(input.cancellation ?? NOT_CANCELLED)
  const execution = ExecutionEnvelopeSchema.parse(input.execution)

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
    attestation_level: "hash_only" as const,
    ...(input.executionReceipt ? { execution_receipt: input.executionReceipt } : {}),
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
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
      refusals: [],
    }
  }

  // The digest is taken over the capsule *as written*, never over `parsed.data`.
  // Nothing this schema declares carries a `.default()` and every object in it
  // is strict, so a candidate that parses is the record the file contains --
  // which is the property that makes the two languages agree, not a reason to
  // stop reading the file.
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
