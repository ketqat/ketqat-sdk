// The same patterns, the same inputs, the engine that actually ships them.
//
// `python/tests/test_study_pattern.py` asserts these properties from the other
// side. This file exists because only ECMAScript can say what ECMAScript means,
// and a parity claim checked in one language is a claim about one language.
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

const SCHEMAS = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas")

const STUDY_SCHEMAS = [
  "study", "study-event", "problem-specification", "study-plan", "study-task",
  "evidence-node", "evidence-edge", "execution-capsule", "research-package",
  "confirmation-receipt", "study-task-authorization", "execution-job", "task-outcome",
]

// Shorthands that mean different things to ECMAScript and to Python's `re`.
// Python's `\s` includes \x1c-\x1f and \x85; ECMAScript's includes U+FEFF.
// `\d` and `\w` are Unicode-wide in Python and ASCII in ECMAScript -- Python's
// `\d{4}` accepts Eastern Arabic numerals, which is how a date pattern came to
// mean two things. `\p{...}` is not Python syntax at all.
const NON_PORTABLE = /\\[sSdDwWbB]|\\[pP]\{|\(\?<[=!]/

const HOSTILE = {
  "trailing LF": "\n",
  "trailing CRLF": "\r\n",
  "trailing CR": "\r",
  "U+2028 line separator": "\u2028",
  "U+2029 paragraph separator": "\u2029",
  NUL: "\u0000",
}

function collectPatterns() {
  const found = new Map()
  const walk = (node, path, file) => {
    if (node === null || typeof node !== "object") return
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`, file))
      return
    }
    if (typeof node.pattern === "string") {
      if (!found.has(node.pattern)) found.set(node.pattern, [])
      found.get(node.pattern).push(`${file}${path}`)
    }
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`, file)
  }
  for (const name of STUDY_SCHEMAS) {
    const path = join(SCHEMAS, `${name}.schema.json`)
    if (existsSync(path)) walk(JSON.parse(readFileSync(path, "utf8")), "", `${name}.schema.json`)
  }
  return found
}

const PATTERNS = collectPatterns()

const SAMPLES = [
  "a".repeat(64), "a".repeat(40), "1", "1.5", "0", "study-v1", "abc", "qubits",
  "2026-09-01", "2026-09-01T00:00:00Z", "sha256:" + "a".repeat(64),
  "SOME_CODE", "a".repeat(32), "abcdefghijklmnop", "text/csv", "a/b",
  "01234567-89ab-4cde-8f01-23456789abcd", "objective",
]

test("the shipped schemas actually carry patterns", () => {
  assert.ok(PATTERNS.size >= 15, `only ${PATTERNS.size} patterns found under ${SCHEMAS}`)
})

test("no shipped pattern uses a shorthand the two engines read differently", () => {
  const offenders = []
  for (const [pattern, sites] of PATTERNS) {
    const found = NON_PORTABLE.exec(pattern)
    if (found) offenders.push(`${found[0]} in ${pattern} (${sites[0]})`)
  }
  assert.deepEqual(offenders, [], offenders.join("\n"))
})

test("no anchored pattern accepts a hostile suffix", () => {
  const problems = []
  for (const [pattern] of PATTERNS) {
    if (!(pattern.startsWith("^") && pattern.endsWith("$"))) continue
    const expression = new RegExp(pattern)
    const sample = SAMPLES.find((candidate) => expression.test(candidate))
    if (sample === undefined) continue
    for (const [label, suffix] of Object.entries(HOSTILE)) {
      if (expression.test(sample + suffix)) problems.push(`${label} accepted by ${pattern}`)
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"))
})

test("a unit cannot be padded, or carry a control character", () => {
  // The contract fix rather than the engine one: `.` accepted NUL and
  // surrounding spaces in *both* engines, and " seconds" is a value that reads
  // like `seconds` and hashes differently.
  const unitPattern = [...PATTERNS.keys()].find((pattern) => pattern.startsWith("^(?!"))
  assert.ok(unitPattern, "no open-family unit pattern found in the shipped schemas")
  const expression = new RegExp(unitPattern)

  assert.equal(expression.test("qubits"), true)
  assert.equal(expression.test("qubit seconds"), true, "an inner space is a legitimate unit")
  for (const bad of [" qubits", "qubits ", "q\u0000", "q\r", "q\u2028", "seconds"]) {
    assert.equal(expression.test(bad), false, `${JSON.stringify(bad)} was accepted`)
  }
})
