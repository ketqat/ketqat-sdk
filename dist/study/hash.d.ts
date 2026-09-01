import { type StudyHashLimits } from "./limits.js";
import { type StudyHashPurpose } from "./projection.js";
/**
 * Is this the same scientific content?
 *
 * Over the `SEMANTIC` fields only: model inputs, assumptions, the scenario, and
 * the deterministic conditions under which the record reproduces. Two records
 * with this digest in common describe the same computation, whoever wrote them
 * down and whenever.
 *
 * **Does not establish** who ran it, when it was run, that the run happened at
 * all, or that the record is authentic. A semantic hash is a claim about
 * content and carries no evidence about provenance -- an attacker who can write
 * a file can write one with any semantic hash they like, because they can write
 * the content it is taken over.
 */
export declare function semanticHash(recordKind: string, record: object, limits?: StudyHashLimits): string;
/**
 * Was this file edited after it was written?
 *
 * Over every declared field except the `DERIVED` ones, which cannot be inputs
 * to a digest that covers them: presentation metadata, labels, denormalized
 * state and receipt fields are all in, because the question is about the record
 * as written rather than about what it means.
 *
 * **Does not establish** that the content is correct, that it was authorised,
 * or that the person named in it wrote it. It answers a question about bytes,
 * and only for a reader who obtained the expected digest from somewhere this
 * file is not.
 */
export declare function recordHash(recordKind: string, record: object, limits?: StudyHashLimits): string;
/**
 * Did this server observe this action, in this order?
 *
 * Over the `RECEIPT_ONLY` fields: actor, authenticated subject, timestamp,
 * sequence, previous receipt, action, and server-side audit metadata. Chained
 * through `previous_event_hash`, a sequence of these is a log whose order
 * cannot be edited without every later digest moving.
 *
 * **Does not establish that a *user* signed anything.** The actor field is the
 * server's record of who it believed was acting; a receipt is the server's
 * statement, made with the server's own integrity, and a reader who does not
 * trust the server has no reason to trust the receipt. Nothing here is a
 * signature, and no surface may describe it as one.
 */
export declare function receiptHash(recordKind: string, record: object, limits?: StudyHashLimits): string;
/**
 * Are these the bytes that were produced?
 *
 * Over the literal bytes of a file -- JSON, CSV, SVG, a log, a manifest --
 * with no parse, no canonicalization and no projection. Bytes are the input
 * because that is the question: an artifact digest that canonicalized first
 * would answer a question about a *reading* of the file, and two files that
 * differ in whitespace, key order or line endings would share it.
 *
 * **Does not establish anything about their meaning.** Not that the CSV parses,
 * not that the numbers in it are right, not who produced them. It is the
 * narrowest of the four and deliberately so.
 *
 * The header still applies: an artifact digest of a file and a record digest of
 * a record that happened to serialize to the same bytes are different digests,
 * because `hash_purpose` differs.
 */
export declare function artifactHash(recordKind: string, bytes: Uint8Array, schemaVersion: string, hashRulesId?: string, limits?: StudyHashLimits): string;
/**
 * The digest a record of this kind writes into its own hash field.
 *
 * Which of the four that is, and why, is declared per kind in `registry.ts` and
 * not decided here: the choice is a fact about the record kind that both
 * languages have to agree about, so it is data both languages read rather than
 * a call each record module makes for itself. Nine modules each picking a
 * purpose is nine places for the Python verifier to disagree with the builder.
 *
 * The digest is taken over the record *without* its own hash field, and taking
 * it over a record that still carries one gives the same answer: the field is
 * `DERIVED`, so no purpose reads it. That is what makes build and verify the
 * same call -- the builder hashes a record it has not stamped yet, the verifier
 * hashes one that is already stamped, and they must not be two code paths.
 */
export declare function studySelfHash(recordKind: string, record: object, limits?: StudyHashLimits): string;
export interface StudySelfHashVerification {
    readonly valid: boolean;
    readonly record_kind: string;
    readonly self_hash_field: string;
    readonly purpose: StudyHashPurpose;
    readonly expected: string;
    readonly actual: string | null;
}
/**
 * Recompute a record's own hash and say whether it is the one written on it.
 *
 * There is no longer a question about *which* field carries the self-hash. Each
 * kind declares one, and the other name is not a declared field of that kind at
 * all -- so a capsule carrying a `content_hash` beside its `reproducibility_hash`
 * is refused by the projection as an undeclared key rather than reported intact
 * by a verifier that preferred one of them. Under the retired rules both names
 * were dropped from the digest by name, at every kind, which is what made a
 * second self-hash free to add to a finished record.
 *
 * A record that does not carry its self-hash field at all is reported invalid
 * with `actual: null` rather than refused. "Not stamped" is a state a builder
 * passes through, and it is a different answer from "stamped with the wrong
 * digest".
 */
export declare function verifyStudySelfHash(recordKind: string, record: object, limits?: StudyHashLimits): StudySelfHashVerification;
/**
 * The canonical body a purpose would hash, for tests and for error messages.
 *
 * Exported because "why do these two records take different digests" is a
 * question a reader has to be able to answer without a debugger, and the answer
 * is a diff of two canonical bodies.
 */
export declare function studyCanonicalBody(recordKind: string, record: object, purpose: StudyHashPurpose, limits?: StudyHashLimits): string;
//# sourceMappingURL=hash.d.ts.map