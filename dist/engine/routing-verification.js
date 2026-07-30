import { couplingAdjacency } from "../hardware/profile.js";
import { simulateStatevector } from "./statevector.js";
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
export const MAX_VERIFIABLE_QUBITS = 12;
export class RoutingVerificationError extends Error {
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
export function unpermuteAmplitudes(amplitudes, finalLayout, totalQubits) {
    const size = 1 << totalQubits;
    if (amplitudes.real.length !== size) {
        throw new RoutingVerificationError(`Expected ${size} amplitudes for ${totalQubits} qubits, got ${amplitudes.real.length}.`);
    }
    const real = new Array(size).fill(0);
    const imaginary = new Array(size).fill(0);
    for (let routedIndex = 0; routedIndex < size; routedIndex += 1) {
        let logicalIndex = 0;
        for (const [logical, physical] of finalLayout.entries()) {
            if ((routedIndex >> physical) & 1)
                logicalIndex |= 1 << logical;
        }
        real[logicalIndex] = amplitudes.real[routedIndex];
        imaginary[logicalIndex] = amplitudes.imaginary[routedIndex];
    }
    return { real, imaginary };
}
function widthOf(circuit) {
    return circuit.qubit_registers.reduce((total, register) => total + register.size, 0);
}
function stripMeasurements(circuit) {
    return {
        ...circuit,
        operations: circuit.operations.filter((operation) => operation.kind !== "measure" && operation.kind !== "reset"),
    };
}
/**
 * Check a routed circuit is equivalent to its source and legal on the device.
 *
 * Both properties, because either alone is misleading: legality without
 * equivalence means a well-formed wrong circuit, and equivalence without legality
 * means a correct circuit the device cannot run.
 */
export function verifyRouting(original, routed, finalLayout, profile, swapCount = 0) {
    const adjacency = couplingAdjacency(profile);
    const offCouplingGates = [];
    for (const operation of routed.operations) {
        if (operation.kind !== "gate" || operation.qubits.length !== 2)
            continue;
        const first = operation.qubits[0]?.index;
        const second = operation.qubits[1]?.index;
        if (!adjacency.get(first)?.has(second)) {
            offCouplingGates.push({ name: operation.name, qubits: [first, second] });
        }
    }
    const originalWidth = widthOf(original);
    const routedWidth = widthOf(routed);
    const width = Math.max(originalWidth, routedWidth);
    if (width > MAX_VERIFIABLE_QUBITS) {
        return {
            verdict: "inconclusive",
            offCouplingGates,
            maxAmplitudeDifference: null,
            swapCount,
            detail: `${width} qubits is beyond the ${MAX_VERIFIABLE_QUBITS}-qubit limit for exact comparison, so ` +
                "equivalence is INCONCLUSIVE rather than assumed. The coupling check above still applies.",
        };
    }
    let originalState;
    let routedState;
    try {
        originalState = simulateStatevector(stripMeasurements(original), {}).statevector;
        routedState = simulateStatevector(stripMeasurements(routed), {}).statevector;
    }
    catch (error) {
        return {
            verdict: "inconclusive",
            offCouplingGates,
            maxAmplitudeDifference: null,
            swapCount,
            detail: `Could not simulate for comparison: ${error.message}`,
        };
    }
    if (!originalState || !routedState) {
        return {
            verdict: "inconclusive",
            offCouplingGates,
            maxAmplitudeDifference: null,
            swapCount,
            detail: "One of the circuits has no well-defined statevector, so equivalence cannot be decided.",
        };
    }
    // Pad the original up to the routed width: routing may spread a circuit across
    // more physical qubits than the logical circuit declared.
    const size = 1 << width;
    const paddedOriginal = { real: new Array(size).fill(0), imaginary: new Array(size).fill(0) };
    for (let index = 0; index < originalState.real.length; index += 1) {
        paddedOriginal.real[index] = originalState.real[index];
        paddedOriginal.imaginary[index] = originalState.imaginary[index];
    }
    const paddedRouted = { real: new Array(size).fill(0), imaginary: new Array(size).fill(0) };
    for (let index = 0; index < routedState.real.length; index += 1) {
        paddedRouted.real[index] = routedState.real[index];
        paddedRouted.imaginary[index] = routedState.imaginary[index];
    }
    // Physical qubits carrying no logical qubit stay at |0>, so they map to
    // themselves; the layout only describes where the logical ones went.
    const layout = [...finalLayout];
    const used = new Set(layout);
    for (let physical = 0; physical < width; physical += 1) {
        if (!used.has(physical))
            layout.push(physical);
    }
    const unpermuted = unpermuteAmplitudes(paddedRouted, layout, width);
    let maxDifference = 0;
    for (let index = 0; index < size; index += 1) {
        maxDifference = Math.max(maxDifference, Math.hypot(paddedOriginal.real[index] - unpermuted.real[index], paddedOriginal.imaginary[index] - unpermuted.imaginary[index]));
    }
    const equivalent = maxDifference < 1e-9 && offCouplingGates.length === 0;
    return {
        verdict: equivalent ? "equivalent" : "differs",
        offCouplingGates,
        maxAmplitudeDifference: maxDifference,
        swapCount,
        detail: equivalent
            ? `Routed circuit is equivalent to the original up to the final permutation (max amplitude difference ${maxDifference.toExponential(2)}), and every two-qubit gate lies on a coupling edge.`
            : offCouplingGates.length > 0
                ? `${offCouplingGates.length} two-qubit gate(s) do not lie on a coupling edge, so this circuit cannot run on the device.`
                : `Routed circuit is NOT equivalent to the original: max amplitude difference ${maxDifference.toExponential(2)} after undoing the permutation. Every gate is on a legal edge, which is exactly how a layout-tracking error hides.`,
    };
}
//# sourceMappingURL=routing-verification.js.map