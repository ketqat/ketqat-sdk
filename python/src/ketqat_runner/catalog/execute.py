"""Run a catalog product locally and write its run record.

Free products run entirely from this package: no network, no account, no
entitlement code. The test suite checks the import graph after a free run to
hold that.

Pro products load their code from a signed bundle installed by `ketqat pro
install`. The cached entitlement token is checked once, at the start of the
run; a run in progress is never interrupted, and existing records are never
touched.
"""

from __future__ import annotations

import importlib.metadata
import platform
import secrets
import traceback
from typing import Any

from ..runner_version import SDK_VERSION
from .loader import CatalogError, Product, load_catalog, parse_version
from .params import ParameterError, resolve_parameters
from .products import implemented_versions, load_implementation
from .records import RunRecord, isoformat, new_run_id, result_sha256, utc_now, write_record

#: Packages recorded in the environment block, per extra.
_EXTRA_PACKAGES = {
    "algorithms": ("numpy",),
    "qinfo": ("numpy",),
    "qec": ("numpy", "stim", "pymatching"),
    "pro": ("cryptography",),
}

MAX_SEED = 2**63 - 1


class ProductRunError(CatalogError):
    """The product started and failed. A failed run record was written."""

    def __init__(self, message: str, record: RunRecord) -> None:
        super().__init__(message)
        self.record = record


def _package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "not-installed"


def capture_run_environment(extras: list[str]) -> dict[str, Any]:
    packages = {"ketqat": SDK_VERSION}
    for extra in extras:
        for name in _EXTRA_PACKAGES.get(extra, ()):
            packages[name] = _package_version(name)
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "packages": dict(sorted(packages.items())),
    }


def _sdk_satisfies(minimum: str) -> bool:
    return parse_version(SDK_VERSION) >= parse_version(minimum)


def _resolve(product: str | Product, version: str | None) -> tuple[Product, dict[str, Any]]:
    catalog = load_catalog()
    if isinstance(product, Product):
        entry, pinned = product, None
    else:
        if not isinstance(product, str) or not product:
            raise CatalogError("Name a product by ID or slug, optionally pinned as slug@1.0.0.")
        entry, pinned = catalog.resolve(product)
    if pinned and version and pinned != version:
        raise CatalogError(f"Conflicting versions: {product!r} pins {pinned} but version={version!r}.")
    version_entry = entry.version(pinned or version)
    if not _sdk_satisfies(version_entry["sdkMinVersion"]):
        raise CatalogError(
            f"{entry.slug}@{version_entry['version']} needs ketqat >= {version_entry['sdkMinVersion']}; "
            f"this is {SDK_VERSION}."
        )
    return entry, version_entry


def _check_seed(seed: Any) -> int:
    if seed is None:
        return secrets.randbelow(2**32)
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= MAX_SEED:
        raise ParameterError(f"seed must be an integer in [0, {MAX_SEED}]; got {seed!r}.")
    return seed


def run(product: str | Product, version: str | None = None, seed: int | None = None, **params: Any) -> RunRecord:
    """Run a catalog product locally and return its run record.

    `product` is an ID or slug, optionally pinned (`"grover-search@1.0.0"`).
    `version` pins the same way; giving both with different values is an error.
    `seed` defaults to a fresh random seed, which is recorded so the run can be
    repeated. Every other keyword is a product parameter, checked against the
    product's declared inputs.

    Unknown products, versions or parameters raise before anything runs and no
    record is written. A product that starts and then fails writes a record
    with `status: "failed"` and raises `ProductRunError`.
    """
    entry, version_entry = _resolve(product, version)
    label = f"{entry.slug}@{version_entry['version']}"
    resolved = resolve_parameters(entry.inputs, params, product_label=label)
    chosen_seed = _check_seed(seed)

    if entry.tier == "pro":
        # Imported only here: a Free run must never load entitlement or network code.
        from .pro.runtime import prepare_pro_run

        implementation = prepare_pro_run(entry.id, version_entry["version"])
    else:
        if version_entry["version"] not in implemented_versions(entry.id):
            raise CatalogError(
                f"This SDK ({SDK_VERSION}) has no implementation of {label}. "
                "Nothing was run; there is no fallback."
            )
        implementation = load_implementation(entry.id)

    validate = getattr(implementation, "validate", None)
    if validate is not None:
        validate(resolved)

    started = utc_now()
    status = "succeeded"
    error: str | None = None
    result: Any = None
    try:
        result = implementation.run(dict(resolved), chosen_seed)
        digest = result_sha256(result)
    except ParameterError:
        raise
    except Exception as exc:  # noqa: BLE001 - recorded, then re-raised
        status = "failed"
        error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        result = None
        digest = None
        failure = exc
    finished = utc_now()

    record = RunRecord(
        run_id=new_run_id(started),
        product_id=entry.id,
        product_version=version_entry["version"],
        parameters=resolved,
        seed=chosen_seed,
        sdk_version=SDK_VERSION,
        environment=capture_run_environment(list(version_entry["extras"])),
        started_at=isoformat(started),
        finished_at=isoformat(finished),
        status=status,
        result=result,
        result_sha256=digest,
        error=error,
    )
    write_record(record)
    if status == "failed":
        raise ProductRunError(f"{label} failed: {error}", record) from failure
    return record

