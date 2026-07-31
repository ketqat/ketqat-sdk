/**
 * Zod 4 native JSON Schema: the incompatibility, recorded executably (ketqat-sdk#214).
 *
 * The issue's rule is "upgrade only if semantic equivalence is proved; otherwise record
 * the incompatibility and retain Zod 3." Equivalence is DISPROVED, on three grounds this
 * file pins so the finding cannot silently rot into folklore:
 *
 * 1. A v3-authored schema cannot pass through v4's toJSONSchema at all -- migration
 *    would require porting every contract to the v4 API first (16 v4-breaking construct
 *    uses across 7 contract files: .datetime(), z.record(key-less), .strict()...).
 *
 * 2. The generated dialect changes, draft-07 to 2020-12, while the Python runner
 *    validates with an explicit Draft7Validator. A 2020-12 document interpreted under
 *    draft-07 rules is silently different semantics, not a cosmetic header.
 *
 * 3. The rejection set changes. Legacy emits `format: "date-time"` -- an annotation,
 *    not asserted by Draft7Validator by default -- while native v4 adds an asserted
 *    regex `pattern`. A malformed datetime like "9999-99-99T99:99:99Z" is ACCEPTED by
 *    every deployed schema today and would be REJECTED by the native output. Stored
 *    records validated under the old rules would fail revalidation under the new --
 *    the exact acceptance/rejection divergence the issue requires proving absent.
 *
 * If any assertion here starts failing, the ground truth has moved (a zod upgrade
 * changed one of these behaviours) and the decision must be revisited -- which is the
 * point of recording it as a test instead of prose.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const v3 = require("zod");
const { z: z4 } = require("zod/v4");
const { zodToJsonSchema } = require("zod-to-json-schema");

// ---- 1. v3 schemas do not pass through v4's generator ------------------------------
{
  const v3schema = v3.z.object({ when: v3.z.string().datetime({ offset: true }) });
  assert.throws(
    () => z4.toJSONSchema(v3schema),
    "a v3-authored schema must not silently produce a v4 JSON Schema",
  );
}

// ---- 2. the dialect changes under Python's explicitly pinned validator -------------
{
  const legacy = zodToJsonSchema(v3.z.object({ n: v3.z.number() }));
  const native = z4.toJSONSchema(z4.object({ n: z4.number() }));
  assert.equal(legacy.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(native.$schema, "https://json-schema.org/draft/2020-12/schema");
  // The deployed schemas are draft-07, matching python's Draft7Validator.
  const { readFileSync } = await import("node:fs");
  const deployed = JSON.parse(readFileSync(new URL("../schemas/algorithm-benchmark-result.schema.json", import.meta.url)));
  assert.equal(deployed.$schema, "http://json-schema.org/draft-07/schema#");
}

// ---- 3. the rejection set changes: format-annotation vs asserted pattern -----------
{
  const legacy = zodToJsonSchema(v3.z.object({ when: v3.z.string().datetime({ offset: true }) }));
  const native = z4.toJSONSchema(z4.object({ when: z4.iso.datetime({ offset: true }) }));
  const legacyWhen = legacy.properties.when;
  const nativeWhen = native.properties.when;
  assert.equal(legacyWhen.format, "date-time");
  assert.equal(legacyWhen.pattern, undefined, "legacy asserts nothing beyond the annotation");
  assert.ok(nativeWhen.pattern, "native asserts a regex");
  // The concrete divergence: a malformed datetime the deployed schemas accept.
  const malformed = "9999-99-99T99:99:99Z";
  assert.ok(!new RegExp(nativeWhen.pattern).test(malformed),
    "native would reject what deployed schemas accept -- stored records would fail revalidation");
}

console.log("zod4 incompatibility: all three grounds hold; Zod 3 + zod-to-json-schema retained");
