import type { LossReportEntry } from "../contracts/common.js"
import type { CircuitTransformation, EquivalenceEvidence } from "../contracts/transformation.js"
import type { BitRef, Operation, QuantumCircuit, SimpleOperation } from "../circuit/graph.js"
import { evaluateParameter } from "./parameters.js"
import { checkCircuitEquivalence } from "./differential.js"
import { circuitDepth } from "./transpile.js"

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

export const ZX_OPTIMIZER = "ketqat-zx-subset"
export const ZX_OPTIMIZER_VERSION = "0.1.0"

/** Rewrites this optimizer knows, published so a caller can see what ran. */
export const SUPPORTED_REWRITES = [
  "identity_removal",
  "self_inverse_cancellation",
  "phase_fusion",
  "hadamard_pair_cancellation",
  "zero_phase_removal",
  "hadamard_conjugation",
  "spider_fusion",
] as const
export type ZxRewrite = (typeof SUPPORTED_REWRITES)[number]

export interface RewriteApplication {
  rewrite: ZxRewrite
  /** How many times this rewrite fired. */
  count: number
  detail: string
}

export interface ZxOptimizeResult {
  circuit: QuantumCircuit
  rewrites: RewriteApplication[]
  before: { gate_count: number; two_qubit_gate_count: number; t_count: number; depth: number }
  after: { gate_count: number; two_qubit_gate_count: number; t_count: number; depth: number }
  equivalence: EquivalenceEvidence
  loss_report: LossReportEntry[]
  transformation: CircuitTransformation
}

/** Gates that are their own inverse, so two in a row cancel. */
const SELF_INVERSE = new Set(["x", "y", "z", "h", "cx", "cnot", "cz", "cy", "swap", "id", "i"])

/**
 * Gates whose axis flips under Hadamard conjugation: H A H = B.
 *
 * Z-family and X-family exchange. The Y family is deliberately absent: H Y H is
 * -Y, not Y. In a flat circuit that sign is a global phase and unobservable, so
 * the rewrite would pass an equivalence check that ignores global phase -- which
 * is exactly why it is excluded here rather than relied on. Adding it would mean
 * tracking the phase, and an unrelied-on rule is cheaper than a tracked one.
 */
const CONJUGABLE = new Map([
  ["z", "x"],
  ["x", "z"],
  ["rz", "rx"],
  ["rx", "rz"],
  ["s", "sx"],
])

/**
 * Whether `gate` leaves a Z-axis rotation on `qubit` unchanged when commuted
 * past it, so two such rotations can fuse across it.
 *
 * This is spider fusion: in ZX terms the intervening operations are edges, and
 * two same-colour spiders joined through them merge. Expressed on the circuit
 * it means a phase can slide past anything diagonal in its own basis.
 *
 * The control of a CX is the Z-basis end and commutes with Z rotations; the
 * target is the X-basis end and does not. Getting that backwards produces a
 * rewrite that passes casual inspection and changes the circuit, which is why
 * the tests below check both ends of a CX rather than one.
 */
function commutesWithZOn(operation: Operation, qubitKey: string): boolean {
  if (!isGate(operation)) return false
  const name = operation.name.toLowerCase()
  const keys = operation.qubits.map(bitKey)
  const position = keys.indexOf(qubitKey)
  if (position === -1) return true // does not touch this qubit at all

  // Diagonal in the Z basis on every qubit it touches.
  if (["z", "s", "sdg", "t", "tdg", "rz", "p", "cz"].includes(name)) return true
  // A CX commutes with Z on its control only.
  if (["cx", "cnot"].includes(name)) return position === 0
  return false
}

/** Same question for an X-axis rotation. */
function commutesWithXOn(operation: Operation, qubitKey: string): boolean {
  if (!isGate(operation)) return false
  const name = operation.name.toLowerCase()
  const keys = operation.qubits.map(bitKey)
  const position = keys.indexOf(qubitKey)
  if (position === -1) return true

  if (["x", "rx", "sx"].includes(name)) return true
  // A CX commutes with X on its target only -- the mirror of the Z case.
  if (["cx", "cnot"].includes(name)) return position === 1
  return false
}

/** Axis a single-qubit rotation turns about, or null if it is not one. */
function rotationAxis(name: string): "z" | "x" | null {
  if (["rz", "z", "s", "sdg", "t", "tdg", "p"].includes(name)) return "z"
  if (["rx", "x", "sx"].includes(name)) return "x"
  return null
}

/** Single-qubit gates whose phases add when composed. */
const PHASE_FAMILIES = new Set(["rz", "rx", "ry", "p", "u1"])

const T_GATES = new Set(["t", "tdg"])

function bitKey(bit: BitRef): string {
  return `${bit.register}[${bit.index}]`
}

function sameQubits(left: BitRef[], right: BitRef[]): boolean {
  if (left.length !== right.length) return false
  return left.every((bit, index) => bitKey(bit) === bitKey(right[index] as BitRef))
}

function isGate(operation: Operation): operation is Extract<SimpleOperation, { kind: "gate" }> {
  return operation.kind === "gate"
}

function countGates(circuit: QuantumCircuit): {
  gate_count: number
  two_qubit_gate_count: number
  t_count: number
  depth: number
} {
  let gates = 0
  let twoQubit = 0
  let tCount = 0
  const visit = (operation: Operation): void => {
    if (operation.kind === "gate") {
      gates += 1
      if (operation.qubits.length === 2) twoQubit += 1
      if (T_GATES.has(operation.name.toLowerCase())) tCount += 1
    } else if (operation.kind === "conditional") {
      visit(operation.body)
    }
  }
  circuit.operations.forEach(visit)
  return { gate_count: gates, two_qubit_gate_count: twoQubit, t_count: tCount, depth: circuitDepth(circuit) }
}

/**
 * Whether two operations may be reordered.
 *
 * Conservative on purpose. Anything touching a shared qubit blocks, and so does
 * any measurement, reset, barrier, or conditional, because reordering across
 * those changes the program. A rewrite that "optimizes" across a measurement is
 * not an optimization.
 */
function blocksRewriting(operation: Operation): boolean {
  return operation.kind !== "gate"
}

interface RewritePass {
  circuit: QuantumCircuit
  applications: Map<ZxRewrite, { count: number; detail: string }>
}

function record(pass: RewritePass, rewrite: ZxRewrite, detail: string): void {
  const existing = pass.applications.get(rewrite)
  if (existing) {
    existing.count += 1
  } else {
    pass.applications.set(rewrite, { count: 1, detail })
  }
}

/** One sweep. Returns true when anything changed, so the caller can iterate. */
function sweep(pass: RewritePass): boolean {
  const operations = pass.circuit.operations
  let changed = false

  for (let index = 0; index < operations.length; index += 1) {
    const current = operations[index] as Operation
    if (!isGate(current)) continue
    const name = current.name.toLowerCase()

    // Identity gates contribute nothing.
    if (name === "id" || name === "i") {
      operations.splice(index, 1)
      record(pass, "identity_removal", "Removed an explicit identity gate.")
      return true
    }

    // A rotation of zero angle is the identity.
    if (PHASE_FAMILIES.has(name) && current.parameters.length === 1) {
      const angle = safeAngle(current.parameters[0])
      if (angle !== null && Math.abs(normalizeAngle(angle)) < 1e-12) {
        operations.splice(index, 1)
        record(pass, "zero_phase_removal", "Removed a rotation of angle zero.")
        return true
      }
    }

    // Spider fusion: two rotations about the same axis fuse even when other
    // operations sit between them, provided every one of those commutes with
    // that axis on that qubit.
    //
    // `phase_fusion` handles the adjacent case, so this requires at least one
    // gate in between. Letting it take adjacency too would leave that rule
    // never firing while reporting the less specific reason -- a reader should
    // be able to tell "these were next to each other" from "these were
    // separated by gates that commute with them".
    //
    // This is the first rule here that reasons about what lies *between* two
    // gates rather than only about a neighbouring pair.
    if (current.qubits.length === 1 && current.parameters.length === 1) {
      const axis = rotationAxis(name)
      const qubitKey = bitKey(current.qubits[0] as BitRef)
      if (axis !== null) {
        const commutes = axis === "z" ? commutesWithZOn : commutesWithXOn
        for (let scan = index + 1; scan < operations.length; scan += 1) {
          const between = operations[scan] as Operation
          if (!isGate(between)) break
          const betweenName = between.name.toLowerCase()

          const isSameRotation =
            betweenName === name &&
            between.qubits.length === 1 &&
            bitKey(between.qubits[0] as BitRef) === qubitKey &&
            between.parameters.length === 1

          // Only fuse across something. Adjacency belongs to `phase_fusion`.
          if (isSameRotation && scan > index + 1) {
            const a = safeAngle(current.parameters[0])
            const b = safeAngle(between.parameters[0])
            if (a === null || b === null) break
            const total = normalizeAngle(a + b)
            operations.splice(scan, 1)
            if (Math.abs(total) < 1e-12) {
              operations.splice(index, 1)
              record(pass, "spider_fusion", `Fused two ${current.name} rotations across commuting gates; they summed to zero.`)
            } else {
              operations[index] = { ...current, parameters: [total] }
              record(pass, "spider_fusion", `Fused two ${current.name} rotations separated by gates that commute with them.`)
            }
            return true
          }

          // Anything that does not commute with this axis closes the window.
          if (!commutes(between, qubitKey)) break
        }
      }
    }

    // Find the next operation acting on any of the same qubits.
    const partnerIndex = nextInteracting(operations, index, current.qubits)
    if (partnerIndex === null) continue
    const partner = operations[partnerIndex] as Operation
    if (!isGate(partner)) continue
    const partnerName = partner.name.toLowerCase()

    if (!sameQubits(current.qubits, partner.qubits)) continue

    // Two identical self-inverse gates in a row cancel.
    if (name === partnerName && SELF_INVERSE.has(name) && current.parameters.length === 0) {
      operations.splice(partnerIndex, 1)
      operations.splice(index, 1)
      record(
        pass,
        name === "h" ? "hadamard_pair_cancellation" : "self_inverse_cancellation",
        `Cancelled a pair of adjacent ${current.name} gates.`,
      )
      return true
    }

    // Colour change: H Z(t) H = X(t), and H X(t) H = Z(t).
    //
    // This is a genuine ZX-calculus rewrite rather than a peephole
    // cancellation, and it is the first one here that changes a gate's *kind*
    // rather than removing gates that were already redundant. Every other rule
    // in this file fires only when something cancels, so a circuit like
    // `h; rz(t); h` -- which no adjacent pair cancels -- was left untouched at
    // three gates where one suffices (ketqat-sdk#119).
    //
    // Conjugation needs the H on both sides and nothing in between on that
    // qubit, which `nextInteracting` already guarantees for the pair; the
    // closing H is looked up the same way.
    if (name === "h" && current.qubits.length === 1 && CONJUGABLE.has(partnerName)) {
      const closingIndex = nextInteracting(operations, partnerIndex, partner.qubits)
      if (closingIndex !== null) {
        const closing = operations[closingIndex]
        if (
          closing !== undefined &&
          isGate(closing) &&
          closing.name.toLowerCase() === "h" &&
          sameQubits(closing.qubits, current.qubits) &&
          partner.qubits.length === 1 &&
          sameQubits(partner.qubits, current.qubits)
        ) {
          const flipped = CONJUGABLE.get(partnerName) as string
          operations.splice(closingIndex, 1)
          operations[partnerIndex] = { ...partner, name: flipped }
          operations.splice(index, 1)
          record(
            pass,
            "hadamard_conjugation",
            `Rewrote h ${partner.name} h into ${flipped} by the colour-change rule.`,
          )
          return true
        }
      }
    }

    // Adjacent rotations about the same axis add their phases.
    if (
      name === partnerName &&
      PHASE_FAMILIES.has(name) &&
      current.parameters.length === 1 &&
      partner.parameters.length === 1
    ) {
      const a = safeAngle(current.parameters[0])
      const b = safeAngle(partner.parameters[0])
      if (a === null || b === null) continue
      const total = normalizeAngle(a + b)
      operations.splice(partnerIndex, 1)
      if (Math.abs(total) < 1e-12) {
        operations.splice(index, 1)
        record(pass, "phase_fusion", `Fused two ${current.name} rotations that summed to zero.`)
      } else {
        operations[index] = { ...current, parameters: [total] }
        record(pass, "phase_fusion", `Fused two adjacent ${current.name} rotations.`)
      }
      changed = true
      return true
    }
  }

  return changed
}

/** Index of the next operation touching any of `qubits`, or null. */
function nextInteracting(operations: Operation[], from: number, qubits: BitRef[]): number | null {
  const keys = new Set(qubits.map(bitKey))
  for (let index = from + 1; index < operations.length; index += 1) {
    const operation = operations[index] as Operation
    if (blocksRewriting(operation)) {
      // Conservative: a measurement, reset, barrier, or conditional anywhere
      // after this point stops the search rather than being skipped over.
      return touchesAny(operation, keys) ? index : null
    }
    if (touchesAny(operation, keys)) return index
  }
  return null
}

function touchesAny(operation: Operation, keys: Set<string>): boolean {
  switch (operation.kind) {
    case "gate":
      return operation.qubits.some((bit) => keys.has(bitKey(bit)))
    case "measure":
      return keys.has(bitKey(operation.qubit))
    case "reset":
      return keys.has(bitKey(operation.qubit))
    case "barrier":
      return operation.qubits.length === 0 || operation.qubits.some((bit) => keys.has(bitKey(bit)))
    case "conditional":
      return touchesAny(operation.body, keys)
  }
}

function safeAngle(parameter: number | string | undefined): number | null {
  if (parameter === undefined) return null
  try {
    return evaluateParameter(parameter)
  } catch {
    // A free parameter cannot be fused numerically. Leaving it alone is correct;
    // guessing a value would change the circuit.
    return null
  }
}

/** Wrap an angle into (-pi, pi] so fused phases stay canonical. */
function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2
  let wrapped = angle % twoPi
  if (wrapped > Math.PI) wrapped -= twoPi
  if (wrapped <= -Math.PI) wrapped += twoPi
  return wrapped
}

export interface ZxOptimizeOptions {
  /** Cap on sweeps, so a pathological circuit cannot loop forever. */
  maxIterations?: number
  /** Above this width, equivalence is reported INCONCLUSIVE rather than checked. */
  maxVerificationQubits?: number
}

export function optimizeWithZx(
  circuit: QuantumCircuit,
  options: ZxOptimizeOptions = {},
): ZxOptimizeResult {
  const maxIterations = options.maxIterations ?? 200
  const before = countGates(circuit)

  const working: QuantumCircuit = {
    ...circuit,
    operations: circuit.operations.map((operation) => ({ ...operation })),
  }
  const pass: RewritePass = { circuit: working, applications: new Map() }

  let iterations = 0
  while (iterations < maxIterations && sweep(pass)) {
    iterations += 1
  }

  const after = countGates(working)
  const loss: LossReportEntry[] = []
  if (iterations >= maxIterations) {
    loss.push({
      feature: "rewrite_iteration_limit",
      severity: "cosmetic",
      action: "approximated",
      detail:
        `Stopped after ${maxIterations} rewrite sweeps. The circuit is valid and equivalent, but ` +
        "further reductions may remain.",
    })
  }

  // Check rather than assert. This is the whole point: a rewrite engine that
  // claims correctness without verifying it is exactly what RFC 0002 forbids.
  const equivalence = checkCircuitEquivalence(circuit, working, {
    maxQubits: options.maxVerificationQubits,
  })

  const rewrites: RewriteApplication[] = [...pass.applications.entries()].map(([rewrite, entry]) => ({
    rewrite,
    count: entry.count,
    detail: entry.detail,
  }))

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
  }
}
