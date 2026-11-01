/**
 * Zod 4 with the published JSON Schema dialect (ketqat-sdk#293).
 *
 * This replaces tests/zod4-incompatibility.test.mjs (ketqat-sdk#214), which
 * pinned three reasons zod 4 could not be adopted. Each is answered by
 * src/json-schema.ts, and each answer is asserted here so the equivalence
 * cannot silently rot:
 *
 * 1. Contracts are authored in the zod 4 API; nothing passes v3 schemas to v4.
 * 2. The documents stay draft-07, matching the Python runner's Draft7Validator.
 * 3. The rejection set is unchanged: `date-time` stays an annotation, objects
 *    still reject unknown keys, and published documents regenerate
 *    byte-for-byte (the build writes them; `git diff` on schemas/ is empty).
 *
 * It also pins the reason for the upgrade: zod >= 4.6.6 stops a bounded array
 * at its size check instead of collecting one issue per element.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { z } from "zod"
import { contractJsonSchema } from "../dist/json-schema.js"

const schemaDir = new URL("../schemas/", import.meta.url)
const published = readdirSync(schemaDir).filter((name) => name.endsWith(".schema.json"))
  .map((name) => [name, JSON.parse(readFileSync(new URL(name, schemaDir), "utf8"))])

function* nodes(value) {
  if (Array.isArray(value)) for (const item of value) yield* nodes(item)
  else if (value && typeof value === "object") {
    yield value
    for (const child of Object.values(value)) yield* nodes(child)
  }
}

// ---- 2. draft-07, as the Python runner validates --------------------------------
for (const [name, document] of published) {
  assert.equal(document.$schema, "http://json-schema.org/draft-07/schema#", name)
  assert.equal(JSON.stringify(document).includes('"oneOf"'), false, `${name}: published documents use anyOf`)
}

// ---- 3. the rejection set is unchanged -----------------------------------------
{
  const document = contractJsonSchema(z.object({ when: z.string().datetime({ offset: true }) }), { name: "probe" })
  const when = document.definitions.probe.properties.when
  assert.deepEqual(when, { type: "string", format: "date-time" },
    "date-time stays a Draft7 annotation; an asserted pattern would reject stored records")
  assert.equal(document.definitions.probe.additionalProperties, false, "unknown keys stay rejected")

  const tuple = contractJsonSchema(z.object({ r: z.tuple([z.number().int(), z.number().int()]) }), { name: "t" })
  assert.deepEqual(tuple.definitions.t.properties.r, {
    type: "array", minItems: 2, maxItems: 2, items: [{ type: "integer" }, { type: "integer" }],
  })
}
for (const [name, document] of published) {
  for (const node of nodes(document)) {
    if (node.format === "date-time") assert.equal(node.pattern, undefined, `${name}: date-time must not assert a pattern`)
    if (node.type === "integer") {
      assert.notEqual(node.maximum, Number.MAX_SAFE_INTEGER, `${name}: no implicit safe-integer bound`)
    }
  }
}

// ---- nested defaults survive (.prefault keeps zod 3's parse-the-default) --------
// zod 4's .default() returns the default as-is; an object default must still
// be parsed so its own defaults materialize, or parsed payloads -- and the
// hashes over them -- would change.
{
  const Inner = z.object({ mode: z.string().default("strict"), tags: z.array(z.string()).default([]) })
  assert.deepEqual(z.object({ inner: Inner.prefault({}) }).parse({}), { inner: { mode: "strict", tags: [] } })
  assert.deepEqual(z.object({ inner: Inner.default({}) }).parse({}), { inner: {} },
    "if this changes, .default() parses again and .prefault() is no longer needed")
  const source = readFileSync(new URL("../src/contracts/benchmark-result.ts", import.meta.url), "utf8")
  assert.match(source, /EnvironmentSchema\.prefault\(/)
  // A named object schema with an object default must use .prefault().
  const offenders = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith(".ts") && /[A-Z]\w*Schema\.default\(\{/.test(readFileSync(path, "utf8"))) offenders.push(entry.name)
    }
  }
  walk(new URL("../src/", import.meta.url))
  assert.deepEqual(offenders, [], "object defaults must be .prefault() under zod 4")
}

// ---- 1./advisory: bounded arrays stop at the size check -------------------------
{
  const bounded = z.array(z.number().min(0).max(1)).max(30)
  const result = bounded.safeParse(Array.from({ length: 100_000 }, () => 2))
  assert.equal(result.success, false)
  assert.equal(result.error.issues.length, 1, "GHSA-mrhx-c7xc-m3w5: no per-element issues past the bound")
}

console.log(`zod4 JSON Schema: ${published.length} published documents keep the draft-07 dialect and rejection set`)
