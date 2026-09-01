import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type GeneratedArtifact } from "./artifact.js";
import { type StudyFinding } from "./findings.js";
import { type StudyTable, type TableValueSource } from "./tables.js";
/**
 * A figure is a specification, never a picture (goal §14.3).
 *
 * The field this replaces was `svg: string`: markup, written by whoever
 * assembled the package, rendered into a surface the reader trusts. Two things
 * are wrong with that and only one of them is about security.
 *
 * The security half is the familiar one. SVG is a document format with script,
 * with `foreignObject`, with external references and with event handlers, so
 * rendering supplied SVG in a page that shows verified results is running the
 * package author's code beside the numbers it is meant to be evidence for.
 *
 * The half that matters more here is that **a picture is not checkable**. A
 * chart whose bars were drawn by hand agrees with nothing; a chart drawn from
 * the right numbers and a chart drawn from invented ones are the same kind of
 * object, and no digest over the markup can tell them apart. A specification
 * whose points name evidence nodes can be checked: every coordinate resolves to
 * a record the package carries, and a reader can walk from a bar back to what
 * was measured.
 *
 * So a figure carries a spec. A pre-rendered SVG may still travel, and when it
 * does it travels the way every other opaque file in this family travels: it is
 * checked against the subset below, stored outside the trusted surface, and
 * named by content hash. What it may not do is arrive as a string in a field
 * and be rendered because it was in the package.
 */
export declare const FigureKindSchema: z.ZodEnum<["LINE", "BAR", "SCATTER"]>;
export type FigureKind = z.infer<typeof FigureKindSchema>;
/**
 * Where a coordinate is read from.
 *
 * A node directly, or a cell of a table this package carries -- which is the
 * "or result rows" half of the rule, and it is not redundant with the first:
 * a figure plotting a column of a results table should say so, because then
 * re-ordering the table re-orders the figure and the two cannot drift into
 * disagreeing about which number is which.
 *
 * Flat with a discriminant rather than a union of shapes, in the idiom
 * `ClaimValueRef` uses, so the canonical projection reads one declared shape
 * for the field rather than choosing one from the data.
 */
export declare const FigureValueRefKindSchema: z.ZodEnum<["NODE", "TABLE_CELL"]>;
export type FigureValueRefKind = z.infer<typeof FigureValueRefKindSchema>;
export interface FigureValueRef {
    kind: FigureValueRefKind;
    node_hash: string | null;
    table_id: string | null;
    row_id: string | null;
    column_id: string | null;
}
export declare const FigureValueRefSchema: Contract<FigureValueRef>;
export interface FigurePoint {
    x: FigureValueRef;
    y: FigureValueRef;
}
export declare const FigurePointSchema: Contract<FigurePoint>;
export interface FigureSeries {
    series_id: string;
    label: string;
    points: FigurePoint[];
}
export declare const FigureSeriesSchema: Contract<FigureSeries>;
export interface FigureAxis {
    label: string;
    unit: string | null;
}
export declare const FigureAxisSchema: Contract<FigureAxis>;
export interface FigureSpec {
    kind: FigureKind;
    x_axis: FigureAxis;
    y_axis: FigureAxis;
    series: FigureSeries[];
}
export declare const FigureSpecSchema: Contract<FigureSpec>;
export interface StudyFigure {
    figure_id: string;
    title: string;
    caption: string;
    spec: FigureSpec;
    svg_artifact: GeneratedArtifact | null;
}
export declare const StudyFigureSchema: Contract<StudyFigure>;
export interface SvgSanitization {
    readonly ok: boolean;
    readonly bytes: Uint8Array | null;
    readonly findings: readonly StudyFinding[];
}
/**
 * Check supplied SVG against the subset this family will store, and refuse it
 * otherwise.
 *
 * **This refuses; it does not rewrite.** A sanitizer that strips is a small
 * parser competing with a browser's, and the browser wins every disagreement --
 * which is how "the dangerous parts were removed" becomes a sentence in a
 * post-mortem. Refusing needs to be right about what is dangerous only in the
 * direction that costs a producer a re-export, and the producer can see what
 * was refused and why.
 *
 * The refused set, each with the code the goal names it under:
 *
 * - `script` elements, `javascript:` URIs, and numeric character references,
 *   which are how a refused token is spelled without being written;
 * - `foreignObject`, `iframe`, `embed` and `object`, which embed a document the
 *   SVG rules do not govern;
 * - external references of any scheme, including `data:`, and markup
 *   declarations, because an entity declaration is an external reference with a
 *   different syntax;
 * - event handler attributes;
 * - any element outside `PERMITTED_SVG_ELEMENTS`, which is the backstop that
 *   makes the four checks above a courtesy rather than the whole defence.
 *
 * Every finding is reported, not just the first: an author fixing a figure
 * should learn everything wrong with it in one pass.
 */
export declare function sanitizeStudySvg(svg: string, path?: string): SvgSanitization;
/** A table cell's address, in the one spelling both a figure and an index use. */
export declare function tableCellKey(tableId: string, rowId: string, columnId: string): string;
/**
 * Every value cell in every table, addressed the way a figure addresses one.
 *
 * Built once per verification rather than searched per point: a figure with
 * four thousand points over a table with five thousand rows is a scan a
 * recipient should not be made to run twenty million times because the data
 * arrived in a list.
 */
export declare function indexTableCells(tables: readonly StudyTable[]): ReadonlyMap<string, string>;
/** The node a reference resolves to, or null when it resolves to nothing. */
export declare function resolveFigureValueRef(ref: FigureValueRef, cells: ReadonlyMap<string, string>): string | null;
/**
 * Everything wrong with one figure, addressed to where it is wrong.
 *
 * A point that resolves to nothing is the finding this exists for, and it is
 * the figure's version of a table cell with no node: a chart drawn from
 * coordinates nobody can open is a picture, and a reader cannot tell it from
 * one drawn from measurements.
 */
export declare function figureFindings(figure: StudyFigure, sources: ReadonlyMap<string, TableValueSource>, cells: ReadonlyMap<string, string>, index: number, section?: string): StudyFinding[];
/** Duplicate figure ids, which give a `figure_ref` two answers. */
export declare function figureListFindings(figures: readonly StudyFigure[], section?: string): StudyFinding[];
/**
 * The reviewed renderer: a picture built from the spec, in this file, reviewed
 * as code.
 *
 * This is the other half of the rule. Refusing supplied SVG is only tenable if
 * a study can still have a figure, so the family draws one -- deliberately
 * plain, deliberately small, and deliberately with no way for data to become
 * markup: every value that reaches the output goes through `coordinate` or
 * `escapeSvgText`, and every element it emits is in `PERMITTED_SVG_ELEMENTS`.
 *
 * A point whose value does not resolve, or which is UNKNOWN, is omitted rather
 * than drawn at zero, and the omission is visible as a gap. `figureFindings`
 * has already refused the package in that case; this is what the renderer does
 * if it is called anyway, and it is the safe direction to fail in.
 */
export declare function renderFigureSvg(figure: StudyFigure, sources: ReadonlyMap<string, TableValueSource>, cells: ReadonlyMap<string, string>): string;
/**
 * A figure's caption with its plotted values spelled out, for a text rendering.
 *
 * A report rendered to Markdown cannot show a chart, and the honest fallback is
 * the numbers rather than a placeholder: a reader of the text rendering sees the
 * same values the chart was drawn from, in the same order, each one having come
 * from the same node.
 */
export declare function renderFigureSummary(figure: StudyFigure, sources: ReadonlyMap<string, TableValueSource>, cells: ReadonlyMap<string, string>): string;
//# sourceMappingURL=figures.d.ts.map