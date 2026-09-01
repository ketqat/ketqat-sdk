import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { GeneratedArtifactSchema, type GeneratedArtifact } from "./artifact.js"
import { ContentHashSchema } from "./common.js"
import { finding, studyPath, type StudyFinding } from "./findings.js"
import { STUDY_PACKAGE_LIMITS, limitFinding } from "./package-limits.js"
import { renderCellValue, type StudyTable, type TableValueSource } from "./tables.js"

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

export const FigureKindSchema = z.enum(["LINE", "BAR", "SCATTER"])
export type FigureKind = z.infer<typeof FigureKindSchema>

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
export const FigureValueRefKindSchema = z.enum(["NODE", "TABLE_CELL"])
export type FigureValueRefKind = z.infer<typeof FigureValueRefKindSchema>

export interface FigureValueRef {
  kind: FigureValueRefKind
  node_hash: string | null
  table_id: string | null
  row_id: string | null
  column_id: string | null
}

export const FigureValueRefSchema: Contract<FigureValueRef> = z
  .object({
    kind: FigureValueRefKindSchema,
    node_hash: ContentHashSchema.nullable(),
    table_id: z.string().min(1).max(64).nullable(),
    row_id: z.string().min(1).max(64).nullable(),
    column_id: z.string().min(1).max(64).nullable(),
  })
  .strict()
  .superRefine((ref, context) => {
    if (ref.kind === "NODE") {
      if (ref.node_hash === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A NODE reference must name the node. A coordinate that names nothing is a number nobody wrote.",
          path: ["node_hash"],
        })
      }
      for (const key of ["table_id", "row_id", "column_id"] as const) {
        if (ref[key] === null) continue
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A NODE reference reads from a node, so ${key} has nothing to address. Two ways of naming one ` +
            "coordinate are two coordinates the moment they disagree.",
          path: [key],
        })
      }
      return
    }
    if (ref.node_hash !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A TABLE_CELL reference reads through the table, which names the node. Naming both puts two answers in " +
          "one reference, and a renderer uses whichever it looks at first.",
        path: ["node_hash"],
      })
    }
    for (const key of ["table_id", "row_id", "column_id"] as const) {
      if (ref[key] !== null) continue
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A TABLE_CELL reference must name ${key}: a cell is addressed by all three.`,
        path: [key],
      })
    }
  }) as unknown as Contract<FigureValueRef>

export interface FigurePoint {
  x: FigureValueRef
  y: FigureValueRef
}

export const FigurePointSchema: Contract<FigurePoint> = z
  .object({ x: FigureValueRefSchema, y: FigureValueRefSchema })
  .strict()

export interface FigureSeries {
  series_id: string
  label: string
  points: FigurePoint[]
}

export const FigureSeriesSchema: Contract<FigureSeries> = z
  .object({
    series_id: z.string().min(1).max(64),
    label: z.string().min(1).max(256),
    /** At least one point: a series with none is a legend entry for nothing. */
    points: z.array(FigurePointSchema).min(1).max(4096),
  })
  .strict()

export interface FigureAxis {
  label: string
  unit: string | null
}

export const FigureAxisSchema: Contract<FigureAxis> = z
  .object({
    label: z.string().min(1).max(256),
    /** What the axis is in. Null for a categorical axis, where the values are labels. */
    unit: z.string().min(1).max(64).nullable(),
  })
  .strict()

export interface FigureSpec {
  kind: FigureKind
  x_axis: FigureAxis
  y_axis: FigureAxis
  series: FigureSeries[]
}

export const FigureSpecSchema: Contract<FigureSpec> = z
  .object({
    kind: FigureKindSchema,
    x_axis: FigureAxisSchema,
    y_axis: FigureAxisSchema,
    series: z.array(FigureSeriesSchema).min(1).max(64),
  })
  .strict()

export interface StudyFigure {
  figure_id: string
  title: string
  caption: string
  spec: FigureSpec
  svg_artifact: GeneratedArtifact | null
}

export const StudyFigureSchema: Contract<StudyFigure> = z
  .object({
    figure_id: z.string().min(1).max(64),
    title: z.string().min(1).max(256),
    /** What the figure shows and what it does not. Prose about a chart, never a number in one. */
    caption: z.string().min(1).max(2048),
    spec: FigureSpecSchema,
    /**
     * A pre-rendered SVG, by digest rather than by content.
     *
     * Null is the ordinary case: the reviewed renderer draws the figure from the
     * spec, and there is nothing to store. When a study has a picture that no
     * renderer here produces -- a photograph of an apparatus, a diagram somebody
     * drew -- it is checked against `sanitizeStudySvg`, stored outside the
     * package, and named here. The bytes are never inlined in a field a trusted
     * surface might render, which is the whole distinction: an artifact is
     * something a reader chooses to open, and a field is something a page shows.
     */
    svg_artifact: GeneratedArtifactSchema.nullable(),
  })
  .strict()

/**
 * The elements this family will render.
 *
 * An allowlist, for the projection's reason: a denylist has to be right about
 * every element name that will ever exist, including the ones added after this
 * was written. `foreignObject` and `script` are checked separately and before
 * this, so that the two failures the goal names get their own codes rather than
 * arriving as "some element".
 */
const PERMITTED_SVG_ELEMENTS: readonly string[] = Object.freeze([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "marker",
])

const permittedSvgElements = new Set<string>(PERMITTED_SVG_ELEMENTS)

/** Every `<name` and `</name` in the document, in the order they appear. */
const ELEMENT_NAME = /<\s*\/?\s*([A-Za-z_][A-Za-z0-9_.:-]*)/g

/** `onclick=`, `onload=`, and every other handler attribute, whatever the spacing. */
const EVENT_HANDLER = /[\s"'`]on[a-zA-Z-]+\s*=/

/**
 * URL schemes and scheme-relative references that leave the document.
 *
 * `data:` is here with the network ones on purpose. A `data:` URI is not a
 * fetch, and it is the standard way to smuggle a second document -- an SVG with
 * a script in it -- into an `<image>` that a naive check reads as inert.
 */
const EXTERNAL_REFERENCE = /(?:https?:|ftp:|file:|data:|\/\/)/i

/**
 * The one URL an SVG must carry, and the only one exempted.
 *
 * A standalone SVG file is not an SVG without `xmlns="http://www.w3.org/2000/svg"`,
 * so a check that refused every URL would refuse every valid document. The
 * exemption is written as the exact declaration rather than as "URLs in xmlns
 * attributes": the namespace is a fixed string, and matching the string is what
 * keeps this from becoming a hole shaped like an attribute name.
 */
const SVG_NAMESPACE_DECLARATION =
  /\sxmlns(?::[A-Za-z][A-Za-z0-9_.-]*)?\s*=\s*"http:\/\/www\.w3\.org\/2000\/svg"/g

const SCRIPT_ELEMENT = /<\s*script[\s>/]/i
const FOREIGN_OBJECT = /<\s*(?:foreignObject|iframe|embed|object)[\s>/]/i
const MARKUP_DECLARATION = /<\s*(?:!|\?)/
const NUMERIC_CHARACTER_REFERENCE = /&#/
const JAVASCRIPT_URI = /javascript\s*:/i

export interface SvgSanitization {
  readonly ok: boolean
  readonly bytes: Uint8Array | null
  readonly findings: readonly StudyFinding[]
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
export function sanitizeStudySvg(svg: string, path = studyPath("svg")): SvgSanitization {
  const findings: StudyFinding[] = []

  if (SCRIPT_ELEMENT.test(svg)) {
    findings.push(
      finding(
        "SVG_SCRIPT_REFUSED",
        path,
        "This SVG carries a script element. Script in a document rendered beside verified results runs with the " +
          "reader's authority over the page that is telling them what has been checked.",
      ),
    )
  }
  if (JAVASCRIPT_URI.test(svg)) {
    findings.push(
      finding(
        "SVG_SCRIPT_REFUSED",
        path,
        "This SVG carries a `javascript:` URI, which is a script element written as an attribute.",
      ),
    )
  }
  if (NUMERIC_CHARACTER_REFERENCE.test(svg)) {
    findings.push(
      finding(
        "SVG_SCRIPT_REFUSED",
        path,
        "This SVG carries a numeric character reference (`&#`). A parser resolves it and a scanner does not, " +
          "which is how a refused token is written without being spelled -- so the spelling is refused too. Use " +
          "the literal character.",
      ),
    )
  }
  if (FOREIGN_OBJECT.test(svg)) {
    findings.push(
      finding(
        "SVG_FOREIGN_OBJECT_REFUSED",
        path,
        "This SVG embeds a foreign document (`foreignObject`, `iframe`, `embed` or `object`). Everything inside " +
          "one is governed by rules other than the SVG rules this check applies, so checking the SVG says nothing " +
          "about it.",
      ),
    )
  }
  // The namespace declaration is removed before the scan rather than exempted
  // inside it: a scan that skipped "URLs that appear in an xmlns attribute"
  // would be reasoning about attribute names, and an attacker chooses those.
  const withoutNamespace = svg.replace(SVG_NAMESPACE_DECLARATION, " ")
  if (EXTERNAL_REFERENCE.test(withoutNamespace)) {
    findings.push(
      finding(
        "SVG_EXTERNAL_REFERENCE_REFUSED",
        path,
        "This SVG references something outside itself. A figure that fetches at render time shows whatever the " +
          "other end serves today, so two readers of one package see two pictures and neither can tell. `data:` " +
          "is refused with the network schemes because it carries a second document rather than a fetch.",
      ),
    )
  }
  if (MARKUP_DECLARATION.test(svg)) {
    findings.push(
      finding(
        "SVG_EXTERNAL_REFERENCE_REFUSED",
        path,
        "This SVG carries a markup declaration or processing instruction (`<!` or `<?`). An entity declaration is " +
          "an external reference written in another syntax, and a processing instruction is an instruction to " +
          "something other than the renderer.",
      ),
    )
  }
  if (EVENT_HANDLER.test(svg)) {
    findings.push(
      finding(
        "SVG_EVENT_HANDLER_REFUSED",
        path,
        "This SVG carries an event handler attribute. A handler is script that runs when a reader moves a mouse " +
          "over a figure.",
      ),
    )
  }

  const seenElements = new Set<string>()
  for (const match of svg.matchAll(ELEMENT_NAME)) {
    const name = match[1] ?? ""
    const local = name.includes(":") ? (name.split(":").pop() ?? name) : name
    if (permittedSvgElements.has(local)) continue
    if (seenElements.has(local)) continue
    seenElements.add(local)
    findings.push(
      finding(
        "SVG_ELEMENT_NOT_PERMITTED",
        path,
        `This SVG uses the element ${JSON.stringify(local)}, which is outside the subset this family stores. ` +
          `Permitted: ${PERMITTED_SVG_ELEMENTS.join(", ")}. The list is an allowlist for the projection's reason ` +
          "-- a denylist would have to be right about every element name that will ever exist.",
      ),
    )
  }

  if (findings.length > 0) return { ok: false, bytes: null, findings: Object.freeze(findings) }

  const bytes = new TextEncoder().encode(svg)
  const overSize = limitFinding(path, "SVG bytes", bytes.length, STUDY_PACKAGE_LIMITS.max_svg_bytes)
  if (overSize !== null) return { ok: false, bytes: null, findings: Object.freeze([overSize]) }
  return { ok: true, bytes, findings: Object.freeze([]) }
}

/** A table cell's address, in the one spelling both a figure and an index use. */
export function tableCellKey(tableId: string, rowId: string, columnId: string): string {
  return `${tableId}\u0000${rowId}\u0000${columnId}`
}

/**
 * Every value cell in every table, addressed the way a figure addresses one.
 *
 * Built once per verification rather than searched per point: a figure with
 * four thousand points over a table with five thousand rows is a scan a
 * recipient should not be made to run twenty million times because the data
 * arrived in a list.
 */
export function indexTableCells(tables: readonly StudyTable[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>()
  for (const table of tables) {
    const valueColumns = new Set(
      table.columns.filter((column) => column.role === "VALUE").map((column) => column.column_id),
    )
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (!valueColumns.has(cell.column_id) || cell.node_hash === null) continue
        const key = tableCellKey(table.table_id, row.row_id, cell.column_id)
        if (!index.has(key)) index.set(key, cell.node_hash)
      }
    }
  }
  return index
}

/** The node a reference resolves to, or null when it resolves to nothing. */
export function resolveFigureValueRef(
  ref: FigureValueRef,
  cells: ReadonlyMap<string, string>,
): string | null {
  if (ref.kind === "NODE") return ref.node_hash
  if (ref.table_id === null || ref.row_id === null || ref.column_id === null) return null
  return cells.get(tableCellKey(ref.table_id, ref.row_id, ref.column_id)) ?? null
}

/**
 * Everything wrong with one figure, addressed to where it is wrong.
 *
 * A point that resolves to nothing is the finding this exists for, and it is
 * the figure's version of a table cell with no node: a chart drawn from
 * coordinates nobody can open is a picture, and a reader cannot tell it from
 * one drawn from measurements.
 */
export function figureFindings(
  figure: StudyFigure,
  sources: ReadonlyMap<string, TableValueSource>,
  cells: ReadonlyMap<string, string>,
  index: number,
  section = "figures",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const at = (...parts: readonly (string | number)[]): string =>
    studyPath(section, index, ...parts)

  const seriesIds = new Set<string>()
  figure.spec.series.forEach((series, seriesIndex) => {
    if (seriesIds.has(series.series_id)) {
      findings.push(
        finding(
          "REPORT_DUPLICATE_ID",
          at("spec", "series", seriesIndex, "series_id"),
          `Two series in this figure share the id ${JSON.stringify(series.series_id)}, so a legend has two ` +
            "entries a reader cannot tell apart and a renderer draws whichever it reaches.",
        ),
      )
    }
    seriesIds.add(series.series_id)

    series.points.forEach((point, pointIndex) => {
      for (const axis of ["x", "y"] as const) {
        const ref = point[axis]
        const nodeHash = resolveFigureValueRef(ref, cells)
        const where = at("spec", "series", seriesIndex, "points", pointIndex, axis)
        if (nodeHash === null) {
          findings.push(
            finding(
              "FIGURE_POINT_UNRESOLVED",
              where,
              ref.kind === "NODE"
                ? "This coordinate names no node, so the point was drawn from a number the package does not carry."
                : `This coordinate reads table ${JSON.stringify(ref.table_id ?? "")} row ` +
                  `${JSON.stringify(ref.row_id ?? "")} column ${JSON.stringify(ref.column_id ?? "")}, and no ` +
                  "value cell in this package has that address.",
            ),
          )
          continue
        }
        const source = sources.get(nodeHash)
        if (source === undefined) {
          findings.push(
            finding(
              "FIGURE_POINT_UNRESOLVED",
              where,
              `This coordinate reads node ${nodeHash}, and the package does not carry it. A chart drawn from ` +
                "coordinates a reader cannot open is a picture, and it renders exactly like one drawn from " +
                "measurements.",
            ),
          )
          continue
        }
        if (source.quantity !== null) continue
        findings.push(
          finding(
            "FIGURE_POINT_UNRESOLVED",
            where,
            `This coordinate reads the ${source.kind} node ${JSON.stringify(source.label)}, which carries no ` +
              "quantity. There is no number at that address for the renderer to plot.",
          ),
        )
      }
    })
  })

  if (figure.svg_artifact !== null) {
    const declared = Number(figure.svg_artifact.byte_size)
    const overSize = limitFinding(
      at("svg_artifact", "byte_size"),
      "declared SVG bytes",
      Number.isFinite(declared) ? declared : STUDY_PACKAGE_LIMITS.max_svg_bytes + 1,
      STUDY_PACKAGE_LIMITS.max_svg_bytes,
    )
    if (overSize !== null) findings.push(overSize)
  }

  return findings
}

/** Duplicate figure ids, which give a `figure_ref` two answers. */
export function figureListFindings(
  figures: readonly StudyFigure[],
  section = "figures",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  const seen = new Set<string>()
  figures.forEach((figure, index) => {
    if (seen.has(figure.figure_id)) {
      findings.push(
        finding(
          "REPORT_DUPLICATE_ID",
          studyPath(section, index, "figure_id"),
          `Two figures share the id ${JSON.stringify(figure.figure_id)}. A report segment naming it has two ` +
            "figures to render.",
        ),
      )
    }
    seen.add(figure.figure_id)
  })
  return findings
}

/**
 * A coordinate for the renderer, or nothing.
 *
 * `UNKNOWN` is deliberately unplottable. A missing value drawn at zero is the
 * most consequential lie a chart can tell, because it is invisible: the line
 * goes to the floor and the reader concludes the quantity is small rather than
 * unmeasured.
 */
function plottableValue(
  ref: FigureValueRef,
  cells: ReadonlyMap<string, string>,
  sources: ReadonlyMap<string, TableValueSource>,
): number | null {
  const nodeHash = resolveFigureValueRef(ref, cells)
  if (nodeHash === null) return null
  const source = sources.get(nodeHash)
  if (source === undefined || source.quantity === null) return null
  return source.quantity.value
}

/** Fixed-precision coordinates, so one spec renders to one picture. */
function coordinate(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3)
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const WIDTH = 640
const HEIGHT = 400
const MARGIN = { top: 32, right: 24, bottom: 56, left: 72 }

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
export function renderFigureSvg(
  figure: StudyFigure,
  sources: ReadonlyMap<string, TableValueSource>,
  cells: ReadonlyMap<string, string>,
): string {
  const plotted = figure.spec.series.map((series) => ({
    series,
    points: series.points
      .map((point) => ({
        x: plottableValue(point.x, cells, sources),
        y: plottableValue(point.y, cells, sources),
      }))
      .filter((point): point is { x: number; y: number } => point.x !== null && point.y !== null),
  }))

  const xs = plotted.flatMap((entry) => entry.points.map((point) => point.x))
  const ys = plotted.flatMap((entry) => entry.points.map((point) => point.y))
  // A single point, or a series that is flat, would otherwise divide by zero.
  // Widening the range by one unit draws it in the middle of the axis, which is
  // where a reader expects a constant to sit.
  const xMin = xs.length > 0 ? Math.min(...xs) : 0
  const xMax = xs.length > 0 ? Math.max(...xs) : 1
  const yMin = ys.length > 0 ? Math.min(...ys) : 0
  const yMax = ys.length > 0 ? Math.max(...ys) : 1
  const xSpan = xMax - xMin === 0 ? 1 : xMax - xMin
  const ySpan = yMax - yMin === 0 ? 1 : yMax - yMin
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const toX = (value: number): number => MARGIN.left + ((value - xMin) / xSpan) * plotWidth
  const toY = (value: number): number =>
    MARGIN.top + plotHeight - ((value - yMin) / ySpan) * plotHeight

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" ` +
      `aria-label="${escapeSvgText(figure.title)}">`,
  )
  parts.push(`<title>${escapeSvgText(figure.title)}</title>`)
  parts.push(`<desc>${escapeSvgText(figure.caption)}</desc>`)
  parts.push(
    `<line x1="${coordinate(MARGIN.left)}" y1="${coordinate(MARGIN.top + plotHeight)}" ` +
      `x2="${coordinate(MARGIN.left + plotWidth)}" y2="${coordinate(MARGIN.top + plotHeight)}" ` +
      `stroke="currentColor" stroke-width="1"/>`,
  )
  parts.push(
    `<line x1="${coordinate(MARGIN.left)}" y1="${coordinate(MARGIN.top)}" ` +
      `x2="${coordinate(MARGIN.left)}" y2="${coordinate(MARGIN.top + plotHeight)}" ` +
      `stroke="currentColor" stroke-width="1"/>`,
  )

  const axisLabel = (axis: FigureAxis): string =>
    axis.unit === null ? axis.label : `${axis.label} (${axis.unit})`
  parts.push(
    `<text x="${coordinate(MARGIN.left + plotWidth / 2)}" y="${coordinate(HEIGHT - 16)}" ` +
      `text-anchor="middle" font-size="12">${escapeSvgText(axisLabel(figure.spec.x_axis))}</text>`,
  )
  parts.push(
    `<text x="16" y="${coordinate(MARGIN.top + plotHeight / 2)}" text-anchor="middle" font-size="12" ` +
      `transform="rotate(-90 16 ${coordinate(MARGIN.top + plotHeight / 2)})">` +
      `${escapeSvgText(axisLabel(figure.spec.y_axis))}</text>`,
  )

  const barWidth = plotted.length === 0 ? 0 : Math.max(2, plotWidth / (xs.length || 1) / 2)
  for (const entry of plotted) {
    if (figure.spec.kind === "LINE") {
      const points = entry.points
        .map((point) => `${coordinate(toX(point.x))},${coordinate(toY(point.y))}`)
        .join(" ")
      if (points !== "") {
        parts.push(
          `<polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${points}"/>`,
        )
      }
      continue
    }
    for (const point of entry.points) {
      if (figure.spec.kind === "SCATTER") {
        parts.push(
          `<circle cx="${coordinate(toX(point.x))}" cy="${coordinate(toY(point.y))}" r="3" ` +
            `fill="currentColor"/>`,
        )
        continue
      }
      const top = toY(point.y)
      const base = MARGIN.top + plotHeight
      parts.push(
        `<rect x="${coordinate(toX(point.x) - barWidth / 2)}" y="${coordinate(Math.min(top, base))}" ` +
          `width="${coordinate(barWidth)}" height="${coordinate(Math.abs(base - top))}" ` +
          `fill="currentColor"/>`,
      )
    }
    parts.push(
      `<desc>${escapeSvgText(`${entry.series.label}: ${entry.points.length} plotted points`)}</desc>`,
    )
  }

  parts.push("</svg>")
  return parts.join("")
}

/**
 * A figure's caption with its plotted values spelled out, for a text rendering.
 *
 * A report rendered to Markdown cannot show a chart, and the honest fallback is
 * the numbers rather than a placeholder: a reader of the text rendering sees the
 * same values the chart was drawn from, in the same order, each one having come
 * from the same node.
 */
export function renderFigureSummary(
  figure: StudyFigure,
  sources: ReadonlyMap<string, TableValueSource>,
  cells: ReadonlyMap<string, string>,
): string {
  const lines = [`**${figure.title}** -- ${figure.caption}`]
  for (const series of figure.spec.series) {
    const rendered = series.points
      .map((point) => {
        const xHash = resolveFigureValueRef(point.x, cells)
        const yHash = resolveFigureValueRef(point.y, cells)
        const x = xHash === null ? null : (sources.get(xHash)?.quantity ?? null)
        const y = yHash === null ? null : (sources.get(yHash)?.quantity ?? null)
        return `(${renderCellValue(x)}, ${renderCellValue(y)})`
      })
      .join(" ")
    lines.push(`- ${series.label}: ${rendered}`)
  }
  return lines.join("\n")
}
