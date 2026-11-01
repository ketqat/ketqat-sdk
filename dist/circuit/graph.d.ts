import { z } from "zod";
/**
 * Typed circuit graph -- the internal working representation (RFC 0002).
 *
 * This is deliberately NOT a public interchange format. It exists so editing,
 * layout, diffing, and conversion operate on structure rather than on text.
 * Programs cross the API boundary as OpenQASM 3 or as manifests; this shape
 * carries no cross-version compatibility guarantee.
 */
export declare const RegisterSchema: z.ZodObject<{
    name: z.ZodString;
    size: z.ZodNumber;
}, z.core.$strip>;
export type Register = z.infer<typeof RegisterSchema>;
/** A single indexed bit, e.g. `q[2]`. */
export declare const BitRefSchema: z.ZodObject<{
    register: z.ZodString;
    index: z.ZodNumber;
}, z.core.$strip>;
export type BitRef = z.infer<typeof BitRefSchema>;
/**
 * A gate parameter. Numbers are literal; strings hold an unevaluated
 * expression such as `pi/2` or a free parameter name.
 *
 * Expressions are kept verbatim rather than evaluated at parse time, because
 * evaluating `pi/2` to a float and re-emitting it would silently change the
 * program text and defeat round-tripping.
 */
export declare const ParameterSchema: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
export type Parameter = z.infer<typeof ParameterSchema>;
export declare const GateOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"gate">;
    name: z.ZodString;
    parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    qubits: z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GateOperation = z.infer<typeof GateOperationSchema>;
export declare const MeasureOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"measure">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
    clbit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type MeasureOperation = z.infer<typeof MeasureOperationSchema>;
export declare const ResetOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ResetOperation = z.infer<typeof ResetOperationSchema>;
export declare const BarrierOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"barrier">;
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type BarrierOperation = z.infer<typeof BarrierOperationSchema>;
/** Everything that may appear as the body of a classical condition. */
export declare const SimpleOperationSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"gate">;
    name: z.ZodString;
    parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    qubits: z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"measure">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
    clbit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"barrier">;
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>], "kind">;
export type SimpleOperation = z.infer<typeof SimpleOperationSchema>;
/**
 * Classically conditioned operation: `if (c == 1) x q[0];`
 *
 * Modelled explicitly rather than as an attribute on the inner operation so
 * that a converter targeting a backend without feed-forward has to notice it
 * and report the loss, instead of quietly emitting the body unconditionally.
 *
 * The body is a `SimpleOperation`, so conditions do not nest. That is a stated
 * limit of the representation rather than an accident: nested conditions need a
 * scoping model this subset does not have, and rejecting them is better than
 * accepting them and flattening the semantics.
 */
export declare const ConditionalOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"conditional">;
    register: z.ZodString;
    bit: z.ZodOptional<z.ZodNumber>;
    equals: z.ZodNumber;
    body: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"gate">;
        name: z.ZodString;
        parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
        qubits: z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"measure">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
        clbit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"reset">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"barrier">;
        qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>>>;
    }, z.core.$strip>], "kind">;
}, z.core.$strip>;
export type ConditionalOperation = z.infer<typeof ConditionalOperationSchema>;
export declare const OperationSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"gate">;
    name: z.ZodString;
    parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    qubits: z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"measure">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
    clbit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"barrier">;
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"conditional">;
    register: z.ZodString;
    bit: z.ZodOptional<z.ZodNumber>;
    equals: z.ZodNumber;
    body: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"gate">;
        name: z.ZodString;
        parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
        qubits: z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"measure">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
        clbit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"reset">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"barrier">;
        qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>>>;
    }, z.core.$strip>], "kind">;
}, z.core.$strip>], "kind">;
export type Operation = z.infer<typeof OperationSchema>;
export declare const QuantumCircuitSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    qubit_registers: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        size: z.ZodNumber;
    }, z.core.$strip>>>;
    clbit_registers: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        size: z.ZodNumber;
    }, z.core.$strip>>>;
    operations: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"gate">;
        name: z.ZodString;
        parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
        qubits: z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"measure">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
        clbit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"reset">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"barrier">;
        qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, z.core.$strip>>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"conditional">;
        register: z.ZodString;
        bit: z.ZodOptional<z.ZodNumber>;
        equals: z.ZodNumber;
        body: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"gate">;
            name: z.ZodString;
            parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
            qubits: z.ZodArray<z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>, z.ZodObject<{
            kind: z.ZodLiteral<"measure">;
            qubit: z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, z.core.$strip>;
            clbit: z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            kind: z.ZodLiteral<"reset">;
            qubit: z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            kind: z.ZodLiteral<"barrier">;
            qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, z.core.$strip>>>;
        }, z.core.$strip>], "kind">;
    }, z.core.$strip>], "kind">>>;
}, z.core.$strip>;
export type QuantumCircuit = z.infer<typeof QuantumCircuitSchema>;
export declare function totalQubits(circuit: QuantumCircuit): number;
export declare function totalClbits(circuit: QuantumCircuit): number;
/** Counts every operation, including the bodies of conditionals. */
export declare function operationCount(circuit: QuantumCircuit): number;
export declare function gateCount(circuit: QuantumCircuit): number;
export declare function twoQubitGateCount(circuit: QuantumCircuit): number;
export declare function usesMidCircuitMeasurement(circuit: QuantumCircuit): boolean;
export declare function usesClassicalControl(circuit: QuantumCircuit): boolean;
export declare function usesReset(circuit: QuantumCircuit): boolean;
//# sourceMappingURL=graph.d.ts.map