import type { BenchmarkResult, BenchmarkSuite } from "../contracts/index.js";
export interface IncompatibilityReason {
    code: string;
    message: string;
    path?: string;
}
export interface CompatibilityResult {
    compatible: boolean;
    reasons: IncompatibilityReason[];
}
export declare function compareRunCompatibility(left: BenchmarkResult, right: BenchmarkResult, suites?: BenchmarkSuite[]): CompatibilityResult;
export declare function findComparableMetricCoordinates(left: BenchmarkResult, right: BenchmarkResult): string[];
export declare function compareExactReproductionConfiguration(left: BenchmarkResult, right: BenchmarkResult): CompatibilityResult;
//# sourceMappingURL=index.d.ts.map