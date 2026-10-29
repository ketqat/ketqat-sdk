"""The cached Pro entitlement token.

`ketqat pro login` fetches a token from ketqat.com and stores it at
`$KETQAT_HOME/pro/entitlement.token` (mode 0600). That token is the only
thing Pro writes to disk that came from the server's authentication: the API
token used to fetch it stays in the environment (`KETQAT_API_TOKEN`) and is
never written anywhere by the SDK.

The token is checked at the *start* of a Pro run: signature, key ID, tier and
expiry. An expired or missing token refuses the run with the expiry date and
the renewal command; it never deletes or locks existing run records.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..records import ketqat_home
from .signing import SignatureError, b64url_decode, verify_signature

RENEW_COMMAND = "ketqat pro login"
#: Tolerated clock difference for `iat` in the future, in seconds.
CLOCK_SKEW_SECONDS = 300


class EntitlementError(Exception):
    """No usable entitlement. The message says what to do."""


@dataclass(frozen=True)
class Entitlement:
    kid: str
    subject: str
    tier: str
    issued_at: int
    expires_at: int

    def expires_iso(self) -> str:
        return datetime.fromtimestamp(self.expires_at, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    def is_expired(self, now: float | None = None) -> bool:
        return (time.time() if now is None else now) >= self.expires_at


def token_path() -> Path:
    return ketqat_home() / "pro" / "entitlement.token"


def parse_token(token: str) -> Entitlement:
    """Verify the signature and decode the payload. Expiry is *not* checked here."""
    if not isinstance(token, str):
        raise SignatureError("Entitlement token must be text.")
    token = token.strip()
    parts = token.split(".")
    if len(parts) != 2:
        raise SignatureError("Entitlement token must be two base64url segments joined by '.'.")
    payload_bytes = b64url_decode(parts[0], "token payload")
    signature = b64url_decode(parts[1], "token signature")
    try:
        payload: Any = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SignatureError(f"Token payload is not UTF-8 JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise SignatureError("Token payload must be a JSON object.")
    kid = payload.get("kid")
    if not isinstance(kid, str) or not kid:
        raise SignatureError("Token payload has no key ID (kid).")
    verify_signature(kid, payload_bytes, signature)

    if payload.get("v") != 1:
        raise SignatureError(f"Unsupported entitlement token version {payload.get('v')!r}.")
    if payload.get("tier") != "pro":
        raise SignatureError(f"Token tier is {payload.get('tier')!r}, not 'pro'.")
    subject = payload.get("sub")
    issued = payload.get("iat")
    expires = payload.get("exp")
    if not isinstance(subject, str) or not subject:
        raise SignatureError("Token has no subject.")
    for name, value in (("iat", issued), ("exp", expires)):
        if isinstance(value, bool) or not isinstance(value, int):
            raise SignatureError(f"Token field {name} must be an integer Unix time.")
    if expires <= issued:
        raise SignatureError("Token expires before it was issued.")
    return Entitlement(kid=kid, subject=subject, tier="pro", issued_at=issued, expires_at=expires)


def store_token(token: str) -> Path:
    path = token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass  # best effort; the token file itself is created with mode 0600 below
    temporary = path.with_name(".entitlement.token.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="ascii") as stream:
        stream.write(token.strip() + "\n")
    os.replace(temporary, path)
    return path


def load_cached() -> Entitlement:
    """The cached token, verified, whether or not it has expired."""
    path = token_path()
    if not path.is_file():
        raise EntitlementError(
            f"No KetQat Pro entitlement is cached ({path}). Run: {RENEW_COMMAND}"
        )
    try:
        return parse_token(path.read_text(encoding="ascii"))
    except (SignatureError, UnicodeDecodeError) as exc:
        raise EntitlementError(
            f"The cached Pro entitlement at {path} does not verify ({exc}). Run: {RENEW_COMMAND}"
        ) from exc


def require_valid(now: float | None = None) -> Entitlement:
    """The cached entitlement if it is valid now; otherwise a refusal naming the expiry."""
    entitlement = load_cached()
    moment = time.time() if now is None else now
    if entitlement.issued_at > moment + CLOCK_SKEW_SECONDS:
        raise EntitlementError(
            "The cached Pro entitlement is dated in the future; check this machine's clock, "
            f"then run: {RENEW_COMMAND}"
        )
    if entitlement.is_expired(moment):
        raise EntitlementError(
            f"Your KetQat Pro entitlement expired on {entitlement.expires_iso()}. "
            f"Renew it with: {RENEW_COMMAND}\n"
            "Existing run records and results are unaffected."
        )
    return entitlement
