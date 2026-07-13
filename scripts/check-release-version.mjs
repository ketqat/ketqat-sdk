import { readFileSync } from "node:fs"

const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME
const semverTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
if (!tag || !semverTag.test(tag)) {
  throw new Error(`Release tag must be a complete SemVer prefixed with v; received ${tag ?? "nothing"}`)
}

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"))
const readAssignment = (path, name) => {
  const match = readFileSync(path, "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*["']([^"']+)["']`, "m"))
  if (!match) throw new Error(`Could not read ${name} from ${path}`)
  return match[1]
}
const pyprojectVersion = readFileSync("python/pyproject.toml", "utf8").match(
  /^version\s*=\s*["']([^"']+)["']/m,
)?.[1]

const versions = {
  tag: tag.slice(1),
  "package.json": rootPackage.version,
  "python/pyproject.toml": pyprojectVersion,
  "ketqat_runner.__version__": readAssignment("python/src/ketqat_runner/__init__.py", "__version__"),
  "runner SDK_VERSION": readAssignment("python/src/ketqat_runner/runner_version.py", "SDK_VERSION"),
}
if (Object.values(versions).some((version) => !version) || new Set(Object.values(versions)).size !== 1) {
  throw new Error(`Release versions do not match: ${JSON.stringify(versions)}`)
}

const version = rootPackage.version
const registries = [
  ["npm", `https://registry.npmjs.org/${rootPackage.name}/${encodeURIComponent(version)}`],
  ["PyPI", `https://pypi.org/pypi/ketqat/${encodeURIComponent(version)}/json`],
]
for (const [name, url] of registries) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "ketqat-release-preflight" },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 200) {
    throw new Error(`${name} already contains version ${version}; published versions are immutable and cannot be reused`)
  }
  if (response.status !== 404) {
    throw new Error(`${name} version check returned HTTP ${response.status}; refusing to treat an unknown result as safe`)
  }
  console.log(`${name}: ${version} is not published (HTTP 404).`)
}

console.log(`Release tag and all package versions agree on ${version}.`)
