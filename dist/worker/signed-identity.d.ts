import type { IdentityTokenSource } from "./callback.js";
/** A short-lived, request-bound identity. The key is injected at runtime, never dispatched. */
export declare function signedRequestIdentity(secret: string): IdentityTokenSource;
//# sourceMappingURL=signed-identity.d.ts.map