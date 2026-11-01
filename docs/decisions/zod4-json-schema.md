# Zod 4 and the published JSON Schema dialect

**Decision (2026-11-01): adopt zod 4 (`^4.6.7`), keep every published document
byte-identical.** Superseding the 2026-07-31 decision below. The trigger was
GHSA-mrhx-c7xc-m3w5 (high): zod < 4.6.6 collects one issue per invalid array
element, so a few MB of request body becomes hundreds of MB of heap. Only zod
>= 4.6.6 stops a *bounded* array at its size check ([#293](https://github.com/ketqat/ketqat-sdk/issues/293)).

Each 2026-07-31 ground is answered, and the answers are executable in
`tests/zod4-json-schema.test.mjs`:

1. **No mechanical path** -> the contracts are ported to the v4 API (two-argument
   `z.record`, `Contract<T> = z.ZodType<T, unknown>`). Object-valued defaults use
   `.prefault()`: v4's `.default()` returns the default unparsed, so nested defaults
   would stop materializing and parsed payloads -- and their hashes -- would change.
   A test refuses `SomethingSchema.default({...})` anywhere in `src/`.
2. **Dialect break** -> `src/json-schema.ts` generates with `target: "draft-7"`. The
   Python runner's `Draft7Validator` is unchanged.
3. **Rejection set** -> the same module rewrites every v4 spelling that differs:
   `date-time` loses its asserted `pattern`; integers lose the implicit safe-integer
   bounds; input-mode objects regain `additionalProperties: false`; tuples lose
   `additionalItems: false`; `oneOf` becomes `anyOf`; same-typed literal unions
   become one `enum`; unconstrained nullable primitives become `"type": [T, "null"]`;
   reused schemas are inlined at first use and `$ref`'d by JSON pointer thereafter.
   With that, all 25 documents in `schemas/` and the packaged Python copies
   regenerate **byte-for-byte**, so the accept/reject corpus is unchanged by
   construction. Hash-parity fixtures pass unchanged.

`zod-to-json-schema` is removed; the runtime dependency set is `zod` alone.

Behaviour differences that remain, all stricter and none reachable through a
published document: zod 4 rejects `Infinity` in `z.number()` (the finiteness
refinement already did), and `.int()` means safe integer.

---

## 2026-07-31 (superseded): Zod 4 native JSON Schema, investigated, not adopted


**Decision (2026-07-31): retain Zod 3 + `zod-to-json-schema`.** Semantic equivalence is
disproved, on three grounds pinned executably in `tests/zod4-incompatibility.test.mjs`
(run by `npm test`, so the ground truth moving fails the build):

1. **No mechanical path.** A v3-authored schema throws inside v4's `toJSONSchema`;
   migration means porting every contract to the v4 API first — 16 uses of v4-breaking
   constructs across 7 contract files (`.datetime()`, key-less `z.record()`, `.strict()`).
2. **Dialect break under a pinned validator.** Output moves draft-07 → 2020-12 while
   `python/src/ketqat_runner/validation.py` validates with an explicit `Draft7Validator`.
   A 2020-12 document under draft-07 rules is silently different semantics.
3. **The rejection set changes.** Legacy emits `format: "date-time"` (annotation, not
   asserted by Draft7Validator); native adds an asserted regex `pattern`. The malformed
   datetime `9999-99-99T99:99:99Z` is accepted by every deployed schema today and would
   be rejected by the native output — stored records would fail revalidation. That is
   the exact acceptance/rejection divergence sdk#214 required proving absent.

Revisit only alongside: contracts ported to the v4 API, the Python validator moved to a
2020-12 validator in the same change, a full accept/reject corpus diff across all 14
schemas, and hash-parity fixtures rerun — as one compatibility event with a schema
version bump, per the hashing rules in `CLAUDE.md`.
