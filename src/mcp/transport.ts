import type { Readable, Writable } from "node:stream"
import { zodToJsonSchema } from "zod-to-json-schema"
import { MCP_TOOLS, callTool, type McpToolError } from "./index.js"
import { SDK_VERSION } from "../version.js"

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
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const

export const SERVER_INFO = {
  name: "ketqat-engine",
  version: SDK_VERSION,
} as const

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: unknown
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } }

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

/**
 * JSON Schema for each tool, derived from its zod schema.
 *
 * Derived rather than written by hand. MCP clients need JSON Schema and this
 * package's source of truth is zod; maintaining both by hand would let them
 * drift, and a client would then be validating against something the handler
 * does not enforce.
 */
export function toolManifest(): Array<{
  name: string
  title: string
  description: string
  inputSchema: unknown
  annotations: { readOnlyHint: boolean }
}> {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema, { target: "jsonSchema7" }),
    // Advertised so a client can decide what to allow without calling it first.
    annotations: { readOnlyHint: tool.readOnly },
  }))
}

function isToolError(value: unknown): value is McpToolError {
  return typeof value === "object" && value !== null && "error" in value
}

/**
 * Handle one decoded request and return a response, or null for a notification.
 *
 * Separated from the stream so it can be tested directly and so the framing
 * layer has no branching in it.
 */
export function handleRequest(request: JsonRpcRequest): JsonRpcResponse | null {
  const id = request.id ?? null

  // Notifications carry no id and must not be answered. Replying to one is a
  // protocol violation that some clients treat as fatal.
  const isNotification = request.id === undefined || request.id === null

  if (request.jsonrpc !== "2.0") {
    if (isNotification) return null
    return { jsonrpc: "2.0", id, error: { code: INVALID_REQUEST, message: "Expected jsonrpc 2.0." } }
  }

  switch (request.method) {
    case "initialize": {
      const requested = (request.params as { protocolVersion?: string } | undefined)?.protocolVersion
      // Echo the client's version when it is one we support, otherwise offer our
      // newest. Silently claiming the client's version would be worse: it
      // promises behaviour that has not been implemented.
      const agreed =
        requested && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0]
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: agreed,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        },
      }
    }

    case "notifications/initialized":
      return null

    case "ping":
      return isNotification ? null : { jsonrpc: "2.0", id, result: {} }

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: toolManifest() } }

    case "tools/call": {
      const params = request.params as { name?: string; arguments?: unknown } | undefined
      if (!params?.name) {
        return { jsonrpc: "2.0", id, error: { code: INVALID_PARAMS, message: "tools/call needs a tool name." } }
      }

      let outcome: unknown
      try {
        outcome = callTool(params.name, params.arguments ?? {})
      } catch (error) {
        // A thrown handler is an internal fault, distinct from a tool that
        // reports a problem in its result. Collapsing the two would hide bugs.
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INTERNAL_ERROR, message: `${params.name} threw: ${(error as Error).message}` },
        }
      }

      // A tool that rejects its input is a *successful* call reporting a
      // failure, so it returns isError rather than a JSON-RPC error. Clients
      // show tool errors to the model to recover from; protocol errors they
      // treat as broken plumbing.
      const failed = isToolError(outcome)
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
          structuredContent: failed ? undefined : outcome,
          isError: failed,
        },
      }
    }

    default:
      if (isNotification) return null
      return {
        jsonrpc: "2.0",
        id,
        error: { code: METHOD_NOT_FOUND, message: `Unknown method: ${request.method}` },
      }
  }
}

export interface ServeOptions {
  input?: Readable
  output?: Writable
  /** Diagnostics sink. Never stdout, which carries protocol frames only. */
  log?: (message: string) => void
}

/**
 * Serve MCP over newline-delimited JSON on a pair of streams.
 *
 * Returns a promise that settles when the input closes, so a caller can await
 * shutdown rather than guess at it.
 */
export function serveStdio(options: ServeOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const log = options.log ?? ((message: string) => process.stderr.write(`${message}\n`))

  // Refused at startup, not per call. A mutating tool reachable over an
  // unauthenticated pipe is a different security posture than this transport was
  // designed for, and the right time to say so is before serving.
  const mutating = MCP_TOOLS.filter((tool) => tool.readOnly !== true)
  if (mutating.length > 0) {
    return Promise.reject(
      new Error(
        `Refusing to serve: ${mutating.map((tool) => tool.name).join(", ")} ${
          mutating.length === 1 ? "is" : "are"
        } not read-only. stdio has no authentication, so this transport serves read-only tools only.`,
      ),
    )
  }

  return new Promise<void>((resolve, reject) => {
    let buffer = ""

    const write = (response: JsonRpcResponse) => {
      output.write(`${JSON.stringify(response)}\n`)
    }

    input.setEncoding("utf8")

    input.on("data", (chunk: string | Buffer) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8")

      // Frames are newline-delimited. A partial frame stays buffered rather than
      // being parsed, because a large payload arriving in pieces is normal on a
      // pipe and parsing early would report a spurious syntax error.
      let newline = buffer.indexOf("\n")
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
        if (line.length === 0) continue

        let request: JsonRpcRequest
        try {
          request = JSON.parse(line) as JsonRpcRequest
        } catch (error) {
          log(`malformed frame: ${(error as Error).message}`)
          write({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Invalid JSON." } })
          continue
        }

        const response = handleRequest(request)
        if (response) write(response)
      }
    })

    input.on("error", reject)
    input.on("end", () => resolve())
    input.on("close", () => resolve())
  })
}
