from __future__ import annotations

import importlib.metadata
import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

from .runner_version import SDK_VERSION


def _version(package_name: str, import_name: str | None = None) -> str:
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        if import_name:
            try:
                module = __import__(import_name)
                return str(getattr(module, "__version__", "unavailable"))
            except ImportError:
                return "unavailable"
        return "unavailable"


def _git_value(args: list[str], cwd: Path) -> str:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout.strip() or "empty"
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def capture_environment(cwd: Path | None = None) -> dict[str, Any]:
    workdir = cwd or Path.cwd()
    status = _git_value(["status", "--porcelain"], workdir)
    runner_version = _version("ketqat-runner")
    return {
        "operating_system": platform.platform(),
        "architecture": platform.machine() or "unavailable",
        "python_version": sys.version.split()[0],
        "packages": {
            "ketqat-runner": runner_version if runner_version != "unavailable" else SDK_VERSION,
            "stim": _version("stim", "stim"),
            "pymatching": _version("pymatching", "pymatching"),
            "numpy": _version("numpy", "numpy"),
        },
        "hardware": {
            "processor": platform.processor() or "unavailable",
            "git_repository_url": _git_value(["config", "--get", "remote.origin.url"], workdir),
            "git_commit_sha": _git_value(["rev-parse", "HEAD"], workdir),
            "git_dirty": "unavailable" if status == "unavailable" else bool(status),
            "container_image": os.environ.get("KETQAT_CONTAINER_IMAGE", "unspecified"),
        },
    }
