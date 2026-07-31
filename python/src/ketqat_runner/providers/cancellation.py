"""Typed cancellation outcomes for provider jobs (ketqat-sdk#213).

Cancellation is the operation where an untyped answer lies most easily. "Cancelled"
covers four situations that must never be conflated, because three of them are not
cancellation at all:

* ``cancelled`` -- the job was still queued and is now gone.
* ``cancel_requested`` -- the job is running; the request is recorded and the vendor
  stops it at its next transition. Reporting this as "cancelled" would be untrue: a
  worker mid-execution was not interrupted.
* ``already_completed`` -- there is nothing to cancel, and saying "cancelled" would
  claim credit for an outcome the cancel played no part in.
* ``not_run`` -- the request could not be made (missing credentials, adapter not
  installed). Absent credentials produce a typed refusal, never an exception a caller
  has to parse, and never a fabricated success.

Every error attached to an outcome passes through :func:`~.base.redact` first, because a
vendor exception message can carry the very token that authorised the request.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

import re

from .base import redact, utc_now

CancellationStatus = Literal["cancelled", "cancel_requested", "already_completed", "not_run"]

#: Vendor job states with nothing left to cancel.
TERMINAL_STATES = frozenset({"COMPLETED", "DONE", "FAILED", "ERROR", "CANCELLED"})


@dataclass
class CancellationOutcome:
    provider: str
    job_id: str
    status: CancellationStatus
    detail: str
    requested_at: str = field(default_factory=utc_now)
    #: Redacted vendor error, present only when the vendor call itself failed.
    redacted_error: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "job_id": self.job_id,
            "status": self.status,
            "detail": self.detail,
            "requested_at": self.requested_at,
            "redacted_error": self.redacted_error,
        }


def cancel_refused_missing_credentials(provider: str, job_id: str) -> CancellationOutcome:
    return CancellationOutcome(
        provider, job_id, "not_run",
        "No credentials available, so no cancellation request was made. This is a refusal, "
        "not a failure: nothing was attempted, and nothing is reported as stopped.",
    )


def cancel_refused_adapter_unavailable(provider: str, job_id: str, install_hint: str) -> CancellationOutcome:
    return CancellationOutcome(
        provider, job_id, "not_run",
        f"The {provider} SDK is not installed, so no request was made. {install_hint}",
    )


def classify_vendor_state(provider: str, job_id: str, vendor_state: str) -> CancellationOutcome:
    """Map a vendor-reported job state to the truthful cancellation outcome.

    The mapping is the point: a terminal job yields ``already_completed`` -- claiming
    "cancelled" for a job that finished on its own would credit the cancel with an
    outcome it played no part in -- and a running job yields ``cancel_requested``,
    because the worker was not interrupted and saying it stopped would be untrue.
    """
    state = vendor_state.upper()
    if state in TERMINAL_STATES:
        return CancellationOutcome(
            provider, job_id, "already_completed",
            f"The job is already in terminal state {state}; there is nothing to cancel. "
            "Reporting 'cancelled' here would claim an outcome the request played no part in.",
        )
    if state in {"QUEUED", "CREATED", "PENDING", "INITIALIZING"}:
        return CancellationOutcome(
            provider, job_id, "cancelled",
            f"The job was still {state.lower()} and was cancelled outright.",
        )
    return CancellationOutcome(
        provider, job_id, "cancel_requested",
        f"The job is {state.lower()}; the request is recorded and the vendor stops it at "
        "its next transition. The worker was not interrupted, so it is not reported as stopped.",
    )


#: Credential shapes that appear inside vendor error *messages*. Key-based redaction
#: cannot reach these, because the secret is embedded in a string value under an
#: innocent key -- which is exactly how tokens leak through error handlers.
_SECRET_TEXT_PATTERNS = (
    re.compile(r"kq_[A-Za-z0-9]{8,}"),                       # KetQat API tokens
    re.compile(r"AKIA[0-9A-Z]{16}"),                          # AWS access key ids
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]{16,}"),      # Authorization headers
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[=:]\s*\S+"),
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}"),  # JWTs
)


def redact_text(text: str) -> str:
    """Mask credential-shaped substrings inside free text."""
    for pattern in _SECRET_TEXT_PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text


def vendor_error_outcome(provider: str, job_id: str, error: Exception) -> CancellationOutcome:
    """A vendor call that raised, with the error redacted before it is carried.

    Vendor exceptions interpolate request context -- an Authorization header, an
    account ARN, the token that authorised the call -- into their *message*. Key-based
    redaction cannot reach a secret embedded in a string value, so the message and args
    are scrubbed by pattern before the structure passes through key-based redact.
    """
    return CancellationOutcome(
        provider, job_id, "not_run",
        f"The cancellation request failed with {type(error).__name__}; no state change is claimed.",
        redacted_error=redact({
            "type": type(error).__name__,
            "message": redact_text(str(error)),
            "args": [redact_text(str(a)) for a in error.args],
        }),
    )
