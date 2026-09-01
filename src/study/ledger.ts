import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { ContentHashSchema } from "./common.js"
import { finding, studyPath, type StudyFinding } from "./findings.js"

/**
 * Every check that was meant to run, and what happened to it (goal §14.5).
 *
 * The list this replaces was `failed_checks: string[]`, and its defect is the
 * one an absence always has: a check that passed and a check that never ran
 * both leave it empty. A recipient reading an export with no failures cannot
 * tell a study that was checked from a study that was not, and the second reads
 * better than the first.
 *
 * So the ledger records every check, and `NOT_RUN` is a status rather than a
 * silence. `INCONCLUSIVE` is a separate one for `ReproductionOutcome`'s reason:
 * a check that could not reach an answer has not failed, and recording it as
 * either a pass or a failure is a claim the run does not support.
 *
 * Each entry says which tool at which version, what it read, what it produced,
 * why it says what it says, what it does not cover, and when the server
 * observed it. That last field is what makes a ledger an audit record rather
 * than a summary: a check reported without a moment attached cannot be placed
 * relative to the record it is about, so "this was checked" and "this was
 * checked before the file changed" become the same sentence.
 */
export const CheckStatusSchema = z.enum(["PASS", "FAIL", "NOT_RUN", "INCONCLUSIVE"])
export type CheckStatus = z.infer<typeof CheckStatusSchema>

/**
 * Whether the package is allowed to be complete without this check passing.
 *
 * Declared per entry rather than inferred from a list somewhere else, because
 * the producer is the party that knows which checks its own claims depend on,
 * and a verifier that decided for itself would be applying its opinion of what
 * this study needed.
 */
export const CheckRequirementSchema = z.enum(["REQUIRED", "OPTIONAL"])
export type CheckRequirement = z.infer<typeof CheckRequirementSchema>

export interface CheckTool {
  name: string
  version: string
}

export const CheckToolSchema: Contract<CheckTool> = z
  .object({
    name: z.string().min(1).max(128),
    /**
     * Required even for a check that did not run.
     *
     * A `NOT_RUN` entry naming no tool records that something was skipped
     * without saying what; naming the tool and version says which check was
     * skipped, which is the difference between a gap a reader can assess and a
     * gap they can only notice.
     */
    version: z.string().min(1).max(128),
  })
  .strict()

export interface CheckLedgerEntry {
  check_id: string
  status: CheckStatus
  requirement: CheckRequirement
  tool: CheckTool
  input_refs: string[]
  output_ref: string | null
  reason: string
  limitations: string[]
  observed_at: string
}

export const CheckLedgerEntrySchema: Contract<CheckLedgerEntry> = z
  .object({
    /** Stable across runs, so two ledgers for two revisions of one study can be read side by side. */
    check_id: z.string().min(1).max(128),
    status: CheckStatusSchema,
    requirement: CheckRequirementSchema,
    tool: CheckToolSchema,
    /** The artifacts or records the check read, by content hash. */
    input_refs: z.array(ContentHashSchema),
    /** What it produced, where it produced anything. Null is the ordinary case for a pass. */
    output_ref: ContentHashSchema.nullable(),
    /**
     * Why the status is what it is.
     *
     * Empty is permitted for a `PASS` and refused for everything else by the
     * refinement below. A failure with no reason is a red mark a reader cannot
     * act on, and a `NOT_RUN` with no reason is the silence this record exists
     * to end.
     */
    reason: z.string().max(4096),
    /** What this check does not cover, even when it passed. */
    limitations: z.array(z.string().min(1)),
    /**
     * When the server observed the check, with an offset.
     *
     * `RECEIPT_ONLY`: it is the server's statement about when, in the family's
     * usual sense, and it is covered by the package's record digest rather than
     * by its semantic one -- re-running a passing check tomorrow does not make
     * the study say anything new.
     */
    observed_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.status !== "PASS" && entry.reason.trim() === "") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `A ${entry.status} check must say why. A status with no reason records that something is wrong, or was ` +
          "skipped, in a form nobody can act on -- and an unexplained gap in a ledger reads exactly like a check " +
          "that found nothing to report.",
        path: ["reason"],
      })
    }
    if (entry.status === "NOT_RUN" && entry.output_ref !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A check that did not run produced nothing, so there is no output for this hash to name. An output " +
          "beside NOT_RUN is a result attributed to a check that never happened.",
        path: ["output_ref"],
      })
    }
  }) as unknown as Contract<CheckLedgerEntry>

export interface CheckLedgerSummary {
  readonly total: number
  readonly passed: number
  readonly failed: number
  readonly not_run: number
  readonly inconclusive: number
  /** Every required check passed. False when one failed, was skipped or was inconclusive. */
  readonly required_checks_passed: boolean
}

/**
 * What the ledger adds up to, without collapsing what it says.
 *
 * `required_checks_passed` is deliberately not "no failures": a required check
 * that did not run has not passed, and a summary that counted only failures
 * would report an unchecked study as clean. The four counts stay beside it, so
 * a caller rendering the summary renders the shape of what happened rather than
 * a verdict standing in for it.
 */
export function checkLedgerSummary(entries: readonly CheckLedgerEntry[]): CheckLedgerSummary {
  let passed = 0
  let failed = 0
  let notRun = 0
  let inconclusive = 0
  let requiredPassed = true
  for (const entry of entries) {
    if (entry.status === "PASS") passed += 1
    else if (entry.status === "FAIL") failed += 1
    else if (entry.status === "NOT_RUN") notRun += 1
    else inconclusive += 1
    if (entry.requirement === "REQUIRED" && entry.status !== "PASS") requiredPassed = false
  }
  return Object.freeze({
    total: entries.length,
    passed,
    failed,
    not_run: notRun,
    inconclusive,
    required_checks_passed: requiredPassed,
  })
}

/**
 * What is wrong with the ledger itself, as distinct from what the ledger says.
 *
 * A duplicate id is the failure that matters here: two entries for one check
 * give the ledger two answers, and any consumer indexing by id gets whichever
 * it saw last. Which one that is depends on the consumer, so the same file
 * reports a pass to one reader and a failure to another.
 *
 * A `FAIL` is not a finding. The ledger is the record of what happened, and a
 * study with a failing optional check is a study that reported honestly; the
 * verification levels are where that shows up, not here.
 */
export function checkLedgerFindings(
  entries: readonly CheckLedgerEntry[],
  section = "check_ledger",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const seen = new Map<string, number>()
  entries.forEach((entry, index) => {
    const first = seen.get(entry.check_id)
    if (first !== undefined) {
      findings.push(
        finding(
          "CHECK_LEDGER_DUPLICATE_ID",
          studyPath(section, index, "check_id"),
          `Check ${JSON.stringify(entry.check_id)} is recorded twice, first at index ${first}. A ledger with two ` +
            "entries for one check has two answers about it, and a consumer indexing by id reports whichever it " +
            "read last.",
        ),
      )
      return
    }
    seen.set(entry.check_id, index)
  })
  return findings
}

/**
 * Required checks the ledger does not mention at all.
 *
 * The caller supplies the list, because which checks a package must carry is a
 * property of the surface publishing it rather than of this module -- a public
 * export and an internal draft require different things of the same study. What
 * this holds is the distinction the ledger exists for: a check absent from the
 * ledger is not a check that passed, and it is not a check that failed either.
 */
export function absentRequiredChecks(
  entries: readonly CheckLedgerEntry[],
  required: readonly string[],
  section = "check_ledger",
): StudyFinding[] {
  const present = new Set(entries.map((entry) => entry.check_id))
  return required
    .filter((id) => !present.has(id))
    .map((id) =>
      finding(
        "CHECK_LEDGER_REQUIRED_CHECK_ABSENT",
        studyPath(section),
        `The check ${JSON.stringify(id)} is required here and the ledger does not mention it. An absent check is ` +
          "not a passing one: record it with the status it actually has, including NOT_RUN and the reason.",
      ),
    )
}
