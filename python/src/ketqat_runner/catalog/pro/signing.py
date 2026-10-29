"""Ed25519 verification and the encodings around it.

`cryptography` is an optional dependency (`pip install "ketqat[pro]"`). It is
imported inside `verify_signature` so that a missing extra produces one clear
message at the point Pro is used, and nothing at all for Free users.
"""

from __future__ import annotations

import base64
import binascii
import json
from typing import Any

from .keys import trusted_public_key, untrusted_kid_message

PRO_EXTRA_MESSAGE = (
    'KetQat Pro needs the `pro` extra for Ed25519 signature checks. Install it with:\n'
    '  pip install "ketqat[pro] @ git+https://github.com/ketqat/ketqat-sdk@<commit>#subdirectory=python"'
)


class SignatureError(Exception):
    """A token or bundle that does not verify. Never trust its contents."""


class ProDependencyError(RuntimeError):
    pass


def b64url_decode(text: str, label: str) -> bytes:
    if not isinstance(text, str) or not text or any(c not in _B64URL for c in text):
        raise SignatureError(f"{label} is not base64url text.")
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError) as exc:
        raise SignatureError(f"{label} is not valid base64url: {exc}") from exc


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64_decode(text: str, label: str) -> bytes:
    try:
        return base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise SignatureError(f"{label} is not valid base64: {exc}") from exc


_B64URL = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=")


def canonical_manifest_bytes(manifest: dict[str, Any]) -> bytes:
    """The exact bytes a bundle signature covers."""
    return json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def verify_signature(kid: str, message: bytes, signature: bytes) -> None:
    """Raise SignatureError unless `signature` is a valid Ed25519 signature by `kid`."""
    encoded_key = trusted_public_key(kid)
    if encoded_key is None:
        raise SignatureError(untrusted_kid_message(kid))
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    except ImportError as exc:
        raise ProDependencyError(PRO_EXTRA_MESSAGE) from exc
    raw_key = b64url_decode(encoded_key, f"public key {kid}")
    if len(raw_key) != 32:
        raise SignatureError(f"Public key {kid} is not a 32-byte Ed25519 key.")
    if len(signature) != 64:
        raise SignatureError("Signature is not a 64-byte Ed25519 signature.")
    try:
        Ed25519PublicKey.from_public_bytes(raw_key).verify(signature, message)
    except InvalidSignature as exc:
        raise SignatureError(f"Signature does not verify against key {kid}.") from exc
