import { z } from "zod"
import { EvidenceClassSchema, INTELLIGENCE_SCHEMA_VERSION } from "./measurement.js"
import type { NormalizedResourceEstimate } from "../engine/resources.js"

/**
 * What is being costed (ketqat-sdk#236).
 *
 * A resource estimate is only as meaningful as the statement of what was
 * estimated, and that statement has two halves that are routinely conflated: the
 * logical gate counts, and where those counts came from. A T count parsed from a
 * circuit and a T count typed into a form are the same integer and completely
 * different evidence, so `logical_counts_evidence` is required rather than
 * inferred.
 *
 * The source is recorded structurally rather than as prose. `MANUAL_LOGICAL_COUNTS`
 * is a legitimate input -- most people costing a future algorithm have counts
 * from a paper, not a circuit -- but a bundle built from typed-in numbers must
 * not be indistinguishable from one built by parsing a circuit this project can
 * re-parse.
 */

export const WorkloadSourceKindSchema = z.enum([
  /** OpenQASM 3 parsed by this project's typed parser. No code is executed. */
  "OPENQASM3",
  /** A circuit built in the KetQat Workbench and handed off with its parse result. */
  "KETQAT_WORKBENCH_CIRCUIT",
  /** An existing registry artifact, referenced by slug. */
  "KETQAT_ARTIFACT",
  /** An existing immutable run, referenced by slug. */
  "KETQAT_RUN",
  /** Counts supplied directly, typically from a published analysis. */
  "MANUAL_LOGICAL_COUNTS",
  /** Resource output of an algorithm family the SDK implements. */
  "ALGORITHM_FAMILY",
])
export type WorkloadSourceKind = z.infer<typeof WorkloadSourceKindSchema>

export const WorkloadSourceSchema = z
  .object({
    kind: WorkloadSourceKindSchema,
    /** Slug, family name, or file name, depending on `kind`. */
    reference: z.string().min(1).optional(),
    /**
     * The circuit itself, when the workload came from one.
     *
     * Stored so the estimate can be recomputed from the same input rather than
     * trusted. A bundle whose counts cannot be re-derived is a claim, not a
     * record.
     */
    openqasm3: z.string().min(1).optional(),
    /** SHA-256 of the source text, when there is source text. */
    source_digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    /** Citation for counts taken from a publication. */
    citation: z.string().min(1).optional(),
  })
  .superRefine((source, context) => {
    const needsReference: WorkloadSourceKind[] = [
      "KETQAT_ARTIFACT",
      "KETQAT_RUN",
      "ALGORITHM_FAMILY",
    ]
    if (needsReference.includes(source.kind) && !source.reference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A ${source.kind} workload must name what it refers to.`,
        path: ["reference"],
      })
    }
    if (source.kind === "OPENQASM3" && !source.openqasm3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "An OPENQASM3 workload must carry its source, so the counts can be recomputed rather than believed.",
        path: ["openqasm3"],
      })
    }
  })
export type WorkloadSource = z.infer<typeof WorkloadSourceSchema>

/**
 * Logical resources, before any error correction.
 *
 * These are counts over the circuit as written. `unsupported_for_ft_count` is
 * carried rather than folded away because a non-Clifford, non-T gate makes the T
 * count an *underestimate*, and an estimate built on an underestimate that
 * presents itself as complete is worse than one that refuses.
 */
export const LogicalResourceCountsSchema = z.object({
  logical_qubits: z.number().int().nonnegative(),
  circuit_depth: z.number().int().nonnegative(),
  gate_count: z.number().int().nonnegative(),
  one_qubit_gate_count: z.number().int().nonnegative(),
  two_qubit_gate_count: z.number().int().nonnegative(),
  clifford_count: z.number().int().nonnegative(),
  t_count: z.number().int().nonnegative(),
  toffoli_count: z.number().int().nonnegative(),
  /** Gates needing synthesis into Clifford+T before fault-tolerant costing. */
  unsupported_for_ft_count: z.number().int().nonnegative(),
  measurement_count: z.number().int().nonnegative(),
  reset_count: z.number().int().nonnegative(),
  conditional_count: z.number().int().nonnegative(),
})
export type LogicalResourceCounts = z.infer<typeof LogicalResourceCountsSchema>

export const ProblemSizeSchema = z.object({
  description: z.string().min(1),
  value: z.number().optional(),
  unit: z.string().min(1).optional(),
})
export type ProblemSize = z.infer<typeof ProblemSizeSchema>

export const QuantumWorkloadSchema = z
  .object({
    schema_version: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    /**
     * Marks a fixture. Carried through every derived record and every report, so
     * a demonstration cannot be quoted as a finding.
     */
    is_demo: z.boolean(),
    source: WorkloadSourceSchema,
    logical: LogicalResourceCountsSchema,
    /**
     * How the counts were obtained.
     *
     * `MEASURED` is not accepted: a gate count is not a measurement of anything.
     * Parsing a circuit yields `DERIVED`; typing numbers in yields
     * `USER_PROVIDED`; a published analysis yields `USER_PROVIDED` with a
     * citation on the source.
     */
    logical_counts_evidence: EvidenceClassSchema.refine(
      (value) => value === "DERIVED" || value === "USER_PROVIDED" || value === "MODELLED",
      {
        message:
          "Logical gate counts are DERIVED (parsed), USER_PROVIDED (supplied), or MODELLED (from an analytic formula). " +
          "They are never MEASURED, and an UNKNOWN count is not a workload.",
      },
    ),
    problem_size: ProblemSizeSchema.optional(),
    /** The gate set the counts were taken over, so two workloads are comparable or not. */
    gate_set: z.array(z.string().min(1)),
    notes: z.array(z.string().min(1)),
  })
  .superRefine((workload, context) => {
    if (workload.logical.logical_qubits === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A workload with no logical qubits has nothing to cost.",
        path: ["logical", "logical_qubits"],
      })
    }
  })
export type QuantumWorkload = z.infer<typeof QuantumWorkloadSchema>

/**
 * Build a workload from a parsed circuit's normalized resource estimate.
 *
 * The counts come from `estimateResources`, which is the same function the
 * Workbench displays, so the assessment and the Workbench panel cannot disagree
 * about what the circuit contains.
 */
export function workloadFromResourceEstimate(input: {
  name: string
  description: string
  source: WorkloadSource
  estimate: NormalizedResourceEstimate
  isDemo: boolean
  problemSize?: ProblemSize
  notes?: string[]
}): QuantumWorkload {
  const { nisq, fault_tolerant: ft, assumptions } = input.estimate
  const notes = [...(input.notes ?? []), ...assumptions.notes]
  return QuantumWorkloadSchema.parse({
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    name: input.name,
    description: input.description,
    is_demo: input.isDemo,
    source: input.source,
    logical: {
      logical_qubits: nisq.logical_qubits,
      circuit_depth: nisq.circuit_depth,
      gate_count: nisq.gate_count,
      one_qubit_gate_count: nisq.one_qubit_gate_count,
      two_qubit_gate_count: nisq.two_qubit_gate_count,
      clifford_count: ft.clifford_count,
      t_count: ft.t_count,
      toffoli_count: ft.toffoli_count,
      unsupported_for_ft_count: ft.unsupported_for_ft_count,
      measurement_count: nisq.measurement_count,
      reset_count: nisq.reset_count,
      conditional_count: nisq.conditional_count,
    },
    logical_counts_evidence: "DERIVED",
    ...(input.problemSize ? { problem_size: input.problemSize } : {}),
    gate_set: assumptions.gate_set,
    notes,
  })
}
