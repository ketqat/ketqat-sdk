"""The four hashes, and the four different questions they answer (goal 4).

Mirrors `src/study/hash.ts`.

Splitting them is the whole point. One digest cannot mean both "this is the same
science" and "nobody edited this file", because those two claims want opposite
things from a timestamp: the first must ignore it and the second must cover it. A
family with one digest ends up answering whichever question the reader happens to
be asking, which is how "the hashes match" turns into a sentence nobody can
check.

===================  =========================================  ===========================================
hash                 answers                                    does **not** answer
===================  =========================================  ===========================================
``semantic_hash``    is this the same scientific content?       who ran it, when, whether it is authentic
``record_hash``      was this file edited after it was written? whether the content is correct or authorised
``receipt_hash``     did this server observe this action, in    that a *user* signed anything
                     this order?
``artifact_hash``    are these the bytes that were produced?    anything about their meaning
===================  =========================================  ===========================================

The wording rule that follows, and that every surface in this family obeys: **a
matching hash is never described as "authentic", "signed", or "scientifically
correct".** ``attestation_level`` stays ``hash_only``, and a page that renders it
says what hash-only does not establish. A digest computed here proves that two
byte sequences are the same byte sequence. Every further claim -- that a named
person produced them, that a server was not compromised, that the physics is
right -- needs evidence this module does not have and does not pretend to.

All four take the domain-separated preimage from `study_preimage.py`, so a
``semantic`` and a ``record`` digest of a record whose every field is
``SEMANTIC`` differ even though their bodies are identical, and two record kinds
that project to the same body never share a namespace.
"""

from __future__ import annotations

import hashlib
from types import MappingProxyType
from typing import Any, Mapping

from .study_jcs import canonicalize_jcs_bytes
from .study_limits import STUDY_HASH_LIMITS, refuse
from .study_preimage import build_study_preimage, study_header
from .study_projection import project_study_shape
from .study_registry import study_record_kind
from .study_rules import STUDY_HASH_RULES_ID


def _digest(preimage: bytes) -> str:
    return hashlib.sha256(preimage).hexdigest()


def _digest_record(
    record_kind: str,
    record: Mapping[str, Any],
    purpose: str,
    limits: Mapping[str, int],
) -> str:
    """Project a record for one purpose and digest it under that purpose's header.

    The schema version is read off the record rather than assumed, because it is
    a header component: a record that does not say which schema it was written
    against is malformed rather than old, and hashing it under this build's
    current version would answer a question the record did not ask.
    """
    entry = study_record_kind(record_kind)
    if not isinstance(record, Mapping):
        refuse("SHAPE_MISMATCH", f"a {type(record).__name__} is not a study record.")
    schema_version = record.get("schema_version")
    rules_id = record.get("hash_rules_id", STUDY_HASH_RULES_ID)
    if not isinstance(schema_version, str) or schema_version == "":
        refuse(
            "MISSING_HEADER_COMPONENT",
            "a study record must name the schema version it was written against; nothing is inferred. The "
            "version is a preimage header component, so a record hashed under an assumed one takes a digest "
            "that answers a question nobody asked.",
            "schema_version",
        )
    if not isinstance(rules_id, str):
        refuse(
            "INVALID_HEADER_COMPONENT",
            f"{rules_id!r} is not a hash rules id. The field must be a string or absent.",
            "hash_rules_id",
        )
    body = project_study_shape(entry["shape"], record, purpose)
    encoded = canonicalize_jcs_bytes(body, limits)
    header = study_header(record_kind, purpose, schema_version, rules_id)
    return _digest(build_study_preimage(header, encoded))


def semantic_hash(
    record_kind: str,
    record: Mapping[str, Any],
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> str:
    """Is this the same scientific content?

    Over the ``SEMANTIC`` fields only: model inputs, assumptions, the scenario,
    and the deterministic conditions under which the record reproduces. Two
    records with this digest in common describe the same computation, whoever
    wrote them down and whenever.

    **Does not establish** who ran it, when it was run, that the run happened at
    all, or that the record is authentic. A semantic hash is a claim about
    content and carries no evidence about provenance -- an attacker who can write
    a file can write one with any semantic hash they like, because they can write
    the content it is taken over.
    """
    return _digest_record(record_kind, record, "semantic", limits)


def record_hash(
    record_kind: str,
    record: Mapping[str, Any],
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> str:
    """Was this file edited after it was written?

    Over every declared field except the ``DERIVED`` ones, which cannot be inputs
    to a digest that covers them: presentation metadata, labels, denormalized
    state and receipt fields are all in, because the question is about the record
    as written rather than about what it means.

    **Does not establish** that the content is correct, that it was authorised,
    or that the person named in it wrote it. It answers a question about bytes,
    and only for a reader who obtained the expected digest from somewhere the
    file is not.
    """
    return _digest_record(record_kind, record, "record", limits)


def receipt_hash(
    record_kind: str,
    record: Mapping[str, Any],
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> str:
    """Did this server observe this action, in this order?

    Over the ``RECEIPT_ONLY`` fields: actor, authenticated subject, timestamp,
    sequence, previous receipt, action, and server-side audit metadata. Chained
    through ``previous_event_hash``, a sequence of these is a log whose order
    cannot be edited without every later digest moving.

    **Does not establish that a user signed anything.** The actor field is the
    server's record of who it believed was acting; a receipt is the server's
    statement, made with the server's own integrity, and a reader who does not
    trust the server has no reason to trust the receipt. Nothing here is a
    signature, and no surface may describe it as one.
    """
    return _digest_record(record_kind, record, "receipt", limits)


def artifact_hash(
    record_kind: str,
    data: bytes,
    schema_version: str,
    hash_rules_id: str = STUDY_HASH_RULES_ID,
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> str:
    """Are these the bytes that were produced?

    Over the literal bytes of a file -- JSON, CSV, SVG, a log, a manifest -- with
    no parse, no canonicalization and no projection. Bytes are the input because
    that is the question: an artifact digest that canonicalized first would
    answer a question about a *reading* of the file, and two files differing in
    whitespace, key order or line endings would share it.

    **Does not establish anything about their meaning.** Not that the CSV parses,
    not that the numbers in it are right, not who produced them. It is the
    narrowest of the four and deliberately so.
    """
    if isinstance(data, str) or not isinstance(data, (bytes, bytearray)):
        refuse(
            "NOT_JSON_VALUE",
            "artifact_hash is defined over the literal bytes of a file and takes bytes. A str would have to be "
            "encoded first, and choosing the encoding on the caller's behalf is how one artifact ends up with "
            "two digests.",
        )
    if len(data) > limits["max_canonical_bytes"]:
        refuse(
            "MAX_CANONICAL_BYTES_EXCEEDED",
            f"the artifact is {len(data)} bytes, past the {limits['max_canonical_bytes']} byte bound.",
        )
    # Called for its refusal: an artifact is filed under the record kind it
    # belongs to, and an unknown kind is a namespace nobody declared here exactly
    # as it is for a record.
    study_record_kind(record_kind)
    header = study_header(record_kind, "artifact", schema_version, hash_rules_id)
    return _digest(build_study_preimage(header, bytes(data)))


def study_canonical_body(
    record_kind: str,
    record: Mapping[str, Any],
    purpose: str,
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> str:
    """The canonical body a purpose would hash, for tests and error messages.

    Exported because "why do these two records take different digests" is a
    question a reader has to be able to answer without a debugger, and the answer
    is a diff of two canonical bodies.
    """
    entry = study_record_kind(record_kind)
    body = project_study_shape(entry["shape"], record, purpose)
    return canonicalize_jcs_bytes(body, limits).decode("utf-8")


def study_self_hash(
    record_kind: str,
    record: Mapping[str, Any],
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> str:
    """The digest a record of this kind writes into its own hash field.

    Which of the four that is, and why, is declared per kind in
    `src/study/registry.ts` and read here from the emitted shape tables. The
    choice is a fact about the record kind that both languages have to agree
    about, so it is data both languages read rather than a call each record
    module makes for itself.

    The digest is taken over the record *without* its own hash field, and taking
    it over a record that still carries one gives the same answer: the field is
    ``DERIVED``, so no purpose reads it. That is what makes build and verify the
    same call.
    """
    entry = study_record_kind(record_kind)
    return _digest_record(record_kind, record, entry["self_hash_purpose"], limits)


def verify_study_self_hash(
    record_kind: str,
    record: Mapping[str, Any],
    limits: Mapping[str, int] = STUDY_HASH_LIMITS,
) -> Mapping[str, Any]:
    """Recompute a record's own hash and say whether it is the one written on it.

    There is no longer a question about *which* field carries the self-hash.
    Each kind declares one, and the other name is not a declared field of that
    kind at all -- so a capsule carrying a ``content_hash`` beside its
    ``reproducibility_hash`` is refused by the projection as an undeclared key
    rather than reported intact by a verifier that preferred one of them.

    A record that does not carry its self-hash field at all is reported invalid
    with ``actual: None`` rather than refused: "not stamped" is a state a builder
    passes through, and a different answer from "stamped with the wrong digest".

    Mirrors `verifyStudySelfHash` in src/study/hash.ts.
    """
    entry = study_record_kind(record_kind)
    expected = _digest_record(record_kind, record, entry["self_hash_purpose"], limits)
    recorded = record.get(entry["self_hash_field"])
    actual = recorded if isinstance(recorded, str) else None
    return MappingProxyType(
        {
            "valid": actual is not None and actual == expected,
            "record_kind": entry["record_kind"],
            "self_hash_field": entry["self_hash_field"],
            "purpose": entry["self_hash_purpose"],
            "expected": expected,
            "actual": actual,
        }
    )
