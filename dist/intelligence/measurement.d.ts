import { z } from "zod";
/**
 * The envelope every decision-bearing number in resource intelligence wears
 * (ketqat-sdk#236).
 *
 * The engine underneath this module already produces good numbers. What it does
 * not produce is a number you can safely put in front of someone making a
 * decision, because the thing that makes a resource estimate dangerous is not
 * arithmetic error -- it is that a modelled figure and a measured one look
 * identical once they are both rendered as "4.2 million physical qubits".
 *
 * So a bare `number` is not representable here. Every quantity carries what it
 * is, where it came from, what had to be assumed, how far it moves when those
 * assumptions move, and what it does not account for. A consumer that wants to
 * print the value has to walk past all of that to reach it.
 *
 * Three properties are load-bearing:
 *
 * **`evidence` is not a confidence score.** `MEASURED` and `MODELLED` are
 * different kinds of claim, not different amounts of the same claim, and there
 * is deliberately no ordering function over them. A modelled number produced by
 * a careful model is not "80% of a measurement".
 *
 * **`bound` separates a point estimate from a limit.** A required physical error
 * rate of 1e-4 and an achieved one of 1e-4 are the same number saying opposite
 * things. Every threshold this module computes is an `UPPER_BOUND` or a
 * `LOWER_BOUND`, and rendering one as a point estimate inverts its meaning.
 *
 * **`value: null` is a first-class state.** A quantity that could not be
 * computed says so and is forced to declare `UNKNOWN`; it never falls back to a
 * plausible default. The refinement below makes the two agree, so a null value
 * carrying a confident evidence class cannot be constructed at all.
 */
export declare const EvidenceClassSchema: z.ZodEnum<["MEASURED", "USER_PROVIDED", "DERIVED", "MODELLED", "UNKNOWN"]>;
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;
/**
 * What kind of statement the value makes.
 *
 * Invariant 4 of the initiative: upper bounds, lower bounds and point estimates
 * must never display identically. Carrying the distinction in the data rather
 * than in a caption is what makes that enforceable.
 */
export declare const BoundKindSchema: z.ZodEnum<["POINT", "UPPER_BOUND", "LOWER_BOUND"]>;
export type BoundKind = z.infer<typeof BoundKindSchema>;
export declare const UncertaintyKindSchema: z.ZodEnum<["SENSITIVITY_RANGE", "MODEL_SPREAD", "NOT_CHARACTERIZED"]>;
export type UncertaintyKind = z.infer<typeof UncertaintyKindSchema>;
/**
 * Named explicitly rather than inferred, and the schemas below are annotated
 * with these names.
 *
 * `z.infer` produces an anonymous structural type, and TypeScript prints
 * anonymous types by *expanding* them into every declaration that mentions
 * them. `Quantity` appears around thirty times in one resource estimate and an
 * estimate appears once per scenario in a bundle, so the emitted
 * `bundle.d.ts` reached 413 KB -- one copy of this shape per occurrence. That
 * is not only package weight; it is a structural type every consumer's compiler
 * re-checks on every build.
 *
 * Annotating the schemas with named types makes the declaration reference the
 * name instead. The shape has to be kept in step with the schema by hand, which
 * the round-trip test does.
 */
/**
 * A schema whose parsed output is `T` and whose input is unvalidated.
 *
 * The input side is `unknown` rather than `T` because refinements narrow the
 * output without narrowing the input -- a workload's evidence class accepts the
 * full enum and rejects `MEASURED` at validation time -- and because every
 * caller here parses untrusted data anyway.
 */
export type Contract<T> = z.ZodType<T, z.ZodTypeDef, unknown>;
export interface Uncertainty {
    kind: UncertaintyKind;
    low: number | null;
    high: number | null;
    basis: string;
}
export interface Quantity {
    value: number | null;
    unit: string;
    bound: BoundKind;
    evidence: EvidenceClass;
    source: string;
    model: string;
    model_version: string;
    assumptions: string[];
    created_at?: string;
    schema_version: string;
    uncertainty?: Uncertainty;
    limitations: string[];
}
export declare const UncertaintySchema: Contract<Uncertainty>;
export declare const QuantitySchema: Contract<Quantity>;
export declare const INTELLIGENCE_SCHEMA_VERSION = "0.1";
/** Options every constructed quantity needs; the rest have honest defaults. */
export interface QuantityInput {
    value: number | null;
    unit: string;
    evidence: EvidenceClass;
    source: string;
    model: string;
    modelVersion: string;
    bound?: BoundKind;
    assumptions?: string[];
    uncertainty?: Uncertainty;
    limitations?: string[];
}
/**
 * Build a quantity.
 *
 * Deliberately not a class and deliberately not optional: a caller that wants a
 * number in a bundle goes through here, so the envelope cannot be forgotten in
 * one place and present in every other.
 */
export declare function quantity(input: QuantityInput): Quantity;
/**
 * A quantity that could not be computed, and why.
 *
 * The reason goes in `limitations` rather than being dropped, because "we did
 * not compute this" and "we computed this and it was unremarkable" are the two
 * states a blank cell is ambiguous between.
 */
export declare function unknownQuantity(unit: string, reason: string, model: string, modelVersion: string): Quantity;
/** True when a quantity carries a usable number. */
export declare function isKnown(value: Quantity | null | undefined): value is Quantity & {
    value: number;
};
/**
 * Whether two quantities describe the same thing under the same model.
 *
 * Used to refuse comparisons rather than to permit them: two physical-qubit
 * counts from different estimator versions are two different quantities that
 * happen to share a unit.
 */
export declare function quantitiesComparable(left: Quantity, right: Quantity): {
    comparable: boolean;
    reasons: string[];
};
/**
 * There is deliberately no `averageQuantities`.
 *
 * Invariant 1 of the initiative -- estimates under different definitions are
 * never averaged -- is enforced by the absence of the function that would do it.
 * A mean of a conservative and an optimistic physical-qubit count is not an
 * estimate of anything: it is a number nobody's model predicts, presented with
 * the authority of both.
 */
export declare const AVERAGING_IS_NOT_PROVIDED: string;
//# sourceMappingURL=measurement.d.ts.map