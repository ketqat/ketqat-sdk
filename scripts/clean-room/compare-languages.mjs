/**
 * The one claim neither language can make on its own.
 *
 * `verify-typescript.mjs` and `verify_python.py` each read the same JSON files
 * and each wrote down what they computed. Both halves came out of the release
 * artifacts, so this is a statement about what ships rather than about two
 * source trees that happen to sit in one repository.
 *
 * Four comparisons, each a different way the two implementations could drift
 * apart without either one failing by itself:
 *
 * 1. **Digests.** Every record, under every purpose. A disagreement here is a
 *    file one language says is intact and the other says is edited, which is
 *    strictly worse than either answer alone -- the reader is left unable to
 *    check rather than told that two answers disagree. Refusals are compared as
 *    codes, so "both refuse, for the same reason" counts and "one refuses, one
 *    answers" fails.
 *
 * 2. **The JSON Schemas.** The tarball ships `schemas/`, the wheel ships
 *    `ketqat_runner/schemas/`, and `npm run verify:schema-sync` compares the two
 *    *source* copies. Nothing before this compared the two **shipped** copies,
 *    which is the pair a consumer actually validates against. Byte comparison,
 *    because a schema that differs by a whitespace-only regeneration is still
 *    two files that can drift next time.
 *
 * 3. **The record-kind tables.** Which field carries a record's own digest, and
 *    under which purpose, is a fact both languages must agree about before a
 *    single digest is comparable at all. TypeScript holds it in code; the wheel
 *    reads the emitted copy. Comparing them turns a digest disagreement into the
 *    specific sentence "these two builds disagree about what a capsule's
 *    self-hash is", which is the difference between a fixable report and a
 *    puzzle.
 *
 * 4. **The version.** Read out of the two installs rather than out of the
 *    repository. `npm run verify:release` already compares every local file that
 *    states the version; what it cannot see is a runner reporting a version it is
 *    not once installed, which is a wrong provenance record on every run that
 *    runner writes.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { STUDY_RECORD_KINDS } from "ketqat-sdk/study"

import { corpusIdOf, done, must, readRecord } from "./support.mjs"

/**
 * Read one half, or say which program did not finish.
 *
 * Each verifier deletes its own output before it starts, so a missing file here
 * means that half did not complete rather than that it disagreed -- and those
 * are two different messages for the person reading a failed run.
 */
function half(name, program) {
  try {
    return readRecord(name)
  } catch (error) {
    throw new Error(
      `${name}.json is not there (${error.code ?? error.message}), so ${program} did not finish. ` +
        "There is nothing to compare, and comparing what an earlier run left behind would be worse than that.",
    )
  }
}

const nodeSide = half("digests-node", "verify-typescript.mjs")
const pythonSide = half("digests-python", "verify_python.py")
const pythonInstall = half("python-install", "verify_python.py")

// ------------------------------------------------------------- the same corpus
//
// Before anything is compared, both halves must name the records this run built.
// Without this the programs are two files in a directory, and a run whose Python
// half failed still compares against whatever `digests-python.json` an earlier
// pass left behind -- reporting agreement between a half computed now and a half
// computed before the change under test.
const corpus = readRecord("corpus")
const expected = corpusIdOf(corpus.records)
must(
  corpus.corpus_id === expected &&
    nodeSide.corpus_id === expected &&
    pythonSide.corpus_id === expected,
  `both halves were computed from this run's corpus ${expected.slice(0, 16)}…`,
  `corpus.json ${corpus.corpus_id?.slice(0, 16)}, node ${nodeSide.corpus_id?.slice(0, 16)}, ` +
    `python ${pythonSide.corpus_id?.slice(0, 16)}, records on disk ${expected.slice(0, 16)}`,
)

// ------------------------------------------------------------------- digests

const node = nodeSide.digests
const python = pythonSide.digests
const names = [...new Set([...Object.keys(node), ...Object.keys(python)])].sort()
must(names.length > 0, `${names.length} records in the shared corpus`)

const disagreements = []
let compared = 0
for (const name of names) {
  const left = node[name]
  const right = python[name]
  if (left === undefined || right === undefined) {
    disagreements.push(`${name}: only ${left === undefined ? "Python" : "TypeScript"} hashed it`)
    continue
  }
  for (const purpose of ["self", "semantic", "record", "receipt"]) {
    compared += 1
    if (left[purpose] !== right[purpose]) {
      disagreements.push(`${name} (${purpose}): node ${left[purpose]} / python ${right[purpose]}`)
    }
  }
}
if (disagreements.length > 0) {
  throw new Error(
    `TypeScript and Python disagree on ${disagreements.length} digest(s):\n  ${disagreements.join("\n  ")}\n` +
      "A file one language calls intact and the other calls edited leaves the reader unable to check.",
  )
}
must(compared === names.length * 4, `${compared} digests agree across the two installed artifacts`)

// A corpus that agreed because everything in it refused would agree vacuously.
const answered = names.flatMap((name) =>
  Object.values(node[name]).filter((value) => !String(value).startsWith("refused:")),
)
const refused = names.flatMap((name) =>
  Object.values(node[name]).filter((value) => String(value).startsWith("refused:")),
)
must(
  answered.length > 0 && new Set(answered).size > 1,
  `${answered.length} digest(s), ${new Set(answered).size} of them distinct, plus ${refused.length} ` +
    `refusal(s) both languages made: ${[...new Set(refused)].map((code) => code.slice(8)).sort().join(", ") || "none"}`,
)

// The capsule, named rather than left to the aggregate. It is the record a
// second party holds when they ask "is this the run that was described", and a
// blanket "80 digests agree" does not tell a reader that this particular
// question was asked of both languages.
const capsule = readRecord("execution-capsule")
must(
  node["execution_capsule/execution-capsule"].self === python["execution_capsule/execution-capsule"].self &&
    node["execution_capsule/execution-capsule"].self === capsule.reproducibility_hash,
  `both languages recompute the capsule's reproducibility hash as the one written on it ` +
    `(${capsule.reproducibility_hash.slice(0, 16)}…)`,
  `node ${node["execution_capsule/execution-capsule"].self}, ` +
    `python ${python["execution_capsule/execution-capsule"].self}, file ${capsule.reproducibility_hash}`,
)

// ------------------------------------------------------------- the JSON Schemas

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.resolve("ketqat-sdk/study")))))
const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
const fromTarball = join(packageRoot, "schemas")
const fromWheel = pythonInstall.schemas_dir

const drifted = []
const studySchemas = STUDY_RECORD_KINDS.map((entry) => `${entry.record_kind.replace(/_/g, "-")}.schema.json`)
for (const filename of studySchemas) {
  const tarball = readFileSync(join(fromTarball, filename))
  const wheel = readFileSync(join(fromWheel, filename))
  if (!tarball.equals(wheel)) drifted.push(filename)
}
must(
  drifted.length === 0,
  `all ${studySchemas.length} shipped study schemas are byte-identical in the tarball and the wheel`,
  `${fromTarball} and ${fromWheel} differ in: ${drifted.join(", ")}`,
)

// ------------------------------------------------------- the record-kind tables

const inCode = STUDY_RECORD_KINDS.map((entry) => ({
  record_kind: entry.record_kind,
  self_hash_field: entry.self_hash_field,
  self_hash_purpose: entry.self_hash_purpose,
}))
const inWheel = pythonInstall.record_kinds
const tableDrift = []
if (inCode.length !== inWheel.length) {
  tableDrift.push(`${inCode.length} kinds in the tarball, ${inWheel.length} in the wheel`)
}
for (const entry of inCode) {
  const mirror = inWheel.find((candidate) => candidate.record_kind === entry.record_kind)
  if (mirror === undefined) {
    tableDrift.push(`${entry.record_kind} is not a record kind the wheel knows`)
    continue
  }
  if (mirror.self_hash_field !== entry.self_hash_field || mirror.self_hash_purpose !== entry.self_hash_purpose) {
    tableDrift.push(
      `${entry.record_kind}: tarball says ${entry.self_hash_field}/${entry.self_hash_purpose}, ` +
        `wheel says ${mirror.self_hash_field}/${mirror.self_hash_purpose}`,
    )
  }
}
must(
  tableDrift.length === 0,
  `both artifacts agree on the self-hash field and purpose of all ${inCode.length} record kinds`,
  tableDrift.join("; "),
)

// ------------------------------------------------------------------ the version

must(
  installed.version === pythonInstall.version,
  `both artifacts report version ${installed.version} once installed`,
  `tarball ${installed.version}, wheel ${pythonInstall.version}`,
)

done(`ketqat-sdk and ketqat both ${installed.version}, as installed, agree about the study family`)
