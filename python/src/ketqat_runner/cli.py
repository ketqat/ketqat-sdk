from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from .examples import get_example_manifest, list_example_manifests, read_example_manifest
from .runner import run_experiment
from .validation import KetQatValidationError


def main() -> int:
    parser = argparse.ArgumentParser(prog="ketqat")
    subcommands = parser.add_subparsers(dest="command", required=True)
    run_parser = subcommands.add_parser("run", help="Run a KetQat experiment manifest locally.")
    run_parser.add_argument("manifest", help="Manifest file path or packaged example name.")
    run_parser.add_argument("--output", type=Path, required=True)

    examples_parser = subcommands.add_parser("examples", help="List or copy packaged KetQat example manifests.")
    examples_subcommands = examples_parser.add_subparsers(dest="examples_command", required=True)
    examples_subcommands.add_parser("list", help="List packaged example manifests.")
    copy_parser = examples_subcommands.add_parser("copy", help="Copy a packaged example manifest to a local file.")
    copy_parser.add_argument("name", help="Example name from `ketqat examples list`.")
    copy_parser.add_argument("--output", type=Path, help="Destination YAML path. Defaults to <example>.yaml.")
    args = parser.parse_args()

    if args.command == "run":
        try:
            raw = _read_manifest(args.manifest)
            manifest = yaml.safe_load(raw)
            if not isinstance(manifest, dict):
                raise KetQatValidationError("Manifest YAML must parse to an object.")
            result = run_experiment(manifest)
        except FileNotFoundError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        except yaml.YAMLError as exc:
            print(f"Invalid YAML manifest: {exc}", file=sys.stderr)
            return 2
        except (KetQatValidationError, RuntimeError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 1

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        return 0

    if args.command == "examples":
        if args.examples_command == "list":
            for example in list_example_manifests():
                alias = example.package_path.removeprefix("examples/").removesuffix(".yaml")
                print(f"{example.name}\t{example.domain}\t{alias}\t{example.description}")
            return 0

        if args.examples_command == "copy":
            try:
                example = get_example_manifest(args.name)
                destination = args.output or Path(f"{example.name}.yaml")
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(read_example_manifest(args.name))
                print(f"Wrote {destination}")
                return 0
            except (KeyError, FileNotFoundError) as exc:
                print(str(exc), file=sys.stderr)
                return 2

    return 2


def _read_manifest(value: str) -> str:
    path = Path(value)
    if path.is_file():
        return path.read_text()
    try:
        return read_example_manifest(value)
    except KeyError as exc:
        if path.exists():
            raise
        raise FileNotFoundError(
            f"Manifest file not found and no packaged KetQat example named {value!r} exists. "
            "Run `ketqat examples list` to see available examples."
        ) from exc


if __name__ == "__main__":
    raise SystemExit(main())
