/**
 * MCP stdio transport (ketqat-sdk#163).
 *
 * The tool layer beside this file has defined seven read-only tools for some
 * time with no transport, so nothing could connect to them. Tools without a
 * transport are a library, not a server.
 *
 * **Why the protocol is implemented here rather than imported.** This package
 * has exactly one runtime dependency (zod), and MCP over stdio is
 * newline-delimited JSON-RPC 2.0 -- small and fully specified. Taking the
 * official SDK as a runtime dependency to gain roughly two hundred lines would
 * work against keeping this package light.
 *
 * That trade is only defensible with conformance evidence, so the official SDK
 * *is* a devDependency and the tests drive this server with the **real MCP
 * client** over a real pipe. A hand-rolled transport tested against a
 * hand-rolled client proves that two of my own misreadings agree.
 *
 * **Security.** stdio has no authentication and none is invented here: the
 * transport is a pipe between a parent and child process, and the client already
 * has whatever access the process does. Two consequences are enforced rather
 * than documented. Every tool is read-only, and a tool declaring otherwise is
 * refused at startup rather than served. And nothing is written to stdout except
 * protocol frames -- a stray `console.log` corrupts the stream, so diagnostics
 * go to stderr.
 *
 * This must not be exposed over a network. There is no transport here that
 * could be, which is deliberate.
 */
/** Protocol revisions this server will accept, newest first. */
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly ["2025-06-18", "2025-03-26", "2024-11-05"];
export declare const SERVER_INFO: {
    readonly name: "ketqat-engine";
    readonly version: "0.2.0";
};
interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: unknown;
}
type JsonRpcResponse = {
    jsonrpc: "2.0";
    id: string | number | null;
    result: unknown;
} | {
    jsonrpc: "2.0";
    id: string | number | null;
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
};
/**
 * JSON Schema for each tool, derived from its zod schema.
 *
 * Derived rather than written by hand. MCP clients need JSON Schema and this
 * package's source of truth is zod; maintaining both by hand would let them
 * drift, and a client would then be validating against something the handler
 * does not enforce.
 */
export declare function toolManifest(): Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: unknown;
    annotations: {
        readOnlyHint: boolean;
    };
}>;
/**
 * Handle one decoded request and return a response, or null for a notification.
 *
 * Separated from the stream so it can be tested directly and so the framing
 * layer has no branching in it.
 */
export declare function handleRequest(request: JsonRpcRequest): JsonRpcResponse | null;
/**
 * The parts of a readable stream this transport uses, declared structurally.
 *
 * Not `node:stream`'s `Readable`. Naming that type in an exported signature puts
 * `node:stream` into the published .d.ts, which makes `@types/node` a
 * requirement for every consumer of this package -- and the clean-install check
 * caught exactly that. A structural shape keeps the published types
 * self-contained while `process.stdin` still satisfies it.
 */
export interface FrameInput {
    on(event: string, listener: (...args: never[]) => void): unknown;
    setEncoding?(encoding: string): unknown;
}
/** The one method this transport needs to emit frames. */
export interface FrameOutput {
    write(chunk: string): unknown;
}
export interface ServeOptions {
    input?: FrameInput;
    output?: FrameOutput;
    /** Diagnostics sink. Never stdout, which carries protocol frames only. */
    log?: (message: string) => void;
}
/**
 * Serve MCP over newline-delimited JSON on a pair of streams.
 *
 * Returns a promise that settles when the input closes, so a caller can await
 * shutdown rather than guess at it.
 */
export declare function serveStdio(options?: ServeOptions): Promise<void>;
export {};
//# sourceMappingURL=transport.d.ts.map