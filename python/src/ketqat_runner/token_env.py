"""Where the API token comes from (ketqat-sdk#218).

One credential had two names, split by language. This module and
`src/client/token.ts` implement the same rules so the Python CLI and the TypeScript
CLI accept the same environment, and a `python/tests` case asserts the two agree
rather than trusting that they were written together.

`KETQAT_API_TOKEN` is canonical because it is the name a user is most likely to have
seen: the Settings page prints it beside the token at the moment the token exists.
`KETQAT_TOKEN` is accepted because the TypeScript CLI read only that one for as long
as it existed, so it is already in people's shells and scripts.

**Two different values is an error, not a preference.** A job and its results are
owned; choosing one silently would file an immutable record under an identity the
user did not pick, and nothing about the result would afterwards look wrong.

No function here puts a token value into a message. The variable *names* are safe to
print; an error that echoed the token would put it wherever stderr was captured.
"""

from __future__ import annotations

import os
from collections.abc import Mapping

#: The name to use, and the name every document should state.
CANONICAL_TOKEN_VARIABLE = "KETQAT_API_TOKEN"

#: Accepted names, canonical first. Order is the preference order.
ACCEPTED_TOKEN_VARIABLES: tuple[str, ...] = (CANONICAL_TOKEN_VARIABLE, "KETQAT_TOKEN")


class AmbiguousApiTokenError(Exception):
    """Both variables are set, to different tokens. Which identity was meant is unknowable."""


def missing_api_token_message() -> str:
    """What to say when no token is set. One wording, shared by every caller."""
    return (
        f"No API token. Set {CANONICAL_TOKEN_VARIABLE} in your environment "
        f"({ACCEPTED_TOKEN_VARIABLES[1]} is also accepted). Mint one under Settings on "
        "ketqat.com.\n"
        "It is deliberately not a command-line option: arguments are visible in shell "
        "history, in `ps` output to other users, and in CI logs."
    )


def resolve_api_token(environment: Mapping[str, str] | None = None) -> str | None:
    """The token, from whichever accepted variable holds one.

    Empty and whitespace-only values count as unset: `export KETQAT_API_TOKEN=` is how a
    shell clears a variable, and treating it as a token produces a 401 whose message
    blames the server.

    Raises:
        AmbiguousApiTokenError: two accepted variables hold different tokens.
    """
    source = os.environ if environment is None else environment
    present = [
        (name, value)
        for name in ACCEPTED_TOKEN_VARIABLES
        if (value := source.get(name, "").strip())
    ]
    if not present:
        return None

    if len({value for _, value in present}) > 1:
        names = " and ".join(name for name, _ in present)
        raise AmbiguousApiTokenError(
            f"{names} are both set, to different values. Refusing rather than choosing one: "
            "a job and its results are owned, so the wrong choice files a record under the "
            "wrong identity. Unset one, or set both to the same token."
        )

    # Canonical is first in ACCEPTED_TOKEN_VARIABLES, so this is the canonical one when
    # both are set to the same value.
    return present[0][1]
