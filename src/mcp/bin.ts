#!/usr/bin/env node
import { serveStdio } from "./transport.js"

/**
 * Entry point for `ketqat-mcp` (ketqat-sdk#163).
 *
 * Deliberately tiny. Everything testable lives in `transport.ts`, so this file
 * has nothing in it that a test would want to reach.
 */
serveStdio().catch((error: unknown) => {
  // stderr, never stdout: stdout carries protocol frames and a stray line
  // corrupts the stream for the client.
  process.stderr.write(`ketqat-mcp failed: ${(error as Error).message}\n`)
  process.exitCode = 1
})
