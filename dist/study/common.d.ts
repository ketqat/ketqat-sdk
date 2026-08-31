import { z } from "zod";
import { type Contract, type EvidenceClass, type Quantity } from "../intelligence/measurement.js";
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
export declare const STUDY_SCHEMA_VERSION = "1.0";
/**
 * A 64-character lowercase hex digest: the only way one study record names
 * another.
 *
 * Records in this family are content-addressed, so a reference is a claim about
 * the exact bytes referenced. A slug would keep resolving after the thing it
 * named changed underneath it, which is how a confirmation ends up attached to a
 * plan nobody approved.
 */
export declare const ContentHashSchema: z.ZodString;
/**
 * A pointer at one revision of an immutable record.
 *
 * The hash alone would identify the revision, but a reader who has the pointer
 * and not the record cannot tell revision 1 from revision 7 by looking at a
 * digest. Carrying the number too costs one integer and makes "this confirmation
 * is two revisions stale" a statement anyone can make offline.
 */
export interface RevisionRef {
    revision_hash: string;
    revision: number;
}
export declare const RevisionRefSchema: Contract<RevisionRef>;
/**
 * Who put this value here.
 *
 * `INFERRED` means the system proposed it from context; `CONFIRMED` means a
 * person read it and agreed. There is deliberately no third state for "probably
 * fine": a field nobody has looked at is inferred, however plausible it reads.
 */
export declare const FieldOriginSchema: z.ZodEnum<["INFERRED", "CONFIRMED"]>;
export type FieldOrigin = z.infer<typeof FieldOriginSchema>;
/** A quantity in a study record, plus who is answerable for it. */
export interface QuantityField {
    quantity: Quantity;
    origin: FieldOrigin;
}
export declare const QuantityFieldSchema: Contract<QuantityField>;
/**
 * Prose under the same discipline as a number.
 *
 * `Quantity` already forbids an absent value from wearing a confident evidence
 * class. Free text in a specification is exactly as quotable as a number and was
 * exactly as likely to be invented, so it carries the same pairing: no value
 * means UNKNOWN, and UNKNOWN means no value.
 */
export interface TextField {
    value: string | null;
    evidence: EvidenceClass;
    origin: FieldOrigin;
}
export declare const TextFieldSchema: Contract<TextField>;
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
export declare const BaselineSourceClassSchema: z.ZodEnum<["measured", "user_provided", "approved_adapter", "cited_primary_source", "unknown"]>;
export type BaselineSourceClass = z.infer<typeof BaselineSourceClassSchema>;
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
export declare const AttestationLevelSchema: z.ZodEnum<["hash_only"]>;
export type AttestationLevel = z.infer<typeof AttestationLevelSchema>;
//# sourceMappingURL=common.d.ts.map