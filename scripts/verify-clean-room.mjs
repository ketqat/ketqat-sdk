#!/usr/bin/env node
/**
 * Run the clean room locally, the way the `clean-room` job runs it in CI.
 *
 * The suite in `scripts/clean-room/` is the *only* copy of these checks: CI
 * downloads it as a build artifact and runs it, and this script copies it into a
 * temporary directory and runs it. Neither place keeps a second copy, so the two
 * cannot drift, and a change to a check is a change both places take.
 *
 * What this reproduces, and why each part is not optional:
 *
 *   - a directory outside the repository, so nothing under test can resolve back
 *     into the working tree;
 *   - the artifacts from `dist-release/`, checksum-verified before installation,
 *     because an artifact nobody re-hashes is one nobody has checked;
 *   - `pip install <wheel>` and `npm install <tarball>` into fresh environments,
 *     which is what a consumer does and is not what `npm test` does;
 *   - the suite copied into the consumer directory, so bare specifiers resolve
 *     through npm's exports map rather than through a path this script chose.
 *
 * One deliberate difference from CI, stated rather than hidden: the workflow
 * installs the wheel as `[qec,algorithms]` because the same environment runs the
 * algorithm and QEC steps. Nothing in the study suite imports numpy, stim or
 * pymatching, so this installs the wheel bare and is faster for it. If that ever
 * stops being true, the import will fail here and pass in CI, which is the wrong
 * way round -- so it is worth knowing that this is the difference.
 *
 * Usage:
 *   node scripts/verify-clean-room.mjs                 # uses dist-release/
 *   node scripts/verify-clean-room.mjs --build         # builds the artifacts first
 *   node scripts/verify-clean-room.mjs --python python3.12 --keep
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const flags = process.argv.slice(2)
const option = (name, fallback) => {
  const index = flags.indexOf(name)
  return index === -1 ? fallback : flags[index + 1]
}

const ARTIFACTS = resolve(option("--artifacts", join(ROOT, "dist-release")))
const PYTHON = option("--python", "python3")
const KEEP = flags.includes("--keep")

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  })
}

/** Run a step of the suite with its output going straight to this terminal. */
function step(title, command, args, options = {}) {
  process.stdout.write(`\n== ${title}\n`)
  execFileSync(command, args, { stdio: ["ignore", "inherit", "inherit"], ...options })
}

// The package declares Node >=22 and npm only warns about an engine mismatch, so
// a run on an older Node would prove nothing about a supported engine while
// looking like it had.
const declared = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).engines?.node
const floor = Number(/^>=\s*(\d+)/.exec(declared ?? "")?.[1])
if (!Number.isInteger(floor)) throw new Error(`Cannot read a major-version floor from engines.node ${declared}`)
if (Number(process.versions.node.split(".")[0]) < floor) {
  throw new Error(
    `Running on Node ${process.versions.node}, below the >=${floor} the package declares. ` +
      "npm only warns, so this run would prove nothing about a supported engine.",
  )
}

if (flags.includes("--build")) {
  process.stdout.write("Building the release artifacts (each one twice, and compared).\n")
  step("npm run build:release", "npm", ["run", "build:release"], { cwd: ROOT })
}
if (!existsSync(join(ARTIFACTS, "SHA256SUMS"))) {
  throw new Error(`No SHA256SUMS in ${ARTIFACTS}. Run: npm run build:release`)
}

// Resolved through any symlink, because `import.meta.resolve` reports the real
// path and the suite compares the two. On macOS `/var` is a link to `/private/var`
// and an unresolved path here reads as "resolved outside the install".
const room = realpathSync(mkdtempSync(join(tmpdir(), "ketqat-clean-room-")))
const consumer = join(room, "node")
const venv = join(room, "py")
const records = join(room, "records")

try {
  // ------------------------------------------------------------ the artifacts
  const sums = readFileSync(join(ARTIFACTS, "SHA256SUMS"), "utf8").split("\n").filter(Boolean)
  for (const line of sums) {
    const [recorded, name] = line.split(/\s+/)
    const actual = createHash("sha256").update(readFileSync(join(ARTIFACTS, name))).digest("hex")
    if (actual !== recorded) throw new Error(`${name}: ${actual.slice(0, 16)} does not match SHA256SUMS`)
  }
  process.stdout.write(`\n== ${sums.length} artifact(s) match SHA256SUMS\n`)

  const only = (pattern) => {
    const matches = readdirSync(ARTIFACTS).filter((name) => pattern.test(name))
    if (matches.length !== 1) throw new Error(`expected exactly one ${pattern} in ${ARTIFACTS}`)
    return join(ARTIFACTS, matches[0])
  }
  const wheel = only(/^ketqat-.*-py3-none-any\.whl$/)
  const tarball = only(/^ketqat-sdk-.*\.tgz$/)

  // -------------------------------------------------------------- the installs
  step("python -m venv + pip install <wheel>", PYTHON, ["-m", "venv", venv])
  run(join(venv, "bin", "pip"), ["install", "--quiet", wheel])

  mkdirSync(consumer, { recursive: true })
  writeFileSync(join(consumer, "package.json"), `${JSON.stringify({ name: "clean-room", private: true }, null, 2)}\n`)
  step("npm install <tarball>", "npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: consumer })

  // The suite goes *inside* the consumer directory on purpose: Node resolves a
  // bare specifier from the importing module's own location, so a suite left
  // outside would not reach `node_modules/ketqat-sdk` at all and would have to
  // be given a path -- which is the thing being ruled out.
  const suite = join(consumer, "suite")
  cpSync(join(ROOT, "scripts", "clean-room"), suite, { recursive: true })

  const environment = {
    ...process.env,
    KETQAT_RECORDS: records,
    KETQAT_CONSUMER: consumer,
  }
  const node = (program) =>
    step(program, process.execPath, [join(suite, program)], { cwd: consumer, env: environment })

  node("assert-clean-room.mjs")
  node("build-records.mjs")
  node("verify-typescript.mjs")
  step("verify_python.py", join(venv, "bin", "python"), [join(suite, "verify_python.py")], {
    cwd: room,
    env: environment,
  })
  node("compare-languages.mjs")

  process.stdout.write(
    `\nPASS: the study contracts verify from installed artifacts alone, with no checkout in ${room}.\n`,
  )
} finally {
  if (KEEP) process.stdout.write(`\nKept the clean room at ${room}\n`)
  else rmSync(room, { recursive: true, force: true })
}
