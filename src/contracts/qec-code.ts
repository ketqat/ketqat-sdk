import { z } from "zod"

/**
 * QEC code catalog (RFC 0006).
 *
 * This is the single source of truth for the catalog. The Python runner reads
 * the generated JSON rather than keeping its own copy, for the same reason the
 * JSON Schemas are generated: two hand-maintained copies drift, and a drifted
 * scientific catalog is worse than an absent one because it looks authoritative.
 *
 * Two things the catalog deliberately does not do:
 *
 * - It does not reproduce any external catalog's data or prose. Entries are
 *   structural facts stated in the project's own words; external catalogs are
 *   referenced as pointers.
 * - It does not emit recommendations. Suitability is *derived* from a hardware
 *   snapshot's capability fields so the claim can be checked, and capability
 *   matching never reports SIMULATED or DEMONSTRATED -- only a recorded run can
 *   raise the level that far.
 */

export const QecCodeFamilySchema = z.enum([
  "STABILIZER",
  "CSS",
  "SUBSYSTEM",
  "TOPOLOGICAL",
  "SURFACE",
  "TORIC",
  "COLOR",
  "QUANTUM_LDPC",
  "HYPERGRAPH_PRODUCT",
  "BIVARIATE_BICYCLE",
  "CONCATENATED",
  "BOSONIC",
  "GKP",
  "CAT",
  "QUDIT",
  "ERASURE_TOLERANT",
  "APPROXIMATE",
  "FLOQUET",
])
export type QecCodeFamily = z.infer<typeof QecCodeFamilySchema>

/**
 * How well a code and a device match. Ordered weakest to strongest, with the
 * negative and the unknown cases kept distinct: "we do not know" and "this does
 * not work" are different statements.
 */
export const SuitabilityLevelSchema = z.enum([
  "UNKNOWN",
  "INCOMPATIBLE_UNDER_ASSUMPTIONS",
  "REQUIRES_NONLOCAL_CONNECTIVITY",
  "REQUIRES_FAST_FEEDFORWARD",
  "REQUIRES_LOSS_DETECTION",
  "THEORETICALLY_SUITABLE",
  "SIMULATED",
  "DEMONSTRATED",
  "COMPATIBLE",
])
export type SuitabilityLevel = z.infer<typeof SuitabilityLevelSchema>

export const QecCodeSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  families: z.array(QecCodeFamilySchema).min(1),
  description: z.string().min(1),
  /** Whether syndrome extraction needs measurement partway through a circuit. */
  requires_mid_circuit_measurement: z.boolean().default(true),
  requires_feed_forward: z.boolean().default(false),
  requires_nonlocal_connectivity: z.boolean().default(false),
  requires_loss_detection: z.boolean().default(false),
  supported_distances: z.array(z.number().int().positive()).default([]),
  /** Stim circuit generator, when this code is directly runnable. */
  stim_generator: z.string().min(1).nullable().default(null),
  /** External references as pointers, never copied content. */
  references: z.array(z.string().url()).default([]),
  notes: z.array(z.string().min(1)).default([]),
})
export type QecCode = z.infer<typeof QecCodeSchema>

export const QEC_CODE_CATALOG: QecCode[] = [
  {
    slug: "rotated-surface-code-memory-x",
    name: "Rotated surface code (X memory)",
    families: ["STABILIZER", "CSS", "TOPOLOGICAL", "SURFACE"],
    description:
      "Planar topological code on a rotated lattice, preserving one logical qubit through repeated " +
      "rounds of syndrome extraction.",
    requires_mid_circuit_measurement: true,
    requires_feed_forward: false,
    requires_nonlocal_connectivity: false,
    requires_loss_detection: false,
    supported_distances: [3, 5, 7, 9],
    stim_generator: "surface_code:rotated_memory_x",
    references: ["https://errorcorrectionzoo.org/c/surface"],
    notes: ["Nearest-neighbour connectivity on a two-dimensional grid is sufficient."],
  },
  {
    slug: "rotated-surface-code-memory-z",
    name: "Rotated surface code (Z memory)",
    families: ["STABILIZER", "CSS", "TOPOLOGICAL", "SURFACE"],
    description: "Rotated surface code memory experiment in the Z basis.",
    requires_mid_circuit_measurement: true,
    requires_feed_forward: false,
    requires_nonlocal_connectivity: false,
    requires_loss_detection: false,
    supported_distances: [3, 5, 7, 9],
    stim_generator: "surface_code:rotated_memory_z",
    references: ["https://errorcorrectionzoo.org/c/surface"],
    notes: [],
  },
  {
    slug: "unrotated-surface-code-memory-x",
    name: "Unrotated surface code (X memory)",
    families: ["STABILIZER", "CSS", "TOPOLOGICAL", "SURFACE"],
    description:
      "Unrotated surface code memory; uses more physical qubits per distance than the rotated layout.",
    requires_mid_circuit_measurement: true,
    requires_feed_forward: false,
    requires_nonlocal_connectivity: false,
    requires_loss_detection: false,
    supported_distances: [3, 5, 7],
    stim_generator: "surface_code:unrotated_memory_x",
    references: ["https://errorcorrectionzoo.org/c/surface"],
    notes: [],
  },
  {
    slug: "repetition-code-memory",
    name: "Repetition code (memory)",
    families: ["STABILIZER", "CSS"],
    description:
      "One-dimensional classical repetition code protecting against a single error type. Useful as a " +
      "control: it is not a full quantum code.",
    requires_mid_circuit_measurement: true,
    requires_feed_forward: false,
    requires_nonlocal_connectivity: false,
    requires_loss_detection: false,
    supported_distances: [3, 5, 7, 9, 11],
    stim_generator: "repetition_code:memory",
    references: ["https://errorcorrectionzoo.org/c/quantum_repetition"],
    notes: [
      "Protects against one error type only, so a low logical error rate here is not evidence of " +
        "quantum error correction.",
    ],
  },
  {
    slug: "color-code-memory-xyz",
    name: "Color code (XYZ memory)",
    families: ["STABILIZER", "CSS", "TOPOLOGICAL", "COLOR"],
    description: "Triangular color code memory, admitting transversal Clifford gates.",
    requires_mid_circuit_measurement: true,
    requires_feed_forward: false,
    requires_nonlocal_connectivity: false,
    requires_loss_detection: false,
    supported_distances: [3, 5, 7],
    stim_generator: "color_code:memory_xyz",
    references: ["https://errorcorrectionzoo.org/c/color"],
    notes: ["Syndrome extraction uses weight-six stabilizers on a three-colorable lattice."],
  },
]

export function getQecCode(slug: string): QecCode | undefined {
  return QEC_CODE_CATALOG.find((code) => code.slug === slug)
}

export function qecCodesInFamily(family: string): QecCode[] {
  const upper = family.toUpperCase()
  return QEC_CODE_CATALOG.filter((code) => (code.families as string[]).includes(upper))
}

export interface SuitabilityAssessment {
  code: string
  level: SuitabilityLevel
  blockers: string[]
  evidence: string
}

/** Capability fields a suitability assessment reads from a hardware snapshot. */
export interface SuitabilityCapabilities {
  mid_circuit_measurement?: boolean
  feed_forward?: boolean
  all_to_all_connectivity?: boolean
  dynamic_connectivity?: boolean
  loss_detection?: boolean
  erasure_conversion?: boolean
}

/**
 * Derive a code/hardware suitability level from a snapshot's capabilities.
 *
 * Derived rather than asserted: every blocking requirement is listed, so the
 * claim can be checked against the snapshot it came from. The result never
 * exceeds `THEORETICALLY_SUITABLE`, because `SIMULATED` and `DEMONSTRATED` are
 * claims about experiments that were actually run.
 */
export function assessQecSuitability(
  code: QecCode,
  capabilities: SuitabilityCapabilities,
): SuitabilityAssessment {
  const blockers: string[] = []
  let level: SuitabilityLevel = "THEORETICALLY_SUITABLE"

  if (code.requires_mid_circuit_measurement && !capabilities.mid_circuit_measurement) {
    blockers.push("mid-circuit measurement is required for syndrome extraction")
    level = "INCOMPATIBLE_UNDER_ASSUMPTIONS"
  }
  if (code.requires_feed_forward && !capabilities.feed_forward) {
    blockers.push("classical feed-forward is required")
    level = "REQUIRES_FAST_FEEDFORWARD"
  }
  if (
    code.requires_nonlocal_connectivity &&
    !(capabilities.all_to_all_connectivity || capabilities.dynamic_connectivity)
  ) {
    blockers.push("non-local connectivity is required")
    level = "REQUIRES_NONLOCAL_CONNECTIVITY"
  }
  if (code.requires_loss_detection && !(capabilities.loss_detection || capabilities.erasure_conversion)) {
    blockers.push("loss or erasure detection is required")
    level = "REQUIRES_LOSS_DETECTION"
  }

  return {
    code: code.slug,
    level,
    blockers,
    evidence:
      "Derived from the capability fields of the supplied hardware snapshot. This is a capability " +
      "match, not an experimental result: only a recorded run may raise the level to SIMULATED or " +
      "DEMONSTRATED.",
  }
}
