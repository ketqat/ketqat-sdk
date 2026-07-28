#!/usr/bin/env node
/**
 * Validate a contribution without running it.
 *
 * A contribution arrives as a pull request from an account nobody vouches for,
 * and pull-request workflows run with repository credentials. A CI job that
 * executed contributed code would run a stranger's program with those
 * credentials on every submission.
 *
 * So this parses data and never evaluates it. There is no `eval`, no dynamic
 * import of a submitted path, no shelling out, and no network access. The
 * strongest thing a malicious file can do here is fail to parse.
 *
 * What it cannot do is tell whether the numbers are true. Nothing can, from a
 * file. That is why a reported result enters the registry as UNVERIFIED and
 * why a reproduction by somebody else is a separate contribution.
 *
 *   npm run validate:contribution -- contrib/my-result.yaml
 */
import { readFileSync } from "node:fs"

const path = process.argv[2]
if (!path) {
  console.error("usage: validate-contribution <file.yaml>")
  process.exit(2)
}

const MAX_BYTES = 2_000_000

let raw
try {
  raw = readFileSync(path, "utf8")
} catch (error) {
  console.error(`Could not read ${path}: ${error.message}`)
  process.exit(2)
}

if (raw.length > MAX_BYTES) {
  console.error(`FAIL: ${path} is ${raw.length} bytes; the limit is ${MAX_BYTES}.`)
  process.exit(1)
}

/**
 * A deliberately small YAML reader.
 *
 * Only the subset the templates use: nested maps, sequences of scalars, and
 * sequences of maps. It resolves no anchors, no aliases, no tags, and no
 * custom types -- the features through which YAML parsers have historically
 * been made to construct objects the author did not intend. A file using them
 * fails to parse, which is the correct outcome for a submission channel.
 */
function parse(text) {
  const lines = []
  for (const line of text.split("\n")) {
    const withoutComment = line.replace(/\s+#.*$/, "").replace(/^#.*$/, "")
    if (!withoutComment.trim()) continue
    if (/[&*!]|<<:/.test(withoutComment.trim().split(":").slice(1).join(":"))) {
      throw new Error(`anchors, aliases, and tags are not accepted: ${line.trim().slice(0, 60)}`)
    }
    lines.push([withoutComment.length - withoutComment.trimStart().length, withoutComment.trim()])
  }

  let index = 0
  /**
   * Coerce a scalar, respecting quotes.
   *
   * Quoting is how YAML says "this is a string". An earlier version stripped
   * quotes *before* testing for digits, so `commit_sha: "0000...0"` became the
   * number 0 -- which then failed `typeof value === "string"` and skipped the
   * SHA-format check entirely, and was falsy enough to trigger a spurious
   * missing-field error elsewhere.
   *
   * A validator that silently stops validating a field is worse than no
   * validator, so quoted values are strings and nothing else.
   */
  const scalar = (value) => {
    const trimmed = value.trim()
    const quoted = /^"(.*)"$|^'(.*)'$/.exec(trimmed)
    if (quoted) return quoted[1] ?? quoted[2] ?? ""
    if (trimmed === "true") return true
    if (trimmed === "false") return false
    if (trimmed === "" || trimmed === "~" || trimmed === "null") return null
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
    if (/^-?\d*\.\d+(e-?\d+)?$/i.test(trimmed)) return Number(trimmed)
    if (/^-?\d+e-?\d+$/i.test(trimmed)) return Number(trimmed)
    return trimmed
  }

  function block(indent) {
    if (index >= lines.length) return null
    if (lines[index][1].startsWith("- ")) {
      const items = []
      while (index < lines.length && lines[index][0] === indent && lines[index][1].startsWith("- ")) {
        const inner = lines[index][1].slice(2).trim()
        index += 1
        if (inner.includes(":") && !inner.startsWith("[")) {
          const [key, ...rest] = inner.split(":")
          const entry = {}
          const value = rest.join(":").trim()
          entry[key.trim()] = value ? scalar(value) : block(indent + 4)
          while (index < lines.length && lines[index][0] > indent && !lines[index][1].startsWith("- ")) {
            const [k, ...r] = lines[index][1].split(":")
            const v = r.join(":").trim()
            const childIndent = lines[index][0]
            index += 1
            entry[k.trim()] = v ? scalar(v) : block(childIndent + 2)
          }
          items.push(entry)
        } else if (inner.startsWith("[")) {
          items.push(inner.slice(1, -1).split(",").map((part) => scalar(part)))
        } else {
          items.push(scalar(inner))
        }
      }
      return items
    }

    const map = {}
    while (index < lines.length && lines[index][0] === indent) {
      const [key, ...rest] = lines[index][1].split(":")
      const value = rest.join(":").trim()
      index += 1
      if (value.startsWith("[")) {
        map[key.trim()] = value.slice(1, -1).split(",").filter((p) => p.trim()).map((part) => scalar(part))
      } else if (value === ">-" || value === "|" || value === ">") {
        const parts = []
        while (index < lines.length && lines[index][0] > indent) {
          parts.push(lines[index][1])
          index += 1
        }
        map[key.trim()] = parts.join(" ")
      } else if (value) {
        map[key.trim()] = scalar(value)
      } else {
        map[key.trim()] = index < lines.length && lines[index][0] > indent ? block(lines[index][0]) : null
      }
    }
    return map
  }

  return block(lines[0]?.[0] ?? 0)
}

let doc
try {
  doc = parse(raw)
} catch (error) {
  console.error(`FAIL: ${path} could not be parsed: ${error.message}`)
  process.exit(1)
}

const failures = []
const fail = (message) => failures.push(message)

const PLACEHOLDER_SHA = /^0{40}$/
const PLACEHOLDER_HASH = /^0{64}$/

const kind = doc?.kind
if (!kind) fail("no `kind`. Expected benchmark-result, reproduction-report, or artifact")

function requireFields(fields) {
  for (const field of fields) {
    const value = field.split(".").reduce((node, part) => (node ? node[part] : undefined), doc)
    // Explicitly not a falsy test: 0 and false are present values, and an
    // earlier version reported a field holding 0 as missing.
    if (value === undefined || value === null || value === "") fail(`missing required field: ${field}`)
  }
}

if (kind === "benchmark-result") {
  requireFields([
    "benchmark_suite",
    "benchmark_suite_version",
    "name",
    "domain",
    "commit_sha",
    "source_repository_url",
    "environment",
    "summary_metrics",
    "reproducibility_hash",
  ])

  // A branch moves; a result pointing at one cannot be reproduced later.
  if (typeof doc.commit_sha === "string" && !/^[0-9a-f]{40}$/i.test(doc.commit_sha)) {
    fail("commit_sha must be a full 40-character commit SHA, not a branch or tag name")
  }
  if (PLACEHOLDER_SHA.test(String(doc.commit_sha ?? ""))) {
    fail("commit_sha is still the template placeholder")
  }
  if (PLACEHOLDER_HASH.test(String(doc.reproducibility_hash ?? ""))) {
    fail("reproducibility_hash is still the template placeholder; produce it with the runner")
  }

  // Without a seed nobody can obtain these numbers again, including the author.
  const shots = doc.configuration?.sampling?.shots
  const seed = doc.configuration?.sampling?.seed
  if (shots && (seed === undefined || seed === null)) {
    fail("configuration.sampling.seed is required when shots are sampled; the run is otherwise unrepeatable")
  }

  // A point estimate with no interval invites a comparison the data cannot support.
  const points = Array.isArray(doc.metric_points) ? doc.metric_points : []
  for (const [position, point] of points.entries()) {
    if (point && point.shots && point.standard_error === undefined) {
      fail(`metric_points[${position}] reports a sampled metric with no standard_error`)
    }
  }

  if (doc.is_demo === undefined) {
    fail("is_demo must be stated. Omitting it leaves a demonstration indistinguishable from a measurement")
  }
}

if (kind === "reproduction-report") {
  requireFields(["subject.type", "subject.slug", "evidence_kind", "status", "summary", "checked_at"])

  // The distinction the whole verification model rests on.
  if (doc.status === "REPRODUCED") {
    if (doc.evidence_kind === "HASH_VERIFICATION") {
      fail(
        "HASH_VERIFICATION cannot be REPRODUCED. A matching hash proves the record is unaltered; " +
          "a fabricated result hashes just as consistently",
      )
    }
    for (const field of ["evidence_url", "reproducibility_hash"]) {
      const value = doc[field]
      if (value === undefined || value === null || value === "") {
        fail(`REPRODUCED requires ${field}; a reproduction nobody can follow is not evidence`)
      }
    }
    if (!doc.source?.command && !doc.source?.commit_sha) {
      fail("REPRODUCED requires source.command or source.commit_sha")
    }
  }
  if (PLACEHOLDER_HASH.test(String(doc.reproducibility_hash ?? ""))) {
    fail("reproducibility_hash is still the template placeholder")
  }
}

if (kind === "artifact") {
  requireFields(["artifact_type", "name", "slug", "summary", "repository_url", "license"])
  if (doc.license && !/^(Apache-2\.0|MIT|BSD-[23]-Clause|ISC)$/.test(String(doc.license))) {
    fail(`license ${doc.license} is not known to be compatible with Apache-2.0; raise an issue to discuss it`)
  }
  if (doc.paper_url === undefined) fail("paper_url must be present, even if empty")
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} problem(s) in ${path}\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error("\nSee contrib/README.md for what each field means and why it is required.")
  process.exit(1)
}

console.log(`Validated ${path} as a ${kind}.`)
console.log(
  "This checks structure and provenance. It does not check whether the numbers are true --\n" +
    "nothing can, from a file. The result enters the registry as UNVERIFIED until somebody else\n" +
    "reproduces it.",
)
