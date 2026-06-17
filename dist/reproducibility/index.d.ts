import type { BenchmarkResult, ExperimentManifest } from "../contracts/index.js";
type HashableInput = ExperimentManifest | BenchmarkResult | Record<string, unknown>;
export declare function canonicalResearchJson(input: HashableInput): string;
export declare function calculateReproducibilityHash(input: HashableInput): string;
export {};
//# sourceMappingURL=index.d.ts.map