import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const root = process.cwd()
const temporaryRoot = mkdtempSync(join(tmpdir(), "ketqat-sdk-clean-install-"))

/**
 * The engine this check is *running on*, not the one the package declares.
 *
 * npm treats `engines` as advisory: installing on an excluded version prints
 * EBADENGINE and carries on exiting 0. So this script would clean-install,
 * type-check, exercise the CLI and report PASS from a Node it has just been
 * told the package does not support -- proving only that it happens to work
 * there, under a heading that reads as proof it works where it is supported.
 *
 * That is the same shape as the `postcss@unknown` defect in ketqat-web#333: a
 * green check measuring something adjacent to the claim it appears to make.
 * A release gate is exactly where that is least affordable, so this refuses
 * rather than warns -- a warning in a passing run is a warning nobody reads.
 */
function assertHostSatisfiesEngine(declared) {
  const floor = /^>=\s*(\d+)/.exec(declared ?? "")
  if (!floor) {
    throw new Error(
      `Cannot read a major-version floor from engines.node ${JSON.stringify(declared)}. ` +
        `This guard understands ">=N" only; widen it deliberately rather than dropping it.`,
    )
  }
  const required = Number(floor[1])
  const actual = Number(process.versions.node.split(".")[0])
  if (actual < required) {
    throw new Error(
      `This check is running on Node ${process.versions.node}, below the >=${required} the package ` +
        `declares. npm only warns about that, so the run would have reported PASS without ` +
        `establishing anything about a supported engine. Re-run on Node ${required} or newer.`,
    )
  }
  return { required, actual }
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  })

try {
  const sourceEngine = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines?.node
  const engine = assertHostSatisfiesEngine(sourceEngine)

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
  // The shipped tarball must carry the same policy the host was checked
  // against, or the guard above validated a floor this artifact does not state.
  if (installedPackage.engines?.node !== sourceEngine) {
    throw new Error(
      `Installed engine policy ${JSON.stringify(installedPackage.engines?.node)} does not match ` +
        `the source policy ${JSON.stringify(sourceEngine)}`,
    )
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
    `Clean-installed and verified ${manifest.filename} on Node ${process.versions.node} ` +
      `(declared engine ${sourceEngine}, floor ${engine.required}): ` +
      `${manifest.entryCount} files, ${manifest.unpackedSize} unpacked bytes.`,
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
