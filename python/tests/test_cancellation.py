"""Typed cancellation (ketqat-sdk#213): four outcomes that must never be conflated."""
from __future__ import annotations

from ketqat_runner.providers.cancellation import (
    CancellationOutcome,
    cancel_refused_adapter_unavailable,
    cancel_refused_missing_credentials,
    classify_vendor_state,
    redact_text,
    vendor_error_outcome,
)


def test_a_completed_job_is_never_reported_cancelled() -> None:
    # Claiming "cancelled" for a job that finished on its own credits the request with
    # an outcome it played no part in.
    for state in ("COMPLETED", "DONE", "FAILED", "CANCELLED", "completed"):
        outcome = classify_vendor_state("braket", "job-1", state)
        assert outcome.status == "already_completed"
        assert "nothing to cancel" in outcome.detail


def test_a_running_job_is_a_request_not_an_interruption() -> None:
    outcome = classify_vendor_state("ibm", "job-2", "RUNNING")
    assert outcome.status == "cancel_requested"
    assert "not interrupted" in outcome.detail
    # And the word "cancelled" alone must not appear as the claim.
    assert outcome.status != "cancelled"


def test_a_queued_job_cancels_outright() -> None:
    for state in ("QUEUED", "PENDING", "CREATED"):
        assert classify_vendor_state("braket", "j", state).status == "cancelled"


def test_missing_credentials_is_a_typed_refusal_not_an_error() -> None:
    outcome = cancel_refused_missing_credentials("braket", "job-3")
    assert outcome.status == "not_run"
    assert "refusal, not a failure" in outcome.detail
    assert outcome.redacted_error is None
    # Round-trips as a record, so it can be stored like any other outcome.
    assert outcome.to_dict()["status"] == "not_run"


def test_adapter_unavailable_names_the_fix() -> None:
    outcome = cancel_refused_adapter_unavailable("ibm", "job-4", 'pip install -e "python[ibm]"')
    assert outcome.status == "not_run"
    assert "pip install" in outcome.detail


def test_vendor_error_redacts_a_message_that_actually_contains_secrets() -> None:
    # The trap the issue names: testing redaction against a benign string proves
    # nothing. This message carries four real credential shapes, embedded in the text
    # where key-based redaction cannot reach them.
    error = RuntimeError(
        "cancel failed for arn:aws:braket:us-east-1:123456789012:quantum-task/abc "
        "using AKIAIOSFODNN7REALKEY with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 "
        "api_key=sk_live_definitely_secret and token kq_0123456789abcdef"
    )
    outcome = vendor_error_outcome("braket", "job-5", error)
    text = str(outcome.to_dict())
    assert "AKIAIOSFODNN7REALKEY" not in text
    assert "kq_0123456789abcdef" not in text
    assert "sk_live_definitely_secret" not in text
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in text
    assert "[redacted]" in text
    # And the outcome claims no state change, since the request failed.
    assert outcome.status == "not_run"


def test_redact_text_leaves_ordinary_text_useful() -> None:
    plain = "Device arn:aws:braket:::device/qpu/ionq/Harmony is offline until Tuesday"
    assert redact_text(plain) == plain
