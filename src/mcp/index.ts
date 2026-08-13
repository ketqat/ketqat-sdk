import { z } from "zod"
import { emitQasm3, parseQasm3, Qasm3ParseError } from "../circuit/qasm3.js"
import {
  gateCount,
  totalClbits,
  totalQubits,
  twoQubitGateCount,
  usesClassicalControl,
  usesMidCircuitMeasurement,
  usesReset,
} from "../circuit/graph.js"
import { HardwareProfileSchema } from "../hardware/profile.js"
import { checkCircuitEquivalence } from "../engine/differential.js"
import { estimateResources } from "../engine/resources.js"
import { simulateStatevector } from "../engine/statevector.js"
import { circuitDepth, transpileForHardware } from "../engine/transpile.js"
import { optimizeWithZx } from "../engine/zx.js"
import { NoiseModelSchema } from "../engine/noise.js"
import {
  AssessmentSpecSchema,
  ResourceIntelligenceBundleSchema,
  buildBundle,
  buildReport,
  resolveAssessment,
  verifyBundle,
} from "../intelligence/index.js"

/**
 * MCP tool definitions for the KetQat engine.
 *
 * Two properties are structural rather than conventional here:
 *
 * 1. **Read-only by default.** Every tool in this module is annotated
 *    `readOnly: true`. A tool that spends money, mutates a registry, or submits
 *    a job is not defined here at all, so it cannot be exposed by accident. Such
 *    tools belong behind explicit confirmation, per RFC 0005.
 * 2. **Structured output.** Each tool declares an output schema and returns a
 *    typed object, not prose. A model consuming a benchmark result should not
 *    have to parse a sentence to find a confidence interval.
 *
 * This module defines the tools and their handlers. Transport -- stdio or
 * authenticated HTTP -- is deliberately left to the server that hosts them.
 */

export interface McpToolDefinition<Input = unknown, Output = unknown> {
  name: string
  title: string
  description: string
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  /** Every tool here is read-only; a mutating tool must be declared elsewhere. */
  readOnly: true
  handler: (input: Input) => Output
}

const CircuitInput = z.object({
  qasm: z.string().min(1).describe("OpenQASM 3 source."),
})

const LossReportOutput = z.array(
  z.object({
    feature: z.string(),
    severity: z.enum(["semantic", "structural", "cosmetic"]),
    action: z.enum(["rejected", "dropped", "approximated"]),
    detail: z.string(),
    location: z.string().optional(),
  }),
)

const EquivalenceOutput = z.object({
  level: z.enum([
    "NOT_CHECKED",
    "NUMERICALLY_CHECKED",
    "SYMBOLICALLY_REDUCED",
    "PROVED_BY_SUPPORTED_REWRITE",
    "FAILED",
    "INCONCLUSIVE",
  ]),
  method: z.string().optional(),
  tolerance: z.number().optional(),
  global_phase_ignored: z.boolean().optional(),
  qubit_count: z.number().optional(),
  counterexample: z.string().optional(),
  reason: z.string().optional(),
})

function circuitOf(qasm: string) {
  return parseQasm3(qasm)
}

export const inspectCircuitTool: McpToolDefinition = {
  name: "inspect_circuit",
  title: "Inspect a quantum circuit",
  description:
    "Parse OpenQASM 3 and report structure: qubit and clbit counts, gate counts, depth, and whether " +
    "the circuit uses mid-circuit measurement, classical control, or reset. Reports any conversion loss.",
  inputSchema: CircuitInput,
  outputSchema: z.object({
    qubits: z.number(),
    clbits: z.number(),
    gate_count: z.number(),
    two_qubit_gate_count: z.number(),
    depth: z.number(),
    uses_mid_circuit_measurement: z.boolean(),
    uses_classical_control: z.boolean(),
    uses_reset: z.boolean(),
    loss_report: LossReportOutput,
  }),
  readOnly: true,
  handler: (input) => {
    const { qasm } = CircuitInput.parse(input)
    const { circuit, loss_report } = circuitOf(qasm)
    return {
      qubits: totalQubits(circuit),
      clbits: totalClbits(circuit),
      gate_count: gateCount(circuit),
      two_qubit_gate_count: twoQubitGateCount(circuit),
      depth: circuitDepth(circuit),
      uses_mid_circuit_measurement: usesMidCircuitMeasurement(circuit),
      uses_classical_control: usesClassicalControl(circuit),
      uses_reset: usesReset(circuit),
      loss_report,
    }
  },
}

export const convertCircuitTool: McpToolDefinition = {
  name: "convert_circuit",
  title: "Convert a circuit to canonical OpenQASM 3",
  description:
    "Re-emit a circuit as canonical OpenQASM 3. Any construct the adapter cannot represent is reported " +
    "in the loss report rather than dropped silently.",
  inputSchema: CircuitInput,
  outputSchema: z.object({ qasm3: z.string(), loss_report: LossReportOutput }),
  readOnly: true,
  handler: (input) => {
    const { qasm } = CircuitInput.parse(input)
    const { circuit, loss_report } = circuitOf(qasm)
    return { qasm3: emitQasm3(circuit), loss_report }
  },
}

const SimulateInput = z.object({
  qasm: z.string().min(1),
  shots: z.number().int().positive().max(200_000).optional(),
  seed: z.number().int().nonnegative().optional().describe("Omit for a non-reproducible run."),
  noise: NoiseModelSchema.optional(),
})

export const simulateCircuitTool: McpToolDefinition = {
  name: "simulate_circuit",
  title: "Simulate a quantum circuit",
  description:
    "Exact statevector simulation. With shots, returns measurement counts; without shots and without " +
    "measurement, returns the final statevector. A run without a seed is reported as non-reproducible.",
  inputSchema: SimulateInput,
  outputSchema: z.object({
    qubit_count: z.number(),
    counts: z.record(z.number()).optional(),
    probabilities: z.record(z.number()).optional(),
    statevector: z.object({ real: z.array(z.number()), imaginary: z.array(z.number()) }).optional(),
    shots: z.number(),
    seed: z.number().nullable(),
    deterministic: z.boolean(),
    backend: z.string(),
  }),
  readOnly: true,
  handler: (input) => {
    const parsed = SimulateInput.parse(input)
    const { circuit } = circuitOf(parsed.qasm)
    const result = simulateStatevector(circuit, {
      shots: parsed.shots,
      seed: parsed.seed,
      noise: parsed.noise,
    })
    return {
      qubit_count: result.qubit_count,
      counts: result.counts,
      probabilities: result.probabilities,
      statevector: result.statevector,
      shots: result.shots,
      seed: result.seed,
      deterministic: result.deterministic,
      backend: result.backend,
    }
  },
}

export const estimateResourcesTool: McpToolDefinition = {
  name: "estimate_resources",
  title: "Estimate circuit resources",
  description:
    "Static resource estimate with its assumptions attached: estimator, version, gate set, and what the " +
    "numbers do not account for. Estimates under different assumptions are not comparable.",
  inputSchema: z.object({ qasm: z.string().min(1), hardware_profile: z.unknown().optional() }),
  outputSchema: z.object({
    schema_version: z.string(),
    nisq: z.record(z.unknown()),
    fault_tolerant: z.record(z.unknown()),
    assumptions: z.record(z.unknown()),
  }),
  readOnly: true,
  handler: (input) => {
    const parsed = z.object({ qasm: z.string(), hardware_profile: z.unknown().optional() }).parse(input)
    const { circuit } = circuitOf(parsed.qasm)
    const profile = parsed.hardware_profile ? HardwareProfileSchema.parse(parsed.hardware_profile) : undefined
    return estimateResources(circuit, profile)
  },
}

export const transpileForHardwareTool: McpToolDefinition = {
  name: "transpile_for_hardware",
  title: "Transpile a circuit onto a hardware snapshot",
  description:
    "Route a circuit onto a device's coupling graph, inserting SWAPs. Reports SWAP count and depth " +
    "rather than claiming optimality, and records any capability the device lacks as a loss.",
  inputSchema: z.object({ qasm: z.string().min(1), hardware_profile: z.unknown() }),
  outputSchema: z.object({
    qasm3: z.string(),
    initial_layout: z.array(z.number()),
    final_layout: z.array(z.number()),
    swap_count: z.number(),
    depth: z.number(),
    loss_report: LossReportOutput,
  }),
  readOnly: true,
  handler: (input) => {
    const parsed = z.object({ qasm: z.string(), hardware_profile: z.unknown() }).parse(input)
    const { circuit } = circuitOf(parsed.qasm)
    const result = transpileForHardware(circuit, HardwareProfileSchema.parse(parsed.hardware_profile))
    return {
      qasm3: emitQasm3(result.circuit),
      initial_layout: result.initial_layout,
      final_layout: result.final_layout,
      swap_count: result.swap_count,
      depth: result.depth,
      loss_report: result.loss_report,
    }
  },
}

export const optimizeWithZxTool: McpToolDefinition = {
  name: "optimize_with_zx",
  title: "Optimize a circuit with ZX rewrites",
  description:
    "Apply a bounded set of ZX rewrites and return the result together with checked equivalence " +
    "evidence. Above the verification width the evidence is INCONCLUSIVE, which is not a claim that " +
    "the circuits differ.",
  inputSchema: CircuitInput,
  outputSchema: z.object({
    qasm3: z.string(),
    before: z.record(z.number()),
    after: z.record(z.number()),
    rewrites: z.array(z.object({ rewrite: z.string(), count: z.number(), detail: z.string() })),
    equivalence: EquivalenceOutput,
  }),
  readOnly: true,
  handler: (input) => {
    const { qasm } = CircuitInput.parse(input)
    const { circuit } = circuitOf(qasm)
    const result = optimizeWithZx(circuit)
    return {
      qasm3: emitQasm3(result.circuit),
      before: result.before,
      after: result.after,
      rewrites: result.rewrites,
      equivalence: result.equivalence,
    }
  },
}

export const checkEquivalenceTool: McpToolDefinition = {
  name: "check_circuit_equivalence",
  title: "Check whether two circuits are equivalent",
  description:
    "Compare two circuits by exact simulation. Returns FAILED only with a counterexample, and " +
    "INCONCLUSIVE with a reason when the check cannot decide -- failing to prove equality is not " +
    "proving inequality.",
  inputSchema: z.object({
    left_qasm: z.string().min(1),
    right_qasm: z.string().min(1),
    tolerance: z.number().positive().optional(),
    ignore_global_phase: z.boolean().optional(),
  }),
  outputSchema: EquivalenceOutput,
  readOnly: true,
  handler: (input) => {
    const parsed = z
      .object({
        left_qasm: z.string(),
        right_qasm: z.string(),
        tolerance: z.number().optional(),
        ignore_global_phase: z.boolean().optional(),
      })
      .parse(input)
    return checkCircuitEquivalence(circuitOf(parsed.left_qasm).circuit, circuitOf(parsed.right_qasm).circuit, {
      tolerance: parsed.tolerance,
      ignoreGlobalPhase: parsed.ignore_global_phase,
    })
  },
}

/** Every read-only engine tool. */
/**
 * Resource intelligence, as pure calculation (ketqat-sdk#236).
 *
 * These belong in this file rather than in `execution.ts` because they change
 * nothing: no remote project is created or updated, no job is queued, no QPU
 * time is bought, and no network call is made. They read a document the caller
 * supplies and compute over it, exactly as the CLI does.
 *
 * The boundary this file exists to hold is that `readOnly: true` must be *true*.
 * A tool that saved an assessment to a registry, or that spent money on a
 * device, would have to be declared in `execution.ts` behind its own type and
 * its own confirmation, however convenient it would be to add it here.
 */
export const estimateResourceIntelligenceTool: McpToolDefinition = {
  name: "estimate_resource_intelligence",
  title: "Estimate quantum resources under stated assumptions",
  description:
    "Cost a quantum workload under one or more resource scenarios. Returns logical and physical resource " +
    "estimates with the algorithm, routing and magic-state-factory footprints kept separate, runtime under " +
    "whichever limiter binds, sensitivity across six parameters, and a reproducibility hash. Computes nothing " +
    "about cost or advantage unless a classical baseline and a quantum cost model are both supplied. " +
    "Purely local: no circuit is executed and no network call is made.",
  inputSchema: z.object({
    assessment: AssessmentSpecSchema.describe(
      "An assessment document: workload, optional classical baseline, and which scenarios to run.",
    ),
  }),
  outputSchema: z.object({
    reproducibility_hash: z.string(),
    is_demo: z.boolean(),
    estimates: z.array(z.unknown()),
    comparison: z.unknown(),
  }),
  readOnly: true,
  handler: (input) => {
    const { assessment } = input as { assessment: z.infer<typeof AssessmentSpecSchema> }
    const bundle = buildBundle(resolveAssessment(assessment))
    return {
      reproducibility_hash: bundle.reproducibility_hash,
      is_demo: bundle.is_demo,
      estimates: bundle.estimates,
      comparison: bundle.comparison,
    }
  },
}

export const compareResourceScenariosTool: McpToolDefinition = {
  name: "compare_resource_scenarios",
  title: "Compare resource scenarios and their advantage thresholds",
  description:
    "Place several sets of assumptions side by side and report, for each, the resources required and the " +
    "conditions hardware would have to satisfy. Refuses to produce an aggregate: results computed under " +
    "different assumptions are not averaged. Reports why two scenarios are incomparable when they are.",
  inputSchema: z.object({
    assessment: AssessmentSpecSchema,
  }),
  outputSchema: z.object({
    reproducibility_hash: z.string(),
    comparable: z.boolean(),
    incomparability_reasons: z.array(z.string()),
    rows: z.array(z.unknown()),
    thresholds: z.array(z.unknown()),
    assessments: z.array(z.unknown()),
    aggregation_policy: z.string(),
  }),
  readOnly: true,
  handler: (input) => {
    const { assessment } = input as { assessment: z.infer<typeof AssessmentSpecSchema> }
    const bundle = buildBundle(resolveAssessment(assessment))
    return {
      reproducibility_hash: bundle.reproducibility_hash,
      comparable: bundle.comparison.comparable,
      incomparability_reasons: bundle.comparison.incomparability_reasons,
      rows: bundle.comparison.rows,
      thresholds: bundle.thresholds,
      assessments: bundle.assessments,
      aggregation_policy: bundle.comparison.aggregation_policy,
    }
  },
}

export const verifyResourceIntelligenceBundleTool: McpToolDefinition = {
  name: "verify_resource_intelligence_bundle",
  title: "Verify a resource intelligence bundle",
  description:
    "Recompute a bundle's estimates, thresholds and decision assessments from the inputs it carries, and " +
    "compare them with what it claims, along with its reproducibility hash. A bundle whose conclusions were " +
    "edited and then re-hashed passes a hash check and fails this one.",
  inputSchema: z.object({ bundle: z.unknown() }),
  outputSchema: z.object({
    valid: z.boolean(),
    hash_matches: z.boolean(),
    estimates_match: z.boolean(),
    decision_matches: z.boolean(),
    expected_hash: z.string(),
    actual_hash: z.string(),
    problems: z.array(z.string()),
    report: z.unknown().optional(),
  }),
  readOnly: true,
  handler: (input) => {
    const { bundle } = input as { bundle: unknown }
    const verification = verifyBundle(bundle)
    if (!verification.valid) return verification
    return { ...verification, report: buildReport(ResourceIntelligenceBundleSchema.parse(bundle)) }
  },
}

export const MCP_TOOLS: McpToolDefinition[] = [
  inspectCircuitTool,
  convertCircuitTool,
  simulateCircuitTool,
  estimateResourcesTool,
  transpileForHardwareTool,
  optimizeWithZxTool,
  checkEquivalenceTool,
  estimateResourceIntelligenceTool,
  compareResourceScenariosTool,
  verifyResourceIntelligenceBundleTool,
]

export interface McpToolError {
  error: string
  message: string
  feature?: string | null
  line?: number | null
}

/**
 * Invoke a tool by name with validated input and output.
 *
 * Output is validated against the declared schema before returning, so a
 * handler cannot quietly return a shape the tool advertised it would not.
 */
export function callTool(name: string, input: unknown): unknown | McpToolError {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name)
  if (!tool) {
    return { error: "unknown_tool", message: `No read-only tool named '${name}'.` }
  }
  try {
    const output = tool.handler(tool.inputSchema.parse(input))
    return tool.outputSchema.parse(output)
  } catch (error) {
    if (error instanceof Qasm3ParseError) {
      return {
        error: "qasm_parse_error",
        message: error.message,
        feature: error.feature ?? null,
        line: error.line ?? null,
      }
    }
    if (error instanceof z.ZodError) {
      return { error: "invalid_input", message: error.issues.map((issue) => issue.message).join("; ") }
    }
    return { error: "tool_failed", message: (error as Error).message }
  }
}

/** Tool listing in the shape an MCP server advertises. */
export function listTools(): Array<{ name: string; title: string; description: string; readOnly: boolean }> {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    readOnly: tool.readOnly,
  }))
}
