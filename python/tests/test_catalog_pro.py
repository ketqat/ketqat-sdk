"""Pro entitlement, signed bundles and opt-in usage reports, end to end.

A local HTTP server stands in for ketqat.com. It signs entitlement tokens and
bundle manifests with the test key `ketqat-test-2026-10`:

- If `KETQAT_TEST_ENTITLEMENT_KEY_PEM` names the test private key (kept outside
  the repository), that key signs, and the committed public key is checked to
  match it.
- Otherwise an ephemeral key is generated and registered under the same kid
  for the duration of the test. The verification code paths are identical.

Either way the SDK honours the key only because the test sets
`KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS=1`; a test below checks that it does not
without it.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

pytest.importorskip("cryptography")
np = pytest.importorskip("numpy")

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from ketqat_runner import catalog  # noqa: E402
from ketqat_runner.catalog.pro import keys  # noqa: E402

KID = "ketqat-test-2026-10"
PRODUCT_ID = "kq.qinfo.channel-analysis"
VERSION = "1.0.0"
API_TOKEN = "kq_test_token_for_the_fake_server"

BUNDLE_MAIN = '''
import numpy as np
from helper import trace_preservation_error


def validate(params):
    if params["report_format"] not in ("json", "markdown"):
        raise ValueError("bad format")


def run(params, seed):
    kraus = np.load(params["kraus_file"])
    error = trace_preservation_error(kraus)
    return {"cptp": {"trace_preserving": bool(error < params["tolerance"]), "tp_deviation": error}}
'''

BUNDLE_HELPER = '''
import numpy as np


def trace_preservation_error(kraus):
    total = sum(k.conj().T @ k for k in kraus)
    return float(np.max(np.abs(total - np.eye(total.shape[0]))))
'''


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _raw_public(private_key: Ed25519PrivateKey) -> bytes:
    return private_key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


@pytest.fixture
def signing_key(monkeypatch) -> Ed25519PrivateKey:
    pem_path = os.environ.get("KETQAT_TEST_ENTITLEMENT_KEY_PEM")
    if pem_path:
        key = serialization.load_pem_private_key(Path(pem_path).read_bytes(), password=None)
        assert _b64url(_raw_public(key)) == keys.TEST_KEYS[KID], "committed test public key does not match the PEM"
    else:
        key = Ed25519PrivateKey.generate()
        monkeypatch.setitem(keys.TEST_KEYS, KID, _b64url(_raw_public(key)))
    monkeypatch.setenv("KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS", "1")
    return key


@pytest.fixture(autouse=True)
def _environment(tmp_path, monkeypatch):
    monkeypatch.setenv("KETQAT_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("KETQAT_API_TOKEN", API_TOKEN)
    monkeypatch.delenv("KETQAT_TOKEN", raising=False)
    monkeypatch.delenv("KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS", raising=False)


def make_token(
    key: Ed25519PrivateKey,
    *,
    exp_offset: int = 7 * 86400,
    iat_offset: int = -60,
    tier: str = "pro",
    kid: str = KID,
) -> str:
    now = int(time.time())
    payload = json.dumps(
        {"v": 1, "kid": kid, "sub": "user_123", "tier": tier, "iat": now + iat_offset, "exp": now + exp_offset},
        separators=(",", ":"),
    ).encode()
    return f"{_b64url(payload)}.{_b64url(key.sign(payload))}"


def make_bundle(key: Ed25519PrivateKey, *, tamper: bool = False, version: str = VERSION) -> dict:
    files = {"main.py": BUNDLE_MAIN.encode(), "helper.py": BUNDLE_HELPER.encode()}
    manifest = {
        "productId": PRODUCT_ID,
        "version": version,
        "sha256": {path: hashlib.sha256(content).hexdigest() for path, content in files.items()},
        "kid": KID,
    }
    message = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    if tamper:
        files["helper.py"] += b"\n# modified after signing\n"
    return {
        "manifest": manifest,
        "signature": _b64url(key.sign(message)),
        "files": {path: base64.b64encode(content).decode() for path, content in files.items()},
    }


class FakeKetQat:
    def __init__(self) -> None:
        self.token = ""
        self.bundle: dict = {}
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

            def _authorised(self) -> bool:
                if self.headers.get("Authorization") != f"Bearer {API_TOKEN}":
                    self._reply(401, {"error": "unauthorised"})
                    return False
                return True

            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}")
                fake.requests.append(("POST", self.path, dict(self.headers)))
                if not self._authorised():
                    return
                if self.path == "/api/v1/pro/entitlement":
                    self._reply(200, {"token": fake.token})
                elif self.path == "/api/v1/usage-reports":
                    allowed = {"clientReportId", "productId", "productVersion", "status", "occurredAt", "sdkVersion"}
                    if set(body) != allowed:
                        self._reply(400, {"error": "unexpected fields"})
                        return
                    duplicate = any(r["clientReportId"] == body["clientReportId"] for r in fake.reports)
                    if not duplicate:
                        fake.reports.append(body)
                    self._reply(200 if duplicate else 201, {"duplicate": duplicate})
                else:
                    self._reply(404, {"error": "not found"})

            def do_GET(self) -> None:  # noqa: N802
                fake.requests.append(("GET", self.path, dict(self.headers)))
                if not self._authorised():
                    return
                if self.path == f"/api/v1/pro/bundles/{PRODUCT_ID}/{VERSION}":
                    self._reply(200, fake.bundle)
                else:
                    self._reply(404, {"error": "not found"})

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


def _kraus_file(tmp_path: Path) -> str:
    gamma = 0.1
    kraus = np.array([[[1, 0], [0, np.sqrt(1 - gamma)]], [[0, np.sqrt(gamma)], [0, 0]]], dtype=complex)
    path = tmp_path / "amplitude_damping.npy"
    np.save(path, kraus)
    return str(path)


def _bundle_dir() -> Path:
    return catalog.ketqat_home() / "pro" / PRODUCT_ID / VERSION


# ---------------------------------------------------------------------- the flow


def test_valid_entitlement_installs_and_runs(signing_key, tmp_path, monkeypatch, capsys) -> None:
    with FakeKetQat() as server:
        server.token = make_token(signing_key)
        server.bundle = make_bundle(signing_key)

        code, out, err = _cli(monkeypatch, capsys, "pro", "login", "--base-url", server.base_url)
        assert code == 0, err
        cached = catalog.ketqat_home() / "pro" / "entitlement.token"
        assert cached.read_text().strip() == server.token
        assert oct(cached.stat().st_mode & 0o777) == "0o600"
        # Nothing on disk holds the API token.
        for path in catalog.ketqat_home().rglob("*"):
            if path.is_file():
                assert API_TOKEN not in path.read_text(errors="ignore")

        code, out, err = _cli(monkeypatch, capsys, "pro", "status")
        assert code == 0 and "valid" in out

        code, out, err = _cli(monkeypatch, capsys, "pro", "install", "quantum-channel-analysis", "--base-url", server.base_url)
        assert code == 0, err
        assert (_bundle_dir() / "files" / "main.py").is_file()

    # The run itself needs no server: the server is shut down above.
    record = catalog.run("quantum-channel-analysis@1.0.0", seed=1, kraus_file=_kraus_file(tmp_path))
    assert record.status == "succeeded"
    assert record.result["cptp"]["trace_preserving"] is True
    assert record.environment["packages"]["cryptography"] != "not-installed"
    assert not list((_bundle_dir() / "files").rglob("__pycache__")), "running must not write into the signed bundle"
    # Parameters are still checked against the catalog definition before the bundle runs.
    with pytest.raises(catalog.ParameterError, match="does not accept"):
        catalog.run("quantum-channel-analysis", kraus_file=_kraus_file(tmp_path), unknown=1)


def test_tampered_bundle_file_is_rejected_and_nothing_is_written(signing_key, monkeypatch, capsys) -> None:
    with FakeKetQat() as server:
        server.token = make_token(signing_key)
        server.bundle = make_bundle(signing_key, tamper=True)
        assert _cli(monkeypatch, capsys, "pro", "login", "--base-url", server.base_url)[0] == 0
        code, out, err = _cli(monkeypatch, capsys, "pro", "install", PRODUCT_ID, "--base-url", server.base_url)
    assert code == 1
    assert "does not match its signed sha256" in err
    assert not _bundle_dir().exists()


def test_bundle_with_a_bad_signature_is_rejected(signing_key, monkeypatch, capsys) -> None:
    impostor = Ed25519PrivateKey.generate()
    with FakeKetQat() as server:
        server.token = make_token(signing_key)
        server.bundle = make_bundle(impostor)
        assert _cli(monkeypatch, capsys, "pro", "login", "--base-url", server.base_url)[0] == 0
        code, out, err = _cli(monkeypatch, capsys, "pro", "install", PRODUCT_ID, "--base-url", server.base_url)
    assert code == 1
    assert "signature" in err.lower()
    assert not _bundle_dir().exists()


def test_entitlement_token_with_a_bad_signature_is_not_stored(signing_key, monkeypatch, capsys) -> None:
    impostor = Ed25519PrivateKey.generate()
    with FakeKetQat() as server:
        server.token = make_token(impostor)
        code, out, err = _cli(monkeypatch, capsys, "pro", "login", "--base-url", server.base_url)
    assert code == 1 and "did not verify" in err
    assert not (catalog.ketqat_home() / "pro" / "entitlement.token").exists()


def test_expired_entitlement_refuses_the_run_but_keeps_records(signing_key, tmp_path, monkeypatch, capsys) -> None:
    from ketqat_runner.catalog.pro import entitlement

    with FakeKetQat() as server:
        server.token = make_token(signing_key)
        server.bundle = make_bundle(signing_key)
        assert _cli(monkeypatch, capsys, "pro", "login", "--base-url", server.base_url)[0] == 0
        assert _cli(monkeypatch, capsys, "pro", "install", PRODUCT_ID, "--base-url", server.base_url)[0] == 0

    kraus = _kraus_file(tmp_path)
    earlier = catalog.run("quantum-channel-analysis", seed=1, kraus_file=kraus)
    before = earlier.path.read_bytes()

    expired = make_token(signing_key, iat_offset=-8 * 86400, exp_offset=-3600)
    entitlement.store_token(expired)
    expiry = entitlement.parse_token(expired).expires_iso()

    with pytest.raises(catalog.CatalogError) as excinfo:
        catalog.run("quantum-channel-analysis", seed=1, kraus_file=kraus)
    message = str(excinfo.value)
    assert f"expired on {expiry}" in message and "ketqat pro login" in message

    code, out, err = _cli(
        monkeypatch, capsys, "catalog", "run", "quantum-channel-analysis", "-p", f"kraus_file={kraus}"
    )
    assert code == 1 and "expired on" in err and "ketqat pro login" in err

    assert earlier.path.read_bytes() == before
    assert [r.run_id for r in catalog.list_records()] == [earlier.run_id]
    assert _cli(monkeypatch, capsys, "runs", "show", earlier.run_id)[0] == 0
    assert _cli(monkeypatch, capsys, "pro", "status")[0] == 1


def test_missing_entitlement_names_the_login_command(signing_key, tmp_path) -> None:
    with pytest.raises(catalog.CatalogError, match="ketqat pro login"):
        catalog.run("quantum-channel-analysis", kraus_file=_kraus_file(tmp_path))


def test_installed_file_modified_after_install_is_refused(signing_key, tmp_path, monkeypatch, capsys) -> None:
    with FakeKetQat() as server:
        server.token = make_token(signing_key)
        server.bundle = make_bundle(signing_key)
        assert _cli(monkeypatch, capsys, "pro", "login", "--base-url", server.base_url)[0] == 0
        assert _cli(monkeypatch, capsys, "pro", "install", PRODUCT_ID, "--base-url", server.base_url)[0] == 0
    helper = _bundle_dir() / "files" / "helper.py"
    helper.write_text(helper.read_text() + "\n# local edit\n")
    with pytest.raises(catalog.CatalogError, match="modified after installation"):
        catalog.run("quantum-channel-analysis", kraus_file=_kraus_file(tmp_path))


def test_test_keys_are_ignored_without_the_opt_in(signing_key, monkeypatch) -> None:
    from ketqat_runner.catalog.pro.entitlement import parse_token
    from ketqat_runner.catalog.pro.signing import SignatureError

    token = make_token(signing_key)
    assert parse_token(token).subject == "user_123"
    monkeypatch.delenv("KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS")
    with pytest.raises(SignatureError, match="test key"):
        parse_token(token)


def test_tokens_with_the_wrong_tier_or_an_unknown_kid_are_rejected(signing_key) -> None:
    from ketqat_runner.catalog.pro.entitlement import parse_token
    from ketqat_runner.catalog.pro.signing import SignatureError

    with pytest.raises(SignatureError, match="tier"):
        parse_token(make_token(signing_key, tier="free"))
    with pytest.raises(SignatureError, match="not a trusted"):
        parse_token(make_token(signing_key, kid="someone-else"))
    with pytest.raises(SignatureError):
        parse_token("not-a-token")


def test_bundle_for_another_version_or_with_unsafe_paths_is_rejected(signing_key) -> None:
    from ketqat_runner.catalog.pro.bundle import BundleError, verify_payload

    with pytest.raises(BundleError, match="not the requested"):
        verify_payload(make_bundle(signing_key, version="9.9.9"), PRODUCT_ID, VERSION)
    payload = make_bundle(signing_key)
    payload["manifest"]["sha256"]["../escape.py"] = "0" * 64
    with pytest.raises(BundleError, match="unsafe segment"):
        verify_payload(payload, PRODUCT_ID, VERSION)


def test_production_key_slot_is_empty_until_the_owner_fills_it() -> None:
    assert keys.PRODUCTION_KEYS == {}
    assert list(keys.TEST_KEYS) == [KID]


def test_committed_test_public_key_matches_the_private_key_when_available() -> None:
    pem_path = os.environ.get("KETQAT_TEST_ENTITLEMENT_KEY_PEM")
    if not pem_path:
        pytest.skip("KETQAT_TEST_ENTITLEMENT_KEY_PEM is not set (the private test key is kept outside the repository)")
    key = serialization.load_pem_private_key(Path(pem_path).read_bytes(), password=None)
    assert _b64url(_raw_public(key)) == keys.TEST_KEYS[KID]


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
