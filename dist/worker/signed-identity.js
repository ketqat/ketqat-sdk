import { createHash, createHmac } from "node:crypto";
/** A short-lived, request-bound identity. The key is injected at runtime, never dispatched. */
export function signedRequestIdentity(secret) {
    if (Buffer.byteLength(secret) < 32)
        throw new Error("Worker signing key must be at least 32 bytes");
    return {
        async fetchIdentityToken(audience, request) {
            if (!request)
                return null;
            const now = Math.floor(Date.now() / 1000);
            const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
            const payload = Buffer.from(JSON.stringify({
                iss: "ketqat-workload", sub: "worker", aud: audience, iat: now, exp: now + 60,
                method: request.method, path: request.path, attempt: request.attempt,
                sha256: createHash("sha256").update(request.body).digest("hex"),
            })).toString("base64url");
            const data = `${header}.${payload}`;
            return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
        },
    };
}
//# sourceMappingURL=signed-identity.js.map