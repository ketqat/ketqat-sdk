"""Publish a local result to a KetQat registry (ketqat-sdk#131).

The runner writes a result file and the registry accepts one, and nothing
connected the two. The documented path was a hand-written `curl` with the token
pasted into the command line.

Three rules shape this module.

**A token is never a command-line argument.** `argv` is visible in shell
history, in `ps` output to every user on the machine, and in CI logs that are
frequently public. The token is read from the environment and from nowhere else,
and it is never printed, logged, or included in an error message.

**Everything checkable is checked before anything is sent.** The registry
recomputes the reproducibility hash and refuses a mismatch, which is the right
server behaviour and a poor first experience: the failure arrives after a round
trip, as a 400, describing a hash rather than the reason. The same check runs
locally first, where it can say that the file was edited after the run.

**Publishing is irreversible enough to confirm.** A run pushed to a public
registry has a URL other people may cite. `--dry-run` shows exactly what would
be sent, and the summary names the destination and visibility before the request
goes out.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .hashing import calculate_reproducibility_hash
from .runner_version import SDK_VERSION
from .validation import KetQatValidationError, validate_result


#: The environment variable holding the API token. Deliberately the only source.
TOKEN_ENVIRONMENT_VARIABLE = "KETQAT_API_TOKEN"

DEFAULT_BASE_URL = "https://ketqat.com"

#: Sent on every request, and not optional.
#:
#: ketqat.com sits behind Cloudflare, whose browser-integrity check rejects the
#: default `Python-urllib/3.x` agent with a 403 before the request reaches the
#: application. Verified against production: the default agent gets 403 with
#: Cloudflare error 1010, an explicit agent gets the application's own 401. So
#: publishing would have failed for every user, with an error naming neither the
#: cause nor a fix.
USER_AGENT = f"ketqat-runner/{SDK_VERSION} (+https://ketqat.com)"


class PublishError(Exception):
    """A publish attempt that failed for a reason the caller can act on."""


def load_result(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text()
    except FileNotFoundError as exc:
        raise PublishError(f"No result file at {path}.") from exc
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PublishError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise PublishError(f"{path} must contain a result object, not {type(parsed).__name__}.")
    return parsed


def check_publishable(result: dict[str, Any]) -> None:
    """Run every check the registry will run, before the network is touched.

    The registry's own rejection is correct but arrives as a 400 after a round
    trip. Checking here means the message can say what actually happened -- most
    often that the file was edited after the run, which no server-side message
    can know.
    """
    try:
        validate_result(result)
    except KetQatValidationError as exc:
        raise PublishError(f"This result does not satisfy the result contract: {exc}") from exc

    # No guard for a missing or blank hash: the result contract requires the
    # field and requires it non-empty, so `validate_result` above has already
    # refused both. A branch here would be unreachable, and unreachable code
    # that looks like a safety net is worse than none -- it invites trusting a
    # check that never runs.
    stored = result["reproducibility_hash"]

    recomputed = calculate_reproducibility_hash(result)
    if recomputed != stored:
        raise PublishError(
            "The reproducibility hash does not match this result's contents.\n"
            f"  recorded:   {stored}\n"
            f"  recomputed: {recomputed}\n"
            "The file has been edited since the run produced it. Publish the original, or re-run "
            "the experiment -- the registry recomputes this hash and would refuse the import."
        )

    if result.get("is_demo"):
        raise PublishError(
            "This is a demo record. Demo data is synthetic and marked so it is never read as a "
            "measurement, so it is not publishable to a registry."
        )


def _token() -> str:
    token = os.environ.get(TOKEN_ENVIRONMENT_VARIABLE, "").strip()
    if not token:
        raise PublishError(
            f"No API token. Set {TOKEN_ENVIRONMENT_VARIABLE} in your environment.\n"
            "It is deliberately not a command-line option: arguments are visible in shell history, "
            "in `ps` output to other users, and in CI logs."
        )
    return token


def publish_result(
    result: dict[str, Any],
    *,
    base_url: str = DEFAULT_BASE_URL,
    visibility: str | None = None,
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    """POST a checked result to the registry, returning its response.

    The token is read here rather than passed in, so no caller can accidentally
    put it somewhere it will be logged.
    """
    token = _token()
    payload: dict[str, Any] = {"result": result}
    if visibility is not None:
        payload["visibility"] = visibility

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/runs/import",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "content-type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
            # Quota headers, when the registry sends them, so a script can pace
            # itself without probing.
            for header in ("X-Quota-Limit", "X-Quota-Remaining", "X-Quota-Reset"):
                value = response.headers.get(header)
                if value:
                    body.setdefault("quota", {})[header] = value
            return body
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(detail).get("error", detail)
        except json.JSONDecodeError:
            message = detail
        if exc.code == 403 and "1010" in message:
            raise PublishError(
                "The registry's edge rejected this client before the request reached the "
                "application. That is a browser-integrity check, not an authentication failure. "
                "It should not happen with this runner, which sends an explicit User-Agent."
            ) from exc
        if exc.code == 401:
            raise PublishError(
                f"The registry rejected the token ({TOKEN_ENVIRONMENT_VARIABLE}). It may be revoked "
                "or belong to a different registry."
            ) from exc
        if exc.code == 429:
            raise PublishError(f"Rate limited or over quota: {message}") from exc
        raise PublishError(f"The registry refused this result ({exc.code}): {message}") from exc
    except urllib.error.URLError as exc:
        raise PublishError(f"Could not reach {base_url}: {exc.reason}") from exc


def describe_intent(result: dict[str, Any], base_url: str, visibility: str | None) -> str:
    """What is about to happen, before it happens.

    A run pushed to a public registry gets a URL other people may cite, so the
    destination and visibility are stated rather than assumed.
    """
    return "\n".join(
        [
            f"  name        {result.get('name', 'unnamed run')}",
            f"  suite       {result.get('benchmark_suite')} {result.get('benchmark_suite_version', '')}".rstrip(),
            f"  domain      {result.get('domain')}",
            f"  points      {len(result.get('metric_points') or [])}",
            f"  hash        {result.get('reproducibility_hash')}",
            f"  destination {base_url.rstrip('/')}/api/runs/import",
            f"  visibility  {visibility or 'PUBLIC (registry default)'}",
        ]
    )
