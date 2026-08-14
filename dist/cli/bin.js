#!/usr/bin/env node
import { runCli } from "./index.js";
/**
 * Write and wait, then exit.
 *
 * `process.stdout.write(...)` followed by `process.exit(...)` silently
 * truncated output at the pipe buffer. Node's stdout is synchronous to a file
 * and **asynchronous to a pipe**, so `process.exit` discarded whatever had not
 * flushed:
 *
 *     ketqat reference bundle rsa-2048-gidney-ekera > file   167,403 bytes
 *     ketqat reference bundle rsa-2048-gidney-ekera | cat     65,536 bytes
 *
 * Exactly 64 KiB, and the JSON ends mid-token — so piping into `jq`, into a
 * file via `|`, or into any other program produced a parse error on a command
 * that had actually succeeded. Every large output was affected: bundles,
 * reports, and the comparison CSV.
 *
 * Found by piping a real bundle from production into a parser (ketqat-sdk#245).
 */
async function write(stream, text) {
    await new Promise((resolve, reject) => {
        stream.write(text, (error) => (error ? reject(error) : resolve()));
    });
}
const result = await runCli(process.argv.slice(2));
if (result.stderr) {
    await write(process.stderr, `${result.stderr}\n`);
}
if (result.stdout !== undefined) {
    // Exactly one JSON object on stdout, so output stays pipeable -- and a
    // string passes through as-is, because CSV is not JSON and quoting it would
    // defeat the point of offering the format.
    const text = typeof result.stdout === "string" ? result.stdout : `${JSON.stringify(result.stdout, null, 2)}\n`;
    await write(process.stdout, text);
}
// `exitCode` rather than `exit()`: setting it lets Node drain and close its
// streams normally. `exit()` here would reintroduce the truncation this file
// exists to prevent.
process.exitCode = result.exitCode;
//# sourceMappingURL=bin.js.map