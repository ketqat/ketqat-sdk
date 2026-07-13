import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const root = process.cwd()
const temporaryRoot = mkdtempSync(join(tmpdir(), "ketqat-sdk-clean-install-"))

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  })

try {
  const pack = spawnSync(
    npmCommand,
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot],
    { cwd: root, encoding: "utf8" },
  )
  if (pack.status !== 0) {
    process.stderr.write(pack.stderr)
    process.exit(pack.status ?? 1)
  }

  const manifest = JSON.parse(pack.stdout)[0]
  if (!manifest?.filename || !Array.isArray(manifest.files)) {
    throw new Error("npm pack did not return a tarball manifest")
  }

  const tarball = resolve(temporaryRoot, manifest.filename)
  const consumer = join(temporaryRoot, "consumer")
  mkdirSync(consumer)
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "ketqat-sdk-package-consumer", private: true, type: "module" }, null, 2),
  )

  run(
    npmCommand,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: consumer },
  )

  const specifiers = [
    "ketqat-sdk",
    "ketqat-sdk/client",
    "ketqat-sdk/contracts",
    "ketqat-sdk/schemas",
    "ketqat-sdk/reproducibility",
    "ketqat-sdk/compatibility",
    "ketqat-sdk/demo",
  ]
  writeFileSync(
    join(consumer, "runtime.mjs"),
    `const specifiers = ${JSON.stringify(specifiers)}\nfor (const specifier of specifiers) {\n  const loaded = await import(specifier)\n  if (Object.keys(loaded).length === 0) throw new Error(\`No runtime exports from \${specifier}\`)\n}\n`,
  )
  run(process.execPath, ["runtime.mjs"], { cwd: consumer })

  writeFileSync(
    join(consumer, "types.ts"),
    `${specifiers.map((specifier, index) => `import * as module${index} from "${specifier}"`).join("\n")}\nconst modules: object[] = [${specifiers.map((_, index) => `module${index}`).join(", ")}]\nvoid modules\n`,
  )
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["types.ts"],
      },
      null,
      2,
    ),
  )
  run(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], {
    cwd: consumer,
  })

  const installedRoot = join(consumer, "node_modules/ketqat-sdk")
  const installedPackage = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"))
  const sourcePackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  if (installedPackage.name !== "ketqat-sdk" || installedPackage.version !== sourcePackage.version) {
    throw new Error("Installed npm package name or version does not match the source package")
  }
  if (installedPackage.engines?.node !== ">=22") {
    throw new Error(`Unexpected Node.js engine policy: ${installedPackage.engines?.node}`)
  }

  for (const [subpath, target] of Object.entries(installedPackage.exports)) {
    for (const field of ["import", "types"]) {
      if (typeof target[field] !== "string") {
        throw new Error(`Missing ${field} target for export ${subpath}`)
      }
      const artifact = join(installedRoot, target[field])
      readFileSync(artifact)
      const map = `${artifact}.map`
      readFileSync(map)
      const sourceMappingUrl = readFileSync(artifact, "utf8").match(/sourceMappingURL=([^\s]+)/)?.[1]
      if (!sourceMappingUrl || resolve(dirname(artifact), sourceMappingUrl) !== resolve(map)) {
        throw new Error(`Invalid source map reference in ${target[field]}`)
      }
    }
  }

  const forbidden = manifest.files
    .map(({ path }) => path)
    .filter((path) => /(^|\/)(?:python|tests?|\.pytest_cache|__pycache__|coverage|node_modules)(\/|$)|\.py[co]$/i.test(path))
  if (forbidden.length > 0) {
    throw new Error(`Tarball contains forbidden paths: ${forbidden.join(", ")}`)
  }

  console.log(
    `Clean-installed and verified ${manifest.filename}: ${manifest.entryCount} files, ${manifest.unpackedSize} unpacked bytes.`,
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
