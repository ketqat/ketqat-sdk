import { z } from "zod";
/**
 * MCP tool definitions for the KetQat engine.
 *
 * Two properties are structural rather than conventional here:
 *
 * 1. **Read-only by default.** Every tool in this module is annotated
 *    `readOnly: true`. A tool that spends money, mutates a registry, or submits
 *    a job is not defined here at all, so it cannot be exposed by accident. Such
 *    tools belong behind explicit confirmation, per RFC 0005.
 * 2. **Structured output.** Each tool declares an output schema and returns a
 *    typed object, not prose. A model consuming a benchmark result should not
 *    have to parse a sentence to find a confidence interval.
 *
 * This module defines the tools and their handlers. Transport -- stdio or
 * authenticated HTTP -- is deliberately left to the server that hosts them.
 *
 * ## Why the review workflow is not here (ketqat-planning#124)
 *
 * #124 asks for MCP parity across the intelligence surface, and reviews are
 * deliberately excluded rather than overlooked.
 *
 * Every tool in this server is local: it computes from what the caller passes
 * in, holds no credential, and reaches no network. Reviews are the opposite of
 * that on both counts — they are registry mutations, and they decide whether
 * the platform's strongest badge may be shown. Adding them would mean this
 * process holding an API token and writing to somebody's evidence trail, which
 * is exactly the property `readOnly: true` on every tool exists to promise.
 *
 * The review surface is reachable from the typed client and the CLI, where the
 * token comes from the environment and the caller is a person who typed the
 * command. That is parity of *capability*, not parity of transport, and the
 * difference is the point.
 */
export interface McpToolDefinition<Input = unknown, Output = unknown> {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodType<Input>;
    outputSchema: z.ZodType<Output>;
    /** Every tool here is read-only; a mutating tool must be declared elsewhere. */
    readOnly: true;
    handler: (input: Input) => Output;
}
export declare const inspectCircuitTool: McpToolDefinition;
export declare const convertCircuitTool: McpToolDefinition;
export declare const simulateCircuitTool: McpToolDefinition;
export declare const estimateResourcesTool: McpToolDefinition;
export declare const transpileForHardwareTool: McpToolDefinition;
export declare const optimizeWithZxTool: McpToolDefinition;
export declare const checkEquivalenceTool: McpToolDefinition;
/** Every read-only engine tool. */
/**
 * Resource intelligence, as pure calculation (ketqat-sdk#236).
 *
 * These belong in this file rather than in `execution.ts` because they change
 * nothing: no remote project is created or updated, no job is queued, no QPU
 * time is bought, and no network call is made. They read a document the caller
 * supplies and compute over it, exactly as the CLI does.
 *
 * The boundary this file exists to hold is that `readOnly: true` must be *true*.
 * A tool that saved an assessment to a registry, or that spent money on a
 * device, would have to be declared in `execution.ts` behind its own type and
 * its own confirmation, however convenient it would be to add it here.
 */
export declare const estimateResourceIntelligenceTool: McpToolDefinition;
export declare const compareResourceScenariosTool: McpToolDefinition;
export declare const verifyResourceIntelligenceBundleTool: McpToolDefinition;
export declare const MCP_TOOLS: McpToolDefinition[];
export interface McpToolError {
    error: string;
    message: string;
    feature?: string | null;
    line?: number | null;
}
/**
 * Invoke a tool by name with validated input and output.
 *
 * Output is validated against the declared schema before returning, so a
 * handler cannot quietly return a shape the tool advertised it would not.
 */
export declare function callTool(name: string, input: unknown): unknown | McpToolError;
/** Tool listing in the shape an MCP server advertises. */
export declare function listTools(): Array<{
    name: string;
    title: string;
    description: string;
    readOnly: boolean;
}>;
//# sourceMappingURL=index.d.ts.map