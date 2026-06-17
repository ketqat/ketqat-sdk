from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from .runner import run_experiment
from .validation import KetQatValidationError


def main() -> int:
    parser = argparse.ArgumentParser(prog="ketqat")
    subcommands = parser.add_subparsers(dest="command", required=True)
    run_parser = subcommands.add_parser("run", help="Run a KetQat experiment manifest locally.")
    run_parser.add_argument("manifest", type=Path)
    run_parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "run":
        try:
            raw = args.manifest.read_text()
            manifest = yaml.safe_load(raw)
            if not isinstance(manifest, dict):
                raise KetQatValidationError("Manifest YAML must parse to an object.")
            result = run_experiment(manifest)
        except yaml.YAMLError as exc:
            print(f"Invalid YAML manifest: {exc}", file=sys.stderr)
            return 2
        except (KetQatValidationError, RuntimeError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 1

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
