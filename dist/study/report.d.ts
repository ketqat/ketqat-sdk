import { z } from "zod";
import type { Citation } from "../contracts/common.js";
import type { Contract } from "../intelligence/measurement.js";
import { type StudyFinding } from "./findings.js";
import { type StudyFigure } from "./figures.js";
import { type StudyTable, type TableValueSource } from "./tables.js";
export declare function containsUngroundedNumber(text: string): boolean;
export declare const StudyReportSegmentKindSchema: z.ZodEnum<["HEADING", "PROSE", "CLAIM_REF", "QUANTITY_REF", "CITATION_REF", "LIMITATION_REF", "TABLE_REF", "FIGURE_REF"]>;
export type StudyReportSegmentKind = z.infer<typeof StudyReportSegmentKindSchema>;
export interface StudyReportSegment {
    kind: StudyReportSegmentKind;
    level: number | null;
    text: string | null;
    node_hash: string | null;
    citation_index: number | null;
    limitation_index: number | null;
    table_id: string | null;
    figure_id: string | null;
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
export declare const StudyReportSegmentSchema: Contract<StudyReportSegment>;
export interface StudyReportSection {
    section_id: string;
    title: string;
    segments: StudyReportSegment[];
}
export declare const StudyReportSectionSchema: Contract<StudyReportSection>;
export interface StudyCommentaryBlock {
    commentary_id: string;
    title: string;
    text: string;
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
export declare const StudyCommentaryBlockSchema: Contract<StudyCommentaryBlock>;
export interface StudyReportDocument {
    sections: StudyReportSection[];
    commentary: StudyCommentaryBlock[];
}
export declare const StudyReportDocumentSchema: Contract<StudyReportDocument>;
/**
 * What a segment reads from, when it reads from a node.
 *
 * Structural for `TableValueSource`'s reason, with the claim block added
 * because a claim segment renders the sentence the study asserts rather than a
 * number. An `EvidenceNode` satisfies it.
 */
export interface StudyReportNodeSource extends TableValueSource {
    readonly claim: unknown;
}
export interface StudyReportRenderContext {
    readonly nodes: ReadonlyMap<string, StudyReportNodeSource>;
    readonly tables: readonly StudyTable[];
    readonly figures: readonly StudyFigure[];
    readonly citations: readonly Citation[];
    readonly limitations: readonly string[];
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
export declare function renderReportMarkdown(document: StudyReportDocument, context: StudyReportRenderContext): string;
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
export declare function groundedProseFindings(document: StudyReportDocument, section?: string): StudyFinding[];
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
export declare function reportFindings(document: StudyReportDocument, context: StudyReportRenderContext, section?: string): StudyFinding[];
//# sourceMappingURL=report.d.ts.map