from __future__ import annotations

import hashlib
import math
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
#:
#: A `frozenset`, not a `set`, for the reason `frozenKeySet` gives on the other
#: side: "must stay identical" has to be true at run time and not only in the
#: sentence above it. A consumer able to add a name would be editing the
#: exclusion list every study-v1 digest was computed under.
STUDY_EXCLUDED_KEYS: frozenset[str] = frozenset(
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

#: The excluded keys an embedded record may carry at its own top level.
#:
#: The exemption is per-key rather than per-object, because being a record is not
#: a licence to hide arbitrary content. These three are the only excluded names
#: any schema in this family declares below a record's root -- a node's and an
#: edge's `hash_rules_id`, `content_hash` and `created_at`, and a `Quantity`
#: envelope's `created_at` -- and each is a key whose being dropped cannot hide a
#: difference: the marker is one fixed known id, a `created_at` is excluded
#: everywhere by design, and a `content_hash` is recomputed from the record's own
#: contents by the graph checks, so an edited one is caught there rather than
#: hidden here.
#:
#: This must stay identical to `EMBEDDED_RECORD_EXEMPT_KEYS` in
#: src/study/hashing.ts.
EMBEDDED_RECORD_EXEMPT_KEYS: frozenset[str] = frozenset(
    {STUDY_HASH_RULES_KEY, "content_hash", "created_at"}
)

_EXCLUDED_BY_RULES_ID = {STUDY_HASH_RULES_ID: STUDY_EXCLUDED_KEYS}

#: The largest integer JavaScript represents exactly: 2**53 - 1.
#:
#: Above it a JSON number stops meaning the same thing in the two languages. This
#: one holds the integer as written; JavaScript reads the nearest double, so the
#: ordinary 64-bit seed a Stim or NumPy run reports -- 13835058055282163712 --
#: comes back as 13835058055282164000 there, and near 4.2e21 a single double
#: stands for 524287 distinct integers at once. The canonical forms differ and so
#: do the digests, and no rendering rule reconciles them, because the value the
#: other side holds is not the value that was written.
#:
#: This must stay identical to `Number.MAX_SAFE_INTEGER` as `src/study/hashing.ts`
#: uses it.
JS_MAX_SAFE_INTEGER = 9007199254740991


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


def _is_embedded_record(value: dict[str, Any]) -> bool:
    """Where one record ends and another begins.

    The exclusions are meant to bite at a record's own top level and only there:
    that is where `created_at`, `status` and `id` annotate the record rather than
    describe it. One level down they are content, so the walk below has to know
    which objects are a top level of their own. Two markers say so: a
    study-family record names its own hash rules, and a `Quantity` -- or the
    `TextField` built on the same envelope -- pairs a value with the evidence
    class that qualifies it.

    A marker that names no rule set this build knows is not a marker.
    `study_rules_id_of` refuses such an id at a record's own root, and an object
    below a root cannot be a study record on weaker evidence than a record at
    one: an arbitrary string in this field would otherwise buy an object the same
    exemption a real record has.

    This must stay identical to `isEmbeddedRecord` in src/study/hashing.ts.
    """
    recorded = value.get(STUDY_HASH_RULES_KEY)
    if isinstance(recorded, str):
        return recorded in _EXCLUDED_BY_RULES_ID
    return "evidence" in value and "value" in value


def _find_nested_excluded_key(
    value: Any, path: str, at_record_root: bool, excluded: frozenset[str]
) -> str | None:
    """The first path, if any, at which the canonicalizer would silently drop data.

    Depth-first and first-hit rather than exhaustive: the refusal has to name one
    path a reader can go and look at, and a record with one such key almost
    always has one such key.
    """
    if isinstance(value, list):
        for index, item in enumerate(value):
            found = _find_nested_excluded_key(item, f"{path}[{index}]", False, excluded)
            if found is not None:
                return found
        return None
    if not isinstance(value, dict):
        return None

    # None means every excluded key is exempt, which is true only at a record's
    # own root -- the one place `id`, `slug` and `status` are annotation rather
    # than content.
    exempt: frozenset[str] | None
    if at_record_root:
        exempt = None
    elif _is_embedded_record(value):
        exempt = EMBEDDED_RECORD_EXEMPT_KEYS
    else:
        exempt = frozenset()
    for key, item in value.items():
        here = f"{path}.{key}" if path else key
        if exempt is not None and key in excluded and key not in exempt:
            return here
        found = _find_nested_excluded_key(item, here, False, excluded)
        if found is not None:
            return found
    return None


def assert_no_nested_excluded_keys(
    value: dict[str, Any], rules_id: str | None = None
) -> None:
    """Refuse a record whose contents hide something the digest would drop.

    The exclusion set is applied at every nesting level by the shared
    canonicalizer, which is what a record's *own* `created_at` and `status` need
    and what a key chosen at run time cannot survive: a dependency genuinely
    named `id`, or a hardware key named `visibility`, is dropped before the
    digest is taken. Two capsules recording different environments then hash
    identically, and one can be handed the other's environment while still
    verifying against its own hash. No study record has such a key any more --
    `StudyEnvironment` records a package name in a field rather than in a key
    precisely so that none does -- but this function takes a dict, not a
    validated record, and for a caller who only has Python it is the whole check.

    Keeping such a key would mean a second canonical form, and there is
    deliberately only one. So the record is refused instead, by walking the
    actual data.

    This must stay identical to `assertNoNestedExcludedKeys` in
    src/study/hashing.ts; the parity fixtures fail if it drifts.
    """
    resolved = study_rules_id_of(value) if rules_id is None else rules_id
    offending = _find_nested_excluded_key(value, "", True, _excluded_for(resolved))
    if offending is None:
        return
    name = offending.rsplit(".", 1)[-1]
    raise ValueError(
        f"A study record must not carry an excluded key below its own top level: {offending} is named "
        f'"{name}", and {resolved} drops that name at every nesting level. The value would be gone before '
        "the digest was taken, so two records differing only there would be content-addressed identically. "
        "Rename the field -- this is refused rather than hashed into a digest that omits it."
    )


def _describe_unrepresentable(value: Any, path: str) -> str | None:
    """Why a value can be unhashable even though both languages will read it.

    Two cases, one rule: a study digest is only worth anything if the two
    implementations of the canonical form produce the same bytes for the same
    file, and these are the values for which they cannot.

    **An integer outside ±JS_MAX_SAFE_INTEGER.** Above 2**53 a JSON number is an
    arbitrary-precision integer here and an IEEE-754 double there, and the
    mapping stops being injective: near 4.2e21 one double stands for 524287
    distinct integers, so two research packages whose reported figure differs by
    half a million canonicalize to one string and take one digest in JavaScript,
    while this language computes a different digest from the same bytes. A
    ``float`` that is integral counts too, and for the same reason: JavaScript
    cannot tell it from the integers around it either, and it is the form the
    JSON in question actually arrives in when the file writes ``4.2e21``.

    **A string carrying an unpaired UTF-16 surrogate.** JavaScript strings are
    sequences of code units and tolerate a lone one; ``JSON.stringify`` escapes
    it and hashes the escape. This language holds the same lone surrogate and
    cannot encode it as UTF-8 at all, so ``calculate_study_hash`` raises rather
    than returning a digest. One record then hashes in one language and crashes
    the verifier in the other, which is worse than two digests: the reader is
    left unable to check the file rather than told the two answers disagree.

    This must stay identical to `describeUnrepresentable` in
    src/study/hashing.ts: the two languages have to refuse the same files and say
    the same thing about them. The one deliberate difference is the number each
    message quotes, because each quotes the value its own language holds -- and
    that they are not the same number is the whole finding.
    """
    if isinstance(value, bool):
        return None
    # Non-finite first: ``float('inf').is_integer()`` is False, so the integer test
    # below waves all three past. ``json.dumps`` writes them as bare ``Infinity`` and
    # ``NaN``, which is not JSON, and JavaScript canonicalizes all three to ``null``,
    # so three distinct values would share one digest there.
    if isinstance(value, float) and not math.isfinite(value):
        return (
            f"{path} is {value}, which is not a finite number. JavaScript canonicalizes "
            "Infinity, -Infinity and NaN all to `null`, so three different values would share one digest, and "
            "Python writes them as bare `inf` and `nan`, which is not JSON and which JavaScript cannot read back. "
            "A measurement that overflowed or divided by zero is not a value: record what is known, or record "
            "UNKNOWN, which this family represents explicitly."
        )
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
        if abs(value) <= JS_MAX_SAFE_INTEGER:
            return None
        rendered = str(int(value)) if isinstance(value, int) else repr(value)
        return (
            f"{path} is {rendered}, an integer outside ±Number.MAX_SAFE_INTEGER "
            f"({JS_MAX_SAFE_INTEGER}). A number that size cannot be represented exactly in JavaScript, which "
            "reads it as the nearest double, and many distinct integers share that one double; Python holds the "
            "integer as written. So two candidate values canonicalize to one, nothing on the JavaScript side can "
            "tell which was meant, and the same file hashes to two different digests depending on which language "
            "read it. Refusing is the honest answer: a digest that could stand for either value identifies neither. "
            "Record the number as a string in a field that is not this one, or as a hash of the thing it counts."
        )
    if isinstance(value, str) and any("\ud800" <= character <= "\udfff" for character in value):
        return (
            f"{path} contains an unpaired UTF-16 surrogate. Half a character is not a character: JavaScript escapes "
            "it and hashes the escape, while Python cannot encode it as UTF-8 at all and raises instead of returning "
            "a digest, so the verifier that reads the file second fails on bytes the first accepted. A byte sequence "
            "neither language can round-trip cannot be hashed identically in both, so it is refused here rather than "
            "hashed in one language and unreadable in the other. Remove the surrogate, or write the character it was "
            "half of."
        )
    return None


def _find_unrepresentable_value(
    value: Any, path: str, excluded: frozenset[str]
) -> str | None:
    """The first value, if any, the two canonicalizers would not agree about.

    Depth-first and first-hit, for `_find_nested_excluded_key`'s reason: the
    refusal has to name one path a reader can go and look at. Keys are checked as
    strings too -- a key is encoded into the canonical form exactly as a value
    is, and a surrogate in one breaks this language's encoder in the same place.

    Excluded keys are skipped exactly as `_canonicalize` skips them, so this asks
    only about the bytes that get hashed rather than about the record's
    annotations: a `created_at` never reaches either canonical form, so it cannot
    make them differ, and refusing a record for something the digest never reads
    would send a caller to change a value that was never in danger.
    """
    if isinstance(value, list):
        for index, item in enumerate(value):
            found = _find_unrepresentable_value(item, f"{path}[{index}]", excluded)
            if found is not None:
                return found
        return None
    if isinstance(value, dict):
        for key, item in value.items():
            if key in excluded:
                continue
            here = f"{path}.{key}" if path else key
            in_key = _describe_unrepresentable(key, f"the key at {here}")
            if in_key is not None:
                return in_key
            found = _find_unrepresentable_value(item, here, excluded)
            if found is not None:
                return found
        return None
    return _describe_unrepresentable(value, path or "(root)")


def assert_no_unrepresentable_values(
    value: dict[str, Any], rules_id: str | None = None
) -> None:
    """Refuse a record carrying a value the two languages would hash differently.

    The rule lives in the hashing layer, in the class, rather than on the fields
    that happened to meet it first. `seed` and `resource_limits.max_memory_bytes`
    were enumerated in `study_validation.py` and bounded individually in
    `src/study/capsule.ts`, and every other hashed number was unguarded --
    including `Quantity.value`, which is every number a study reports. So a
    package could report a figure 524286 apart from another one and take the same
    digest there, while this language refused the honest file the TypeScript
    builder had just written, because the enumeration named the same two fields
    on both sides and neither named the one that mattered.

    One rule in one place is what fixes that: every study digest is taken over
    `canonical_study_json`, so a record kind added tomorrow, and a field added to
    one that exists today, are covered without anybody remembering to bound them.
    This must stay identical to `assertNoUnrepresentableValues` in
    src/study/hashing.ts, so the two languages refuse the same files.
    """
    resolved = study_rules_id_of(value) if rules_id is None else rules_id
    offending = _find_unrepresentable_value(value, "", _excluded_for(resolved))
    if offending is None:
        return
    raise ValueError(
        f"A study record must not carry a value the two languages hash differently: {offending}"
    )


def canonical_study_json(value: dict[str, Any], rules_id: str | None = None) -> str:
    """The canonical form of a study record.

    The rules id defaults to the one the record itself declares rather than to
    the current id: hashing a record under rules it does not name is how a
    verifier ends up comparing two different algorithms and blaming the record.

    Both refusals live here rather than at each call site because every study
    digest is taken over this string, exactly as in TypeScript:
    `calculate_study_hash` and the validators above it inherit them by
    construction.
    """
    resolved = study_rules_id_of(value) if rules_id is None else rules_id
    assert_no_nested_excluded_keys(value, resolved)
    assert_no_unrepresentable_values(value, resolved)
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

    **A record carrying both is refused**, which is the same fact turned against
    this function. Neither field is hashed, so a second one costs nothing to add
    to a finished record, and a verifier that preferred one and ignored the other
    would report the record intact on the strength of a field nobody hashed.
    Nothing has validated this dict against a schema when this runs -- and for a
    caller who only has Python, nothing will -- so the ambiguity is refused here
    rather than resolved by precedence. This must stay identical to
    `verifyStudyRecordHash` in src/study/hashing.ts.
    """
    rules_id = study_rules_id_of(value)
    content = value.get("content_hash")
    reproducibility = value.get("reproducibility_hash")
    if isinstance(content, str) and isinstance(reproducibility, str):
        raise ValueError(
            "A study record must carry one self-hash field, and this one carries both content_hash and "
            "reproducibility_hash. Neither is part of the digest, so the second could be added to a record "
            "after the fact at no cost, and a verifier that preferred one would report the record intact on "
            "the strength of a field nobody hashed. Remove the one the record kind does not use -- this is "
            "refused rather than resolved by precedence."
        )
    expected = calculate_study_hash(value, rules_id)
    recorded = content if isinstance(content, str) else reproducibility
    return {
        "valid": isinstance(recorded, str) and recorded == expected,
        "rules_id": rules_id,
        "expected": expected,
        "actual": recorded if isinstance(recorded, str) else None,
    }
