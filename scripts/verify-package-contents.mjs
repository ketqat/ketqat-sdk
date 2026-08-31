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
const PACKAGE_SIZE_LIMIT_BYTES = 2_800_000
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
