// The clean-room suite is a consumer of the public API, and it runs only in CI.
//
// A commit that removed `verify_research_package` from `study_validation` --
// correctly, to break an import cycle -- updated the Python tests and left
// `scripts/clean-room/verify_python.py` importing it from where it no longer
// was. `npm test` passed, `pytest` passed, and the clean room failed on a
// release job that takes minutes to reach. The clean room did its job; what was
// missing was a way to learn the same thing in seconds.
//
// This does not run the suite. It reads what the suite imports and asks the
// packages whether those names exist. That is the whole failure mode: the
// consumer names something the library stopped exporting.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SUITE = join(ROOT, "scripts", "clean-room")

test("every name the clean-room suite imports from the SDK is exported by it", async () => {
  const files = readdirSync(SUITE).filter((name) => name.endsWith(".mjs"))
  assert.ok(files.length > 0, "no clean-room JavaScript suite found")

  const missing = []
  for (const file of files) {
    const source = readFileSync(join(SUITE, file), "utf8")
    // `import { a, b } from "ketqat-sdk/subpath"` -- bare specifiers only, which
    // is what a consumer of the published package can write.
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](ketqat-sdk[^"']*)["']/g)) {
      const names = match[1]
        .split(",")
        .map((entry) => entry.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      let module
      try {
        // Resolve through the repository's own build rather than an install:
        // the subpath map is the thing under test, and dist/ is what it points at.
        module = await import(match[2].replace(/^ketqat-sdk/, join(ROOT, "dist").replace(/\\/g, "/")).replace(/\/$/, "") + (match[2] === "ketqat-sdk" ? "/index.js" : "/index.js"))
      } catch {
        continue // a subpath this check cannot resolve is the package-contents test's business
      }
      for (const name of names) {
        if (!(name in module)) missing.push(`${file}: ${match[2]} does not export ${name}`)
      }
    }
  }

  assert.deepEqual(missing, [], missing.join("\n"))
})

test("every name the clean-room suite imports from the Python package is exported by it", () => {
  const script = join(SUITE, "verify_python.py")
  if (!existsSync(script)) return

  const venv = join(ROOT, ".venv", "bin", "python")
  if (!existsSync(venv)) return // CI installs the wheel instead; the room itself covers that case

  // Ask Python, because only Python knows what its modules export after a lazy
  // import, an `__all__`, or a re-export has had its say.
  const probe = `
import ast, importlib, pathlib, sys
missing = []
source = pathlib.Path(${JSON.stringify(script)}).read_text()
for node in ast.walk(ast.parse(source)):
    if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("ketqat_runner"):
        try:
            module = importlib.import_module(node.module)
        except Exception as error:
            missing.append(f"{node.module}: {error}")
            continue
        for alias in node.names:
            if not hasattr(module, alias.name):
                missing.append(f"{node.module} does not export {alias.name}")
print("\\n".join(missing))
`
  const out = execFileSync(venv, ["-c", probe], { cwd: ROOT, encoding: "utf8" }).trim()
  assert.equal(out, "", out)
})
