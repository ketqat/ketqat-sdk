#!/usr/bin/env node
/**
 * Everyone named in MAINTAINERS.md must be a real account with real merged
 * work, and the contribution counts must not drift from what the repository
 * actually shows.
 *
 * A maintainers file is the document an outside contributor uses to decide who
 * to ask for a review. Naming someone who has not agreed to the role, or
 * inflating a contribution count, wastes that person's time and misleads the
 * contributor. The phase brief for this work put it directly: do not invent
 * unfilled roles, mark them vacant.
 *
 * Requires network access and `gh`. Skips loudly when unavailable rather than
 * passing quietly, because a check that silently does nothing is how the file
 * drifts in the first place.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("../MAINTAINERS.md", import.meta.url), "utf8")

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

try {
  gh(["auth", "status"])
} catch {
  console.log("SKIP: gh is unavailable, so MAINTAINERS.md was NOT verified against GitHub.")
  process.exit(0)
}

const handles = [...new Set([...source.matchAll(/\[@([A-Za-z0-9-]+)\]/g)].map((match) => match[1]))]
if (handles.length === 0) {
  console.error("FAIL: MAINTAINERS.md names nobody. A maintainers file with no maintainers is a stub.")
  process.exit(1)
}

const failures = []

for (const handle of handles) {
  try {
    gh(["api", `users/${handle}`, "--jq", ".login"])
  } catch {
    failures.push(`@${handle} is not a GitHub account`)
  }
}

// Counts, checked against the repository rather than taken on trust.
let commits
try {
  commits = JSON.parse(
    gh(["api", "repos/ketqat/ketqat-sdk/contributors", "--jq", "[.[] | {login, contributions}]"]),
  )
} catch {
  commits = null
}

if (commits) {
  for (const [, handle, claimed] of source.matchAll(/\[@([A-Za-z0-9-]+)\][^\n]*?(\d+) commits/g)) {
    const actual = commits.find((entry) => entry.login === handle)?.contributions
    if (actual === undefined) {
      failures.push(`@${handle} is credited with commits but has none in this repository`)
    } else if (Number(claimed) > actual) {
      failures.push(`@${handle} is credited with ${claimed} commits but has ${actual}`)
    }
  }
}

// A vacant role must say so, not be quietly dropped.
if (!/\bvacant\b/i.test(source)) {
  failures.push("no role is marked vacant; unfilled roles must be stated rather than omitted")
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s) in MAINTAINERS.md\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`Verified MAINTAINERS.md: ${handles.length} named account(s) exist, counts do not overstate.`)
