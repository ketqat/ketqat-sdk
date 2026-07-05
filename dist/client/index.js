import { ArtifactSchema, BenchmarkResultSchema, BenchmarkSuiteSchema, ReproducibilityBundleSchema, } from "../contracts/index.js";
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
            throw new Error(`KetQat request failed: ${response.status} ${response.statusText}`);
        }
        return response;
    }
}
//# sourceMappingURL=index.js.map