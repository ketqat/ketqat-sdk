from __future__ import annotations

import hashlib
import json
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


def canonical_research_json(value: dict[str, Any]) -> str:
    return json.dumps(_canonicalize(value), separators=(",", ":"), ensure_ascii=False)


def calculate_reproducibility_hash(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_research_json(value).encode("utf-8")).hexdigest()
