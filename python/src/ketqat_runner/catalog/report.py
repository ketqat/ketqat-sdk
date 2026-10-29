"""Opt-in usage reports (`ketqat report RUN_ID`).

A report says only that a product version ran, whether it succeeded, and
when. The payload has exactly six fields and is built here from the run
record, never from the environment:

    {clientReportId, productId, productVersion, status, occurredAt, sdkVersion}

Parameters, inputs, results, file paths, environment variables and host names
are never sent. The command prints the payload before anything is sent and
sends only after the user confirms (or passes `--yes`).

`clientReportId` comes from the run record, where it was fixed when the run
finished, so sending the same report twice is one report on the server.
"""

from __future__ import annotations

import json
from typing import Any

from .records import RunRecord, isoformat, utc_now, runs_directory

USAGE_REPORT_PATH = "/api/v1/usage-reports"
REPORT_FIELDS = ("clientReportId", "productId", "productVersion", "status", "occurredAt", "sdkVersion")


def build_payload(record: RunRecord) -> dict[str, Any]:
    if record.status not in ("succeeded", "failed"):
        raise ValueError(f"Run {record.run_id} has status {record.status!r}; only finished runs are reported.")
    payload = {
        "clientReportId": record.client_report_id,
        "productId": record.product_id,
        "productVersion": record.product_version,
        "status": record.status,
        "occurredAt": record.finished_at,
        "sdkVersion": record.sdk_version,
    }
    assert tuple(payload) == REPORT_FIELDS
    return payload


def send(record: RunRecord, base_url: str) -> Any:
    from .net import request_json

    payload = build_payload(record)
    response = request_json("POST", base_url, USAGE_REPORT_PATH, body=payload)
    receipt = runs_directory() / record.run_id / "report.json"
    receipt.write_text(
        json.dumps({"sentAt": isoformat(utc_now()), "baseUrl": base_url.rstrip("/"), "payload": payload}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    return response
