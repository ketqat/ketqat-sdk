import { type StudyFinding } from "./findings.js";
/**
 * What a research package may not exceed (goal §14.6).
 *
 * The hashing core already bounds depth, node count and canonical size, and
 * those bounds are about the *serializer*: they stop a document from turning
 * into unbounded work inside a canonicalizer. These are about the *document*,
 * and they are a different question with a different answer.
 *
 * A package is a file one party hands another. The recipient parses it,
 * recomputes every node's digest, walks every claim's provenance tree, renders
 * every table to CSV and re-hashes the bytes, and decodes every embedded
 * bundle. Each of those is linear or worse in a count the sender chooses, and
 * "the canonical form fits in 8 MiB" is not a bound on any of them: a package
 * of two hundred thousand one-line nodes canonicalizes small and makes a
 * verifier walk a graph for a very long time.
 *
 * So each surface a sender controls is bounded by a number, named separately,
 * and the refusal says which one and by how much. One aggregate byte bound
 * would refuse a legitimate package for the wrong reason and let an
 * illegitimate one through on a technicality -- a hundred figures of 8 KB each
 * is a rendering problem that a size bound sees as small.
 *
 * The numbers are generous for a real study and small enough that a verifier's
 * work is bounded before it starts. They must stay identical to
 * `STUDY_PACKAGE_LIMITS` in `python/src/ketqat_runner/study_package.py`: a
 * ceiling that differs between the languages is a package one of them checks
 * and the other refuses, which is two answers to "is this file all right".
 */
export interface StudyPackageLimits {
    readonly max_nodes: number;
    readonly max_edges: number;
    readonly max_tables: number;
    readonly max_table_rows: number;
    readonly max_report_bytes: number;
    readonly max_commentary_bytes: number;
    readonly max_csv_bytes: number;
    readonly max_figures: number;
    readonly max_svg_bytes: number;
    readonly max_citations: number;
    readonly max_embedded_bundle_bytes: number;
    readonly max_check_ledger_entries: number;
    readonly max_nesting_depth: number;
}
export declare const STUDY_PACKAGE_LIMITS: StudyPackageLimits;
/** The byte length of a string as UTF-8, which is what a file carries. */
export declare function utf8ByteLength(value: string): number;
/**
 * One ceiling, checked.
 *
 * Returns a finding rather than throwing, because a ceiling is a fact about the
 * document a recipient is holding and belongs beside the other findings about
 * it, not as an exception that stops them learning the rest.
 */
export declare function limitFinding(path: string, what: string, observed: number, ceiling: number): StudyFinding | null;
/**
 * How deeply a value nests, counted the way the ceiling is stated.
 *
 * The root object is depth 1, so the bound reads as "how many objects deep may
 * a reader have to go", which is the question somebody setting it is actually
 * asking. Counting stops at the ceiling rather than at the bottom: a document
 * built to be deep should not be fully walked in order to find out that it is
 * too deep.
 */
export declare function nestingDepth(value: unknown, ceiling: number): number;
/**
 * Every ceiling the package as a whole is measured against.
 *
 * Counted from the record as written rather than from a parsed copy, for the
 * reason `verifyResearchPackage` reads the raw candidate throughout: the
 * recipient's file is the thing that has to be within the bounds, and a parse
 * that filled anything in would be measuring a document nobody received.
 */
export declare function packageLimitFindings(record: Record<string, unknown>, limits?: StudyPackageLimits): StudyFinding[];
//# sourceMappingURL=package-limits.d.ts.map