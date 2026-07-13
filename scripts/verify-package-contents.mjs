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
]

const allowedRootFiles = new Set(["LICENSE", "README.md", "package.json"])
const allowedPrefixes = ["dist/", "schemas/", "examples/"]
const forbiddenPath =
  /(^|\/)(?:python|tests?|test-results|coverage|\.nyc_output|\.pytest_cache|__pycache__|node_modules|tmp|temp|\.env(?:\..*)?|\.DS_Store|\.idea|\.vscode)(\/|$)|(?:\.py[co]|\.log|\.tmp|\.swp|~)$/i

const missingFiles = requiredFiles.filter((path) => !filePaths.has(path))
const unexpectedFiles = files
  .map(({ path }) => path)
  .filter(
    (path) =>
      !allowedRootFiles.has(path) &&
      !allowedPrefixes.some((prefix) => path.startsWith(prefix)),
  )
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
