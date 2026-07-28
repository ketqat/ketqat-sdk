#!/usr/bin/env node
/**
 * The LICENSE must be Apache-2.0, byte for byte, apart from the appendix
 * copyright line the licence itself invites you to fill in.
 *
 * This exists because it was not. The committed text had the body edited --
 * "conspicuously marked" changed to "clearly marked", and a whole clause about
 * the Appendix replaced with different wording. Two consequences followed, and
 * neither was visible from inside the repository:
 *
 *   GitHub's licence detection reported NOASSERTION, so the repository showed
 *   no licence at all, while package.json and pyproject.toml both declared
 *   Apache-2.0.
 *
 *   More seriously, a modified licence is not the licence it claims to be. A
 *   user installing the package reads "Apache-2.0" in the metadata and receives
 *   different terms in the file.
 *
 * Comparison is against a vendored canonical copy rather than a network fetch,
 * so the check works offline and in CI, and so the reference cannot change
 * underneath it.
 *
 * Every shipped copy is checked, not just the root one. The Python package
 * carries its own LICENSE, and CI previously compared the two copies to each
 * other with `cmp` -- which passes when both are identically wrong, exactly the
 * state the repository was in. Comparing each against canonical is the check
 * that actually distinguishes those cases.
 */
import { readFileSync } from "node:fs"

const APPENDIX_PLACEHOLDER = "   Copyright [yyyy] [name of copyright owner]"

const canonical = readFileSync(new URL("../.licenses/apache-2.0.txt", import.meta.url), "utf8").split("\n")

/** Every copy that ships to a user. */
const COPIES = ["../LICENSE", "../python/LICENSE"]

const failures = []

for (const relative of COPIES) {
  let lines
  try {
    lines = readFileSync(new URL(relative, import.meta.url), "utf8").split("\n")
  } catch {
    failures.push(`${relative.replace("../", "")} is missing; every distributed package must carry the licence`)
    continue
  }

  for (let index = 0; index < Math.max(lines.length, canonical.length); index += 1) {
    const ours = lines[index] ?? "<missing>"
    const theirs = canonical[index] ?? "<missing>"
    if (ours === theirs) continue
    // The one line the licence intends you to edit.
    if (theirs === APPENDIX_PLACEHOLDER && /^ {3}Copyright \d{4} .+/.test(ours)) continue
    failures.push(
      `${relative.replace("../", "")} line ${index + 1}\n    canonical: ${theirs}\n    ours:      ${ours}`,
    )
  }
}

if (failures.length > 0) {
  console.error(
    `FAIL: a shipped licence differs from canonical Apache-2.0 in ${failures.length} place(s).\n\n` +
      failures.slice(0, 8).map((entry) => `  ${entry}`).join("\n") +
      "\n\nOnly the appendix copyright line may be edited. A modified licence is not the licence it\n" +
      "claims to be: GitHub reports NOASSERTION, and a user who reads Apache-2.0 in the package\n" +
      "metadata receives different terms in the file.",
  )
  process.exit(1)
}

console.log(`Verified ${COPIES.length} licence copies are canonical Apache-2.0 with only the appendix filled in.`)
