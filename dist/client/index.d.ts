import { type Artifact, type ArtifactListQuery, type BenchmarkResult, type BenchmarkSuite, type ReproducibilityBundle, type Visibility } from "../contracts/index.js";
/**
 * States a job never leaves. Kept here rather than imported from the queue,
 * which lives in the private control plane; the client must know when to stop
 * polling without depending on it.
 */
export declare const TERMINAL_JOB_STATUSES: string[];
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
    /**
     * Sandboxed execution.
     *
     * Every path here enqueues; none of them executes. That is the same rule the
     * web application follows, and it is why the CLI and the MCP server call
     * these methods rather than running a circuit locally and uploading the
     * answer: a result that reaches the registry should have come from the same
     * worker, under the same limits, with the same audit trail, whichever surface
     * asked for it.
     */
    readonly execution: {
        /**
         * Queue a job.
         *
         * The manifest is validated locally first, so an invalid job fails before a
         * network round trip and names the offending field instead of returning a
         * bare 400. `validateJob` also rejects any code- or credential-implying
         * field at any depth, which means a mistake of that shape never leaves the
         * caller's machine.
         */
        submit: (manifest: unknown, options?: {
            idempotencyKey?: string;
        }) => Promise<Record<string, unknown>>;
        get: (jobId: string) => Promise<Record<string, unknown>>;
        list: (query?: {
            status?: string;
            limit?: number;
        }) => Promise<unknown[]>;
        cancel: (jobId: string) => Promise<Record<string, unknown>>;
        bundle: (jobId: string) => Promise<Record<string, unknown>>;
        /**
         * Poll until the job reaches a terminal state.
         *
         * Bounded by a deadline rather than an attempt count, because what a caller
         * cares about is how long they are willing to wait. On timeout it returns
         * the job as it stands rather than throwing: the job is still running, and
         * reporting that is more useful than an error that loses the id.
         */
        waitFor: (jobId: string, options?: {
            timeoutMs?: number;
            intervalMs?: number;
            sleep?: (ms: number) => Promise<void>;
            /**
             * Called once per *change* of status, never per poll.
             *
             * A watch command that reprints the same line every two seconds is one
             * people stop running, so the de-duplication lives here rather than
             * being left to each caller to remember.
             */
            onStatusChange?: (status: string, payload: Record<string, unknown>) => void;
        }) => Promise<Record<string, unknown>>;
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