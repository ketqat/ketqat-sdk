import {
  ArtifactSchema,
  BenchmarkResultSchema,
  BenchmarkSuiteSchema,
  QuantumCardSchema,
  ReproducibilityBundleSchema,
  type Artifact,
  type ArtifactListQuery,
  type BenchmarkResult,
  type BenchmarkSuite,
  type ReproducibilityBundle,
  type Visibility,
} from "../contracts/index.js"
import { validateJob } from "../worker/job.js"

export * from "./token.js"

/**
 * States a job never leaves. Kept here rather than imported from the queue,
 * which lives in the private control plane; the client must know when to stop
 * polling without depending on it.
 */
export const TERMINAL_JOB_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]

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

  readonly artifactVersions = {
    list: async (slug: string): Promise<unknown[]> => {
      const response = await this.getJson(`/api/artifacts/${encodeURIComponent(slug)}/versions`)
      const object = responseObject(response)
      return Array.isArray(object.versions) ? object.versions : []
    },
    /**
     * Publish a Quantum Card. The card is validated locally first, so an
     * invalid card fails before a network round trip and reports the failing
     * field rather than a bare 400.
     */
    publish: async (
      slug: string,
      input: { version: string; quantum_card: unknown; commit_sha?: string },
    ): Promise<unknown> => {
      QuantumCardSchema.parse(input.quantum_card)
      const response = await this.postJson(`/api/artifacts/${encodeURIComponent(slug)}/versions`, input)
      return responseObject(response).version ?? response
    },
  }

  readonly artifactRelations = {
    list: async (slug: string): Promise<unknown[]> => {
      const response = await this.getJson(`/api/artifacts/${encodeURIComponent(slug)}/relations`)
      const object = responseObject(response)
      return Array.isArray(object.relations) ? object.relations : []
    },
    create: async (slug: string, input: Record<string, unknown>): Promise<unknown> => {
      const response = await this.postJson(`/api/artifacts/${encodeURIComponent(slug)}/relations`, input)
      return responseObject(response).relation ?? response
    },
  }

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
  readonly reviews = {
    /** Reviews of one assessment. Visibility follows the assessment. */
    list: async (assessmentSlug: string): Promise<unknown[]> => {
      const response = await this.getJson(
        `/api/intelligence/assessments/${encodeURIComponent(assessmentSlug)}/reviews`,
      )
      const object = responseObject(response)
      return Array.isArray(object.reviews) ? object.reviews : []
    },

    /** Open reviews this caller may decide. Never their own requests. */
    queue: async (): Promise<unknown[]> => {
      const response = await this.getJson("/api/intelligence/reviews")
      const object = responseObject(response)
      return Array.isArray(object.reviews) ? object.reviews : []
    },

    request: async (
      assessmentSlug: string,
      input: { request: string; expectedHash?: string },
    ): Promise<unknown> => {
      const response = await this.postJson(
        `/api/intelligence/assessments/${encodeURIComponent(assessmentSlug)}/reviews`,
        { request: input.request, subject_hash: input.expectedHash },
      )
      return responseObject(response).review ?? response
    },

    claim: async (reviewId: string): Promise<unknown> => this.reviewAction(reviewId, { action: "claim" }),

    note: async (reviewId: string, body: string): Promise<unknown> =>
      this.reviewAction(reviewId, { action: "note", body }),

    /**
     * Decide. The reason is required by the server, and required here too — a
     * decision without one cannot be weighed by whoever reads it next, and
     * finding that out from a 400 is worse than from a type error.
     */
    decide: async (
      reviewId: string,
      decision: "APPROVED" | "CHANGES_REQUESTED",
      note: string,
    ): Promise<unknown> => this.reviewAction(reviewId, { action: "decide", decision, note }),
  }

  private async reviewAction(reviewId: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await this.postJson(
      `/api/intelligence/reviews/${encodeURIComponent(reviewId)}`,
      body,
    )
    return responseObject(response).review ?? response
  }

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
  readonly execution = {
    /**
     * Queue a job.
     *
     * The manifest is validated locally first, so an invalid job fails before a
     * network round trip and names the offending field instead of returning a
     * bare 400. `validateJob` also rejects any code- or credential-implying
     * field at any depth, which means a mistake of that shape never leaves the
     * caller's machine.
     */
    submit: async (
      manifest: unknown,
      options: { idempotencyKey?: string } = {},
    ): Promise<Record<string, unknown>> => {
      validateJob({
        ...(typeof manifest === "object" && manifest !== null ? manifest : {}),
        // Placeholders only. The control plane assigns the real values and
        // ignores these; they exist so local validation sees a complete job
        // rather than failing on fields the server owns.
        job_id: "client-side-validation",
        idempotency_key: options.idempotencyKey ?? "client-side-validation",
        submitted_by: "client-side-validation",
      })

      const response = await this.postJson("/api/execution/jobs", {
        job: manifest,
        ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
      })
      return responseObject(response)
    },
    get: async (jobId: string): Promise<Record<string, unknown>> => {
      const response = await this.getJson(`/api/execution/jobs/${encodeURIComponent(jobId)}`)
      return responseObject(response)
    },
    list: async (query: { status?: string; limit?: number } = {}): Promise<unknown[]> => {
      const response = await this.getJson(
        `/api/execution/jobs${queryString({
          ...(query.status ? { status: query.status } : {}),
          ...(query.limit !== undefined ? { limit: String(query.limit) } : {}),
        })}`,
      )
      const object = responseObject(response)
      return Array.isArray(object.jobs) ? object.jobs : []
    },
    cancel: async (jobId: string): Promise<Record<string, unknown>> => {
      const response = await this.postJson(
        `/api/execution/jobs/${encodeURIComponent(jobId)}/cancel`,
        {},
      )
      return responseObject(response)
    },
    bundle: async (jobId: string): Promise<Record<string, unknown>> => {
      const response = await this.getJson(`/api/execution/jobs/${encodeURIComponent(jobId)}/bundle`)
      return responseObject(response)
    },
    /**
     * Poll until the job reaches a terminal state.
     *
     * Bounded by a deadline rather than an attempt count, because what a caller
     * cares about is how long they are willing to wait. On timeout it returns
     * the job as it stands rather than throwing: the job is still running, and
     * reporting that is more useful than an error that loses the id.
     */
    waitFor: async (
      jobId: string,
      options: {
        timeoutMs?: number
        intervalMs?: number
        sleep?: (ms: number) => Promise<void>
        /**
         * Called once per *change* of status, never per poll.
         *
         * A watch command that reprints the same line every two seconds is one
         * people stop running, so the de-duplication lives here rather than
         * being left to each caller to remember.
         */
        onStatusChange?: (status: string, payload: Record<string, unknown>) => void
      } = {},
    ): Promise<Record<string, unknown>> => {
      const timeoutMs = options.timeoutMs ?? 180_000
      const intervalMs = options.intervalMs ?? 2_000
      const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
      const deadline = Date.now() + timeoutMs
      let lastStatus: string | undefined

      for (;;) {
        const payload = await this.execution.get(jobId)
        const job = (payload.job ?? payload) as { status?: string }
        if (job.status && job.status !== lastStatus) {
          lastStatus = job.status
          options.onStatusChange?.(job.status, payload)
        }
        if (job.status && TERMINAL_JOB_STATUSES.includes(job.status)) return payload
        if (Date.now() + intervalMs > deadline) return payload
        await sleep(intervalMs)
      }
    },
  }

  readonly search = {
    query: async (term: string): Promise<Record<string, unknown>> => {
      const response = await this.getJson(`/api/search${queryString({ q: term })}`)
      return responseObject(response)
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
      // Include the server's message when it sent one: a bare status code sends
      // the caller looking in the wrong place, and the API reports why it
      // refused (invalid card, version already published, not the owner).
      let detail = ""
      try {
        const body = responseObject(await response.clone().json())
        if (typeof body.error === "string") detail = ` -- ${body.error}`
      } catch {
        // Non-JSON error body; the status line is all there is.
      }
      throw new Error(`KetQat request failed: ${response.status} ${response.statusText}${detail}`)
    }
    return response
  }
}
