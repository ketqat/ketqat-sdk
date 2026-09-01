import { z } from "zod"
import type { Contract, Quantity } from "../intelligence/measurement.js"
import { FieldOriginSchema, StudyQuantitySchema, type QuantityField } from "./common.js"

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

export const STUDY_DIMENSIONS = Object.freeze([
  "TIME",
  "MONEY",
  "CREDITS",
  "MEMORY",
  "SHOTS",
  "QUBITS",
  "ACCURACY",
  "PROBLEM_SIZE",
] as const)

export type StudyDimension = (typeof STUDY_DIMENSIONS)[number]

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
  readonly dimension: StudyDimension
  readonly units: readonly string[]
  readonly open: boolean
  readonly foreign: readonly StudyDimension[]
  readonly means: string
}

const family = (
  dimension: StudyDimension,
  units: readonly string[],
  means: string,
  foreign: readonly StudyDimension[] = [],
): StudyUnitFamily =>
  Object.freeze({
    dimension,
    units: Object.freeze([...units]),
    open: foreign.length > 0,
    foreign: Object.freeze([...foreign]),
    means,
  })

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
export const STUDY_UNIT_FAMILIES: readonly StudyUnitFamily[] = Object.freeze([
  family(
    "TIME",
    ["nanoseconds", "microseconds", "milliseconds", "seconds", "minutes", "hours", "days"],
    "how long something takes, or how long it may take",
  ),
  family("MONEY", ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"], "money, in a named currency"),
  family("CREDITS", ["credits"], "the platform's own unit of spend, convertible only through a tariff"),
  family(
    "MEMORY",
    ["bytes", "kibibytes", "mebibytes", "gibibytes", "tebibytes"],
    "storage or working memory, in binary-prefixed units",
  ),
  family("SHOTS", ["shots"], "repetitions of a circuit"),
  family("QUBITS", ["qubits", "physical qubits", "logical qubits"], "a count of qubits, physical or logical"),
  family(
    "ACCURACY",
    ["relative error", "percent", "probability", "ratio"],
    "how close an answer has to be, said without saying close in what",
  ),
  family(
    "PROBLEM_SIZE",
    [],
    "the size of the instance an answer has to hold for, counted in whatever the instance is made of",
    ["TIME", "MONEY", "CREDITS", "MEMORY", "ACCURACY"],
  ),
])

/** The working lookup, module-private and built from the frozen tuple. */
const familiesByDimension = new Map<string, StudyUnitFamily>(
  STUDY_UNIT_FAMILIES.map((entry) => [entry.dimension, entry]),
)

// The table is checked at load rather than described as correct. Every
// dimension has exactly one family, a closed family has units to admit, and an
// open family has a foreign dimension to refuse.
for (const dimension of STUDY_DIMENSIONS) {
  if (!familiesByDimension.has(dimension)) {
    throw new Error(`Dimension ${dimension} has no unit family; a dimension with no units admits nothing.`)
  }
}
for (const entry of STUDY_UNIT_FAMILIES) {
  if (entry.open && entry.foreign.length === 0) {
    throw new Error(`Unit family ${entry.dimension} is open and names no foreign dimension, so it admits every string.`)
  }
  if (!entry.open && entry.units.length === 0) {
    throw new Error(`Unit family ${entry.dimension} is closed and lists no unit, so it admits nothing.`)
  }
  for (const foreign of entry.foreign) {
    if (!familiesByDimension.has(foreign)) {
      throw new Error(`Unit family ${entry.dimension} names ${foreign} as foreign, and there is no such dimension.`)
    }
  }
}

/** The family for a dimension. A plain throw: the argument is a literal in this repository, not data from a file. */
export function studyUnitFamily(dimension: StudyDimension): StudyUnitFamily {
  const entry = familiesByDimension.get(dimension)
  if (entry === undefined) {
    throw new Error(`${JSON.stringify(dimension)} is not a study dimension. Known: ${STUDY_DIMENSIONS.join(", ")}.`)
  }
  return entry
}

const escapeForPattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * What an open family refuses, as one anchored expression.
 *
 * Built from the foreign families' units and sorted, so the emitted pattern is
 * a function of the table rather than of the order somebody wrote it in. The
 * alternative -- a `.refine` listing the same units -- is a rule the generated
 * JSON Schema would not carry, and the Python validator reads that schema.
 */
/**
 * Character classes whose meaning survives being read by two regex engines.
 *
 * A pattern in a study schema is written once and read twice: ECMAScript
 * compiles it from the TypeScript contract, and Python's `re` compiles the same
 * text out of the generated JSON Schema. Every shorthand class differs between
 * them somewhere -- `\s`, `\d`, `\w` and `.` all do, and `\p{...}` is not
 * Python syntax at all -- so the family spells its classes with literal ranges.
 * `tests/study-pattern-parity.test.mjs` fails on any shipped pattern that
 * reintroduces a shorthand.
 *
 * The ranges: C0 controls and space, DEL and C1, then the Unicode space
 * separators and the zero-width no-break space.
 */
const CONTROL_CHARACTERS =
  "\\x00-\\x1f\\x7f-\\x9f\\u2028\\u2029"
const SPACE_CHARACTERS =
  "\\x20\\xa0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000\\ufeff"
const VISIBLE_CHARACTER = `[^${CONTROL_CHARACTERS}${SPACE_CHARACTERS}]`

function openUnitPattern(entry: StudyUnitFamily): RegExp {
  const foreign = entry.foreign
    .flatMap((dimension) => [...studyUnitFamily(dimension).units])
    .sort()
    .map(escapeForPattern)
  // Spelled out rather than `.`, `\\s` or `\\p{C}`, all three of which mean
  // different things in the two engines that read this pattern.
  //
  // `.` excludes four line terminators in ECMAScript and only `\n` in Python's
  // `re`, so a unit carrying a carriage return or U+2028 was refused here and
  // accepted there. `\\s` differs too -- Python's includes `\x1c-\x1f` and
  // `\x85`, ECMAScript's includes `\ufeff`. `\\p{C}` is not syntax Python's
  // `re` parses at all. VISIBLE_CHARACTER is literal ranges, which both engines
  // read the same way.
  //
  // Pinning both ends to a visible character is a separate fix from the engine
  // one: `.` accepted NUL and surrounding spaces in *both* engines, and
  // " seconds" is not a unit -- it is a value that reads identically to another
  // and hashes differently.
  const visible = VISIBLE_CHARACTER
  const inner = `[^${CONTROL_CHARACTERS}]`
  return new RegExp(`^(?!(?:${foreign.join("|")})$)${visible}(?:${inner}*${visible})?$`)
}

/** Whether a unit belongs to a dimension, under the same rule the schema applies. */
export function unitBelongsToDimension(unit: string, dimension: StudyDimension): boolean {
  const entry = studyUnitFamily(dimension)
  if (entry.units.includes(unit)) return true
  if (!entry.open) return false
  return unit.length > 0 && openUnitPattern(entry).test(unit)
}

/** The unit contract for a dimension: an enum where the family is closed, an anchored pattern where it is open. */
export function studyUnitSchema(dimension: StudyDimension): z.ZodType<string, z.ZodTypeDef, unknown> {
  const entry = studyUnitFamily(dimension)
  if (!entry.open) {
    return z.enum(entry.units as unknown as [string, ...string[]], {
      errorMap: () => ({
        message:
          `A ${entry.dimension} quantity is ${entry.means}. Its units are: ${entry.units.join(", ")}. ` +
          "A unit from another dimension is not a looser reading of this field, it is a different quantity.",
      }),
    })
  }
  return z.string().min(1).regex(openUnitPattern(entry), {
    message:
      `A ${entry.dimension} quantity is ${entry.means}, so its unit may be anything except a unit belonging to ` +
      `${entry.foreign.join(", ")}.`,
  })
}

/**
 * The strict study `Quantity`, with its `unit` narrowed to one dimension.
 *
 * The envelope's own invariants are re-run rather than restated, for the reason
 * `common.ts` gives where it derives the strict variant: a second copy of "a
 * quantity with no value must be classified UNKNOWN" is a second copy free to
 * drift from the first. Only the unit is narrowed here, and only the unit.
 *
 * The instance is cached per dimension so two fields of one dimension share a
 * schema object. That is not only allocation: `zod-to-json-schema` emits one
 * definition per distinct instance, so sharing is what keeps the generated
 * schema from carrying a full `Quantity` envelope per field.
 */
const studyQuantityObject = (
  StudyQuantitySchema as unknown as z.ZodEffects<z.ZodObject<z.ZodRawShape>>
).innerType()

const quantityByDimension = new Map<StudyDimension, Contract<Quantity>>()

export function dimensionedQuantitySchema(dimension: StudyDimension): Contract<Quantity> {
  const cached = quantityByDimension.get(dimension)
  if (cached !== undefined) return cached
  const schema = studyQuantityObject
    .extend({ unit: studyUnitSchema(dimension) })
    .strict()
    .superRefine((value, context) => {
      const shared = StudyQuantitySchema.safeParse(value)
      if (shared.success) return
      for (const issue of shared.error.issues) context.addIssue(issue)
    }) as unknown as Contract<Quantity>
  quantityByDimension.set(dimension, schema)
  return schema
}

const quantityFieldByDimension = new Map<StudyDimension, Contract<QuantityField>>()

/** A `QuantityField` whose quantity is of one dimension. Same fields as `QuantityFieldSchema`; a narrower unit. */
export function dimensionedQuantityFieldSchema(dimension: StudyDimension): Contract<QuantityField> {
  const cached = quantityFieldByDimension.get(dimension)
  if (cached !== undefined) return cached
  const schema = z
    .object({
      quantity: dimensionedQuantitySchema(dimension),
      origin: FieldOriginSchema,
    })
    .strict() as unknown as Contract<QuantityField>
  quantityFieldByDimension.set(dimension, schema)
  return schema
}

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
  readonly record_kind: string
  readonly field: string
  readonly dimension: StudyDimension
}

export const STUDY_FIELD_DIMENSIONS: readonly StudyFieldDimension[] = Object.freeze([
  Object.freeze({ record_kind: "problem_specification", field: "accuracy_requirement", dimension: "ACCURACY" as const }),
  Object.freeze({ record_kind: "problem_specification", field: "runtime_constraint", dimension: "TIME" as const }),
  Object.freeze({ record_kind: "problem_specification", field: "budget_constraint", dimension: "MONEY" as const }),
  Object.freeze({ record_kind: "problem_specification", field: "problem_size", dimension: "PROBLEM_SIZE" as const }),
  Object.freeze({ record_kind: "study_plan", field: "expected_runtime", dimension: "TIME" as const }),
  Object.freeze({ record_kind: "study_plan", field: "expected_credits", dimension: "CREDITS" as const }),
])
