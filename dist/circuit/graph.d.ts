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
}, "strip", z.ZodTypeAny, {
    name: string;
    size: number;
}, {
    name: string;
    size: number;
}>;
export type Register = z.infer<typeof RegisterSchema>;
/** A single indexed bit, e.g. `q[2]`. */
export declare const BitRefSchema: z.ZodObject<{
    register: z.ZodString;
    index: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    register: string;
    index: number;
}, {
    register: string;
    index: number;
}>;
export type BitRef = z.infer<typeof BitRefSchema>;
/**
 * A gate parameter. Numbers are literal; strings hold an unevaluated
 * expression such as `pi/2` or a free parameter name.
 *
 * Expressions are kept verbatim rather than evaluated at parse time, because
 * evaluating `pi/2` to a float and re-emitting it would silently change the
 * program text and defeat round-tripping.
 */
export declare const ParameterSchema: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
export type Parameter = z.infer<typeof ParameterSchema>;
export declare const GateOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"gate">;
    name: z.ZodString;
    parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
    qubits: z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    kind: "gate";
    name: string;
    parameters: (string | number)[];
    qubits: {
        register: string;
        index: number;
    }[];
}, {
    kind: "gate";
    name: string;
    parameters?: (string | number)[] | undefined;
    qubits: {
        register: string;
        index: number;
    }[];
}>;
export type GateOperation = z.infer<typeof GateOperationSchema>;
export declare const MeasureOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"measure">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
    clbit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
}, "strip", z.ZodTypeAny, {
    kind: "measure";
    qubit: {
        register: string;
        index: number;
    };
    clbit: {
        register: string;
        index: number;
    };
}, {
    kind: "measure";
    qubit: {
        register: string;
        index: number;
    };
    clbit: {
        register: string;
        index: number;
    };
}>;
export type MeasureOperation = z.infer<typeof MeasureOperationSchema>;
export declare const ResetOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
}, "strip", z.ZodTypeAny, {
    kind: "reset";
    qubit: {
        register: string;
        index: number;
    };
}, {
    kind: "reset";
    qubit: {
        register: string;
        index: number;
    };
}>;
export type ResetOperation = z.infer<typeof ResetOperationSchema>;
export declare const BarrierOperationSchema: z.ZodObject<{
    kind: z.ZodLiteral<"barrier">;
    /** Empty means "all qubits". */
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    kind: "barrier";
    qubits: {
        register: string;
        index: number;
    }[];
}, {
    kind: "barrier";
    qubits?: {
        register: string;
        index: number;
    }[] | undefined;
}>;
export type BarrierOperation = z.infer<typeof BarrierOperationSchema>;
/** Everything that may appear as the body of a classical condition. */
export declare const SimpleOperationSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"gate">;
    name: z.ZodString;
    parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
    qubits: z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    kind: "gate";
    name: string;
    parameters: (string | number)[];
    qubits: {
        register: string;
        index: number;
    }[];
}, {
    kind: "gate";
    name: string;
    parameters?: (string | number)[] | undefined;
    qubits: {
        register: string;
        index: number;
    }[];
}>, z.ZodObject<{
    kind: z.ZodLiteral<"measure">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
    clbit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
}, "strip", z.ZodTypeAny, {
    kind: "measure";
    qubit: {
        register: string;
        index: number;
    };
    clbit: {
        register: string;
        index: number;
    };
}, {
    kind: "measure";
    qubit: {
        register: string;
        index: number;
    };
    clbit: {
        register: string;
        index: number;
    };
}>, z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
}, "strip", z.ZodTypeAny, {
    kind: "reset";
    qubit: {
        register: string;
        index: number;
    };
}, {
    kind: "reset";
    qubit: {
        register: string;
        index: number;
    };
}>, z.ZodObject<{
    kind: z.ZodLiteral<"barrier">;
    /** Empty means "all qubits". */
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    kind: "barrier";
    qubits: {
        register: string;
        index: number;
    }[];
}, {
    kind: "barrier";
    qubits?: {
        register: string;
        index: number;
    }[] | undefined;
}>]>;
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
    /**
     * Index of a single classical bit to test, when the condition is on one bit
     * rather than the whole register.
     *
     * Optional and additive: absent means the existing whole-register comparison,
     * so every circuit written before this field existed keeps its meaning.
     *
     * A single-bit test cannot be expressed as a whole-register comparison --
     * `c[1] == 1` is true for many register values -- so it needs its own field
     * rather than a cleverly chosen `equals` (ketqat-sdk#172).
     */
    bit: z.ZodOptional<z.ZodNumber>;
    /** Value the register, or the single bit when `bit` is set, must equal. */
    equals: z.ZodNumber;
    body: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"gate">;
        name: z.ZodString;
        parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
        qubits: z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        kind: "gate";
        name: string;
        parameters: (string | number)[];
        qubits: {
            register: string;
            index: number;
        }[];
    }, {
        kind: "gate";
        name: string;
        parameters?: (string | number)[] | undefined;
        qubits: {
            register: string;
            index: number;
        }[];
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"measure">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
        clbit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    }, {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"reset">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    }, {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"barrier">;
        /** Empty means "all qubits". */
        qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        kind: "barrier";
        qubits: {
            register: string;
            index: number;
        }[];
    }, {
        kind: "barrier";
        qubits?: {
            register: string;
            index: number;
        }[] | undefined;
    }>]>;
}, "strip", z.ZodTypeAny, {
    kind: "conditional";
    register: string;
    bit?: number | undefined;
    equals: number;
    body: {
        kind: "gate";
        name: string;
        parameters: (string | number)[];
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    } | {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    } | {
        kind: "barrier";
        qubits: {
            register: string;
            index: number;
        }[];
    };
}, {
    kind: "conditional";
    register: string;
    bit?: number | undefined;
    equals: number;
    body: {
        kind: "gate";
        name: string;
        parameters?: (string | number)[] | undefined;
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    } | {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    } | {
        kind: "barrier";
        qubits?: {
            register: string;
            index: number;
        }[] | undefined;
    };
}>;
export type ConditionalOperation = z.infer<typeof ConditionalOperationSchema>;
export declare const OperationSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"gate">;
    name: z.ZodString;
    parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
    qubits: z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    kind: "gate";
    name: string;
    parameters: (string | number)[];
    qubits: {
        register: string;
        index: number;
    }[];
}, {
    kind: "gate";
    name: string;
    parameters?: (string | number)[] | undefined;
    qubits: {
        register: string;
        index: number;
    }[];
}>, z.ZodObject<{
    kind: z.ZodLiteral<"measure">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
    clbit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
}, "strip", z.ZodTypeAny, {
    kind: "measure";
    qubit: {
        register: string;
        index: number;
    };
    clbit: {
        register: string;
        index: number;
    };
}, {
    kind: "measure";
    qubit: {
        register: string;
        index: number;
    };
    clbit: {
        register: string;
        index: number;
    };
}>, z.ZodObject<{
    kind: z.ZodLiteral<"reset">;
    qubit: z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>;
}, "strip", z.ZodTypeAny, {
    kind: "reset";
    qubit: {
        register: string;
        index: number;
    };
}, {
    kind: "reset";
    qubit: {
        register: string;
        index: number;
    };
}>, z.ZodObject<{
    kind: z.ZodLiteral<"barrier">;
    /** Empty means "all qubits". */
    qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        register: z.ZodString;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        register: string;
        index: number;
    }, {
        register: string;
        index: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    kind: "barrier";
    qubits: {
        register: string;
        index: number;
    }[];
}, {
    kind: "barrier";
    qubits?: {
        register: string;
        index: number;
    }[] | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"conditional">;
    register: z.ZodString;
    /**
     * Index of a single classical bit to test, when the condition is on one bit
     * rather than the whole register.
     *
     * Optional and additive: absent means the existing whole-register comparison,
     * so every circuit written before this field existed keeps its meaning.
     *
     * A single-bit test cannot be expressed as a whole-register comparison --
     * `c[1] == 1` is true for many register values -- so it needs its own field
     * rather than a cleverly chosen `equals` (ketqat-sdk#172).
     */
    bit: z.ZodOptional<z.ZodNumber>;
    /** Value the register, or the single bit when `bit` is set, must equal. */
    equals: z.ZodNumber;
    body: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"gate">;
        name: z.ZodString;
        parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
        qubits: z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        kind: "gate";
        name: string;
        parameters: (string | number)[];
        qubits: {
            register: string;
            index: number;
        }[];
    }, {
        kind: "gate";
        name: string;
        parameters?: (string | number)[] | undefined;
        qubits: {
            register: string;
            index: number;
        }[];
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"measure">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
        clbit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    }, {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"reset">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    }, {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"barrier">;
        /** Empty means "all qubits". */
        qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        kind: "barrier";
        qubits: {
            register: string;
            index: number;
        }[];
    }, {
        kind: "barrier";
        qubits?: {
            register: string;
            index: number;
        }[] | undefined;
    }>]>;
}, "strip", z.ZodTypeAny, {
    kind: "conditional";
    register: string;
    bit?: number | undefined;
    equals: number;
    body: {
        kind: "gate";
        name: string;
        parameters: (string | number)[];
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    } | {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    } | {
        kind: "barrier";
        qubits: {
            register: string;
            index: number;
        }[];
    };
}, {
    kind: "conditional";
    register: string;
    bit?: number | undefined;
    equals: number;
    body: {
        kind: "gate";
        name: string;
        parameters?: (string | number)[] | undefined;
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    } | {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    } | {
        kind: "barrier";
        qubits?: {
            register: string;
            index: number;
        }[] | undefined;
    };
}>]>;
export type Operation = z.infer<typeof OperationSchema>;
export declare const QuantumCircuitSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    qubit_registers: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        size: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
    }, {
        name: string;
        size: number;
    }>, "many">>;
    clbit_registers: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        size: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
    }, {
        name: string;
        size: number;
    }>, "many">>;
    operations: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"gate">;
        name: z.ZodString;
        parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
        qubits: z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        kind: "gate";
        name: string;
        parameters: (string | number)[];
        qubits: {
            register: string;
            index: number;
        }[];
    }, {
        kind: "gate";
        name: string;
        parameters?: (string | number)[] | undefined;
        qubits: {
            register: string;
            index: number;
        }[];
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"measure">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
        clbit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    }, {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"reset">;
        qubit: z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    }, {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"barrier">;
        /** Empty means "all qubits". */
        qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
            register: z.ZodString;
            index: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            register: string;
            index: number;
        }, {
            register: string;
            index: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        kind: "barrier";
        qubits: {
            register: string;
            index: number;
        }[];
    }, {
        kind: "barrier";
        qubits?: {
            register: string;
            index: number;
        }[] | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"conditional">;
        register: z.ZodString;
        /**
         * Index of a single classical bit to test, when the condition is on one bit
         * rather than the whole register.
         *
         * Optional and additive: absent means the existing whole-register comparison,
         * so every circuit written before this field existed keeps its meaning.
         *
         * A single-bit test cannot be expressed as a whole-register comparison --
         * `c[1] == 1` is true for many register values -- so it needs its own field
         * rather than a cleverly chosen `equals` (ketqat-sdk#172).
         */
        bit: z.ZodOptional<z.ZodNumber>;
        /** Value the register, or the single bit when `bit` is set, must equal. */
        equals: z.ZodNumber;
        body: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
            kind: z.ZodLiteral<"gate">;
            name: z.ZodString;
            parameters: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">>;
            qubits: z.ZodArray<z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                register: string;
                index: number;
            }, {
                register: string;
                index: number;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            kind: "gate";
            name: string;
            parameters: (string | number)[];
            qubits: {
                register: string;
                index: number;
            }[];
        }, {
            kind: "gate";
            name: string;
            parameters?: (string | number)[] | undefined;
            qubits: {
                register: string;
                index: number;
            }[];
        }>, z.ZodObject<{
            kind: z.ZodLiteral<"measure">;
            qubit: z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                register: string;
                index: number;
            }, {
                register: string;
                index: number;
            }>;
            clbit: z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                register: string;
                index: number;
            }, {
                register: string;
                index: number;
            }>;
        }, "strip", z.ZodTypeAny, {
            kind: "measure";
            qubit: {
                register: string;
                index: number;
            };
            clbit: {
                register: string;
                index: number;
            };
        }, {
            kind: "measure";
            qubit: {
                register: string;
                index: number;
            };
            clbit: {
                register: string;
                index: number;
            };
        }>, z.ZodObject<{
            kind: z.ZodLiteral<"reset">;
            qubit: z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                register: string;
                index: number;
            }, {
                register: string;
                index: number;
            }>;
        }, "strip", z.ZodTypeAny, {
            kind: "reset";
            qubit: {
                register: string;
                index: number;
            };
        }, {
            kind: "reset";
            qubit: {
                register: string;
                index: number;
            };
        }>, z.ZodObject<{
            kind: z.ZodLiteral<"barrier">;
            /** Empty means "all qubits". */
            qubits: z.ZodDefault<z.ZodArray<z.ZodObject<{
                register: z.ZodString;
                index: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                register: string;
                index: number;
            }, {
                register: string;
                index: number;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            kind: "barrier";
            qubits: {
                register: string;
                index: number;
            }[];
        }, {
            kind: "barrier";
            qubits?: {
                register: string;
                index: number;
            }[] | undefined;
        }>]>;
    }, "strip", z.ZodTypeAny, {
        kind: "conditional";
        register: string;
        bit?: number | undefined;
        equals: number;
        body: {
            kind: "gate";
            name: string;
            parameters: (string | number)[];
            qubits: {
                register: string;
                index: number;
            }[];
        } | {
            kind: "measure";
            qubit: {
                register: string;
                index: number;
            };
            clbit: {
                register: string;
                index: number;
            };
        } | {
            kind: "reset";
            qubit: {
                register: string;
                index: number;
            };
        } | {
            kind: "barrier";
            qubits: {
                register: string;
                index: number;
            }[];
        };
    }, {
        kind: "conditional";
        register: string;
        bit?: number | undefined;
        equals: number;
        body: {
            kind: "gate";
            name: string;
            parameters?: (string | number)[] | undefined;
            qubits: {
                register: string;
                index: number;
            }[];
        } | {
            kind: "measure";
            qubit: {
                register: string;
                index: number;
            };
            clbit: {
                register: string;
                index: number;
            };
        } | {
            kind: "reset";
            qubit: {
                register: string;
                index: number;
            };
        } | {
            kind: "barrier";
            qubits?: {
                register: string;
                index: number;
            }[] | undefined;
        };
    }>]>, "many">>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    qubit_registers: {
        name: string;
        size: number;
    }[];
    clbit_registers: {
        name: string;
        size: number;
    }[];
    operations: ({
        kind: "gate";
        name: string;
        parameters: (string | number)[];
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    } | {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    } | {
        kind: "barrier";
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "conditional";
        register: string;
        bit?: number | undefined;
        equals: number;
        body: {
            kind: "gate";
            name: string;
            parameters: (string | number)[];
            qubits: {
                register: string;
                index: number;
            }[];
        } | {
            kind: "measure";
            qubit: {
                register: string;
                index: number;
            };
            clbit: {
                register: string;
                index: number;
            };
        } | {
            kind: "reset";
            qubit: {
                register: string;
                index: number;
            };
        } | {
            kind: "barrier";
            qubits: {
                register: string;
                index: number;
            }[];
        };
    })[];
}, {
    name?: string | undefined;
    qubit_registers?: {
        name: string;
        size: number;
    }[] | undefined;
    clbit_registers?: {
        name: string;
        size: number;
    }[] | undefined;
    operations?: ({
        kind: "gate";
        name: string;
        parameters?: (string | number)[] | undefined;
        qubits: {
            register: string;
            index: number;
        }[];
    } | {
        kind: "measure";
        qubit: {
            register: string;
            index: number;
        };
        clbit: {
            register: string;
            index: number;
        };
    } | {
        kind: "reset";
        qubit: {
            register: string;
            index: number;
        };
    } | {
        kind: "barrier";
        qubits?: {
            register: string;
            index: number;
        }[] | undefined;
    } | {
        kind: "conditional";
        register: string;
        bit?: number | undefined;
        equals: number;
        body: {
            kind: "gate";
            name: string;
            parameters?: (string | number)[] | undefined;
            qubits: {
                register: string;
                index: number;
            }[];
        } | {
            kind: "measure";
            qubit: {
                register: string;
                index: number;
            };
            clbit: {
                register: string;
                index: number;
            };
        } | {
            kind: "reset";
            qubit: {
                register: string;
                index: number;
            };
        } | {
            kind: "barrier";
            qubits?: {
                register: string;
                index: number;
            }[] | undefined;
        };
    })[] | undefined;
}>;
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