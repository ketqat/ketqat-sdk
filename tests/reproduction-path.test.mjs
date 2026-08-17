import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * The public reproduction path (ketqat-sdk#253, ketqat-planning#131).
 *
 * Two properties, and the first is the product's central claim:
 *
 * 1. **A matching hash is never presented as attestation.** A fabricated result
 *    hashes as consistently as a real one. The contract already rejects
 *    `HASH_VERIFICATION` with `REPRODUCED`; the public-facing path that invites
 *    strangers to submit hashes must say the same thing, or it undoes the rule
 *    at exactly the point an outsider forms their impression.
 *
 * 2. **No personal data is requested.** Checked structurally -- against field
 *    labels and ids rather than raw text -- because the templates *mention*
 *    names and employers in order to tell people not to send them. A grep would
 *    flag the prohibition as a violation.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const TEMPLATE_DIR = `${ROOT}.github/ISSUE_TEMPLATE`

function templates() {
  return readdirSync(TEMPLATE_DIR)
    .filter((name) => name.endsWith(".yml") && name !== "config.yml")
    .map((name) => ({ name, source: readFileSync(`${TEMPLATE_DIR}/${name}`, "utf8") }))
}

test("a reproduction template exists and states that a hash is not attestation", () => {
  const source = readFileSync(`${TEMPLATE_DIR}/reproduction_report.yml`, "utf8")

  assert.match(source, /does \*\*not\*\* prove the experiment ran|not prove the experiment ran/i)
  assert.match(source, /not attestation/i)
  // The specific reason, not just the assertion: without it the claim reads as
  // legalese rather than as something the reader can check for themselves.
  assert.match(source, /fabricated result hashes/i)
  // And the enforcement, so the reader knows it is a rule rather than a hope.
  assert.match(source, /HASH_VERIFICATION/)
})

test("the reproduction template treats a differing hash as a finding", () => {
  const source = readFileSync(`${TEMPLATE_DIR}/reproduction_report.yml`, "utf8")
  // Somebody whose hash does not match must not feel their report is unwelcome:
  // that is the report we most want.
  assert.match(source, /that is a finding, not a failed submission/i)
})

test("the submitter is asked what they are NOT claiming", () => {
  const source = readFileSync(`${TEMPLATE_DIR}/reproduction_report.yml`, "utf8")
  assert.match(source, /not\*{0,2} claiming/i)
})

test("a scientific disagreement is its own route, and asks for a falsifier", () => {
  const source = readFileSync(`${TEMPLATE_DIR}/scientific_disagreement.yml`, "utf8")
  assert.match(source, /not a bug report/i, "a disagreement filed as a bug gets triaged as one")
  assert.match(source, /What would change your mind/i)
})

test("no template requests personal data", () => {
  // Structural, not textual. Every template *mentions* names and employers, in
  // order to say do not send them -- a grep over the raw file would report the
  // prohibition as a violation and the check would be worse than useless.
  const forbidden = /\b(e-?mail|full name|your name|employer|company|phone|affiliation|address)\b/i
  const offenders = []
  for (const { name, source } of templates()) {
    for (const match of source.matchAll(/^\s*(?:-\s*)?(?:id|label):\s*(.+)$/gim)) {
      if (forbidden.test(match[1])) offenders.push(`${name}: ${match[1].trim()}`)
    }
  }
  assert.deepEqual(offenders, [], `templates must not ask for personal data: ${offenders.join("; ")}`)
})

test("both new templates tell the submitter not to send personal data", () => {
  for (const name of ["reproduction_report.yml", "scientific_disagreement.yml"]) {
    const source = readFileSync(`${TEMPLATE_DIR}/${name}`, "utf8")
    assert.match(source, /do not include your name/i, `${name} should say so explicitly`)
  }
})

test("the retention promise is one we can actually keep", () => {
  // "We will not store it" was false: a GitHub issue is public, stored by
  // GitHub, and edits leave a revision history. Promising erasure we cannot
  // perform is the same class of overclaim this project refuses everywhere
  // else -- and it is worse here, because somebody might rely on it before
  // posting something they cannot take back. Raised in review of ketqat-sdk#254.
  for (const name of ["reproduction_report.yml", "scientific_disagreement.yml"]) {
    const source = readFileSync(`${TEMPLATE_DIR}/${name}`, "utf8")
    // Whitespace-tolerant: these are YAML block scalars, so a sentence wraps
    // mid-phrase with indentation. Matching the literal string passed on the
    // first template and failed on the second purely because the line broke
    // between "GitHub" and "issue" -- a test that depends on where a line wraps
    // is testing the formatter, not the promise.
    const prose = source.replace(/\s+/g, " ")
    assert.ok(
      !/will not store it/i.test(prose),
      `${name} promises not to store data in a public issue, which is not something we can do`,
    )
    assert.match(prose, /public GitHub issue/i, `${name} must say where the data actually goes`)
    assert.match(prose, /revision history/i, `${name} must say that editing does not erase`)
  }
})

test("the contribution path is documented, and says a report confers no badge", () => {
  const doc = readFileSync(`${ROOT}docs/independent-reproduction.md`, "utf8")
  assert.match(doc, /not attestation/i)
  assert.match(doc, /named person/i, "somebody must own the judgement")
  assert.match(
    doc,
    /no path by which filing a report produces a badge automatically/i,
    "the doc must rule out the automatic path explicitly, since that is the tempting one",
  )
  // Superseding rather than editing, the rule applied everywhere else.
  assert.match(doc, /superseding record/i)
})
