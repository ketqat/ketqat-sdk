from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml

from .runner import run_experiment


def main() -> None:
    parser = argparse.ArgumentParser(prog="ketqat")
    subcommands = parser.add_subparsers(dest="command", required=True)
    run_parser = subcommands.add_parser("run", help="Run a KetQat experiment manifest locally.")
    run_parser.add_argument("manifest", type=Path)
    run_parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "run":
        manifest = yaml.safe_load(args.manifest.read_text())
        result = run_experiment(manifest)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
