from __future__ import annotations

import hashlib
from typing import Any

EXCLUDED_KEYS = {
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


def _canonicalize(value: Any) -> Any:
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _canonicalize(value[key])
            for key in sorted(value.keys())
            if key not in EXCLUDED_KEYS and value[key] is not None
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


def canonical_research_json(value: dict[str, Any]) -> str:
    return _encode(_canonicalize(value))


def calculate_reproducibility_hash(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_research_json(value).encode("utf-8")).hexdigest()
