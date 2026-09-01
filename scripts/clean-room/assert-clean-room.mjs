/**
 * Prove the room is clean, before anything is verified in it.
 *
 * Everything else in this directory is worthless if this is not true. A consumer
 * test that accidentally imports `../src` proves nothing: it exercises the
 * working tree, passes for a package that ships an empty `dist/`, and reports
 * green -- which is exactly how `ketqat-benchmarks` published a wheel containing
 * its harness and none of its suites, results, citation file or gate.
 *
 * So the negatives are asserted rather than assumed, and they are asserted as
 * *reachability* rather than as intent. It is not enough that no import in this
 * suite names a path into a source tree; there must be no source tree for such
 * an import to reach. Both are checked: the walk to the filesystem root finds no
 * checkout, and the two imports that would use one are attempted and must fail.
 *
 * The Python half of the same proof is in `verify_python.py`, where the
 * resolution being defended is `importlib.resources` and the fallback that would
 * hide the defect is `load_schema`'s walk up the parent directories.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, parse, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { CONSUMER, done, must } from "./support.mjs"

const suiteDirectory = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------- the package under test

const studyEntry = fileURLToPath(import.meta.resolve("ketqat-sdk/study"))
const packageRoot = dirname(dirname(dirname(studyEntry)))
const expectedRoot = resolve(CONSUMER, "node_modules", "ketqat-sdk")

must(
  packageRoot === expectedRoot,
  `ketqat-sdk resolves to the install at ${packageRoot}, not to a source tree`,
)
must(
  studyEntry === join(packageRoot, "dist", "study", "index.js"),
  `the study subpath resolves through the exports map to dist/study/index.js`,
)

const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
must(
  !existsSync(join(packageRoot, "src")) && !existsSync(join(packageRoot, "tests")),
  "the installed package carries no src/ and no tests/, so nothing inside it can resolve to one",
)
must(
  !existsSync(join(packageRoot, ".git")),
  "the installed package is unpacked from a tarball, not a git working tree",
)

// ------------------------------------------------ no checkout is reachable
//
// From the suite's own directory to the filesystem root. A checkout is
// recognised by the pair that would make a relative import work: a `src/study`
// directory beside a `package.json` naming this package.
const reachable = []
let directory = suiteDirectory
const root = parse(directory).root
for (;;) {
  const manifest = join(directory, "package.json")
  if (existsSync(join(directory, "src", "study")) && existsSync(manifest)) {
    try {
      if (JSON.parse(readFileSync(manifest, "utf8")).name === "ketqat-sdk") reachable.push(directory)
    } catch {
      // A package.json that will not parse is not a checkout of this package.
    }
  }
  if (directory === root) break
  directory = dirname(directory)
}
must(
  reachable.length === 0,
  `no ketqat-sdk checkout on the path from ${suiteDirectory} to ${root}`,
)

// And the imports that would use one, attempted. A negative asserted by walking
// the filesystem is a statement about today's layout; a negative asserted by
// trying the import is a statement about the resolver.
for (const specifier of ["../src/study/index.js", "../../src/study/index.js", "ketqat-sdk/src/study/index.js"]) {
  let resolvedAnyway = null
  try {
    await import(specifier)
    resolvedAnyway = specifier
  } catch {
    // Expected: there is nothing there, and the exports map does not expose one.
  }
  if (resolvedAnyway !== null) {
    throw new Error(
      `${resolvedAnyway} imported successfully. Something in this clean room resolves to a source tree, ` +
        "and every check that follows would be testing the wrong copy.",
    )
  }
}
must(true, "importing a source tree fails: ../src, ../../src and ketqat-sdk/src all resolve to nothing")

// ---------------------------------------------- and only the tarball is installed
//
// A dependency the package declares is expected -- `zod` is what a consumer
// installs too. A *second* copy of this project would not be.
const dependencies = readdirSync(join(CONSUMER, "node_modules"))
  .filter((name) => !name.startsWith("."))
  .flatMap((name) =>
    name.startsWith("@")
      ? readdirSync(join(CONSUMER, "node_modules", name)).map((scoped) => `${name}/${scoped}`)
      : [name],
  )
const ketqat = dependencies.filter((name) => name.startsWith("ketqat"))
must(
  ketqat.length === 1 && ketqat[0] === "ketqat-sdk",
  `one ketqat package is installed (${ketqat.join(", ")}), beside ${dependencies.length - 1} of its dependencies`,
)
must(
  statSync(join(packageRoot, "dist", "study", "index.js")).size > 0,
  `ketqat-sdk ${installed.version} ships a non-empty study barrel`,
)

done(`the clean room at ${CONSUMER} has no source tree in it`)
