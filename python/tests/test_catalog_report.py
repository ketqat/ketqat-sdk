"""Opt-in usage reports, end to end against a local stand-in for ketqat.com.

Until SDK 0.4.0 this file also covered KetQat Pro entitlement tokens and signed
bundles. Those were removed when every catalog product became free and open
source; `ketqat pro` is now a deprecated no-op (tested in test_catalog.py).
"""

from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from ketqat_runner import catalog

API_TOKEN = "kq_test_token_for_the_fake_server"


@pytest.fixture(autouse=True)
def _environment(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("KETQAT_API_TOKEN", API_TOKEN)
    monkeypatch.delenv("KETQAT_TOKEN", raising=False)


class FakeKetQat:
    def __init__(self) -> None:
        self.reports: list[dict] = []
        self.requests: list[tuple[str, str, dict]] = []

    def __enter__(self) -> "FakeKetQat":
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args) -> None:  # noqa: D401 - silence
                pass

            def _reply(self, status: int, body: object) -> None:
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}")
                fake.requests.append(("POST", self.path, dict(self.headers)))
                if self.headers.get("Authorization") != f"Bearer {API_TOKEN}":
                    self._reply(401, {"error": "unauthorised"})
                    return
                if self.path != "/api/v1/usage-reports":
                    self._reply(404, {"error": "not found"})
                    return
                allowed = {"clientReportId", "productId", "productVersion", "status", "occurredAt", "sdkVersion"}
                if set(body) != allowed:
                    self._reply(400, {"error": "unexpected fields"})
                    return
                duplicate = any(r["clientReportId"] == body["clientReportId"] for r in fake.reports)
                if not duplicate:
                    fake.reports.append(body)
                self._reply(200 if duplicate else 201, {"duplicate": duplicate})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self.server.shutdown()
        self.server.server_close()


def _cli(monkeypatch, capsys, *args: str) -> tuple[int, str, str]:
    from ketqat_runner.cli import main

    monkeypatch.setattr(sys, "argv", ["ketqat", *args])
    code = main()
    captured = capsys.readouterr()
    return code, captured.out, captured.err
# ------------------------------------------------------------------ usage reports


def test_report_prints_the_exact_payload_and_sends_only_six_fields(tmp_path, monkeypatch, capsys) -> None:
    record = catalog.run("quantum-phase-estimation", seed=1, phase=0.25, counting_qubits=3, shots=5)
    with FakeKetQat() as server:
        # Not a terminal and no --yes: shows the payload, sends nothing.
        monkeypatch.setattr(sys.stdin, "isatty", lambda: False, raising=False)
        code, out, err = _cli(monkeypatch, capsys, "report", record.run_id, "--base-url", server.base_url)
        assert code == 2 and "Nothing was sent" in err
        assert server.reports == [] and not server.requests

        code, out, err = _cli(monkeypatch, capsys, "report", record.run_id, "--yes", "--base-url", server.base_url)
        assert code == 0, err
        printed = json.loads(out[out.index("{") : out.index("}") + 1])
        assert server.reports == [printed]
        assert set(printed) == {"clientReportId", "productId", "productVersion", "status", "occurredAt", "sdkVersion"}
        assert printed["clientReportId"] == record.client_report_id
        assert printed["productId"] == "kq.algorithms.quantum-phase-estimation"
        assert printed["status"] == "succeeded"

        # Re-sending reuses the clientReportId, so the server counts it once.
        assert _cli(monkeypatch, capsys, "report", record.run_id, "--yes", "--base-url", server.base_url)[0] == 0
        assert len(server.reports) == 1
        sent_bodies = [r for r in server.requests if r[1] == "/api/v1/usage-reports"]
        assert len(sent_bodies) == 2
        assert all(API_TOKEN not in json.dumps(record.to_dict()) for _ in sent_bodies)


def test_report_refuses_plain_http_to_a_remote_host(tmp_path, monkeypatch, capsys) -> None:
    record = catalog.run("quantum-phase-estimation", seed=1, phase=0.25, counting_qubits=3, shots=5)
    code, out, err = _cli(monkeypatch, capsys, "report", record.run_id, "--yes", "--base-url", "http://example.com")
    assert code == 1 and "https://" in err
