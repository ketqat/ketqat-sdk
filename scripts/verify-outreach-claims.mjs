#!/usr/bin/env node
/**
 * Refuse outreach copy that claims something the project has not earned.
 *
 * Outreach is where a project lies about itself. Not deliberately, usually --
 * the phrases are so conventional that "trusted by researchers worldwide"
 * arrives fully formed and nobody stops to ask who. But this project is writing
 * to people who can check, and one inflated sentence costs more credibility
 * than the whole message buys.
 *
 * The governing rule, from ketqat-planning#50:
 *
 *   No outreach may claim an existing partnership, adoption, or endorsement.
 *
 * This cannot judge whether a specific sentence is true. What it can do is stop
 * the specific false sentences that outreach writing reaches for by reflex, and
 * that turns out to be most of them.
 *
 *   node scripts/verify-outreach-claims.mjs
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outreachDir = resolve(root, "docs", "outreach")

/**
 * Each rule is a pattern and the reason it is banned.
 *
 * Written against the claim rather than the wording, so a synonym does not slip
 * through: it is the assertion of adoption that is false, not the particular
 * verb used to assert it.
 */
const FORBIDDEN = [
  {
    pattern: /\b(?:trusted|used|adopted|deployed|relied upon)\s+by\b/i,
    why: "claims adoption. Nobody uses this yet, and the metrics page says so.",
  },
  {
    pattern: /\b(?:backed|supported|funded|sponsored)\s+by\b/i,
    why: "claims sponsorship or institutional backing that does not exist.",
  },
  {
    pattern: /\bin (?:production|active) use\b/i,
    why: "claims production usage.",
  },
  {
    pattern: /\b(?:our|we have a|in)\s+partnership\b/i,
    why: "claims a partnership. There are none.",
  },
  {
    pattern: /\b(?:partnered|collaborating|working)\s+with\s+[A-Z]/,
    why: "names an institution as a collaborator.",
  },
  {
    pattern: /\b(?:endorsed|recommended|approved)\s+by\b/i,
    why: "claims an endorsement.",
  },
  {
    // Only the market claim. "the first published release" is a fact about
    // release ordering and "the only person there" is a fact about attendance;
    // an earlier version of this rule rejected both, which would have taught
    // people to ignore it.
    pattern:
      /\bthe (?:first|only|leading|best|premier)\s+(?:\w+\s+){0,3}(?:platform|registry|framework|tool|toolkit|library|solution|SDK|service)\b/i,
    why: "is a market superlative nobody has verified.",
  },
  {
    pattern: /\b(?:first|only)\s+(?:\w+\s+){0,3}in the (?:world|industry|field)\b/i,
    why: "is a market superlative nobody has verified.",
  },
  {
    pattern: /\bindustry[- ]standard\b/i,
    why: "claims a status the project does not have.",
  },
  {
    pattern: /\b(?:thousands|hundreds|millions)\s+of\s+(?:users|researchers|downloads|labs)\b/i,
    why: "states an adoption figure. Real figures come from the metrics collector.",
  },
  {
    pattern: /\bjoin\s+(?:the\s+)?(?:thousands|hundreds|many|our growing)\b/i,
    why: "implies an existing community.",
  },
  {
    pattern: /\b(?:proven|battle[- ]tested|production[- ]ready|enterprise[- ]grade)\b/i,
    why: "claims maturity that no test in this repository demonstrates.",
  },
  {
    pattern: /\b(?:replaces|beats|outperforms|superior to)\s+\w/i,
    why: "disparages another project with an unverified comparison.",
  },
  {
    pattern: /\bexcited to announce\b/i,
    why: "is launch language for a project with nothing to launch.",
  },
]

let failures = 0
let scanned = 0

const files = readdirSync(outreachDir).filter((name) => name.endsWith(".md"))
if (files.length === 0) {
  console.error("No outreach templates found; this check would pass vacuously.")
  process.exit(1)
}

for (const file of files) {
  const path = resolve(outreachDir, file)
  const lines = readFileSync(path, "utf8").split("\n")
  scanned += 1

  // The README documents the banned phrases in order to ban them, so its
  // prohibition list is exempt -- but only the list, not the whole file.
  const isReadme = basename(file) === "README.md"

  lines.forEach((line, index) => {
    // A line that is itself stating a prohibition is describing the rule, not
    // breaking it. Detected by the surrounding language rather than by file, so
    // a template may also explain what it refuses to say.
    if (/\b(?:no|never|not|refuses?|forbidden|banned|do not|avoid|may not)\b/i.test(line)) return
    if (isReadme && /^\s*[-*]\s/.test(line)) return

    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(line)) {
        console.error(`  ${file}:${index + 1}  ${why}`)
        console.error(`    ${line.trim().slice(0, 110)}`)
        failures += 1
        break
      }
    }
  })
}

// Outreach must not state figures inline, because they go stale silently and
// nobody re-reads a template before sending it. The metrics page is the source.
for (const file of files) {
  const content = readFileSync(resolve(outreachDir, file), "utf8")
  if (/\b\d{3,}\s*(?:stars|users|downloads|contributors)\b/i.test(content)) {
    console.error(`  ${file}: states an adoption figure inline; link ketqat.com/metrics instead.`)
    failures += 1
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} unearned claim(s) in outreach copy.\n` +
      "These are checkable by the people being written to, and one of them costs more\n" +
      "credibility than the message buys. State what the code does and let them verify it.",
  )
  process.exit(1)
}

console.log(`Verified ${scanned} outreach template(s): no claimed partnership, adoption, or endorsement.`)
