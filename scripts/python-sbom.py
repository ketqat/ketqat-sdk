#!/usr/bin/env python3
"""A CycloneDX inventory for the built Python wheel, using only the standard library.

Read out of the **wheel**, not out of `pyproject.toml`. The wheel is the artifact; a
dependency declared in the project file but lost on the way into the package would
otherwise appear in the inventory anyway, which is the one thing an SBOM must not do.

Optional extras are included and labelled with the extra that pulls them, because
`ketqat[qec]` and `ketqat` are different dependency surfaces and a reader deciding whether
to install one needs to see both.

No network, and no third-party dependency: a supply-chain inventory that fetches a package
in order to describe packages is a strange thing to trust.

Usage:
    python3 scripts/python-sbom.py dist-release/ketqat-0.2.0-py3-none-any.whl
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from email.parser import Parser
from pathlib import Path

CYCLONEDX_SCHEMA = "http://cyclonedx.org/schema/bom-1.5.schema.json"

# "numpy>=1.26 ; extra == 'qec'" -> requirement, extra
_MARKER = re.compile(r"""extra\s*==\s*['"]([^'"]+)['"]""")


def wheel_metadata(wheel: Path) -> str:
    with zipfile.ZipFile(wheel) as archive:
        names = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
        if len(names) != 1:
            raise SystemExit(f"expected one METADATA in {wheel.name}, found {names}")
        return archive.read(names[0]).decode("utf-8")


def component(requirement: str, extra: str | None) -> dict[str, object]:
    """One dependency, with its declared range kept verbatim.

    The range is not resolved to a version. This describes what the artifact *asks for*;
    what a particular environment resolved is a property of that environment, and
    reporting one as the other would be a claim about installs nobody has made.
    """
    expression, _, _ = requirement.partition(";")
    expression = expression.strip()
    name = re.split(r"[<>=!~\[ ]", expression, maxsplit=1)[0].strip()
    entry: dict[str, object] = {
        "type": "library",
        "name": name,
        "purl": f"pkg:pypi/{name.lower()}",
        "scope": "required" if extra is None else "optional",
        "properties": [{"name": "ketqat:requirement", "value": expression}],
    }
    if extra is not None:
        entry["properties"].append({"name": "ketqat:extra", "value": extra})
    return entry


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    wheel = Path(sys.argv[1])
    metadata = Parser().parsestr(wheel_metadata(wheel))

    components = []
    for requirement in metadata.get_all("Requires-Dist") or []:
        marker = _MARKER.search(requirement)
        components.append(component(requirement, marker.group(1) if marker else None))

    document = {
        "$schema": CYCLONEDX_SCHEMA,
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {
            "component": {
                "type": "library",
                "name": metadata.get("Name"),
                "version": metadata.get("Version"),
                "purl": f"pkg:pypi/{(metadata.get('Name') or '').lower()}@{metadata.get('Version')}",
                "licenses": [{"license": {"id": metadata.get("License-Expression") or "Apache-2.0"}}],
            },
            "properties": [
                {"name": "ketqat:source", "value": f"read from {wheel.name}, not from pyproject.toml"},
                {"name": "ketqat:published", "value": "false"},
            ],
        },
        "components": sorted(components, key=lambda entry: (entry["scope"], entry["name"])),
    }
    # No timestamp and no serial number: this file is written beside artifacts whose
    # reproducibility is checked by digest, and a per-build UUID would make it the one
    # thing that never matches.
    json.dump(document, sys.stdout, indent=2, sort_keys=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
