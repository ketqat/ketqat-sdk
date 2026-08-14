import { ArtifactSchema, BenchmarkResultSchema, BenchmarkSuiteSchema, QuantumCardSchema, ReproducibilityBundleSchema, } from "../contracts/index.js";
import { validateJob } from "../worker/job.js";
export * from "./token.js";
/**
 * States a job never leaves. Kept here rather than imported from the queue,
 * which lives in the private control plane; the client must know when to stop
 * polling without depending on it.
 */
export const TERMINAL_JOB_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"];
function queryString(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            search.set(key, String(value));
        }
    }
    const result = search.toString();
    return result ? `?${result}` : "";
}
function responseObject(response) {
    return response && typeof response === "object" && !Array.isArray(response)
        ? response
        : {};
}
export class KetQatClient {
    constructor(options) {
        this.artifacts = {
            list: async (query = {}) => {
                const response = await this.getJson(`/api/artifacts${queryString(query)}`);
                const object = responseObject(response);
                return ArtifactSchema.array().parse(object.artifacts ?? response);
            },
            get: async (slug) => {
                const response = await this.getJson(`/api/artifacts/${encodeURIComponent(slug)}`);
                return ArtifactSchema.parse(responseObject(response).artifact ?? response);
            },
        };
        this.benchmarks = {
            list: async (query = {}) => {
                const response = await this.getJson(`/api/benchmarks${queryString(query)}`);
                const object = responseObject(response);
                return BenchmarkSuiteSchema.array().parse(object.benchmarks ?? response);
            },
            get: async (slug) => {
                const response = await this.getJson(`/api/benchmarks/${encodeURIComponent(slug)}`);
                return BenchmarkSuiteSchema.parse(responseObject(response).benchmark ?? response);
            },
        };
        this.runs = {
            list: async (query = {}) => {
                const response = await this.getJson(`/api/runs${queryString(query)}`);
                const object = responseObject(response);
                return BenchmarkResultSchema.array().parse(object.runs ?? response);
            },
            get: async (slug) => {
                const response = await this.getJson(`/api/runs/${encodeURIComponent(slug)}`);
                return BenchmarkResultSchema.parse(responseObject(response).run ?? response);
            },
            import: async (result, options = {}) => {
                const body = options.visibility ? { result, visibility: options.visibility } : result;
                const response = await this.postJson("/api/runs/import", body);
                return BenchmarkResultSchema.parse(responseObject(response).run ?? response);
            },
            getBundle: async (slug) => {
                const response = await this.getJson(`/api/runs/${encodeURIComponent(slug)}/bundle`);
                return ReproducibilityBundleSchema.parse(responseObject(response).bundle ?? response);
            },
            downloadBundle: async (slug) => {
                const response = await this.request(`/api/runs/${encodeURIComponent(slug)}/bundle`);
                return response.blob();
            },
        };
        this.artifactVersions = {
            list: async (slug) => {
                const response = await this.getJson(`/api/artifacts/${encodeURIComponent(slug)}/versions`);
                const object = responseObject(response);
                return Array.isArray(object.versions) ? object.versions : [];
            },
            /**
             * Publish a Quantum Card. The card is validated locally first, so an
             * invalid card fails before a network round trip and reports the failing
             * field rather than a bare 400.
             */
            publish: async (slug, input) => {
                QuantumCardSchema.parse(input.quantum_card);
                const response = await this.postJson(`/api/artifacts/${encodeURIComponent(slug)}/versions`, input);
                return responseObject(response).version ?? response;
            },
        };
        this.artifactRelations = {
            list: async (slug) => {
                const response = await this.getJson(`/api/artifacts/${encodeURIComponent(slug)}/relations`);
                const object = responseObject(response);
                return Array.isArray(object.relations) ? object.relations : [];
            },
            create: async (slug, input) => {
                const response = await this.postJson(`/api/artifacts/${encodeURIComponent(slug)}/relations`, input);
                return responseObject(response).relation ?? response;
            },
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
        this.reviews = {
            /** Reviews of one assessment. Visibility follows the assessment. */
            list: async (assessmentSlug) => {
                const response = await this.getJson(`/api/intelligence/assessments/${encodeURIComponent(assessmentSlug)}/reviews`);
                const object = responseObject(response);
                return Array.isArray(object.reviews) ? object.reviews : [];
            },
            /** Open reviews this caller may decide. Never their own requests. */
            queue: async () => {
                const response = await this.getJson("/api/intelligence/reviews");
                const object = responseObject(response);
                return Array.isArray(object.reviews) ? object.reviews : [];
            },
            request: async (assessmentSlug, input) => {
                const response = await this.postJson(`/api/intelligence/assessments/${encodeURIComponent(assessmentSlug)}/reviews`, { request: input.request, subject_hash: input.expectedHash });
                return responseObject(response).review ?? response;
            },
            claim: async (reviewId) => this.reviewAction(reviewId, { action: "claim" }),
            note: async (reviewId, body) => this.reviewAction(reviewId, { action: "note", body }),
            /**
             * Decide. The reason is required by the server, and required here too — a
             * decision without one cannot be weighed by whoever reads it next, and
             * finding that out from a 400 is worse than from a type error.
             */
            decide: async (reviewId, decision, note) => this.reviewAction(reviewId, { action: "decide", decision, note }),
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
        this.execution = {
            /**
             * Queue a job.
             *
             * The manifest is validated locally first, so an invalid job fails before a
             * network round trip and names the offending field instead of returning a
             * bare 400. `validateJob` also rejects any code- or credential-implying
             * field at any depth, which means a mistake of that shape never leaves the
             * caller's machine.
             */
            submit: async (manifest, options = {}) => {
                validateJob({
                    ...(typeof manifest === "object" && manifest !== null ? manifest : {}),
                    // Placeholders only. The control plane assigns the real values and
                    // ignores these; they exist so local validation sees a complete job
                    // rather than failing on fields the server owns.
                    job_id: "client-side-validation",
                    idempotency_key: options.idempotencyKey ?? "client-side-validation",
                    submitted_by: "client-side-validation",
                });
                const response = await this.postJson("/api/execution/jobs", {
                    job: manifest,
                    ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
                });
                return responseObject(response);
            },
            get: async (jobId) => {
                const response = await this.getJson(`/api/execution/jobs/${encodeURIComponent(jobId)}`);
                return responseObject(response);
            },
            list: async (query = {}) => {
                const response = await this.getJson(`/api/execution/jobs${queryString({
                    ...(query.status ? { status: query.status } : {}),
                    ...(query.limit !== undefined ? { limit: String(query.limit) } : {}),
                })}`);
                const object = responseObject(response);
                return Array.isArray(object.jobs) ? object.jobs : [];
            },
            cancel: async (jobId) => {
                const response = await this.postJson(`/api/execution/jobs/${encodeURIComponent(jobId)}/cancel`, {});
                return responseObject(response);
            },
            bundle: async (jobId) => {
                const response = await this.getJson(`/api/execution/jobs/${encodeURIComponent(jobId)}/bundle`);
                return responseObject(response);
            },
            /**
             * Poll until the job reaches a terminal state.
             *
             * Bounded by a deadline rather than an attempt count, because what a caller
             * cares about is how long they are willing to wait. On timeout it returns
             * the job as it stands rather than throwing: the job is still running, and
             * reporting that is more useful than an error that loses the id.
             */
            waitFor: async (jobId, options = {}) => {
                const timeoutMs = options.timeoutMs ?? 180000;
                const intervalMs = options.intervalMs ?? 2000;
                const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
                const deadline = Date.now() + timeoutMs;
                let lastStatus;
                for (;;) {
                    const payload = await this.execution.get(jobId);
                    const job = (payload.job ?? payload);
                    if (job.status && job.status !== lastStatus) {
                        lastStatus = job.status;
                        options.onStatusChange?.(job.status, payload);
                    }
                    if (job.status && TERMINAL_JOB_STATUSES.includes(job.status))
                        return payload;
                    if (Date.now() + intervalMs > deadline)
                        return payload;
                    await sleep(intervalMs);
                }
            },
        };
        this.search = {
            query: async (term) => {
                const response = await this.getJson(`/api/search${queryString({ q: term })}`);
                return responseObject(response);
            },
        };
        this.github = {
            importRepository: async (input) => {
                const response = await this.postJson("/api/github/import", input);
                return ArtifactSchema.parse(responseObject(response).artifact ?? response);
            },
        };
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.fetchImpl = options.fetch ?? fetch;
        this.token = options.token;
    }
    async reviewAction(reviewId, body) {
        const response = await this.postJson(`/api/intelligence/reviews/${encodeURIComponent(reviewId)}`, body);
        return responseObject(response).review ?? response;
    }
    async getJson(path) {
        const response = await this.request(path);
        return response.json();
    }
    async postJson(path, body) {
        const response = await this.request(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return response.json();
    }
    async request(path, init = {}) {
        const headers = new Headers(init.headers);
        if (this.token) {
            headers.set("authorization", `Bearer ${this.token}`);
        }
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
        if (!response.ok) {
            // Include the server's message when it sent one: a bare status code sends
            // the caller looking in the wrong place, and the API reports why it
            // refused (invalid card, version already published, not the owner).
            let detail = "";
            try {
                const body = responseObject(await response.clone().json());
                if (typeof body.error === "string")
                    detail = ` -- ${body.error}`;
            }
            catch {
                // Non-JSON error body; the status line is all there is.
            }
            throw new Error(`KetQat request failed: ${response.status} ${response.statusText}${detail}`);
        }
        return response;
    }
}
//# sourceMappingURL=index.js.map