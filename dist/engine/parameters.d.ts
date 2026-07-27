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
export declare class ParameterError extends Error {
    constructor(message: string);
}
export declare function evaluateParameter(value: number | string): number;
//# sourceMappingURL=parameters.d.ts.map