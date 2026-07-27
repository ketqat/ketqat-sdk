import type { LossReportEntry } from "../contracts/common.js";
import type { CircuitTransformation } from "../contracts/transformation.js";
import type { QuantumCircuit } from "../circuit/graph.js";
import { type HardwareProfile } from "../hardware/profile.js";
/**
 * Hardware-aware transpilation: map logical qubits onto physical ones and
 * insert SWAPs so every two-qubit gate acts on a coupled pair.
 *
 * The routing is a deliberately simple, documented heuristic -- trivial initial
 * layout, then shortest-path SWAP insertion. It is not claimed to be optimal,
 * and `TranspileResult` reports the SWAP count and depth so a caller can
 * compare it against another compiler rather than take it on trust. Claiming
 * optimality here would be the kind of unsupported statement the platform is
 * built to avoid.
 */
export declare class TranspileError extends Error {
    constructor(message: string);
}
export declare const TRANSPILER_NAME = "ketqat-routing";
export declare const TRANSPILER_VERSION = "0.1.0";
export interface TranspileOptions {
    /**
     * Logical qubit i starts on physical `initial_layout[i]`. Defaults to the
     * identity layout, which is stated in the result so it is never mistaken for
     * an optimized choice.
     */
    initial_layout?: number[];
}
export interface TranspileResult {
    circuit: QuantumCircuit;
    /** Physical qubit holding each logical qubit at the start. */
    initial_layout: number[];
    /** Physical qubit holding each logical qubit at the end, after routing. */
    final_layout: number[];
    swap_count: number;
    two_qubit_gate_count: number;
    depth: number;
    loss_report: LossReportEntry[];
    transformation: CircuitTransformation;
}
/** Circuit depth counting each operation as one layer per qubit it touches. */
export declare function circuitDepth(circuit: QuantumCircuit): number;
export declare function transpileForHardware(circuit: QuantumCircuit, profile: HardwareProfile, options?: TranspileOptions): TranspileResult;
//# sourceMappingURL=transpile.d.ts.map