#!/usr/bin/env node
/**
 * Fail if any built file under `dist/` is missing from git.
 *
 * `dist/` is listed in `.gitignore` but its contents are force-added on
 * purpose, because `ketqat-web` consumes this package as a GitHub **source
 * tarball** rather than from a registry -- so whatever is committed is what
 * consumers get.
 *
 * That combination has a sharp edge: `git add -A` silently skips new files
 * under an ignored directory, so adding a module leaves its compiled output
 * uncommitted while every existing `dist/` file still updates normally. The
 * package then looks fine in CI -- which rebuilds `dist` before testing, and
 * packs from the built tree -- and breaks only for a tarball consumer, with a
 * bare ERR_MODULE_NOT_FOUND pointing at a path that exists locally.
 *
 * That is exactly what happened when `src/contracts/quantum-card.ts`,
 * `artifact-relation.ts`, `transformation.ts`, and `src/circuit/` were added:
 * 24 compiled files never reached the repository. This check makes the failure
 * loud and immediate instead.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const distDir = join(root, "dist")

function walk(directory) {
  const found = []
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry)
    if (statSync(absolute).isDirectory()) {
      found.push(...walk(absolute))
    } else {
      found.push(relative(root, absolute))
    }
  }
  return found
}

let builtFiles
try {
  builtFiles = walk(distDir).sort()
} catch {
  console.error("dist/ does not exist. Run `npm run build` before this check.")
  process.exit(1)
}

if (builtFiles.length === 0) {
  console.error("dist/ is empty. Run `npm run build` before this check.")
  process.exit(1)
}

const trackedOutput = execFileSync("git", ["ls-files", "--", "dist"], { cwd: root, encoding: "utf8" })
const tracked = new Set(trackedOutput.split("\n").filter(Boolean))

const untracked = builtFiles.filter((file) => !tracked.has(file))
const stale = [...tracked].filter((file) => !builtFiles.includes(file))

if (untracked.length > 0 || stale.length > 0) {
  if (untracked.length > 0) {
    console.error(`${untracked.length} built file(s) under dist/ are not tracked by git:\n`)
    for (const file of untracked) {
      console.error(`  ${file}`)
    }
    console.error(
      "\ndist/ is gitignored but force-tracked, so `git add -A` will not pick these up." +
        "\nRun: git add -f dist",
    )
  }
  if (stale.length > 0) {
    console.error(`\n${stale.length} tracked dist/ file(s) no longer exist after a build:\n`)
    for (const file of stale) {
      console.error(`  ${file}`)
    }
    console.error("\nRun: git rm --cached <file> for each, or rebuild and re-add dist/.")
  }
  process.exit(1)
}

console.log(`Verified dist/ is fully tracked: ${builtFiles.length} files.`)
