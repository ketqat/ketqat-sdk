"""Generate `catalog/catalog.json` and the packaged copy of the catalog.

    python -m ketqat_runner.catalog.build           # write
    python -m ketqat_runner.catalog.build --check   # fail if anything is stale

Run from a source checkout. The repository's `catalog/` directory is the only
place product definitions are authored; this tool

1. validates every `catalog/products/<id>.json` against
   `catalog/schema/product.schema.json`, plus the rules a JSON Schema cannot
   express (file name equals ID, unique slugs, versions newest first, a
   current version, validation tests that exist, an implementation for every
   runnable Free version, defaults that satisfy their own constraints);
2. normalises each product file's formatting (2-space JSON, trailing newline),
   so its sha256 is stable;
3. writes `catalog/catalog.json`: products sorted by ID with the sha256 of
   each file's bytes;
4. copies `catalog/` byte for byte into
   `python/src/ketqat_runner/catalog/data/`, the copy the installed package
   reads.

`--check` performs the same steps without writing, and exits 1 naming every
file that differs. CI runs it, and `npm run verify:catalog-sync` checks the
packaged copy independently.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from .loader import INDEX_SCHEMA_ID, PRODUCT_SCHEMA_ID, parse_version
from .params import ParameterError, check_value
from .products import implemented_versions

PACKAGE_DATA = Path("python/src/ketqat_runner/catalog/data")


class BuildError(Exception):
    pass


def find_root(explicit: Path | None) -> Path:
    candidates = [explicit] if explicit else [Path(__file__).resolve().parents[4], Path.cwd(), *Path.cwd().parents]
    for candidate in candidates:
        if candidate and (candidate / "catalog/schema/product.schema.json").is_file() and (
            candidate / "python/pyproject.toml"
        ).is_file():
            return candidate
    raise BuildError(
        "Could not find a ketqat-sdk source checkout (catalog/schema/product.schema.json). "
        "Run from the repository, or pass --root."
    )


def canonical_text(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def _validate_product(root: Path, path: Path, definition: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    from jsonschema import Draft7Validator

    problems = [
        f"{path.name}: {'/'.join(str(part) for part in error.absolute_path) or '<root>'}: {error.message}"
        for error in sorted(Draft7Validator(schema).iter_errors(definition), key=lambda e: list(e.absolute_path))
    ]
    if problems:
        return problems

    if path.stem != definition["id"]:
        problems.append(f"{path.name}: file name must be {definition['id']}.json")

    versions = [entry["version"] for entry in definition["versions"]]
    parsed = [parse_version(version) for version in versions]
    if parsed != sorted(parsed, reverse=True) or len(set(parsed)) != len(parsed):
        problems.append(f"{path.name}: versions must be distinct and listed newest first; got {versions}")
    statuses = [entry["status"] for entry in definition["versions"]]
    if statuses.count("current") > 1:
        problems.append(f"{path.name}: at most one version may be current")
    if "current" in statuses and statuses[0] != "current":
        problems.append(f"{path.name}: the newest version must be the current one")

    if definition["implementationStatus"] == "verified":
        if not definition["validation"] or not definition["science"]["limitations"]:
            problems.append(f"{path.name}: verified needs validation entries and stated limitations")
        if definition["example"]["verified"] is None:
            problems.append(f"{path.name}: verified needs an example that has been executed")

    for check in definition["validation"]:
        test_path, _, test_name = check["test"].partition("::")
        test_file = root / test_path
        if not test_file.is_file():
            problems.append(f"{path.name}: validation test file {test_path} does not exist")
        elif test_name and f"def {test_name}(" not in test_file.read_text(encoding="utf-8"):
            problems.append(f"{path.name}: validation test {check['test']} does not exist")

    if definition["tier"] == "free":
        for entry in definition["versions"]:
            if entry["status"] != "retired" and entry["version"] not in implemented_versions(definition["id"]):
                problems.append(
                    f"{path.name}: version {entry['version']} is runnable but this SDK has no implementation"
                )

    for field in definition["inputs"]:
        if "default" in field and field["default"] is not None:
            try:
                check_value(field, field["default"])
            except ParameterError as exc:
                problems.append(f"{path.name}: default for input {field['name']!r} is invalid: {exc}")
    names = [field["name"] for field in definition["inputs"]]
    if len(set(names)) != len(names):
        problems.append(f"{path.name}: input names must be unique")
    return problems


def expected_files(root: Path) -> dict[Path, bytes]:
    """Every generated or normalised file, keyed by repository-relative path."""
    catalog_dir = root / "catalog"
    schema_bytes = (catalog_dir / "schema/product.schema.json").read_bytes()
    schema = json.loads(schema_bytes)
    if schema.get("properties", {}).get("schema", {}).get("const") != PRODUCT_SCHEMA_ID:
        raise BuildError(f"catalog/schema/product.schema.json does not describe {PRODUCT_SCHEMA_ID}")

    problems: list[str] = []
    outputs: dict[Path, bytes] = {}
    entries: list[dict[str, Any]] = []
    slugs: dict[str, str] = {}
    product_paths = sorted((catalog_dir / "products").glob("*.json"))
    if not product_paths:
        raise BuildError("catalog/products/ has no product definitions")
    for path in product_paths:
        try:
            definition = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            problems.append(f"{path.name}: invalid JSON: {exc}")
            continue
        found = _validate_product(root, path, definition, schema)
        if found:
            problems.extend(found)
            continue
        if definition["slug"] in slugs:
            problems.append(f"{path.name}: slug {definition['slug']!r} is also used by {slugs[definition['slug']]}")
        slugs[definition["slug"]] = path.name

        text = canonical_text(definition).encode("utf-8")
        relative = Path("catalog/products") / path.name
        outputs[relative] = text
        current = next((entry for entry in definition["versions"] if entry["status"] == "current"), None)
        entries.append(
            {
                "id": definition["id"],
                "slug": definition["slug"],
                "name": definition["name"],
                "category": definition["category"],
                "subcategory": definition["subcategory"],
                "tier": definition["tier"],
                "executionKind": definition["executionKind"],
                "implementationStatus": definition["implementationStatus"],
                "currentVersion": current["version"] if current else None,
                "path": f"products/{path.name}",
                "sha256": hashlib.sha256(text).hexdigest(),
            }
        )
    if problems:
        raise BuildError("Invalid product definitions:\n  " + "\n  ".join(problems))

    entries.sort(key=lambda entry: entry["id"])
    index = {
        "schema": INDEX_SCHEMA_ID,
        "productSchema": PRODUCT_SCHEMA_ID,
        "productSchemaSha256": hashlib.sha256(schema_bytes).hexdigest(),
        "products": entries,
    }
    outputs[Path("catalog/catalog.json")] = canonical_text(index).encode("utf-8")
    outputs[Path("catalog/schema/product.schema.json")] = schema_bytes

    for relative, content in list(outputs.items()):
        outputs[PACKAGE_DATA / relative.relative_to("catalog")] = content
    return outputs


def stale_paths(root: Path, outputs: dict[Path, bytes]) -> list[str]:
    stale = []
    for relative, content in sorted(outputs.items()):
        target = root / relative
        if not target.is_file() or target.read_bytes() != content:
            stale.append(str(relative))
    packaged_products = root / PACKAGE_DATA / "products"
    if packaged_products.is_dir():
        for extra in sorted(packaged_products.glob("*.json")):
            if (PACKAGE_DATA / "products" / extra.name) not in outputs:
                stale.append(f"{PACKAGE_DATA / 'products' / extra.name} (no longer in catalog/products)")
    return stale


def write(root: Path, outputs: dict[Path, bytes]) -> list[str]:
    written = []
    for relative, content in sorted(outputs.items()):
        target = root / relative
        if target.is_file() and target.read_bytes() == content:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        written.append(str(relative))
    packaged_products = root / PACKAGE_DATA / "products"
    for extra in sorted(packaged_products.glob("*.json")):
        if (PACKAGE_DATA / "products" / extra.name) not in outputs:
            extra.unlink()
            written.append(f"{PACKAGE_DATA / 'products' / extra.name} (removed)")
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ketqat_runner.catalog.build", description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="Fail if any generated file is stale; write nothing.")
    parser.add_argument("--root", type=Path, help="Repository root. Found automatically when omitted.")
    args = parser.parse_args(argv)
    try:
        root = find_root(args.root)
        outputs = expected_files(root)
    except BuildError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if args.check:
        stale = stale_paths(root, outputs)
        if stale:
            print("The catalog is stale. Run: python -m ketqat_runner.catalog.build", file=sys.stderr)
            for path in stale:
                print(f"  {path}", file=sys.stderr)
            return 1
        count = sum(1 for path in outputs if path.parts[0] == "catalog" and path.parent.name == "products")
        print(f"Catalog is up to date: {count} products, packaged copy identical.")
        return 0
    written = write(root, outputs)
    for path in written:
        print(f"wrote {path}")
    if not written:
        print("Catalog already up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
