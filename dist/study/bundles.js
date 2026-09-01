import { Buffer } from "node:buffer";
import { z } from "zod";
import { verifyBundle } from "../intelligence/bundle.js";
import { ContentHashSchema } from "./common.js";
import { finding, studyPath } from "./findings.js";
import { artifactHash } from "./hash.js";
import { STUDY_PACKAGE_LIMITS, limitFinding } from "./package-limits.js";
import { ExactIntegerStringSchema } from "./values.js";
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
export const BundleKindSchema = z.enum(["RESOURCE_INTELLIGENCE"]);
/**
 * Only these characters, and only in groups of four.
 *
 * Base64 with embedded newlines, or with the URL-safe alphabet, decodes to the
 * same bytes and hashes to a different package: two spellings of one payload
 * are two records, which is the rule `values.ts` states about numbers and which
 * applies here for the same reason. One spelling.
 */
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const EmbeddedBundleSchema = z
    .object({
    media_type: z.literal("application/json"),
    /** An `exact_integer_string`, for the reason every byte count in this family is one. */
    byte_size: ExactIntegerStringSchema,
    /** `artifactHash` over the decoded bytes: the answer to "are these the bytes". */
    content_hash: ContentHashSchema,
    /**
     * The bundle itself, as bytes rather than as a parsed object.
     *
     * Bytes because that is what the digest is over. A bundle stored as a nested
     * JSON object would be re-serialized by whoever read it, and a
     * re-serialization is a different byte sequence with a different digest --
     * so the embedded copy could not be checked against the hash the reference
     * names, which is the only reason to embed it.
     */
    base64: z.string().max(STUDY_PACKAGE_LIMITS.max_embedded_bundle_bytes * 2).regex(STRICT_BASE64, {
        message: "An embedded bundle is standard base64 with no line breaks and no URL-safe substitutions. Two spellings " +
            "of one payload are two packages with two digests.",
    }),
})
    .strict();
export const BundleRefSchema = z
    .object({
    bundle_kind: BundleKindSchema,
    /** The bundle's own digest, under the intelligence tier's rules rather than this family's. */
    reproducibility_hash: ContentHashSchema,
    /**
     * The bundle, carried. Null when the recipient is expected to fetch it.
     *
     * An offline export must carry every bundle it references, and
     * `OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED` is what says so: a file that calls
     * itself self-contained and cites a document nobody has is self-contained
     * only until somebody checks it.
     */
    embedded: EmbeddedBundleSchema.nullable(),
})
    .strict();
/**
 * A path into a bundle, in the syntax the rest of this family uses for paths.
 *
 * `estimates[0].total_physical_qubits.value` -- properties with dots, indices
 * with brackets, no `$` prefix because the root is the bundle rather than the
 * record being verified. The pattern is restrictive on purpose: a path
 * containing a wildcard, a filter or a function call would be a query language
 * two implementations would evaluate differently, and the point of the field is
 * that both languages resolve it to the same value.
 */
const BUNDLE_FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]{1,6}\]|\.[A-Za-z_][A-Za-z0-9_]*)*$/;
export const BundleFieldRefSchema = z
    .object({
    bundle_hash: ContentHashSchema,
    field_path: z.string().min(1).max(256).regex(BUNDLE_FIELD_PATH, {
        message: "A bundle field path is properties separated by dots and array indices in brackets. Wildcards and filters " +
            "are refused: a path two implementations evaluate differently names two values.",
    }),
})
    .strict();
/**
 * The record kinds whose values come out of a resource intelligence bundle.
 *
 * A claim resting on evidence of one of these kinds is reading a bundle,
 * whether or not it says so, and `CLAIM_BUNDLE_FIELD_MISSING` is what makes it
 * say so. The list is the intelligence tier's own contract set rather than a
 * guess: each of these is a record `buildBundle` produces or consumes, so a
 * node referencing one is pointing inside a bundle.
 */
export const BUNDLE_DERIVED_RECORD_KINDS = Object.freeze([
    "resource_intelligence_bundle",
    "resource_estimate_snapshot",
    "advantage_threshold",
    "decision_assessment",
    "resource_scenario",
    "quantum_workload",
    "classical_baseline",
    "hardware_model_snapshot",
    "qec_model_snapshot",
    "economic_model",
]);
/** The working lookup, module-private and built from the frozen tuple. */
const bundleDerivedKinds = new Set(BUNDLE_DERIVED_RECORD_KINDS);
export function isBundleDerivedRecordKind(kind) {
    return bundleDerivedKinds.has(kind);
}
/**
 * Decode an embedded bundle and check that it is the bytes it says it is.
 *
 * The digest is recomputed over the decoded bytes rather than taken on trust,
 * because the embedded copy exists to be checkable: a package that carries a
 * bundle and a hash of some other bundle is exactly the case an offline export
 * has to make impossible.
 */
export function decodeEmbeddedBundle(embedded, schemaVersion, path) {
    const bytes = new Uint8Array(Buffer.from(embedded.base64, "base64"));
    const overSize = limitFinding(`${path}.byte_size`, "embedded bundle bytes", bytes.length, STUDY_PACKAGE_LIMITS.max_embedded_bundle_bytes);
    if (overSize !== null)
        return { ok: false, findings: [overSize] };
    if (String(bytes.length) !== embedded.byte_size) {
        return {
            ok: false,
            findings: [
                finding("BUNDLE_HASH_MISMATCH", `${path}.byte_size`, `The embedded bundle decodes to ${bytes.length} bytes and the record says ${embedded.byte_size}. Two ` +
                    "statements about one payload, and the shorter one is the one a reader with a size limit believes."),
            ],
        };
    }
    const digest = artifactHash("research_package", bytes, schemaVersion);
    if (digest !== embedded.content_hash) {
        return {
            ok: false,
            findings: [
                finding("BUNDLE_HASH_MISMATCH", `${path}.content_hash`, `The embedded bundle's bytes hash to ${digest} and the record claims ${embedded.content_hash}. The ` +
                    "embedded copy exists to be checked, and this is the check failing."),
            ],
        };
    }
    try {
        return { ok: true, document: JSON.parse(new TextDecoder().decode(bytes)) };
    }
    catch (error) {
        return {
            ok: false,
            findings: [
                finding("BUNDLE_UNRESOLVED", `${path}.base64`, `The embedded bundle's bytes are not JSON: ${error instanceof Error ? error.message : String(error)}. ` +
                    "The digest matched, so these are the intended bytes and they do not parse."),
            ],
        };
    }
}
/**
 * A value inside a bundle, or nothing.
 *
 * Own properties only, and no prototype walk: a path of `constructor.name`
 * would otherwise resolve on every object in the process and report a claim as
 * grounded in a field nobody wrote.
 */
export function resolveBundleField(document, fieldPath) {
    let current = document;
    for (const part of fieldPath.split(".")) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[[0-9]+\])*)$/.exec(part);
        if (match === null)
            return undefined;
        if (current === null || typeof current !== "object")
            return undefined;
        if (!Object.prototype.hasOwnProperty.call(current, match[1]))
            return undefined;
        current = current[match[1]];
        for (const index of (match[2] ?? "").matchAll(/\[([0-9]+)\]/g)) {
            if (!Array.isArray(current))
                return undefined;
            current = current[Number(index[1])];
        }
    }
    return current;
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
export function resolveBundles(refs, schemaVersion, supplied = new Map(), distribution = "ONLINE", section = "bundle_refs", 
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
requireResolution = true) {
    const findings = [];
    const bundles = new Map();
    let resolved = true;
    let recomputed = refs.length > 0;
    refs.forEach((ref, index) => {
        const path = studyPath(section, index);
        let document = null;
        if (ref.embedded !== null) {
            const decoded = decodeEmbeddedBundle(ref.embedded, schemaVersion, `${path}.embedded`);
            if (!decoded.ok) {
                findings.push(...decoded.findings);
                resolved = false;
                recomputed = false;
                return;
            }
            document = decoded.document;
        }
        else if (distribution === "OFFLINE_EXPORT") {
            findings.push(finding("OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED", `${path}.embedded`, `This package calls itself an offline export and references bundle ${ref.reproducibility_hash} without ` +
                "carrying it. An offline export's whole claim is that the recipient needs nothing else; a reference " +
                "to a document they do not have is that claim being false."));
            resolved = false;
            recomputed = false;
            return;
        }
        else {
            const found = supplied.get(ref.reproducibility_hash);
            if (found === undefined) {
                if (requireResolution) {
                    findings.push(finding("BUNDLE_UNRESOLVED", `${path}.reproducibility_hash`, `Bundle ${ref.reproducibility_hash} is neither carried by this package nor supplied to the ` +
                        "verifier, so nothing here can say whether it exists, what it contains, or whether its " +
                        "conclusions follow from its inputs."));
                }
                resolved = false;
                recomputed = false;
                return;
            }
            document = found;
        }
        const record = document;
        const kind = record === null ? undefined : record["bundle_kind"];
        if (kind !== ref.bundle_kind) {
            findings.push(finding("BUNDLE_KIND_MISMATCH", `${path}.bundle_kind`, `The reference says ${JSON.stringify(ref.bundle_kind)} and the document says ${JSON.stringify(kind)}. ` +
                "Every field path into it means something else, so a claim reading this bundle is reading a document " +
                "of a different shape."));
            resolved = false;
            recomputed = false;
            return;
        }
        const recordedHash = record === null ? undefined : record["reproducibility_hash"];
        if (recordedHash !== ref.reproducibility_hash) {
            findings.push(finding("BUNDLE_HASH_MISMATCH", `${path}.reproducibility_hash`, `The reference names ${ref.reproducibility_hash} and the document carries ` +
                `${JSON.stringify(recordedHash)}. These are two bundles, and the package cites one while carrying the ` +
                "other."));
            resolved = false;
            recomputed = false;
            return;
        }
        bundles.set(ref.reproducibility_hash, document);
        // The check a digest cannot make. `verifyBundle` rebuilds the estimates,
        // thresholds and assessments from the bundle's own stored inputs, so a
        // decision section written by hand and re-hashed fails here and passes
        // everything above.
        const verification = verifyBundle(document);
        if (!verification.hash_matches) {
            recomputed = false;
            findings.push(finding("BUNDLE_HASH_MISMATCH", `${path}.reproducibility_hash`, `The bundle's own contents canonicalize to ${verification.expected_hash} and it claims ` +
                `${verification.actual_hash}. It was edited after it was written.`));
        }
        if (!verification.estimates_match || !verification.decision_matches) {
            recomputed = false;
            findings.push(finding("BUNDLE_SCIENCE_NOT_RECOMPUTED", path, "This bundle's stored estimates or decisions are not what its own inputs produce, so a number this " +
                "package quotes from it was not computed by the documented rules. " +
                verification.problems.join(" ")));
        }
    });
    return {
        bundles,
        findings: Object.freeze(findings),
        resolved,
        science_recomputed: recomputed && resolved,
    };
}
/**
 * Whether each named bundle field exists in the bundle it names.
 *
 * The check that turns "this claim cites a bundle" into "this claim reads this
 * number". A field path that resolves to nothing is a citation of a document
 * rather than of a value, which is the state `bundle_refs: string[]` left every
 * claim in.
 */
export function bundleFieldFindings(fields, bundles, declared, path) {
    const findings = [];
    fields.forEach((field, index) => {
        // Two different absences, and only one of them is this claim's fault. A
        // bundle the package never references is a citation of something the file
        // does not admit to using, and that is a defect wherever it is checked. A
        // bundle the package does reference and this caller could not obtain is
        // already reported once, by `bundles_resolve`; repeating it per claim would
        // turn one missing document into a finding for every sentence.
        if (!declared.has(field.bundle_hash)) {
            findings.push(finding("BUNDLE_UNRESOLVED", `${path}[${index}].bundle_hash`, `This claim reads bundle ${field.bundle_hash}, and the package does not reference it in bundle_refs. ` +
                "A claim citing a document the file does not list is a citation nobody can follow."));
            return;
        }
        const document = bundles.get(field.bundle_hash);
        if (document === undefined)
            return;
        if (resolveBundleField(document, field.field_path) !== undefined)
            return;
        findings.push(finding("BUNDLE_FIELD_UNRESOLVED", `${path}[${index}].field_path`, `The bundle carries nothing at ${JSON.stringify(field.field_path)}. A claim naming a field that is not ` +
            "there has cited the document rather than the number, which is what a bare bundle digest did for every " +
            "claim in the previous shape of this record."));
    });
    return findings;
}
//# sourceMappingURL=bundles.js.map