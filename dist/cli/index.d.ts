/**
 * Engine command line.
 *
 * Every command emits a single JSON object on stdout and nothing else, so
 * output is machine-readable by default and the MCP server can reuse the same
 * operations without a second implementation. Human-facing narration goes to
 * stderr, where it cannot corrupt a piped result.
 *
 * The Python `ketqat` command remains the entry point for QEC experiment
 * manifests; this covers the TypeScript engine.
 */
export interface CommandResult {
    exitCode: number;
    stdout?: unknown;
    stderr?: string;
}
export declare function runCli(argv: string[]): CommandResult;
//# sourceMappingURL=index.d.ts.map