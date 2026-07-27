import { emitQasm3, parseQasm3, Qasm3ParseError } from "../circuit/qasm3.js";
import { totalQubits } from "../circuit/graph.js";
import { checkCircuitEquivalence } from "../engine/differential.js";
import { estimateResources } from "../engine/resources.js";
import { simulateStatevector } from "../engine/statevector.js";
import { transpileForHardware } from "../engine/transpile.js";
import { optimizeWithZx } from "../engine/zx.js";
import { zeroNoiseExtrapolation } from "../engine/mitigation.js";
import { JobRejectedError, assertWithinLimits } from "./job.js";
/**
 * Worker execution.
 *
 * Runs one validated job. Every branch dispatches to an engine function by an
 * enum value the schema already constrained, so there is no path from job input
 * to a dynamically chosen callee -- no lookup by user-supplied name, no
 * dynamic import, no `eval`.
 *
 * This function is designed to run inside an isolated job container, never in
 * the web process. Nothing here reads a credential, opens a socket, or touches
 * the filesystem, so a compromise of this code has nothing to reach.
 */
export const WORKER_VERSION = "0.1.0";
export async function executeJob(job) {
    const startedAt = new Date();
    const start = Date.now();
    const finish = (partial) => ({
        schema_version: "0.1",
        job_id: job.job_id,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        // Always SIMULATION here: this worker does not reach hardware, so its
        // results can never be mislabelled as device measurements.
        execution_class: "SIMULATION",
        worker_version: WORKER_VERSION,
        ...partial,
    });
    try {
        assertWithinLimits(job);
        const output = await runOperation(job);
        return finish({ status: "SUCCEEDED", operation: job.parameters.operation, output });
    }
    catch (error) {
        // Errors are summarized, never a raw stack trace: a trace can carry file
        // paths and, in the worst case, values from the surrounding process.
        const message = error instanceof Qasm3ParseError
            ? `Circuit could not be parsed: ${error.message}`
            : error instanceof JobRejectedError
                ? error.message
                : `Job failed: ${error.message}`;
        return finish({ status: "FAILED", operation: job.parameters.operation, error: message });
    }
}
async function runOperation(job) {
    const { parameters, limits } = job;
    const parse = (qasm) => {
        const parsed = parseQasm3(qasm);
        const qubits = totalQubits(parsed.circuit);
        if (qubits > limits.max_qubits) {
            throw new JobRejectedError(`Circuit uses ${qubits} qubits, above this job's limit of ${limits.max_qubits}.`);
        }
        return parsed;
    };
    switch (parameters.operation) {
        case "simulate": {
            const { circuit, loss_report } = parse(parameters.qasm);
            const result = simulateStatevector(circuit, {
                shots: parameters.shots,
                seed: parameters.seed,
                noise: parameters.noise,
            });
            return { ...result, loss_report };
        }
        case "transpile": {
            const { circuit, loss_report } = parse(parameters.qasm);
            const routed = transpileForHardware(circuit, parameters.hardware_profile);
            return {
                qasm3: emitQasm3(routed.circuit),
                initial_layout: routed.initial_layout,
                final_layout: routed.final_layout,
                swap_count: routed.swap_count,
                depth: routed.depth,
                loss_report: [...loss_report, ...routed.loss_report],
                transformation: routed.transformation,
            };
        }
        case "estimate_resources": {
            const { circuit, loss_report } = parse(parameters.qasm);
            return { ...estimateResources(circuit, parameters.hardware_profile), loss_report };
        }
        case "optimize_zx": {
            const { circuit, loss_report } = parse(parameters.qasm);
            const optimized = optimizeWithZx(circuit);
            return {
                qasm3: emitQasm3(optimized.circuit),
                before: optimized.before,
                after: optimized.after,
                rewrites: optimized.rewrites,
                equivalence: optimized.equivalence,
                loss_report: [...loss_report, ...optimized.loss_report],
            };
        }
        case "check_equivalence": {
            const left = parse(parameters.left_qasm);
            const right = parse(parameters.right_qasm);
            return {
                evidence: checkCircuitEquivalence(left.circuit, right.circuit, {
                    tolerance: parameters.tolerance,
                }),
            };
        }
        case "mitigate_zne": {
            const { circuit } = parse(parameters.qasm);
            const result = zeroNoiseExtrapolation(circuit, parameters.noise, {
                shots: parameters.shots,
                seed: parameters.seed,
            });
            return { ...result };
        }
    }
}
/**
 * Bound the serialized result.
 *
 * A job that produces a legitimate but enormous result -- a full statevector at
 * the qubit ceiling, say -- would otherwise exhaust storage by succeeding. The
 * job is marked failed with an explanation rather than silently truncated,
 * because a truncated scientific result is worse than none.
 */
export function enforceResultSize(result, maxBytes) {
    const serialized = JSON.stringify(result);
    if (Buffer.byteLength(serialized, "utf8") <= maxBytes)
        return result;
    return {
        ...result,
        status: "FAILED",
        output: undefined,
        error: `Result exceeded the ${maxBytes}-byte limit for this job. It is reported as failed rather than ` +
            "truncated, because a partial scientific result is worse than none. Reduce the shot count or " +
            "request a narrower output.",
    };
}
//# sourceMappingURL=execute.js.map