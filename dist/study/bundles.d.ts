import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type StudyFinding } from "./findings.js";
/**
 * The bundles a package's numbers came out of (goal §14.6).
 *
 * `bundle_refs: string[]` -- a list of bare digests -- was a citation a reader
 * could not follow. It said that some resource intelligence bundle existed with
 * that hash, and nothing about whether the recipient could obtain it, whether
 * it was a bundle at all, whether its own conclusions followed from its own
 * inputs, or which of its several hundred fields any particular claim was
 * reading. A package could reference a bundle that had never existed and the
 * reference verified exactly as well as a real one.
 *
 * Four things are checkable and each is checked separately, because each fails
 * separately and each has a different fix.
 *
 * **Does it resolve.** Either the package carries the bundle -- which is what an
 * offline export must do, since the whole claim of an offline export is that
 * the recipient needs nothing else -- or the caller supplies it. A reference
 * that resolves to nothing is `BUNDLE_UNRESOLVED`.
 *
 * **Is it the kind it says.** A bundle reference naming something that is not a
 * `RESOURCE_INTELLIGENCE` bundle is a pointer that opens onto the wrong sort of
 * document, and every field path into it means something else.
 *
 * **Does it hash as claimed.** The reference names a digest; the document has
 * one; the two must be the same document.
 *
 * **Do its conclusions follow from its inputs.** This is the one a digest
 * cannot answer and the one that matters: `verifyBundle` rebuilds the
 * estimates, thresholds and assessments from the stored workload, baseline and
 * scenarios and compares them, so a bundle whose decision section was written
 * by hand and re-hashed is caught here and nowhere else.
 *
 * And then the fifth thing, which is about the package rather than the bundle:
 * **which field is this claim reading**. A claim that rests on bundle-derived
 * evidence and does not say which field of which bundle has cited a document
 * rather than a number.
 */
export declare const BundleKindSchema: z.ZodEnum<["RESOURCE_INTELLIGENCE"]>;
export type BundleKind = z.infer<typeof BundleKindSchema>;
export interface EmbeddedBundle {
    media_type: string;
    byte_size: string;
    content_hash: string;
    base64: string;
}
export declare const EmbeddedBundleSchema: Contract<EmbeddedBundle>;
export interface BundleRef {
    bundle_kind: BundleKind;
    reproducibility_hash: string;
    embedded: EmbeddedBundle | null;
}
export declare const BundleRefSchema: Contract<BundleRef>;
export interface BundleFieldRef {
    bundle_hash: string;
    field_path: string;
}
export declare const BundleFieldRefSchema: Contract<BundleFieldRef>;
/**
 * The record kinds whose values come out of a resource intelligence bundle.
 *
 * A claim resting on evidence of one of these kinds is reading a bundle,
 * whether or not it says so, and `CLAIM_BUNDLE_FIELD_MISSING` is what makes it
 * say so. The list is the intelligence tier's own contract set rather than a
 * guess: each of these is a record `buildBundle` produces or consumes, so a
 * node referencing one is pointing inside a bundle.
 */
export declare const BUNDLE_DERIVED_RECORD_KINDS: readonly string[];
export declare function isBundleDerivedRecordKind(kind: string): boolean;
/** A bundle document, however it was obtained, together with what is wrong with it. */
export interface ResolvedBundle {
    readonly reproducibility_hash: string;
    readonly document: unknown | null;
    readonly resolved: boolean;
    readonly science_recomputed: boolean;
}
/**
 * Where a verifier may look for a bundle the package does not carry.
 *
 * A map rather than a fetch, deliberately. A verifier that went to the network
 * would give two answers for one file depending on what the network said today,
 * and the recipient could not tell which answer they had. Supplying the bundles
 * makes the caller state what they are checking against.
 */
export type BundleResolver = ReadonlyMap<string, unknown>;
/**
 * Decode an embedded bundle and check that it is the bytes it says it is.
 *
 * The digest is recomputed over the decoded bytes rather than taken on trust,
 * because the embedded copy exists to be checkable: a package that carries a
 * bundle and a hash of some other bundle is exactly the case an offline export
 * has to make impossible.
 */
export declare function decodeEmbeddedBundle(embedded: EmbeddedBundle, schemaVersion: string, path: string): {
    ok: true;
    document: unknown;
} | {
    ok: false;
    findings: StudyFinding[];
};
/**
 * A value inside a bundle, or nothing.
 *
 * Own properties only, and no prototype walk: a path of `constructor.name`
 * would otherwise resolve on every object in the process and report a claim as
 * grounded in a field nobody wrote.
 */
export declare function resolveBundleField(document: unknown, fieldPath: string): unknown;
export interface BundleResolution {
    readonly bundles: ReadonlyMap<string, unknown>;
    readonly findings: readonly StudyFinding[];
    /** Every reference resolved, was the expected kind, and hashed as claimed. */
    readonly resolved: boolean;
    /** Every resolved bundle's own estimates and decisions were rebuilt and matched. */
    readonly science_recomputed: boolean;
}
/**
 * Resolve every bundle a package references, and recompute what each one says.
 *
 * `resolved` and `science_recomputed` are separate answers because they are
 * separate claims, and collapsing them is how "verified" comes to mean "the
 * file was there". A bundle that resolves and hashes correctly and whose
 * decision section does not follow from its inputs is a fabrication that passes
 * every check except the last one.
 *
 * A package with no bundle references resolves vacuously and recomputes
 * nothing, and `science_recomputed` is `false` in that case rather than `true`:
 * "no science was recomputed" is what happened, and reporting it as success
 * would let a package with its bundle references removed read as better
 * verified than one that kept them.
 */
export declare function resolveBundles(refs: readonly BundleRef[], schemaVersion: string, supplied?: BundleResolver, distribution?: "ONLINE" | "OFFLINE_EXPORT", section?: string, 
/**
 * Whether a bundle nobody supplied is a finding.
 *
 * True for a recipient, who genuinely cannot check a bundle they do not have,
 * and false for the builder, which is assembling a package that references
 * bundles held in a store rather than carrying them. An online package citing
 * a bundle it does not embed is a legitimate record; it is only an *unverified*
 * one, and that is what `bundles_resolve` says at verification time.
 *
 * The offline case is not affected either way: an export claiming to be
 * self-contained must embed, at both boundaries.
 */
requireResolution?: boolean): BundleResolution;
/**
 * Whether each named bundle field exists in the bundle it names.
 *
 * The check that turns "this claim cites a bundle" into "this claim reads this
 * number". A field path that resolves to nothing is a citation of a document
 * rather than of a value, which is the state `bundle_refs: string[]` left every
 * claim in.
 */
export declare function bundleFieldFindings(fields: readonly BundleFieldRef[], bundles: ReadonlyMap<string, unknown>, declared: ReadonlySet<string>, path: string): StudyFinding[];
//# sourceMappingURL=bundles.d.ts.map