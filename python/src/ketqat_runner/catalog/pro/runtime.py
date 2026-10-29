"""Start a Pro run: entitlement first, then the installed bundle.

The entitlement is checked once, here, before the product code is loaded. A
run that has started is never interrupted by expiry, and nothing here reads,
moves or deletes run records.
"""

from __future__ import annotations

import importlib.util
import sys
from types import ModuleType

from ..loader import CatalogError
from .bundle import ENTRYPOINT, BundleError, verify_installed
from .entitlement import EntitlementError, require_valid
from .signing import ProDependencyError


class ProRunRefused(CatalogError):
    """A Pro run that did not start. No record is written."""


def prepare_pro_run(product_id: str, version: str) -> ModuleType:
    try:
        require_valid()
        files_root = verify_installed(product_id, version)
    except (EntitlementError, BundleError, ProDependencyError) as exc:
        raise ProRunRefused(str(exc)) from exc

    module_name = f"ketqat_pro_bundle_{product_id.replace('.', '_').replace('-', '_')}_{version.replace('.', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, files_root / ENTRYPOINT)
    if spec is None or spec.loader is None:
        raise ProRunRefused(f"Could not load {ENTRYPOINT} from the {product_id} bundle.")
    module = importlib.util.module_from_spec(spec)
    previous_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True  # keep the verified directory exactly as signed
    sys.path.insert(0, str(files_root))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(files_root))
        sys.dont_write_bytecode = previous_bytecode
    if not callable(getattr(module, "run", None)):
        raise ProRunRefused(f"The {product_id} bundle's {ENTRYPOINT} defines no run(params, seed).")
    return module
