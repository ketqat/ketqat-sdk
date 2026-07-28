#!/usr/bin/env node
/**
 * The citation file must be structurally valid and must not claim anything
 * nobody verified.
 *
 * A CITATION.cff is a machine-readable assertion about real people and real
 * artifacts. GitHub renders it as a "Cite this repository" button, and
 * reference managers ingest it verbatim. An invented ORCID attributes work to
 * a stranger; an invented DOI sends a reader to a page that does not exist;
 * an invented affiliation credits an institution that never saw the work.
 *
 * So the check is on **keys**, not on prose. An earlier version of this
 * matched the word "orcid" anywhere in the file and failed on the comment
 * explaining why ORCID iDs are absent -- the same way a CSP test failed on a
 * comment describing the policy it replaced. Matching explanatory text is
 * fragile in the one direction that matters: it fires on honesty.
 */
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("../CITATION.cff", import.meta.url), "utf8")

/** Lines that are actual YAML keys, with comments and prose stripped. */
const keyLines = source
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .filter((line) => /^\s*-?\s*[a-z][a-z0-9-]*:/i.test(line))

const failures = []

for (const required of ["cff-version", "title", "type", "license", "version", "authors"]) {
  if (!keyLines.some((line) => new RegExp(`^${required}:`).test(line.trim()))) {
    failures.push(`missing required field: ${required}`)
  }
}

// Claims that must be earned. Present as a key means asserted as fact.
for (const [key, why] of [
  ["doi", "nothing has been deposited with an archive, so a DOI would not resolve"],
  ["orcid", "an ORCID identifies a specific real researcher; guessing one misattributes their work"],
  ["affiliation", "crediting an institution that never saw the work is a false claim about them"],
  ["preferred-citation", "there is no paper; pointing at one sends readers nowhere"],
]) {
  if (keyLines.some((line) => new RegExp(`(^|\\s|-\\s)${key}:`).test(line))) {
    failures.push(`${key} is asserted, but ${why}`)
  }
}

// The version must match what is actually published, or a citation names a
// release whose hashing behaviour differs from the one the reader will install.
const declared = /^version:\s*(\S+)/m.exec(source)?.[1]
const pkgVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version
if (declared !== pkgVersion) {
  failures.push(`version ${declared} does not match package.json ${pkgVersion}`)
}

const licence = /^license:\s*(\S+)/m.exec(source)?.[1]
if (licence !== "Apache-2.0") failures.push(`license is ${licence}; expected Apache-2.0`)

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s) in CITATION.cff\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`Verified CITATION.cff: required fields present, version ${declared}, no unearned claims.`)
