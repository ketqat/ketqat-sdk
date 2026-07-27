import { ArtifactSchema, BenchmarkResultSchema, BenchmarkSuiteSchema, QuantumCardSchema, ReproducibilityBundleSchema, } from "../contracts/index.js";
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