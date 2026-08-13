import { z } from "zod"
import { IsoDateTimeSchema } from "../contracts/common.js"

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

export const EvidenceClassSchema = z.enum([
  /** Observed on real hardware or in a real classical run, with a date. */
  "MEASURED",
  /** Supplied by the user as a fact about their own situation. */
  "USER_PROVIDED",
  /** Computed by exact arithmetic from other values in this bundle. */
  "DERIVED",
  /** Produced by a model whose parameters are fitted or conventional. */
  "MODELLED",
  /** Not available. Always paired with a null value. */
  "UNKNOWN",
])
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>

/**
 * What kind of statement the value makes.
 *
 * Invariant 4 of the initiative: upper bounds, lower bounds and point estimates
 * must never display identically. Carrying the distinction in the data rather
 * than in a caption is what makes that enforceable.
 */
export const BoundKindSchema = z.enum(["POINT", "UPPER_BOUND", "LOWER_BOUND"])
export type BoundKind = z.infer<typeof BoundKindSchema>

export const UncertaintyKindSchema = z.enum([
  /** Spread produced by varying a parameter the user could in principle measure. */
  "SENSITIVITY_RANGE",
  /** Spread produced by choosing a different published model. Not reducible by measurement. */
  "MODEL_SPREAD",
  /** No spread was computed. Distinct from a spread of zero. */
  "NOT_CHARACTERIZED",
])
export type UncertaintyKind = z.infer<typeof UncertaintyKindSchema>

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
export type Contract<T> = z.ZodType<T, z.ZodTypeDef, unknown>

export interface Uncertainty {
  kind: UncertaintyKind
  low: number | null
  high: number | null
  basis: string
}

export interface Quantity {
  value: number | null
  unit: string
  bound: BoundKind
  evidence: EvidenceClass
  source: string
  model: string
  model_version: string
  assumptions: string[]
  created_at?: string
  schema_version: string
  uncertainty?: Uncertainty
  limitations: string[]
}

export const UncertaintySchema: Contract<Uncertainty> = z.object({
  kind: UncertaintyKindSchema,
  low: z.number().nullable(),
  high: z.number().nullable(),
  /** What was varied to produce this range. Never empty. */
  basis: z.string().min(1),
})

export const QuantitySchema: Contract<Quantity> = z
  .object({
    /** Null when the quantity could not be computed. Never a stand-in default. */
    value: z.number().nullable(),
    unit: z.string().min(1),
    bound: BoundKindSchema,
    evidence: EvidenceClassSchema,
    /** Where this came from: a citation, a user field name, or a formula. */
    source: z.string().min(1),
    /** The model or estimator that produced it. */
    model: z.string().min(1),
    model_version: z.string().min(1),
    /** What had to be true for this number to hold. */
    assumptions: z.array(z.string().min(1)),
    /**
     * Excluded from the reproducibility hash by name, at every level, by the
     * canonicalizer in `src/reproducibility`. That exclusion is why the same
     * inputs hash the same tomorrow as today, and it is the reason this field
     * is `created_at` rather than a new name meaning the same thing.
     */
    created_at: IsoDateTimeSchema.optional(),
    schema_version: z.string().min(1),
    uncertainty: UncertaintySchema.optional(),
    /** What this number does not account for. */
    limitations: z.array(z.string().min(1)),
  })
  .superRefine((quantity, context) => {
    if (quantity.value === null && quantity.evidence !== "UNKNOWN") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A quantity with no value must be classified UNKNOWN, not ${quantity.evidence}. ` +
          "Reporting an absent number under a confident evidence class is how a gap becomes a claim.",
        path: ["evidence"],
      })
    }
    if (quantity.value !== null && quantity.evidence === "UNKNOWN") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A quantity classified UNKNOWN must carry a null value. A number labelled unknown is still a number a reader will quote.",
        path: ["value"],
      })
    }
    if (quantity.value !== null && !Number.isFinite(quantity.value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A quantity value must be finite. Infinity and NaN are not estimates.",
        path: ["value"],
      })
    }
  })

export const INTELLIGENCE_SCHEMA_VERSION = "0.1"

/** Options every constructed quantity needs; the rest have honest defaults. */
export interface QuantityInput {
  value: number | null
  unit: string
  evidence: EvidenceClass
  source: string
  model: string
  modelVersion: string
  bound?: BoundKind
  assumptions?: string[]
  uncertainty?: Uncertainty
  limitations?: string[]
}

/**
 * Build a quantity.
 *
 * Deliberately not a class and deliberately not optional: a caller that wants a
 * number in a bundle goes through here, so the envelope cannot be forgotten in
 * one place and present in every other.
 */
export function quantity(input: QuantityInput): Quantity {
  return QuantitySchema.parse({
    value: input.value,
    unit: input.unit,
    bound: input.bound ?? "POINT",
    evidence: input.value === null ? "UNKNOWN" : input.evidence,
    source: input.source,
    model: input.model,
    model_version: input.modelVersion,
    assumptions: input.assumptions ?? [],
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    ...(input.uncertainty ? { uncertainty: input.uncertainty } : {}),
    limitations: input.limitations ?? [],
  })
}

/**
 * A quantity that could not be computed, and why.
 *
 * The reason goes in `limitations` rather than being dropped, because "we did
 * not compute this" and "we computed this and it was unremarkable" are the two
 * states a blank cell is ambiguous between.
 */
export function unknownQuantity(
  unit: string,
  reason: string,
  model: string,
  modelVersion: string,
): Quantity {
  return QuantitySchema.parse({
    value: null,
    unit,
    bound: "POINT",
    evidence: "UNKNOWN",
    source: "Not computed.",
    model,
    model_version: modelVersion,
    assumptions: [],
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    limitations: [reason],
  })
}

/** True when a quantity carries a usable number. */
export function isKnown(value: Quantity | null | undefined): value is Quantity & { value: number } {
  return value != null && value.value !== null
}

/**
 * Whether two quantities describe the same thing under the same model.
 *
 * Used to refuse comparisons rather than to permit them: two physical-qubit
 * counts from different estimator versions are two different quantities that
 * happen to share a unit.
 */
export function quantitiesComparable(left: Quantity, right: Quantity): { comparable: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (left.unit !== right.unit) reasons.push(`Different units ('${left.unit}' and '${right.unit}').`)
  if (left.model !== right.model) reasons.push(`Different models ('${left.model}' and '${right.model}').`)
  else if (left.model_version !== right.model_version) {
    reasons.push(`Same model at different versions ('${left.model_version}' and '${right.model_version}').`)
  }
  if (left.bound !== right.bound) {
    reasons.push(
      `One is a ${left.bound.toLowerCase().replace("_", " ")} and the other a ${right.bound
        .toLowerCase()
        .replace("_", " ")}; they are not the same kind of statement.`,
    )
  }
  return { comparable: reasons.length === 0, reasons }
}

/**
 * There is deliberately no `averageQuantities`.
 *
 * Invariant 1 of the initiative -- estimates under different definitions are
 * never averaged -- is enforced by the absence of the function that would do it.
 * A mean of a conservative and an optimistic physical-qubit count is not an
 * estimate of anything: it is a number nobody's model predicts, presented with
 * the authority of both.
 */
export const AVERAGING_IS_NOT_PROVIDED =
  "Resource estimates computed under different assumptions are not averaged. " +
  "Each scenario is reported separately with its own assumptions."
