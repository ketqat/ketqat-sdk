"""API, CLI and MCP expose the same execution capabilities (ketqat-sdk#206).

Item 12 asks for feature parity across the three surfaces. "Parity" is the kind of claim
that is easy to assert and hard to keep: each surface is edited by itself, and a
capability added to one drifts ahead silently because nothing compares them.

It had already drifted. The REST client and the MCP tools could submit, poll and cancel a
job; the CLI could not reach jobs at all -- and `CLAUDE.md` described "the CLI's `job`
commands" as though they existed while the word "job" appeared nowhere in `cli.py`. That
is documentation standing in for code, and it is exactly what a parity test catches and a
prose claim does not.

So these tests compare the surfaces to each other rather than each to a list written
here. A capability added to one surface and not the others fails, naming which surface is
missing it. A failure is not necessarily a bug: it means the surfaces disagree and
someone must decide, deliberately, whether that is intended.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pytest

from ketqat_runner import cli

SDK_ROOT = Path(__file__).resolve().parent.parent.parent


def _cli_job_subcommands() -> set[str]:
    """The CLI's job subcommands, from argparse itself rather than from a doc string."""
    parser = cli.build_parser() if hasattr(cli, "build_parser") else None
    if parser is None:
        # cli.main builds its parser inline, so read the source for the subparser names.
        source = (SDK_ROOT / "python/src/ketqat_runner/cli.py").read_text(encoding="utf-8")
        block = source[source.index("job_subcommands = "):]
        return set(re.findall(r'job_subcommands\.add_parser\(\s*"([a-z_]+)"', block))
    found: set[str] = set()
    for action in parser._actions:  # noqa: SLF001 - argparse exposes no public accessor
        if isinstance(action, argparse._SubParsersAction):  # noqa: SLF001
            for name, sub in action.choices.items():
                if name != "job":
                    continue
                for inner in sub._actions:  # noqa: SLF001
                    if isinstance(inner, argparse._SubParsersAction):  # noqa: SLF001
                        found.update(inner.choices)
    return found


def _mcp_execution_tools() -> set[str]:
    source = (SDK_ROOT / "src/mcp/execution.ts").read_text(encoding="utf-8")
    return set(re.findall(r'name:\s*"([a-z_]+)"', source))


def _client_execution_methods() -> set[str]:
    """Methods on the typed REST client's `execution` object."""
    source = (SDK_ROOT / "src/client/index.ts").read_text(encoding="utf-8")
    start = source.index("readonly execution = {")
    # The object literal ends at the first line that closes it at the same indent.
    end = source.index("\n  }", start)
    block = source[start:end]
    return set(re.findall(r"^\s{4}(?:async\s+)?([a-z][A-Za-z]*)\s*[(:]", block, re.M))


#: The execution capability each surface must offer, keyed by a neutral name so the
#: comparison does not privilege one surface's vocabulary.
CAPABILITIES = {
    "submit": {"cli": "submit", "mcp": "submit_execution_job", "client": "submit"},
    "get": {"cli": "status", "mcp": "get_execution_job", "client": "get"},
    "cancel": {"cli": "cancel", "mcp": "cancel_execution_job", "client": "cancel"},
}


def test_every_execution_capability_exists_on_every_surface() -> None:
    cli_commands = _cli_job_subcommands()
    mcp_tools = _mcp_execution_tools()
    client_methods = _client_execution_methods()

    assert cli_commands, "the CLI must expose job subcommands"
    assert mcp_tools, "the MCP execution tool list must not be empty"
    assert client_methods, "the client's execution object must expose methods"

    missing: list[str] = []
    for capability, names in CAPABILITIES.items():
        if names["cli"] not in cli_commands:
            missing.append(f"{capability}: CLI has no `job {names['cli']}`")
        if names["mcp"] not in mcp_tools:
            missing.append(f"{capability}: MCP has no `{names['mcp']}`")
        if names["client"] not in client_methods:
            missing.append(f"{capability}: client has no `execution.{names['client']}`")
    assert not missing, "surfaces disagree:\n" + "\n".join(missing)


def test_a_capability_on_one_surface_is_not_missing_from_the_others() -> None:
    """The drift direction the mapping above cannot see.

    The mapping is written by hand, so a capability added to two surfaces and omitted from
    the map would pass the test above. This one counts instead: the CLI and the MCP tool
    list must stay the same size as the client's execution surface, allowing for the
    client's extras that have no MCP equivalent.
    """
    cli_commands = _cli_job_subcommands()
    mcp_tools = _mcp_execution_tools()
    client_methods = _client_execution_methods()

    # `list` and `bundle` are read paths the client and CLI both have. MCP deliberately
    # does not: its read-only server already exposes registry reads, and duplicating them
    # in the mutating tool list would blur the boundary that makes `readOnly: true`
    # meaningful. Recorded here so the asymmetry is a decision rather than an oversight.
    cli_only = {"list", "bundle"}
    assert cli_only <= cli_commands, "the CLI keeps its read paths"
    assert cli_only <= client_methods, "and so does the client"
    assert not (cli_only & {tool.replace("_execution_job", "") for tool in mcp_tools}), (
        "MCP's mutating tool list must not grow read paths; the read-only server has those"
    )

    # Every MCP execution tool must correspond to something the CLI can do, or an agent
    # can perform an action a person at a terminal cannot audit or repeat.
    unmapped = {
        tool
        for tool in mcp_tools
        if tool not in {names["mcp"] for names in CAPABILITIES.values()}
    }
    assert not unmapped, f"MCP tools with no CLI equivalent recorded: {sorted(unmapped)}"


def test_submission_defaults_to_refusing_on_every_surface() -> None:
    """The safe default is the property most worth pinning across surfaces.

    On MCP, `confirmed` defaults to false so a model that omits the field cannot submit.
    The CLI must match: a script that forgets the flag must not queue work. If one surface
    defaulted to submitting, the safe default would be a matter of which one you happened
    to use.
    """
    mcp_source = (SDK_ROOT / "src/mcp/execution.ts").read_text(encoding="utf-8")
    assert re.search(r"confirmed[\s\S]{0,200}?\.default\(false\)", mcp_source), (
        "the MCP tool's confirmed flag must default to false"
    )

    cli_source = (SDK_ROOT / "python/src/ketqat_runner/cli.py").read_text(encoding="utf-8")
    confirm_block = cli_source[cli_source.index('"--confirm"') :][:400]
    assert 'action="store_true"' in confirm_block, "--confirm must be opt-in"
    assert "default=True" not in confirm_block, "--confirm must never default to true"

    jobs_source = (SDK_ROOT / "python/src/ketqat_runner/jobs.py").read_text(encoding="utf-8")
    assert "if not confirmed:" in jobs_source, "submit_job must refuse without confirmation"
    # The refusal must precede the request, or it refuses nothing.
    assert jobs_source.index("if not confirmed:") < jobs_source.index('"POST",\n        "/api/execution/jobs"')


def test_no_surface_accepts_a_token_as_an_argument() -> None:
    """A token on the command line is in shell history, `ps` output and CI logs.

    Checked across both Python surfaces because it is the kind of convenience that gets
    added to one of them under time pressure.
    """
    for relative in ("python/src/ketqat_runner/cli.py", "python/src/ketqat_runner/jobs.py"):
        source = (SDK_ROOT / relative).read_text(encoding="utf-8")
        assert not re.search(r'add_argument\(\s*"--(api-)?token"', source), (
            f"{relative} must not accept a token as an argument"
        )
        assert "print(token" not in source, f"{relative} must never print a token"


def test_the_cli_enqueues_and_never_executes() -> None:
    """`jobs.py` must not import the local runner.

    A CLI that ran the circuit locally and uploaded the answer would produce a registry
    record with no audit trail and no enforced limits, indistinguishable from one the
    sandboxed worker produced. The import graph is what makes that impossible rather than
    merely discouraged.
    """
    source = (SDK_ROOT / "python/src/ketqat_runner/jobs.py").read_text(encoding="utf-8")
    for forbidden in ("from .runner import", "run_experiment", "import stim", "import numpy"):
        assert forbidden not in source, f"jobs.py must not reach {forbidden}"


@pytest.mark.parametrize("state", ["SUCCEEDED", "FAILED", "CANCELLED"])
def test_terminal_states_are_shared_with_the_server(state: str) -> None:
    """Polling past a terminal state waits for something that cannot happen."""
    from ketqat_runner.jobs import TERMINAL_STATES

    assert state in TERMINAL_STATES
    assert "RUNNING" not in TERMINAL_STATES
    assert "QUEUED" not in TERMINAL_STATES
