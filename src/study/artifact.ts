import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { ContentHashSchema } from "./common.js"
import { ExactIntegerStringSchema } from "./values.js"

/**
 * What went into a run and what came out, named rather than listed (goal §15).
 *
 * A capsule used to carry `input_hashes` and `output_hashes`: two arrays of
 * 64-hex strings. A digest is not a description. A reader holding one of those
 * strings could not tell a circuit from a decoder log, could not tell whether
 * the file was the whole output or the first megabyte of it before a timeout,
 * could not tell whether a field had been removed from it before it was
 * written, and could not find the bytes at all. Every one of those is a
 * question somebody asks of a result they are about to quote, and a bare hash
 * answers none of them.
 *
 * So an artifact is referenced by a record with seven statements in it, each of
 * which a reader would otherwise have to guess:
 *
 * | field | answers |
 * | --- | --- |
 * | `name` | what the producer called this file |
 * | `role` | what part it played in the run |
 * | `media_type` | how to read the bytes |
 * | `byte_size` | how much there is |
 * | `content_hash` | which bytes exactly |
 * | `resolution` | where a second party can get them, or that they cannot |
 * | `completeness` | whether this is all of it |
 * | `redaction` | whether anything was removed before it was written |
 *
 * All eight are `SEMANTIC`. That is deliberate and it is the point of the type:
 * a run that produced 40 MB of measurements and a run that produced the first
 * 4 MB of them before a wall-clock limit are not the same run, and under the
 * retired shape they differed only in a hash whose bytes nobody could fetch.
 */

/**
 * What part an artifact played, as a closed list.
 *
 * Closed because the vocabulary is this family's own, unlike a queue's status
 * strings: a role nobody here declared is a role no reader of a capsule can
 * interpret, and an open string would let a producer file a decoder log as
 * `"results"` and have it read as a result. A new role arrives as a new member
 * and every capsule written before it keeps meaning what it meant.
 */
export const ArtifactRoleSchema = z.enum([
  /** The circuit, program or model the run executed. */
  "CIRCUIT",
  /** Parameters the run was given: angles, shot counts, decoder settings. */
  "PARAMETERS",
  /** Input data the run consumed. */
  "DATASET",
  /** The noise or error model the run assumed. */
  "NOISE_MODEL",
  /** The validated manifest the run was launched from. */
  "MANIFEST",
  /** Raw per-shot or per-round measurements. */
  "MEASUREMENTS",
  /** The result record the run produced. */
  "RESULT",
  /** Derived figures: rates, thresholds, fitted parameters. */
  "METRICS",
  /** Runner or adapter output kept for diagnosis rather than for evidence. */
  "LOG",
])
export type ArtifactRole = z.infer<typeof ArtifactRoleSchema>

/**
 * Where the bytes are, and whether a third party can reach them.
 *
 * `NOT_RETAINED` is a member rather than an omission, and it is the honest
 * answer for a run whose provider does not keep raw shot data: a reference with
 * no locator and no member saying why would read as an oversight, and a reader
 * would go looking for a file that was never kept. `PROVIDER_HELD` is the other
 * uncomfortable one -- the bytes exist and this reader cannot get them -- and
 * naming it is what stops a hardware capsule from implying a reproduction that
 * only the account holder can perform.
 */
export const ArtifactResolutionKindSchema = z.enum([
  /** Carried inside the reproducibility bundle this capsule belongs to. */
  "INLINE_IN_BUNDLE",
  /** In a content-addressed store, fetchable by the locator. */
  "CONTENT_ADDRESSED_STORE",
  /** Held by the execution provider, reachable only by the account that ran it. */
  "PROVIDER_HELD",
  /** Produced and not kept. The hash records what it was; the bytes are gone. */
  "NOT_RETAINED",
])
export type ArtifactResolutionKind = z.infer<typeof ArtifactResolutionKindSchema>

export interface ArtifactResolution {
  kind: ArtifactResolutionKind
  locator: string | null
}

export const ArtifactResolutionSchema: Contract<ArtifactResolution> = z
  .object({
    kind: ArtifactResolutionKindSchema,
    /**
     * How to ask for the bytes: a store key, a bundle path, a provider job id.
     * Never a credential and never a signed URL -- both expire, and a capsule is
     * read years after it is written.
     */
    locator: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((resolution, context) => {
    if (resolution.kind === "NOT_RETAINED" && resolution.locator !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Bytes that were not retained have nowhere to be fetched from. A locator beside NOT_RETAINED sends a " +
          "reader after a file the capsule has just said does not exist.",
        path: ["locator"],
      })
    }
    if (resolution.kind !== "NOT_RETAINED" && resolution.locator === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `An artifact resolved as ${resolution.kind} must say where. A resolution kind with no locator claims ` +
          "the bytes are reachable and gives nobody a way to reach them, which is worse than saying they are gone.",
        path: ["locator"],
      })
    }
  })

/** Whether this is all of the artifact, or the part that exists. */
export const ArtifactCompletenessSchema = z.enum(["COMPLETE", "PARTIAL"])
export type ArtifactCompleteness = z.infer<typeof ArtifactCompletenessSchema>

/** Whether anything was removed from the artifact before it was written. */
export const ArtifactRedactionSchema = z.enum(["NONE", "REDACTED"])
export type ArtifactRedaction = z.infer<typeof ArtifactRedactionSchema>

/**
 * `type/subtype`, lowercase, with no parameters.
 *
 * One spelling per value, for the reason `values.ts` gives about numbers.
 * `Text/CSV`, `text/csv` and `text/csv; charset=utf-8` are one media type to a
 * reader and three records to a digest, so the two that are not canonical are
 * refused where they are written rather than folded where they are read --
 * folding would mean the bytes on disk and the bytes hashed were two different
 * things. Written as one expression `zod-to-json-schema` can emit as a
 * `pattern`, so the Python validator applies the same rule.
 */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/

export interface ArtifactRef {
  name: string
  role: ArtifactRole
  media_type: string
  byte_size: string
  content_hash: string
  resolution: ArtifactResolution
  completeness: ArtifactCompleteness
  partial_reason: string | null
  redaction: ArtifactRedaction
  redaction_reason: string | null
}

export const ArtifactRefSchema: Contract<ArtifactRef> = z
  .object({
    /** What the producer called the file. A label for a reader, and hashed like everything else. */
    name: z.string().min(1).max(256),
    role: ArtifactRoleSchema,
    media_type: z.string().regex(MEDIA_TYPE, {
      message:
        "A media type is lowercase `type/subtype` with no parameters. Two spellings of one type are two digests " +
        "for one capsule.",
    }),
    /**
     * The size in bytes, as an `exact_integer_string`.
     *
     * The field the number contracts are named after: a 16 GiB measurement dump
     * is past 2^53, where a JSON number is a double here and an
     * arbitrary-precision integer in Python, so the same capsule would take two
     * digests depending on which language read it. Digits are the one
     * representation both languages hash identically at any magnitude.
     */
    byte_size: ExactIntegerStringSchema,
    /**
     * The digest of the bytes as written, redaction included.
     *
     * Over the artifact a reader can actually fetch, not over the unredacted
     * original: a hash of bytes nobody is allowed to see cannot be checked by
     * anybody, and would make `REDACTED` a claim rather than a statement.
     */
    content_hash: ContentHashSchema,
    resolution: ArtifactResolutionSchema,
    completeness: ArtifactCompletenessSchema,
    /** Why this is only part of the artifact. Paired with `completeness` in both directions. */
    partial_reason: z.string().min(1).nullable(),
    redaction: ArtifactRedactionSchema,
    /** What was removed and under which policy. Paired with `redaction` in both directions. */
    redaction_reason: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((artifact, context) => {
    // The same pairing `Cancellation` uses, for the same reason: a truncated
    // output whose truncation has no stated cause reads like a complete one that
    // simply found less, and a reason recorded beside `COMPLETE` is a caveat a
    // reader will apply to a file nothing happened to.
    if (artifact.completeness === "PARTIAL" && artifact.partial_reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A partial artifact must record why it is partial. A truncated result with no stated reason reads like " +
          "a complete one that found less.",
        path: ["partial_reason"],
      })
    }
    if (artifact.completeness === "COMPLETE" && artifact.partial_reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A complete artifact was not truncated, so there is nothing for a truncation reason to describe.",
        path: ["partial_reason"],
      })
    }
    if (artifact.redaction === "REDACTED" && artifact.redaction_reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A redacted artifact must say what was removed and under which policy. A reader comparing two runs has " +
          "to know whether a difference is a result or a removal.",
        path: ["redaction_reason"],
      })
    }
    if (artifact.redaction === "NONE" && artifact.redaction_reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nothing was removed, so there is nothing for a redaction reason to describe.",
        path: ["redaction_reason"],
      })
    }
  }) as unknown as Contract<ArtifactRef>

/**
 * Whether a list of artifact references names each file once.
 *
 * Two entries with one name are two readings of one slot, exactly as two JSON
 * keys with one name are two readings of one file: a consumer that indexes by
 * name gets whichever it saw last, and the capsule does not say which. Checked
 * where the list is declared rather than left to a consumer, because a
 * consumer's answer is the one that would differ between the two languages.
 */
export function duplicateArtifactNames(artifacts: readonly ArtifactRef[]): readonly string[] {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const artifact of artifacts) {
    if (seen.has(artifact.name)) duplicated.add(artifact.name)
    seen.add(artifact.name)
  }
  return Object.freeze([...duplicated].sort())
}

/**
 * An artifact list, refusing a repeated name.
 *
 * Used for both the inputs and the outputs of a capsule and for the inputs an
 * authorization names, so the rule is stated once.
 */
export function artifactRefListSchema(subject: string): z.ZodTypeAny {
  return z.array(ArtifactRefSchema).superRefine((artifacts, context) => {
    const duplicated = duplicateArtifactNames(artifacts as readonly ArtifactRef[])
    if (duplicated.length === 0) return
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        `Two ${subject} entries share the name ${duplicated.map((name) => JSON.stringify(name)).join(", ")}. ` +
        "One name is one slot: a consumer indexing by name gets whichever it read last, and the record does not " +
        "say which was meant.",
    })
  })
}

/**
 * A file this package generated from its own structured content.
 *
 * Lighter than `ArtifactRef` because it answers fewer questions, and the ones it
 * leaves out are ones a generated file cannot raise. There is no role, because
 * the structure that produced it says what it is. There is no resolution,
 * because the bytes are regenerable from the package by anyone holding it --
 * that is what "generated" means here, and it is why the digest is worth
 * carrying: a recipient re-renders the rows, re-hashes the bytes, and compares.
 * There is no completeness or redaction, because a rendering of a complete
 * structure is complete and a rendering of a redacted one is redacted already.
 *
 * `content_hash` is an `artifactHash` over the literal bytes -- no parse, no
 * canonicalization -- so it is the answer to "are these the bytes that were
 * produced" and to nothing else. A CSV that opens in a spreadsheet showing
 * different numbers from the table it came from is exactly what this catches,
 * and it is a real failure rather than a hypothetical one: the CSV is the file
 * people forward.
 */
export interface GeneratedArtifact {
  media_type: string
  byte_size: string
  content_hash: string
}

export const GeneratedArtifactSchema: Contract<GeneratedArtifact> = z
  .object({
    media_type: z.string().regex(MEDIA_TYPE, {
      message:
        "A media type is lowercase `type/subtype` with no parameters. Two spellings of one type are two digests " +
        "for one file.",
    }),
    /** An `exact_integer_string`, for the reason every byte count in this family is one. */
    byte_size: ExactIntegerStringSchema,
    content_hash: ContentHashSchema,
  })
  .strict()
