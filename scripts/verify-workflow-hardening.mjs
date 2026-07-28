#!/usr/bin/env node
/**
 * Two OpenSSF Scorecard criteria, enforced in the repository rather than
 * observed after the fact.
 *
 * **Pinned-Dependencies.** A tag is a mutable pointer. Whoever controls an
 * action's repository can move `v4` to different code, and every workflow
 * floating to it runs that code on the next push -- with whatever token the
 * workflow holds. Pinning to a commit removes that.
 *
 * **Token-Permissions.** A workflow with no `permissions:` block inherits the
 * repository default, which may include write scopes. `ci.yml` had none and
 * runs on `pull_request`, so it executed fork-authored code with inherited
 * permissions. That is the combination worth preventing.
 *
 * Both were partly true here already, which is the interesting part: the
 * release workflows pinned SHAs while `ci.yml` floated, so a reviewer glancing
 * at the repository would have seen pinning and concluded it was done.
 */
import { readdirSync, readFileSync } from "node:fs"

const dir = new URL("../.github/workflows/", import.meta.url)
const files = readdirSync(dir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))

const failures = []

for (const file of files) {
  const text = readFileSync(new URL(file, dir), "utf8")

  // Top-level permissions. A job-level block is good practice too, but the
  // top-level one is what bounds a workflow that forgets to set a job-level one.
  if (!/^permissions:/m.test(text)) {
    failures.push(`${file}: no top-level permissions block, so it inherits the repository default`)
  }

  for (const [, action, ref] of text.matchAll(/uses:\s+([\w.-]+\/[\w.-]+(?:\/[\w.-]+)*)@(\S+)/g)) {
    // Local actions in this repository are not a supply-chain risk.
    if (action.startsWith("./")) continue
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      failures.push(`${file}: ${action}@${ref} is not pinned to a commit SHA`)
    }
  }
}

if (files.length === 0) failures.push("no workflows found; this check would pass vacuously")

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} workflow hardening problem(s)\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    "\nPin an action with its commit SHA and record the version in a trailing comment:\n" +
      "  uses: actions/checkout@11d5960a32... # v4\n" +
      "Dependabot keeps the pin current; see .github/dependabot.yml.",
  )
  process.exit(1)
}

console.log(`Verified ${files.length} workflows: all actions pinned to commit SHAs, all declare permissions.`)
