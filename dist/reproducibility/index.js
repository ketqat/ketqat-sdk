import { createHash } from "node:crypto";
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
]);
function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map((item) => canonicalize(item));
    }
    if (value && typeof value === "object") {
        const source = value;
        const result = {};
        for (const key of Object.keys(source).sort()) {
            if (!excludedKeys.has(key) && source[key] !== undefined) {
                result[key] = canonicalize(source[key]);
            }
        }
        return result;
    }
    return value;
}
export function canonicalResearchJson(input) {
    return JSON.stringify(canonicalize(input));
}
export function calculateReproducibilityHash(input) {
    return createHash("sha256").update(canonicalResearchJson(input)).digest("hex");
}
//# sourceMappingURL=index.js.map