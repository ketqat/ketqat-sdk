import { createHash } from "node:crypto"
import type { BenchmarkResult, ExperimentManifest } from "../contracts/index.js"

type HashableInput = ExperimentManifest | BenchmarkResult | Record<string, unknown>

/**
 * Fields that identify or annotate a record rather than describe the science.
 *
 * Present since version 1 and unchanged, because changing them would change
 * every hash ever published.
 */
const identityKeys = [
  "id",
  "slug",
  "started_at",
  "finished_at",
  "created_at",
  "updated_at",
  "submitted_at",
  "ui_metadata",
  "reproducibility_hash",
  "owner_username",
  "visibility",
] as const

/**
 * Duration measurements, excluded from version 2 onward.
 *
 * These are why ketqat-sdk#89 existed: the same experiment, run twice from the
 * same seed, produced different hashes. Not because the science differed --
 * every logical error rate, shot count, and decoder verdict was identical --
 * but because the run took a different number of milliseconds.
 *
 * A hash that changes when nothing scientific changed is not a reproducibility
 * hash. It made REPRODUCED evidence unobtainable except by copying a hash you
 * had not computed, and import deduplication impossible.
 *
 * Enumerated rather than pattern-matched. A rule like "anything ending in
 * _seconds" would silently swallow a future field that genuinely belongs in the
 * hash -- a duration that is the *result* of an experiment rather than an
 * artifact of running it -- and that failure would be invisible.
 *
 * Every one of these was found by running the same experiment twice and
 * diffing the payloads, not by reading the schema.
 */
const timingKeys = [
  "runtime_seconds",
  "decoder_latency_ms",
  "decoder_latency_ms_per_shot",
  "sampling_runtime_seconds",
  "circuit_generation_seconds",
  "decode_runtime_seconds",
  "decoder_construction_seconds",
] as const

/**
 * The version this build computes when asked for a new hash.
 *
 * Versioning is what makes fixing #89 safe rather than breaking. A stored
 * record keeps the rules it was hashed under, so every hash already published
 * still verifies; only newly computed hashes use the corrected rules. Nothing
 * is rewritten and no existing evidence is invalidated.
 */
export const CURRENT_HASH_VERSION = 2

/** Where a record records which rules produced its hash. Never itself hashed. */
export const HASH_VERSION_KEY = "reproducibility_hash_version"

const excludedByVersion: Record<number, Set<string>> = {
  1: new Set<string>([...identityKeys, HASH_VERSION_KEY]),
  2: new Set<string>([...identityKeys, HASH_VERSION_KEY, ...timingKeys]),
}

function excludedFor(version: number): Set<string> {
  const excluded = excludedByVersion[version]
  if (!excluded) {
    throw new Error(
      `Unknown reproducibility hash version ${version}. Known versions: ${Object.keys(excludedByVersion).join(", ")}.`,
    )
  }
  return excluded
}

/**
 * Which rules a record was hashed under.
 *
 * A record with no marker predates versioning and is version 1 by definition.
 * Defaulting to the current version instead would report every historical
 * record as a hash mismatch, which is the opposite of what versioning is for.
 */
export function hashVersionOf(input: HashableInput): number {
  const recorded = (input as Record<string, unknown>)[HASH_VERSION_KEY]
  return typeof recorded === "number" ? recorded : 1
}

function canonicalize(value: unknown, excluded: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, excluded))
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      if (!excluded.has(key) && source[key] !== undefined) {
        result[key] = canonicalize(source[key], excluded)
      }
    }
    return result
  }
  return value
}

export function canonicalResearchJson(input: HashableInput, version: number = CURRENT_HASH_VERSION): string {
  return JSON.stringify(canonicalize(input, excludedFor(version)))
}

export function calculateReproducibilityHash(
  input: HashableInput,
  version: number = CURRENT_HASH_VERSION,
): string {
  return createHash("sha256").update(canonicalResearchJson(input, version)).digest("hex")
}

/**
 * Recompute a record's hash under the rules it was hashed with.
 *
 * This is what a verifier should call. Using the current version against an
 * older record compares two different algorithms and reports a mismatch that
 * says nothing about the record.
 */
export function verifyReproducibilityHash(input: HashableInput): {
  valid: boolean
  version: number
  expected: string
  actual: string | null
} {
  const version = hashVersionOf(input)
  const expected = calculateReproducibilityHash(input, version)
  const actual = (input as Record<string, unknown>).reproducibility_hash
  return {
    valid: typeof actual === "string" && actual === expected,
    version,
    expected,
    actual: typeof actual === "string" ? actual : null,
  }
}

/**
 * The identity and timing exclusions, published for rule sets declared outside
 * this module.
 *
 * The `study` contract family (ADR 0010) hashes under its own rules id and its
 * own exclusion set, but it inherits both of these lists wholesale: a study
 * record's `created_at` is exactly as volatile as a benchmark result's, and a
 * run duration is an artifact of running rather than a result in either family.
 * Exported by reference rather than copied, so a second list cannot drift away
 * from the one every published hash was computed under.
 */
export const IDENTITY_KEYS = identityKeys
export const TIMING_KEYS = timingKeys

/**
 * The canonical form, for a caller that brings its own exclusion set.
 *
 * `canonicalResearchJson` picks its set from a numeric version, and that
 * registry is closed -- adding a family to it would mean a new version number,
 * and a new version number invalidates nothing but confuses everything already
 * stored. A family with different rules therefore brings its own set and reuses
 * this canonicalizer: recursive key sort, `undefined` dropped, `null` kept,
 * `JSON.stringify` float rendering. One implementation of the canonical form,
 * rather than two that agree until the day they do not.
 */
export function canonicalJsonForExcludedKeys(input: unknown, excluded: ReadonlySet<string>): string {
  // `canonicalize` only ever reads the set. The parameter stays `ReadonlySet` so
  // a caller's frozen rule set cannot be mutated by anything downstream of here.
  return JSON.stringify(canonicalize(input, excluded as Set<string>))
}
