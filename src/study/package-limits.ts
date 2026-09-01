import { finding, studyPath, type StudyFinding } from "./findings.js"

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
  readonly max_nodes: number
  readonly max_edges: number
  readonly max_tables: number
  readonly max_table_rows: number
  readonly max_report_bytes: number
  readonly max_commentary_bytes: number
  readonly max_csv_bytes: number
  readonly max_figures: number
  readonly max_svg_bytes: number
  readonly max_citations: number
  readonly max_embedded_bundle_bytes: number
  readonly max_check_ledger_entries: number
  readonly max_nesting_depth: number
}

export const STUDY_PACKAGE_LIMITS: StudyPackageLimits = Object.freeze({
  max_nodes: 5000,
  max_edges: 20000,
  max_tables: 64,
  max_table_rows: 5000,
  max_report_bytes: 1048576,
  max_commentary_bytes: 262144,
  max_csv_bytes: 4194304,
  max_figures: 64,
  max_svg_bytes: 1048576,
  max_citations: 512,
  max_embedded_bundle_bytes: 16777216,
  max_check_ledger_entries: 512,
  /**
   * Shallower than the canonicalizer's 64, and deliberately.
   *
   * The deepest legitimate path in a package is a node's quantity inside an
   * embedded record inside the package, which is six levels. A document twenty
   * levels deep is not a study that grew; it is a document built to make a
   * recursive verifier work, and the bound that catches it should be the one
   * that names the package rather than the one that names the serializer.
   */
  max_nesting_depth: 24,
})

/** The byte length of a string as UTF-8, which is what a file carries. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * One ceiling, checked.
 *
 * Returns a finding rather than throwing, because a ceiling is a fact about the
 * document a recipient is holding and belongs beside the other findings about
 * it, not as an exception that stops them learning the rest.
 */
export function limitFinding(
  path: string,
  what: string,
  observed: number,
  ceiling: number,
): StudyFinding | null {
  if (observed <= ceiling) return null
  return finding(
    "PACKAGE_LIMIT_EXCEEDED",
    path,
    `This package carries ${observed} ${what}, past the ceiling of ${ceiling}. The ceilings exist because a ` +
      "recipient recomputes every digest, walks every provenance tree and re-renders every table, and each of " +
      "those is work the sender chooses the size of.",
  )
}

/**
 * How deeply a value nests, counted the way the ceiling is stated.
 *
 * The root object is depth 1, so the bound reads as "how many objects deep may
 * a reader have to go", which is the question somebody setting it is actually
 * asking. Counting stops at the ceiling rather than at the bottom: a document
 * built to be deep should not be fully walked in order to find out that it is
 * too deep.
 */
export function nestingDepth(value: unknown, ceiling: number): number {
  const walk = (current: unknown, depth: number): number => {
    if (depth > ceiling) return depth
    if (current === null || typeof current !== "object") return depth - 1
    let deepest = depth
    for (const child of Array.isArray(current) ? current : Object.values(current)) {
      const found = walk(child, depth + 1)
      if (found > deepest) deepest = found
      if (deepest > ceiling) return deepest
    }
    return deepest
  }
  return walk(value, 1)
}

/**
 * Every ceiling the package as a whole is measured against.
 *
 * Counted from the record as written rather than from a parsed copy, for the
 * reason `verifyResearchPackage` reads the raw candidate throughout: the
 * recipient's file is the thing that has to be within the bounds, and a parse
 * that filled anything in would be measuring a document nobody received.
 */
export function packageLimitFindings(
  record: Record<string, unknown>,
  limits: StudyPackageLimits = STUDY_PACKAGE_LIMITS,
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const count = (key: string): number => {
    const value = record[key]
    return Array.isArray(value) ? value.length : 0
  }
  const add = (item: StudyFinding | null): void => {
    if (item !== null) findings.push(item)
  }

  add(limitFinding(studyPath("nodes"), "evidence nodes", count("nodes"), limits.max_nodes))
  add(limitFinding(studyPath("edges"), "evidence edges", count("edges"), limits.max_edges))
  add(limitFinding(studyPath("tables"), "tables", count("tables"), limits.max_tables))
  add(limitFinding(studyPath("figures"), "figures", count("figures"), limits.max_figures))
  add(
    limitFinding(studyPath("references"), "citations", count("references"), limits.max_citations),
  )
  add(
    limitFinding(
      studyPath("check_ledger"),
      "check ledger entries",
      count("check_ledger"),
      limits.max_check_ledger_entries,
    ),
  )

  const tables = Array.isArray(record["tables"]) ? (record["tables"] as unknown[]) : []
  tables.forEach((table, index) => {
    if (table === null || typeof table !== "object") return
    const rows = (table as Record<string, unknown>)["rows"]
    add(
      limitFinding(
        studyPath("tables", index, "rows"),
        "table rows",
        Array.isArray(rows) ? rows.length : 0,
        limits.max_table_rows,
      ),
    )
  })

  const depth = nestingDepth(record, limits.max_nesting_depth)
  if (depth > limits.max_nesting_depth) {
    findings.push(
      finding(
        "PACKAGE_LIMIT_EXCEEDED",
        studyPath(),
        `This package nests at least ${depth} levels deep, past the ceiling of ${limits.max_nesting_depth}. The ` +
          "deepest path a study record legitimately takes is a quantity inside an embedded record inside the " +
          "package; anything past that is a document shaped to make a recursive reader work rather than a study " +
          "that grew.",
      ),
    )
  }

  return findings
}
