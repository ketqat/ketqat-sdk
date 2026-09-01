import { z } from "zod";
import type { Contract, Quantity } from "../intelligence/measurement.js";
import { type QuantityField } from "./common.js";
/**
 * What a study quantity is a quantity *of* (goal §10.2).
 *
 * `Quantity.unit` is a free string in `src/intelligence/measurement.ts`, and it
 * has to stay one there: that module serves every estimator in the repository
 * and a closed unit list would refuse units it has never heard of. Inside a
 * study the looseness costs something specific. A runtime constraint of
 * `{value: 3600, unit: "USD"}` parses, hashes, canonicalizes and reaches a
 * report; an orchestrator comparing it against an expected runtime in seconds
 * compares 3600 with 0.432 and concludes the plan fits. Nothing in the record
 * says which of the two numbers is the wrong kind of thing.
 *
 * So a study-local field declares the **dimension** it is a quantity of, and the
 * dimension names the units that belong to it. Seconds are not dollars, shots
 * are not qubits, and a field that takes one refuses the other at the schema
 * rather than at the reader.
 *
 * Two properties are load-bearing.
 *
 * **A closed family is a `z.enum`, not a refinement.** `zod-to-json-schema` can
 * emit an enum and cannot emit a `.refine`, and
 * `python/src/ketqat_runner/study_validation.py` checks records against the
 * emitted schema -- so a unit rule written as a refinement is a rule only one of
 * the two languages applies, which is the failure `values.ts` describes at
 * length for the exact-integer contracts. An enum is compared by string
 * equality in both languages, with no regular-expression semantics between them
 * to disagree about.
 *
 * **An open family states what it refuses rather than what it admits.** The size
 * of a problem instance is counted in whatever the instance is made of --
 * delivery stops, orders, spin orbitals, qubits -- and a closed list there would
 * refuse legitimate studies. What a problem size is *not* is a duration, a
 * price, a quantity of memory or a tolerance, and that list is finite. The
 * pattern is built from the foreign families at load, so the two can never
 * drift.
 */
export declare const STUDY_DIMENSIONS: readonly ["TIME", "MONEY", "CREDITS", "MEMORY", "SHOTS", "QUBITS", "ACCURACY", "PROBLEM_SIZE"];
export type StudyDimension = (typeof STUDY_DIMENSIONS)[number];
/**
 * One dimension's unit family, as immutable plain data.
 *
 * `open` decides how `units` and `foreign` are read. A closed family admits
 * exactly the units it lists and names no foreign dimension. An open family
 * admits anything except the units of the dimensions it calls foreign, which is
 * why an open family with no foreign dimension is refused at load: it would
 * admit every string, and a contract that admits everything is a field with no
 * contract wearing the word.
 */
export interface StudyUnitFamily {
    readonly dimension: StudyDimension;
    readonly units: readonly string[];
    readonly open: boolean;
    readonly foreign: readonly StudyDimension[];
    readonly means: string;
}
/**
 * The families, and the one judgement call in each.
 *
 * **Credits are not money.** A credit converts to a currency through a tariff
 * that is a decision someone made on a date, not through a unit conversion, so
 * a budget stated in dollars does not satisfy a ceiling stated in credits and
 * the two dimensions stay apart. The plan's `max_credits` is where a credit
 * ceiling lives; `budget_constraint` is where money does.
 *
 * **An accuracy requirement is dimensionless.** `relative error`, `percent`,
 * `probability` and `ratio` are ways of saying how close is close enough
 * without saying close in what. An absolute tolerance -- "within 0.5 kWh" -- is
 * deliberately *not* a member, because its unit is the metric's own and
 * admitting it would put a time or a price back into the one field this family
 * exists to keep them out of. An absolute tolerance is stated as a success
 * criterion, whose threshold declares its own dimension.
 *
 * **Memory is binary-prefixed.** `kilobytes` and `kibibytes` differ by 2.4% and
 * a reader cannot tell which a producer meant, so only the unambiguous spelling
 * is a member.
 */
export declare const STUDY_UNIT_FAMILIES: readonly StudyUnitFamily[];
/** The family for a dimension. A plain throw: the argument is a literal in this repository, not data from a file. */
export declare function studyUnitFamily(dimension: StudyDimension): StudyUnitFamily;
/** Whether a unit belongs to a dimension, under the same rule the schema applies. */
export declare function unitBelongsToDimension(unit: string, dimension: StudyDimension): boolean;
/** The unit contract for a dimension: an enum where the family is closed, an anchored pattern where it is open. */
export declare function studyUnitSchema(dimension: StudyDimension): z.ZodType<string, z.ZodTypeDef, unknown>;
export declare function dimensionedQuantitySchema(dimension: StudyDimension): Contract<Quantity>;
/** A `QuantityField` whose quantity is of one dimension. Same fields as `QuantityFieldSchema`; a narrower unit. */
export declare function dimensionedQuantityFieldSchema(dimension: StudyDimension): Contract<QuantityField>;
/**
 * Which study field is a quantity of which dimension, as immutable plain data.
 *
 * Exported so the rule a reviewer applies and the rule the tests check are one
 * list. `MEMORY`, `SHOTS` and `QUBITS` hold no row here: no field of a
 * specification or a plan is a quantity of memory, shots or qubits. They are
 * reached through a success or refusal criterion, whose threshold declares its
 * own dimension -- which is where a plan says "at most 8 gibibytes" or "at
 * least 100000 shots" and where stating either in seconds is refused.
 */
export interface StudyFieldDimension {
    readonly record_kind: string;
    readonly field: string;
    readonly dimension: StudyDimension;
}
export declare const STUDY_FIELD_DIMENSIONS: readonly StudyFieldDimension[];
//# sourceMappingURL=units.d.ts.map