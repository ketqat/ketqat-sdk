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