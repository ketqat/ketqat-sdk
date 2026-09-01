import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { StudyRefusalCodeSchema, type StudyRefusal, type StudyRefusalCode } from "./refusals.js"

/**
 * A finding, addressed to the place in the document it is about (goal §13.1).
 *
 * A `StudyRefusal` names its subject in words -- a node's label, a row's
 * caption -- which is right at a build boundary, where the caller is holding
 * the thing they just wrote and a label is how they recognise it. It is wrong
 * at a verification boundary, where the reader is holding a file somebody else
 * produced and two labels may be the same string.
 *
 * So verification reports `{ code, path, message }`, and the contract across
 * the two implementations is the first two. **Message equality is not a
 * contract**: the prose is written for a person, it is improved when somebody
 * finds a better sentence, and a cross-language test that compared English
 * would fail on an improvement and pass on a wrong path. What TypeScript and
 * Python must agree about is which defect was found and where it is, and those
 * are exactly the two fields a machine reads.
 *
 * `path` is a `$`-rooted JSON path into the record as written -- not into a
 * parsed or normalised copy of it -- because the reader's next action is to
 * open the file and look. `$.tables[0].rows[2].cells[1].node_hash` is an
 * instruction; "a table cell was wrong" is a mood.
 */
export interface StudyFinding {
  code: StudyRefusalCode
  path: string
  message: string
}

export const StudyFindingSchema: Contract<StudyFinding> = z
  .object({
    code: StudyRefusalCodeSchema,
    /** Where in the record as written, `$`-rooted. `$` alone means the record as a whole. */
    path: z.string().min(1),
    /** What would have to be true instead. For a person; never compared across languages. */
    message: z.string().min(1),
  })
  .strict()

/**
 * Build a path both languages spell the same way.
 *
 * A string part is a property and takes a dot; a number is an array index and
 * takes brackets. The mirror of this function in
 * `python/src/ketqat_runner/study_package.py` is four lines long and produces
 * the same string, which is what makes a cross-language assertion on `path`
 * mean something.
 */
export function studyPath(...parts: readonly (string | number)[]): string {
  let path = "$"
  for (const part of parts) {
    path += typeof part === "number" ? `[${part}]` : `.${part}`
  }
  return path
}

/** A finding, with the arguments in the order a reader asks them: what, where, why. */
export function finding(code: StudyRefusalCode, path: string, message: string): StudyFinding {
  return { code, path, message }
}

/**
 * A refusal from a subject-addressed check, re-addressed to a path.
 *
 * The graph checks in `evidence.ts` predate this vocabulary and report by
 * subject, and rewriting them to report by path would mean rewriting what they
 * mean: `verifyEvidenceGraph` is called on a bare node list as often as on a
 * package, and a path into a package is not a fact those callers have. So the
 * path is supplied by the caller that *does* know where the list came from, and
 * the refusal's subject survives in the message, where it was already the most
 * useful thing in the sentence.
 */
export function findingFromRefusal(refusal: StudyRefusal, path: string): StudyFinding {
  return { code: refusal.code, path, message: `${refusal.subject}: ${refusal.message}` }
}

/**
 * The one-line rendering, for a `problems` list a person reads.
 *
 * Kept in one place so the two languages render it identically as a courtesy,
 * and so that no test is tempted to treat the rendering as the contract. The
 * contract is `code` and `path`; this is the sentence beside them.
 */
export function renderStudyFinding(item: StudyFinding): string {
  return `${item.code} ${item.path}: ${item.message}`
}
