from __future__ import annotations

from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path


@dataclass(frozen=True)
class ExampleManifest:
    name: str
    domain: str
    package_path: str
    description: str


EXAMPLE_MANIFESTS: tuple[ExampleManifest, ...] = (
    ExampleManifest(
        name="surface-code-memory",
        domain="QEC",
        package_path="examples/qec/surface-code-memory.yaml",
        description="Rotated surface-code memory with Stim sampling and PyMatching decoding.",
    ),
    ExampleManifest(
        name="grover-search",
        domain="ALGORITHM",
        package_path="examples/algorithms/grover-search.yaml",
        description="Small deterministic Grover-search shot simulation.",
    ),
)


def list_example_manifests() -> tuple[ExampleManifest, ...]:
    return EXAMPLE_MANIFESTS


def read_example_manifest(identifier: str) -> str:
    example = get_example_manifest(identifier)
    resource = files("ketqat_runner").joinpath(example.package_path)
    if resource.is_file():
        return resource.read_text()

    development_copy = Path(__file__).resolve().parents[3] / example.package_path
    if development_copy.is_file():
        return development_copy.read_text()

    raise FileNotFoundError(f"Packaged KetQat example is missing: {example.package_path}")


def get_example_manifest(identifier: str) -> ExampleManifest:
    key = _normalize_identifier(identifier)
    aliases = _aliases()
    if key in aliases:
        return aliases[key]
    available = ", ".join(example.name for example in EXAMPLE_MANIFESTS)
    raise KeyError(f"Unknown KetQat example {identifier!r}. Available examples: {available}")


def _aliases() -> dict[str, ExampleManifest]:
    aliases: dict[str, ExampleManifest] = {}
    for example in EXAMPLE_MANIFESTS:
        package_key = _normalize_identifier(example.package_path)
        aliases[example.name] = example
        aliases[package_key] = example
        aliases[package_key.removeprefix("examples/")] = example
    return aliases


def _normalize_identifier(identifier: str) -> str:
    key = identifier.replace("\\", "/").strip().removeprefix("./")
    if key.endswith(".yaml"):
        key = key[:-5]
    elif key.endswith(".yml"):
        key = key[:-4]
    return key
