"""The official KetQat catalog, run locally.

    from ketqat_runner import catalog

    catalog.search("entropy")
    record = catalog.run("grover-search@1.0.0", seed=7, n_qubits=5, marked=[3], shots=1000)
    record.result["success_probability"]

Product definitions ship inside this package (`data/`), so everything here
works offline. Every product is free and open source and runs from this
package; a run never imports network code, contacts a server or needs an
account.
"""

from __future__ import annotations

from .execute import ProductRunError, run
from .loader import (
    Catalog,
    CatalogError,
    Product,
    ProductNotFoundError,
    VersionNotFoundError,
    load_catalog,
)
from .params import ParameterError
from .records import RunRecord, RunRecordError, ketqat_home, list_records, load_record


def search(query: str | None = None, *, category: str | None = None, tier: str | None = None) -> list[Product]:
    """Products whose text contains every word of `query`, optionally filtered."""
    return load_catalog().search(query, category=category, tier=tier)


def get_product(reference: str) -> Product:
    """A product by ID or slug."""
    return load_catalog().get(reference)


__all__ = [
    "Catalog",
    "CatalogError",
    "ParameterError",
    "Product",
    "ProductNotFoundError",
    "ProductRunError",
    "RunRecord",
    "RunRecordError",
    "VersionNotFoundError",
    "get_product",
    "ketqat_home",
    "list_records",
    "load_catalog",
    "load_record",
    "run",
    "search",
]
