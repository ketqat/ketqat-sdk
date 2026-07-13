import { type Artifact, type ArtifactListQuery, type BenchmarkResult, type BenchmarkSuite, type ReproducibilityBundle, type Visibility } from "../contracts/index.js";
export interface KetQatClientOptions {
    baseUrl: string;
    fetch?: typeof fetch;
    token?: string;
}
export interface RunImportOptions {
    visibility?: Visibility;
}
export declare class KetQatClient {
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly token?;
    constructor(options: KetQatClientOptions);
    readonly artifacts: {
        list: (query?: ArtifactListQuery) => Promise<Artifact[]>;
        get: (slug: string) => Promise<Artifact>;
    };
    readonly benchmarks: {
        list: (query?: {
            domain?: "QEC" | "ALGORITHM";
        }) => Promise<BenchmarkSuite[]>;
        get: (slug: string) => Promise<BenchmarkSuite>;
    };
    readonly runs: {
        list: (query?: {
            domain?: "QEC" | "ALGORITHM";
            status?: string;
        }) => Promise<BenchmarkResult[]>;
        get: (slug: string) => Promise<BenchmarkResult>;
        import: (result: BenchmarkResult, options?: RunImportOptions) => Promise<BenchmarkResult>;
        getBundle: (slug: string) => Promise<ReproducibilityBundle>;
        downloadBundle: (slug: string) => Promise<Blob>;
    };
    readonly github: {
        importRepository: (input: Record<string, unknown>) => Promise<Artifact>;
    };
    private getJson;
    private postJson;
    private request;
}
//# sourceMappingURL=index.d.ts.map