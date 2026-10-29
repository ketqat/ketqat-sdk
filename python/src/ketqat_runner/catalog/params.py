"""Check run parameters against a product's declared inputs.

A product definition lists its inputs with a type, optional constraints and an
optional default. That list is the whole interface: a parameter it does not
name is rejected, a parameter of the wrong type is rejected, and a required
parameter that is missing is rejected. Nothing is coerced silently and nothing
falls back to demo values.

Defaults follow the catalog convention: an input with a `default` key is
optional (`null` means "no value", and the input's description says what the
product does then); an input without one is required.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Mapping


class ParameterError(ValueError):
    """Parameters that do not match the product's declared inputs."""


_SCALAR_CHECKS = {
    "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
    "number": lambda value: isinstance(value, (int, float))
    and not isinstance(value, bool)
    and math.isfinite(value),
    "string": lambda value: isinstance(value, str),
    "boolean": lambda value: isinstance(value, bool),
    "path": lambda value: isinstance(value, str) and value != "",
    "object": lambda value: isinstance(value, dict),
}


def _type_ok(kind: str, value: Any) -> bool:
    if kind.endswith("[]"):
        item_kind = kind[:-2]
        return isinstance(value, list) and all(_type_ok(item_kind, item) for item in value)
    return _SCALAR_CHECKS[kind](value)


def _check_constraints(name: str, kind: str, value: Any, constraints: Mapping[str, Any]) -> None:
    def fail(message: str) -> None:
        raise ParameterError(f"Parameter {name!r}: {message}")

    if "enum" in constraints and value not in constraints["enum"]:
        fail(f"{value!r} is not one of {constraints['enum']}.")
    if kind in ("integer", "number"):
        if "minimum" in constraints and value < constraints["minimum"]:
            fail(f"{value} is below the minimum {constraints['minimum']}.")
        if "maximum" in constraints and value > constraints["maximum"]:
            fail(f"{value} is above the maximum {constraints['maximum']}.")
        if "exclusiveMinimum" in constraints and value <= constraints["exclusiveMinimum"]:
            fail(f"{value} must be greater than {constraints['exclusiveMinimum']}.")
    if kind.endswith("[]"):
        if "minItems" in constraints and len(value) < constraints["minItems"]:
            fail(f"needs at least {constraints['minItems']} item(s); got {len(value)}.")
        if "maxItems" in constraints and len(value) > constraints["maxItems"]:
            fail(f"allows at most {constraints['maxItems']} item(s); got {len(value)}.")
        if constraints.get("uniqueItems") and len({json.dumps(item, sort_keys=True) for item in value}) != len(value):
            fail("items must be distinct.")
        for item in value:
            if "itemEnum" in constraints and item not in constraints["itemEnum"]:
                fail(f"item {item!r} is not one of {constraints['itemEnum']}.")
            if "itemMinimum" in constraints and item < constraints["itemMinimum"]:
                fail(f"item {item} is below the minimum {constraints['itemMinimum']}.")
            if "itemMaximum" in constraints and item > constraints["itemMaximum"]:
                fail(f"item {item} is above the maximum {constraints['itemMaximum']}.")
    if kind == "path" and "fileExtensions" in constraints:
        suffix = Path(value).suffix.lower()
        if suffix not in constraints["fileExtensions"]:
            fail(f"file {value!r} must end in one of {constraints['fileExtensions']}.")


def check_value(field: Mapping[str, Any], value: Any) -> None:
    """Raise ParameterError unless `value` is acceptable for the declared input."""
    name = field["name"]
    if value is None:
        if "default" in field and field["default"] is None:
            return
        raise ParameterError(f"Parameter {name!r} does not accept null.")
    kind = field["type"]
    if not _type_ok(kind, value):
        raise ParameterError(f"Parameter {name!r} must be of type {kind}; got {value!r}.")
    _check_constraints(name, kind, value, field.get("constraints") or {})


def resolve_parameters(
    inputs: list[Mapping[str, Any]],
    given: Mapping[str, Any],
    *,
    product_label: str,
) -> dict[str, Any]:
    """Given parameters plus defaults, every one checked. Unknown names are refused."""
    declared = {field["name"]: field for field in inputs}
    unknown = sorted(set(given) - set(declared))
    if unknown:
        accepted = ", ".join(sorted(declared)) or "(none)"
        raise ParameterError(
            f"{product_label} does not accept parameter(s) {', '.join(unknown)}. "
            f"Accepted parameters: {accepted}."
        )
    resolved: dict[str, Any] = {}
    for name, field in declared.items():
        if name in given:
            value = given[name]
        elif "default" in field:
            value = field["default"]
        else:
            raise ParameterError(f"{product_label} requires parameter {name!r}: {field['description']}")
        check_value(field, value)
        resolved[name] = value
    return resolved


def parse_cli_assignments(assignments: list[str], inputs: list[Mapping[str, Any]]) -> dict[str, Any]:
    """`k=v` strings from the command line, typed by the declared inputs.

    A value is read as JSON when it parses (`shots=1000`, `marked=[3,5]`,
    `flag=true`), and otherwise kept as a string, so `preset=bell` needs no
    quoting. A list input also accepts comma-separated items (`marked=3,5`).
    """
    declared = {field["name"]: field for field in inputs}
    parsed: dict[str, Any] = {}
    for assignment in assignments:
        name, separator, raw = assignment.partition("=")
        name = name.strip()
        if not separator or not name:
            raise ParameterError(f"Parameters are given as name=value; got {assignment!r}.")
        if name in parsed:
            raise ParameterError(f"Parameter {name!r} is given more than once.")
        field = declared.get(name)
        kind = field["type"] if field else None
        if kind in ("string", "path"):
            value: Any = raw
        else:
            try:
                value = json.loads(raw)
            except json.JSONDecodeError:
                value = raw
            if kind and kind.endswith("[]") and isinstance(value, (str, int, float)) and not isinstance(value, bool):
                pieces = [piece.strip() for piece in str(raw).split(",") if piece.strip()]
                items: list[Any] = []
                for piece in pieces:
                    if kind == "string[]":
                        items.append(piece)
                        continue
                    try:
                        items.append(json.loads(piece))
                    except json.JSONDecodeError:
                        items.append(piece)
                value = items
        parsed[name] = value
    return parsed
