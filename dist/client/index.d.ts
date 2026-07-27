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
    readonly artifactVersions: {
        list: (slug: string) => Promise<unknown[]>;
        /**
         * Publish a Quantum Card. The card is validated locally first, so an
         * invalid card fails before a network round trip and reports the failing
         * field rather than a bare 400.
         */
        publish: (slug: string, input: {
            version: string;
            quantum_card: unknown;
            commit_sha?: string;
        }) => Promise<unknown>;
    };
    readonly artifactRelations: {
        list: (slug: string) => Promise<unknown[]>;
        create: (slug: string, input: Record<string, unknown>) => Promise<unknown>;
    };
    readonly search: {
        query: (term: string) => Promise<Record<string, unknown>>;
    };
    readonly github: {
        importRepository: (input: Record<string, unknown>) => Promise<Artifact>;
    };
    private getJson;
    private postJson;
    private request;
}
//# sourceMappingURL=index.d.ts.map