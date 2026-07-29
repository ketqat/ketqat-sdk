import { z } from "zod"

/**
 * Typed circuit graph -- the internal working representation (RFC 0002).
 *
 * This is deliberately NOT a public interchange format. It exists so editing,
 * layout, diffing, and conversion operate on structure rather than on text.
 * Programs cross the API boundary as OpenQASM 3 or as manifests; this shape
 * carries no cross-version compatibility guarantee.
 */

export const RegisterSchema = z.object({
  name: z.string().min(1),
  size: z.number().int().positive(),
})
export type Register = z.infer<typeof RegisterSchema>

/** A single indexed bit, e.g. `q[2]`. */
export const BitRefSchema = z.object({
  register: z.string().min(1),
  index: z.number().int().nonnegative(),
})
export type BitRef = z.infer<typeof BitRefSchema>

/**
 * A gate parameter. Numbers are literal; strings hold an unevaluated
 * expression such as `pi/2` or a free parameter name.
 *
 * Expressions are kept verbatim rather than evaluated at parse time, because
 * evaluating `pi/2` to a float and re-emitting it would silently change the
 * program text and defeat round-tripping.
 */
export const ParameterSchema = z.union([z.number(), z.string().min(1)])
export type Parameter = z.infer<typeof ParameterSchema>

export const GateOperationSchema = z.object({
  kind: z.literal("gate"),
  name: z.string().min(1),
  parameters: z.array(ParameterSchema).default([]),
  qubits: z.array(BitRefSchema).min(1),
})
export type GateOperation = z.infer<typeof GateOperationSchema>

export const MeasureOperationSchema = z.object({
  kind: z.literal("measure"),
  qubit: BitRefSchema,
  clbit: BitRefSchema,
})
export type MeasureOperation = z.infer<typeof MeasureOperationSchema>

export const ResetOperationSchema = z.object({
  kind: z.literal("reset"),
  qubit: BitRefSchema,
})
export type ResetOperation = z.infer<typeof ResetOperationSchema>

export const BarrierOperationSchema = z.object({
  kind: z.literal("barrier"),
  /** Empty means "all qubits". */
  qubits: z.array(BitRefSchema).default([]),
})
export type BarrierOperation = z.infer<typeof BarrierOperationSchema>

/** Everything that may appear as the body of a classical condition. */
export const SimpleOperationSchema = z.discriminatedUnion("kind", [
  GateOperationSchema,
  MeasureOperationSchema,
  ResetOperationSchema,
  BarrierOperationSchema,
])
export type SimpleOperation = z.infer<typeof SimpleOperationSchema>

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
export const ConditionalOperationSchema = z.object({
  kind: z.literal("conditional"),
  register: z.string().min(1),
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
  bit: z.number().int().nonnegative().optional(),
  /** Value the register, or the single bit when `bit` is set, must equal. */
  equals: z.number().int().nonnegative(),
  body: SimpleOperationSchema,
})
export type ConditionalOperation = z.infer<typeof ConditionalOperationSchema>

export const OperationSchema = z.discriminatedUnion("kind", [
  GateOperationSchema,
  MeasureOperationSchema,
  ResetOperationSchema,
  BarrierOperationSchema,
  ConditionalOperationSchema,
])
export type Operation = z.infer<typeof OperationSchema>

export const QuantumCircuitSchema = z.object({
  name: z.string().min(1).optional(),
  qubit_registers: z.array(RegisterSchema).default([]),
  clbit_registers: z.array(RegisterSchema).default([]),
  operations: z.array(OperationSchema).default([]),
})
export type QuantumCircuit = z.infer<typeof QuantumCircuitSchema>

export function totalQubits(circuit: QuantumCircuit): number {
  return circuit.qubit_registers.reduce((sum, register) => sum + register.size, 0)
}

export function totalClbits(circuit: QuantumCircuit): number {
  return circuit.clbit_registers.reduce((sum, register) => sum + register.size, 0)
}

/** Counts every operation, including the bodies of conditionals. */
export function operationCount(circuit: QuantumCircuit): number {
  let count = 0
  const visit = (operation: Operation): void => {
    count += 1
    if (operation.kind === "conditional") {
      visit(operation.body)
    }
  }
  circuit.operations.forEach(visit)
  return count
}

export function gateCount(circuit: QuantumCircuit): number {
  let count = 0
  const visit = (operation: Operation): void => {
    if (operation.kind === "gate") {
      count += 1
    } else if (operation.kind === "conditional") {
      visit(operation.body)
    }
  }
  circuit.operations.forEach(visit)
  return count
}

export function twoQubitGateCount(circuit: QuantumCircuit): number {
  let count = 0
  const visit = (operation: Operation): void => {
    if (operation.kind === "gate" && operation.qubits.length === 2) {
      count += 1
    } else if (operation.kind === "conditional") {
      visit(operation.body)
    }
  }
  circuit.operations.forEach(visit)
  return count
}

export function usesMidCircuitMeasurement(circuit: QuantumCircuit): boolean {
  let seenMeasure = false
  for (const operation of circuit.operations) {
    if (operation.kind === "measure") {
      seenMeasure = true
      continue
    }
    // A gate, reset, or conditional acting after any measurement means the
    // measurement was not terminal.
    if (seenMeasure && operation.kind !== "barrier") {
      return true
    }
  }
  return false
}

export function usesClassicalControl(circuit: QuantumCircuit): boolean {
  return circuit.operations.some((operation) => operation.kind === "conditional")
}

export function usesReset(circuit: QuantumCircuit): boolean {
  const visit = (operation: Operation): boolean => {
    if (operation.kind === "reset") {
      return true
    }
    return operation.kind === "conditional" ? visit(operation.body) : false
  }
  return circuit.operations.some(visit)
}
