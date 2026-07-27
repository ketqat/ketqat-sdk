import { type ExecutionJob, type JobResult } from "./job.js";
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
export declare const WORKER_VERSION = "0.1.0";
export declare function executeJob(job: ExecutionJob): Promise<JobResult>;
/**
 * Bound the serialized result.
 *
 * A job that produces a legitimate but enormous result -- a full statevector at
 * the qubit ceiling, say -- would otherwise exhaust storage by succeeding. The
 * job is marked failed with an explanation rather than silently truncated,
 * because a truncated scientific result is worse than none.
 */
export declare function enforceResultSize(result: JobResult, maxBytes: number): JobResult;
//# sourceMappingURL=execute.d.ts.map