/**
 * Where the API token comes from (ketqat-sdk#218).
 *
 * One credential had two names, split by language. `KETQAT_API_TOKEN` is what the
 * Settings page prints next to the token it just minted, and what the README, the
 * quickstart and the Python CLI use. `KETQAT_TOKEN` is what the TypeScript CLI read.
 * A user who followed the page that gave them the token and then ran `ketqat` was told
 * "No API token. Set KETQAT_TOKEN" -- naming a variable no document mentions, while the
 * token they were holding was already exported.
 *
 * Both names are accepted. `KETQAT_API_TOKEN` is canonical because it is the one a user
 * is most likely to have seen: it appears at the moment the token exists.
 *
 * **Two different values is an error, not a preference.** Picking one silently would
 * publish an owned, immutable scientific record under an identity the user did not
 * choose, and nothing about the run would look wrong afterwards. Refusing costs one
 * message; guessing costs a record nobody can tell is misattributed.
 *
 * No function here puts a token value in a message. The variable *names* are safe to
 * print; the values are not, and an error that helpfully echoed the token would put it
 * in whatever captured stderr.
 */
/** The name to use, and the name every document should state. */
export declare const CANONICAL_TOKEN_VARIABLE = "KETQAT_API_TOKEN";
/** Accepted names, canonical first. Order is the preference order. */
export declare const ACCEPTED_TOKEN_VARIABLES: readonly ["KETQAT_API_TOKEN", "KETQAT_TOKEN"];
/** Both variables are set, to different tokens. Which identity was meant is unknowable. */
export declare class AmbiguousApiTokenError extends Error {
    constructor(names: readonly string[]);
}
/** What to say when no token is set. Shared so the CLI and the client say the same thing. */
export declare function missingApiTokenMessage(): string;
/**
 * The token, from whichever accepted variable holds one.
 *
 * Empty and whitespace-only values are treated as unset: `export KETQAT_API_TOKEN=` is how a
 * shell script clears a variable, and honouring it as a token produces a 401 whose message
 * blames the server.
 *
 * @throws AmbiguousApiTokenError when two accepted variables hold different tokens.
 */
export declare function resolveApiToken(environment?: Record<string, string | undefined>): string | undefined;
//# sourceMappingURL=token.d.ts.map