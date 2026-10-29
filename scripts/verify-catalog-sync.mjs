#!/usr/bin/env node
/**
 * Fail if the catalog shipped to Python drifts from `catalog/`, or if
 * `catalog/catalog.json` no longer matches the product files it indexes.
 *
 * `catalog/` is authored once and copied byte for byte into
 * `python/src/ketqat_runner/catalog/data/` by
 * `python -m ketqat_runner.catalog.build`. The npm package ships `catalog/`
 * (ketqat-web imports `ketqat-sdk/catalog/catalog.json`), the Python package
 * ships the copy, and the web app accepts a published definition only when its
 * sha256 matches the one in the index. A copy that drifted would let the CLI
 * run one definition while the website showed another.
 *
 * This check is independent of the Python builder on purpose: it recomputes the
 * hashes itself, so a bug in the builder cannot certify its own output.
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = resolve(root, "catalog")
const packaged = resolve(root, "python", "src", "ketqat_runner", "catalog", "data")

function relativeJson(base) {
  const walk = (directory) =>
    readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) return walk(path)
      return entry.endsWith(".json") ? [relative(base, path)] : []
    })
  return walk(base).sort()
}

const failures = []
const sourceFiles = relativeJson(source)
let packagedFiles = []
try {
  packagedFiles = relativeJson(packaged)
} catch {
  failures.push("python/src/ketqat_runner/catalog/data is missing")
}

for (const file of sourceFiles) {
  if (!packagedFiles.includes(file)) {
    failures.push(`${file}: missing from the packaged Python copy`)
  } else if (!readFileSync(join(source, file)).equals(readFileSync(join(packaged, file)))) {
    failures.push(`${file}: packaged copy differs`)
  }
}
for (const file of packagedFiles) {
  if (!sourceFiles.includes(file)) {
    failures.push(`${file}: in the packaged copy but not in catalog/`)
  }
}

const index = JSON.parse(readFileSync(join(source, "catalog.json"), "utf8"))
const indexed = new Set()
for (const entry of index.products) {
  indexed.add(entry.path)
  const digest = createHash("sha256").update(readFileSync(join(source, entry.path))).digest("hex")
  if (digest !== entry.sha256) {
    failures.push(`${entry.path}: sha256 ${digest} does not match catalog.json (${entry.sha256})`)
  }
  const definition = JSON.parse(readFileSync(join(source, entry.path), "utf8"))
  if (definition.id !== entry.id || definition.slug !== entry.slug || definition.tier !== entry.tier) {
    failures.push(`${entry.path}: id, slug or tier differs from catalog.json`)
  }
}
for (const file of sourceFiles.filter((file) => file.startsWith("products/"))) {
  if (!indexed.has(file)) failures.push(`${file}: not listed in catalog.json`)
}
const ids = index.products.map((entry) => entry.id)
if (JSON.stringify(ids) !== JSON.stringify([...ids].sort())) {
  failures.push("catalog.json products are not sorted by id")
}
const schemaDigest = createHash("sha256").update(readFileSync(join(source, "schema", "product.schema.json"))).digest("hex")
if (schemaDigest !== index.productSchemaSha256) {
  failures.push("catalog.json productSchemaSha256 does not match catalog/schema/product.schema.json")
}

if (failures.length > 0) {
  console.error("The catalog is out of sync:\n")
  for (const failure of failures) console.error(`  ${failure}`)
  console.error("\nRun: python -m ketqat_runner.catalog.build")
  process.exit(1)
}

console.log(
  `Verified the catalog: ${index.products.length} products indexed with matching sha256, ` +
    `${sourceFiles.length} files identical in the Python package.`,
)
