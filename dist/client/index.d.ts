import { type Artifact, type ArtifactListQuery, type BenchmarkResult, type BenchmarkSuite, type ReproducibilityBundle, type Visibility } from "../contracts/index.js";
export * from "./token.js";
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
     * Resource intelligence: decision cases and everything attached to one
     * (ketqat-sdk#245, ketqat-planning#124).
     *
     * Thin, like the rest of this client. Every scientific rule — what a
     * threshold means, when an economic conclusion is refused, whether a gate
     * count is undetermined — lives in the contracts and on the server. A client
     * that reimplemented any of them would eventually disagree with the thing
     * that decides.
     *
     * ## What is not here, and why
     *
     * **Drafts.** The guided flow is server actions, not REST: a draft is
     * half-finished state that only means something inside the wizard that owns
     * it, and exposing it would create a second way to reach a shape whose
     * validity rules are the wizard's. `create` below takes a complete workload,
     * which is what an automated caller actually has.
     *
     * **Reference cloning.** A server action for the same reason — it mints an
     * owned record from a public one and belongs to the session that will own it.
     * Reference *bundles* are readable here, which is the part an automated
     * caller needs.
     *
     * **Hardware gaps.** Computed in the web application from records that live
     * in its source tree, not behind an endpoint. `capabilityGap` is a pure
     * function of a published figure and a requirement; a caller with both can
     * compute it without a round trip, and one without them would only be asking
     * this client to invent a comparison.
     *
     * Recording those three as decisions rather than gaps, so the next reader
     * does not add an endpoint to close a hole that was deliberate.
     */
    readonly intelligence: {
        list: (query?: {
            owner?: string;
            project?: string;
            limit?: number;
        }) => Promise<unknown[]>;
        get: (slug: string) => Promise<unknown>;
        /** Create a decision case from a complete workload. */
        create: (input: Record<string, unknown>) => Promise<unknown>;
        /** Record a classical baseline, superseding any earlier revision. */
        setBaseline: (slug: string, baseline: unknown) => Promise<unknown>;
        /**
         * Add an assumption set, including its economic model.
         *
         * The economic model travels inside the scenario rather than as its own
         * endpoint, because that is what it is: an assumption, versioned with the
         * others it has to be read beside. A separate endpoint would let a cost
         * model be changed without the scenario revision moving, and every figure
         * derived from it would then be attributed to inputs that did not produce
         * it.
         */
        addScenario: (slug: string, scenario: unknown) => Promise<unknown>;
        /**
         * Compute estimates, thresholds and decisions for every current scenario.
         *
         * POST rather than GET because it writes, and because a crawlable GET
         * running an estimator is the shape that made an unbounded URL space most
         * of the service's compute bill. Idempotent: an estimate is unique on the
         * revisions that produced it, so a repeated call with nothing changed
         * reuses stored rows.
         */
        estimate: (slug: string) => Promise<unknown>;
        /** The current Decision Report, rendered from the assessment's inputs. */
        report: (slug: string) => Promise<unknown>;
        /** The scenario comparison as CSV, with unknowns written as the word. */
        reportCsv: (slug: string) => Promise<string>;
        /** Save a report revision for the current inputs. */
        saveReport: (slug: string) => Promise<unknown>;
        /** The full bundle: inputs, assumptions and conclusions under one hash. */
        bundle: (slug: string) => Promise<unknown>;
        /** A published reference case's bundle. Readable without a token. */
        referenceBundle: (slug: string) => Promise<unknown>;
    };
    /**
     * Review requests and decisions (ketqat-sdk#243, ketqat-planning#124).
     *
     * Every rule lives on the server. This namespace carries no policy at all —
     * not the self-review refusal, not the one-open-review rule, not the stale
     * hash check — because a client that enforced them would let a caller
     * *appear* to satisfy a rule the server would then apply differently, and the
     * badge these decisions gate is the platform's strongest claim.
     *
     * The subject hash is deliberately not a parameter of `request`. The server
     * computes it from the stored record; `expectedHash` only lets a caller say
     * which version they believe they are looking at, so a request made against a
     * page that has since moved is refused rather than recorded against inputs
     * nobody read.
     */
    readonly reviews: {
        /** Reviews of one assessment. Visibility follows the assessment. */
        list: (assessmentSlug: string) => Promise<unknown[]>;
        /** Open reviews this caller may decide. Never their own requests. */
        queue: () => Promise<unknown[]>;
        request: (assessmentSlug: string, input: {
            request: string;
            expectedHash?: string;
        }) => Promise<unknown>;
        claim: (reviewId: string) => Promise<unknown>;
        note: (reviewId: string, body: string) => Promise<unknown>;
        /**
         * Decide. The reason is required by the server, and required here too — a
         * decision without one cannot be weighed by whoever reads it next, and
         * finding that out from a 400 is worse than from a type error.
         */
        decide: (reviewId: string, decision: "APPROVED" | "CHANGES_REQUESTED", note: string) => Promise<unknown>;
    };
    private reviewAction;
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