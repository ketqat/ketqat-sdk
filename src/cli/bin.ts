#!/usr/bin/env node
import { runCli } from "./index.js"

const result = runCli(process.argv.slice(2))
if (result.stderr) {
  process.stderr.write(`${result.stderr}\n`)
}
if (result.stdout !== undefined) {
  // Exactly one JSON object on stdout, so output stays pipeable.
  process.stdout.write(`${JSON.stringify(result.stdout, null, 2)}\n`)
}
process.exit(result.exitCode)
