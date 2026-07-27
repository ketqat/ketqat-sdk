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
export const QASM3_ADAPTER_NAME = "openqasm3-subset";
export const QASM3_ADAPTER_VERSION = "0.1.0";
/** Constructs this adapter understands. Anything else is rejected. */
export const SUPPORTED_FEATURES = [
    "version_declaration",
    "include_stdgates",
    "qubit_declaration",
    "bit_declaration",
    "gate_application",
    "gate_parameters",
    "register_broadcast",
    "measurement",
    "reset",
    "barrier",
    "classical_condition_equality",
];
/**
 * Constructs this adapter recognises but does not implement. Recognising them
 * is what lets the error name the feature instead of failing with a syntax
 * error that tells the user nothing.
 */
const UNSUPPORTED_KEYWORDS = {
    gate: "custom_gate_definition",
    def: "subroutine_definition",
    defcal: "pulse_calibration",
    cal: "pulse_calibration",
    defcalgrammar: "pulse_calibration",
    delay: "explicit_timing",
    duration: "explicit_timing",
    durationof: "explicit_timing",
    stretch: "explicit_timing",
    box: "box_scoping",
    for: "control_flow_loop",
    while: "control_flow_loop",
    switch: "control_flow_switch",
    return: "subroutine_definition",
    extern: "extern_declaration",
    input: "io_declaration",
    output: "io_declaration",
    pragma: "pragma_directive",
    array: "array_declaration",
    let: "alias_declaration",
    ctrl: "gate_modifier",
    negctrl: "gate_modifier",
    inv: "gate_modifier",
    pow: "gate_modifier",
};
export class Qasm3ParseError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "Qasm3ParseError";
        this.feature = options.feature;
        this.line = options.line;
    }
}
/** Strips comments, then splits on `;` and `{`/`}` while tracking line numbers. */
function splitStatements(source) {
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
    const statements = [];
    let buffer = "";
    let line = 1;
    let bufferStartLine = 1;
    const push = () => {
        const text = buffer.trim();
        if (text.length > 0) {
            statements.push({ text, line: bufferStartLine });
        }
        buffer = "";
        bufferStartLine = line;
    };
    const lines = withoutBlockComments.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const stripped = (lines[index] ?? "").replace(/\/\/.*$/, "");
        for (const character of stripped) {
            if (character === ";") {
                push();
            }
            else if (character === "{" || character === "}") {
                push();
                statements.push({ text: character, line });
                bufferStartLine = line;
            }
            else {
                if (buffer.trim().length === 0 && character.trim().length > 0) {
                    bufferStartLine = line;
                }
                buffer += character;
            }
        }
        buffer += " ";
        line += 1;
    }
    push();
    return statements;
}
function leadingKeyword(text) {
    return (/^[A-Za-z_][A-Za-z0-9_]*/.exec(text)?.[0] ?? "").toLowerCase();
}
function parseParameters(raw) {
    const inner = raw.trim();
    if (inner.length === 0) {
        return [];
    }
    return splitTopLevel(inner, ",").map((entry) => {
        const value = entry.trim();
        // A bare decimal number is stored as a number; anything else (pi/2, a free
        // parameter, an expression) is kept verbatim so re-emitting cannot change
        // the program text.
        if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) {
            return Number(value);
        }
        return value;
    });
}
/** Splits on a separator that is not nested inside brackets or parentheses. */
function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const character of text) {
        if (character === "(" || character === "[") {
            depth += 1;
        }
        else if (character === ")" || character === "]") {
            depth -= 1;
        }
        if (character === separator && depth === 0) {
            parts.push(current);
            current = "";
        }
        else {
            current += character;
        }
    }
    parts.push(current);
    return parts.filter((part) => part.trim().length > 0);
}
function findRegister(registers, name) {
    return registers.find((register) => register.name === name);
}
/**
 * Resolves an operand to concrete bits. A bare register name broadcasts over
 * every bit in that register, which OpenQASM 3 permits.
 */
function resolveOperand(operand, registers, line, kindLabel) {
    const text = operand.trim();
    const indexed = /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]$/.exec(text);
    if (indexed) {
        const name = indexed[1];
        const index = Number(indexed[2]);
        const register = findRegister(registers, name);
        if (!register) {
            throw new Qasm3ParseError(`Unknown ${kindLabel} register '${name}'.`, { line });
        }
        if (index >= register.size) {
            throw new Qasm3ParseError(`Index ${index} is out of range for ${kindLabel} register '${name}' of size ${register.size}.`, { line });
        }
        return [{ register: name, index }];
    }
    const bare = /^[A-Za-z_][A-Za-z0-9_]*$/.exec(text);
    if (bare) {
        const register = findRegister(registers, text);
        if (!register) {
            throw new Qasm3ParseError(`Unknown ${kindLabel} register '${text}'.`, { line });
        }
        return Array.from({ length: register.size }, (_unused, index) => ({ register: text, index }));
    }
    throw new Qasm3ParseError(`Could not parse ${kindLabel} operand '${text}'.`, { line });
}
function parseDeclaration(text, statement, context) {
    // qubit[4] q;  /  qubit q;  /  bit[4] c;  /  bit c;
    const modern = /^(qubit|bit)\s*(?:\[\s*(\d+)\s*\])?\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(text);
    if (modern) {
        const kind = modern[1];
        const size = modern[2] === undefined ? 1 : Number(modern[2]);
        const name = modern[3];
        const target = kind === "qubit" ? context.qubitRegisters : context.clbitRegisters;
        if (findRegister(target, name)) {
            throw new Qasm3ParseError(`Register '${name}' is declared more than once.`, { line: statement.line });
        }
        target.push({ name, size });
        return true;
    }
    // Deprecated OpenQASM 2 form: qreg q[4];  /  creg c[4];
    const legacy = /^(qreg|creg)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]$/.exec(text);
    if (legacy) {
        const kind = legacy[1];
        const name = legacy[2];
        const size = Number(legacy[3]);
        const target = kind === "qreg" ? context.qubitRegisters : context.clbitRegisters;
        if (findRegister(target, name)) {
            throw new Qasm3ParseError(`Register '${name}' is declared more than once.`, { line: statement.line });
        }
        target.push({ name, size });
        context.loss.push({
            feature: "openqasm2_register_syntax",
            severity: "cosmetic",
            action: "approximated",
            detail: `'${kind} ${name}[${size}]' was read as the OpenQASM 3 declaration '${kind === "qreg" ? "qubit" : "bit"}[${size}] ${name}'. Emitted output uses the OpenQASM 3 form.`,
            location: `line ${statement.line}`,
        });
        return true;
    }
    return false;
}
function parseOperation(text, statement, context) {
    const line = statement.line;
    // c[0] = measure q[0];
    const assignedMeasure = /^(.+?)\s*=\s*measure\s+(.+)$/.exec(text);
    if (assignedMeasure) {
        const clbits = resolveOperand(assignedMeasure[1], context.clbitRegisters, line, "classical");
        const qubits = resolveOperand(assignedMeasure[2], context.qubitRegisters, line, "qubit");
        return buildMeasure(qubits, clbits, line);
    }
    // measure q[0] -> c[0];
    const arrowMeasure = /^measure\s+(.+?)\s*->\s*(.+)$/.exec(text);
    if (arrowMeasure) {
        const qubits = resolveOperand(arrowMeasure[1], context.qubitRegisters, line, "qubit");
        const clbits = resolveOperand(arrowMeasure[2], context.clbitRegisters, line, "classical");
        context.loss.push({
            feature: "openqasm2_measure_syntax",
            severity: "cosmetic",
            action: "approximated",
            detail: "'measure q -> c' was read as the OpenQASM 3 assignment form 'c = measure q'.",
            location: `line ${line}`,
        });
        return buildMeasure(qubits, clbits, line);
    }
    const keyword = leadingKeyword(text);
    if (keyword === "reset") {
        const qubits = resolveOperand(text.slice("reset".length), context.qubitRegisters, line, "qubit");
        if (qubits.length !== 1) {
            throw new Qasm3ParseError("Broadcast reset over a whole register is not supported by this subset; index the qubit explicitly.", { feature: "register_broadcast_reset", line });
        }
        return { kind: "reset", qubit: qubits[0] };
    }
    if (keyword === "barrier") {
        const operands = text.slice("barrier".length).trim();
        if (operands.length === 0) {
            return { kind: "barrier", qubits: [] };
        }
        const qubits = splitTopLevel(operands, ",").flatMap((operand) => resolveOperand(operand, context.qubitRegisters, line, "qubit"));
        return { kind: "barrier", qubits };
    }
    // gate application: name qargs;  /  name(params) qargs;
    const gate = /^([A-Za-z_][A-Za-z0-9_]*)\s*(\(([^)]*)\))?\s+(.+)$/.exec(text);
    if (gate) {
        const name = gate[1];
        const parameters = parseParameters(gate[3] ?? "");
        const operands = splitTopLevel(gate[4], ",");
        const resolved = operands.map((operand) => resolveOperand(operand, context.qubitRegisters, line, "qubit"));
        const broadcastWidth = Math.max(...resolved.map((bits) => bits.length));
        if (resolved.some((bits) => bits.length !== 1 && bits.length !== broadcastWidth)) {
            throw new Qasm3ParseError("Broadcast operands have mismatched register sizes.", { line });
        }
        if (broadcastWidth === 1) {
            return { kind: "gate", name, parameters, qubits: resolved.map((bits) => bits[0]) };
        }
        // Broadcasting a gate over registers expands to one operation per index.
        // Returned as a synthetic barrier-free sequence by the caller.
        throw new BroadcastExpansion(Array.from({ length: broadcastWidth }, (_unused, index) => ({
            kind: "gate",
            name,
            parameters,
            qubits: resolved.map((bits) => (bits.length === 1 ? bits[0] : bits[index])),
        })));
    }
    return undefined;
}
/** Thrown internally to return several operations from one statement. */
class BroadcastExpansion extends Error {
    constructor(operations) {
        super("broadcast");
        this.operations = operations;
    }
}
function buildMeasure(qubits, clbits, line) {
    if (qubits.length !== clbits.length) {
        throw new Qasm3ParseError("Measurement operand widths do not match.", { line });
    }
    if (qubits.length !== 1) {
        throw new Qasm3ParseError("Broadcast measurement over a whole register is not supported by this subset; index the bits explicitly.", { feature: "register_broadcast_measure", line });
    }
    return { kind: "measure", qubit: qubits[0], clbit: clbits[0] };
}
export function parseQasm3(source) {
    const statements = splitStatements(source);
    const context = { qubitRegisters: [], clbitRegisters: [], loss: [] };
    const operations = [];
    let sawVersion = false;
    let pendingCondition;
    let conditionBlockDepth = 0;
    const emit = (operation) => {
        if (pendingCondition) {
            operations.push({ kind: "conditional", ...pendingCondition, body: operation });
            if (conditionBlockDepth === 0) {
                pendingCondition = undefined;
            }
        }
        else {
            operations.push(operation);
        }
    };
    for (const statement of statements) {
        const text = statement.text.replace(/\s+/g, " ").trim();
        if (text.length === 0) {
            continue;
        }
        if (text === "{") {
            if (pendingCondition) {
                conditionBlockDepth += 1;
            }
            continue;
        }
        if (text === "}") {
            if (conditionBlockDepth > 0) {
                conditionBlockDepth -= 1;
                if (conditionBlockDepth === 0) {
                    pendingCondition = undefined;
                }
            }
            continue;
        }
        const keyword = leadingKeyword(text);
        if (keyword === "openqasm") {
            const version = /^openqasm\s+([0-9.]+)$/i.exec(text)?.[1];
            if (version === undefined || !version.startsWith("3")) {
                throw new Qasm3ParseError(`This adapter reads OpenQASM 3. Found version '${version ?? "unknown"}'.`, { feature: "version_declaration", line: statement.line });
            }
            sawVersion = true;
            continue;
        }
        if (keyword === "include") {
            const included = /include\s+"([^"]+)"/.exec(text)?.[1];
            if (included !== undefined && included !== "stdgates.inc") {
                throw new Qasm3ParseError(`Only 'stdgates.inc' is supported; cannot resolve include '${included}'.`, { feature: "include_resolution", line: statement.line });
            }
            continue;
        }
        const unsupported = UNSUPPORTED_KEYWORDS[keyword];
        if (unsupported) {
            throw new Qasm3ParseError(`'${keyword}' is not supported by the ${QASM3_ADAPTER_NAME} adapter (feature: ${unsupported}). ` +
                "It is rejected rather than ignored, because dropping it would silently change the program.", { feature: unsupported, line: statement.line });
        }
        if (keyword === "if") {
            const condition = /^if\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*==\s*(\d+)\s*\)\s*(.*)$/.exec(text);
            if (!condition) {
                throw new Qasm3ParseError("Only equality conditions of the form 'if (creg == N)' are supported by this subset.", { feature: "classical_condition_general", line: statement.line });
            }
            const register = condition[1];
            if (!findRegister(context.clbitRegisters, register)) {
                throw new Qasm3ParseError(`Unknown classical register '${register}'.`, { line: statement.line });
            }
            pendingCondition = { register, equals: Number(condition[2]) };
            const body = (condition[3] ?? "").trim();
            if (body.length > 0) {
                applyStatement(body, statement, context, emit);
                pendingCondition = undefined;
            }
            continue;
        }
        if (parseDeclaration(text, statement, context)) {
            continue;
        }
        applyStatement(text, statement, context, emit);
    }
    if (!sawVersion) {
        context.loss.push({
            feature: "version_declaration",
            severity: "cosmetic",
            action: "approximated",
            detail: "No 'OPENQASM 3;' header was present; the program was read as OpenQASM 3.",
        });
    }
    return {
        circuit: {
            qubit_registers: context.qubitRegisters,
            clbit_registers: context.clbitRegisters,
            operations,
        },
        loss_report: context.loss,
    };
}
function applyStatement(text, statement, context, emit) {
    try {
        const operation = parseOperation(text, statement, context);
        if (operation === undefined) {
            throw new Qasm3ParseError(`Could not parse statement '${text}'.`, { line: statement.line });
        }
        emit(operation);
    }
    catch (error) {
        if (error instanceof BroadcastExpansion) {
            error.operations.forEach(emit);
            return;
        }
        throw error;
    }
}
function formatParameter(parameter) {
    return typeof parameter === "number" ? String(parameter) : parameter;
}
function formatBit(bit) {
    return `${bit.register}[${bit.index}]`;
}
function formatOperation(operation) {
    switch (operation.kind) {
        case "gate": {
            const parameters = operation.parameters.length > 0 ? `(${operation.parameters.map(formatParameter).join(", ")})` : "";
            return `${operation.name}${parameters} ${operation.qubits.map(formatBit).join(", ")};`;
        }
        case "measure":
            return `${formatBit(operation.clbit)} = measure ${formatBit(operation.qubit)};`;
        case "reset":
            return `reset ${formatBit(operation.qubit)};`;
        case "barrier":
            return operation.qubits.length === 0
                ? "barrier;"
                : `barrier ${operation.qubits.map(formatBit).join(", ")};`;
        case "conditional":
            return `if (${operation.register} == ${operation.equals}) ${formatOperation(operation.body)}`;
    }
}
export function emitQasm3(circuit, options = {}) {
    const lines = ["OPENQASM 3;"];
    if (options.includeStdgates !== false) {
        lines.push('include "stdgates.inc";');
    }
    lines.push("");
    for (const register of circuit.qubit_registers) {
        lines.push(`qubit[${register.size}] ${register.name};`);
    }
    for (const register of circuit.clbit_registers) {
        lines.push(`bit[${register.size}] ${register.name};`);
    }
    if (circuit.qubit_registers.length > 0 || circuit.clbit_registers.length > 0) {
        lines.push("");
    }
    for (const operation of circuit.operations) {
        lines.push(formatOperation(operation));
    }
    return `${lines.join("\n")}\n`;
}
//# sourceMappingURL=qasm3.js.map