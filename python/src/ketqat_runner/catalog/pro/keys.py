"""Trusted Ed25519 public keys, by key ID (`kid`).

Values are the raw 32-byte public keys, base64url-encoded without padding.

Production keys
---------------
`PRODUCTION_KEYS` is deliberately empty. The owner provides the production
public key; add it as

    "ketqat-prod-YYYY-MM": "<base64url raw public key>",

in a reviewed pull request. Until then, no production entitlement or bundle
verifies, and Pro commands fail closed with a message naming the unknown kid.

Test keys
---------
`TEST_KEYS` holds keys whose private halves are test fixtures. They are
honoured ONLY when the environment sets `KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS=1`,
so a test key can never unlock anything on a normal install. The private key
for `ketqat-test-2026-10` is held outside this repository for KetQat's own
staging/test environment; it is not secret in any security sense, because the
key is useless without the opt-in variable.
"""

from __future__ import annotations

import os

TEST_KEYS_ENVIRONMENT_VARIABLE = "KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS"

PRODUCTION_KEYS: dict[str, str] = {
    # Production key slot: intentionally empty until the owner supplies the key.
}

TEST_KEYS: dict[str, str] = {
    "ketqat-test-2026-10": "guv6P4gdVMHAhST9NY8WUiUK2fsmwefC8FVMXVWyqaQ",
}


def allow_test_keys() -> bool:
    return os.environ.get(TEST_KEYS_ENVIRONMENT_VARIABLE, "").strip() == "1"


def trusted_public_key(kid: str) -> str | None:
    """The base64url public key for `kid`, or None when it is not trusted here."""
    if kid in PRODUCTION_KEYS:
        return PRODUCTION_KEYS[kid]
    if kid in TEST_KEYS and allow_test_keys():
        return TEST_KEYS[kid]
    return None


def untrusted_kid_message(kid: str) -> str:
    if kid in TEST_KEYS:
        return (
            f"Key {kid!r} is a test key. It is honoured only when "
            f"{TEST_KEYS_ENVIRONMENT_VARIABLE}=1 is set, which is for KetQat's own testing."
        )
    known = ", ".join(sorted(PRODUCTION_KEYS)) or "none configured in this SDK version"
    return f"Key {kid!r} is not a trusted KetQat signing key (trusted: {known}). Update the SDK."
