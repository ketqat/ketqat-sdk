import { z } from "zod";
import { type Citation } from "../contracts/common.js";
import { type Contract, type EvidenceClass, type Quantity, type Uncertainty } from "../intelligence/measurement.js";
/**
 * A revision or sequence number: a `safe_integer` that counts up from 1.
 *
 * The contract is chosen for the field rather than for the value in front of
 * us (see `values.ts`). A record revised 2^53 times is not a record; the count
 * cannot reach the boundary by construction, so it is a JSON number rather
 * than the `exact_integer_string` a 64-bit seed needs.
 */
export declare const StudyPositionSchema: z.ZodNumber;
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
export declare const STUDY_SCHEMA_VERSION = "1.0";
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
export declare const StudyUncertaintySchema: Contract<Uncertainty>;
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
export declare const StudyQuantitySchema: Contract<Quantity>;
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
export declare const StudyCitationSchema: Contract<Citation>;
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
/** One dependency the run had installed, named in a field rather than in a key. */
export interface StudyPackage {
    name: string;
    version: string;
}
/** One property of the machine the run happened on, named the same way. */
export interface StudyHardwareEntry {
    name: string;
    value: string;
}
/**
 * What ran where, recorded so that every key in it is a field name this schema
 * declares.
 *
 * The shared `EnvironmentSchema` records the same four scalars and then two
 * free-form maps, and a map's keys are *data*: a dependency name, a hardware
 * component name, both chosen by whatever captured the environment. Under the
 * retired rules that was a collision -- a dependency genuinely called `id` was
 * dropped by name before the digest was taken, so two capsules recording
 * different environments hashed identically and one could be handed the other's
 * environment while still verifying against its own digest.
 *
 * The shape stays array-shaped under the projection, and the reason is now the
 * mirror image rather than the same one. A projection reads *declared* fields,
 * and a map's keys are declared by nobody: the projection would have to read
 * the map wholesale -- reopening the question of what a key called `__proto__`
 * means -- or refuse it entirely. A list of `{name, value}` pairs is neither.
 * Every key in it is a field name this schema declares, and every dependency
 * name is a value, which is a place data belongs.
 *
 * `src/contracts/common.ts` keeps its map-shaped `EnvironmentSchema` unchanged.
 * Every hash published under the legacy rules was computed over that shape, and
 * this family is the one that content-addresses its records.
 *
 * Both lists are required and neither carries a `.default()`. A producer with
 * nothing to record writes `[]`, which is a statement a reader can see; a
 * default materialised at parse time is a container the file does not contain,
 * and hashing one is how two languages come to disagree about what a record
 * says while reading the same bytes.
 */
export interface StudyEnvironment {
    operating_system?: string;
    architecture?: string;
    python_version?: string;
    node_version?: string;
    packages: StudyPackage[];
    hardware: StudyHardwareEntry[];
}
export declare const StudyPackageSchema: Contract<StudyPackage>;
export declare const StudyHardwareEntrySchema: Contract<StudyHardwareEntry>;
export declare const StudyEnvironmentSchema: Contract<StudyEnvironment>;
//# sourceMappingURL=common.d.ts.map