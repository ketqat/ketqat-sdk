import type { LossReportEntry } from "../contracts/common.js";
import type { QuantumCircuit } from "./graph.js";
/**
 * OpenQASM 3 adapter (RFC 0002).
 *
 * This implements a *declared subset*, and that is the point. The adapter
 * publishes exactly which constructs it supports, and anything outside that set
 * is rejected by name rather than parsed loosely and quietly dropped. A parser
 * that silently ignores what it does not understand is the precise mechanism by
 * which "the circuit that ran" stops being "the circuit the author wrote".
 *
 * Supporting more of the language is a matter of extending the subset and its
 * fixture corpus. Pretending to support it is not.
 */
export declare const QASM3_ADAPTER_NAME = "openqasm3-subset";
export declare const QASM3_ADAPTER_VERSION = "0.1.0";
/** Constructs this adapter understands. Anything else is rejected. */
export declare const SUPPORTED_FEATURES: readonly ["version_declaration", "include_stdgates", "qubit_declaration", "bit_declaration", "gate_application", "gate_parameters", "register_broadcast", "measurement", "reset", "barrier", "classical_condition_equality"];
export type SupportedFeature = (typeof SUPPORTED_FEATURES)[number];
export declare class Qasm3ParseError extends Error {
    readonly feature: string | undefined;
    readonly line: number | undefined;
    constructor(message: string, options?: {
        feature?: string;
        line?: number;
    });
}
export interface Qasm3ParseResult {
    circuit: QuantumCircuit;
    loss_report: LossReportEntry[];
}
export declare function parseQasm3(source: string): Qasm3ParseResult;
export interface EmitOptions {
    /** Emitted unless explicitly disabled; portable output should keep it. */
    includeStdgates?: boolean;
}
export declare function emitQasm3(circuit: QuantumCircuit, options?: EmitOptions): string;
//# sourceMappingURL=qasm3.d.ts.map