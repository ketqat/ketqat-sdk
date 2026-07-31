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
if (manifest.unpackedSize > 2_000_000) {
  failures.push(
    `Unpacked package size ${manifest.unpackedSize} exceeds the 2 MB policy limit.`,
  )
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"))
  process.exit(1)
}

console.log(
  `Verified npm package contents: ${files.length} files, ${manifest.unpackedSize} unpacked bytes.`,
)
