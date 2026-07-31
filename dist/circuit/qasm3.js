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
/**
 * Replaces every block comment with spaces, preserving newlines and length.
 *
 * A linear scan rather than `/\/\*[\s\S]*?\*\//g`. That regex backtracks quadratically on
 * an **unterminated** comment: with no closing `*/ ` to find, each of the N `; /*` openings
* re-scans the rest of the input. Measured on the shipped version: 6 KB took 2 ms, 24 KB
* 28 ms, 60 KB 177 ms, 120 KB 704 ms -- four times the input for twenty-five times the
* work, so a megabyte of it stalls the thread for the better part of a minute.
*
* This matters here specifically. The SDK holds no secrets and opens no listener, so its
* real attack surface is untrusted-payload parsing, and this function is the first thing
* every parse of a submitted circuit goes through.
*
* An unterminated comment is treated as running to end of input, which is what the regex
* did too -- it simply matched nothing and left the text in place. Blanking it is the more
* useful reading: the remainder is commented out, so it should not parse as code.
*/
function stripBlockComments(source) {
    const pieces = [];
    let index = 0;
    while (index < source.length) {
        const start = source.indexOf("/*", index);
        if (start === -1) {
            pieces.push(source.slice(index));
            break;
        }
        pieces.push(source.slice(index, start));
        const end = source.indexOf("*/", start + 2);
        const commentEnd = end === -1 ? source.length : end + 2;
        // Newlines survive so every later line number is still the author's. Blanked with a
        // single non-backtracking replace over the slice, not character by character: a
        // per-character concatenation of a 600 KB comment was measured at 186 s, which is
        // slower than the bug being fixed.
        pieces.push(source.slice(start, commentEnd).replace(/[^\n]/g, " "));
        index = commentEnd;
    }
    return pieces.join("");
}
/** Strips comments, then splits on `;` and `{`/`}` while tracking line numbers. */
function splitStatements(source) {
    const withoutBlockComments = stripBlockComments(source);
    const statements = [];
    const buffered = [];
    // Whether anything non-whitespace is in the buffer, carried rather than recomputed.
    // The previous version asked `buffer.trim().length === 0` once per character, and trim
    // scans the whole buffer -- so a statement N characters long cost O(N^2). It was not
    // theoretical: 600 KB with no `;` in it took 192 seconds, and needed no comment, no
    // clever regex and nothing malformed. A single long token is enough.
    let bufferHasContent = false;
    let line = 1;
    let bufferStartLine = 1;
    const push = () => {
        const text = buffered.join("").trim();
        if (text.length > 0) {
            statements.push({ text, line: bufferStartLine });
        }
        buffered.length = 0;
        bufferHasContent = false;
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
                const characterHasContent = character.trim().length > 0;
                if (!bufferHasContent && characterHasContent) {
                    bufferStartLine = line;
                }
                if (characterHasContent)
                    bufferHasContent = true;
                buffered.push(character);
            }
        }
        buffered.push(" ");
        line += 1;
    }
    push();
    return statements;
}
function leadingKeyword(text) {
    return (/^[A-Za-z_][A-Za-z0-9_]*/.exec(text)?.[0] ?? "").toLowerCase();
}
/**
 * The leading identifier with its case intact.
 *
 * `leadingKeyword` lowercases, which is correct for language keywords and wrong
 * for user identifiers: OpenQASM is case-sensitive, so a gate declared as
 * `Oracle` is not found by looking up `oracle`. Using the lowercased form here
 * meant definitions were collected and then never expanded -- the call passed
 * through as an unknown primitive gate and only failed later, in the simulator.
 */
function leadingIdentifier(text) {
    return /^[A-Za-z_][A-Za-z0-9_]*/.exec(text)?.[0] ?? "";
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
/** Guards against a definition that expands into itself. */
const MAX_GATE_EXPANSION_DEPTH = 32;
/**
 * Substitute formal names for actual ones in a body statement.
 *
 * Parameters are wrapped in parentheses. Without that, a body of `rz(p0 / 2)`
 * called with `p0 = a + b` would become `rz(a + b / 2)` -- silently the wrong
 * angle, and the kind of error that produces a plausible circuit rather than a
 * failure. Word boundaries keep `p0` from matching inside `p01`.
 */
function substituteGateBody(body, definition, actualQubits, actualParameters) {
    let result = body;
    for (let index = 0; index < definition.parameters.length; index += 1) {
        const formal = definition.parameters[index];
        const actual = actualParameters[index];
        if (actual === undefined)
            continue;
        result = result.replace(new RegExp(`\\b${escapeForRegExp(formal)}\\b`, "g"), `(${actual})`);
    }
    for (let index = 0; index < definition.qubits.length; index += 1) {
        const formal = definition.qubits[index];
        const actual = actualQubits[index];
        if (actual === undefined)
            continue;
        result = result.replace(new RegExp(`\\b${escapeForRegExp(formal)}\\b`, "g"), actual);
    }
    return result;
}
function escapeForRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findRegister(registers, name) {
    return registers.find((register) => register.name === name);
}
/**
 * Register name given to OpenQASM 3 hardware qubits (`$0`, `$1`, ...).
 *
 * Physical qubits belong to no declared register, so they need somewhere to
 * live. The name begins with `$`, which OpenQASM identifiers may not, so it
 * cannot collide with anything a program declares.
 *
 * Kept separate rather than folded into the first qubit register on purpose.
 * `$5` is physical qubit 5 on a device; `q[5]` is the sixth qubit of a virtual
 * register that a compiler may place anywhere. Treating them as the same thing
 * would make a mapped circuit silently claim a virtual layout it does not have
 * (ketqat-sdk#165).
 */
export const PHYSICAL_QUBIT_REGISTER = "$physical";
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
    // Hardware qubits: `$n`. Qiskit emits these whenever a circuit has been mapped
    // to physical qubits, which is most of what a transpiler produces -- so
    // rejecting them made four of MQT Bench's benchmarks unparseable.
    const physical = /^\$(\d+)$/.exec(text);
    if (physical) {
        if (kindLabel !== "qubit") {
            throw new Qasm3ParseError(`'${text}' is a hardware qubit, which cannot be used where a ${kindLabel} bit is expected.`, { line });
        }
        const index = Number(physical[1]);
        // Declared on first use, because a program using `$n` never declares it. The
        // register grows to cover the highest index seen, so the qubit count reflects
        // the circuit rather than the order statements happened to appear in.
        let register = findRegister(registers, PHYSICAL_QUBIT_REGISTER);
        if (!register) {
            register = { name: PHYSICAL_QUBIT_REGISTER, size: index + 1 };
            registers.push(register);
        }
        else if (index + 1 > register.size) {
            register.size = index + 1;
        }
        return [{ register: PHYSICAL_QUBIT_REGISTER, index }];
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
/**
 * Split `name(params) operands` with a balanced parameter list.
 *
 * A regex cannot do this. The previous pattern used `\(([^)]*)\)`, which stops
 * at the first close paren, so `rz((pi)/2) q[0]` -- valid OpenQASM -- was
 * rejected as an unparseable statement. That was latent until custom gate
 * inlining started producing parenthesised arguments, since substituted
 * parameters must be wrapped to preserve precedence (ketqat-sdk#170).
 *
 * Returns undefined when the text does not start with an identifier, and leaves
 * `parameterText` undefined when there is no argument list at all -- which is
 * different from an empty one.
 */
function splitCallSignature(text) {
    const identifier = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(text);
    if (!identifier)
        return undefined;
    const name = identifier[1];
    let cursor = name.length;
    while (cursor < text.length && text[cursor] === " ")
        cursor += 1;
    let parameterText;
    if (text[cursor] === "(") {
        let depth = 0;
        const start = cursor + 1;
        for (; cursor < text.length; cursor += 1) {
            const character = text[cursor];
            if (character === "(")
                depth += 1;
            else if (character === ")") {
                depth -= 1;
                if (depth === 0)
                    break;
            }
        }
        // An unbalanced list is a syntax error, not something to guess at.
        if (depth !== 0)
            return undefined;
        parameterText = text.slice(start, cursor);
        cursor += 1;
    }
    return { name, parameterText, operandText: text.slice(cursor).trim() };
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
    const gate = splitCallSignature(text);
    if (gate && gate.operandText.length > 0) {
        const name = gate.name;
        const parameters = parseParameters(gate.parameterText ?? "");
        const operands = splitTopLevel(gate.operandText, ",");
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
/**
 * Parse the supported `if (...)` forms.
 *
 * Separated from the statement loop so each form is visible at once, and so an
 * unsupported boolean expression returns undefined rather than being partially
 * matched by a permissive regex.
 */
function parseCondition(text) {
    // if (creg[i] == N | true | false)
    const indexedCompare = /^if\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]\s*==\s*(\d+|true|false)\s*\)\s*(.*)$/i.exec(text);
    if (indexedCompare) {
        const literal = indexedCompare[3].toLowerCase();
        const equals = literal === "true" ? 1 : literal === "false" ? 0 : Number(literal);
        return {
            register: indexedCompare[1],
            bit: Number(indexedCompare[2]),
            equals,
            remainder: indexedCompare[4] ?? "",
        };
    }
    // if (creg[i]) -- truthiness of one bit, i.e. equals 1
    const indexedTruthy = /^if\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]\s*\)\s*(.*)$/.exec(text);
    if (indexedTruthy) {
        return {
            register: indexedTruthy[1],
            bit: Number(indexedTruthy[2]),
            equals: 1,
            remainder: indexedTruthy[3] ?? "",
        };
    }
    // if (creg == N) -- the whole-register form, unchanged.
    const wholeRegister = /^if\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*==\s*(\d+)\s*\)\s*(.*)$/.exec(text);
    if (wholeRegister) {
        return {
            register: wholeRegister[1],
            equals: Number(wholeRegister[2]),
            remainder: wholeRegister[3] ?? "",
        };
    }
    return undefined;
}
export function parseQasm3(source) {
    const statements = splitStatements(source);
    const context = {
        qubitRegisters: [],
        clbitRegisters: [],
        loss: [],
        definitions: new Map(),
        subcircuits: [],
    };
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
    // Index of the last statement swallowed by a gate body, so the main loop does
    // not also execute the body as top-level code.
    let consumeUntil = -1;
    for (let position = 0; position < statements.length; position += 1) {
        const statement = statements[position];
        if (position <= consumeUntil) {
            continue;
        }
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
        if (keyword === "gate") {
            // `gate NAME(p0, p1) a, b { ... }`. The splitter already emits `{` and `}`
            // as their own statements, so the body is collected by scanning forward to
            // the matching close rather than re-lexing.
            const signature = splitCallSignature(text.slice("gate".length).trim());
            if (!signature) {
                throw new Qasm3ParseError(`Could not read the gate declaration '${text}'.`, {
                    feature: "custom_gate_definition",
                    line: statement.line,
                });
            }
            const name = signature.name;
            const parameters = (signature.parameterText ?? "")
                .split(",")
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
            const qubits = signature.operandText
                .split(",")
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
            if (qubits.length === 0) {
                throw new Qasm3ParseError(`Gate '${name}' declares no qubit arguments.`, {
                    feature: "custom_gate_definition",
                    line: statement.line,
                });
            }
            // Scan forward for the body. Nested braces are counted so a definition
            // containing a block does not end early.
            const body = [];
            let depth = 0;
            let closed = false;
            let cursor = position + 1;
            for (; cursor < statements.length; cursor += 1) {
                const inner = statements[cursor].text.replace(/\s+/g, " ").trim();
                if (inner === "{") {
                    depth += 1;
                    continue;
                }
                if (inner === "}") {
                    depth -= 1;
                    if (depth <= 0) {
                        closed = true;
                        break;
                    }
                    continue;
                }
                if (inner.length > 0)
                    body.push(inner);
            }
            if (!closed) {
                throw new Qasm3ParseError(`Gate '${name}' has no closing brace.`, {
                    feature: "custom_gate_definition",
                    line: statement.line,
                });
            }
            context.definitions.set(name, { name, parameters, qubits, body });
            consumeUntil = cursor;
            continue;
        }
        if (keyword === "openqasm") {
            const version = /^openqasm\s+([0-9.]+)$/i.exec(text)?.[1];
            // OpenQASM 2 is accepted through the compatibility path that already
            // existed for `qreg`/`creg` and `measure a -> b`. Those shims were
            // unreachable for a real OpenQASM 2 file, because this gate rejected it at
            // the version line -- so Cirq's output, which is OpenQASM 2, failed on
            // line 3 of every circuit (ketqat-sdk#174).
            if (version !== undefined && version.startsWith("2")) {
                context.loss.push({
                    feature: "openqasm2_source",
                    severity: "cosmetic",
                    action: "approximated",
                    detail: `Read as OpenQASM ${version} through this adapter's OpenQASM 2 compatibility path. ` +
                        "Emitted output is OpenQASM 3, so a round trip changes the declared version. Constructs " +
                        "with no OpenQASM 3 equivalent are still rejected individually rather than assumed.",
                    location: `line ${statement.line}`,
                });
                sawVersion = true;
                continue;
            }
            if (version === undefined || !version.startsWith("3")) {
                throw new Qasm3ParseError(`This adapter reads OpenQASM 3, and OpenQASM 2 through a compatibility path. ` +
                    `Found version '${version ?? "unknown"}'.`, { feature: "version_declaration", line: statement.line });
            }
            sawVersion = true;
            continue;
        }
        if (keyword === "include") {
            const included = /include\s+"([^"]+)"/.exec(text)?.[1];
            // qelib1.inc is OpenQASM 2's standard library, the direct counterpart of
            // stdgates.inc. Rejecting it would make the version acceptance above
            // useless, since every Cirq and Qiskit OpenQASM 2 file includes it.
            if (included === "qelib1.inc") {
                continue;
            }
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
            // Four forms, all of which Qiskit emits for dynamic circuits:
            //   if (creg == N)        whole register equals N
            //   if (creg[i])          bit i is set
            //   if (creg[i] == true)  the same, written out
            //   if (creg[i] == 0)     bit i has that value
            //
            // The single-bit forms are not expressible as a whole-register comparison,
            // which is why they were rejected before rather than translated.
            const parsed = parseCondition(text);
            if (!parsed) {
                throw new Qasm3ParseError("Supported conditions are 'if (creg == N)', 'if (creg[i])', and 'if (creg[i] == N|true|false)'. " +
                    "Other boolean expressions are rejected rather than approximated, because guessing at a " +
                    "condition would silently change the program.", { feature: "classical_condition_general", line: statement.line });
            }
            const register = parsed.register;
            const clbitRegister = findRegister(context.clbitRegisters, register);
            if (!clbitRegister) {
                throw new Qasm3ParseError(`Unknown classical register '${register}'.`, { line: statement.line });
            }
            if (parsed.bit !== undefined && parsed.bit >= clbitRegister.size) {
                throw new Qasm3ParseError(`Index ${parsed.bit} is out of range for classical register '${register}' of size ${clbitRegister.size}.`, { line: statement.line });
            }
            pendingCondition =
                parsed.bit === undefined
                    ? { register, equals: parsed.equals }
                    : { register, bit: parsed.bit, equals: parsed.equals };
            const body = parsed.remainder.trim();
            if (body.length > 0) {
                applyStatement(body, statement, context, emit);
                pendingCondition = undefined;
            }
            continue;
        }
        if (parseDeclaration(text, statement, context)) {
            continue;
        }
        // A call to a custom gate expands to its body. Done here rather than in
        // applyStatement so recursion is bounded in one place.
        const invoked = leadingIdentifier(text);
        if (context.definitions.has(invoked)) {
            expandCustomGate(text, statement, context, emit, 0, () => operations.length);
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
        subcircuits: context.subcircuits,
    };
}
/**
 * Expand one call to a custom gate, recursively.
 *
 * Inlining loses the abstraction boundary, so the first expansion of each
 * definition records a loss entry. It is `approximated` rather than `dropped`
 * because the operations survive exactly -- what is lost is the grouping, not
 * the circuit.
 */
function expandCustomGate(text, statement, context, emit, depth, operationCount) {
    if (depth > MAX_GATE_EXPANSION_DEPTH) {
        throw new Qasm3ParseError(`Custom gate expansion exceeded ${MAX_GATE_EXPANSION_DEPTH} levels, which means a definition ` +
            "expands into itself. OpenQASM gates cannot be recursive.", { feature: "custom_gate_definition", line: statement.line });
    }
    const call = splitCallSignature(text);
    const definition = call ? context.definitions.get(call.name) : undefined;
    if (!call || !definition) {
        throw new Qasm3ParseError(`Could not read the call '${text}'.`, {
            feature: "custom_gate_definition",
            line: statement.line,
        });
    }
    const actualParameters = splitTopLevel(call.parameterText ?? "", ",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    const actualQubits = splitTopLevel(call.operandText, ",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    if (actualQubits.length !== definition.qubits.length) {
        throw new Qasm3ParseError(`Gate '${definition.name}' takes ${definition.qubits.length} qubit(s) but was called with ` +
            `${actualQubits.length}.`, { feature: "custom_gate_definition", line: statement.line });
    }
    if (actualParameters.length !== definition.parameters.length) {
        throw new Qasm3ParseError(`Gate '${definition.name}' takes ${definition.parameters.length} parameter(s) but was called ` +
            `with ${actualParameters.length}.`, { feature: "custom_gate_definition", line: statement.line });
    }
    if (depth === 0 && !context.loss.some((entry) => entry.detail.includes(`'${definition.name}'`))) {
        context.loss.push({
            feature: "custom_gate_definition",
            severity: "structural",
            action: "approximated",
            detail: `The custom gate '${definition.name}' was inlined into its constituent operations. The ` +
                "operations are preserved exactly; what is lost is the grouping, so the circuit no longer " +
                "records that these gates formed one named unit.",
            location: `line ${statement.line}`,
        });
    }
    const spanStart = operationCount();
    for (const bodyStatement of definition.body) {
        const substituted = substituteGateBody(bodyStatement, definition, actualQubits, actualParameters);
        const inner = leadingIdentifier(substituted);
        if (context.definitions.has(inner)) {
            expandCustomGate(substituted, statement, context, emit, depth + 1, operationCount);
        }
        else {
            applyStatement(substituted, statement, context, emit);
        }
    }
    // Recorded after the body so `end` reflects everything the expansion produced,
    // including nested expansions. Pushed in completion order, so an inner span
    // appears before the outer one that contains it.
    context.subcircuits.push({
        name: definition.name,
        depth,
        start: spanStart,
        end: operationCount(),
        qubits: actualQubits,
        parameters: actualParameters,
        line: statement.line,
    });
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
    // Hardware qubits go back out as `$n`. The synthetic register name is an
    // internal placeholder, and emitting `$physical[3]` produced output this
    // parser could not read back -- a round-trip failure introduced when `$n`
    // support landed (ketqat-sdk#168) and caught by round-tripping the real MQT
    // Bench suite rather than by a hand-written fixture.
    if (bit.register === PHYSICAL_QUBIT_REGISTER) {
        return `$${bit.index}`;
    }
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
            // Emitted in the same shape it was read, so a parse/emit round trip does
            // not silently widen a single-bit test into a whole-register one.
            return operation.bit === undefined
                ? `if (${operation.register} == ${operation.equals}) ${formatOperation(operation.body)}`
                : `if (${operation.register}[${operation.bit}] == ${operation.equals}) ${formatOperation(operation.body)}`;
    }
}
export function emitQasm3(circuit, options = {}) {
    const lines = ["OPENQASM 3;"];
    if (options.includeStdgates !== false) {
        lines.push('include "stdgates.inc";');
    }
    lines.push("");
    for (const register of circuit.qubit_registers) {
        // Hardware qubits are never declared: they exist on the device, and `qubit[n]
        // $physical;` is not valid OpenQASM.
        if (register.name === PHYSICAL_QUBIT_REGISTER)
            continue;
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