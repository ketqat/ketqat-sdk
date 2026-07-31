#!/usr/bin/env node
/**
 * Build every release artifact, and nothing else.
 *
 * This script **never publishes**. First publication to npm and PyPI is gated by
 * `docs/first-release-checklist.md` and belongs to a human; the point here is that
 * everything up to that moment is machine-checked, so the human step is one decision
 * rather than a build.
 *
 * What it produces in `dist-release/`:
 *
 *   ketqat-sdk-<version>.tgz          the npm tarball
 *   ketqat-<version>-py3-none-any.whl the Python wheel
 *   ketqat-<version>.tar.gz           the Python sdist
 *   sbom-npm.cyclonedx.json           dependency inventory for the npm package
 *   sbom-python.cyclonedx.json        dependency inventory for the Python distribution
 *   SHA256SUMS                        checksums for every artifact above
 *   provenance.json                   what was built, from what, with what
 *   reproducibility.json              evidence each artifact rebuilds byte-identically
 *
 * **Reproducibility is measured, not asserted.** Every artifact is built twice, into
 * separate directories, and the two SHA-256 digests are compared. A build that does not
 * reproduce is reported as not reproducing rather than quietly recorded as fine -- an
 * artifact nobody can rebuild is one nobody can check.
 *
 * The SBOMs are excluded from that comparison and from `SHA256SUMS`' reproducibility
 * claim, because a CycloneDX document carries a generation timestamp and a fresh UUID by
 * construction. Including them would make every build report "not reproducible" for a
 * reason that has nothing to do with the code, and the usual response to a check that
 * always fails is to stop reading it.
 *
 * Usage:
 *   node scripts/build-release-artifacts.mjs
 *   node scripts/build-release-artifacts.mjs --python python3.12
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OUTPUT = join(ROOT, "dist-release")
const flags = process.argv.slice(2)
const PYTHON = flags[flags.indexOf("--python") + 1] ?? (flags.includes("--python") ? null : "python3")

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options })
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function only(directory, pattern) {
  const matches = readdirSync(directory).filter((name) => pattern.test(name))
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${pattern} in ${directory}, found ${matches.join(", ") || "none"}`)
  }
  return join(directory, matches[0])
}

console.log("Building release artifacts. Nothing here publishes.\n")

rmSync(OUTPUT, { recursive: true, force: true })
mkdirSync(OUTPUT, { recursive: true })
const scratch = join(OUTPUT, ".build")
mkdirSync(scratch, { recursive: true })

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
const version = packageJson.version

// --------------------------------------------------------------------------- npm
// `npm pack` runs prepublishOnly, which rebuilds dist/. Both passes therefore exercise
// the real publish path rather than packing whatever happened to be lying around.
const npmDirectories = ["a", "b"].map((suffix) => {
  const directory = join(scratch, `npm-${suffix}`)
  mkdirSync(directory, { recursive: true })
  run("npm", ["pack", "--pack-destination", directory])
  return directory
})
const npmTarballs = npmDirectories.map((directory) => only(directory, /\.tgz$/))
const npmDigests = npmTarballs.map(sha256)
const npmArtifact = join(OUTPUT, `ketqat-sdk-${version}.tgz`)
renameSync(npmTarballs[0], npmArtifact)
console.log(`  npm      ${npmDigests[0].slice(0, 16)}  reproducible=${npmDigests[0] === npmDigests[1]}`)

// ------------------------------------------------------------------------ Python
const pythonDirectories = ["a", "b"].map((suffix) => {
  const directory = join(scratch, `py-${suffix}`)
  mkdirSync(directory, { recursive: true })
  run(PYTHON, ["-m", "build", "--outdir", directory, join(ROOT, "python")])
  return directory
})
const wheels = pythonDirectories.map((directory) => only(directory, /\.whl$/))
const sdists = pythonDirectories.map((directory) => only(directory, /\.tar\.gz$/))
const wheelDigests = wheels.map(sha256)
const sdistDigests = sdists.map(sha256)
const wheelArtifact = join(OUTPUT, `ketqat-${version}-py3-none-any.whl`)
const sdistArtifact = join(OUTPUT, `ketqat-${version}.tar.gz`)
renameSync(wheels[0], wheelArtifact)
renameSync(sdists[0], sdistArtifact)
console.log(`  wheel    ${wheelDigests[0].slice(0, 16)}  reproducible=${wheelDigests[0] === wheelDigests[1]}`)
console.log(`  sdist    ${sdistDigests[0].slice(0, 16)}  reproducible=${sdistDigests[0] === sdistDigests[1]}`)

// -------------------------------------------------------------------------- SBOMs
// `npm sbom` is built in, so this needs no dependency of its own -- a supply-chain
// inventory that itself pulls a package from the network is a strange thing to trust.
// `--omit dev` because the published package's dependency surface is what a consumer
// installs, not what building it required.
const npmSbom = run("npm", ["sbom", "--sbom-format", "cyclonedx", "--omit", "dev"])
writeFileSync(join(OUTPUT, "sbom-npm.cyclonedx.json"), npmSbom)

// The Python inventory is read out of the built wheel's own metadata rather than from
// pyproject.toml: the wheel is the artifact, and a declaration that failed to reach it
// would otherwise appear in the SBOM anyway.
const pythonSbom = run(PYTHON, [join(ROOT, "scripts", "python-sbom.py"), wheelArtifact])
writeFileSync(join(OUTPUT, "sbom-python.cyclonedx.json"), pythonSbom)
console.log("  sboms    npm + python (CycloneDX 1.5)")

// -------------------------------------------------------------- provenance + sums
const gitCommit = run("git", ["rev-parse", "HEAD"]).trim()
const gitStatus = run("git", ["status", "--porcelain"]).trim()

const provenance = {
  built_from: {
    repository: "https://github.com/ketqat/ketqat-sdk",
    commit: gitCommit,
    // A dirty tree is recorded, never cleaned. An artifact built from uncommitted changes
    // cannot be rebuilt by anyone else, and saying so is the whole value of this field.
    working_tree: gitStatus === "" ? "clean" : "dirty",
    uncommitted_paths: gitStatus === "" ? [] : gitStatus.split("\n").map((line) => line.trim()),
  },
  built_with: {
    node: process.version,
    npm: run("npm", ["--version"]).trim(),
    python: run(PYTHON, ["--version"]).trim(),
    platform: `${process.platform}-${process.arch}`,
  },
  versions: {
    npm_package: version,
    python_package: /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "python", "pyproject.toml"), "utf8"))?.[1],
    citation: /^version:\s*(\S+)/m.exec(readFileSync(join(ROOT, "CITATION.cff"), "utf8"))?.[1],
  },
  published: false,
  publication_note:
    "First publication to npm and PyPI is gated by docs/first-release-checklist.md and is a " +
    "human decision. This build never contacts a registry.",
}
writeFileSync(join(OUTPUT, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)

const reproducibility = {
  method:
    "Each artifact is built twice into separate directories and the SHA-256 digests are " +
    "compared. The SBOMs are excluded: CycloneDX carries a generation timestamp and a fresh " +
    "UUID, so including them would report every build as irreproducible for a reason " +
    "unrelated to the code.",
  artifacts: [
    { name: `ketqat-sdk-${version}.tgz`, first: npmDigests[0], second: npmDigests[1], reproducible: npmDigests[0] === npmDigests[1] },
    { name: `ketqat-${version}-py3-none-any.whl`, first: wheelDigests[0], second: wheelDigests[1], reproducible: wheelDigests[0] === wheelDigests[1] },
    { name: `ketqat-${version}.tar.gz`, first: sdistDigests[0], second: sdistDigests[1], reproducible: sdistDigests[0] === sdistDigests[1] },
  ],
}
writeFileSync(join(OUTPUT, "reproducibility.json"), `${JSON.stringify(reproducibility, null, 2)}\n`)

const sums = readdirSync(OUTPUT)
  .filter((name) => name !== "SHA256SUMS" && !name.startsWith("."))
  .sort()
  .map((name) => `${sha256(join(OUTPUT, name))}  ${name}`)
writeFileSync(join(OUTPUT, "SHA256SUMS"), `${sums.join("\n")}\n`)

rmSync(scratch, { recursive: true, force: true })

const irreproducible = reproducibility.artifacts.filter((artifact) => !artifact.reproducible)
console.log(`\n${sums.length} artifact(s) in dist-release/, checksummed.`)
if (irreproducible.length > 0) {
  console.error(`\nFAIL: ${irreproducible.length} artifact(s) did not rebuild byte-identically:`)
  for (const artifact of irreproducible) console.error(`  - ${artifact.name}`)
  console.error("\nAn artifact nobody can rebuild is one nobody can check.")
  process.exit(1)
}
console.log("All artifacts rebuilt byte-identically. Nothing was published.")

if (!existsSync(join(OUTPUT, "SHA256SUMS"))) process.exit(1)
