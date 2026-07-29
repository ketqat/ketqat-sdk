import type { LossReportEntry } from "../contracts/common.js";
import type { QuantumCircuit } from "./graph.js";
/**
 * Emit OpenQASM 2 (ketqat-sdk#182).
 *
 * KetQat could already *read* OpenQASM 2 -- that landed so Cirq's output could be
 * imported -- but it only ever *wrote* OpenQASM 3. So interoperability with the
 * two toolchains that speak OpenQASM 2 was a one-way door: pytket and Cirq
 * circuits could come in and nothing could go back out. pytket rejects OpenQASM 3
 * outright ("Header stdgates is not known"), so there was no route at all.
 *
 * Emitting an older dialect loses expressiveness, and the interesting part of this
 * module is which losses are acceptable and which are not.
 *
 * **Refused, because emitting them would change the program.** OpenQASM 2's
 * conditional is `if (creg == N)` over a whole register. A single-bit condition --
 * `if (c[1])`, which Qiskit emits for dynamic circuits -- has no equivalent, and
 * widening it to a whole-register test is not a degraded translation but a
 * different program: `c[1] == 1` is true for many register values that `c == 1` is
 * false for. So it is refused rather than approximated. Hardware qubits (`$n`) are
 * likewise refused: OpenQASM 2 has no physical-qubit syntax, and declaring them as
 * a virtual register would assert a layout the circuit does not have.
 *
 * **Recorded, because the meaning survives.** The version and include line change,
 * and `qubit`/`bit` become `qreg`/`creg`. Those are spellings, not semantics, so
 * they are noted in the loss report and emitted.
 */
export interface Qasm2EmitResult {
    qasm: string;
    lossReport: LossReportEntry[];
}
export declare class Qasm2EmitError extends Error {
    readonly feature: string;
    constructor(message: string, feature: string);
}
/**
 * Emit a circuit as OpenQASM 2, with everything lost or refused reported.
 *
 * Returns the loss report alongside the text rather than only on failure, because
 * a caller sending this to another tool needs to know what changed even when the
 * emission succeeded.
 */
export declare function emitQasm2(circuit: QuantumCircuit): Qasm2EmitResult;
//# sourceMappingURL=qasm2.d.ts.map