"""`ketqat pro login` and `ketqat pro install`: the two Pro network calls."""

from __future__ import annotations

import urllib.parse
from pathlib import Path
from typing import Any

from ..net import ApiError, request_json
from .bundle import install
from .entitlement import Entitlement, EntitlementError, parse_token, store_token
from .signing import SignatureError

ENTITLEMENT_PATH = "/api/v1/pro/entitlement"


def login(base_url: str) -> tuple[Entitlement, Path]:
    """Fetch an entitlement token, verify it, and cache it. Returns (entitlement, path)."""
    response: Any = request_json("POST", base_url, ENTITLEMENT_PATH, body={})
    token = response.get("token") if isinstance(response, dict) else None
    if not isinstance(token, str) or not token:
        raise ApiError(f"POST {ENTITLEMENT_PATH} did not return a token.")
    try:
        entitlement = parse_token(token)
    except SignatureError as exc:
        # Not stored: an unverifiable token would only fail later, further from its cause.
        raise EntitlementError(f"The server's entitlement token did not verify: {exc}") from exc
    if entitlement.is_expired():
        raise EntitlementError(f"The server returned a token that expired on {entitlement.expires_iso()}.")
    return entitlement, store_token(token)


def bundle_path(product_id: str, version: str) -> str:
    return (
        f"/api/v1/pro/bundles/{urllib.parse.quote(product_id, safe='')}/"
        f"{urllib.parse.quote(version, safe='')}"
    )


def install_bundle(base_url: str, product_id: str, version: str) -> Path:
    payload = request_json("GET", base_url, bundle_path(product_id, version))
    return install(payload, product_id, version)
