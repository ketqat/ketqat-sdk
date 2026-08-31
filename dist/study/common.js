import { z } from "zod";
import { EvidenceClassSchema, QuantitySchema, } from "../intelligence/measurement.js";
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
 */
/**
 * The family enters at 1.0 rather than continuing the 0.1 line of the
 * intelligence tier. It is a new family under new hash rules; sharing a version
 * string with records hashed under different rules would suggest a
 * compatibility that does not exist.
 */
export const STUDY_SCHEMA_VERSION = "1.0";
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
export const RevisionRefSchema = z.object({
    /**
     * Deliberately not named `content_hash`. A record's own `content_hash` is excluded from its
     * own hash, and the canonicalizer drops excluded keys at every nesting level -- so a reference
     * field named `content_hash` would be stripped before hashing, and a task bound to plan
     * revision B would be content-addressed identically to one bound to plan revision C. The
     * binding this reference carries is the whole point of it, so it must survive canonicalization.
     */
    revision_hash: ContentHashSchema,
    revision: z.number().int().positive(),
});
/**
 * Who put this value here.
 *
 * `INFERRED` means the system proposed it from context; `CONFIRMED` means a
 * person read it and agreed. There is deliberately no third state for "probably
 * fine": a field nobody has looked at is inferred, however plausible it reads.
 */
export const FieldOriginSchema = z.enum(["INFERRED", "CONFIRMED"]);
export const QuantityFieldSchema = z.object({
    quantity: QuantitySchema,
    origin: FieldOriginSchema,
});
export const TextFieldSchema = z
    .object({
    /** Null when nobody has supplied this yet. Never an empty string standing in for one. */
    value: z.string().min(1).nullable(),
    evidence: EvidenceClassSchema,
    origin: FieldOriginSchema,
})
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
//# sourceMappingURL=common.js.map