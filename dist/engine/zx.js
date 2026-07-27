import { evaluateParameter } from "./parameters.js";
import { checkCircuitEquivalence } from "./differential.js";
import { circuitDepth } from "./transpile.js";
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
export const ZX_OPTIMIZER = "ketqat-zx-subset";
export const ZX_OPTIMIZER_VERSION = "0.1.0";
/** Rewrites this optimizer knows, published so a caller can see what ran. */
export const SUPPORTED_REWRITES = [
    "identity_removal",
    "self_inverse_cancellation",
    "phase_fusion",
    "hadamard_pair_cancellation",
    "zero_phase_removal",
];
/** Gates that are their own inverse, so two in a row cancel. */
const SELF_INVERSE = new Set(["x", "y", "z", "h", "cx", "cnot", "cz", "cy", "swap", "id", "i"]);
/** Single-qubit gates whose phases add when composed. */
const PHASE_FAMILIES = new Set(["rz", "rx", "ry", "p", "u1"]);
const T_GATES = new Set(["t", "tdg"]);
function bitKey(bit) {
    return `${bit.register}[${bit.index}]`;
}
function sameQubits(left, right) {
    if (left.length !== right.length)
        return false;
    return left.every((bit, index) => bitKey(bit) === bitKey(right[index]));
}
function isGate(operation) {
    return operation.kind === "gate";
}
function countGates(circuit) {
    let gates = 0;
    let twoQubit = 0;
    let tCount = 0;
    const visit = (operation) => {
        if (operation.kind === "gate") {
            gates += 1;
            if (operation.qubits.length === 2)
                twoQubit += 1;
            if (T_GATES.has(operation.name.toLowerCase()))
                tCount += 1;
        }
        else if (operation.kind === "conditional") {
            visit(operation.body);
        }
    };
    circuit.operations.forEach(visit);
    return { gate_count: gates, two_qubit_gate_count: twoQubit, t_count: tCount, depth: circuitDepth(circuit) };
}
/**
 * Whether two operations may be reordered.
 *
 * Conservative on purpose. Anything touching a shared qubit blocks, and so does
 * any measurement, reset, barrier, or conditional, because reordering across
 * those changes the program. A rewrite that "optimizes" across a measurement is
 * not an optimization.
 */
function blocksRewriting(operation) {
    return operation.kind !== "gate";
}
function record(pass, rewrite, detail) {
    const existing = pass.applications.get(rewrite);
    if (existing) {
        existing.count += 1;
    }
    else {
        pass.applications.set(rewrite, { count: 1, detail });
    }
}
/** One sweep. Returns true when anything changed, so the caller can iterate. */
function sweep(pass) {
    const operations = pass.circuit.operations;
    let changed = false;
    for (let index = 0; index < operations.length; index += 1) {
        const current = operations[index];
        if (!isGate(current))
            continue;
        const name = current.name.toLowerCase();
        // Identity gates contribute nothing.
        if (name === "id" || name === "i") {
            operations.splice(index, 1);
            record(pass, "identity_removal", "Removed an explicit identity gate.");
            return true;
        }
        // A rotation of zero angle is the identity.
        if (PHASE_FAMILIES.has(name) && current.parameters.length === 1) {
            const angle = safeAngle(current.parameters[0]);
            if (angle !== null && Math.abs(normalizeAngle(angle)) < 1e-12) {
                operations.splice(index, 1);
                record(pass, "zero_phase_removal", "Removed a rotation of angle zero.");
                return true;
            }
        }
        // Find the next operation acting on any of the same qubits.
        const partnerIndex = nextInteracting(operations, index, current.qubits);
        if (partnerIndex === null)
            continue;
        const partner = operations[partnerIndex];
        if (!isGate(partner))
            continue;
        const partnerName = partner.name.toLowerCase();
        if (!sameQubits(current.qubits, partner.qubits))
            continue;
        // Two identical self-inverse gates in a row cancel.
        if (name === partnerName && SELF_INVERSE.has(name) && current.parameters.length === 0) {
            operations.splice(partnerIndex, 1);
            operations.splice(index, 1);
            record(pass, name === "h" ? "hadamard_pair_cancellation" : "self_inverse_cancellation", `Cancelled a pair of adjacent ${current.name} gates.`);
            return true;
        }
        // Adjacent rotations about the same axis add their phases.
        if (name === partnerName &&
            PHASE_FAMILIES.has(name) &&
            current.parameters.length === 1 &&
            partner.parameters.length === 1) {
            const a = safeAngle(current.parameters[0]);
            const b = safeAngle(partner.parameters[0]);
            if (a === null || b === null)
                continue;
            const total = normalizeAngle(a + b);
            operations.splice(partnerIndex, 1);
            if (Math.abs(total) < 1e-12) {
                operations.splice(index, 1);
                record(pass, "phase_fusion", `Fused two ${current.name} rotations that summed to zero.`);
            }
            else {
                operations[index] = { ...current, parameters: [total] };
                record(pass, "phase_fusion", `Fused two adjacent ${current.name} rotations.`);
            }
            changed = true;
            return true;
        }
    }
    return changed;
}
/** Index of the next operation touching any of `qubits`, or null. */
function nextInteracting(operations, from, qubits) {
    const keys = new Set(qubits.map(bitKey));
    for (let index = from + 1; index < operations.length; index += 1) {
        const operation = operations[index];
        if (blocksRewriting(operation)) {
            // Conservative: a measurement, reset, barrier, or conditional anywhere
            // after this point stops the search rather than being skipped over.
            return touchesAny(operation, keys) ? index : null;
        }
        if (touchesAny(operation, keys))
            return index;
    }
    return null;
}
function touchesAny(operation, keys) {
    switch (operation.kind) {
        case "gate":
            return operation.qubits.some((bit) => keys.has(bitKey(bit)));
        case "measure":
            return keys.has(bitKey(operation.qubit));
        case "reset":
            return keys.has(bitKey(operation.qubit));
        case "barrier":
            return operation.qubits.length === 0 || operation.qubits.some((bit) => keys.has(bitKey(bit)));
        case "conditional":
            return touchesAny(operation.body, keys);
    }
}
function safeAngle(parameter) {
    if (parameter === undefined)
        return null;
    try {
        return evaluateParameter(parameter);
    }
    catch {
        // A free parameter cannot be fused numerically. Leaving it alone is correct;
        // guessing a value would change the circuit.
        return null;
    }
}
/** Wrap an angle into (-pi, pi] so fused phases stay canonical. */
function normalizeAngle(angle) {
    const twoPi = Math.PI * 2;
    let wrapped = angle % twoPi;
    if (wrapped > Math.PI)
        wrapped -= twoPi;
    if (wrapped <= -Math.PI)
        wrapped += twoPi;
    return wrapped;
}
export function optimizeWithZx(circuit, options = {}) {
    const maxIterations = options.maxIterations ?? 200;
    const before = countGates(circuit);
    const working = {
        ...circuit,
        operations: circuit.operations.map((operation) => ({ ...operation })),
    };
    const pass = { circuit: working, applications: new Map() };
    let iterations = 0;
    while (iterations < maxIterations && sweep(pass)) {
        iterations += 1;
    }
    const after = countGates(working);
    const loss = [];
    if (iterations >= maxIterations) {
        loss.push({
            feature: "rewrite_iteration_limit",
            severity: "cosmetic",
            action: "approximated",
            detail: `Stopped after ${maxIterations} rewrite sweeps. The circuit is valid and equivalent, but ` +
                "further reductions may remain.",
        });
    }
    // Check rather than assert. This is the whole point: a rewrite engine that
    // claims correctness without verifying it is exactly what RFC 0002 forbids.
    const equivalence = checkCircuitEquivalence(circuit, working, {
        maxQubits: options.maxVerificationQubits,
    });
    const rewrites = [...pass.applications.entries()].map(([rewrite, entry]) => ({
        rewrite,
        count: entry.count,
        detail: entry.detail,
    }));
    return {
        circuit: working,
        rewrites,
        before,
        after,
        equivalence,
        loss_report: loss,
        transformation: {
            kind: "ZX_REWRITE",
            adapter: ZX_OPTIMIZER,
            adapter_version: ZX_OPTIMIZER_VERSION,
            options: {
                supported_rewrites: [...SUPPORTED_REWRITES],
                iterations,
                max_iterations: maxIterations,
            },
            loss_report: loss,
            equivalence,
        },
    };
}
//# sourceMappingURL=zx.js.map