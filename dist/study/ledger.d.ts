import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type StudyFinding } from "./findings.js";
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
export declare const CheckStatusSchema: z.ZodEnum<["PASS", "FAIL", "NOT_RUN", "INCONCLUSIVE"]>;
export type CheckStatus = z.infer<typeof CheckStatusSchema>;
/**
 * Whether the package is allowed to be complete without this check passing.
 *
 * Declared per entry rather than inferred from a list somewhere else, because
 * the producer is the party that knows which checks its own claims depend on,
 * and a verifier that decided for itself would be applying its opinion of what
 * this study needed.
 */
export declare const CheckRequirementSchema: z.ZodEnum<["REQUIRED", "OPTIONAL"]>;
export type CheckRequirement = z.infer<typeof CheckRequirementSchema>;
export interface CheckTool {
    name: string;
    version: string;
}
export declare const CheckToolSchema: Contract<CheckTool>;
export interface CheckLedgerEntry {
    check_id: string;
    status: CheckStatus;
    requirement: CheckRequirement;
    tool: CheckTool;
    input_refs: string[];
    output_ref: string | null;
    reason: string;
    limitations: string[];
    observed_at: string;
}
export declare const CheckLedgerEntrySchema: Contract<CheckLedgerEntry>;
export interface CheckLedgerSummary {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly not_run: number;
    readonly inconclusive: number;
    /** Every required check passed. False when one failed, was skipped or was inconclusive. */
    readonly required_checks_passed: boolean;
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
export declare function checkLedgerSummary(entries: readonly CheckLedgerEntry[]): CheckLedgerSummary;
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
export declare function checkLedgerFindings(entries: readonly CheckLedgerEntry[], section?: string): StudyFinding[];
/**
 * Required checks the ledger does not mention at all.
 *
 * The caller supplies the list, because which checks a package must carry is a
 * property of the surface publishing it rather than of this module -- a public
 * export and an internal draft require different things of the same study. What
 * this holds is the distinction the ledger exists for: a check absent from the
 * ledger is not a check that passed, and it is not a check that failed either.
 */
export declare function absentRequiredChecks(entries: readonly CheckLedgerEntry[], required: readonly string[], section?: string): StudyFinding[];
//# sourceMappingURL=ledger.d.ts.map