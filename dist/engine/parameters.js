/**
 * Evaluate the numeric parameter expressions OpenQASM 3 allows.
 *
 * A hand-written recursive-descent parser rather than `eval` or `Function`:
 * these expressions arrive from user-supplied circuits, and handing them to a
 * JavaScript evaluator would be arbitrary code execution in whatever process
 * happens to be simulating.
 *
 * Supports numbers, `pi`/`π`/`tau`/`euler`, the four arithmetic operators,
 * `**`, unary sign, parentheses, and the usual unary functions. Anything else
 * is rejected by name rather than silently coerced.
 */
const CONSTANTS = {
    pi: Math.PI,
    "π": Math.PI,
    tau: Math.PI * 2,
    euler: Math.E,
    e: Math.E,
};
const FUNCTIONS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log,
    sqrt: Math.sqrt,
    abs: Math.abs,
};
export class ParameterError extends Error {
    constructor(message) {
        super(message);
        this.name = "ParameterError";
    }
}
export function evaluateParameter(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new ParameterError(`Parameter must be finite, got ${value}.`);
        }
        return value;
    }
    const parser = new ExpressionParser(value);
    const result = parser.parseExpression();
    parser.expectEnd();
    if (!Number.isFinite(result)) {
        throw new ParameterError(`Parameter expression '${value}' did not evaluate to a finite number.`);
    }
    return result;
}
class ExpressionParser {
    constructor(source) {
        this.source = source;
        this.position = 0;
    }
    parseExpression() {
        let value = this.parseTerm();
        for (;;) {
            this.skipWhitespace();
            const character = this.peek();
            if (character === "+") {
                this.position += 1;
                value += this.parseTerm();
            }
            else if (character === "-") {
                this.position += 1;
                value -= this.parseTerm();
            }
            else {
                return value;
            }
        }
    }
    parseTerm() {
        let value = this.parseUnary();
        for (;;) {
            this.skipWhitespace();
            const character = this.peek();
            if (character === "*" && this.source[this.position + 1] !== "*") {
                this.position += 1;
                value *= this.parseUnary();
            }
            else if (character === "/") {
                this.position += 1;
                const divisor = this.parseUnary();
                if (divisor === 0) {
                    throw new ParameterError(`Division by zero in '${this.source}'.`);
                }
                value /= divisor;
            }
            else {
                return value;
            }
        }
    }
    parseUnary() {
        this.skipWhitespace();
        if (this.peek() === "-") {
            this.position += 1;
            return -this.parseUnary();
        }
        if (this.peek() === "+") {
            this.position += 1;
            return this.parseUnary();
        }
        return this.parsePower();
    }
    parsePower() {
        const base = this.parseAtom();
        this.skipWhitespace();
        if (this.peek() === "*" && this.source[this.position + 1] === "*") {
            this.position += 2;
            return base ** this.parseUnary();
        }
        return base;
    }
    parseAtom() {
        this.skipWhitespace();
        const character = this.peek();
        if (character === "(") {
            this.position += 1;
            const value = this.parseExpression();
            this.skipWhitespace();
            if (this.peek() !== ")") {
                throw new ParameterError(`Unbalanced parentheses in '${this.source}'.`);
            }
            this.position += 1;
            return value;
        }
        const numberMatch = /^\d+\.?\d*(?:[eE][+-]?\d+)?|^\.\d+(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.position));
        if (numberMatch) {
            this.position += numberMatch[0].length;
            return Number(numberMatch[0]);
        }
        const identifierMatch = /^[A-Za-zπ_][A-Za-z0-9_]*/.exec(this.source.slice(this.position));
        if (identifierMatch) {
            const name = identifierMatch[0];
            this.position += name.length;
            this.skipWhitespace();
            if (this.peek() === "(") {
                const fn = FUNCTIONS[name.toLowerCase()];
                if (!fn) {
                    throw new ParameterError(`Unknown function '${name}' in '${this.source}'.`);
                }
                this.position += 1;
                const argument = this.parseExpression();
                this.skipWhitespace();
                if (this.peek() !== ")") {
                    throw new ParameterError(`Unbalanced parentheses after '${name}' in '${this.source}'.`);
                }
                this.position += 1;
                return fn(argument);
            }
            const constant = CONSTANTS[name.toLowerCase()] ?? CONSTANTS[name];
            if (constant === undefined) {
                // Free parameters are legitimate in a circuit but cannot be simulated
                // without a binding, so the error says which one is missing.
                throw new ParameterError(`Parameter '${name}' has no value. Bind free parameters before simulating.`);
            }
            return constant;
        }
        throw new ParameterError(`Could not parse parameter expression '${this.source}'.`);
    }
    skipWhitespace() {
        while (this.position < this.source.length && /\s/.test(this.source[this.position])) {
            this.position += 1;
        }
    }
    peek() {
        return this.source[this.position];
    }
    expectEnd() {
        this.skipWhitespace();
        if (this.position < this.source.length) {
            throw new ParameterError(`Unexpected '${this.source.slice(this.position)}' in parameter expression '${this.source}'.`);
        }
    }
}
//# sourceMappingURL=parameters.js.map