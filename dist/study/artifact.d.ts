import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
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
export declare const ArtifactRoleSchema: z.ZodEnum<["CIRCUIT", "PARAMETERS", "DATASET", "NOISE_MODEL", "MANIFEST", "MEASUREMENTS", "RESULT", "METRICS", "LOG"]>;
export type ArtifactRole = z.infer<typeof ArtifactRoleSchema>;
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
export declare const ArtifactResolutionKindSchema: z.ZodEnum<["INLINE_IN_BUNDLE", "CONTENT_ADDRESSED_STORE", "PROVIDER_HELD", "NOT_RETAINED"]>;
export type ArtifactResolutionKind = z.infer<typeof ArtifactResolutionKindSchema>;
export interface ArtifactResolution {
    kind: ArtifactResolutionKind;
    locator: string | null;
}
export declare const ArtifactResolutionSchema: Contract<ArtifactResolution>;
/** Whether this is all of the artifact, or the part that exists. */
export declare const ArtifactCompletenessSchema: z.ZodEnum<["COMPLETE", "PARTIAL"]>;
export type ArtifactCompleteness = z.infer<typeof ArtifactCompletenessSchema>;
/** Whether anything was removed from the artifact before it was written. */
export declare const ArtifactRedactionSchema: z.ZodEnum<["NONE", "REDACTED"]>;
export type ArtifactRedaction = z.infer<typeof ArtifactRedactionSchema>;
export interface ArtifactRef {
    name: string;
    role: ArtifactRole;
    media_type: string;
    byte_size: string;
    content_hash: string;
    resolution: ArtifactResolution;
    completeness: ArtifactCompleteness;
    partial_reason: string | null;
    redaction: ArtifactRedaction;
    redaction_reason: string | null;
}
export declare const ArtifactRefSchema: Contract<ArtifactRef>;
/**
 * Whether a list of artifact references names each file once.
 *
 * Two entries with one name are two readings of one slot, exactly as two JSON
 * keys with one name are two readings of one file: a consumer that indexes by
 * name gets whichever it saw last, and the capsule does not say which. Checked
 * where the list is declared rather than left to a consumer, because a
 * consumer's answer is the one that would differ between the two languages.
 */
export declare function duplicateArtifactNames(artifacts: readonly ArtifactRef[]): readonly string[];
/**
 * An artifact list, refusing a repeated name.
 *
 * Used for both the inputs and the outputs of a capsule and for the inputs an
 * authorization names, so the rule is stated once.
 */
export declare function artifactRefListSchema(subject: string): z.ZodTypeAny;
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
    media_type: string;
    byte_size: string;
    content_hash: string;
}
export declare const GeneratedArtifactSchema: Contract<GeneratedArtifact>;
//# sourceMappingURL=artifact.d.ts.map