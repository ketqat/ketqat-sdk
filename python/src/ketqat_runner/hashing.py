from __future__ import annotations

import hashlib
from typing import Any

#: Fields that identify or annotate a record rather than describe the science.
#: Unchanged since version 1, because changing them would change every hash
#: ever published.
IDENTITY_KEYS = frozenset(
    {
        "id",
        "slug",
        "started_at",
        "finished_at",
        "created_at",
        "updated_at",
        "submitted_at",
        "ui_metadata",
        "reproducibility_hash",
        "owner_username",
        "visibility",
    }
)

#: Duration measurements, excluded from version 2 onward.
#:
#: These are why ketqat-sdk#89 existed: the same experiment, run twice from the
#: same seed, produced different hashes -- not because the science differed, but
#: because the run took a different number of milliseconds. A hash that changes
#: when nothing scientific changed is not a reproducibility hash.
#:
#: Enumerated rather than pattern-matched. A rule like "anything ending in
#: _seconds" would silently swallow a future field that genuinely belongs in the
#: hash, and that failure would be invisible.
#:
#: This list must stay identical to `timingKeys` in
#: src/reproducibility/index.ts; the parity fixtures fail if it drifts.
TIMING_KEYS = frozenset(
    {
        "runtime_seconds",
        "decoder_latency_ms",
        "decoder_latency_ms_per_shot",
        "sampling_runtime_seconds",
        "circuit_generation_seconds",
        "decode_runtime_seconds",
        "decoder_construction_seconds",
    }
)

#: The version this build computes when asked for a new hash.
CURRENT_HASH_VERSION = 2

#: Where a record records which rules produced its hash. Never itself hashed.
HASH_VERSION_KEY = "reproducibility_hash_version"

_EXCLUDED_BY_VERSION = {
    1: IDENTITY_KEYS | {HASH_VERSION_KEY},
    2: IDENTITY_KEYS | {HASH_VERSION_KEY} | TIMING_KEYS,
}

#: Retained for callers that imported the version-1 set directly.
EXCLUDED_KEYS = _EXCLUDED_BY_VERSION[1]


def _excluded_for(version: int) -> frozenset[str]:
    try:
        return _EXCLUDED_BY_VERSION[version]
    except KeyError:
        known = ", ".join(str(key) for key in sorted(_EXCLUDED_BY_VERSION))
        raise ValueError(
            f"Unknown reproducibility hash version {version}. Known versions: {known}."
        ) from None


def hash_version_of(value: dict[str, Any]) -> int:
    """Which rules a record was hashed under.

    A record with no marker predates versioning and is version 1 by definition.
    Defaulting to the current version would report every historical record as a
    mismatch, which is the opposite of what versioning is for.
    """
    recorded = value.get(HASH_VERSION_KEY)
    return recorded if isinstance(recorded, int) and not isinstance(recorded, bool) else 1


def _canonicalize(value: Any, excluded: frozenset[str]) -> Any:
    if isinstance(value, list):
        return [_canonicalize(item, excluded) for item in value]
    if isinstance(value, dict):
        return {
            key: _canonicalize(value[key], excluded)
            for key in sorted(value.keys())
            if key not in excluded
        }
    return value


def _format_float(value: float) -> str:
    """Render a float exactly as JavaScript's Number.prototype.toString()/JSON.stringify
    would, so the canonical JSON string -- and therefore the reproducibility hash -- is
    identical whether it was produced by this Python runner or the TypeScript SDK.

    Python's repr()/json.dumps() disagree with JS on two points for the same IEEE-754
    double: (1) Python switches to scientific notation below 1e-4, JS only below 1e-6,
    and (2) Python keeps a trailing ".0" on whole-number floats (e.g. "3.0") while JS
    has no int/float distinction and renders "3". Both languages compute the same
    shortest round-trip *digit sequence* for a given double (required by IEEE 754 /
    ECMA-262), so only the notation and trailing-zero formatting need reconciling here.
    """
    if value == 0:
        return "0"  # JSON.stringify(-0) === "0" in JavaScript too.

    repr_value = repr(value)
    if "e" not in repr_value and "E" not in repr_value:
        return repr_value[:-2] if repr_value.endswith(".0") else repr_value

    mantissa, exponent_part = repr_value.split("e")
    exponent = int(exponent_part)
    negative = mantissa.startswith("-")
    if negative:
        mantissa = mantissa[1:]
    integer_part, _, fraction_part = mantissa.partition(".")
    digits = integer_part + fraction_part

    if -6 <= exponent < 21:
        point_position = len(integer_part) + exponent
        if point_position <= 0:
            result = "0." + ("0" * -point_position) + digits
        elif point_position >= len(digits):
            result = digits + ("0" * (point_position - len(digits)))
        else:
            result = f"{digits[:point_position]}.{digits[point_position:]}"
        if "." in result:
            result = result.rstrip("0").rstrip(".")
        return ("-" if negative else "") + (result or "0")

    sign = "-" if negative else ""
    exponent_sign = "+" if exponent >= 0 else "-"
    return f"{sign}{mantissa}e{exponent_sign}{abs(exponent)}"


def _encode_string(value: str) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)


def _encode(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return _format_float(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return _encode_string(value)
    if isinstance(value, list):
        return "[" + ",".join(_encode(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(f"{_encode_string(key)}:{_encode(item)}" for key, item in value.items()) + "}"
    raise TypeError(f"Unsupported type for canonical reproducibility JSON: {type(value)!r}")


def canonical_research_json(value: dict[str, Any], version: int = CURRENT_HASH_VERSION) -> str:
    return _encode(_canonicalize(value, _excluded_for(version)))


def calculate_reproducibility_hash(
    value: dict[str, Any], version: int = CURRENT_HASH_VERSION
) -> str:
    return hashlib.sha256(
        canonical_research_json(value, version).encode("utf-8")
    ).hexdigest()


def verify_reproducibility_hash(value: dict[str, Any]) -> dict[str, Any]:
    """Recompute a record's hash under the rules it was hashed with.

    Using the current version against an older record compares two different
    algorithms and reports a mismatch that says nothing about the record.
    """
    version = hash_version_of(value)
    expected = calculate_reproducibility_hash(value, version)
    actual = value.get("reproducibility_hash")
    return {
        "valid": isinstance(actual, str) and actual == expected,
        "version": version,
        "expected": expected,
        "actual": actual if isinstance(actual, str) else None,
    }
