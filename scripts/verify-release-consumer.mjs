#!/usr/bin/env node
/**
 * Exercise the release artifact the way a stranger receives it.
 *
 * The existing suites run against `dist/`, which is this working tree's build
 * output. A consumer gets the *tarball*: a different file list, an exports map
 * npm resolves rather than a relative path, and bin entries invoked through
 * `node_modules/.bin` rather than by path. Those differ in ways `dist/` cannot
 * show -- a missing `files` entry, an exports subpath that points at something
 * unpacked, a bin without its shebang -- and every one of them is invisible
 * until somebody installs it.
 *
 * ketqat-sdk#247 asks for verification "from the built artifact, never the
 * source". This is that check.
 *
 * ## Piping is a first-class case here
 *
 * `intelligence report` writing to a pipe is where the stdout truncation in
 * #246 hid: `process.exit` after an async write drops whatever the pipe has
 * not drained, and a terminal never shows it because a TTY write is
 * synchronous. So this runs the CLI with stdout as a **pipe**, on input whose
 * output exceeds the 65,536-byte boundary the bug landed on, and compares the
 * byte count against the same command writing to a file. A report that is
 * correct on screen and truncated in `> file` is the failure this exists to
 * catch.
 *
 * Nothing here publishes, and nothing reaches the network.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

const root = process.cwd()
const temporaryRoot = mkdtempSync(join(tmpdir(), "ketqat-sdk-consumer-"))
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

const checks = []
function ok(message) {
  checks.push(message)
  process.stdout.write(`  ok   ${message}\n`)
}

/** Same floor the clean-install check enforces, and for the same reason. */
function assertHostSatisfiesEngine(declared) {
  const floor = /^>=\s*(\d+)/.exec(declared ?? "")
  if (!floor) throw new Error(`Cannot read a major-version floor from engines.node ${JSON.stringify(declared)}`)
  const required = Number(floor[1])
  const actual = Number(process.versions.node.split(".")[0])
  if (actual < required) {
    throw new Error(
      `Running on Node ${process.versions.node}, below the >=${required} the package declares. ` +
        `npm only warns, so this run would prove nothing about a supported engine.`,
    )
  }
  return required
}

try {
  const sourcePackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const floor = assertHostSatisfiesEngine(sourcePackage.engines?.node)
  ok(`host Node ${process.versions.node} satisfies the declared floor >=${floor}`)

  const pack = spawnSync(npmCommand, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot], {
    cwd: root,
    encoding: "utf8",
  })
  if (pack.status !== 0) {
    process.stderr.write(pack.stderr)
    process.exit(pack.status ?? 1)
  }
  const manifest = JSON.parse(pack.stdout)[0]
  const tarball = resolve(temporaryRoot, manifest.filename)

  // A consumer with nothing cached, installing only the tarball.
  const consumer = join(temporaryRoot, "consumer")
  mkdirSync(consumer, { recursive: true })
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "ketqat-consumer", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
  )
  execFileSync(npmCommand, ["install", "--no-audit", "--no-fund", tarball], {
    cwd: consumer,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  ok(`installed ${manifest.filename} into a clean consumer`)

  const binary = join(consumer, "node_modules/.bin/ketqat-engine")
  statSync(binary)
  ok("ketqat-engine is linked into node_modules/.bin")

  const example = join(root, "examples/intelligence/demo-assessment.yaml")

  // --- the piping case -------------------------------------------------
  //
  // stdio "pipe" is the point: this is the path that truncated. Compare it
  // against --output, which writes through a different code path entirely.
  const piped = execFileSync(binary, ["intelligence", "report", example], {
    cwd: consumer,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  })

  const written = join(temporaryRoot, "report-via-output.txt")
  execFileSync(binary, ["intelligence", "report", example, "--output", written], {
    cwd: consumer,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const viaFile = readFileSync(written)

  if (piped.length !== viaFile.length) {
    throw new Error(
      `Piped stdout is ${piped.length} bytes but --output wrote ${viaFile.length}. ` +
        `A report that is whole in a file and short in a pipe is the #246 truncation, back.`,
    )
  }
  if (!piped.equals(viaFile)) {
    throw new Error("Piped stdout and --output differ in content at equal length")
  }
  ok(`piped stdout matches --output byte for byte (${piped.length} bytes)`)

  // The truncation landed at exactly 65,536. An input whose report is smaller
  // than that cannot demonstrate anything, so say so rather than passing.
  if (piped.length <= 65_536) {
    throw new Error(
      `The report is ${piped.length} bytes, at or below the 65,536-byte boundary the truncation ` +
        `occurred on. This check cannot detect the regression it exists for. Use a larger input.`,
    )
  }
  ok(`report exceeds the 65,536-byte truncation boundary (${piped.length} bytes), so the check can fail`)

  // --- the exports map, resolved by node, not by path ------------------
  const subpaths = Object.keys(sourcePackage.exports)
  const probe = join(consumer, "probe.mjs")
  writeFileSync(
    probe,
    `${subpaths
      .map((subpath, index) => `import * as m${index} from ${JSON.stringify(subpath.replace(/^\./, "ketqat-sdk"))}`)
      .join("\n")}\nconsole.log([${subpaths.map((_, i) => `Object.keys(m${i}).length`).join(",")}].join(","))\n`,
  )
  const counts = execFileSync(process.execPath, [probe], { cwd: consumer, encoding: "utf8" }).trim().split(",")
  const empty = subpaths.filter((_, index) => Number(counts[index]) === 0)
  if (empty.length > 0) {
    throw new Error(`Export subpaths resolved but exported nothing: ${empty.join(", ")}`)
  }
  ok(`all ${subpaths.length} export subpaths resolve through the installed package and export bindings`)

  // --- the MCP server still holds no credential ------------------------
  const mcpBinary = join(consumer, "node_modules/.bin/ketqat-mcp")
  statSync(mcpBinary)
  const mcp = spawnSync(mcpBinary, [], {
    cwd: consumer,
    encoding: "utf8",
    input: `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify", version: "0" } },
    })}\n`,
    timeout: 30_000,
  })
  const spoke = `${mcp.stdout}`.includes('"result"')
  if (!spoke) {
    throw new Error(`ketqat-mcp did not answer initialize from the installed artifact: ${mcp.stderr || mcp.stdout}`)
  }
  ok("ketqat-mcp answers initialize from the installed artifact")

  const secretish = /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i
  const offenders = manifest.files
    .map(({ path }) => path)
    .filter((path) => /\.(m?js|cjs|json|ya?ml)$/i.test(path))
    .filter((path) => {
      try {
        return secretish.test(readFileSync(join(consumer, "node_modules/ketqat-sdk", path), "utf8"))
      } catch {
        return false
      }
    })
  if (offenders.length > 0) {
    throw new Error(`Files in the artifact look like they carry a credential: ${offenders.join(", ")}`)
  }
  ok(`no credential-shaped literal in any of the ${manifest.files.length} packed files`)

  process.stdout.write(
    `\nPASS: ${checks.length} checks against ${manifest.filename} as an installed consumer. ` +
      `Nothing was published and nothing left this machine.\n`,
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
