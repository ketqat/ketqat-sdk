import type { Artifact, BenchmarkResult, BenchmarkSuite } from "../contracts/index.js";
export declare const demoArtifacts: Artifact[];
export declare const demoBenchmarkSuites: BenchmarkSuite[];
export declare const demoRuns: BenchmarkResult[];
export declare function listDemoArtifacts(domain?: Artifact["domain"]): Artifact[];
export declare function listDemoBenchmarks(domain?: BenchmarkSuite["domain"]): BenchmarkSuite[];
export declare function listDemoRuns(domain?: BenchmarkResult["domain"]): BenchmarkResult[];
//# sourceMappingURL=index.d.ts.map