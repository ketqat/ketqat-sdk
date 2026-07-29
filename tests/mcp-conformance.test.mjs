import assert from "node:assert/strict"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

/**
 * MCP conformance, driven by the OFFICIAL client over a real pipe
 * (ketqat-sdk#163).
 *
 * The transport in this package is hand-written to keep the runtime dependency
 * list at one entry. That is only defensible with conformance evidence from
 * something I did not write: a hand-rolled server tested against a hand-rolled
 * client only proves that two of my own misreadings agree.
 *
 * So the official @modelcontextprotocol/sdk client is a devDependency and it
 * spawns the real binary, performs the real handshake, and calls real tools.
 */

const client = new Client({ name: "ketqat-conformance-test", version: "1.0.0" })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/mcp/bin.js"],
})

await client.connect(transport)

// The handshake succeeded, which is the claim that matters: an official client
// negotiated a protocol version and capabilities with this server.
const serverVersion = client.getServerVersion()
assert.equal(serverVersion?.name, "ketqat-engine")
assert.ok(serverVersion?.version, "the server must report a version")

const capabilities = client.getServerCapabilities()
assert.ok(capabilities?.tools, "tools capability must be advertised")

// Every tool is discoverable, with a JSON Schema the client can validate against.
const listed = await client.listTools()
assert.equal(listed.tools.length, 7, `expected 7 tools, got ${listed.tools.length}`)

const names = listed.tools.map((tool) => tool.name).sort()
assert.deepEqual(names, [
  "check_circuit_equivalence",
  "convert_circuit",
  "estimate_resources",
  "inspect_circuit",
  "optimize_with_zx",
  "simulate_circuit",
  "transpile_for_hardware",
])

for (const tool of listed.tools) {
  // Schemas are derived from zod rather than hand-written, so they cannot drift
  // from what the handler enforces. A client validating against a stale schema
  // would reject input the server accepts, or worse the reverse.
  assert.ok(tool.inputSchema, `${tool.name} must publish an input schema`)
  assert.equal(tool.inputSchema.type, "object", `${tool.name} schema should be an object`)
  // Read-only is advertised so a client can decide what to permit without
  // calling the tool to find out.
  assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be marked read-only`)
}

// A real tool call over the wire, with a real result.
const inspected = await client.callTool({
  name: "inspect_circuit",
  arguments: {
    qasm: `OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nbit[2] c;\nh q[0];\ncx q[0], q[1];\nc[0] = measure q[0];\nc[1] = measure q[1];\n`,
  },
})
assert.equal(inspected.isError ?? false, false, "a valid circuit must not report an error")
assert.ok(Array.isArray(inspected.content) && inspected.content.length > 0)
const inspectedPayload = JSON.parse(inspected.content[0].text)
assert.equal(inspectedPayload.qubits, 2)
assert.equal(inspectedPayload.two_qubit_gate_count, 1, "the cx should be counted")

// structuredContent carries the same payload typed, which is what a client uses
// when it wants the result as data rather than as text for a model.
assert.deepEqual(inspected.structuredContent, inspectedPayload)

// A tool rejecting its input is a SUCCESSFUL call reporting a failure, not a
// protocol error. Clients surface tool errors to the model to recover from;
// protocol errors they treat as broken plumbing, so conflating them would make a
// bad circuit look like a broken server.
const rejected = await client.callTool({
  name: "inspect_circuit",
  arguments: { qasm: "this is not OpenQASM at all" },
})
assert.equal(rejected.isError, true, "invalid input should report isError, not throw")
assert.ok(Array.isArray(rejected.content))

// An unknown tool is likewise a tool-level error, and the client stays usable.
const unknown = await client.callTool({ name: "no_such_tool", arguments: {} })
assert.equal(unknown.isError, true)

// The session survives errors: a good call still works afterwards.
const afterErrors = await client.listTools()
assert.equal(afterErrors.tools.length, 7, "the server must remain usable after tool errors")

// ping is part of the protocol and must be answered.
await client.ping()

await client.close()

console.log("MCP conformance: official client completed handshake, discovery, 7 tools, and error handling.")

// ---------------------------------------------------------------------------
// Framing and notification edge cases
//
// The official client above exercises the happy protocol path and never sends a
// malformed frame or a notification for an unknown method. Mutation testing
// confirmed that: answering notifications and skipping partial-frame buffering
// both survived the conformance run untouched. These drive the transport
// directly to cover what a well-behaved client cannot reach.
// ---------------------------------------------------------------------------
{
  const { handleRequest, serveStdio, toolManifest } = await import("../dist/mcp/transport.js")
  const { PassThrough } = await import("node:stream")

  // A notification carries no id and must never be answered. Replying to one is
  // a protocol violation that some clients treat as fatal.
  assert.equal(handleRequest({ jsonrpc: "2.0", method: "notifications/initialized" }), null)
  assert.equal(handleRequest({ jsonrpc: "2.0", method: "some/unknown/notification" }), null)
  assert.equal(handleRequest({ jsonrpc: "1.0", method: "whatever" }), null)

  // The same methods WITH an id must be answered, so the rule is about the id
  // rather than about the method name.
  const unknownWithId = handleRequest({ jsonrpc: "2.0", id: 7, method: "some/unknown/method" })
  assert.equal(unknownWithId.error.code, -32601)
  assert.equal(unknownWithId.id, 7)

  const badVersion = handleRequest({ jsonrpc: "1.0", id: 8, method: "whatever" })
  assert.equal(badVersion.error.code, -32600)

  // tools/call without a name is invalid params, distinct from a tool failing.
  assert.equal(handleRequest({ jsonrpc: "2.0", id: 9, method: "tools/call", params: {} }).error.code, -32602)

  // Version negotiation: a supported version is echoed, an unsupported one falls
  // back to ours rather than being claimed falsely.
  const negotiated = handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05" },
  })
  assert.equal(negotiated.result.protocolVersion, "2024-11-05")
  const fallback = handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "1999-01-01" },
  })
  assert.equal(fallback.result.protocolVersion, "2025-06-18")

  // Framing: a request split across chunks must be buffered until its newline,
  // not parsed early. Parsing early would report a spurious syntax error, and a
  // large payload arriving in pieces is normal on a pipe.
  {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = []
    output.on("data", (chunk) => lines.push(...chunk.toString("utf8").split("\n").filter(Boolean)))
    const done = serveStdio({ input, output, log: () => {} })

    const frame = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    input.write(frame.slice(0, 12))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(lines.length, 0, "a partial frame must produce no response yet")
    input.write(`${frame.slice(12)}\n`)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(lines.length, 1, "the completed frame must produce exactly one response")
    assert.equal(JSON.parse(lines[0]).result.tools.length, 7)

    // A malformed frame gets a parse error and does not kill the session.
    input.write("{ not json at all }\n")
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(JSON.parse(lines[1]).error.code, -32700)
    assert.equal(JSON.parse(lines[1]).id, null, "a parse error has no id to echo")

    // A malformed frame that does NOT end in "}" must also be answered, not
    // silently dropped. Added because a mutation skipping such lines survived:
    // my first bad-JSON fixture happened to end in "}" so it took the normal
    // path. Dropping a frame leaves the client waiting for a reply that never
    // comes, which is worse than an error.
    input.write("not json\n")
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(lines.length, 3, "a malformed frame without a closing brace must still be answered")
    assert.equal(JSON.parse(lines[2]).error.code, -32700)

    input.write(`${frame}\n`)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(lines.length, 4, "the session must survive malformed frames")

    input.end()
    await done
  }

  // Two frames in one chunk must both be handled: a pipe does not respect
  // message boundaries.
  {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = []
    output.on("data", (chunk) => lines.push(...chunk.toString("utf8").split("\n").filter(Boolean)))
    const done = serveStdio({ input, output, log: () => {} })
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n` +
        `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`,
    )
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(lines.length, 2, "both frames in one chunk must be answered")
    input.end()
    await done
  }

  // The manifest derives schemas from zod, so it cannot drift from the handlers.
  const manifest = toolManifest()
  assert.equal(manifest.length, 7)
  assert.ok(manifest.every((tool) => tool.annotations.readOnlyHint === true))

  console.log("MCP framing: partial frames buffered, malformed frames recovered, notifications unanswered.")
}
