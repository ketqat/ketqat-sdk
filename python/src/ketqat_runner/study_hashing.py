from __future__ import annotations

import hashlib
from typing import Any

from .hashing import (
    HASH_VERSION_KEY,
    IDENTITY_KEYS,
    TIMING_KEYS,
    canonical_json_for_excluded_keys,
)

#: The rule set the `study` contract family hashes under (ADR 0010).
STUDY_HASH_RULES_ID = "study-v1"

#: Where a study record names its rules. Never itself hashed.
#:
#: Deliberately not `reproducibility_hash_version`: `hash_version_of` reports
#: version 1 for any marker that is not an integer, so a string id written into
#: the legacy field would not fail -- it would quietly verify the record under
#: version 1 rules and report success. A silent wrong answer is worse than a
#: refusal, so the family marks itself somewhere the legacy verifier cannot
#: mistake it for anything.
STUDY_HASH_RULES_KEY = "hash_rules_id"

#: What `study-v1` leaves out.
#:
#: The identity and timing lists are inherited from `hashing.py` rather than
#: retyped: a study record's `created_at` is as volatile as a benchmark result's,
#: and version 2's finding -- that a run duration is an artifact of running
#: rather than a result -- holds here unchanged.
#:
#: The four family-specific entries are all the same rule: a field whose value is
#: a consequence of something else must not be able to move a hash on its own.
#: `hash_rules_id` is the marker and never hashes itself; `content_hash` is a
#: record's own digest; `status` is a projection of the event trail and never a
#: source of truth; `latest_specification` and `latest_plan` point at the newest
#: immutable revisions and move whenever one is added.
#:
#: This set must stay identical to `STUDY_EXCLUDED_KEYS` in
#: src/study/hashing.ts; the parity fixtures fail if it drifts.
STUDY_EXCLUDED_KEYS = (
    IDENTITY_KEYS
    | {HASH_VERSION_KEY}
    | TIMING_KEYS
    | {
        STUDY_HASH_RULES_KEY,
        "content_hash",
        "status",
        "latest_specification",
        "latest_plan",
    }
)

_EXCLUDED_BY_RULES_ID = {STUDY_HASH_RULES_ID: STUDY_EXCLUDED_KEYS}


def _excluded_for(rules_id: str) -> frozenset[str]:
    try:
        return _EXCLUDED_BY_RULES_ID[rules_id]
    except KeyError:
        known = ", ".join(sorted(_EXCLUDED_BY_RULES_ID))
        raise ValueError(
            f"Unknown study hash rules id {rules_id}. Known ids: {known}."
        ) from None


def study_rules_id_of(value: dict[str, Any]) -> str:
    """Which rules a study record was hashed under, or a refusal.

    ADR 0006's "no marker means version 1" is correct for a registry whose
    records predate versioning. This family has no such history, so a record
    without a rules id is not an old record but a malformed one, and it is
    refused rather than defaulted -- in this language and in TypeScript, with the
    same words.
    """
    recorded = value.get(STUDY_HASH_RULES_KEY)
    if not isinstance(recorded, str) or not recorded:
        raise ValueError(
            "A study-family record must name its hash rules id explicitly; nothing is inferred. "
            "A record without one is refused, not defaulted (ADR 0010)."
        )
    # An id no rule set answers to is refused here rather than at the digest, so
    # a caller that only asks which rules apply is told the same thing as one
    # that asks for the hash.
    _excluded_for(recorded)
    return recorded


def canonical_study_json(value: dict[str, Any], rules_id: str | None = None) -> str:
    """The canonical form of a study record.

    The rules id defaults to the one the record itself declares rather than to
    the current id: hashing a record under rules it does not name is how a
    verifier ends up comparing two different algorithms and blaming the record.
    """
    resolved = study_rules_id_of(value) if rules_id is None else rules_id
    return canonical_json_for_excluded_keys(value, _excluded_for(resolved))


def calculate_study_hash(value: dict[str, Any], rules_id: str | None = None) -> str:
    return hashlib.sha256(
        canonical_study_json(value, rules_id).encode("utf-8")
    ).hexdigest()


def verify_study_record_hash(value: dict[str, Any]) -> dict[str, Any]:
    """Recompute a study record's hash under the rules it names.

    `content_hash` and `reproducibility_hash` are both accepted because the
    family uses both: a revisioned record's `content_hash` is its identity, while
    an execution capsule and a research package carry a `reproducibility_hash`
    with recompute semantics. Both are excluded from the digest, so which one a
    record uses cannot change the answer.
    """
    rules_id = study_rules_id_of(value)
    expected = calculate_study_hash(value, rules_id)
    recorded = value.get("content_hash")
    if not isinstance(recorded, str):
        recorded = value.get("reproducibility_hash")
    return {
        "valid": isinstance(recorded, str) and recorded == expected,
        "rules_id": rules_id,
        "expected": expected,
        "actual": recorded if isinstance(recorded, str) else None,
    }
