import {
  ArtifactSchema,
  BenchmarkResultSchema,
  BenchmarkSuiteSchema,
  ReproducibilityBundleSchema,
  type Artifact,
  type ArtifactListQuery,
  type BenchmarkResult,
  type BenchmarkSuite,
  type ReproducibilityBundle,
  type Visibility,
} from "../contracts/index.js"

export interface KetQatClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  token?: string
}

export interface RunImportOptions {
  visibility?: Visibility
}

function queryString(params: Record<string, string | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }
  const result = search.toString()
  return result ? `?${result}` : ""
}

function responseObject(response: unknown): Record<string, unknown> {
  return response && typeof response === "object" && !Array.isArray(response)
    ? (response as Record<string, unknown>)
    : {}
}

export class KetQatClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly token?: string

  constructor(options: KetQatClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.fetchImpl = options.fetch ?? fetch
    this.token = options.token
  }

  readonly artifacts = {
    list: async (query: ArtifactListQuery = {}): Promise<Artifact[]> => {
      const response = await this.getJson(`/api/artifacts${queryString(query)}`)
      const object = responseObject(response)
      return ArtifactSchema.array().parse(object.artifacts ?? response)
    },
    get: async (slug: string): Promise<Artifact> => {
      const response = await this.getJson(`/api/artifacts/${encodeURIComponent(slug)}`)
      return ArtifactSchema.parse(responseObject(response).artifact ?? response)
    },
  }

  readonly benchmarks = {
    list: async (query: { domain?: "QEC" | "ALGORITHM" } = {}): Promise<BenchmarkSuite[]> => {
      const response = await this.getJson(`/api/benchmarks${queryString(query)}`)
      const object = responseObject(response)
      return BenchmarkSuiteSchema.array().parse(object.benchmarks ?? response)
    },
    get: async (slug: string): Promise<BenchmarkSuite> => {
      const response = await this.getJson(`/api/benchmarks/${encodeURIComponent(slug)}`)
      return BenchmarkSuiteSchema.parse(responseObject(response).benchmark ?? response)
    },
  }

  readonly runs = {
    list: async (query: { domain?: "QEC" | "ALGORITHM"; status?: string } = {}): Promise<BenchmarkResult[]> => {
      const response = await this.getJson(`/api/runs${queryString(query)}`)
      const object = responseObject(response)
      return BenchmarkResultSchema.array().parse(object.runs ?? response)
    },
    get: async (slug: string): Promise<BenchmarkResult> => {
      const response = await this.getJson(`/api/runs/${encodeURIComponent(slug)}`)
      return BenchmarkResultSchema.parse(responseObject(response).run ?? response)
    },
    import: async (result: BenchmarkResult, options: RunImportOptions = {}): Promise<BenchmarkResult> => {
      const body = options.visibility ? { result, visibility: options.visibility } : result
      const response = await this.postJson("/api/runs/import", body)
      return BenchmarkResultSchema.parse(responseObject(response).run ?? response)
    },
    getBundle: async (slug: string): Promise<ReproducibilityBundle> => {
      const response = await this.getJson(`/api/runs/${encodeURIComponent(slug)}/bundle`)
      return ReproducibilityBundleSchema.parse(responseObject(response).bundle ?? response)
    },
    downloadBundle: async (slug: string): Promise<Blob> => {
      const response = await this.request(`/api/runs/${encodeURIComponent(slug)}/bundle`)
      return response.blob()
    },
  }

  readonly github = {
    importRepository: async (input: Record<string, unknown>): Promise<Artifact> => {
      const response = await this.postJson("/api/github/import", input)
      return ArtifactSchema.parse(responseObject(response).artifact ?? response)
    },
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.request(path)
    return response.json()
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const response = await this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    return response.json()
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`)
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers })
    if (!response.ok) {
      throw new Error(`KetQat request failed: ${response.status} ${response.statusText}`)
    }
    return response
  }
}
