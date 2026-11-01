import { z } from "zod";
/**
 * JSON Schema for a contract, in the dialect the published `schemas/` have
 * always used (ketqat-sdk#293).
 *
 * Until zod 4 the documents came from `zod-to-json-schema`, which does not
 * understand zod 4. zod 4's own `toJSONSchema` covers the same constructs but
 * spells several of them differently, and some of those spellings change what
 * a validator accepts (tests/zod4-json-schema.test.mjs pins each one):
 *
 * - `date-time` strings gain an asserted `pattern`. The Python runner's
 *   Draft7Validator treats `format` as an annotation, so the pattern would
 *   start rejecting stored records that validate today. It is removed.
 * - integers gain the safe-integer range as `minimum`/`maximum`. Removed, as
 *   no published document carried it.
 * - plain objects omit `additionalProperties` in input mode, which would start
 *   accepting unknown keys a published document rejects. Restored as `false`.
 * - discriminated unions become `oneOf`; published documents use `anyOf`.
 * - a nullable primitive is `anyOf [T, null]`; published documents use
 *   `"type": [T, "null"]` when T carries no other keyword.
 * - records carry a redundant `propertyNames: {type: string}`. Removed.
 * - tuples gain `additionalItems: false`, rejecting extra elements published
 *   documents accept. Removed; zod itself still rejects them.
 * - a union of same-typed literals is `anyOf` of `const`s; published
 *   documents use one `enum`.
 * - a refined copy of a repeated schema is `allOf: [{$ref}]`. Unwrapped to the
 *   reference, which is what the refinement's JSON Schema always was.
 * - repeated sub-schemas live in `definitions/__schemaN`; published documents
 *   inline the first occurrence and `$ref` its JSON pointer thereafter.
 *
 * Keys are emitted in the published order too, so an unchanged contract
 * regenerates byte-for-byte and any real change shows up as a diff.
 */
type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
type Node = {
    [key: string]: Json;
};
export interface ContractJsonSchemaOptions {
    /** Document name; the schema is emitted under `definitions/<name>`. */
    name: string;
    /** Reference repeated sub-schemas instead of inlining every occurrence. */
    references?: boolean;
}
export declare function contractJsonSchema(schema: z.ZodType, options: ContractJsonSchemaOptions): Node;
/** A single inlined document, for transports that want no wrapper (MCP tools). */
export declare function inlineJsonSchema(schema: z.ZodType): Node;
export {};
//# sourceMappingURL=json-schema.d.ts.map