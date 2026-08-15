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
 * ## What this does and does not touch
 *
 * Nothing here publishes, and nothing reads a credential.
 *
 * It is **not** offline. Installing the tarball resolves the package's real
 * dependencies -- `zod` and `zod-to-json-schema` -- from the public npm
 * registry, because a consumer install that stubbed them would not be the
 * thing being verified. It also makes one **unauthenticated, read-only**
 * request to the public reference-bundle endpoint, because #247 asks for the
 * typed client to be exercised against a real endpoint and a reference bundle
 * verified end to end -- neither of which a stub would establish.
 *
 * What does not happen: any authenticated request, any write to any registry,
 * and any use of a credential. Raised in review of ketqat-sdk#247, where this
 * comment claimed offline outright and was simply wrong.
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
  // Mirror the clean-install check: a malformed or reshaped `npm pack --json`
  // should fail here saying so, not as a TypeError forty lines later.
  const manifest = JSON.parse(pack.stdout)[0]
  if (!manifest?.filename || !Array.isArray(manifest.files)) {
    throw new Error("npm pack did not return a tarball manifest")
  }
  const tarball = resolve(temporaryRoot, manifest.filename)

  // A consumer with nothing cached, installing only the tarball.
  const consumer = join(temporaryRoot, "consumer")
  mkdirSync(consumer, { recursive: true })
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "ketqat-consumer", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
  )
  // `--ignore-scripts` because this is a release gate: running dependency
  // lifecycle scripts here would execute third-party code to prove a
  // packaging property that does not depend on it. Nothing below needs them --
  // bin linking and exports resolution are npm's own work, not a script's.
  execFileSync(npmCommand, ["install", "--no-audit", "--no-fund", "--ignore-scripts", tarball], {
    cwd: consumer,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  ok(`installed ${manifest.filename} into a clean consumer`)

  // npm writes `<name>.cmd` and `<name>.ps1` on Windows, not a bare name.
  const binaryFor = (name) => join(consumer, "node_modules/.bin", process.platform === "win32" ? `${name}.cmd` : name)
  const binary = binaryFor("ketqat-engine")
  statSync(binary)
  ok(`ketqat-engine is linked into node_modules/.bin as ${process.platform === "win32" ? "ketqat-engine.cmd" : "ketqat-engine"}`)

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
  const mcpBinary = binaryFor("ketqat-mcp")
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

  // --- the typed client, against a real endpoint -----------------------
  //
  // ketqat-sdk#247 asks for the client to be exercised "against a real
  // endpoint" and for "reference bundles fetched and verified end to end".
  // Both are done here in one step, from the *installed* package: a client
  // constructed from the tarball, reaching production's public read API, and
  // the bundle it returns verified by recomputing its own hash.
  //
  // Read-only and unauthenticated. No token is used, nothing is written, and
  // the endpoint is the same one any reader can fetch.
  const endpoint = process.env.KETQAT_URL ?? "https://ketqat.com"
  const referenceSlug = process.env.KETQAT_REFERENCE_SLUG ?? "measured-statevector-simulation-12q"
  const clientProbe = join(consumer, "client-probe.mjs")
  writeFileSync(
    clientProbe,
    `import { KetQatClient } from "ketqat-sdk/client"\n` +
      `import { verifyReproducibilityHash } from "ketqat-sdk/reproducibility"\n` +
      `const client = new KetQatClient({ baseUrl: ${JSON.stringify(endpoint)} })\n` +
      `const bundle = await client.intelligence.referenceBundle(${JSON.stringify(referenceSlug)})\n` +
      `const stated = bundle.reproducibility_hash\n` +
      // The SDK's own verifier, from the tarball -- not a reimplementation here.
      `const verdict = verifyReproducibilityHash(bundle)\n` +
      `console.log(JSON.stringify({ stated, verdict, kind: bundle.bundle_kind, isDemo: bundle.is_demo }))\n`,
  )
  // The probe can fail by fetching, by parsing, or inside the verifier, and
  // saying "could not fetch" for all three sends the next person debugging CI
  // to the wrong place. Report what actually happened.
  let clientResult = null
  let raw = null
  try {
    raw = execFileSync(process.execPath, [clientProbe], {
      cwd: consumer,
      encoding: "utf8",
      timeout: 60_000,
    })
  } catch (error) {
    throw new Error(
      `The client probe failed while running against ${endpoint} (slug ${referenceSlug}). ` +
        `This covers the fetch, the SDK's verifier, and anything else the probe does:\n` +
        `${error.stderr || error.message}`,
    )
  }
  try {
    clientResult = JSON.parse(raw.trim().split("\n").pop())
  } catch (error) {
    throw new Error(
      `The client probe ran but its output could not be parsed as JSON: ${error.message}\n` +
        `Output was: ${String(raw).slice(0, 400)}`,
    )
  }

  if (!clientResult?.stated) {
    throw new Error("The fetched reference bundle carries no reproducibility_hash")
  }
  ok(`the installed typed client fetched a reference bundle from ${endpoint}`)

  // End to end means recomputed, not merely received. A bundle whose stated
  // hash does not match its own contents is the failure this catches -- and it
  // is a claim about the *shipped* hashing code, since both the client and the
  // hasher come from the tarball.
  const verdict = clientResult.verdict ?? {}
  const verified = verdict.valid ?? verdict.matches ?? verdict.ok
  if (verified !== true) {
    throw new Error(
      `The reference bundle does not verify against its own contents: ${JSON.stringify(verdict).slice(0, 300)}`,
    )
  }
  ok(`the bundle verifies against its own contents (${clientResult.stated.slice(0, 16)}…)`)

  // A reference case is not customer evidence, and it is not demo data
  // either. Both mislabellings matter, so both are enforced -- an earlier
  // version printed `is_demo` beside a comment saying it must not be true and
  // asserted nothing, which is the shape of every check that passes while the
  // thing it names is wrong. Raised in review of ketqat-sdk#250.
  if (clientResult.kind !== "RESOURCE_INTELLIGENCE") {
    throw new Error(`Unexpected bundle_kind ${clientResult.kind}`)
  }
  if (clientResult.isDemo !== false) {
    throw new Error(
      `The reference bundle reports is_demo=${clientResult.isDemo}. A reference case is published as ` +
        `real worked evidence; shipping one flagged as demo data would misrepresent what it is.`,
    )
  }
  ok(`the bundle declares kind ${clientResult.kind} and is_demo=false`)

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
      `Nothing was published, no credential was read, and the only KetQat request was an ` +
      `unauthenticated public read.\n`,
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
