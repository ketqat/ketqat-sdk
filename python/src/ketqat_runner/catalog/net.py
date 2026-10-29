"""HTTP for the commands that talk to ketqat.com: `report` and `pro`.

Never imported by a Free catalog run. The API token comes from the
environment (`KETQAT_API_TOKEN`, or `KETQAT_TOKEN`; see `token_env`) and is
never printed, logged, written to disk, or put into an error message.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ..endpoints import DEFAULT_BASE_URL
from ..runner_version import SDK_VERSION
from ..token_env import AmbiguousApiTokenError, missing_api_token_message, resolve_api_token

USER_AGENT = f"ketqat-runner/{SDK_VERSION} (+https://ketqat.com)"
TIMEOUT_SECONDS = 30
#: Upper bound on a response body, so a misbehaving server cannot exhaust memory.
MAX_RESPONSE_BYTES = 64 * 1024 * 1024

__all__ = ["DEFAULT_BASE_URL", "ApiError", "api_token", "request_json"]


class ApiError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def api_token() -> str:
    try:
        token = resolve_api_token()
    except AmbiguousApiTokenError as exc:
        raise ApiError(str(exc)) from exc
    if not token:
        raise ApiError(missing_api_token_message())
    return token


def request_json(method: str, base_url: str, path: str, body: Any | None = None) -> Any:
    url = base_url.rstrip("/") + path
    parsed_url = urllib.parse.urlsplit(url)
    loopback = parsed_url.scheme == "http" and parsed_url.hostname in {"127.0.0.1", "localhost", "::1"}
    if not (parsed_url.scheme == "https" or loopback) or not parsed_url.hostname:
        # A token sent over plain HTTP is readable by everyone on the path. Loopback is
        # allowed so a local test server can stand in for ketqat.com.
        raise ApiError(f"Refusing to send a token to {base_url!r}: use an https:// URL.")
    headers = {
        "Authorization": f"Bearer {api_token()}",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 - scheme checked above
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            parsed = json.loads(exc.read(64 * 1024) or b"{}")
            if isinstance(parsed, dict) and isinstance(parsed.get("error"), str):
                detail = f": {parsed['error']}"
        except (json.JSONDecodeError, OSError):
            pass
        hint = {
            401: " Check KETQAT_API_TOKEN.",
            403: " The account has no active KetQat Pro subscription, or the token lacks access.",
            404: " Not found.",
        }.get(exc.code, "")
        raise ApiError(f"{method} {path} returned HTTP {exc.code}{detail}.{hint}", exc.code) from None
    except urllib.error.URLError as exc:
        raise ApiError(f"Could not reach {base_url}: {exc.reason}") from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ApiError(f"{method} {path} returned more than {MAX_RESPONSE_BYTES} bytes; refusing it.")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(f"{method} {path} did not return JSON: {exc}") from None
