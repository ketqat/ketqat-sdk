import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const [version, artifactDirectoryArgument] = process.argv.slice(2)
if (!version || !artifactDirectoryArgument) {
  throw new Error("Usage: node scripts/check-registry-readback.mjs <version> <artifact-directory>")
}

const artifactDirectory = resolve(artifactDirectoryArgument)
const artifactFiles = readdirSync(artifactDirectory)
const maxAttempts = Number.parseInt(process.env.KETQAT_READBACK_ATTEMPTS ?? "12", 10)
const retryDelayMilliseconds = Number.parseInt(process.env.KETQAT_READBACK_DELAY_MS ?? "10000", 10)
const npmRegistryBase = (process.env.KETQAT_NPM_REGISTRY_BASE ?? "https://registry.npmjs.org").replace(/\/$/, "")
const pypiRegistryBase = (process.env.KETQAT_PYPI_REGISTRY_BASE ?? "https://pypi.org").replace(/\/$/, "")
if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || !Number.isInteger(retryDelayMilliseconds) || retryDelayMilliseconds < 0) {
  throw new Error("Readback retry settings must be positive attempt and non-negative delay integers")
}
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

const fetchPublishedJson = async (name, url) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let retryReason
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "ketqat-release-readback" },
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 200) return response.json()
      if (![404, 429].includes(response.status) && response.status < 500) {
        throw new Error(`${name} readback returned non-retryable HTTP ${response.status}`)
      }
      retryReason = `HTTP ${response.status}`
    } catch (error) {
      if (error instanceof Error && error.message.includes("non-retryable")) throw error
      retryReason = error instanceof Error ? error.message : String(error)
    }
    if (attempt < maxAttempts) {
      console.log(`${name} is not readable yet (${retryReason}); retrying ${attempt}/${maxAttempts}.`)
      await delay(retryDelayMilliseconds)
    }
  }
  throw new Error(`${name} was not readable after ${maxAttempts} attempts`)
}

const digest = (algorithm, path, encoding) =>
  createHash(algorithm).update(readFileSync(path)).digest(encoding)

const npmMetadata = await fetchPublishedJson(
  "npm",
  `${npmRegistryBase}/ketqat-sdk/${encodeURIComponent(version)}`,
)
if (npmMetadata.name !== "ketqat-sdk" || npmMetadata.version !== version) {
  throw new Error("npm readback returned the wrong package or version")
}
if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(npmMetadata.dist?.integrity ?? "")) {
  throw new Error("npm readback did not include a sha512 integrity value")
}
if (!/^[a-f0-9]{40}$/.test(npmMetadata.dist?.shasum ?? "")) {
  throw new Error("npm readback did not include a SHA-1 tarball shasum")
}
if (!String(npmMetadata.dist?.tarball ?? "").startsWith(`${npmRegistryBase}/`)) {
  throw new Error("npm readback returned an unexpected tarball origin")
}
const npmArtifacts = artifactFiles.filter((name) => name.endsWith(".tgz"))
if (npmArtifacts.length !== 1) throw new Error(`Expected one npm tarball; found ${npmArtifacts}`)
const npmArtifact = join(artifactDirectory, npmArtifacts[0])
if (`sha512-${digest("sha512", npmArtifact, "base64")}` !== npmMetadata.dist.integrity) {
  throw new Error("The npm registry integrity does not match the exact published workflow artifact")
}
if (digest("sha1", npmArtifact, "hex") !== npmMetadata.dist.shasum) {
  throw new Error("The npm registry shasum does not match the exact published workflow artifact")
}

const pypiMetadata = await fetchPublishedJson(
  "PyPI",
  `${pypiRegistryBase}/pypi/ketqat/${encodeURIComponent(version)}/json`,
)
if (pypiMetadata.info?.name !== "ketqat" || pypiMetadata.info?.version !== version) {
  throw new Error("PyPI readback returned the wrong project or version")
}
const pythonArtifacts = artifactFiles.filter((name) => name.endsWith(".whl") || name.endsWith(".tar.gz"))
if (pythonArtifacts.length !== 2) {
  throw new Error(`Expected one wheel and one sdist; found ${pythonArtifacts}`)
}
if (!pythonArtifacts.some((name) => name.endsWith(".whl")) || !pythonArtifacts.some((name) => name.endsWith(".tar.gz"))) {
  throw new Error(`Python artifacts must contain one wheel and one sdist; found ${pythonArtifacts}`)
}
for (const name of pythonArtifacts) {
  const published = pypiMetadata.urls?.find((entry) => entry.filename === name)
  if (!published || published.yanked) {
    throw new Error(`PyPI does not expose a non-yanked file named ${name}`)
  }
  if (digest("sha256", join(artifactDirectory, name), "hex") !== published.digests?.sha256) {
    throw new Error(`PyPI SHA-256 does not match the workflow artifact ${name}`)
  }
}

console.log(`Registry APIs expose ketqat-sdk and ketqat ${version} with exact artifact digests.`)
