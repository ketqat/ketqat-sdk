import type { Operation, QuantumCircuit } from "./graph.js";
/**
 * Structural diff between two circuits (ketqat-sdk#198).
 *
 * Everything in this package that *transforms* a circuit -- ZX rewriting, routing,
 * transpilation, custom-gate inlining -- produces a new circuit with no way to see
 * what changed. A reader is left comparing two gate lists by eye, which is how a
 * transformation that inserted forty SWAPs gets described as "routed successfully".
 *
 * **The correctness property is accounting, and it is checkable exactly.** A diff is
 * sound only if every operation in both inputs appears in it exactly once: the
 * removed and unchanged entries must reconstruct the left circuit, and the unchanged
 * and added entries must reconstruct the right. That is not a heuristic -- it is an
 * identity, so `verifyDiff` can confirm it rather than estimate it. A diff that
 * loses an operation would otherwise look plausible while understating the change,
 * which is the failure that matters here.
 *
 * The alignment is a longest-common-subsequence over operation identity, so the
 * diff is minimal in edit count rather than merely valid. Two circuits always have
 * *some* valid diff -- delete everything, add everything -- and reporting that would
 * be technically correct and useless.
 */
export type DiffKind = "unchanged" | "added" | "removed";
export interface DiffEntry {
    kind: DiffKind;
    operation: Operation;
    /** Index in the left circuit, when the entry came from it. */
    leftIndex?: number;
    /** Index in the right circuit, when the entry came from it. */
    rightIndex?: number;
}
export interface GateCountDelta {
    name: string;
    left: number;
    right: number;
    delta: number;
}
export interface CircuitDiff {
    entries: DiffEntry[];
    unchanged: number;
    added: number;
    removed: number;
    /** Per-gate-name counts, so a change is attributable rather than just visible. */
    gateDeltas: GateCountDelta[];
    leftOperationCount: number;
    rightOperationCount: number;
    /** True when the circuits are operation-for-operation identical. */
    identical: boolean;
    summary: string;
}
export declare class CircuitDiffError extends Error {
}
/**
 * Canonical identity of an operation, for alignment.
 *
 * Includes the parameters: `rz(0.5) q[0]` and `rz(0.7) q[0]` are different
 * operations, and treating them as the same would hide an angle change -- the
 * quietest way for a transformation to alter a circuit's meaning.
 */
export declare function operationKey(operation: Operation): string;
/**
 * Diff two circuits operation by operation.
 *
 * Reports per-gate-name deltas alongside the entry list, because "43 operations
 * added" does not say whether a transformation inserted SWAPs or decomposed a
 * Toffoli, and those are different facts about the same count.
 */
export declare function diffCircuits(left: QuantumCircuit, right: QuantumCircuit): CircuitDiff;
export interface DiffVerification {
    /** Whether removed + unchanged reproduces the left circuit exactly. */
    reconstructsLeft: boolean;
    /** Whether unchanged + added reproduces the right circuit exactly. */
    reconstructsRight: boolean;
    sound: boolean;
    detail: string;
}
/**
 * Verify a diff accounts for every operation in both inputs.
 *
 * This is an identity, not a tolerance: a sound diff must reconstruct both sides
 * exactly. A diff that dropped an operation would still render as a plausible list
 * while understating the change, and understating a change is the specific way a
 * diff misleads.
 */
export declare function verifyDiff(left: QuantumCircuit, right: QuantumCircuit, diff: CircuitDiff): DiffVerification;
//# sourceMappingURL=diff.d.ts.map