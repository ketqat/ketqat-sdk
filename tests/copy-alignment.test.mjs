import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * What this project says it is, in the places a stranger looks first
 * (ketqat-web#346, ketqat-planning#131).
 *
 * These drifted apart because they were written at different times and nothing
 * compared them. ketqat.com said "Quantum Decision Intelligence"; this README,
 * the npm description and the Python description all said "vendor-neutral
 * registry for reproducible quantum error-correction research".
 *
 * Both were true. They describe different products, and a newcomer arriving
 * from GitHub formed a different idea from one arriving from search -- which is
 * the difference between knowing what to do next and closing the tab.
 *
 * The registry is not deleted from the copy. It is real, it works, and it is
 * the evidence layer the estimates rest on. It is just no longer the headline.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const IDENTITY = /Quantum Decision Intelligence/

function prose(path) {
  return readFileSync(`${ROOT}${path}`, "utf8").replace(/\s+/g, " ")
}

test("the README leads with what the product is now", () => {
  const readme = prose("README.md")
  const opening = readme.slice(0, 900)
  assert.match(opening, IDENTITY, "a stranger reads the first paragraph and little else")
  // The refusals are the distinctive claim, and stating them early is what
  // stops somebody investing an afternoon in a question we will not answer.
  assert.match(opening, /No dates, no prices, no vendor rankings/i)
})

test("the README keeps the registry rather than erasing it", () => {
  const readme = prose("README.md")
  assert.match(readme, /registry/i, "the registry is real and still works; deleting it from the copy would be its own inaccuracy")
  assert.match(readme, /evidence layer/i, "and its relationship to the estimates should be stated, not implied")
})

test("the README points a stranger at the check they can run themselves", () => {
  const readme = prose("README.md")
  assert.match(readme, /verify-a-published-result\.md/)
  assert.match(readme, /that is a finding, not a failed attempt/i)
})

test("the npm and Python descriptions say the same thing as the site", () => {
  const npm = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")).description
  const python = prose("python/pyproject.toml")
  assert.match(npm, IDENTITY, `npm description still describes the old product: ${npm}`)
  assert.match(python, IDENTITY, "the Python description is what a PyPI visitor reads")
})

test("resource estimation appears in the npm keywords a searcher would use", () => {
  const keywords = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")).keywords ?? []
  assert.ok(
    keywords.includes("quantum-resource-estimation"),
    `keywords describe the old product only: ${keywords.join(", ")}`,
  )
  // The QEC terms stay: that work is still here and people search for it.
  assert.ok(keywords.includes("quantum-error-correction"), "QEC is still real and still searched for")
})
