"""Shared types for provider adapters.

Kept separate from any vendor SDK so that importing the contract never pulls in
Qiskit or Braket. A machine with neither installed can still read a snapshot, a
result, or a not-run record produced elsewhere.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

# Execution classes. The distinction is the whole point of recording one: a
# number produced by a simulator and a number produced by a device are different
# kinds of claim, and only the second is a measurement.
ExecutionClass = Literal["HARDWARE", "SIMULATION"]

NOT_RUN_REASONS = (
    "credentials_unavailable",
    "confirmation_declined",
    "provider_unsupported_feature",
    "quota_exhausted",
    "adapter_unavailable",
    "cancelled",
)

# Keys whose values are replaced wherever they appear, at any depth.
_SECRET_KEYS = frozenset(
    {
        "token",
        "apikey",
        "api_key",
        "secret",
        "password",
        "credential",
        "credentials",
        "authorization",
        "access_token",
        "refresh_token",
        "aws_access_key_id",
        "aws_secret_access_key",
        "aws_session_token",
        "ibm_quantum_token",
    }
)


class AdapterUnavailable(RuntimeError):
    """A vendor SDK is not installed.

    Its own type so a caller can tell "this adapter is not installed" from "this
    adapter failed", and offer the install command rather than a traceback.
    """


def redact(value: Any) -> Any:
    """Deep-replace secret-looking values.

    Applied before anything is logged, serialized, or attached to an error. A
    traceback carrying a token is an ordinary accident rather than a lapse in
    discipline, so the defence is a function and not a rule reviewers must
    remember.
    """
    if isinstance(value, dict):
        return {
            key: "[redacted]" if str(key).lower() in _SECRET_KEYS else redact(nested)
            for key, nested in value.items()
        }
    if isinstance(value, (list, tuple)):
        return type(value)(redact(entry) for entry in value)
    return value


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


@dataclass(frozen=True)
class DeviceSnapshot:
    """A dated observation of one device.

    Immutable, and never refreshed in place. A result is interpretable only
    against the calibration it was compiled for, so replacing last week's
    snapshot with today's would silently reinterpret every result recorded
    against it.
    """

    provider: str
    device: str
    observed_at: str
    qubit_count: int
    basis_gates: list[str]
    coupling_map: list[tuple[int, int]]
    #: Whether this device is a simulator as the vendor classifies it. Recorded
    #: rather than inferred from the name, because names change.
    is_simulator: bool
    #: Vendor-reported calibration, as given. Redacted before storage.
    properties: dict[str, Any] = field(default_factory=dict)
    #: Named limitations discovered while reading the device, so a downstream
    #: reader is not left to infer them from an absent field.
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return redact(asdict(self))


@dataclass(frozen=True)
class ProviderResult:
    """A normalized execution result."""

    provider: str
    device: str
    provider_job_id: str
    shots: int
    counts: dict[str, int]
    execution_class: ExecutionClass
    submitted_at: str
    finished_at: str
    #: The snapshot the circuit was compiled against, so the numbers can be read.
    snapshot: DeviceSnapshot | None = None
    #: What translation cost, named rather than silently applied.
    loss_report: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        return redact(payload)


@dataclass(frozen=True)
class NotRunRecord:
    """What is produced when execution legitimately did not happen.

    A distinct type from a result, not a result with empty counts, so no
    consumer can read it as one by looking at a field they happen to share. It
    carries no counts at all -- a zeroed histogram is indistinguishable from a
    measured one once it is in a figure.
    """

    status: Literal["NOT_RUN"]
    reason: str
    provider: str
    device: str
    detail: str
    recorded_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def not_run(provider: str, device: str, reason: str, detail: str) -> NotRunRecord:
    if reason not in NOT_RUN_REASONS:
        raise ValueError(f"unknown not-run reason {reason!r}; expected one of {NOT_RUN_REASONS}")
    return NotRunRecord(
        status="NOT_RUN",
        reason=reason,
        provider=provider,
        device=device,
        detail=detail,
        recorded_at=_now(),
    )


def utc_now() -> str:
    return _now()
