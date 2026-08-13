import { z } from "zod";
import { type Quantity } from "./measurement.js";
import type { ResourceIntelligenceBundle } from "./bundle.js";
/**
 * The KetQat Decision Report (ketqat-sdk#236).
 *
 * A projection of the bundle for reading rather than a second source of truth:
 * every figure here is copied from the bundle, and the bundle's hash covers the
 * bundle, not this. A report that could say something the bundle does not would
 * be a way to state a conclusion nothing verifies.
 *
 * The executive summary is generated from the assessments rather than written,
 * for the same reason. A hand-written summary drifts from the numbers under it
 * the first time an assumption changes, and the drift is invisible.
 */
export declare const ReportSectionSchema: z.ZodObject<{
    heading: z.ZodString;
    /** Ordered statements. Each is displayable on its own without the others. */
    statements: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    heading: string;
    statements: string[];
}, {
    heading: string;
    statements: string[];
}>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export declare const DecisionReportSchema: z.ZodObject<{
    schema_version: z.ZodString;
    report_kind: z.ZodLiteral<"KETQAT_DECISION_REPORT">;
    title: z.ZodString;
    is_demo: z.ZodBoolean;
    /** Repeated from the bundle so a report cannot circulate without it. */
    reproducibility_hash: z.ZodString;
    reproducibility_hash_version: z.ZodNumber;
    reproduction_command: z.ZodString;
    estimator: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        version: string;
    }, {
        name: string;
        version: string;
    }>;
    executive_summary: z.ZodArray<z.ZodString, "many">;
    sections: z.ZodArray<z.ZodObject<{
        heading: z.ZodString;
        /** Ordered statements. Each is displayable on its own without the others. */
        statements: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        heading: string;
        statements: string[];
    }, {
        heading: string;
        statements: string[];
    }>, "many">;
    missing_evidence: z.ZodArray<z.ZodString, "many">;
    limitations: z.ZodArray<z.ZodString, "many">;
    sources: z.ZodArray<z.ZodObject<{
        supports: z.ZodString;
        title: z.ZodString;
        url: z.ZodNullable<z.ZodString>;
        published_on: z.ZodNullable<z.ZodString>;
        retrieved_on: z.ZodNullable<z.ZodString>;
        confidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: string;
    }, {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: string;
    report_kind: "KETQAT_DECISION_REPORT";
    title: string;
    is_demo: boolean;
    reproducibility_hash: string;
    reproducibility_hash_version: number;
    reproduction_command: string;
    estimator: {
        name: string;
        version: string;
    };
    executive_summary: string[];
    sections: {
        heading: string;
        statements: string[];
    }[];
    missing_evidence: string[];
    limitations: string[];
    sources: {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: string;
    }[];
}, {
    schema_version: string;
    report_kind: "KETQAT_DECISION_REPORT";
    title: string;
    is_demo: boolean;
    reproducibility_hash: string;
    reproducibility_hash_version: number;
    reproduction_command: string;
    estimator: {
        name: string;
        version: string;
    };
    executive_summary: string[];
    sections: {
        heading: string;
        statements: string[];
    }[];
    missing_evidence: string[];
    limitations: string[];
    sources: {
        supports: string;
        title: string;
        url: string | null;
        published_on: string | null;
        retrieved_on: string | null;
        confidence: string;
    }[];
}>;
export type DecisionReport = z.infer<typeof DecisionReportSchema>;
/**
 * Render a quantity for prose.
 *
 * An unknown renders as the word, never as a blank or a zero: a blank cell in a
 * report is read as "small", and a zero is read as "measured to be nothing".
 */
export declare function renderQuantity(value: Quantity): string;
export declare function buildReport(bundle: ResourceIntelligenceBundle): DecisionReport;
/** The comparison table as CSV. Same numbers, no aggregate row. */
export declare function reportToCsv(bundle: ResourceIntelligenceBundle): string;
//# sourceMappingURL=report.d.ts.map