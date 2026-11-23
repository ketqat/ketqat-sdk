"""`ketqat catalog | runs | report | pro` subcommands.

Network-free commands (`catalog search/show/run`, `runs`, and the deprecated
`pro` commands) import nothing that can open a connection. `report` imports the
network module inside its own branch.

Every KetQat SDK product is free and open source. `ketqat pro login|status|install`
remain only so that existing scripts do not break: they print that nothing needs
to be installed or unlocked and exit 0, without contacting a server.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from ..endpoints import DEFAULT_BASE_URL

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_USAGE = 2


def add_parsers(subcommands: Any) -> None:
    catalog = subcommands.add_parser(
        "catalog",
        help="Search, inspect, install and run official KetQat catalog products locally.",
        description="Official KetQat catalog products, run on this machine. Works offline.",
    )
    catalog_sub = catalog.add_subparsers(dest="catalog_command", required=True)

    search = catalog_sub.add_parser("search", help="Search the bundled catalog.")
    search.add_argument("query", nargs="?", default=None, help="Words that must all appear.")
    search.add_argument(
        "--category",
        choices=["quantum-algorithms", "quantum-error-correction", "quantum-information"],
    )
    # "pro" is still accepted so old scripts do not fail; no product has that tier since 0.4.0.
    search.add_argument("--tier", choices=["free", "pro"])
    search.add_argument("--json", action="store_true", help="Print JSON instead of a table.")

    show = catalog_sub.add_parser("show", help="Show a product: description, origin, install line, example.")
    show.add_argument("product", help="Product ID or slug.")
    show.add_argument("--version", help="Show this version's entry instead of the current one.")
    show.add_argument("--json", action="store_true", help="Print the full product definition.")

    install = catalog_sub.add_parser(
        "install",
        help="pip-install exactly the extras a product needs (asks first).",
    )
    install.add_argument("product", help="Product ID or slug, optionally @VERSION.")
    install.add_argument("--yes", action="store_true", help="Do not ask before running pip.")

    run = catalog_sub.add_parser(
        "run",
        help="Run a product locally and write a run record.",
        description=(
            "Runs on this machine and never contacts a server. Every product is free and open "
            "source; no account, login or entitlement is involved."
        ),
    )
    run.add_argument("product", help="Product ID or slug, optionally pinned as slug@1.0.0.")
    run.add_argument(
        "--param",
        "-p",
        action="append",
        default=[],
        metavar="NAME=VALUE",
        help="A product parameter. Repeat for several. Values are read as JSON when they parse.",
    )
    run.add_argument("--seed", type=int, help="Random seed. A fresh one is chosen and recorded when omitted.")
    run.add_argument("--output", type=Path, help="Also copy the run record to DIR/<run-id>.json.")
    run.add_argument("--json", action="store_true", help="Print the full run record as JSON.")

    runs = subcommands.add_parser("runs", help="Local catalog run records.")
    runs_sub = runs.add_subparsers(dest="runs_command", required=True)
    runs_list = runs_sub.add_parser("list", help="List run records, newest first.")
    runs_list.add_argument("--json", action="store_true")
    runs_show = runs_sub.add_parser("show", help="Show one run record.")
    runs_show.add_argument("run_id")

    report = subcommands.add_parser(
        "report",
        help="Opt in: report that a run happened (product, version, status, time, SDK version only).",
        description=(
            "Prints the exact JSON that would be sent, then asks before sending. Parameters, "
            "results, file paths and environment are never sent. The API token is read from "
            "KETQAT_API_TOKEN (KETQAT_TOKEN is also accepted) and is never a command-line option."
        ),
    )
    report.add_argument("run_id")
    report.add_argument("--yes", action="store_true", help="Send without asking.")
    report.add_argument("--base-url", default=DEFAULT_BASE_URL)

    pro = subcommands.add_parser(
        "pro",
        help="Deprecated: every SDK product is free and open source; nothing to log in to or unlock.",
        description=(
            "Deprecated since 0.4.0. All KetQat SDK products are free and open source (Apache-2.0) "
            "and run from this package. These commands only print that and exit 0; they contact "
            "no server and read or write no files."
        ),
    )
    pro_sub = pro.add_subparsers(dest="pro_command", required=True)
    # The old arguments are still accepted, and ignored, so existing scripts keep working.
    login = pro_sub.add_parser("login", help="Deprecated; does nothing.")
    login.add_argument("--base-url", default=DEFAULT_BASE_URL, help=argparse.SUPPRESS)
    pro_sub.add_parser("status", help="Deprecated; does nothing.")
    pro_install = pro_sub.add_parser("install", help="Deprecated; use `ketqat catalog install`.")
    pro_install.add_argument("product", nargs="?", help="Product ID or slug, optionally @VERSION.")
    pro_install.add_argument("--base-url", default=DEFAULT_BASE_URL, help=argparse.SUPPRESS)


def run(args: argparse.Namespace) -> int:
    from .loader import CatalogError
    from .params import ParameterError
    from .records import RunRecordError

    try:
        if args.command == "catalog":
            return _catalog(args)
        if args.command == "runs":
            return _runs(args)
        if args.command == "report":
            return _report(args)
        if args.command == "pro":
            return _pro(args)
    except (ParameterError, RunRecordError) as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_USAGE
    except CatalogError as exc:
        from .execute import ProductRunError

        print(str(exc), file=sys.stderr)
        if isinstance(exc, ProductRunError) and exc.record.path:
            print(f"A failed run record was written to {exc.record.path}.", file=sys.stderr)
            return EXIT_FAILED
        return EXIT_USAGE
    return EXIT_USAGE


# ---------------------------------------------------------------------- catalog


def _catalog(args: argparse.Namespace) -> int:
    from . import load_catalog

    catalog = load_catalog()
    if args.catalog_command == "search":
        found = catalog.search(args.query, category=args.category, tier=args.tier)
        if args.json:
            print(json.dumps([_listing(product) for product in found], indent=2))
            return EXIT_OK
        if not found:
            print("No products match.")
            return EXIT_OK
        for product in found:
            current = product.current_version["version"]
            print(f"{product.slug}@{current}\t{product.tier}\t{product.category}\t{product.definition['summary']}")
        return EXIT_OK

    if args.catalog_command == "show":
        product, pinned = catalog.resolve(args.product)
        version_entry = product.version(args.version or pinned)
        if args.json:
            print(json.dumps(product.definition, indent=2, ensure_ascii=False))
            return EXIT_OK
        print(_describe(product, version_entry))
        return EXIT_OK

    if args.catalog_command == "install":
        product, pinned = catalog.resolve(args.product)
        version_entry = product.version(pinned)
        return _install_extras(product, version_entry, assume_yes=args.yes)

    if args.catalog_command == "run":
        return _run_product(args, catalog)
    return EXIT_USAGE


def _listing(product: Any) -> dict[str, Any]:
    definition = product.definition
    return {
        "id": product.id,
        "slug": product.slug,
        "name": product.name,
        "tier": product.tier,
        "category": product.category,
        "subcategory": definition["subcategory"],
        "currentVersion": product.current_version["version"],
        "summary": definition["summary"],
    }


def _describe(product: Any, version_entry: dict[str, Any]) -> str:
    d = product.definition
    lines = [
        f"{d['name']}  ({product.id})",
        f"  {d['summary']}",
        "",
        f"Slug:            {product.slug}",
        f"Category:        {d['category']} / {d['subcategory']}",
        f"Tier:            {d['tier']}    License: {d['license']}",
        f"Version:         {version_entry['version']} ({version_entry['status']}, {version_entry['date']})",
        f"Kind:            {d['executionKind']}    Status: {d['implementationStatus']}",
        f"Extras:          {', '.join(version_entry['extras']) or '(none)'}",
        f"Resources:       {d['environment']['resources']}",
        "",
        "Origin:",
        f"  {d['origin']['statement']}",
    ]
    for upstream in d["origin"]["upstream"]:
        lines.append(f"  upstream: {upstream['name']} ({upstream['license']}) {upstream['url']}")
    lines += ["", "Inputs:"]
    for field in d["inputs"]:
        default = f" = {json.dumps(field['default'])}" if "default" in field else " (required)"
        lines.append(f"  {field['name']}: {field['type']}{default} -- {field['description']}")
    lines += ["", "Install:", f"  {d['install']}", "", "Run:"]
    lines.append(f"  ketqat catalog run {product.slug}@{version_entry['version']} --param NAME=VALUE ...")
    lines += ["", "Example (Python):"]
    lines += [f"  {line}" for line in d["example"]["code"].splitlines()]
    lines += ["", "Limitations:"]
    lines += [f"  - {item}" for item in d["science"]["limitations"]]
    lines += ["", "References:"]
    for reference in d["references"]:
        locator = reference.get("doi") and f"doi:{reference['doi']}" or reference.get("url", "")
        lines.append(f"  - {', '.join(reference['authors'])} ({reference['year']}). {reference['title']}. {locator}".rstrip())
    return "\n".join(lines)


def _requirement_for(extras: list[str]) -> tuple[list[str], str]:
    """pip arguments that install `extras` from the same source as this installation."""
    import importlib.metadata

    extra_text = f"[{','.join(extras)}]"
    try:
        direct = json.loads(importlib.metadata.distribution("ketqat").read_text("direct_url.json") or "null")
    except importlib.metadata.PackageNotFoundError:
        direct = None
    if isinstance(direct, dict):
        url = direct.get("url", "")
        vcs = direct.get("vcs_info") or {}
        subdirectory = direct.get("subdirectory")
        if vcs.get("vcs") == "git" and vcs.get("commit_id"):
            fragment = f"#subdirectory={subdirectory}" if subdirectory else ""
            return [f"ketqat{extra_text} @ git+{url}@{vcs['commit_id']}{fragment}"], "the same git commit"
        if url.startswith("file://"):
            from urllib.parse import unquote, urlparse

            path = unquote(urlparse(url).path)
            if (direct.get("dir_info") or {}).get("editable"):
                return ["-e", f"{path}{extra_text}"], "the same local checkout (editable)"
            return [f"{path}{extra_text}"], "the same local source"
    from ..runner_version import SDK_VERSION

    return [f"ketqat{extra_text}=={SDK_VERSION}"], "the package index"


def _install_extras(product: Any, version_entry: dict[str, Any], *, assume_yes: bool) -> int:
    # `pro` installs nothing since 0.4.0; historical version entries may still list it.
    extras = [extra for extra in version_entry["extras"] if extra != "pro"]
    if not extras:
        print(f"{product.slug}@{version_entry['version']} needs no extras; it runs with the base install.")
        return EXIT_OK
    requirement, source = _requirement_for(extras)
    command = [sys.executable, "-m", "pip", "install", *requirement]
    print(f"{product.slug}@{version_entry['version']} needs the extras: {', '.join(extras)}")
    print(f"This will run (installing from {source}):")
    print("  " + " ".join(_quote(part) for part in command))
    if not assume_yes:
        if not sys.stdin.isatty():
            print("Not a terminal; pass --yes to install without asking. Nothing was installed.", file=sys.stderr)
            return EXIT_USAGE
        answer = input("Proceed? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("Nothing was installed.")
            return EXIT_OK
    return subprocess.call(command)


def _quote(part: str) -> str:
    import shlex

    return shlex.quote(part)


def _run_product(args: argparse.Namespace, catalog: Any) -> int:
    from .execute import run as run_product
    from .params import parse_cli_assignments

    product, _ = catalog.resolve(args.product)
    params = parse_cli_assignments(args.param, product.inputs)
    record = run_product(args.product, seed=args.seed, **params)
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        destination = args.output / f"{record.run_id}.json"
        shutil.copyfile(record.path, destination)
    if args.json:
        print(json.dumps(record.to_dict(), indent=2, ensure_ascii=False))
        return EXIT_OK
    print(f"{product.slug}@{record.product_version}: {record.status}")
    print(f"Run ID:        {record.run_id}")
    print(f"Seed:          {record.seed}")
    print(f"Record:        {record.path}")
    if args.output:
        print(f"Copied to:     {args.output / (record.run_id + '.json')}")
    print(f"resultSha256:  {record.result_sha256}")
    print("Result (scalar fields; the record holds everything):")
    for key, value in record.result.items():
        if not isinstance(value, (dict, list)):
            print(f"  {key}: {json.dumps(value)}")
    return EXIT_OK


# ------------------------------------------------------------------------- runs


def _runs(args: argparse.Namespace) -> int:
    from .records import list_records, load_record

    if args.runs_command == "list":
        records = list_records()
        if args.json:
            print(json.dumps([_run_summary(record) for record in records], indent=2))
            return EXIT_OK
        if not records:
            print("No run records yet.")
            return EXIT_OK
        for record in records:
            print(f"{record.run_id}\t{record.product_id}@{record.product_version}\t{record.status}\t{record.finished_at}")
        return EXIT_OK
    record = load_record(args.run_id)
    data = record.to_dict()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    if not record.verify_result_hash():
        print("WARNING: resultSha256 does not match the stored result; the record was edited.", file=sys.stderr)
        return EXIT_FAILED
    return EXIT_OK


def _run_summary(record: Any) -> dict[str, Any]:
    return {
        "runId": record.run_id,
        "productId": record.product_id,
        "productVersion": record.product_version,
        "status": record.status,
        "finishedAt": record.finished_at,
        "resultSha256": record.result_sha256,
    }


# ----------------------------------------------------------------------- report


def _report(args: argparse.Namespace) -> int:
    from .records import load_record
    from .report import USAGE_REPORT_PATH, build_payload

    record = load_record(args.run_id)
    payload = build_payload(record)
    destination = args.base_url.rstrip("/") + USAGE_REPORT_PATH
    print(f"This exact JSON would be sent to POST {destination}:")
    print(json.dumps(payload, indent=2))
    print("Nothing else is sent: no parameters, results, file paths, environment or host names.")
    if not args.yes:
        if not sys.stdin.isatty():
            print("Not a terminal; pass --yes to send. Nothing was sent.", file=sys.stderr)
            return EXIT_USAGE
        answer = input("Send this report? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("Nothing was sent.")
            return EXIT_OK
    sys.stdout.flush()
    from .net import ApiError
    from .report import send

    try:
        send(record, args.base_url)
    except ApiError as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_FAILED
    print("Sent. Re-sending this run reuses the same clientReportId, so it is counted once.")
    return EXIT_OK


# -------------------------------------------------------------------------- pro

PRO_RETIRED_MESSAGE = (
    "All KetQat SDK algorithms and software products are free and open source (Apache-2.0).\n"
    "Nothing needs to be installed or unlocked: every catalog product ships with this package\n"
    "and runs locally with no account, login, entitlement, network access or telemetry.\n"
    "\n"
    "  ketqat catalog install <slug>   add the optional dependencies a product needs\n"
    "  ketqat catalog run <slug>       run it\n"
    "\n"
    "KetQat Academy Pro is a separate educational subscription on ketqat.com; it is not\n"
    "required for any SDK functionality.\n"
    "\n"
    "`ketqat pro {command}` is deprecated and did nothing: no server was contacted and no file\n"
    "was read or written. Files an earlier SDK cached under $KETQAT_HOME/pro/ are left as they\n"
    "are and are no longer used; your run records are unchanged."
)


def _pro(args: argparse.Namespace) -> int:
    """Deprecated since 0.4.0: explain, exit 0, touch nothing."""
    print(PRO_RETIRED_MESSAGE.format(command=args.pro_command))
    product = getattr(args, "product", None)
    if args.pro_command == "install" and product:
        print(f"\nFor {product}: ketqat catalog install {product}")
    return EXIT_OK
