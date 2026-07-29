import type { LossReportEntry } from "../contracts/common.js";
import type { CircuitTransformation, EquivalenceEvidence } from "../contracts/transformation.js";
import type { QuantumCircuit } from "../circuit/graph.js";
/**
 * ZX-calculus circuit optimization over a declared rewrite set (RFC 0002).
 *
 * Scope, stated plainly because the alternative is an unsupported claim: this
 * implements a small, named set of sound rewrites over the phase-polynomial
 * fragment of a circuit. It is not a full ZX rewriting engine, it does not
 * perform `full_reduce` or circuit extraction, and it does not claim to match a
 * dedicated tool such as PyZX. What it does do is apply each rewrite only where
 * that rewrite is valid, and then *check* the result rather than assert it.
 *
 * Every optimization returns equivalence evidence produced by exact simulation
 * where the circuit is small enough. Above that width the evidence is
 * `INCONCLUSIVE` with a reason -- never a claim that the rewrite was verified,
 * and never `FAILED`.
 */
export declare const ZX_OPTIMIZER = "ketqat-zx-subset";
export declare const ZX_OPTIMIZER_VERSION = "0.1.0";
/** Rewrites this optimizer knows, published so a caller can see what ran. */
export declare const SUPPORTED_REWRITES: readonly ["identity_removal", "self_inverse_cancellation", "phase_fusion", "hadamard_pair_cancellation", "zero_phase_removal", "hadamard_conjugation", "spider_fusion"];
export type ZxRewrite = (typeof SUPPORTED_REWRITES)[number];
export interface RewriteApplication {
    rewrite: ZxRewrite;
    /** How many times this rewrite fired. */
    count: number;
    detail: string;
}
export interface ZxOptimizeResult {
    circuit: QuantumCircuit;
    rewrites: RewriteApplication[];
    before: {
        gate_count: number;
        two_qubit_gate_count: number;
        t_count: number;
        depth: number;
    };
    after: {
        gate_count: number;
        two_qubit_gate_count: number;
        t_count: number;
        depth: number;
    };
    equivalence: EquivalenceEvidence;
    loss_report: LossReportEntry[];
    transformation: CircuitTransformation;
}
export interface ZxOptimizeOptions {
    /** Cap on sweeps, so a pathological circuit cannot loop forever. */
    maxIterations?: number;
    /** Above this width, equivalence is reported INCONCLUSIVE rather than checked. */
    maxVerificationQubits?: number;
}
export declare function optimizeWithZx(circuit: QuantumCircuit, options?: ZxOptimizeOptions): ZxOptimizeResult;
//# sourceMappingURL=zx.d.ts.map