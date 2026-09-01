import { z } from "zod"
import type { Citation } from "../contracts/common.js"
import type { Contract, Quantity } from "../intelligence/measurement.js"
import { ContentHashSchema } from "./common.js"
import { finding, studyPath, type StudyFinding } from "./findings.js"
import {
  indexTableCells,
  renderFigureSummary,
  type StudyFigure,
} from "./figures.js"
import { STUDY_PACKAGE_LIMITS, limitFinding, utf8ByteLength } from "./package-limits.js"
import { SafeIntegerSchema } from "./values.js"
import {
  renderCellValue,
  renderTableMarkdown,
  type StudyTable,
  type TableValueSource,
} from "./tables.js"

/**
 * A verified report is generated, not typed (goal §14.2).
 *
 * The field this replaces was `report_markdown: string`, and hashing it
 * established one thing: that nobody edited the prose after it was written. It
 * established nothing whatever about the prose. A sentence reading "the base
 * scenario needs 4.2 million physical qubits" hashes exactly as well when the
 * study measured 42 million, or measured nothing at all, and the reader has no
 * way to tell -- the number sits in a paragraph, looking like every other
 * number in the document, and the paragraph carries a digest.
 *
 * That is the failure this family exists to prevent, arriving through the one
 * surface everybody actually reads.
 *
 * So a verified section is a list of typed segments, and the number-bearing
 * ones are references. A quantity segment names an evidence node and renders
 * the node's value; a claim segment names a claim node; a table or figure
 * segment names a structure that was itself generated from nodes. There is no
 * segment that carries a number as text, because a segment that could would be
 * the whole of the old failure preserved inside the new structure.
 *
 * Prose stays, in two places and with different standing. Inside a verified
 * section it is prose *about* numbers rather than prose *containing* them, and
 * `UNGROUNDED_NUMBER` below is the mechanical rule that keeps it that way. Outside
 * it, `commentary` holds whatever an author wants to say, unrestricted and
 * plainly labelled -- and structurally unable to enter a verified section,
 * because it is a different field with a different type and the renderer puts
 * it under its own heading.
 */

/**
 * A digit that is standing on its own as a number.
 *
 * The rule, stated exactly: **a digit may appear inside a name and never as a
 * number.** A digit is permitted when the character before it is a letter, a
 * digit, a dot, an underscore or a hyphen -- which is what makes `Shor-2048`,
 * `RSA2048`, `v1.2` and `surface-17` ordinary words -- and refused otherwise,
 * which is what makes `4.2 million`, `distance 21` and `0.1%` references
 * instead.
 *
 * Two properties matter more than the rule's elegance.
 *
 * It is **mechanical**, so a reviewer does not have to notice. The failure
 * being prevented is a number that looks exactly like every other number, and a
 * check that depended on somebody spotting it would be the same check that
 * already fails today.
 *
 * It is **the same expression in both languages**. The lookbehind is one
 * character wide, which Python's `re` accepts and JavaScript's has supported
 * for years, so TypeScript and Python refuse the same sentences rather than two
 * overlapping sets of them.
 *
 * What it deliberately does not cover: a number spelled in words. "Four point
 * two million" passes, and no expression refuses it without refusing English.
 * That is a residual risk carried knowingly, and it is a smaller one -- a
 * spelled-out figure is conspicuous in a technical report in a way `4.2` is
 * not, and the reviewer who reads the sentence is the mitigation.
 */
const UNGROUNDED_NUMBER = /(?<![A-Za-z0-9._-])[0-9]/

export function containsUngroundedNumber(text: string): boolean {
  return UNGROUNDED_NUMBER.test(text)
}

export const StudyReportSegmentKindSchema = z.enum([
  /** A heading, with a level. Navigation, not assertion. */
  "HEADING",
  /** Prose about the results. Subject to the grounding rule above. */
  "PROSE",
  /** A claim node, rendered as the sentence the study asserts. */
  "CLAIM_REF",
  /** A quantity node, rendered as its value and unit. This is how a number reaches a section. */
  "QUANTITY_REF",
  /** One of the package's citations, by position in `references`. */
  "CITATION_REF",
  /** One of the package's limitations, by position in `limitations`. */
  "LIMITATION_REF",
  /** A table, rendered from its rows. */
  "TABLE_REF",
  /** A figure, rendered from its spec. */
  "FIGURE_REF",
])
export type StudyReportSegmentKind = z.infer<typeof StudyReportSegmentKindSchema>

export interface StudyReportSegment {
  kind: StudyReportSegmentKind
  level: number | null
  text: string | null
  node_hash: string | null
  citation_index: number | null
  limitation_index: number | null
  table_id: string | null
  figure_id: string | null
}

/**
 * One shape with a discriminant, rather than eight shapes in a union.
 *
 * The idiom `ClaimValueRef` and `FigureValueRef` use, and for the projection's
 * reason rather than for convenience: a canonical body whose shape is chosen
 * from the value of a field is a body whose shape depends on data, and the
 * emptiness check in `projection.ts` relies on the shape being a fact about the
 * record kind. The pairing rules a union would express are in the refinement
 * below, where a reader can see all eight at once.
 */
export const StudyReportSegmentSchema: Contract<StudyReportSegment> = z
  .object({
    kind: StudyReportSegmentKindSchema,
    /** 1 to 6, for a heading. Null for everything else. */
    level: SafeIntegerSchema.min(1).max(6).nullable(),
    text: z.string().min(1).max(8192).nullable(),
    node_hash: ContentHashSchema.nullable(),
    citation_index: SafeIntegerSchema.min(0).nullable(),
    limitation_index: SafeIntegerSchema.min(0).nullable(),
    table_id: z.string().min(1).max(64).nullable(),
    figure_id: z.string().min(1).max(64).nullable(),
  })
  .strict()
  .superRefine((segment, context) => {
    const required: Record<StudyReportSegmentKind, readonly (keyof StudyReportSegment)[]> = {
      HEADING: ["level", "text"],
      PROSE: ["text"],
      CLAIM_REF: ["node_hash"],
      QUANTITY_REF: ["node_hash"],
      CITATION_REF: ["citation_index"],
      LIMITATION_REF: ["limitation_index"],
      TABLE_REF: ["table_id"],
      FIGURE_REF: ["figure_id"],
    }
    const payloadKeys: readonly (keyof StudyReportSegment)[] = [
      "level",
      "text",
      "node_hash",
      "citation_index",
      "limitation_index",
      "table_id",
      "figure_id",
    ]
    const needed = new Set(required[segment.kind])
    for (const key of payloadKeys) {
      const present = segment[key] !== null
      if (needed.has(key) && !present) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A ${segment.kind} segment must carry ${key}. A segment that names nothing renders as nothing, and a ` +
            "gap where a number belongs reads to a person as a value the study did not have.",
          path: [key],
        })
      }
      if (!needed.has(key) && present) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A ${segment.kind} segment must leave ${key} null. A segment carrying two payloads is rendered one way ` +
            "by one consumer and another way by the next, and both are quoting it.",
          path: [key],
        })
      }
    }
    // The grounding rule is deliberately *not* enforced here. It is checked by
    // `groundedProseFindings`, which both the builder and the verifier run, and
    // the reason is the cross-language contract: a schema failure arrives as a
    // parse error with Zod's own message and Zod's own path, while a finding
    // arrives as a code and a JSON path that Python produces identically. The
    // rule is the one this module exists for, so it must be reportable rather
    // than merely enforceable.
  }) as unknown as Contract<StudyReportSegment>

export interface StudyReportSection {
  section_id: string
  title: string
  segments: StudyReportSegment[]
}

export const StudyReportSectionSchema: Contract<StudyReportSection> = z
  .object({
    section_id: z.string().min(1).max(64),
    /** Subject to the grounding rule: a section titled with a measurement is a measurement in the report. */
    title: z.string().min(1).max(256),
    segments: z.array(StudyReportSegmentSchema).min(1).max(1024),
  })
  .strict()

export interface StudyCommentaryBlock {
  commentary_id: string
  title: string
  text: string
}

/**
 * Unverified prose, kept where it cannot be mistaken for a result.
 *
 * Deliberately unrestricted: an author writing about what a result might mean,
 * what they suspect, or what they would try next is doing something valuable
 * and should not be fighting a regular expression to do it. The whole design of
 * this field is that it is a *different field* -- so a renderer cannot show it
 * inside a verified section by accident, and a consumer reading the structure
 * knows which is which without reading the prose.
 */
export const StudyCommentaryBlockSchema: Contract<StudyCommentaryBlock> = z
  .object({
    commentary_id: z.string().min(1).max(64),
    title: z.string().min(1).max(256),
    text: z.string().min(1).max(STUDY_PACKAGE_LIMITS.max_commentary_bytes),
  })
  .strict()

export interface StudyReportDocument {
  sections: StudyReportSection[]
  commentary: StudyCommentaryBlock[]
}

export const StudyReportDocumentSchema: Contract<StudyReportDocument> = z
  .object({
    /** At least one: a package whose report has no sections reports nothing. */
    sections: z.array(StudyReportSectionSchema).min(1).max(256),
    commentary: z.array(StudyCommentaryBlockSchema).max(256),
  })
  .strict()

/**
 * What a segment reads from, when it reads from a node.
 *
 * Structural for `TableValueSource`'s reason, with the claim block added
 * because a claim segment renders the sentence the study asserts rather than a
 * number. An `EvidenceNode` satisfies it.
 */
export interface StudyReportNodeSource extends TableValueSource {
  readonly claim: unknown
}

export interface StudyReportRenderContext {
  readonly nodes: ReadonlyMap<string, StudyReportNodeSource>
  readonly tables: readonly StudyTable[]
  readonly figures: readonly StudyFigure[]
  readonly citations: readonly Citation[]
  readonly limitations: readonly string[]
}

/** Whether a segment renders inside a paragraph or as a block of its own. */
function isInline(kind: StudyReportSegmentKind): boolean {
  return (
    kind === "PROSE" ||
    kind === "CLAIM_REF" ||
    kind === "QUANTITY_REF" ||
    kind === "CITATION_REF" ||
    kind === "LIMITATION_REF"
  )
}

/**
 * The markers a rendering assigns, in first-appearance order.
 *
 * A number rendered in prose has to carry its provenance with it, and a
 * sixty-four character hash inline is provenance nobody reads. So each
 * referenced node, citation and limitation takes a short marker on first use
 * and is listed in full at the end -- the arrangement a paper uses, for the
 * reason a paper uses it.
 *
 * Truncating the hash inline was the alternative and is worse than it looks: a
 * prefix of a digest, printed where a digest belongs, is what a reader compares
 * two records by.
 */
interface RenderMarkers {
  readonly nodes: Map<string, number>
  readonly citations: Map<number, number>
  readonly limitations: Map<number, number>
}

function marker(index: Map<string | number, number>, key: string | number, prefix: string): string {
  const existing = index.get(key)
  if (existing !== undefined) return `[${prefix}${existing}]`
  const next = index.size + 1
  index.set(key, next)
  return `[${prefix}${next}]`
}

function renderQuantity(quantity: Quantity | null): string {
  if (quantity === null) return "UNKNOWN"
  return `${renderCellValue(quantity)} ${quantity.unit}`
}

/**
 * Render one verified section to Markdown.
 *
 * Consecutive inline segments are joined into one paragraph with single spaces,
 * which is what lets a section read as prose: "The base scenario needs",
 * a quantity reference, "before error correction". The prose carries no digits
 * and the number comes from a node, and the rendered sentence is the one a
 * reader quotes.
 */
function renderSection(
  section: StudyReportSection,
  context: StudyReportRenderContext,
  markers: RenderMarkers,
  cells: ReadonlyMap<string, string>,
): string {
  const blocks: string[] = [`## ${section.title}`]
  let paragraph: string[] = []
  const flush = (): void => {
    if (paragraph.length === 0) return
    blocks.push(paragraph.join(" "))
    paragraph = []
  }

  for (const segment of section.segments) {
    if (!isInline(segment.kind)) flush()
    switch (segment.kind) {
      case "HEADING":
        blocks.push(`${"#".repeat(Math.min(6, (segment.level ?? 1) + 2))} ${segment.text ?? ""}`)
        break
      case "PROSE":
        paragraph.push(segment.text ?? "")
        break
      case "CLAIM_REF": {
        const node = segment.node_hash === null ? undefined : context.nodes.get(segment.node_hash)
        paragraph.push(
          `**${node?.label ?? "(claim not carried)"}**` +
            (segment.node_hash === null
              ? ""
              : marker(markers.nodes as Map<string | number, number>, segment.node_hash, "n")),
        )
        break
      }
      case "QUANTITY_REF": {
        const node = segment.node_hash === null ? undefined : context.nodes.get(segment.node_hash)
        paragraph.push(
          `${renderQuantity(node?.quantity ?? null)}` +
            (segment.node_hash === null
              ? ""
              : marker(markers.nodes as Map<string | number, number>, segment.node_hash, "n")),
        )
        break
      }
      case "CITATION_REF": {
        const index = segment.citation_index ?? 0
        paragraph.push(marker(markers.citations as Map<string | number, number>, index, "c"))
        break
      }
      case "LIMITATION_REF": {
        const index = segment.limitation_index ?? 0
        paragraph.push(marker(markers.limitations as Map<string | number, number>, index, "l"))
        break
      }
      case "TABLE_REF": {
        const table = context.tables.find((candidate) => candidate.table_id === segment.table_id)
        if (table === undefined) {
          blocks.push(`_Table ${segment.table_id ?? ""} is not carried by this package._`)
          break
        }
        blocks.push(`**${table.caption}**`)
        blocks.push(renderTableMarkdown(table, context.nodes).trimEnd())
        break
      }
      case "FIGURE_REF": {
        const figure = context.figures.find(
          (candidate) => candidate.figure_id === segment.figure_id,
        )
        if (figure === undefined) {
          blocks.push(`_Figure ${segment.figure_id ?? ""} is not carried by this package._`)
          break
        }
        blocks.push(renderFigureSummary(figure, context.nodes, cells))
        break
      }
    }
  }
  flush()
  return blocks.join("\n\n")
}

/**
 * The whole report, generated.
 *
 * Nothing in the output was typed by a package author except the prose that
 * passed the grounding rule and the commentary, and the commentary is under a
 * heading that says what it is. Every number came out of a node.
 *
 * The Markdown this returns is a rendering rather than a record: it is not
 * hashed, it is not stored in the package, and re-rendering it is how a
 * recipient gets it. A stored rendering would be the second copy that the whole
 * of this module exists to remove.
 */
export function renderReportMarkdown(
  document: StudyReportDocument,
  context: StudyReportRenderContext,
): string {
  const markers: RenderMarkers = {
    nodes: new Map<string, number>(),
    citations: new Map<number, number>(),
    limitations: new Map<number, number>(),
  }
  const cells = indexTableCells(context.tables)
  const blocks = document.sections.map((section) =>
    renderSection(section, context, markers, cells),
  )

  if (markers.nodes.size > 0) {
    const lines = [...markers.nodes.entries()]
      .sort((left, right) => left[1] - right[1])
      .map(([hash, number]) => {
        const node = context.nodes.get(hash)
        return `- [n${number}] ${node?.label ?? "(not carried)"} -- ${node?.kind ?? "unknown"} node ${hash}`
      })
    blocks.push(["## Evidence", ...lines].join("\n\n"))
  }
  if (markers.citations.size > 0) {
    const lines = [...markers.citations.entries()]
      .sort((left, right) => left[1] - right[1])
      .map(([index, number]) => {
        const citation = context.citations[index]
        return `- [c${number}] ${citation?.title ?? "(not carried)"}`
      })
    blocks.push(["## References", ...lines].join("\n\n"))
  }
  if (markers.limitations.size > 0) {
    const lines = [...markers.limitations.entries()]
      .sort((left, right) => left[1] - right[1])
      .map(([index, number]) => `- [l${number}] ${context.limitations[index] ?? "(not carried)"}`)
    blocks.push(["## Stated limitations", ...lines].join("\n\n"))
  }

  if (document.commentary.length > 0) {
    const lines = document.commentary.flatMap((block) => [`### ${block.title}`, block.text])
    blocks.push(
      [
        "## Unverified commentary",
        "The text below is the author's, and nothing in this package checks it. No number in it is read from an " +
          "evidence node, and it is not part of any verified section.",
        ...lines,
      ].join("\n\n"),
    )
  }

  return `${blocks.join("\n\n")}\n`
}

/**
 * Every place a number was typed into a verified surface.
 *
 * The rule this module exists for, checked at both boundaries so the answer is
 * the same one whether a package is being written or read, and reported as a
 * code and a path so that both languages give the same answer for one file.
 *
 * The surfaces are the ones a reader sees inside a verified section: the section
 * titles, the headings, the prose. `limitations` is deliberately not among them
 * -- a caveat saying "modelled at a physical error rate of 0.001" is a caveat
 * rather than a result, and refusing it would push authors towards vaguer
 * caveats, which is the opposite of what this is for.
 */
export function groundedProseFindings(
  document: StudyReportDocument,
  section = "report",
): StudyFinding[] {
  const findings: StudyFinding[] = []
  document.sections.forEach((current, sectionIndex) => {
    if (containsUngroundedNumber(current.title)) {
      findings.push(
        finding(
          "VERIFIED_PROSE_NOT_GROUNDED",
          studyPath(section, "sections", sectionIndex, "title"),
          "This section title carries a number standing on its own, which is a figure in the report reached " +
            "through the table of contents. Name the section, and put the number in a segment that references " +
            "its node.",
        ),
      )
    }
    current.segments.forEach((segment, segmentIndex) => {
      if (segment.kind !== "PROSE" && segment.kind !== "HEADING") return
      if (segment.text === null || !containsUngroundedNumber(segment.text)) return
      findings.push(
        finding(
          "VERIFIED_PROSE_NOT_GROUNDED",
          studyPath(section, "sections", sectionIndex, "segments", segmentIndex, "text"),
          "This text carries a number standing on its own. A figure typed into a verified section is " +
            "indistinguishable from one that was measured, and hashing the sentence establishes only that nobody " +
            "edited it. Reference the node with a QUANTITY_REF segment, or move the sentence to commentary, " +
            "where it is rendered as unverified.",
        ),
      )
    })
  })
  return findings
}

/**
 * Everything wrong with the report document, addressed to where it is wrong.
 *
 * The grounding rule above, and then resolution: a segment naming a node, table,
 * figure, citation or limitation the package does not carry, and a segment
 * naming a node of the wrong kind. A `QUANTITY_REF` at a claim node renders the
 * claim's label where a number belongs; a `CLAIM_REF` at a quantity renders a
 * measurement as an assertion. Both read fine and say something the study did
 * not.
 */
export function reportFindings(
  document: StudyReportDocument,
  context: StudyReportRenderContext,
  section = "report",
): StudyFinding[] {
  const findings: StudyFinding[] = groundedProseFindings(document, section)
  const tableIds = new Set(context.tables.map((table) => table.table_id))
  const figureIds = new Set(context.figures.map((figure) => figure.figure_id))
  const sectionIds = new Set<string>()
  const commentaryIds = new Set<string>()

  document.sections.forEach((current, sectionIndex) => {
    if (sectionIds.has(current.section_id)) {
      findings.push(
        finding(
          "REPORT_DUPLICATE_ID",
          studyPath(section, "sections", sectionIndex, "section_id"),
          `Two sections share the id ${JSON.stringify(current.section_id)}, so a reader following a link to it ` +
            "arrives at whichever the renderer reached first.",
        ),
      )
    }
    sectionIds.add(current.section_id)

    current.segments.forEach((segment, segmentIndex) => {
      const at = (...parts: readonly (string | number)[]): string =>
        studyPath(section, "sections", sectionIndex, "segments", segmentIndex, ...parts)

      if (segment.kind === "CLAIM_REF" || segment.kind === "QUANTITY_REF") {
        const hash = segment.node_hash
        const node = hash === null ? undefined : context.nodes.get(hash)
        if (node === undefined) {
          findings.push(
            finding(
              "REPORT_REFERENCE_UNRESOLVED",
              at("node_hash"),
              `This segment reads node ${hash ?? "(none)"}, and the package does not carry it. The section renders ` +
                "with a gap where a reader expects a number, or with a placeholder they will read as the value.",
            ),
          )
          return
        }
        if (segment.kind === "QUANTITY_REF" && node.quantity === null) {
          findings.push(
            finding(
              "REPORT_REFERENCE_KIND_MISMATCH",
              at("node_hash"),
              `This segment renders a number and names the ${node.kind} node ${JSON.stringify(node.label)}, which ` +
                "carries no quantity. A renderer with nothing to render puts the node's label where the figure " +
                "belongs, and a reader quotes it.",
            ),
          )
          return
        }
        if (segment.kind === "CLAIM_REF" && node.kind !== "claim") {
          findings.push(
            finding(
              "REPORT_REFERENCE_KIND_MISMATCH",
              at("node_hash"),
              `This segment renders an assertion and names a ${node.kind} node. A measurement rendered as a claim ` +
                "says the study asserted something it only recorded.",
            ),
          )
        }
        return
      }

      if (segment.kind === "CITATION_REF") {
        const index = segment.citation_index ?? -1
        if (index >= 0 && index < context.citations.length) return
        findings.push(
          finding(
            "REPORT_REFERENCE_UNRESOLVED",
            at("citation_index"),
            `This segment cites reference ${index}, and the package carries ${context.citations.length}. A ` +
              "citation marker with nothing behind it is a footnote a reader cannot follow.",
          ),
        )
        return
      }

      if (segment.kind === "LIMITATION_REF") {
        const index = segment.limitation_index ?? -1
        if (index >= 0 && index < context.limitations.length) return
        findings.push(
          finding(
            "REPORT_REFERENCE_UNRESOLVED",
            at("limitation_index"),
            `This segment cites limitation ${index}, and the package carries ${context.limitations.length}. A ` +
              "caveat marker pointing at nothing is worse than no marker: the reader sees that a caveat was " +
              "intended and never learns what it said.",
          ),
        )
        return
      }

      if (segment.kind === "TABLE_REF" && !tableIds.has(segment.table_id ?? "")) {
        findings.push(
          finding(
            "REPORT_REFERENCE_UNRESOLVED",
            at("table_id"),
            `This segment renders table ${JSON.stringify(segment.table_id ?? "")}, and the package carries no ` +
              "table with that id.",
          ),
        )
        return
      }

      if (segment.kind === "FIGURE_REF" && !figureIds.has(segment.figure_id ?? "")) {
        findings.push(
          finding(
            "REPORT_REFERENCE_UNRESOLVED",
            at("figure_id"),
            `This segment renders figure ${JSON.stringify(segment.figure_id ?? "")}, and the package carries no ` +
              "figure with that id.",
          ),
        )
      }
    })
  })

  document.commentary.forEach((block, index) => {
    if (commentaryIds.has(block.commentary_id)) {
      findings.push(
        finding(
          "REPORT_DUPLICATE_ID",
          studyPath(section, "commentary", index, "commentary_id"),
          `Two commentary blocks share the id ${JSON.stringify(block.commentary_id)}.`,
        ),
      )
    }
    commentaryIds.add(block.commentary_id)
  })

  const reportBytes = document.sections.reduce(
    (total, current) =>
      total +
      utf8ByteLength(current.title) +
      current.segments.reduce((sum, segment) => sum + utf8ByteLength(segment.text ?? ""), 0),
    0,
  )
  const overReport = limitFinding(
    studyPath(section, "sections"),
    "bytes of report text",
    reportBytes,
    STUDY_PACKAGE_LIMITS.max_report_bytes,
  )
  if (overReport !== null) findings.push(overReport)

  const commentaryBytes = document.commentary.reduce(
    (total, block) => total + utf8ByteLength(block.title) + utf8ByteLength(block.text),
    0,
  )
  const overCommentary = limitFinding(
    studyPath(section, "commentary"),
    "bytes of commentary",
    commentaryBytes,
    STUDY_PACKAGE_LIMITS.max_commentary_bytes,
  )
  if (overCommentary !== null) findings.push(overCommentary)

  return findings
}
