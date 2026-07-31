"""One credential, two accepted names (ketqat-sdk#218).

The defect these tests pin: the TypeScript CLI read `KETQAT_TOKEN` while the Settings
page that mints the token, the README, the quickstart and this Python CLI all said
`KETQAT_API_TOKEN`. Following the documentation produced "No API token" with the token
already exported.

The last test is the one that matters over time. Two implementations of one rule, in two
languages, drift silently -- so the TypeScript source is read and its constants compared
with these, rather than assumed to match because they were written on the same day.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from ketqat_runner.token_env import (
    ACCEPTED_TOKEN_VARIABLES,
    CANONICAL_TOKEN_VARIABLE,
    AmbiguousApiTokenError,
    missing_api_token_message,
    resolve_api_token,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TYPESCRIPT_SOURCE = REPOSITORY_ROOT / "src" / "client" / "token.ts"


def test_the_canonical_name_is_the_one_the_settings_page_prints() -> None:
    assert CANONICAL_TOKEN_VARIABLE == "KETQAT_API_TOKEN"
    assert ACCEPTED_TOKEN_VARIABLES[0] == CANONICAL_TOKEN_VARIABLE


def test_the_alias_is_accepted() -> None:
    # The whole point: a shell configured for the old TypeScript CLI keeps working.
    assert resolve_api_token({"KETQAT_TOKEN": "kq_alias"}) == "kq_alias"


def test_the_canonical_name_is_accepted() -> None:
    assert resolve_api_token({"KETQAT_API_TOKEN": "kq_canonical"}) == "kq_canonical"


def test_both_set_to_the_same_token_is_not_a_conflict() -> None:
    environment = {"KETQAT_API_TOKEN": "kq_same", "KETQAT_TOKEN": "kq_same"}
    assert resolve_api_token(environment) == "kq_same"


def test_two_different_tokens_are_refused_rather_than_resolved() -> None:
    # Choosing one would file an owned, immutable record under an identity the user did
    # not pick, and the result would look correct afterwards.
    with pytest.raises(AmbiguousApiTokenError) as raised:
        resolve_api_token({"KETQAT_API_TOKEN": "kq_one", "KETQAT_TOKEN": "kq_two"})
    message = str(raised.value)
    assert "KETQAT_API_TOKEN" in message and "KETQAT_TOKEN" in message


def test_no_error_message_ever_contains_a_token_value() -> None:
    # An error that helpfully echoed the token would put it wherever stderr was captured.
    with pytest.raises(AmbiguousApiTokenError) as raised:
        resolve_api_token({"KETQAT_API_TOKEN": "kq_secret_one", "KETQAT_TOKEN": "kq_secret_two"})
    assert "kq_secret_one" not in str(raised.value)
    assert "kq_secret_two" not in str(raised.value)
    assert "kq_secret" not in missing_api_token_message()


def test_an_empty_value_counts_as_unset() -> None:
    # `export KETQAT_API_TOKEN=` is how a shell clears a variable. Treating the empty
    # string as a token produces a 401 whose message blames the server.
    assert resolve_api_token({"KETQAT_API_TOKEN": ""}) is None
    assert resolve_api_token({"KETQAT_API_TOKEN": "   "}) is None
    # And an empty canonical must not mask a real alias.
    assert resolve_api_token({"KETQAT_API_TOKEN": "", "KETQAT_TOKEN": "kq_real"}) == "kq_real"


def test_nothing_set_returns_none_and_the_message_names_both() -> None:
    assert resolve_api_token({}) is None
    message = missing_api_token_message()
    for name in ACCEPTED_TOKEN_VARIABLES:
        assert name in message
    # The reason a token is not an argument stays in the message; it is the part a user
    # otherwise files a bug about.
    assert "shell history" in message


def test_the_typescript_implementation_accepts_the_same_names() -> None:
    """Read the TypeScript source rather than trust that the two were written together.

    Two implementations of one rule drift, and this rule's failure mode is a user whose
    environment works in one language and not the other -- which is the bug being fixed.
    """
    source = TYPESCRIPT_SOURCE.read_text(encoding="utf-8")

    canonical = re.search(r'CANONICAL_TOKEN_VARIABLE\s*=\s*"([^"]+)"', source)
    assert canonical is not None, "TypeScript no longer declares a canonical variable"
    assert canonical.group(1) == CANONICAL_TOKEN_VARIABLE

    accepted = re.search(r"ACCEPTED_TOKEN_VARIABLES\s*=\s*\[([^\]]*)\]", source)
    assert accepted is not None, "TypeScript no longer declares an accepted-variable list"
    names = re.findall(r'"([^"]+)"', accepted.group(1))
    # The canonical constant is referenced by identifier in that literal, so the quoted
    # names are the remainder; both lists must describe the same set in the same order.
    typescript_names = [CANONICAL_TOKEN_VARIABLE, *names]
    assert typescript_names == list(ACCEPTED_TOKEN_VARIABLES)
