"""HTTP error messages from the catalog client read as one sentence each."""
from __future__ import annotations

import io
import json
import urllib.error

import pytest

from ketqat_runner.catalog import net


def _raise_http_error(status: int, body: dict):
    def fake_urlopen(request, timeout=None):  # noqa: ARG001 - signature mirrors urllib
        raise urllib.error.HTTPError(request.full_url, status, "error", {}, io.BytesIO(json.dumps(body).encode()))
    return fake_urlopen


def test_server_sentence_is_not_followed_by_a_double_period(monkeypatch):
    monkeypatch.setenv("KETQAT_API_TOKEN", "kq_test")
    monkeypatch.setattr(net.urllib.request, "urlopen", _raise_http_error(403, {"error": "An active KetQat Pro subscription is required."}))
    with pytest.raises(net.ApiError) as caught:
        net.request_json("POST", "http://127.0.0.1:9", "/api/v1/pro/entitlement")
    message = str(caught.value)
    assert ".." not in message
    assert "HTTP 403: An active KetQat Pro subscription is required. The account has no active" in message
