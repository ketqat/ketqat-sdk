import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

/**
 * Transitive advisories held above their floor by an `overrides` entry.
 *
 * Both arrive under `@modelcontextprotocol/sdk`, a devDependency used by the
 * MCP conformance test. Neither reaches a consumer: the runtime dependency set
 * is `zod` and `zod-to-json-schema`, and `files` ships no `node_modules`.
 *
 * ## Why the override states the advisory floor, not the version we validated
 *
 * Review of ketqat-sdk#249 asked whether `hono: ^4.12.34` should be raised to
 * `^4.13.2`, the version that actually resolved, so a regenerated lockfile
 * cannot drift below it.
 *
 * The floor stays at the advisory's first patched version, because that is the
 * claim being made: 4.12.34 is what security requires, and writing 4.13.2
 * would assert a requirement that does not exist. Drift is a real concern
 * though, and pinning is the wrong instrument for it -- this test is the right
 * one. It reads the *resolved* version from the lockfile, so a regeneration
 * that lands anywhere below the floor fails here regardless of what the range
 * permits.
 */

const ADVISORIES = [
  { name: "hono", floor: "4.12.34", severity: "moderate", reachedVia: "@hono/node-server, under the MCP SDK" },
  { name: "fast-uri", floor: "3.1.5", severity: "high", reachedVia: "ajv, under the MCP SDK" },
]

function compareVersions(a, b) {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"))
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

for (const advisory of ADVISORIES) {
  test(`every installed ${advisory.name} is at or above ${advisory.floor} (${advisory.severity})`, () => {
    const installed = Object.entries(lock.packages)
      .filter(([path]) => path.endsWith(`node_modules/${advisory.name}`))
      .map(([path, entry]) => ({ path, version: entry.version }))

    assert.ok(
      installed.length > 0,
      `${advisory.name} is not installed at all. If it left the tree, delete this entry and its ` +
        `override rather than leaving a check that can no longer fail.`,
    )

    for (const { path, version } of installed) {
      assert.ok(version, `${path} has no version`)
      assert.ok(
        compareVersions(version, advisory.floor) >= 0,
        `${path} resolves ${version}, below the ${advisory.floor} floor. Reached via ${advisory.reachedVia}.`,
      )
    }
  })

  test(`the ${advisory.name} floor is declared, not incidental`, () => {
    assert.ok(
      manifest.overrides?.[advisory.name],
      `${advisory.name} meets its floor but nothing holds it there.`,
    )
  })
}

test("these overrides stay out of the shipped dependency set", () => {
  // The point of the overrides being safe here is that they are dev-only. If
  // one of these ever became a runtime dependency, "it does not reach a
  // consumer" would silently stop being true.
  const runtime = Object.keys(manifest.dependencies ?? {})
  for (const advisory of ADVISORIES) {
    assert.ok(
      !runtime.includes(advisory.name),
      `${advisory.name} is now a runtime dependency, so it ships to consumers and the reasoning ` +
        `behind these overrides needs revisiting.`,
    )
  }
  assert.deepEqual(
    runtime.sort(),
    ["zod", "zod-to-json-schema"],
    "The runtime dependency set changed. This repository ships zod and zod-to-json-schema only.",
  )
})
