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
/**
 * Escape hatches for comparisons that are scientifically meaningful but not
 * like-for-like rankings (RFC 0003).
 *
 * Both default to `false`. Enabling one is a statement that the caller is
 * presenting a labelled, explicitly scoped comparison -- for example ideal
 * versus noisy versus device behaviour -- rather than ranking runs against each
 * other as if they measured the same thing.
 */
export interface CompatibilityOptions {
    allowMixedExecutionClasses?: boolean;
    allowSemanticTransformationLoss?: boolean;
}
export declare function compareRunCompatibility(left: BenchmarkResult, right: BenchmarkResult, suites?: BenchmarkSuite[], options?: CompatibilityOptions): CompatibilityResult;
export declare function findComparableMetricCoordinates(left: BenchmarkResult, right: BenchmarkResult): string[];
export declare function compareExactReproductionConfiguration(left: BenchmarkResult, right: BenchmarkResult, options?: CompatibilityOptions): CompatibilityResult;
//# sourceMappingURL=index.d.ts.map