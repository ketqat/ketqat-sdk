from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from .examples import get_example_manifest, list_example_manifests, read_example_manifest
from .runner import run_experiment
from .token_env import CANONICAL_TOKEN_VARIABLE as JOB_TOKEN_VARIABLE
from .jobs import (
    JobError,
    cancel_job,
    get_job,
    job_bundle,
    list_jobs,
    submit_job,
    summarize_job,
)
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
            "KETQAT_API_TOKEN environment variable (KETQAT_TOKEN is also accepted) and is "
            "deliberately not a command-line option: arguments are visible in shell history, "
            "in `ps` output to other users, and in CI logs."
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

    # Job commands. Item 12 asks for parity across API, CLI and MCP; the REST API and the
    # MCP tools could submit, poll and cancel, and the CLI could not reach jobs at all.
    # These enqueue and never execute -- a CLI that ran a circuit locally and uploaded the
    # answer would produce a record with no audit trail and no enforced limits.
    job_parser = subcommands.add_parser(
        "job",
        help="Queue, poll and cancel sandboxed execution jobs.",
        description=(
            "Jobs run in a separate sandboxed worker, never in this process. The API token is "
            f"read from the {JOB_TOKEN_VARIABLE} environment variable, the same one `ketqat publish` "
            "uses, and is deliberately not a command-line option."
        ),
    )
    job_subcommands = job_parser.add_subparsers(dest="job_command", required=True)

    job_submit = job_subcommands.add_parser(
        "submit",
        help="Queue a circuit for sandboxed simulation.",
        description=(
            "Prints what would run and exits without queueing unless --confirm is given. The "
            "default is to refuse, so a scripted invocation that forgets the flag cannot submit."
        ),
    )
    job_submit.add_argument("qasm", type=Path, help="OpenQASM 3 file to simulate.")
    job_submit.add_argument("--shots", type=int, default=1024, help="Shots to sample. Defaults to 1024.")
    job_submit.add_argument(
        "--operation", default="simulate", help="Worker operation. Defaults to simulate."
    )
    job_submit.add_argument(
        "--confirm",
        action="store_true",
        help="Actually queue the job. Without this the command only reports what would run.",
    )
    job_submit.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Defaults to {DEFAULT_BASE_URL}.")

    job_status = job_subcommands.add_parser("status", help="Show one job's current state.")
    job_status.add_argument("job_id")
    job_status.add_argument("--base-url", default=DEFAULT_BASE_URL)

    job_list = job_subcommands.add_parser("list", help="List your jobs, most recent first.")
    job_list.add_argument("--status", help="Filter by status, e.g. QUEUED or RUNNING.")
    job_list.add_argument("--limit", type=int, default=20)
    job_list.add_argument("--base-url", default=DEFAULT_BASE_URL)

    job_cancel = job_subcommands.add_parser(
        "cancel",
        help="Request cancellation of a job.",
        description=(
            "A request, not an interruption. A queued job is cancelled outright; a running one "
            "records the request and stops at its next transition."
        ),
    )
    job_cancel.add_argument("job_id")
    job_cancel.add_argument("--base-url", default=DEFAULT_BASE_URL)

    job_bundle_parser = job_subcommands.add_parser(
        "bundle", help="Fetch the reproducibility bundle for a finished job."
    )
    job_bundle_parser.add_argument("job_id")
    job_bundle_parser.add_argument("--output", type=Path, help="Write the bundle here instead of stdout.")
    job_bundle_parser.add_argument("--base-url", default=DEFAULT_BASE_URL)

    args = parser.parse_args()

    if args.command == "job":
        try:
            if args.job_command == "submit":
                qasm = args.qasm.read_text(encoding="utf-8")
                # The refusal path raises with the description, so the safe default and the
                # explanation are one thing rather than two that can disagree.
                job = submit_job(
                    operation=args.operation,
                    qasm=qasm,
                    shots=args.shots,
                    confirmed=args.confirm,
                    base_url=args.base_url,
                )
                print("Queued a sandboxed execution job.")
                print(summarize_job(job))
                print(f"\nPoll it with: ketqat job status {job.get('id', '<id>')}")
                return 0

            if args.job_command == "status":
                print(summarize_job(get_job(args.job_id, base_url=args.base_url)))
                return 0

            if args.job_command == "list":
                payload = list_jobs(status=args.status, limit=args.limit, base_url=args.base_url)
                entries = payload.get("jobs") or []
                if not entries:
                    print("No jobs." if not args.status else f"No jobs with status {args.status}.")
                    return 0
                for entry in entries:
                    print(summarize_job(entry))
                    print()
                return 0

            if args.job_command == "cancel":
                job = cancel_job(args.job_id, base_url=args.base_url)
                # Never reported as "cancelled" for a running job: the worker is not
                # interrupted, so that claim would be untrue.
                print("Cancellation requested.")
                print(summarize_job(job))
                return 0

            if args.job_command == "bundle":
                bundle = job_bundle(args.job_id, base_url=args.base_url)
                text = json.dumps(bundle, indent=2, sort_keys=True)
                if args.output:
                    args.output.write_text(text + "\n", encoding="utf-8")
                    print(f"Wrote the bundle to {args.output}.")
                else:
                    print(text)
                return 0
        except JobError as error:
            # The refusal-without-confirm path arrives here too, and it is not a failure of
            # the command: it is the command doing what it is for. Exit 2 distinguishes it
            # from a transport or authorization error.
            print(str(error), file=sys.stderr)
            return 2 if not getattr(args, "confirm", True) else 1
        except OSError as error:
            print(f"Could not read {args.qasm}: {error}", file=sys.stderr)
            return 1

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
