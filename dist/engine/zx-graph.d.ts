/**
 * Graph-like ZX diagrams, local complementation and pivoting (ketqat-sdk#188).
 *
 * The existing `zx.ts` does peephole rewrites on gate lists. Local complementation
 * and pivoting cannot be expressed that way -- they are graph rewrites, defined on
 * a diagram's adjacency rather than on a gate sequence -- so they need a graph
 * representation, which is what this adds.
 *
 * Graph-like form: every spider is a Z-spider, every internal edge is a Hadamard
 * edge, and boundaries attach directly to spiders. Any ZX diagram can be brought
 * to this form by colour change, and it is the form in which these two rules are
 * stated.
 *
 * Why these two rules matter
 * --------------------------
 * The peephole rewrites already in place cancel adjacent gates. They cannot remove
 * a spider that has no adjacent partner, which is most of them. Local
 * complementation and pivoting *delete interior spiders* by rearranging the
 * neighbourhood, and that is what makes ZX simplification reduce a circuit rather
 * than tidy it.
 *
 * How correctness is established
 * ------------------------------
 * Both rules preserve the diagram's linear map exactly, up to a scalar. So the
 * check is not a heuristic: the dense matrix is computed before and after, and the
 * two must agree up to normalisation. A rule that fires when its side conditions
 * do not hold will change the map, and the comparison catches it. Nothing here is
 * trusted because the literature says so -- it is verified on the diagrams
 * actually rewritten.
 *
 * Interior spiders only, deliberately: a rule that consumed a boundary spider would
 * change the diagram's arity, which is a different diagram rather than a simplified
 * one.
 */
export interface ZxSpider {
    id: number;
    /** Phase in units of pi, so 0.5 is pi/2. Kept in these units to avoid drift. */
    phase: number;
}
export interface ZxGraph {
    spiders: ZxSpider[];
    /** Hadamard edges as sorted id pairs. Graph-like form has no simple interior edges. */
    edges: Array<[number, number]>;
    /** Spider ids attached to an input, in order. */
    inputs: number[];
    /** Spider ids attached to an output, in order. */
    outputs: number[];
}
export declare class ZxGraphError extends Error {
}
export declare function edgeSet(graph: ZxGraph): Set<string>;
export declare function neighbours(graph: ZxGraph, id: number): number[];
export declare function isInterior(graph: ZxGraph, id: number): boolean;
/**
 * Dense linear map of a graph-like diagram.
 *
 * Uses the sum-over-spider-values form: each spider takes a value in {0,1}, a
 * spider with phase alpha contributes exp(i*pi*alpha*x), and a Hadamard edge
 * between u and v contributes (-1)^(x_u x_v) / sqrt(2). Boundary spiders are
 * pinned by the input and output bits.
 *
 * Exponential in the spider count and unapologetically so: it exists to be
 * *certainly* right on small diagrams, which is what lets the rewrites be checked
 * rather than assumed.
 */
export declare function graphToMatrix(graph: ZxGraph): {
    real: number[][];
    imaginary: number[][];
};
/**
 * Whether two matrices describe the same linear map up to a non-zero scalar.
 *
 * Up to scalar because both rewrites change the diagram's normalisation, which is
 * physically irrelevant. The ratio is taken from the largest entry so the
 * comparison is not dominated by numerical noise in a near-zero one.
 */
export declare function sameUpToScalar(left: {
    real: number[][];
    imaginary: number[][];
}, right: {
    real: number[][];
    imaginary: number[][];
}, tolerance?: number): {
    equal: boolean;
    scalar: {
        real: number;
        imaginary: number;
    } | null;
    maxDifference: number;
};
export interface RewriteOutcome {
    applied: boolean;
    reason: string;
    graph: ZxGraph;
}
/**
 * Local complementation: remove an interior spider with phase +/- pi/2.
 *
 * The rule complements the neighbourhood, shifts each neighbour's phase by the
 * opposite quarter turn, and deletes the spider. Side conditions are checked and
 * refused rather than assumed -- applying it to a spider with the wrong phase does
 * not simplify the diagram, it changes what the diagram means.
 */
export declare function localComplementation(input: ZxGraph, id: number): RewriteOutcome;
/**
 * Pivoting: remove two adjacent interior spiders with phases in {0, pi}.
 *
 * Complements between the three neighbourhood parts -- exclusive to u, exclusive to
 * v, and shared -- then deletes both spiders. Two spiders at once, which is why it
 * reduces diagrams that local complementation alone cannot.
 */
export declare function pivot(input: ZxGraph, u: number, v: number): RewriteOutcome;
/**
 * Apply a rewrite and check it preserved the linear map.
 *
 * The verification is the product here, not a test helper: a rewrite that cannot be
 * shown to preserve the map should not be reported as an optimisation. INCONCLUSIVE
 * when the diagram is too large to evaluate, never "assumed fine".
 */
export declare function applyVerified(graph: ZxGraph, rewrite: (graph: ZxGraph) => RewriteOutcome): {
    outcome: RewriteOutcome;
    verdict: "preserved" | "changed" | "inconclusive" | "not_applied";
    maxDifference: number | null;
    detail: string;
};
/**
 * Circuit extraction from a graph-like ZX diagram (ketqat-sdk#190).
 *
 * The rewrites above delete spiders, and until a reduced diagram can be turned
 * back into gates that deletion changes nothing anyone runs. Extraction is what
 * makes the simplification have an effect.
 *
 * **Scope, stated rather than implied.** General ZX extraction needs a gflow and is
 * a substantial algorithm. What is implemented here is exact for one class -- a
 * diagram whose spiders are exactly its boundary, each spider being both an input
 * and an output in the same order. In that form the diagram is a phase-and-CZ
 * circuit and extraction is a direct reading:
 *
 *     Hadamard edge (u,v)  ->  CZ on those qubits (they differ by 1/sqrt(2), which
 *                              is a scalar and so physically irrelevant)
 *     spider phase alpha   ->  P(pi * alpha) on that qubit
 *
 * Diagrams outside that class are **refused with the reason**, not extracted
 * approximately. An extraction that silently produced the wrong circuit would be
 * worse than none: the whole point of ZX simplification is that the result is
 * provably the same map, and a wrong extraction discards the guarantee while
 * keeping the appearance of it.
 *
 * The extracted circuit is verified the same way the rewrites are -- its unitary is
 * compared against the diagram's linear map up to scalar -- so a claim that
 * extraction succeeded is backed by the same evidence.
 */
export interface ExtractedGate {
    name: "p" | "cz";
    qubits: number[];
    parameters: number[];
}
export interface ExtractionResult {
    extracted: boolean;
    reason: string;
    gates: ExtractedGate[];
    qubits: number;
}
/**
 * Extract a circuit, or refuse and say why.
 *
 * Phases of 0 emit nothing: a P(0) is the identity, and emitting it would inflate
 * the gate count that resource estimates elsewhere in this package consume.
 */
export declare function extractCircuit(graph: ZxGraph): ExtractionResult;
/** Dense unitary of an extracted circuit, for comparison against the diagram. */
export declare function extractedToMatrix(result: ExtractionResult): {
    real: number[][];
    imaginary: number[][];
};
/**
 * Extract and verify against the diagram's own linear map.
 *
 * A claim that extraction succeeded is only worth as much as the check behind it,
 * so the same up-to-scalar comparison used for the rewrites is applied here.
 */
export declare function extractVerified(graph: ZxGraph): {
    result: ExtractionResult;
    verdict: "matches" | "differs" | "inconclusive" | "not_extracted";
    maxDifference: number | null;
    detail: string;
};
//# sourceMappingURL=zx-graph.d.ts.map