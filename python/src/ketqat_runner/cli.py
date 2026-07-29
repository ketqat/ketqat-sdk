from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from .examples import get_example_manifest, list_example_manifests, read_example_manifest
from .runner import run_experiment
from .publish import (
    DEFAULT_BASE_URL,
    PublishError,
    check_publishable,
    describe_intent,
    load_result,
    publish_result,
)
from .summary import format_run_summary
from .validation import KetQatValidationError


def main() -> int:
    parser = argparse.ArgumentParser(prog="ketqat")
    subcommands = parser.add_subparsers(dest="command", required=True)
    run_parser = subcommands.add_parser("run", help="Run a KetQat experiment manifest locally.")
    run_parser.add_argument("manifest", help="Manifest file path or packaged example name.")
    run_parser.add_argument("--output", type=Path, required=True)
    run_parser.add_argument(
        "--quiet",
        action="store_true",
        help="Write the result file without printing a summary.",
    )

    examples_parser = subcommands.add_parser("examples", help="List or copy packaged KetQat example manifests.")
    examples_subcommands = examples_parser.add_subparsers(dest="examples_command", required=True)
    examples_subcommands.add_parser("list", help="List packaged example manifests.")
    copy_parser = examples_subcommands.add_parser("copy", help="Copy a packaged example manifest to a local file.")
    copy_parser.add_argument("name", help="Example name from `ketqat examples list`.")
    copy_parser.add_argument("--output", type=Path, help="Destination YAML path. Defaults to <example>.yaml.")

    publish_parser = subcommands.add_parser(
        "publish",
        help="Publish a local result file to a KetQat registry.",
        description=(
            "Publish a result produced by `ketqat run`. The API token is read from the "
            "KETQAT_API_TOKEN environment variable and is deliberately not a command-line "
            "option: arguments are visible in shell history, in `ps` output to other users, "
            "and in CI logs."
        ),
    )
    publish_parser.add_argument("result", type=Path, help="Result JSON written by `ketqat run`.")
    publish_parser.add_argument(
        "--base-url", default=DEFAULT_BASE_URL, help=f"Registry base URL. Defaults to {DEFAULT_BASE_URL}."
    )
    publish_parser.add_argument(
        "--visibility",
        choices=["PUBLIC", "PRIVATE"],
        help="Requested visibility. The registry decides its own default when omitted.",
    )
    publish_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check the result and print what would be sent, without publishing.",
    )

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
        if not args.quiet:
            print(format_run_summary(result, str(args.output)))
        return 0

    if args.command == "publish":
        try:
            result = load_result(args.result)
            # Everything checkable is checked before the network is touched, so
            # a failure names what happened rather than arriving as a 400.
            check_publishable(result)
        except PublishError as exc:
            print(str(exc), file=sys.stderr)
            return 1

        print("Publishing this run:")
        print(describe_intent(result, args.base_url, args.visibility))

        if args.dry_run:
            print("\nDry run: nothing was sent.")
            return 0

        # stdout is block-buffered when redirected while stderr is not, so an
        # error would otherwise appear above the intent it refers to.
        sys.stdout.flush()
        try:
            response = publish_result(result, base_url=args.base_url, visibility=args.visibility)
        except PublishError as exc:
            print(f"\n{exc}", file=sys.stderr)
            return 1

        url = response.get("run_url")
        if url:
            print(f"\nPublished: {args.base_url.rstrip('/')}{url}")
        else:
            print("\nPublished.")
        if response.get("existing"):
            print("An identical result was already imported; this did not create a second run.")
        quota = response.get("quota")
        if quota:
            remaining = quota.get("X-Quota-Remaining")
            if remaining is not None:
                print(f"Quota remaining today: {remaining}")
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
