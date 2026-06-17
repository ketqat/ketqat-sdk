import { createHash } from "node:crypto"
import type { BenchmarkResult, ExperimentManifest } from "../contracts/index.js"

type HashableInput = ExperimentManifest | BenchmarkResult | Record<string, unknown>

const excludedKeys = new Set([
  "id",
  "slug",
  "started_at",
  "finished_at",
  "created_at",
  "updated_at",
  "submitted_at",
  "ui_metadata",
  "reproducibility_hash",
])

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      if (!excludedKeys.has(key) && source[key] !== undefined) {
        result[key] = canonicalize(source[key])
      }
    }
    return result
  }
  return value
}

export function canonicalResearchJson(input: HashableInput): string {
  return JSON.stringify(canonicalize(input))
}

export function calculateReproducibilityHash(input: HashableInput): string {
  return createHash("sha256").update(canonicalResearchJson(input)).digest("hex")
}
