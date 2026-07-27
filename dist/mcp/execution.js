import { z } from "zod";
import { parseQasm3, Qasm3ParseError } from "../circuit/qasm3.js";
import { totalQubits } from "../circuit/graph.js";
const JobIdInput = z.object({
    job_id: z.string().min(1).describe("Id returned by submit_execution_job."),
});
const JobOutput = z.object({
    job: z.record(z.unknown()).optional(),
    events: z.array(z.record(z.unknown())).optional(),
    error: z.string().optional(),
    message: z.string().optional(),
});
const SubmitInput = z.object({
    qasm: z.string().min(1).describe("OpenQASM 3 source to simulate."),
    shots: z.number().int().positive().max(100000).optional(),
    seed: z.number().int().nonnegative().optional(),
    idempotency_key: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("Reuse to make a retry safe: the same key returns the original job rather than a second run."),
    confirmed: z
        .boolean()
        .default(false)
        .describe("Must be true to queue the job. Call once with confirmed false to see what would run, show " +
        "that to the person, and call again only after they agree."),
});
export const submitExecutionJobTool = {
    name: "submit_execution_job",
    title: "Queue a circuit for sandboxed execution",
    description: "Queue an OpenQASM 3 circuit to run in an isolated container with enforced limits and an audit " +
        "trail. This does not execute anything locally and does not reach quantum hardware; every result " +
        "is recorded as SIMULATION. Requires confirmed: true. Call with confirmed: false first to obtain " +
        "the confirmation summary, show it to the person, and call again only if they agree.",
    inputSchema: SubmitInput,
    outputSchema: JobOutput.extend({
        confirmation_required: z.boolean().optional(),
        summary: z.record(z.unknown()).optional(),
    }),
    readOnly: false,
    requiresConfirmation: true,
    handler: async (input, client) => {
        const parsed = SubmitInput.parse(input);
        // Parsed before anything else so an unsupported construct is named here,
        // rather than surfacing as a validation failure from the control plane
        // after the person has already confirmed.
        let qubits;
        let conversionLoss;
        try {
            const { circuit, loss_report: loss } = parseQasm3(parsed.qasm);
            qubits = totalQubits(circuit);
            conversionLoss = loss;
        }
        catch (error) {
            if (error instanceof Qasm3ParseError) {
                return {
                    error: "qasm_parse_error",
                    message: error.message,
                    summary: { feature: error.feature ?? null, line: error.line ?? null },
                };
            }
            throw error;
        }
        const shots = parsed.shots ?? 1024;
        if (!parsed.confirmed) {
            // Everything the person needs, in the refusal itself. A confirmation
            // prompt that omits the cost is not a confirmation.
            return {
                confirmation_required: true,
                message: `This will queue a ${shots}-shot simulation of a ${qubits}-qubit circuit in a sandboxed ` +
                    "container. It reaches no quantum hardware and spends no provider quota. Show this to the " +
                    "person and call again with confirmed: true only if they agree.",
                summary: {
                    operation: "simulate",
                    qubits,
                    shots,
                    seed: parsed.seed ?? null,
                    execution_class: "SIMULATION",
                    reaches_hardware: false,
                    spends_provider_quota: false,
                    // Surfaced in the confirmation, not after it. A circuit that lost
                    // something in conversion answers a different question than the one
                    // the person asked, and they should learn that before agreeing.
                    ...(conversionLoss.length > 0 ? { conversion_loss: conversionLoss } : {}),
                },
            };
        }
        const submitted = await client.execution.submit({
            schema_version: "1.0",
            parameters: {
                operation: "simulate",
                qasm: parsed.qasm,
                shots,
                ...(parsed.seed !== undefined ? { seed: parsed.seed } : {}),
            },
        }, parsed.idempotency_key ? { idempotencyKey: parsed.idempotency_key } : {});
        return {
            job: (submitted.job ?? {}),
            message: submitted.created === false
                ? "A job with this idempotency key already existed; returning it rather than running the work twice."
                : "Queued. Poll get_execution_job until it reaches a terminal status.",
        };
    },
};
export const getExecutionJobTool = {
    name: "get_execution_job",
    title: "Read one execution job",
    description: "Status, result, and audit trail for a job you submitted. A job belonging to another user is " +
        "reported as not found. Poll this rather than assuming a job finished.",
    inputSchema: JobIdInput,
    outputSchema: JobOutput,
    readOnly: true,
    handler: async (input, client) => {
        const { job_id: jobId } = JobIdInput.parse(input);
        return client.execution.get(jobId);
    },
};
export const cancelExecutionJobTool = {
    name: "cancel_execution_job",
    title: "Request cancellation of an execution job",
    description: "Ask for a job to stop. A queued job is cancelled outright; a job already running is not " +
        "interrupted and stops at its next transition, so a result may still arrive. Reporting it as " +
        "stopped before that would be untrue.",
    inputSchema: JobIdInput,
    outputSchema: JobOutput.extend({ cancelled: z.boolean().optional() }),
    readOnly: false,
    // Cancelling is destructive only of work in progress, and the failure mode of
    // an unwanted cancel is far smaller than that of an unwanted submission.
    // Requiring confirmation here would mostly teach a model to confirm reflexively.
    requiresConfirmation: false,
    handler: async (input, client) => {
        const { job_id: jobId } = JobIdInput.parse(input);
        return client.execution.cancel(jobId);
    },
};
export const EXECUTION_MCP_TOOLS = [
    submitExecutionJobTool,
    getExecutionJobTool,
    cancelExecutionJobTool,
];
/**
 * Tool listing for a host that has an authenticated client.
 *
 * `readOnly` and `requiresConfirmation` are both surfaced so a host can decide
 * what to expose. A host that wants a strictly read-only server filters on
 * `readOnly` and gets a working subset rather than nothing.
 */
export function listExecutionTools() {
    return EXECUTION_MCP_TOOLS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        readOnly: tool.readOnly,
        requiresConfirmation: "requiresConfirmation" in tool ? tool.requiresConfirmation : false,
    }));
}
//# sourceMappingURL=execution.js.map