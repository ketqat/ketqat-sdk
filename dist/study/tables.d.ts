import { z } from "zod";
import type { Contract, Quantity } from "../intelligence/measurement.js";
import { type GeneratedArtifact } from "./artifact.js";
import { type StudyFinding } from "./findings.js";
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
export declare const TableRoleSchema: z.ZodEnum<["ASSUMPTIONS", "RESULTS", "OTHER"]>;
export type TableRole = z.infer<typeof TableRoleSchema>;
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
export declare const TableColumnRoleSchema: z.ZodEnum<["LABEL", "VALUE"]>;
export type TableColumnRole = z.infer<typeof TableColumnRoleSchema>;
export interface TableColumn {
    column_id: string;
    header: string;
    role: TableColumnRole;
    unit: string | null;
}
export declare const TableColumnSchema: Contract<TableColumn>;
export interface TableCell {
    column_id: string;
    text: string | null;
    node_hash: string | null;
}
export declare const TableCellSchema: Contract<TableCell>;
export interface TableRow {
    row_id: string;
    cells: TableCell[];
}
export declare const TableRowSchema: Contract<TableRow>;
export interface StudyTable {
    table_id: string;
    caption: string;
    role: TableRole;
    columns: TableColumn[];
    rows: TableRow[];
    csv_artifact: GeneratedArtifact;
}
export declare const StudyTableSchema: Contract<StudyTable>;
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
    readonly kind: string;
    readonly label: string;
    readonly quantity: Quantity | null;
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
export declare function renderCellValue(quantity: Quantity | null): string;
/** Raised when a table is rendered before it has been checked. */
export declare class StudyTableRenderError extends Error {
    constructor(message: string);
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
export declare function renderTableCsv(table: StudyTable, sources: ReadonlyMap<string, TableValueSource>): string;
/** The CSV as the bytes that are hashed, which is what an artifact digest is over. */
export declare function tableCsvBytes(table: StudyTable, sources: ReadonlyMap<string, TableValueSource>): Uint8Array;
/**
 * The artifact record for a table's CSV, computed rather than asserted.
 *
 * The builder calls this and stores the result; the verifier calls it again and
 * compares. One function, two callers, so there is no path on which a package
 * is written with a digest nothing recomputed.
 */
export declare function tableCsvArtifact(table: StudyTable, sources: ReadonlyMap<string, TableValueSource>, schemaVersion: string): GeneratedArtifact;
/**
 * Render the table for a reader, with the provenance column kept.
 *
 * The node hash is rendered in full rather than abbreviated. An abbreviation
 * would read better and would be a prefix of a digest presented where a digest
 * belongs, which is how a reader comes to compare two records by their first
 * twelve characters.
 */
export declare function renderTableMarkdown(table: StudyTable, sources: ReadonlyMap<string, TableValueSource>): string;
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
export declare function tableFindings(table: StudyTable, sources: ReadonlyMap<string, TableValueSource>, index: number, section?: string): StudyFinding[];
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
export declare function tableCsvArtifactFindings(table: StudyTable, sources: ReadonlyMap<string, TableValueSource>, schemaVersion: string, index: number, section?: string): StudyFinding[];
/**
 * Table byte and count ceilings that need the whole list to check.
 *
 * The per-table CSV bound is in `tableFindings`, where the bytes already exist.
 * What is left is the caption and header text a producer controls without
 * bounding anything else, and the duplicate table id, which is the failure a
 * report reference cannot recover from: two tables under one id give
 * `table_ref` two answers.
 */
export declare function tableListFindings(tables: readonly StudyTable[], section?: string): StudyFinding[];
//# sourceMappingURL=tables.d.ts.map