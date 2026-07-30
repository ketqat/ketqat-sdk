import type { QuantumCircuit } from "../circuit/graph.js";
import { type HardwareProfile } from "../hardware/profile.js";
/**
 * Verify a routed circuit against the one it came from (ketqat-sdk#194).
 *
 * Routing already existed in `transpileForHardware` -- SWAP insertion, shortest
 * path, layout tracking -- and was tested for the property that is easy to test:
 * every two-qubit gate lands on a real coupling edge. That check is necessary and
 * badly insufficient. A layout-tracking error produces gates that are all on legal
 * edges and computes the wrong circuit, which is the failure mode most likely to
 * survive: the output looks structurally perfect.
 *
 * The property that actually matters is semantic. A routed circuit does not equal
 * the original -- the qubits have moved -- but it must equal it **up to the final
 * permutation**. So the check is:
 *
 *     routed statevector, with amplitude indices un-permuted by final_layout,
 *     equals the original circuit's statevector
 *
 * Anything less is checking that the compiler produced plausible output rather than
 * correct output.
 *
 * Exponential in qubit count, so it refuses above a width rather than crawling, and
 * reports INCONCLUSIVE rather than assuming a large circuit is fine.
 */
export declare const MAX_VERIFIABLE_QUBITS = 12;
export declare class RoutingVerificationError extends Error {
}
export interface RoutingVerification {
    verdict: "equivalent" | "differs" | "inconclusive";
    /** Two-qubit gates that do not lie on a coupling edge. Must be empty. */
    offCouplingGates: Array<{
        name: string;
        qubits: number[];
    }>;
    /** Largest amplitude difference after undoing the permutation. */
    maxAmplitudeDifference: number | null;
    swapCount: number;
    detail: string;
}
/**
 * Undo the routing permutation on a statevector.
 *
 * Logical qubit l ends on physical `finalLayout[l]`, so bit `finalLayout[l]` of a
 * routed amplitude index carries what bit `l` carries in the original. Getting this
 * direction backwards produces a comparison that fails on asymmetric states and
 * passes on symmetric ones -- the same trap that made the pytket agreement look
 * exact when it was uninformative, so the direction is stated rather than guessed.
 */
export declare function unpermuteAmplitudes(amplitudes: {
    real: number[];
    imaginary: number[];
}, finalLayout: number[], totalQubits: number): {
    real: number[];
    imaginary: number[];
};
/**
 * Check a routed circuit is equivalent to its source and legal on the device.
 *
 * Both properties, because either alone is misleading: legality without
 * equivalence means a well-formed wrong circuit, and equivalence without legality
 * means a correct circuit the device cannot run.
 */
export declare function verifyRouting(original: QuantumCircuit, routed: QuantumCircuit, finalLayout: number[], profile: HardwareProfile, swapCount?: number): RoutingVerification;
//# sourceMappingURL=routing-verification.d.ts.map