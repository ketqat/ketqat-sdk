import type { BenchmarkResult, ExperimentManifest } from "../contracts/index.js";
type HashableInput = ExperimentManifest | BenchmarkResult | Record<string, unknown>;
/**
 * The version this build computes when asked for a new hash.
 *
 * Versioning is what makes fixing #89 safe rather than breaking. A stored
 * record keeps the rules it was hashed under, so every hash already published
 * still verifies; only newly computed hashes use the corrected rules. Nothing
 * is rewritten and no existing evidence is invalidated.
 */
export declare const CURRENT_HASH_VERSION = 2;
/** Where a record records which rules produced its hash. Never itself hashed. */
export declare const HASH_VERSION_KEY = "reproducibility_hash_version";
/**
 * Which rules a record was hashed under.
 *
 * A record with no marker predates versioning and is version 1 by definition.
 * Defaulting to the current version instead would report every historical
 * record as a hash mismatch, which is the opposite of what versioning is for.
 */
export declare function hashVersionOf(input: HashableInput): number;
export declare function canonicalResearchJson(input: HashableInput, version?: number): string;
export declare function calculateReproducibilityHash(input: HashableInput, version?: number): string;
/**
 * Recompute a record's hash under the rules it was hashed with.
 *
 * This is what a verifier should call. Using the current version against an
 * older record compares two different algorithms and reports a mismatch that
 * says nothing about the record.
 */
export declare function verifyReproducibilityHash(input: HashableInput): {
    valid: boolean;
    version: number;
    expected: string;
    actual: string | null;
};
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
export declare const IDENTITY_KEYS: readonly ["id", "slug", "started_at", "finished_at", "created_at", "updated_at", "submitted_at", "ui_metadata", "reproducibility_hash", "owner_username", "visibility"];
export declare const TIMING_KEYS: readonly ["runtime_seconds", "decoder_latency_ms", "decoder_latency_ms_per_shot", "sampling_runtime_seconds", "circuit_generation_seconds", "decode_runtime_seconds", "decoder_construction_seconds"];
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
export declare function canonicalJsonForExcludedKeys(input: unknown, excluded: ReadonlySet<string>): string;
export {};
//# sourceMappingURL=index.d.ts.map