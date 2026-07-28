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
export {};
//# sourceMappingURL=index.d.ts.map