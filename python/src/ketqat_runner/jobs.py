"""Sandboxed execution jobs from the CLI (ketqat-sdk#206).

Item 12 asks for feature parity across API, CLI and MCP, including cancellation. The
REST API and the MCP tools could submit, poll and cancel a job; the CLI could not reach
jobs at all. `CLAUDE.md` in fact described "the CLI's `job` commands" as though they
existed, and the word "job" appeared nowhere in `cli.py` -- documentation standing in
for code, which is the failure the parity test added alongside this exists to catch.

Three properties are carried over from the MCP tool deliberately, because they are what
make a remote-execution surface safe rather than merely convenient.

**Enqueue, never execute.** Nothing here runs a circuit. A CLI that executed locally and
uploaded the answer would produce a registry record with no audit trail and no enforced
limits, indistinguishable from one the sandboxed worker produced.

**Submission requires explicit confirmation, and the default is to refuse.** `--confirm`
is opt-in, and without it the command prints exactly what would run -- backend, qubits,
shots, execution class -- and exits without queueing. A confirmation prompt that omits
the cost is not a confirmation, and a default of "yes" is not a prompt.

**The token comes from the environment only.** Never an argument: arguments are visible
in shell history, in `ps` output to other users, and in CI logs. It is never printed,
and never written to a file.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# Imported rather than redefined. `ketqat publish` already reads the same variables, and a
# second name for `ketqat job` would mean a user who configured one surface of this CLI
# found the other unauthenticated for no reason they could see. That is exactly the defect
# #218 fixed between the two CLIs, so it is not reintroduced within one of them.
from .publish import DEFAULT_BASE_URL, TOKEN_ENVIRONMENT_VARIABLE
from .token_env import AmbiguousApiTokenError, missing_api_token_message, resolve_api_token
DEFAULT_TIMEOUT_SECONDS = 30

#: Terminal states. Polling past one of these waits for something that cannot happen.
TERMINAL_STATES = frozenset({"SUCCEEDED", "FAILED", "CANCELLED"})


class JobError(Exception):
    """A job operation that could not be performed as asked."""


def _token() -> str:
    try:
        token = resolve_api_token()
    except AmbiguousApiTokenError as exc:
        raise JobError(str(exc)) from exc
    if not token:
        raise JobError(missing_api_token_message())
    return token


def _request(
    method: str,
    path: str,
    *,
    base_url: str = DEFAULT_BASE_URL,
    payload: dict[str, Any] | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """One authenticated call, with the token read from the environment."""
    token = _token()
    url = f"{base_url.rstrip('/')}{path}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            text = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        # A job owned by someone else returns 404, not 403, and that is deliberate on the
        # server: a 403 would confirm the id is real and so enumerate other tenants' jobs.
        # The message says so rather than sending someone hunting for a permissions bug.
        if exc.code == 404:
            raise JobError(
                f"No such job, or it is not yours ({url}). The registry returns 404 rather than 403 "
                "for a job you do not own, so these two cases are deliberately indistinguishable."
            ) from exc
        if exc.code == 429:
            raise JobError(
                "Rate limited. Execution endpoints are limited more tightly than the rest of the "
                "API because submitting a job starts a container."
            ) from exc
        raise JobError(f"{method} {path} failed with HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise JobError(f"Could not reach {base_url}: {exc.reason}") from exc

    if not text.strip():
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise JobError(f"{method} {path} returned a response that is not JSON.") from exc
    if not isinstance(parsed, dict):
        raise JobError(f"{method} {path} returned {type(parsed).__name__}, expected an object.")
    return parsed


def describe_submission(
    *,
    operation: str,
    qasm: str,
    shots: int,
    base_url: str = DEFAULT_BASE_URL,
) -> str:
    """What would be queued, printed before anything is.

    Everything a person needs to decide, in the order they need it. Omitting the shot
    count or the execution class would make this a notification rather than a
    confirmation.
    """
    qubits = _declared_qubits(qasm)
    return "\n".join(
        [
            "Would queue a sandboxed execution job:",
            f"  operation       {operation}",
            f"  qubits          {qubits if qubits is not None else 'not declared'}",
            f"  shots           {shots}",
            "  execution class SIMULATION (this worker reaches no hardware)",
            f"  destination     {base_url.rstrip('/')}/api/execution/jobs",
            "",
            "Nothing has been queued. Re-run with --confirm to submit.",
        ]
    )


def _declared_qubits(qasm: str) -> int | None:
    """Qubit count from a `qubit[n]` declaration, or None when absent.

    Reported as absent rather than guessed. A confirmation prompt showing a fabricated
    qubit count is worse than one admitting it does not know.
    """
    import re

    match = re.search(r"qubit\s*\[\s*(\d+)\s*\]", qasm)
    return int(match.group(1)) if match else None


def submit_job(
    *,
    operation: str,
    qasm: str,
    shots: int,
    confirmed: bool,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Queue a job. Refuses unless `confirmed` is true.

    The refusal is not an error condition to be worked around -- it is the safe default,
    matching the MCP tool where `confirmed` defaults to false so a model that omits the
    field cannot thereby submit.
    """
    if not confirmed:
        raise JobError(describe_submission(operation=operation, qasm=qasm, shots=shots, base_url=base_url))
    if shots < 0:
        raise JobError(f"Shots cannot be negative; got {shots}.")
    return _request(
        "POST",
        "/api/execution/jobs",
        base_url=base_url,
        payload={"operation": operation, "qasm": qasm, "shots": shots},
        timeout_seconds=timeout_seconds,
    )


def get_job(job_id: str, *, base_url: str = DEFAULT_BASE_URL, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """One job's current state."""
    if not job_id.strip():
        raise JobError("A job id is required.")
    return _request(
        "GET",
        f"/api/execution/jobs/{urllib.parse.quote(job_id, safe='')}",
        base_url=base_url,
        timeout_seconds=timeout_seconds,
    )


def list_jobs(
    *,
    status: str | None = None,
    limit: int = 20,
    base_url: str = DEFAULT_BASE_URL,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Your jobs, most recent first."""
    query: dict[str, str] = {"limit": str(limit)}
    if status:
        query["status"] = status
    return _request(
        "GET",
        f"/api/execution/jobs?{urllib.parse.urlencode(query)}",
        base_url=base_url,
        timeout_seconds=timeout_seconds,
    )


def cancel_job(job_id: str, *, base_url: str = DEFAULT_BASE_URL, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """Request cancellation.

    A *request*, and the wording matters. A queued job is cancelled outright; a running
    one records the request and stops at its next transition. A worker mid-execution is
    not interrupted, so reporting "cancelled" for a running job would be untrue.
    """
    if not job_id.strip():
        raise JobError("A job id is required.")
    return _request(
        "POST",
        f"/api/execution/jobs/{urllib.parse.quote(job_id, safe='')}/cancel",
        base_url=base_url,
        payload={},
        timeout_seconds=timeout_seconds,
    )


def job_bundle(job_id: str, *, base_url: str = DEFAULT_BASE_URL, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """The reproducibility bundle for a finished job."""
    if not job_id.strip():
        raise JobError("A job id is required.")
    return _request(
        "GET",
        f"/api/execution/jobs/{urllib.parse.quote(job_id, safe='')}/bundle",
        base_url=base_url,
        timeout_seconds=timeout_seconds,
    )


def summarize_job(job: dict[str, Any]) -> str:
    """One job as a few readable lines."""
    state = str(job.get("status") or "UNKNOWN")
    lines = [
        f"  id              {job.get('id', '?')}",
        f"  status          {state}",
        f"  operation       {job.get('operation', '?')}",
    ]
    if job.get("execution_class"):
        lines.append(f"  execution class {job['execution_class']}")
    if job.get("cancel_requested"):
        # Distinct from CANCELLED, and shown separately for that reason.
        lines.append("  cancellation    requested; the worker stops at its next transition")
    if state not in TERMINAL_STATES:
        lines.append(f"  (not terminal -- {', '.join(sorted(TERMINAL_STATES))} are the final states)")
    return "\n".join(lines)
