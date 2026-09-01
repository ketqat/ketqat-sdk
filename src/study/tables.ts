import { z } from "zod"
import type { Contract, Quantity } from "../intelligence/measurement.js"
import { GeneratedArtifactSchema, type GeneratedArtifact } from "./artifact.js"
import { ContentHashSchema } from "./common.js"
import { finding, studyPath, type StudyFinding } from "./findings.js"
import { artifactHash } from "./hash.js"
import { serializeJcsNumber } from "./jcs.js"
import { STUDY_PACKAGE_LIMITS, limitFinding, utf8ByteLength } from "./package-limits.js"

/**
 * A table, and the CSV that is the same table (goal §14.3).
 *
 * Two renderings of one structure, generated from it rather than stored beside
 * it. The field this replaces was `csv: string` sitting next to
 * `result_rows: ResultRow[]`, which is two statements about one set of numbers,
 * free to disagree -- and the CSV is the one that gets forwarded, opened in a
 * spreadsheet and quoted, so it is the one whose disagreement matters.
 *
 * Every number in the table comes from an evidence node. A cell in a value
 * column names a node and nothing else: there is no `value` field for it to
 * carry a copy in, because a copy is a number that can drift from the thing it
 * was copied from, and the copy is what ends up in the slide. The generated CSV
 * puts the node's hash in the column beside the number, so the traceability
 * survives the format everyone actually forwards.
 *
 * The CSV bytes are hashed as bytes and the hash travels with the table, which
 * makes the rendering checkable: a recipient re-renders from the rows,
 * re-hashes, and compares. That check is what `TABLE_CSV_ARTIFACT_MISMATCH`
 * reports, and it catches the case a schema never could -- a file edited after
 * it was generated, or rows edited after the file was.
 */

/** What the table is for, so a reader and a verifier read it the same way. */
export const TableRoleSchema = z.enum([
  /** The values the study proceeded on. Every cell is a node the reader can open. */
  "ASSUMPTIONS",
  /** The values the study produced. A results table must have something to report. */
  "RESULTS",
  /** Anything else a report tabulates: a comparison, an inventory, a schedule. */
  "OTHER",
])
export type TableRole = z.infer<typeof TableRoleSchema>

/**
 * Whether a column carries text a person wrote or a number the study produced.
 *
 * The distinction is the whole of the grounding rule at this level. A `LABEL`
 * column is what the row is called -- a scenario name, a metric name -- and it
 * is prose, so it carries text. A `VALUE` column is a decision-bearing number,
 * so it carries a node hash and no text, and there is no third option: a column
 * whose cells sometimes carry a number and sometimes a note is a column a
 * reader cannot tell apart at a glance, which is where an unsourced figure
 * hides.
 */
export const TableColumnRoleSchema = z.enum(["LABEL", "VALUE"])
export type TableColumnRole = z.infer<typeof TableColumnRoleSchema>

export interface TableColumn {
  column_id: string
  header: string
  role: TableColumnRole
  unit: string | null
}

export const TableColumnSchema: Contract<TableColumn> = z
  .object({
    /** Stable, and what a cell names. Headers are for reading and may be reworded. */
    column_id: z.string().min(1).max(64),
    header: z.string().min(1).max(256),
    role: TableColumnRoleSchema,
    /**
     * The unit every value in this column is in, or null for a label column.
     *
     * Declared on the column rather than read off each node, and then checked
     * against each node, because a column is a claim that its cells are
     * comparable. A column headed "runtime" holding one figure in seconds and
     * one in hours is a column a reader will compare, and neither cell is
     * wrong on its own.
     */
    unit: z.string().min(1).max(64).nullable(),
  })
  .strict()
  .superRefine((column, context) => {
    if (column.role === "LABEL" && column.unit !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A label column holds text, so there is no unit for it to be in.",
        path: ["unit"],
      })
    }
  }) as unknown as Contract<TableColumn>

export interface TableCell {
  column_id: string
  text: string | null
  node_hash: string | null
}

export const TableCellSchema: Contract<TableCell> = z
  .object({
    column_id: z.string().min(1).max(64),
    /** The text of a label cell. Null in a value column. */
    text: z.string().max(1024).nullable(),
    /**
     * The node a value cell reads from. Null in a label column.
     *
     * There is deliberately no `value` beside it. A row carrying its own copy of
     * a number can disagree with the node, and nothing in the file says which of
     * the two a reader should believe -- so the number is read from one place,
     * every time it is rendered.
     */
    node_hash: ContentHashSchema.nullable(),
  })
  .strict()
  .superRefine((cell, context) => {
    if (cell.text === null && cell.node_hash === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A cell carries either text or a node, and this one carries neither. An empty cell renders as a blank a " +
          "reader reads as zero, as missing, or as not applicable, and the table does not say which.",
        path: ["node_hash"],
      })
    }
    if (cell.text !== null && cell.node_hash !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A cell carries text or a node, never both. Two statements in one cell are free to disagree, and the " +
          "text is the one that renders.",
        path: ["text"],
      })
    }
  }) as unknown as Contract<TableCell>

export interface TableRow {
  row_id: string
  cells: TableCell[]
}

export const TableRowSchema: Contract<TableRow> = z
  .object({
    /** Stable, so a figure can name a row and a reader can find it again after a re-sort. */
    row_id: z.string().min(1).max(64),
    cells: z.array(TableCellSchema).min(1),
  })
  .strict()

export interface StudyTable {
  table_id: string
  caption: string
  role: TableRole
  columns: TableColumn[]
  rows: TableRow[]
  csv_artifact: GeneratedArtifact
}

export const StudyTableSchema: Contract<StudyTable> = z
  .object({
    table_id: z.string().min(1).max(64),
    /** What the table shows, in words. Prose about a table is not a number in one. */
    caption: z.string().min(1).max(1024),
    role: TableRoleSchema,
    columns: z.array(TableColumnSchema).min(1).max(64),
    rows: z.array(TableRowSchema).max(STUDY_PACKAGE_LIMITS.max_table_rows),
    /**
     * The CSV this table renders to, by hash rather than by content.
     *
     * The bytes are not stored: they are regenerable from the rows, so storing
     * them would be the second copy this module exists to remove. What is stored
     * is the digest, which is the thing a recipient compares a re-rendering
     * against.
     */
    csv_artifact: GeneratedArtifactSchema,
  })
  .strict()
  .superRefine((table, context) => {
    if (table.role === "RESULTS" && !table.columns.some((column) => column.role === "VALUE")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A results table declares no value column, so it reports no results. A table of labels is an inventory; " +
          "if that is what it is, its role is OTHER.",
        path: ["columns"],
      })
    }
  }) as unknown as Contract<StudyTable>

/**
 * What a value cell needs from the record it reads.
 *
 * Structural rather than nominal, so this module does not import the evidence
 * graph: an `EvidenceNode` satisfies it, and so does anything else that carries
 * a labelled quantity. The dependency would otherwise run the wrong way -- a
 * renderer is downstream of the data it renders, and a table that could only
 * ever read one record type would have to be rewritten the first time a bundle
 * field is tabulated directly.
 */
export interface TableValueSource {
  readonly kind: string
  readonly label: string
  readonly quantity: Quantity | null
}

/**
 * A cell's rendered text, in the one spelling both languages produce.
 *
 * `serializeJcsNumber` is the family's canonical number-to-string function, the
 * one RFC 8785 defines and both implementations already pin against the RFC's
 * own vectors. Using it here rather than a local formatter is what makes the
 * generated CSV byte-identical in TypeScript and Python -- and the CSV's digest
 * is only worth carrying if the two languages regenerate the same bytes.
 *
 * `UNKNOWN` is rendered as the word, never as an empty field. A blank cell in a
 * spreadsheet reads as zero to a chart and as missing to a person, and the
 * study said neither: it said it looked and did not find.
 */
export function renderCellValue(quantity: Quantity | null): string {
  if (quantity === null) return "UNKNOWN"
  if (quantity.value === null) return "UNKNOWN"
  return serializeJcsNumber(quantity.value)
}

/** Raised when a table is rendered before it has been checked. */
export class StudyTableRenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StudyTableRenderError"
  }
}

/**
 * One CSV field, escaped by RFC 4180's rule and no other.
 *
 * A field is quoted when it contains a quote, a comma, a carriage return or a
 * newline, and a quote inside a quoted field is doubled. Nothing else is
 * special-cased: a formatter that also quoted leading zeros, or fields
 * beginning with `=`, would produce a file whose bytes depend on the
 * spreadsheet its author was worried about, and the digest would stop being
 * regenerable.
 */
function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * The header row, in declared column order.
 *
 * A value column contributes two fields: the value and the hash of the node it
 * was read from. That second column is the property this whole module is for,
 * carried into the format people forward -- a CSV in which every number sits
 * beside the identity of the record it came from is a CSV a reader can check
 * without the package, and one that opens in a spreadsheet like any other.
 */
function csvHeaderFields(table: StudyTable): string[] {
  const fields: string[] = []
  for (const column of table.columns) {
    fields.push(column.unit === null ? column.header : `${column.header} (${column.unit})`)
    if (column.role === "VALUE") fields.push(`${column.header} node`)
  }
  return fields
}

function cellsByColumn(row: TableRow): Map<string, TableCell> {
  const index = new Map<string, TableCell>()
  for (const cell of row.cells) {
    if (!index.has(cell.column_id)) index.set(cell.column_id, cell)
  }
  return index
}

/**
 * Render the table to CSV, deterministically.
 *
 * LF line endings, no byte-order mark, no trailing blank line beyond the final
 * terminator, columns in declared order and rows in stored order. Every one of
 * those is a decision that would otherwise be made differently by two
 * implementations, and each difference is a digest that does not match a
 * re-rendering.
 *
 * Callers check the table first. A cell whose node the package does not carry
 * is a finding, not an exception -- `tableFindings` reports it with a path --
 * and reaching this function with one is a caller that skipped the check.
 */
export function renderTableCsv(
  table: StudyTable,
  sources: ReadonlyMap<string, TableValueSource>,
): string {
  const lines: string[] = [csvHeaderFields(table).map(csvField).join(",")]
  for (const row of table.rows) {
    const index = cellsByColumn(row)
    const fields: string[] = []
    for (const column of table.columns) {
      const cell = index.get(column.column_id)
      if (cell === undefined) {
        throw new StudyTableRenderError(
          `Table ${table.table_id} row ${row.row_id} has no cell for column ${column.column_id}. Check the table ` +
            "with tableFindings before rendering it.",
        )
      }
      if (column.role === "LABEL") {
        fields.push(cell.text ?? "")
        continue
      }
      const nodeHash = cell.node_hash
      const source = nodeHash === null ? undefined : sources.get(nodeHash)
      if (nodeHash === null || source === undefined) {
        throw new StudyTableRenderError(
          `Table ${table.table_id} row ${row.row_id} reads column ${column.column_id} from a node the package ` +
            "does not carry. Check the table with tableFindings before rendering it.",
        )
      }
      fields.push(renderCellValue(source.quantity))
      fields.push(nodeHash)
    }
    lines.push(fields.map(csvField).join(","))
  }
  return `${lines.join("\n")}\n`
}

/** The CSV as the bytes that are hashed, which is what an artifact digest is over. */
export function tableCsvBytes(
  table: StudyTable,
  sources: ReadonlyMap<string, TableValueSource>,
): Uint8Array {
  return new TextEncoder().encode(renderTableCsv(table, sources))
}

/**
 * The artifact record for a table's CSV, computed rather than asserted.
 *
 * The builder calls this and stores the result; the verifier calls it again and
 * compares. One function, two callers, so there is no path on which a package
 * is written with a digest nothing recomputed.
 */
export function tableCsvArtifact(
  table: StudyTable,
  sources: ReadonlyMap<string, TableValueSource>,
  schemaVersion: string,
): GeneratedArtifact {
  const bytes = tableCsvBytes(table, sources)
  return {
    media_type: "text/csv",
    byte_size: String(bytes.length),
    content_hash: artifactHash("research_package", bytes, schemaVersion),
  }
}

/**
 * Render the table for a reader, with the provenance column kept.
 *
 * The node hash is rendered in full rather than abbreviated. An abbreviation
 * would read better and would be a prefix of a digest presented where a digest
 * belongs, which is how a reader comes to compare two records by their first
 * twelve characters.
 */
export function renderTableMarkdown(
  table: StudyTable,
  sources: ReadonlyMap<string, TableValueSource>,
): string {
  const headers = csvHeaderFields(table)
  const escape = (value: string): string => value.replace(/\|/g, "\\|")
  const lines = [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ]
  for (const row of table.rows) {
    const index = cellsByColumn(row)
    const fields: string[] = []
    for (const column of table.columns) {
      const cell = index.get(column.column_id)
      if (cell === undefined) {
        throw new StudyTableRenderError(
          `Table ${table.table_id} row ${row.row_id} has no cell for column ${column.column_id}.`,
        )
      }
      if (column.role === "LABEL") {
        fields.push(cell.text ?? "")
        continue
      }
      const nodeHash = cell.node_hash
      const source = nodeHash === null ? undefined : sources.get(nodeHash)
      if (nodeHash === null || source === undefined) {
        throw new StudyTableRenderError(
          `Table ${table.table_id} row ${row.row_id} reads column ${column.column_id} from a node the package ` +
            "does not carry.",
        )
      }
      fields.push(renderCellValue(source.quantity))
      fields.push(nodeHash)
    }
    lines.push(`| ${fields.map(escape).join(" | ")} |`)
  }
  return `${lines.join("\n")}\n`
}

/**
 * Everything wrong with one table, addressed to where it is wrong.
 *
 * Six failures, each with its own fix. A column declared twice; a cell naming a
 * column that is not declared; a row missing a column that is; a value cell with
 * no node; a value cell whose node the package does not carry or which carries
 * no number at all; and a value whose unit is not the column's.
 *
 * That last one is the check a schema cannot make and a reader cannot see. Two
 * cells in one column, one in seconds and one in hours, are each individually
 * correct, and the column is what invites the comparison.
 */
export function tableFindings(
  table: StudyTable,
  sources: ReadonlyMap<string, TableValueSource>,
  index: number,
  section = "tables",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const at = (...parts: readonly (string | number)[]): string =>
    studyPath(section, index, ...parts)

  const columns = new Map<string, TableColumn>()
  table.columns.forEach((column, columnIndex) => {
    if (columns.has(column.column_id)) {
      findings.push(
        finding(
          "TABLE_SHAPE_MISMATCH",
          at("columns", columnIndex, "column_id"),
          `Column ${JSON.stringify(column.column_id)} is declared twice. A cell naming it has two columns to land ` +
            "in, and which one a renderer picks is a property of the renderer rather than of the table.",
        ),
      )
      return
    }
    columns.set(column.column_id, column)
  })

  const rowIds = new Set<string>()
  table.rows.forEach((row, rowIndex) => {
    if (rowIds.has(row.row_id)) {
      findings.push(
        finding(
          "REPORT_DUPLICATE_ID",
          at("rows", rowIndex, "row_id"),
          `Row id ${JSON.stringify(row.row_id)} appears twice in this table, so a figure naming it has two rows ` +
            "to read and the file does not say which.",
        ),
      )
    }
    rowIds.add(row.row_id)

    const seen = new Set<string>()
    row.cells.forEach((cell, cellIndex) => {
      const column = columns.get(cell.column_id)
      if (column === undefined) {
        findings.push(
          finding(
            "TABLE_SHAPE_MISMATCH",
            at("rows", rowIndex, "cells", cellIndex, "column_id"),
            `This cell names column ${JSON.stringify(cell.column_id)}, which the table does not declare. A cell ` +
              "with no column is a value with no heading, and a renderer either drops it or invents a place for it.",
          ),
        )
        return
      }
      if (seen.has(cell.column_id)) {
        findings.push(
          finding(
            "TABLE_SHAPE_MISMATCH",
            at("rows", rowIndex, "cells", cellIndex, "column_id"),
            `This row has two cells for column ${JSON.stringify(cell.column_id)}. One row, one column, one value.`,
          ),
        )
        return
      }
      seen.add(cell.column_id)

      if (column.role === "LABEL") {
        if (cell.text !== null) return
        findings.push(
          finding(
            "TABLE_SHAPE_MISMATCH",
            at("rows", rowIndex, "cells", cellIndex, "text"),
            `Column ${JSON.stringify(column.column_id)} is a label column and this cell carries a node instead of ` +
              "text. A node in a label column renders as whatever the renderer decides to show of it.",
          ),
        )
        return
      }

      if (cell.node_hash === null) {
        findings.push(
          finding(
            "TABLE_CELL_WITHOUT_NODE",
            at("rows", rowIndex, "cells", cellIndex, "node_hash"),
            `Column ${JSON.stringify(column.column_id)} is a value column and this cell names no node. A number ` +
              "typed into a table is indistinguishable, to every reader, from one that was measured -- which is " +
              "the whole reason a value cell is a reference and not a field.",
          ),
        )
        return
      }
      const source = sources.get(cell.node_hash)
      if (source === undefined) {
        findings.push(
          finding(
            "EVIDENCE_NODE_UNRESOLVED",
            at("rows", rowIndex, "cells", cellIndex, "node_hash"),
            `This cell reads node ${cell.node_hash}, and the package does not carry it. The cell renders as a ` +
              "number like any other, and a reader has no way to discover that it stands alone.",
          ),
        )
        return
      }
      if (source.quantity === null) {
        findings.push(
          finding(
            "RESULT_ROW_WITHOUT_VALUE",
            at("rows", rowIndex, "cells", cellIndex, "node_hash"),
            `This cell reads its value from the ${source.kind} node ${JSON.stringify(source.label)}, which carries ` +
              "no quantity. A value cell is a number in a table, and a cell whose node has no number is a label a " +
              "reader will still quote.",
          ),
        )
        return
      }
      if (column.unit !== null && source.quantity.unit !== column.unit) {
        findings.push(
          finding(
            "TABLE_SHAPE_MISMATCH",
            at("rows", rowIndex, "cells", cellIndex, "node_hash"),
            `The column is in ${JSON.stringify(column.unit)} and this node's quantity is in ` +
              `${JSON.stringify(source.quantity.unit)}. Both cells are correct on their own, and the column is ` +
              "what invites a reader to compare them.",
          ),
        )
      }
    })

    for (const column of table.columns) {
      if (seen.has(column.column_id)) continue
      findings.push(
        finding(
          "TABLE_SHAPE_MISMATCH",
          at("rows", rowIndex, "cells"),
          `This row has no cell for column ${JSON.stringify(column.column_id)}. A missing cell renders as a blank, ` +
            "which a reader reads as zero, as missing, or as not applicable, and the row does not say which.",
        ),
      )
    }
  })

  return findings
}

/**
 * Whether the recorded CSV artifact is the artifact these rows render to.
 *
 * Kept apart from `tableFindings` for three reasons that point the same way. It
 * needs the schema version, which is a property of the record rather than of the
 * table. It has to be skipped when the rows do not resolve, because there is
 * nothing to render and a digest mismatch reported on top of an unresolved node
 * sends a reader to the CSV when the problem is in the graph. And the builder
 * calls `tableFindings` on a table whose artifact does not exist yet -- it is
 * about to generate it -- so a shape check that also compared the artifact would
 * refuse every table on the way in.
 *
 * The size ceiling lives here too, because here is where the bytes exist.
 */
export function tableCsvArtifactFindings(
  table: StudyTable,
  sources: ReadonlyMap<string, TableValueSource>,
  schemaVersion: string,
  index: number,
  section = "tables",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const at = (...parts: readonly (string | number)[]): string =>
    studyPath(section, index, ...parts)
  const bytes = tableCsvBytes(table, sources)

  const overSize = limitFinding(
    at("csv_artifact", "byte_size"),
    "CSV bytes",
    bytes.length,
    STUDY_PACKAGE_LIMITS.max_csv_bytes,
  )
  if (overSize !== null) findings.push(overSize)

  if (String(bytes.length) !== table.csv_artifact.byte_size) {
    findings.push(
      finding(
        "TABLE_CSV_ARTIFACT_MISMATCH",
        at("csv_artifact", "byte_size"),
        `The table renders to ${bytes.length} bytes and the artifact records ${table.csv_artifact.byte_size}. ` +
          "The table and its file are one statement rendered twice, and this is them disagreeing.",
      ),
    )
  }

  const expected = artifactHash("research_package", bytes, schemaVersion)
  if (expected !== table.csv_artifact.content_hash) {
    findings.push(
      finding(
        "TABLE_CSV_ARTIFACT_MISMATCH",
        at("csv_artifact", "content_hash"),
        `The table renders to a CSV whose bytes hash to ${expected}, and the artifact claims ` +
          `${table.csv_artifact.content_hash}. Either the rows were edited after the file was generated, or the ` +
          "file was: the CSV is the copy that gets forwarded, so the two must be one statement.",
      ),
    )
  }
  return findings
}

/**
 * Table byte and count ceilings that need the whole list to check.
 *
 * The per-table CSV bound is in `tableFindings`, where the bytes already exist.
 * What is left is the caption and header text a producer controls without
 * bounding anything else, and the duplicate table id, which is the failure a
 * report reference cannot recover from: two tables under one id give
 * `table_ref` two answers.
 */
export function tableListFindings(
  tables: readonly StudyTable[],
  section = "tables",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const seen = new Set<string>()
  tables.forEach((table, index) => {
    if (seen.has(table.table_id)) {
      findings.push(
        finding(
          "REPORT_DUPLICATE_ID",
          studyPath(section, index, "table_id"),
          `Two tables share the id ${JSON.stringify(table.table_id)}. A report segment naming it has two tables ` +
            "to render, and which one it gets is a property of the renderer.",
        ),
      )
    }
    seen.add(table.table_id)
    const captionBytes = utf8ByteLength(table.caption)
    const overCaption = limitFinding(
      studyPath(section, index, "caption"),
      "caption bytes",
      captionBytes,
      STUDY_PACKAGE_LIMITS.max_report_bytes,
    )
    if (overCaption !== null) findings.push(overCaption)
  })
  return findings
}
