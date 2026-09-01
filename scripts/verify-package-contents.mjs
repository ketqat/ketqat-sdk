import { spawnSync } from "node:child_process"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const pack = spawnSync(
  npmCommand,
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { cwd: process.cwd(), encoding: "utf8" },
)

if (pack.status !== 0) {
  process.stderr.write(pack.stderr)
  process.exit(pack.status ?? 1)
}

let manifest
try {
  const parsed = JSON.parse(pack.stdout)
  manifest = parsed[0]
} catch (error) {
  console.error("Could not parse npm pack JSON output.")
  console.error(error)
  process.exit(1)
}

if (!manifest || !Array.isArray(manifest.files)) {
  console.error("npm pack did not return a file manifest.")
  process.exit(1)
}

const files = manifest.files.map(({ path, size }) => ({ path, size }))
const filePaths = new Set(files.map(({ path }) => path))

const requiredFiles = [
  "LICENSE",
  "README.md",
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/client/index.js",
  "dist/client/index.d.ts",
  "dist/contracts/index.js",
  "dist/contracts/index.d.ts",
  "dist/schemas/index.js",
  "dist/schemas/index.d.ts",
  "dist/reproducibility/index.js",
  "dist/reproducibility/index.d.ts",
  // The `ketqat-sdk/study` subpath. Declared in `exports` but absent from the
  // tarball, it would resolve in this repository and fail at install time.
  "dist/study/index.js",
  "dist/study/index.d.ts",
  "dist/compatibility/index.js",
  "dist/compatibility/index.d.ts",
  "dist/demo/index.js",
  "dist/demo/index.d.ts",
  "schemas/artifact.schema.json",
  "examples/qec/surface-code-memory.yaml",
  "examples/algorithms/grover-search.yaml",
  // Required, not merely allowed: an artifact a user cannot cite is a gap this list is
  // the right place to hold shut, and "allowed" would let it silently disappear again.
  "CITATION.cff",
  // ketqat-web imports this from `ketqat-sdk/client`. Omitting it breaks that import at
  // install time rather than at build time, which is the worst moment to find out.
  "dist/client/token.js",
  "dist/client/token.d.ts",
]

// CITATION.cff ships so an installed copy can be cited; the repository had one and none
// of the three artifacts did, and `npm install` never sees the repository.
const allowedRootFiles = new Set(["LICENSE", "README.md", "package.json", "CITATION.cff"])
const isAllowedPackageFile = (path) =>
  allowedRootFiles.has(path) ||
  (path.startsWith("dist/") && /(?:\.js|\.js\.map|\.d\.ts|\.d\.ts\.map)$/.test(path)) ||
  (path.startsWith("schemas/") && path.endsWith(".schema.json")) ||
  // The QEC code catalog is generated data rather than a schema, and ships for
  // the same reason: consumers must read one source rather than a second copy.
  path === "schemas/qec-code-catalog.json" ||
  // Example manifests ship so `ketqat examples copy` and the docs work from an
  // installed package rather than only from a clone. JSON alongside YAML,
  // because execution-plane job manifests are JSON.
  (path.startsWith("examples/") && /\.(?:ya?ml|json)$/.test(path)) ||
  // The prose is the point of the mitigation example -- a mitigated value is an
  // estimate under a model, and an example shipped without that sentence
  // teaches the wrong lesson. So the README ships with the manifests.
  path === "examples/README.md"
const forbiddenPath =
  /(^|\/)(?:python|tests?|test-results|coverage|\.nyc_output|\.pytest_cache|__pycache__|node_modules|tmp|temp|\.env(?:\..*)?|\.DS_Store|\.idea|\.vscode)(\/|$)|(?:\.py[co]|\.log|\.tmp|\.swp|~)$/i

const missingFiles = requiredFiles.filter((path) => !filePaths.has(path))
const unexpectedFiles = files
  .map(({ path }) => path)
  .filter((path) => !isAllowedPackageFile(path))
const forbiddenFiles = files
  .map(({ path }) => path)
  .filter((path) => forbiddenPath.test(path))
const oversizedFiles = files.filter(({ size }) => size > 1_000_000)

const failures = []
if (missingFiles.length > 0) {
  failures.push(`Missing required files:\n- ${missingFiles.join("\n- ")}`)
}
if (unexpectedFiles.length > 0) {
  failures.push(`Files outside the allowlist:\n- ${unexpectedFiles.join("\n- ")}`)
}
if (forbiddenFiles.length > 0) {
  failures.push(`Forbidden generated or sensitive paths:\n- ${forbiddenFiles.join("\n- ")}`)
}
if (oversizedFiles.length > 0) {
  failures.push(
    `Unexpected files larger than 1 MB:\n- ${oversizedFiles
      .map(({ path, size }) => `${path} (${size} bytes)`)
      .join("\n- ")}`,
  )
}
// Raised from 2 MB to 2.5 MB for ketqat-sdk#236, which adds the resource
// intelligence contracts: ten JSON Schemas and their TypeScript declarations.
// The measured cost of that addition was ~510 KB against a 1.68 MB baseline,
// after two reductions made while adding it -- naming the `Quantity` type so
// declarations reference it instead of expanding it (413 KB of `bundle.d.ts`
// became 6 KB) and emitting the new schemas with in-document `$ref`s instead of
// full inlining (216 KB became 61 KB).
//
// The limit is a guard against accidental bloat, not a physical constraint, so
// it moves with a recorded reason rather than silently. Roughly 490 KB of what
// remains is source maps that point at TypeScript sources the package does not
// ship, and another large share is declaration expansion in `dist/contracts`
// and `dist/engine` of exactly the kind #236 fixed in its own module; both are
// tracked in ketqat-sdk#237 rather than fixed opportunistically here.
//
// Raised again from 2.5 MB to 2.8 MB for ketqat-sdk#259, which adds the study
// contract family: nine JSON Schemas and the `dist/study` module. The measured
// cost was ~287 KB against a 2.40 MB baseline, with the schemas already emitted
// as in-document `$ref`s and the large records already given hand-written
// interfaces so their declarations stay flat. The headroom this leaves is the
// same order as before, which is the point: the limit tracks what the package
// actually costs today, so the next unplanned 300 KB still has to argue for
// itself here.
//
// Raised again from 2.8 MB to 3.0 MB for the study hashing core: the RFC 8785
// canonicalizer, the typed projection, the preimage header, the four hash roles,
// the raw-byte file verifier and the record-kind classification tables. The
// measured cost was 178 KB against a 2.77 MB baseline -- 123 KB of code and
// declarations and 55 KB of the source maps ketqat-sdk#237 already tracks.
//
// Two reductions were made while adding it rather than after. The record-kind
// shape tables are 120 KB of JSON and are emitted only into the Python package,
// which is the only place they are read -- the TypeScript side has them in code,
// so a copy under `schemas/` would have been 120 KB no npm consumer opens.
// `tests/study-field-completeness.test.mjs` re-serializes the registry and
// compares the bytes, so dropping the second copy did not drop the drift check.
// And the projection is declared as data rather than generated per record kind,
// so nine record kinds cost nine tables and not nine modules.
//
// Raised again from 3.0 MB to 3.2 MB for study identity and lifecycle: the
// stable aggregate id, the typed event union, the chain anchor and the revision
// preconditions. The measured cost was 134 KB against a 2.95 MB baseline, in two
// parts.
//
// 48 KB is `schemas/study-event.schema.json`, which grew from 2.8 KB when the
// event became a discriminated union of twenty-two variants. That is what the
// shape costs after the reduction is already applied: the variants share one set
// of Zod instances for the chain fields, so `$refStrategy: "root"` emits each of
// them once and the other twenty-one variants carry `$ref`s. What remains is
// twenty-two `properties`, `required` and `additionalProperties` blocks, which is
// the union itself rather than repetition of it. Collapsing them would mean
// giving up the property the union exists for -- that a `task_started` event
// cannot carry a package reference -- and the JSON Schema is where a Python
// validator learns that.
//
// 60 KB is `dist/study`, roughly half of it the source maps ketqat-sdk#237
// already tracks. The three new modules are small by construction: the event
// rules are one table rather than twenty-two functions, and the persistence
// invariants are frozen data rather than code.
//
// Raised again from 3.2 MB to 3.5 MB for machine-actionable specifications and
// plans: dimensioned quantities, the structured elicitation queue, predicate
// criteria, the data-handling policy and the immutable version pins. The
// measured cost of that work package is 212 KB, in three parts.
//
// 124 KB is the five new modules under `dist/study` -- units, criteria,
// questions, policy and pins -- roughly half of it the source maps
// ketqat-sdk#237 already tracks. Each is a table plus a schema: the unit
// families, the resolution states, the comparator rules, the summary clauses
// and the pin requirements are all frozen data, so the behaviour costs rows
// rather than branches.
//
// 27 KB is the compiled `specification` and `plan` modules, which carry the
// refinements that make the queue complete and refuse a plan that has already
// decided its own outcome.
//
// 62 KB is `schemas/problem-specification.schema.json` and
// `schemas/study-plan.schema.json`. Most of it is the criterion threshold,
// which is a discriminated union with one variant per dimension so that each
// variant can carry its own `unit` enum. That is the whole point of the shape:
// `zod-to-json-schema` can emit an enum and cannot emit a refinement, and
// `python/src/ketqat_runner/study_validation.py` validates against the emitted
// schema -- so a unit rule written as a refinement would be a rule only
// TypeScript applies. Collapsing the union to one `unit: {"type": "string"}`
// would save most of the 62 KB and give the two languages two different
// contracts for the same file.
//
// The dimensioned `Quantity` schemas are cached per dimension in `units.ts`
// rather than built per field, so the emitted document carries one definition
// per dimension in use and not one per field that uses it.
//
// Raised again from 3.5 MB to 3.7 MB for the evidence graph: the claim value
// reference, the edge type matrix, provenance closure, the graph invariants and
// the review and reproduction records. The measured cost was 122 KB against a
// 3.51 MB baseline, in three parts.
//
// 98 KB is `dist/study/evidence`, half of it the source maps ketqat-sdk#237
// already tracks. The matrix and the grounding rules are declared as data and
// expanded once at load, so fifty-seven legal triples cost fifty-seven rows and
// not fifty-seven branches -- and the walk that uses them is one traversal
// rather than one per invariant.
//
// 19 KB is the two new record kinds, `review_record` and `reproduction_record`,
// compiled and emitted as schemas. They are records rather than edge kinds
// because a review's other end is a person and a reproduction's verdict is
// unrepresentable on an edge; the cost of that correctness is two small schemas.
//
// 5 KB is `schemas/evidence-node.schema.json` and
// `schemas/research-package.schema.json`, which grew when the claim stopped
// carrying a copy of its number and started naming the node that holds it. The
// reference is three fields where the embedded `Quantity` envelope was twelve,
// so the schema would have shrunk were it not for the subject reference, which
// is what makes a claim joinable to the workload it is about.
// Raised again from 3.7 MB to 3.9 MB for authorization and execution: the
// confirmation receipt, the four records that replace `StudyTask`, the typed
// artifact reference and the per-class execution capsule. The measured cost was
// 178 KB against a 3.46 MB baseline, in three parts.
//
// 80 KB is `dist/study/artifact` and `dist/study/receipt`, roughly half of it
// the source maps ketqat-sdk#237 already tracks. Both are a schema plus a
// frozen table; the receipt's own limitations and the operation-to-scope map
// are data, so the rules cost rows rather than branches.
//
// 83 KB is the growth of `dist/study/task`, `dist/study/capsule` and
// `dist/study/registry`. The task module went from one record to four, and the
// three new record kinds cost three shape tables in the registry -- which is
// the shape of the trade the projection was chosen for: a kind is a table, not
// a module.
//
// 15 KB is the four new schemas, minus the 3 KB `study-task.schema.json` they
// replace, plus 12 KB of growth in `execution-capsule.schema.json`. That growth
// is the discriminated union on execution class, and it is load-bearing for the
// same reason `study-event.schema.json` is large: `zod-to-json-schema` can emit
// a union and cannot emit a refinement, and
// `python/src/ketqat_runner/study_validation.py` validates against the emitted
// schema. Collapsing the three branches into one object with everything
// optional would save most of the 12 KB and let a local run be written with the
// completeness of a managed one, which is precisely what the union exists to
// prevent.
// Raised again from 3.9 MB to 4.3 MB for the verified research package (goal
// §13, §14). The package is 3,998,175 unpacked bytes after the change, and the
// cost is almost entirely new modules rather than growth in existing ones.
//
// 272 KB is nine new modules under `dist/study`, compiled and mapped:
// `figures` (55 KB), `tables` (48 KB), `report` (46 KB), `bundles` (35 KB),
// `recipe` (24 KB), `verification` (24 KB), `ledger` (18 KB), `package-limits`
// (14 KB) and `findings` (8 KB). Each of them replaces a string field with a
// structure, which is the trade this whole change is: `report_markdown` cost
// nothing to carry and established nothing about the numbers in it, and a
// report whose numbers are references costs a module.
//
// 38 KB is the growth of `schemas/research-package.schema.json`, from 20 KB to
// 59 KB. `zod-to-json-schema` can emit a union and cannot emit a refinement,
// and `python/src/ketqat_runner/study_validation.py` validates against the
// emitted schema, so a rule that exists only in a refinement is a rule only one
// of the two languages applies. The report segment, the table cell, the figure
// value reference and the recipe are each a shape a Python validator has to be
// able to check.
//
// The rest is the registry's new shape tables and the twenty-nine refusal codes
// the new surfaces need. Both are declared as data, so a surface costs rows
// rather than branches -- which is the same trade the projection was chosen for.
const PACKAGE_SIZE_LIMIT_BYTES = 4_300_000
if (manifest.unpackedSize > PACKAGE_SIZE_LIMIT_BYTES) {
  failures.push(
    `Unpacked package size ${manifest.unpackedSize} exceeds the ` +
      `${(PACKAGE_SIZE_LIMIT_BYTES / 1_000_000).toFixed(1)} MB policy limit.`,
  )
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"))
  process.exit(1)
}

console.log(
  `Verified npm package contents: ${files.length} files, ${manifest.unpackedSize} unpacked bytes.`,
)
