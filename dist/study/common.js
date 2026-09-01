import { z } from "zod";
import { CitationSchema } from "../contracts/common.js";
import { EvidenceClassSchema, QuantitySchema, UncertaintySchema, } from "../intelligence/measurement.js";
import { FiniteFloatSchema, SafeIntegerSchema } from "./values.js";
/**
 * A revision or sequence number: a `safe_integer` that counts up from 1.
 *
 * The contract is chosen for the field rather than for the value in front of
 * us (see `values.ts`). A record revised 2^53 times is not a record; the count
 * cannot reach the boundary by construction, so it is a JSON number rather
 * than the `exact_integer_string` a 64-bit seed needs.
 */
export const StudyPositionSchema = SafeIntegerSchema.min(1, {
    message: "A revision or sequence number counts up from 1.",
});
/**
 * The vocabulary every record in the `study` family shares (ketqat-sdk#259,
 * ADR 0010).
 *
 * A study is the layer above one assessment: a question someone asked, the
 * specification that made it answerable, the plan they confirmed, and the
 * evidence the runs produced. What makes that layer dangerous is not the
 * physics -- the intelligence tier already refuses to present a modelled number
 * as a measured one -- it is that a study is written *before* anything is known.
 * Half its fields start as guesses made by a machine on the user's behalf, and a
 * guess that is later confirmed must not look like a guess that was merely never
 * challenged.
 *
 * So two envelopes below extend the UNKNOWN discipline of `Quantity` outward:
 * `origin` records whether a human confirmed the field or a model inferred it,
 * and `TextField` gives prose the same null-means-UNKNOWN rule numbers already
 * have. Both are hashed, which is the point -- an inferred specification and a
 * confirmed one are different records with different hashes, and no display
 * layer has to be trusted to keep them apart.
 *
 * **Every object in this family is `.strict()`.** Zod's default is to strip an
 * undeclared key, and the generated JSON Schemas have always emitted
 * `additionalProperties: false`, so the two validators disagreed about the same
 * file: a package carrying an undeclared root key parsed here and was refused by
 * `python/src/ketqat_runner/study_validation.py`. Stripping is worse than
 * accepting, because this family's verifiers hash the record *as written* -- a
 * key the parser discards is a key the digest still sees. Refusing is the only
 * reading under which the schema, the parser and the digest describe one record.
 *
 * That now includes the objects the family embeds and does not own. `Quantity`,
 * `Uncertainty` and `Citation` were the three exceptions, and being exceptions
 * is what made them the way in: see `StudyQuantitySchema` below.
 */
/**
 * The family enters at 1.0 rather than continuing the 0.1 line of the
 * intelligence tier. It is a new family under new hash rules; sharing a version
 * string with records hashed under different rules would suggest a
 * compatibility that does not exist.
 */
export const STUDY_SCHEMA_VERSION = "1.0";
/**
 * The three objects this family embeds and does not own, read strictly.
 *
 * `Quantity`, `Uncertainty` and `Citation` are declared in `src/intelligence`
 * and `src/contracts`, where they are permissive: zod strips a key they do not
 * declare, and `Citation.authors` carries a `.default([])`. Neither reading is
 * wrong there -- those modules validate stored records that predate this family
 * and may legitimately carry keys it has never heard of -- and making the shared
 * schemas strict could start refusing intelligence records that already exist.
 *
 * Both readings are wrong *here*, for the same reason and in two directions.
 * This family's verifiers hash the record as written, so a key the parser
 * silently strips is a key the digest still sees: two plans differing only by a
 * `smuggled_note` inside an `expected_credits` envelope parsed to one value, and
 * a consumer that parsed before verifying got one digest for two files while a
 * consumer that hashed the file got two. And a field the parser silently
 * materialises is a field the file does not contain: a citation written without
 * `authors` hashed one way as written and another way once parsed, so the build
 * path and the verify path addressed two different nodes.
 *
 * So the study family derives its own variants, the way
 * `StudyEnvironmentSchema` below derives an array-shaped environment from the
 * shared map-shaped one. `src/intelligence/measurement.ts` and
 * `src/contracts/common.ts` are untouched, every hash published under them still
 * verifies under exactly the schema that produced it, and no generated schema
 * outside this family changes.
 *
 * The casts are the price of the shared modules annotating their schemas with
 * `Contract<T>`: that annotation exists to keep the emitted `.d.ts` from
 * expanding one structural type per occurrence, and it hides the `ZodObject`
 * underneath. Re-narrowing it here is the whole of the cast -- nothing is
 * reinterpreted, and the shared refinements are re-run rather than restated.
 */
const sharedUncertaintyObject = UncertaintySchema;
/**
 * `Uncertainty`, refusing a key it does not declare and requiring its two
 * bounds to be finite.
 *
 * The shared schema types them `z.number().nullable()`, which admits `NaN` and
 * both infinities -- and `Quantity.value` beside them does not, because the
 * shared contract refines it. That asymmetry mattered under the old rules and
 * matters more now: a spread is a `finite_float` under the number contracts in
 * `values.ts`, and `canonicalizeJcs` refuses a non-finite number outright
 * (RFC 8785 §3.2.2.3), so an infinite bound reaching this family would be a
 * record that parses and cannot be hashed. It is refused where it is written.
 */
export const StudyUncertaintySchema = sharedUncertaintyObject
    .extend({
    low: FiniteFloatSchema.nullable(),
    high: FiniteFloatSchema.nullable(),
})
    .strict();
const sharedQuantityObject = QuantitySchema.innerType();
/**
 * `Quantity`, refusing a key it does not declare, and carrying the strict
 * `Uncertainty` in place of the permissive one.
 *
 * The shared schema's own refinements -- the two directions of the UNKNOWN
 * pairing, and the finiteness check -- are re-run rather than re-declared. A
 * second copy of "a quantity with no value must be classified UNKNOWN" is a
 * second copy free to drift from the first, and the invariant belongs to
 * `Quantity` rather than to this family's reading of it. The strict object above
 * answers the one question the shared contract does not, and everything else is
 * still answered by the shared contract itself.
 */
export const StudyQuantitySchema = sharedQuantityObject
    .extend({ uncertainty: StudyUncertaintySchema.optional() })
    .strict()
    .superRefine((value, context) => {
    const shared = QuantitySchema.safeParse(value);
    if (shared.success)
        return;
    for (const issue of shared.error.issues)
        context.addIssue(issue);
});
/**
 * `Citation`, refusing a key it does not declare and requiring its author list.
 *
 * `authors` loses its `.default([])`, which was the last default any study
 * record hashed. A default is materialised at parse time, so the same citation
 * had two content addresses depending on which side of the parse the digest was
 * taken -- the builder parsed and then hashed, the verifier hashed what it read,
 * and Python fills in nothing at all. A producer with no author list writes
 * `[]`, which is a statement a reader can see and a byte a hash can cover.
 */
export const StudyCitationSchema = CitationSchema.extend({
    authors: z.array(z.string().min(1)),
})
    .strict();
/**
 * A 64-character lowercase hex digest: the only way one study record names
 * another.
 *
 * Records in this family are content-addressed, so a reference is a claim about
 * the exact bytes referenced. A slug would keep resolving after the thing it
 * named changed underneath it, which is how a confirmation ends up attached to a
 * plan nobody approved.
 */
export const ContentHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const RevisionRefSchema = z
    .object({
    /**
     * Not named `content_hash`, and the reason has changed.
     *
     * Under the retired rules the name *was* the invariant: `content_hash` was
     * dropped by name at every nesting level, so a reference field called that
     * would have been stripped before hashing and a task bound to plan revision
     * B would have been content-addressed identically to one bound to revision
     * C. The projection in `registry.ts` classifies this field `SEMANTIC`
     * instead, and a field's class is a fact about the field rather than about
     * its spelling -- so the binding would now survive whatever it were called.
     * The name is kept because renaming it would move every digest in the
     * family for no gain, and because "revision hash" is the clearer word.
     */
    revision_hash: ContentHashSchema,
    revision: StudyPositionSchema,
})
    .strict();
/**
 * Who put this value here.
 *
 * `INFERRED` means the system proposed it from context; `CONFIRMED` means a
 * person read it and agreed. There is deliberately no third state for "probably
 * fine": a field nobody has looked at is inferred, however plausible it reads.
 */
export const FieldOriginSchema = z.enum(["INFERRED", "CONFIRMED"]);
export const QuantityFieldSchema = z
    .object({
    quantity: StudyQuantitySchema,
    origin: FieldOriginSchema,
})
    .strict();
export const TextFieldSchema = z
    .object({
    /** Null when nobody has supplied this yet. Never an empty string standing in for one. */
    value: z.string().min(1).nullable(),
    evidence: EvidenceClassSchema,
    origin: FieldOriginSchema,
})
    .strict()
    .superRefine((field, context) => {
    if (field.value === null && field.evidence !== "UNKNOWN") {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A field with no value must be classified UNKNOWN, not ${field.evidence}. ` +
                "An unanswered question presented under a confident evidence class is how a gap becomes a finding.",
            path: ["evidence"],
        });
    }
    if (field.value !== null && field.evidence === "UNKNOWN") {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A field classified UNKNOWN must carry a null value. Text labelled unknown is still text a reader will quote.",
            path: ["value"],
        });
    }
});
/**
 * Where a planned baseline's numbers come from, in ADR 0010's own words.
 *
 * The distinction lives on the plan rather than inside `ClassicalBaseline`
 * because it is a statement about *this* study's use of that baseline: the same
 * measured baseline is a strong comparison for the workload it was measured on
 * and a cited-elsewhere figure for a different one. `unknown` is a member rather
 * than an absence, so a plan that never established provenance says so instead
 * of omitting the field.
 */
export const BaselineSourceClassSchema = z.enum([
    "measured",
    "user_provided",
    "approved_adapter",
    "cited_primary_source",
    "unknown",
]);
/**
 * What an execution record actually attests to (ADR 0014 §1).
 *
 * Exactly one member, and closed on purpose. This family hashes inputs, outputs
 * and environment; it does not sign them, and nothing here proves the code that
 * ran was the code named. Leaving the enum open, or adding an aspirational
 * `signed` member before signing exists, would let a capsule claim a guarantee
 * no code in this repository provides. The field is hashed, so the level a
 * capsule claims cannot be edited after the fact without breaking its hash.
 */
export const AttestationLevelSchema = z.enum(["hash_only"]);
export const StudyPackageSchema = z
    .object({
    name: z.string().min(1),
    version: z.string().min(1),
})
    .strict();
export const StudyHardwareEntrySchema = z
    .object({
    name: z.string().min(1),
    /**
     * A string, never a nested object. An object here would be a map one level
     * down, its keys data again and declared by nobody, which is exactly what
     * this shape exists to prevent. A core count is recorded as "8": the
     * information survives, the data-shaped key does not.
     */
    value: z.string().min(1),
})
    .strict();
export const StudyEnvironmentSchema = z
    .object({
    // The four scalars are the shared `EnvironmentSchema`'s, name for name and
    // constraint for constraint: they are already field names rather than data,
    // so the same information is recorded under the same keys.
    operating_system: z.string().optional(),
    architecture: z.string().optional(),
    python_version: z.string().optional(),
    node_version: z.string().optional(),
    packages: z.array(StudyPackageSchema),
    hardware: z.array(StudyHardwareEntrySchema),
})
    .strict();
//# sourceMappingURL=common.js.map