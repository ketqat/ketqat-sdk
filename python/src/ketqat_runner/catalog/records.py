"""Local run records (`ketqat.run-record/v1`).

Every catalog run writes `$KETQAT_HOME/runs/<run-id>/record.json`
(`KETQAT_HOME` defaults to `~/.ketqat`). The record is the user's own file on
their own machine. Nothing in this module sends it anywhere, and nothing
deletes it: an expired Pro entitlement stops new Pro runs, never access to old
records.

`resultSha256` is the sha256 of the canonical JSON of `result` (sorted keys,
no whitespace, JavaScript number formatting; see `hashing.canonical_json`).
Results contain no timings, so the same product version, parameters and seed
reproduce the same digest on the same software stack.

`clientReportId` is a random UUID minted when the record is written. It is
used only if the user later runs `ketqat report`, and because it is fixed in
the record, sending the same report twice is recognised by the server as one.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..hashing import canonical_json

RUN_RECORD_SCHEMA = "ketqat.run-record/v1"
RUN_ID_PATTERN = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$")


class RunRecordError(Exception):
    pass


def ketqat_home() -> Path:
    configured = os.environ.get("KETQAT_HOME", "").strip()
    return Path(configured).expanduser() if configured else Path.home() / ".ketqat"


def runs_directory() -> Path:
    return ketqat_home() / "runs"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def new_run_id(moment: datetime) -> str:
    return f"{moment.astimezone(timezone.utc):%Y%m%dT%H%M%SZ}-{secrets.token_hex(4)}"


def result_sha256(result: Any) -> str:
    return hashlib.sha256(canonical_json(result).encode("utf-8")).hexdigest()


@dataclass
class RunRecord:
    run_id: str
    product_id: str
    product_version: str
    parameters: dict[str, Any]
    seed: int | None
    sdk_version: str
    environment: dict[str, Any]
    started_at: str
    finished_at: str
    status: str
    result: Any
    result_sha256: str | None
    client_report_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    error: str | None = None
    path: Path | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "schema": RUN_RECORD_SCHEMA,
            "runId": self.run_id,
            "productId": self.product_id,
            "productVersion": self.product_version,
            "parameters": self.parameters,
            "seed": self.seed,
            "sdkVersion": self.sdk_version,
            "environment": self.environment,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "status": self.status,
            "result": self.result,
            "resultSha256": self.result_sha256,
            "clientReportId": self.client_report_id,
        }
        if self.error is not None:
            data["error"] = self.error
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any], path: Path | None = None) -> "RunRecord":
        if data.get("schema") != RUN_RECORD_SCHEMA:
            raise RunRecordError(f"Unsupported run record schema {data.get('schema')!r}.")
        try:
            return cls(
                run_id=data["runId"],
                product_id=data["productId"],
                product_version=data["productVersion"],
                parameters=data["parameters"],
                seed=data["seed"],
                sdk_version=data["sdkVersion"],
                environment=data["environment"],
                started_at=data["startedAt"],
                finished_at=data["finishedAt"],
                status=data["status"],
                result=data["result"],
                result_sha256=data["resultSha256"],
                client_report_id=data["clientReportId"],
                error=data.get("error"),
                path=path,
            )
        except KeyError as exc:
            raise RunRecordError(f"Run record is missing {exc.args[0]!r}.") from exc

    def verify_result_hash(self) -> bool:
        if self.result_sha256 is None:
            return self.result is None
        return result_sha256(self.result) == self.result_sha256


def _write_atomically(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(text)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def write_record(record: RunRecord) -> Path:
    directory = runs_directory() / record.run_id
    path = directory / "record.json"
    if path.exists():
        raise RunRecordError(f"A run record already exists at {path}; refusing to overwrite it.")
    _write_atomically(path, json.dumps(record.to_dict(), indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    record.path = path
    return path


def record_path(run_id: str) -> Path:
    if not RUN_ID_PATTERN.match(run_id):
        raise RunRecordError(
            f"{run_id!r} is not a run ID. Run IDs look like 20261029T120000Z-1a2b3c4d; "
            "`ketqat runs list` shows yours."
        )
    return runs_directory() / run_id / "record.json"


def load_record(run_id: str) -> RunRecord:
    path = record_path(run_id)
    if not path.is_file():
        raise RunRecordError(f"No run record {run_id} under {runs_directory()}.")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RunRecordError(f"{path} is not valid JSON: {exc}") from exc
    return RunRecord.from_dict(data, path)


def list_records() -> list[RunRecord]:
    """Every readable record, newest first. Unreadable entries are skipped, not deleted."""
    directory = runs_directory()
    if not directory.is_dir():
        return []
    records = []
    for entry in sorted(directory.iterdir(), reverse=True):
        if not RUN_ID_PATTERN.match(entry.name):
            continue
        try:
            records.append(load_record(entry.name))
        except RunRecordError:
            continue
    return records
