#!/usr/bin/env node
/**
 * Gate on what the release artifacts actually contain.
 *
 * `npm test` already checks the *repository*. This checks the three files a user would
 * install, because the two are not the same question and the gap between them is where
 * packaging defects live: `ketqat-benchmarks` shipped a wheel holding the harness and
 * none of its suites, results, citation file or gate, and every test passed, because CI
 * installed the source tree with `-e .` and every path resolved.
 *
 * Checks, each against the built file rather than a manifest describing it:
 *
 *   - every artifact named in SHA256SUMS exists and re-hashes to the recorded digest
 *   - every artifact carries a licence
 *   - every artifact carries CITATION.cff, so an installed copy can be cited
 *   - the npm tarball carries dist/, schemas/ and examples/
 *   - the wheel carries the runner, its examples and its entry point
 *   - the version agrees across package.json, pyproject.toml and CITATION.cff
 *   - reproducibility.json reports every artifact rebuilding byte-identically
 *   - provenance.json records that nothing was published
 *
 * Usage:
 *   node scripts/verify-release-artifacts.mjs            # dist-release/
 *   node scripts/verify-release-artifacts.mjs <dir>
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OUTPUT = process.argv[2] ?? join(ROOT, "dist-release")

const failures = []
const notes = []

function fail(message) {
  failures.push(message)
}

if (!existsSync(OUTPUT)) {
  console.error(`FAIL: ${OUTPUT} does not exist. Run: npm run build:release`)
  process.exit(1)
}

// ------------------------------------------------------------------- checksums
const sumsPath = join(OUTPUT, "SHA256SUMS")
if (!existsSync(sumsPath)) {
  fail("SHA256SUMS is missing; there is nothing to check the artifacts against")
} else {
  const recorded = readFileSync(sumsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [digest, name] = line.split(/\s+/)
      return { digest, name }
    })

  for (const { digest, name } of recorded) {
    const path = join(OUTPUT, name)
    if (!existsSync(path)) {
      fail(`SHA256SUMS names ${name}, which is not in ${OUTPUT}`)
      continue
    }
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex")
    if (actual !== digest) fail(`${name}: digest ${actual.slice(0, 16)} does not match recorded ${digest.slice(0, 16)}`)
  }

  // The converse: a file present and unlisted. A checksum file that covers only some of
  // what shipped gives assurance about the artifacts nobody was worried about.
  const listed = new Set(recorded.map((entry) => entry.name))
  for (const name of readdirSync(OUTPUT)) {
    if (name === "SHA256SUMS" || name.startsWith(".")) continue
    if (!listed.has(name)) fail(`${name} is in ${OUTPUT} and not in SHA256SUMS`)
  }
  notes.push(`ok   ${recorded.length} artifact(s) match SHA256SUMS`)
}

// ------------------------------------------------------------- artifact contents
function tarEntries(path) {
  return execFileSync("tar", ["tzf", path], { encoding: "utf8" }).split("\n").filter(Boolean)
}

function zipEntries(path) {
  // `unzip -Z1` is not everywhere; Node can read the central directory well enough for a
  // name list without a dependency.
  const buffer = readFileSync(path)
  const names = []
  for (let index = 0; index < buffer.length - 4; index += 1) {
    if (buffer.readUInt32LE(index) !== 0x02014b50) continue
    const nameLength = buffer.readUInt16LE(index + 28)
    names.push(buffer.subarray(index + 46, index + 46 + nameLength).toString("utf8"))
  }
  return names
}

function requireEntry(names, predicate, label, artifact) {
  if (!names.some(predicate)) fail(`${artifact}: no ${label}`)
}

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version

const npmTarball = join(OUTPUT, `ketqat-sdk-${version}.tgz`)
if (existsSync(npmTarball)) {
  const names = tarEntries(npmTarball)
  requireEntry(names, (name) => name === "package/LICENSE", "LICENSE", "npm tarball")
  requireEntry(names, (name) => name === "package/CITATION.cff", "CITATION.cff", "npm tarball")
  requireEntry(names, (name) => name.startsWith("package/dist/"), "dist/", "npm tarball")
  requireEntry(names, (name) => name.startsWith("package/schemas/"), "schemas/", "npm tarball")
  requireEntry(names, (name) => name.startsWith("package/examples/"), "examples/", "npm tarball")
  // The token resolver is the one module ketqat-web imports from `ketqat-sdk/client`;
  // shipping the package without it breaks that import at install time, not at build time.
  requireEntry(names, (name) => name === "package/dist/client/token.js", "dist/client/token.js", "npm tarball")
  notes.push(`ok   npm tarball: ${names.length} entries, licence and citation present`)
} else {
  fail(`ketqat-sdk-${version}.tgz is missing`)
}

const wheel = join(OUTPUT, `ketqat-${version}-py3-none-any.whl`)
if (existsSync(wheel)) {
  const names = zipEntries(wheel)
  requireEntry(names, (name) => /dist-info\/licenses\/LICENSE$/.test(name), "LICENSE", "wheel")
  requireEntry(names, (name) => name === "ketqat_runner/CITATION.cff", "CITATION.cff", "wheel")
  requireEntry(names, (name) => name === "ketqat_runner/cli.py", "cli.py", "wheel")
  requireEntry(names, (name) => name.startsWith("ketqat_runner/examples/"), "packaged examples", "wheel")
  requireEntry(names, (name) => /dist-info\/entry_points.txt$/.test(name), "entry point", "wheel")
  notes.push(`ok   wheel: ${names.length} entries, licence and citation present`)
} else {
  fail(`ketqat-${version}-py3-none-any.whl is missing`)
}

const sdist = join(OUTPUT, `ketqat-${version}.tar.gz`)
if (existsSync(sdist)) {
  const names = tarEntries(sdist)
  requireEntry(names, (name) => name.endsWith("/LICENSE"), "LICENSE", "sdist")
  requireEntry(names, (name) => name.endsWith("/CITATION.cff"), "CITATION.cff", "sdist")
  notes.push(`ok   sdist: ${names.length} entries, licence and citation present`)
} else {
  fail(`ketqat-${version}.tar.gz is missing`)
}

// --------------------------------------------------------------------- versions
const pythonVersion = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "python", "pyproject.toml"), "utf8"))?.[1]
const citationVersion = /^version:\s*(\S+)/m.exec(readFileSync(join(ROOT, "CITATION.cff"), "utf8"))?.[1]
if (pythonVersion !== version || citationVersion !== version) {
  fail(
    `versions disagree: package.json ${version}, pyproject.toml ${pythonVersion}, CITATION.cff ${citationVersion}. ` +
      "A citation naming one release while the artifact is another points a reader at different hashing behaviour.",
  )
} else {
  notes.push(`ok   version ${version} agrees across package.json, pyproject.toml and CITATION.cff`)
}

// ------------------------------------------------- reproducibility and provenance
const reproducibilityPath = join(OUTPUT, "reproducibility.json")
if (!existsSync(reproducibilityPath)) {
  fail("reproducibility.json is missing; nothing records whether these rebuild")
} else {
  const reproducibility = JSON.parse(readFileSync(reproducibilityPath, "utf8"))
  const bad = reproducibility.artifacts.filter((artifact) => !artifact.reproducible)
  if (bad.length > 0) fail(`${bad.length} artifact(s) did not rebuild byte-identically: ${bad.map((a) => a.name).join(", ")}`)
  else notes.push(`ok   ${reproducibility.artifacts.length} artifact(s) rebuilt byte-identically`)

  // The digests recorded as reproducible must be the digests actually shipped, or the
  // evidence describes a different build from the one in this directory.
  for (const artifact of reproducibility.artifacts) {
    const path = join(OUTPUT, artifact.name)
    if (!existsSync(path)) continue
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex")
    if (actual !== artifact.first) {
      fail(`${artifact.name}: reproducibility evidence records ${artifact.first.slice(0, 16)}, the shipped file is ${actual.slice(0, 16)}`)
    }
  }
}

const provenancePath = join(OUTPUT, "provenance.json")
if (!existsSync(provenancePath)) {
  fail("provenance.json is missing; nothing records what these were built from")
} else {
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8"))
  if (provenance.published !== false) fail("provenance.json does not record published: false")
  if (!provenance.built_from?.commit) fail("provenance.json records no source commit")
  // Print the value read, not the value expected. The first version of this line had
  // "published=false" as literal text, so a run that failed the check above still
  // printed a reassuring note beside the failure.
  notes.push(
    `ok   provenance: commit ${provenance.built_from?.commit?.slice(0, 7)}, ` +
      `tree ${provenance.built_from?.working_tree}, published=${provenance.published}`,
  )
}

for (const note of notes) console.log(`  ${note}`)

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} finding(s)\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`\nPASS: release artifacts in ${OUTPUT} are complete, checksummed, citable and unpublished.`)
