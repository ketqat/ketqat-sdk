import { z } from "zod";
import { StudyRefusalCodeSchema } from "./refusals.js";
export const StudyFindingSchema = z
    .object({
    code: StudyRefusalCodeSchema,
    /** Where in the record as written, `$`-rooted. `$` alone means the record as a whole. */
    path: z.string().min(1),
    /** What would have to be true instead. For a person; never compared across languages. */
    message: z.string().min(1),
})
    .strict();
/**
 * Build a path both languages spell the same way.
 *
 * A string part is a property and takes a dot; a number is an array index and
 * takes brackets. The mirror of this function in
 * `python/src/ketqat_runner/study_package.py` is four lines long and produces
 * the same string, which is what makes a cross-language assertion on `path`
 * mean something.
 */
export function studyPath(...parts) {
    let path = "$";
    for (const part of parts) {
        path += typeof part === "number" ? `[${part}]` : `.${part}`;
    }
    return path;
}
/** A finding, with the arguments in the order a reader asks them: what, where, why. */
export function finding(code, path, message) {
    return { code, path, message };
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
export function findingFromRefusal(refusal, path) {
    return { code: refusal.code, path, message: `${refusal.subject}: ${refusal.message}` };
}
/**
 * The one-line rendering, for a `problems` list a person reads.
 *
 * Kept in one place so the two languages render it identically as a courtesy,
 * and so that no test is tempted to treat the rendering as the contract. The
 * contract is `code` and `path`; this is the sentence beside them.
 */
export function renderStudyFinding(item) {
    return `${item.code} ${item.path}: ${item.message}`;
}
//# sourceMappingURL=findings.js.map