import { z } from "zod";
import type { KetQatClient } from "../client/index.js";
/**
 * MCP tools that queue and manage sandboxed execution jobs.
 *
 * A separate module from `src/mcp/index.ts` on purpose. Every tool there is
 * annotated `readOnly: true`, and that annotation is only meaningful if a
 * mutating tool cannot appear among them by accident -- so the mutating ones
 * live behind their own type, in their own file, with their own list function.
 * A reviewer asking "what can this MCP server change?" reads one short file.
 *
 * Nothing here executes a circuit. `submit_execution_job` enqueues; the job runs
 * in a container the model has no access to, under limits the model cannot
 * raise. A model that could run a circuit in-process would be running arbitrary
 * scientific workloads inside whatever hosts the MCP server.
 *
 * The confirmation gate is the other structural piece. `submit_execution_job`
 * refuses unless `confirmed` is true, and the refusal returns exactly what a
 * person needs to see before agreeing: operation, shots, and the limits that
 * will apply. A model can call a tool in a loop; a person confirming a specific,
 * costed action cannot be looped.
 */
export interface McpMutatingToolDefinition<Input = unknown, Output = unknown> {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodType<Input>;
    outputSchema: z.ZodType<Output>;
    /** Always false here. The type exists so the distinction cannot be lost. */
    readOnly: false;
    /** True when the tool refuses to act without an explicit `confirmed: true`. */
    requiresConfirmation: boolean;
    handler: (input: Input, client: KetQatClient) => Promise<Output>;
}
export interface McpReadOnlyExecutionTool<Input = unknown, Output = unknown> {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodType<Input>;
    outputSchema: z.ZodType<Output>;
    readOnly: true;
    handler: (input: Input, client: KetQatClient) => Promise<Output>;
}
export declare const submitExecutionJobTool: McpMutatingToolDefinition;
export declare const getExecutionJobTool: McpReadOnlyExecutionTool;
export declare const cancelExecutionJobTool: McpMutatingToolDefinition;
export declare const EXECUTION_MCP_TOOLS: readonly [McpMutatingToolDefinition<unknown, unknown>, McpReadOnlyExecutionTool<unknown, unknown>, McpMutatingToolDefinition<unknown, unknown>];
/**
 * Tool listing for a host that has an authenticated client.
 *
 * `readOnly` and `requiresConfirmation` are both surfaced so a host can decide
 * what to expose. A host that wants a strictly read-only server filters on
 * `readOnly` and gets a working subset rather than nothing.
 */
export declare function listExecutionTools(): Array<{
    name: string;
    title: string;
    description: string;
    readOnly: boolean;
    requiresConfirmation: boolean;
}>;
//# sourceMappingURL=execution.d.ts.map