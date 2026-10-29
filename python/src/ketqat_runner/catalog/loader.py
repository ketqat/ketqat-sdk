"""Read the catalog shipped inside this package.

The catalog is data, not code: `data/catalog.json` indexes one JSON file per
product, each with its sha256. The files are byte-identical copies of the
repository's `catalog/` directory, written by `python -m
ketqat_runner.catalog.build`. Loading checks every product file against the
digest in the index and against the product schema, so a hand-edited installed
copy fails loudly instead of describing a product nobody published.

Nothing here touches the network.
"""

from __future__ import annotations

import functools
import hashlib
import json
import re
from dataclasses import dataclass
from importlib import resources
from typing import Any, Iterable

PRODUCT_SCHEMA_ID = "ketqat.catalog.product/v1"
INDEX_SCHEMA_ID = "ketqat.catalog.index/v1"

_VERSION_PATTERN = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")


class CatalogError(Exception):
    """The catalog, a product, or a version cannot be used as asked."""


class ProductNotFoundError(CatalogError):
    pass


class VersionNotFoundError(CatalogError):
    pass


def parse_version(value: str) -> tuple[int, int, int]:
    match = _VERSION_PATTERN.match(value)
    if not match:
        raise CatalogError(f"{value!r} is not a version of the form MAJOR.MINOR.PATCH.")
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


@dataclass(frozen=True)
class Product:
    definition: dict[str, Any]
    sha256: str

    @property
    def id(self) -> str:
        return self.definition["id"]

    @property
    def slug(self) -> str:
        return self.definition["slug"]

    @property
    def name(self) -> str:
        return self.definition["name"]

    @property
    def tier(self) -> str:
        return self.definition["tier"]

    @property
    def category(self) -> str:
        return self.definition["category"]

    @property
    def inputs(self) -> list[dict[str, Any]]:
        return self.definition["inputs"]

    @property
    def versions(self) -> list[dict[str, Any]]:
        return self.definition["versions"]

    @property
    def current_version(self) -> dict[str, Any]:
        for entry in self.versions:
            if entry["status"] == "current":
                return entry
        raise CatalogError(f"{self.id} has no current version; every version is retired.")

    def version(self, version: str | None) -> dict[str, Any]:
        """The version entry to run. `None` means the current version."""
        if version is None:
            return self.current_version
        parse_version(version)
        for entry in self.versions:
            if entry["version"] == version:
                if entry["status"] == "retired":
                    raise VersionNotFoundError(
                        f"{self.slug}@{version} is retired and cannot be run. "
                        f"Current version: {self.current_version['version']}."
                    )
                return entry
        known = ", ".join(entry["version"] for entry in self.versions)
        raise VersionNotFoundError(
            f"{self.slug} has no version {version}. Known versions: {known}."
        )

    def install_command(self) -> str:
        return self.definition["install"]

    def search_text(self) -> str:
        definition = self.definition
        parts: list[str] = [
            definition["id"],
            definition["slug"],
            definition["name"],
            definition["summary"],
            definition["description"],
            definition["category"],
            definition["subcategory"],
            *definition["useCases"],
        ]
        return "\n".join(parts).lower()


@dataclass(frozen=True)
class Catalog:
    index: dict[str, Any]
    products: tuple[Product, ...]

    def get(self, reference: str) -> Product:
        """Look up a product by ID or slug. A version suffix is not accepted here."""
        for product in self.products:
            if reference in (product.id, product.slug):
                return product
        raise ProductNotFoundError(
            f"No catalog product with ID or slug {reference!r}. "
            "Run `ketqat catalog search` to list products."
        )

    def resolve(self, reference: str) -> tuple[Product, str | None]:
        """`slug`, `id`, `slug@1.2.3` or `id@1.2.3` -> (product, pinned version or None)."""
        name, separator, version = reference.partition("@")
        if separator and not version:
            raise CatalogError(f"{reference!r} has an empty version after '@'.")
        product = self.get(name)
        if separator:
            parse_version(version)
            return product, version
        return product, None

    def search(
        self,
        query: str | None = None,
        *,
        category: str | None = None,
        tier: str | None = None,
    ) -> list[Product]:
        terms = [term for term in (query or "").lower().split() if term]
        found = []
        for product in self.products:
            if category and product.category != category:
                continue
            if tier and product.tier != tier:
                continue
            text = product.search_text()
            if all(term in text for term in terms):
                found.append(product)
        return found


def _data() -> Any:
    return resources.files("ketqat_runner.catalog").joinpath("data")


def read_data_bytes(relative: str) -> bytes:
    resource = _data()
    for part in relative.split("/"):
        resource = resource.joinpath(part)
    if not resource.is_file():
        raise CatalogError(
            f"The packaged catalog is missing {relative}. Reinstall the package; if this is a "
            "source checkout, run `python -m ketqat_runner.catalog.build`."
        )
    return resource.read_bytes()


def product_schema() -> dict[str, Any]:
    return json.loads(read_data_bytes("schema/product.schema.json"))


def validate_definition(definition: Any, schema: dict[str, Any] | None = None) -> list[str]:
    """Schema errors for one product definition, as readable strings. Empty means valid."""
    from jsonschema import Draft7Validator

    validator = Draft7Validator(schema or product_schema())
    errors = sorted(validator.iter_errors(definition), key=lambda error: list(error.absolute_path))
    return [
        f"{'/'.join(str(part) for part in error.absolute_path) or '<root>'}: {error.message}"
        for error in errors
    ]


@functools.lru_cache(maxsize=1)
def load_catalog() -> Catalog:
    """The packaged catalog, integrity- and schema-checked. Cached per process."""
    index = json.loads(read_data_bytes("catalog.json"))
    if index.get("schema") != INDEX_SCHEMA_ID:
        raise CatalogError(f"Unsupported catalog index schema {index.get('schema')!r}.")
    schema = product_schema()
    products: list[Product] = []
    for entry in index["products"]:
        raw = read_data_bytes(entry["path"])
        digest = hashlib.sha256(raw).hexdigest()
        if digest != entry["sha256"]:
            raise CatalogError(
                f"{entry['path']} does not match the sha256 in catalog.json "
                f"(index {entry['sha256']}, file {digest}). The installed catalog was modified."
            )
        definition = json.loads(raw)
        errors = validate_definition(definition, schema)
        if errors:
            raise CatalogError(f"{entry['path']} is not a valid product definition: {errors[0]}")
        products.append(Product(definition=definition, sha256=digest))
    return Catalog(index=index, products=tuple(products))


def iter_products() -> Iterable[Product]:
    return load_catalog().products
