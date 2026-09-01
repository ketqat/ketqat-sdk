import { createHash } from "node:crypto";
import { canonicalizeJcsBytes } from "./jcs.js";
import { refuse, STUDY_HASH_LIMITS } from "./limits.js";
import { buildStudyPreimage, studyHeader } from "./preimage.js";
import { projectStudyShape } from "./projection.js";
import { studyRecordKind } from "./registry.js";
import { STUDY_HASH_RULES_ID } from "./rules.js";
/**
 * The four hashes, and the four different questions they answer (goal §4).
 *
 * Splitting them is the whole point. One digest cannot mean both "this is the
 * same science" and "nobody edited this file", because those two claims want
 * opposite things from a timestamp: the first must ignore it and the second
 * must cover it. A family with one digest ends up answering whichever question
 * the reader happens to be asking, which is how "the hashes match" turns into a
 * sentence nobody can check.
 *
 * | hash | over | answers | does **not** answer |
 * | --- | --- | --- | --- |
 * | `semanticHash` | model inputs, assumptions, scenario, reproduction conditions | is this the same scientific content? | who ran it, when, whether it is authentic |
 * | `recordHash` | the record as written, presentation metadata included | was this file edited after it was written? | whether the content is correct or authorised |
 * | `receiptHash` | actor, subject, timestamp, sequence, previous receipt, action | did this server observe this action, in this order? | that a *user* signed anything |
 * | `artifactHash` | the literal bytes of a JSON/CSV/SVG/log/manifest | are these the bytes that were produced? | anything about their meaning |
 *
 * The wording rule that follows from the table, and that every surface in this
 * family obeys: **a matching hash is never described as "authentic", "signed",
 * or "scientifically correct".** `attestation_level` stays `hash_only`, and a
 * page that renders it says what hash-only does not establish. A digest
 * computed here proves that two byte sequences are the same byte sequence.
 * Every further claim -- that a named person produced them, that a server was
 * not compromised, that the physics is right -- needs evidence this file does
 * not have and does not pretend to.
 *
 * All four take the domain-separated preimage from `preimage.ts`, so a
 * `semantic` and a `record` digest of a record whose every field is `SEMANTIC`
 * differ even though their bodies are identical, and two record kinds that
 * project to the same body never share a namespace.
 */
const HEX = "hex";
function sha256(preimage) {
    return createHash("sha256").update(preimage).digest(HEX);
}
/**
 * Project a record for one purpose and digest it under the header for that
 * purpose.
 *
 * The schema version is read off the record rather than assumed, because it is
 * a header component: a record that does not say which schema it was written
 * against is malformed rather than old, and hashing it under this build's
 * current version would be answering a question the record did not ask.
 */
function digestRecord(recordKind, record, purpose, limits) {
    const entry = studyRecordKind(recordKind);
    const schemaVersion = record["schema_version"];
    const rulesId = record["hash_rules_id"] ?? STUDY_HASH_RULES_ID;
    if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
        refuse("MISSING_HEADER_COMPONENT", "a study record must name the schema version it was written against; nothing is inferred. The version is " +
            "a preimage header component, so a record hashed under an assumed one takes a digest that answers a " +
            "question nobody asked.", "schema_version");
    }
    if (typeof rulesId !== "string") {
        refuse("INVALID_HEADER_COMPONENT", `${JSON.stringify(rulesId)} is not a hash rules id. The field must be a string or absent.`, "hash_rules_id");
    }
    const body = projectStudyShape(entry.shape, record, purpose);
    const bytes = canonicalizeJcsBytes(body, limits);
    return sha256(buildStudyPreimage(studyHeader(recordKind, purpose, schemaVersion, rulesId), bytes));
}
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
export function semanticHash(recordKind, record, limits = STUDY_HASH_LIMITS) {
    return digestRecord(recordKind, record, "semantic", limits);
}
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
export function recordHash(recordKind, record, limits = STUDY_HASH_LIMITS) {
    return digestRecord(recordKind, record, "record", limits);
}
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
export function receiptHash(recordKind, record, limits = STUDY_HASH_LIMITS) {
    return digestRecord(recordKind, record, "receipt", limits);
}
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
export function artifactHash(recordKind, bytes, schemaVersion, hashRulesId = STUDY_HASH_RULES_ID, limits = STUDY_HASH_LIMITS) {
    if (!(bytes instanceof Uint8Array)) {
        refuse("NOT_JSON_VALUE", "artifactHash is defined over the literal bytes of a file and takes a Uint8Array. A string would have to " +
            "be encoded first, and choosing the encoding on the caller's behalf is how one artifact ends up with two " +
            "digests.");
    }
    if (bytes.length > limits.max_canonical_bytes) {
        refuse("MAX_CANONICAL_BYTES_EXCEEDED", `the artifact is ${bytes.length} bytes, past the ${limits.max_canonical_bytes} byte bound.`);
    }
    // `studyRecordKind` is called for its refusal: an artifact is filed under the
    // record kind it belongs to, and an unknown kind is a namespace nobody
    // declared here exactly as it is for a record.
    studyRecordKind(recordKind);
    return sha256(buildStudyPreimage(studyHeader(recordKind, "artifact", schemaVersion, hashRulesId), bytes));
}
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
export function studySelfHash(recordKind, record, limits = STUDY_HASH_LIMITS) {
    const entry = studyRecordKind(recordKind);
    return digestRecord(recordKind, record, entry.self_hash_purpose, limits);
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
export function verifyStudySelfHash(recordKind, record, limits = STUDY_HASH_LIMITS) {
    const entry = studyRecordKind(recordKind);
    const expected = digestRecord(recordKind, record, entry.self_hash_purpose, limits);
    const recorded = Object.prototype.hasOwnProperty.call(record, entry.self_hash_field)
        ? record[entry.self_hash_field]
        : undefined;
    const actual = typeof recorded === "string" ? recorded : null;
    return {
        valid: actual !== null && actual === expected,
        record_kind: entry.record_kind,
        self_hash_field: entry.self_hash_field,
        purpose: entry.self_hash_purpose,
        expected,
        actual,
    };
}
/**
 * The canonical body a purpose would hash, for tests and for error messages.
 *
 * Exported because "why do these two records take different digests" is a
 * question a reader has to be able to answer without a debugger, and the answer
 * is a diff of two canonical bodies.
 */
export function studyCanonicalBody(recordKind, record, purpose, limits = STUDY_HASH_LIMITS) {
    const entry = studyRecordKind(recordKind);
    const body = projectStudyShape(entry.shape, record, purpose);
    return new TextDecoder().decode(canonicalizeJcsBytes(body, limits));
}
//# sourceMappingURL=hash.js.map