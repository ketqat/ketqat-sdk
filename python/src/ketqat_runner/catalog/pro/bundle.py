"""Signed Pro bundles: verify, install, and re-verify before each run.

A bundle is accepted only if

- its manifest names the product and version that were requested,
- the manifest's key ID is trusted and its Ed25519 signature verifies over
  the manifest's canonical JSON,
- `files` names exactly the paths in `manifest.sha256`, every path is a plain
  relative path inside the bundle, and every decoded file hashes to its entry.

Only then is anything written, into a temporary directory that is renamed to
`$KETQAT_HOME/pro/<productId>/<version>/` in one step. The installed copy
keeps `bundle.json` (manifest and signature) beside `files/`, and is verified
again before every run, so a file edited after installation is refused rather
than executed.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from ..records import ketqat_home
from .signing import SignatureError, b64_decode, b64url_decode, canonical_manifest_bytes, verify_signature

ENTRYPOINT = "main.py"
_SEGMENT = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]*$")
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
MAX_BUNDLE_FILES = 512


class BundleError(Exception):
    pass


def bundle_directory(product_id: str, version: str) -> Path:
    return ketqat_home() / "pro" / product_id / version


def _check_path(path: str) -> None:
    if not isinstance(path, str) or not path or path.startswith("/") or "\\" in path:
        raise BundleError(f"Bundle path {path!r} is not a relative POSIX path.")
    for segment in path.split("/"):
        if segment in ("", ".", "..") or not _SEGMENT.match(segment):
            raise BundleError(f"Bundle path {path!r} has an unsafe segment {segment!r}.")


def verify_manifest(manifest: Any, signature_text: Any, product_id: str, version: str) -> dict[str, str]:
    if not isinstance(manifest, dict) or set(manifest) != {"productId", "version", "sha256", "kid"}:
        raise BundleError("Bundle manifest must have exactly productId, version, sha256 and kid.")
    if manifest["productId"] != product_id or manifest["version"] != version:
        raise BundleError(
            f"Bundle is for {manifest.get('productId')}@{manifest.get('version')}, "
            f"not the requested {product_id}@{version}."
        )
    hashes = manifest["sha256"]
    if not isinstance(hashes, dict) or not hashes or len(hashes) > MAX_BUNDLE_FILES:
        raise BundleError("Bundle manifest sha256 must map between 1 and 512 paths to digests.")
    for path, digest in hashes.items():
        _check_path(path)
        if not isinstance(digest, str) or not _HEX64.match(digest):
            raise BundleError(f"Bundle digest for {path!r} is not 64 lowercase hex characters.")
    if ENTRYPOINT not in hashes:
        raise BundleError(f"Bundle has no {ENTRYPOINT} entry point.")
    kid = manifest["kid"]
    if not isinstance(kid, str) or not kid:
        raise BundleError("Bundle manifest has no key ID.")
    if not isinstance(signature_text, str):
        raise BundleError("Bundle signature must be base64url text.")
    try:
        verify_signature(kid, canonical_manifest_bytes(manifest), b64url_decode(signature_text, "bundle signature"))
    except SignatureError as exc:
        raise BundleError(f"Bundle signature rejected: {exc}") from exc
    return hashes


def verify_payload(payload: Any, product_id: str, version: str) -> tuple[dict[str, Any], str, dict[str, bytes]]:
    """Check a bundle response completely. Returns (manifest, signature, decoded files)."""
    if not isinstance(payload, dict) or set(payload) != {"manifest", "signature", "files"}:
        raise BundleError("Bundle response must have exactly manifest, signature and files.")
    manifest = payload["manifest"]
    hashes = verify_manifest(manifest, payload["signature"], product_id, version)
    files = payload["files"]
    if not isinstance(files, dict) or set(files) != set(hashes):
        raise BundleError("Bundle files do not match the paths the signed manifest lists.")
    decoded: dict[str, bytes] = {}
    for path, encoded in files.items():
        try:
            content = b64_decode(encoded, f"bundle file {path}")
        except SignatureError as exc:
            raise BundleError(str(exc)) from exc
        digest = hashlib.sha256(content).hexdigest()
        if digest != hashes[path]:
            raise BundleError(
                f"Bundle file {path} does not match its signed sha256 (expected {hashes[path]}, got {digest})."
            )
        decoded[path] = content
    return manifest, payload["signature"], decoded


def install(payload: Any, product_id: str, version: str) -> Path:
    """Verify then write. Nothing is written if any check fails."""
    manifest, signature, decoded = verify_payload(payload, product_id, version)
    destination = bundle_directory(product_id, version)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(dir=destination.parent, prefix=f".{version}.staging-"))
    try:
        for path, content in decoded.items():
            target = staging / "files" / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        (staging / "bundle.json").write_text(
            json.dumps({"manifest": manifest, "signature": signature}, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        if destination.exists():
            retired = destination.with_name(f".{version}.replaced-{staging.name[-8:]}")
            destination.rename(retired)
            staging.rename(destination)
            shutil.rmtree(retired, ignore_errors=True)
        else:
            staging.rename(destination)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return destination


def verify_installed(product_id: str, version: str) -> Path:
    """Re-check the installed bundle. Returns its `files/` directory."""
    directory = bundle_directory(product_id, version)
    metadata_path = directory / "bundle.json"
    if not metadata_path.is_file():
        raise BundleError(
            f"{product_id}@{version} is not installed. Run: ketqat pro install {product_id}@{version}"
        )
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BundleError(f"{metadata_path} is not valid JSON: {exc}") from exc
    if not isinstance(metadata, dict):
        raise BundleError(f"{metadata_path} is not a bundle record.")
    hashes = verify_manifest(metadata.get("manifest"), metadata.get("signature"), product_id, version)
    files_root = directory / "files"
    present = {
        path.relative_to(files_root).as_posix()
        for path in files_root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }
    if present != set(hashes):
        raise BundleError(
            f"Installed bundle {product_id}@{version} has files that differ from its signed manifest. "
            f"Reinstall it: ketqat pro install {product_id}@{version}"
        )
    for path, digest in hashes.items():
        actual = hashlib.sha256((files_root / path).read_bytes()).hexdigest()
        if actual != digest:
            raise BundleError(
                f"Installed file {path} was modified after installation. "
                f"Reinstall it: ketqat pro install {product_id}@{version}"
            )
    return files_root
