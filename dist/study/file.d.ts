import type { JsonValue } from "./jcs.js";
export interface StudyFileReading {
    /** The parsed value, safe to hand to the projection. */
    readonly value: JsonValue;
    /** The decoded text, for a caller that needs the bytes as written. */
    readonly text: string;
}
/**
 * Read a study file from raw bytes, or refuse it.
 *
 * The order is the contract, and each step exists because the next one would
 * have destroyed its evidence: BOM before decode, decode before scan, scan
 * before parse.
 */
export declare function readStudyFileBytes(bytes: Uint8Array): StudyFileReading;
//# sourceMappingURL=file.d.ts.map