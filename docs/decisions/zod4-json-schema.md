# Zod 4 native JSON Schema: investigated, not adopted

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
