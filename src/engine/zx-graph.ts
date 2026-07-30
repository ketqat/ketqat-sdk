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
  id: number
  /** Phase in units of pi, so 0.5 is pi/2. Kept in these units to avoid drift. */
  phase: number
}

export interface ZxGraph {
  spiders: ZxSpider[]
  /** Hadamard edges as sorted id pairs. Graph-like form has no simple interior edges. */
  edges: Array<[number, number]>
  /** Spider ids attached to an input, in order. */
  inputs: number[]
  /** Spider ids attached to an output, in order. */
  outputs: number[]
}

export class ZxGraphError extends Error {}

const TWO_PI = 2

function key(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function normalisePhase(phase: number): number {
  // Phases live modulo 2 (in units of pi). Normalising keeps comparisons stable
  // after repeated additions of +/- 0.5.
  let value = phase % TWO_PI
  if (value < 0) value += TWO_PI
  // Snap values that are within floating-point noise of a multiple of 1/4, so a
  // phase built by adding 0.5 four times compares equal to 0.
  const snapped = Math.round(value * 4) / 4
  return Math.abs(value - snapped) < 1e-9 ? (snapped % TWO_PI) : value
}

export function edgeSet(graph: ZxGraph): Set<string> {
  return new Set(graph.edges.map(([a, b]) => key(a, b)))
}

export function neighbours(graph: ZxGraph, id: number): number[] {
  const found: number[] = []
  for (const [a, b] of graph.edges) {
    if (a === id) found.push(b)
    else if (b === id) found.push(a)
  }
  return [...new Set(found)].sort((left, right) => left - right)
}

export function isInterior(graph: ZxGraph, id: number): boolean {
  return !graph.inputs.includes(id) && !graph.outputs.includes(id)
}

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
export function graphToMatrix(graph: ZxGraph): { real: number[][]; imaginary: number[][] } {
  const ids = graph.spiders.map((spider) => spider.id)
  const position = new Map(ids.map((id, index) => [id, index]))
  const spiderCount = ids.length
  if (spiderCount > 14) {
    throw new ZxGraphError(
      `${spiderCount} spiders means 2^${spiderCount} terms; this evaluator refuses rather than crawling.`,
    )
  }

  const inputDimension = 1 << graph.inputs.length
  const outputDimension = 1 << graph.outputs.length
  const real: number[][] = Array.from({ length: outputDimension }, () => new Array(inputDimension).fill(0))
  const imaginary: number[][] = Array.from({ length: outputDimension }, () =>
    new Array(inputDimension).fill(0),
  )

  const edgeFactor = 1 / Math.SQRT2

  for (let inputBits = 0; inputBits < inputDimension; inputBits += 1) {
    for (let outputBits = 0; outputBits < outputDimension; outputBits += 1) {
      let sumReal = 0
      let sumImaginary = 0

      for (let assignment = 0; assignment < 1 << spiderCount; assignment += 1) {
        const value = (id: number): number => (assignment >> (position.get(id) as number)) & 1

        // Boundary spiders are pinned by the requested matrix entry.
        let consistent = true
        for (const [index, id] of graph.inputs.entries()) {
          if (value(id) !== ((inputBits >> index) & 1)) {
            consistent = false
            break
          }
        }
        if (consistent) {
          for (const [index, id] of graph.outputs.entries()) {
            if (value(id) !== ((outputBits >> index) & 1)) {
              consistent = false
              break
            }
          }
        }
        if (!consistent) continue

        let magnitude = 1
        let angle = 0
        for (const spider of graph.spiders) {
          if (value(spider.id) === 1) angle += Math.PI * spider.phase
        }
        for (const [a, b] of graph.edges) {
          magnitude *= edgeFactor
          if (value(a) === 1 && value(b) === 1) magnitude *= -1
        }

        sumReal += magnitude * Math.cos(angle)
        sumImaginary += magnitude * Math.sin(angle)
      }

      ;(real[outputBits] as number[])[inputBits] = sumReal
      ;(imaginary[outputBits] as number[])[inputBits] = sumImaginary
    }
  }

  return { real, imaginary }
}

/**
 * Whether two matrices describe the same linear map up to a non-zero scalar.
 *
 * Up to scalar because both rewrites change the diagram's normalisation, which is
 * physically irrelevant. The ratio is taken from the largest entry so the
 * comparison is not dominated by numerical noise in a near-zero one.
 */
export function sameUpToScalar(
  left: { real: number[][]; imaginary: number[][] },
  right: { real: number[][]; imaginary: number[][] },
  tolerance = 1e-9,
): { equal: boolean; scalar: { real: number; imaginary: number } | null; maxDifference: number } {
  const rows = left.real.length
  const columns = (left.real[0] as number[] | undefined)?.length ?? 0
  if (right.real.length !== rows || ((right.real[0] as number[] | undefined)?.length ?? 0) !== columns) {
    return { equal: false, scalar: null, maxDifference: Infinity }
  }

  let bestRow = -1
  let bestColumn = -1
  let bestMagnitude = 0
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const magnitude = Math.hypot(
        (left.real[row] as number[])[column] as number,
        (left.imaginary[row] as number[])[column] as number,
      )
      if (magnitude > bestMagnitude) {
        bestMagnitude = magnitude
        bestRow = row
        bestColumn = column
      }
    }
  }
  if (bestMagnitude < tolerance) {
    // Both all-zero counts as equal; a zero map is a zero map.
    let maxRight = 0
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        maxRight = Math.max(
          maxRight,
          Math.hypot(
            (right.real[row] as number[])[column] as number,
            (right.imaginary[row] as number[])[column] as number,
          ),
        )
      }
    }
    return { equal: maxRight < tolerance, scalar: null, maxDifference: maxRight }
  }

  const lr = (left.real[bestRow] as number[])[bestColumn] as number
  const li = (left.imaginary[bestRow] as number[])[bestColumn] as number
  const rr = (right.real[bestRow] as number[])[bestColumn] as number
  const ri = (right.imaginary[bestRow] as number[])[bestColumn] as number
  const denominator = rr * rr + ri * ri
  if (denominator < tolerance * tolerance) {
    return { equal: false, scalar: null, maxDifference: Infinity }
  }
  // scalar = left / right at the largest entry.
  const scalarReal = (lr * rr + li * ri) / denominator
  const scalarImaginary = (li * rr - lr * ri) / denominator

  let maxDifference = 0
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const scaledReal =
        scalarReal * ((right.real[row] as number[])[column] as number) -
        scalarImaginary * ((right.imaginary[row] as number[])[column] as number)
      const scaledImaginary =
        scalarReal * ((right.imaginary[row] as number[])[column] as number) +
        scalarImaginary * ((right.real[row] as number[])[column] as number)
      maxDifference = Math.max(
        maxDifference,
        Math.hypot(
          ((left.real[row] as number[])[column] as number) - scaledReal,
          ((left.imaginary[row] as number[])[column] as number) - scaledImaginary,
        ),
      )
    }
  }

  return {
    equal: maxDifference < tolerance,
    scalar: { real: scalarReal, imaginary: scalarImaginary },
    maxDifference,
  }
}

/** Toggle Hadamard edges among every pair in `vertices` -- the complementation step. */
function complementAmong(graph: ZxGraph, vertices: number[]): void {
  const present = edgeSet(graph)
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const a = vertices[i] as number
      const b = vertices[j] as number
      const identifier = key(a, b)
      if (present.has(identifier)) {
        present.delete(identifier)
        graph.edges = graph.edges.filter(([x, y]) => key(x, y) !== identifier)
      } else {
        present.add(identifier)
        graph.edges.push([a, b])
      }
    }
  }
}

export interface RewriteOutcome {
  applied: boolean
  reason: string
  graph: ZxGraph
}

/**
 * Local complementation: remove an interior spider with phase +/- pi/2.
 *
 * The rule complements the neighbourhood, shifts each neighbour's phase by the
 * opposite quarter turn, and deletes the spider. Side conditions are checked and
 * refused rather than assumed -- applying it to a spider with the wrong phase does
 * not simplify the diagram, it changes what the diagram means.
 */
export function localComplementation(input: ZxGraph, id: number): RewriteOutcome {
  const graph: ZxGraph = {
    spiders: input.spiders.map((spider) => ({ ...spider })),
    edges: input.edges.map(([a, b]) => [a, b] as [number, number]),
    inputs: [...input.inputs],
    outputs: [...input.outputs],
  }

  const spider = graph.spiders.find((candidate) => candidate.id === id)
  if (!spider) {
    return { applied: false, reason: `No spider with id ${id}.`, graph: input }
  }
  if (!isInterior(graph, id)) {
    return {
      applied: false,
      reason: `Spider ${id} is on a boundary. Removing it would change the diagram's arity, which is a different diagram rather than a simplified one.`,
      graph: input,
    }
  }
  const phase = normalisePhase(spider.phase)
  if (Math.abs(phase - 0.5) > 1e-9 && Math.abs(phase - 1.5) > 1e-9) {
    return {
      applied: false,
      reason: `Local complementation needs a phase of +pi/2 or -pi/2; spider ${id} has ${phase}pi.`,
      graph: input,
    }
  }

  const affected = neighbours(graph, id)
  // Each neighbour's phase shifts by the opposite quarter turn.
  const shift = Math.abs(phase - 0.5) < 1e-9 ? -0.5 : 0.5
  for (const neighbour of affected) {
    const target = graph.spiders.find((candidate) => candidate.id === neighbour)
    if (target) target.phase = normalisePhase(target.phase + shift)
  }

  complementAmong(graph, affected)

  graph.edges = graph.edges.filter(([a, b]) => a !== id && b !== id)
  graph.spiders = graph.spiders.filter((candidate) => candidate.id !== id)

  return {
    applied: true,
    reason: `Removed spider ${id} (phase ${phase}pi) by local complementation on ${affected.length} neighbour(s).`,
    graph,
  }
}

/**
 * Pivoting: remove two adjacent interior spiders with phases in {0, pi}.
 *
 * Complements between the three neighbourhood parts -- exclusive to u, exclusive to
 * v, and shared -- then deletes both spiders. Two spiders at once, which is why it
 * reduces diagrams that local complementation alone cannot.
 */
export function pivot(input: ZxGraph, u: number, v: number): RewriteOutcome {
  const graph: ZxGraph = {
    spiders: input.spiders.map((spider) => ({ ...spider })),
    edges: input.edges.map(([a, b]) => [a, b] as [number, number]),
    inputs: [...input.inputs],
    outputs: [...input.outputs],
  }

  const first = graph.spiders.find((candidate) => candidate.id === u)
  const second = graph.spiders.find((candidate) => candidate.id === v)
  if (!first || !second) {
    return { applied: false, reason: `Both spiders must exist; ${u} and ${v} do not.`, graph: input }
  }
  if (!isInterior(graph, u) || !isInterior(graph, v)) {
    return {
      applied: false,
      reason: "Pivoting removes both spiders, so neither may be on a boundary.",
      graph: input,
    }
  }
  if (!edgeSet(graph).has(key(u, v))) {
    return { applied: false, reason: `Spiders ${u} and ${v} are not adjacent.`, graph: input }
  }
  for (const spider of [first, second]) {
    const phase = normalisePhase(spider.phase)
    if (Math.abs(phase) > 1e-9 && Math.abs(phase - 1) > 1e-9) {
      return {
        applied: false,
        reason: `Pivoting needs phases of 0 or pi; spider ${spider.id} has ${phase}pi.`,
        graph: input,
      }
    }
  }

  const uNeighbours = neighbours(graph, u).filter((id) => id !== v)
  const vNeighbours = neighbours(graph, v).filter((id) => id !== u)
  const shared = uNeighbours.filter((id) => vNeighbours.includes(id))
  const onlyU = uNeighbours.filter((id) => !vNeighbours.includes(id))
  const onlyV = vNeighbours.filter((id) => !uNeighbours.includes(id))

  // Complement between each pair of the three groups.
  const groups: Array<[number[], number[]]> = [
    [onlyU, onlyV],
    [onlyU, shared],
    [onlyV, shared],
  ]
  const present = edgeSet(graph)
  for (const [left, right] of groups) {
    for (const a of left) {
      for (const b of right) {
        if (a === b) continue
        const identifier = key(a, b)
        if (present.has(identifier)) {
          present.delete(identifier)
          graph.edges = graph.edges.filter(([x, y]) => key(x, y) !== identifier)
        } else {
          present.add(identifier)
          graph.edges.push([a, b])
        }
      }
    }
  }

  // Phase adjustments. With a = phase(u)/pi and b = phase(v)/pi, both in {0, 1}:
  //
  //   exclusive to u  gets  b * pi
  //   exclusive to v  gets  a * pi
  //   shared          gets  (a + b + 1) * pi
  //
  // The +1 on the shared neighbourhood is the part I first omitted, and the map
  // check caught it immediately: the rewrite changed the linear map by 0.5 in every
  // phase combination, including a = b = 0 where my version applied no correction
  // at all. That extra pi is not a special case for pi-phased spiders -- it is
  // unconditional.
  const a = Math.abs(normalisePhase(first.phase) - 1) < 1e-9 ? 1 : 0
  const b = Math.abs(normalisePhase(second.phase) - 1) < 1e-9 ? 1 : 0

  const shiftPhases = (ids: number[], amount: number): void => {
    if (amount === 0) return
    for (const id of ids) {
      const target = graph.spiders.find((candidate) => candidate.id === id)
      if (target) target.phase = normalisePhase(target.phase + amount)
    }
  }
  shiftPhases(onlyU, b)
  shiftPhases(onlyV, a)
  shiftPhases(shared, a + b + 1)

  graph.edges = graph.edges.filter(([a, b]) => a !== u && b !== u && a !== v && b !== v)
  graph.spiders = graph.spiders.filter((candidate) => candidate.id !== u && candidate.id !== v)

  return {
    applied: true,
    reason: `Removed spiders ${u} and ${v} by pivoting (|only-u|=${onlyU.length}, |only-v|=${onlyV.length}, |shared|=${shared.length}).`,
    graph,
  }
}

/**
 * Apply a rewrite and check it preserved the linear map.
 *
 * The verification is the product here, not a test helper: a rewrite that cannot be
 * shown to preserve the map should not be reported as an optimisation. INCONCLUSIVE
 * when the diagram is too large to evaluate, never "assumed fine".
 */
export function applyVerified(
  graph: ZxGraph,
  rewrite: (graph: ZxGraph) => RewriteOutcome,
): {
  outcome: RewriteOutcome
  verdict: "preserved" | "changed" | "inconclusive" | "not_applied"
  maxDifference: number | null
  detail: string
} {
  const outcome = rewrite(graph)
  if (!outcome.applied) {
    return { outcome, verdict: "not_applied", maxDifference: null, detail: outcome.reason }
  }

  let before
  let after
  try {
    before = graphToMatrix(graph)
    after = graphToMatrix(outcome.graph)
  } catch (error) {
    return {
      outcome,
      verdict: "inconclusive",
      maxDifference: null,
      detail: `Could not verify: ${(error as Error).message} The rewrite is not reported as an optimisation without a check.`,
    }
  }

  const comparison = sameUpToScalar(before, after)
  return {
    outcome,
    verdict: comparison.equal ? "preserved" : "changed",
    maxDifference: comparison.maxDifference,
    detail: comparison.equal
      ? `Linear map preserved up to scalar (max difference ${comparison.maxDifference.toExponential(2)}).`
      : `Linear map CHANGED (max difference ${comparison.maxDifference.toExponential(2)}). The rewrite is unsound on this diagram and must not be applied.`,
  }
}

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
  name: "p" | "cz"
  qubits: number[]
  parameters: number[]
}

export interface ExtractionResult {
  extracted: boolean
  reason: string
  gates: ExtractedGate[]
  qubits: number
}

/**
 * Extract a circuit, or refuse and say why.
 *
 * Phases of 0 emit nothing: a P(0) is the identity, and emitting it would inflate
 * the gate count that resource estimates elsewhere in this package consume.
 */
export function extractCircuit(graph: ZxGraph): ExtractionResult {
  const spiderIds = graph.spiders.map((spider) => spider.id)
  const width = graph.inputs.length

  if (width === 0) {
    return { extracted: false, reason: "A diagram with no inputs has no circuit to extract.", gates: [], qubits: 0 }
  }
  if (graph.outputs.length !== width) {
    return {
      extracted: false,
      reason: `This diagram has ${width} input(s) and ${graph.outputs.length} output(s). Extraction produces a unitary, which needs them equal.`,
      gates: [],
      qubits: 0,
    }
  }
  if (graph.inputs.join(",") !== graph.outputs.join(",")) {
    return {
      extracted: false,
      reason:
        "Extraction here handles diagrams whose inputs and outputs are the same spiders in the same " +
        "order. A permuted or disjoint boundary needs the general gflow-based algorithm, which is not " +
        "implemented -- refused rather than approximated.",
      gates: [],
      qubits: 0,
    }
  }
  if (spiderIds.length !== width || !spiderIds.every((id) => graph.inputs.includes(id))) {
    const interior = spiderIds.filter((id) => isInterior(graph, id))
    return {
      extracted: false,
      reason:
        `This diagram has ${interior.length} interior spider(s) (${interior.join(", ")}). Extraction here ` +
        "handles diagrams reduced to their boundary; simplify further with local complementation or " +
        "pivoting first, or use the general algorithm.",
      gates: [],
      qubits: 0,
    }
  }

  const qubitOf = new Map(graph.inputs.map((id, index) => [id, index]))
  const gates: ExtractedGate[] = []

  for (const spider of graph.spiders) {
    const phase = normalisePhase(spider.phase)
    // A zero phase is the identity; emitting P(0) would inflate the gate count.
    if (Math.abs(phase) < 1e-9) continue
    gates.push({ name: "p", qubits: [qubitOf.get(spider.id) as number], parameters: [Math.PI * phase] })
  }

  for (const [a, b] of graph.edges) {
    const first = qubitOf.get(a)
    const second = qubitOf.get(b)
    if (first === undefined || second === undefined) {
      return {
        extracted: false,
        reason: `Edge (${a}, ${b}) touches a spider outside the boundary, which this extraction cannot place.`,
        gates: [],
        qubits: width,
      }
    }
    gates.push({ name: "cz", qubits: [first, second], parameters: [] })
  }

  return {
    extracted: true,
    reason: `Extracted ${gates.length} gate(s) on ${width} qubit(s): ${gates.filter((gate) => gate.name === "p").length} phase, ${gates.filter((gate) => gate.name === "cz").length} CZ.`,
    gates,
    qubits: width,
  }
}

/** Dense unitary of an extracted circuit, for comparison against the diagram. */
export function extractedToMatrix(result: ExtractionResult): { real: number[][]; imaginary: number[][] } {
  if (!result.extracted) {
    throw new ZxGraphError("Cannot build a matrix from a refused extraction.")
  }
  const size = 1 << result.qubits
  const real: number[][] = Array.from({ length: size }, (_unused, row) =>
    Array.from({ length: size }, (_ignored, column) => (row === column ? 1 : 0)),
  )
  const imaginary: number[][] = Array.from({ length: size }, () => new Array(size).fill(0))

  // Every gate here is diagonal, so the product is diagonal and each basis state
  // just accumulates a phase. Keeping that explicit avoids a general matrix
  // multiply and makes the correspondence with the diagram legible.
  for (let basis = 0; basis < size; basis += 1) {
    let angle = 0
    for (const gate of result.gates) {
      if (gate.name === "p") {
        // Qubit q is bit q of the basis index, matching this package's
        // little-endian convention.
        if ((basis >> (gate.qubits[0] as number)) & 1) angle += gate.parameters[0] as number
      } else {
        const a = (basis >> (gate.qubits[0] as number)) & 1
        const b = (basis >> (gate.qubits[1] as number)) & 1
        if (a === 1 && b === 1) angle += Math.PI
      }
    }
    ;(real[basis] as number[])[basis] = Math.cos(angle)
    ;(imaginary[basis] as number[])[basis] = Math.sin(angle)
  }

  return { real, imaginary }
}

/**
 * Extract and verify against the diagram's own linear map.
 *
 * A claim that extraction succeeded is only worth as much as the check behind it,
 * so the same up-to-scalar comparison used for the rewrites is applied here.
 */
export function extractVerified(graph: ZxGraph): {
  result: ExtractionResult
  verdict: "matches" | "differs" | "inconclusive" | "not_extracted"
  maxDifference: number | null
  detail: string
} {
  const result = extractCircuit(graph)
  if (!result.extracted) {
    return { result, verdict: "not_extracted", maxDifference: null, detail: result.reason }
  }

  let diagram
  try {
    diagram = graphToMatrix(graph)
  } catch (error) {
    return {
      result,
      verdict: "inconclusive",
      maxDifference: null,
      detail: `Extracted, but could not verify: ${(error as Error).message} Not reported as equivalent without a check.`,
    }
  }

  const circuit = extractedToMatrix(result)
  // The comparison is a guard, not a discriminator: the gate list is derived from
  // the diagram, so for a well-formed diagram it cannot disagree, and mutation
  // testing confirmed the "differs" branch is unreachable through this function.
  // It is kept because that reasoning depends on extractCircuit staying faithful --
  // if it ever stops being a direct reading of the diagram, this is what would
  // catch it. The ingredients are tested directly instead: extractedToMatrix
  // against a tampered gate list, and sameUpToScalar on known-unequal maps.
  const comparison = sameUpToScalar(diagram, circuit)
  return {
    result,
    verdict: comparison.equal ? "matches" : "differs",
    maxDifference: comparison.maxDifference,
    detail: comparison.equal
      ? `Extracted circuit matches the diagram up to scalar (max difference ${comparison.maxDifference.toExponential(2)}).`
      : `Extracted circuit does NOT match the diagram (max difference ${comparison.maxDifference.toExponential(2)}). The extraction is wrong on this diagram.`,
  }
}
