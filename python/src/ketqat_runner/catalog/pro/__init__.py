"""KetQat Pro: entitlement tokens and signed bundles.

Nothing in this package is imported by a Free catalog run. It is loaded by
`ketqat pro ...` commands and by `catalog.run` only when the product's tier is
`pro`.

What the entitlement is and is not: a short-lived Ed25519-signed token that
gates *official distribution and updates* of Pro bundles and the start of a Pro
run. Code delivered to a machine can be copied or modified; this is not DRM and
does not pretend to be.

Formats (contract shared with ketqat.com):

- Entitlement token: ``base64url(payload) "." base64url(signature)``. The
  payload is the UTF-8 JSON object
  ``{"v":1,"kid":...,"sub":...,"tier":"pro","iat":...,"exp":...}`` (Unix
  seconds). The signature is Ed25519 over the exact payload bytes that were
  base64url-encoded (not over the encoded text). Padding is optional.
- Bundle: ``{"manifest": {...}, "signature": "<base64url>", "files": {path: base64}}``
  with ``manifest = {"productId", "version", "sha256": {path: hex}, "kid"}``.
  The signature is Ed25519 over the manifest's canonical JSON: keys sorted at
  every level, separators ``,`` and ``:`` with no whitespace, UTF-8, non-ASCII
  characters not escaped. ``files`` must name exactly the paths in
  ``manifest.sha256``, and each decoded file must hash to its entry.
- Bundle entry point: a file ``main.py`` at the bundle root defining
  ``run(params: dict, seed: int) -> dict`` (JSON-serialisable) and optionally
  ``validate(params: dict) -> None``. Other files in the bundle are importable
  from ``main.py`` by relative path (the bundle directory is put on
  ``sys.path`` for the duration of the import).
"""
