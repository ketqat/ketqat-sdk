import { parseQasm3 } from "../circuit/qasm3.js"
import { estimateResources } from "../engine/resources.js"
import { ClassicalBaselineSchema, type ClassicalBaseline } from "./baseline.js"
import { INTELLIGENCE_SCHEMA_VERSION } from "./measurement.js"
import {
  EconomicModelSchema,
  HardwareModelSnapshotSchema,
  ResourceScenarioSchema,
  presetScenarios,
  type EconomicModel,
  type ResourceScenario,
} from "./scenario.js"
import { workloadFromResourceEstimate, type QuantumWorkload } from "./workload.js"
import type { EvidenceSource } from "./bundle.js"

/**
 * The end-to-end acceptance fixture (ketqat-planning#121, section 19).
 *
 * A demonstration, and marked as one everywhere it appears: `is_demo` on the
 * workload propagates into every estimate, every assessment, the comparison and
 * the report, and the assessment text says so in its own explanation. It is not
 * evidence about any organisation's workload, any vendor's device, or any
 * quantum advantage claim, and the machinery is arranged so it cannot be quoted
 * as though it were.
 *
 * It is chosen to exercise the parts that are easy to get wrong rather than the
 * parts that look impressive:
 *
 * - **A non-zero T count**, so the magic-state factory is real and its footprint
 *   has to be separated from the algorithm's.
 * - **Toffoli gates**, so the decomposition assumption is exercised.
 * - **Real logical depth**, so the runtime is not trivially zero.
 * - **A classical runtime baseline with a cost**, so the economic path can be
 *   walked -- and, in the no-cost variant, so the refusal path can be too.
 */

/**
 * A small arithmetic-flavoured circuit. Demonstration only.
 *
 * Deliberately not any real algorithm at a real problem size: a fixture that
 * looked like a genuine Shor or chemistry instance would be screenshotted and
 * quoted as an estimate for one.
 */
export const DEMO_QASM3 = `OPENQASM 3.0;
include "stdgates.inc";

// KetQat Intelligence demonstration circuit. Not a real workload.
qubit[6] q;
bit[6] c;

h q[0];
h q[1];
h q[2];
cx q[0], q[3];
cx q[1], q[4];
cx q[2], q[5];
t q[3];
t q[4];
t q[5];
ccx q[0], q[1], q[3];
ccx q[1], q[2], q[4];
t q[3];
tdg q[4];
cx q[3], q[5];
h q[3];
t q[5];
ccx q[3], q[4], q[5];
s q[0];
t q[0];
cx q[0], q[1];
h q[2];
t q[2];
c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
c[5] = measure q[5];
`

export function demoWorkload(): QuantumWorkload {
  const parsed = parseQasm3(DEMO_QASM3)
  const estimate = estimateResources(parsed.circuit)
  return workloadFromResourceEstimate({
    name: "Demonstration arithmetic block",
    description:
      "A small Clifford+T circuit with Toffoli gates, used to demonstrate the KetQat Intelligence pipeline " +
      "end to end. It is not a real workload and its numbers are not an estimate for one.",
    source: {
      kind: "OPENQASM3",
      reference: "ketqat-sdk demo fixture",
      openqasm3: DEMO_QASM3,
    },
    estimate,
    isDemo: true,
    problemSize: {
      description: "Demonstration instance; no real problem size is claimed.",
    },
    notes: [
      "Demonstration fixture. Not evidence about any workload, device, organisation, or advantage claim.",
    ],
  })
}

/**
 * A classical baseline for the same computation.
 *
 * The classical reference here is direct statevector simulation of this very
 * circuit, which at six qubits takes microseconds. That is deliberate. A fixture
 * pairing a toy circuit with an hour-long classical baseline would make the
 * quantum side look overwhelmingly better and would demonstrate nothing except
 * that a large number divided by a small one is large. Pairing it with the
 * honest classical cost of the same job produces the more useful demonstration:
 * the quantum route is *slower*, the assessment says so, and the threshold
 * engine reports how much faster the hardware would have to be.
 *
 * `USER_PROVIDED` rather than `MEASURED`: nothing was measured to produce it,
 * and claiming otherwise in a fixture would be exactly the failure the evidence
 * classification exists to prevent.
 */
export function demoBaseline(): ClassicalBaseline {
  return ClassicalBaselineSchema.parse({
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    evidence: "USER_PROVIDED",
    runtime: 5e-5,
    monetary_cost: { amount: 0.000002, currency: "USD" },
    compute_environment: "Illustrative single-core statevector simulation of the same six-qubit circuit.",
    hardware_description: "Illustrative commodity CPU core.",
    solution_quality: {
      metric: "exact output distribution",
      value: 1,
      lower_is_better: false,
    },
    workload_size: "Six qubits, twenty-two gates. Demonstration instance.",
    measured_on: null,
    evidence_url: null,
    evidence_note:
      "Illustrative figure for the demonstration, not a measurement of any classical system. Supplied so the " +
      "runtime comparison and its refusals can both be exercised.",
    limitations: [
      "Not a measurement. Every comparison derived from it demonstrates the calculation, not a result.",
      "Classical simulation of a six-qubit circuit is trivial. This baseline is not evidence about any workload " +
        "where quantum computation would be considered.",
    ],
  })
}

/**
 * A quantum cost model, supplied only where the economic path is being exercised.
 *
 * Deliberately not attached to the default demo scenarios: the more important
 * thing to demonstrate is the *refusal* that happens without one.
 */
export function demoEconomicModel(): EconomicModel {
  return EconomicModelSchema.parse({
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    currency: "USD",
    basis: "USER_PROVIDED",
    machine_cost_per_second: 0.01,
    physical_qubit_cost_per_second: null,
    source:
      "A hypothetical rate supplied for demonstration. No price for fault-tolerant quantum machine time exists to " +
      "be looked up, and this one is not a quote from anybody.",
    limitations: [
      "Hypothetical. Any cost conclusion drawn from it is a conclusion about the hypothesis, not about the market.",
    ],
  })
}

/**
 * The three presets plus a device above the code threshold.
 *
 * The fourth scenario exists to demonstrate the refusal path. A device at or
 * above the surface-code threshold cannot be error-corrected by adding distance,
 * and the estimate must say so rather than returning a very large number -- a
 * large number reads as "expensive but possible", which is the opposite of true.
 */
export function demoScenarios(): ResourceScenario[] {
  const presets = presetScenarios({ runtimeTarget: 86_400 })
  const base = presets[1]
  const aboveThreshold = ResourceScenarioSchema.parse({
    ...base,
    name: "Above threshold",
    preset: "CUSTOM",
    rationale:
      "A device whose physical error rate sits above the surface-code threshold. Included to demonstrate that the " +
      "estimator refuses rather than returning an enormous but finite requirement.",
    hardware: HardwareModelSnapshotSchema.parse({
      ...base.hardware,
      name: "Generic reference device, above the code threshold",
      physical_error_rate: 2e-2,
      confidence: "LOW",
      limitations: [
        ...base.hardware.limitations,
        "Above the surface-code threshold: no code distance suppresses error on this device.",
      ],
    }),
    factory: { ...base.factory, raw_state_error: 2e-2 },
  })
  return [...presets, aboveThreshold]
}

export function demoSources(): EvidenceSource[] {
  return [
    {
      supports: "Surface-code threshold and logical-error model",
      title: "Fowler, Mariantoni, Martinis, Cleland -- Surface codes: Towards practical large-scale quantum computation",
      url: "https://arxiv.org/abs/1208.0928",
      published_on: "2012-08-04",
      retrieved_on: "2026-08-13",
      confidence: "HIGH",
      limitations: [
        "The prefactor in the logical-error expression is fitted, not derived, and published values differ.",
      ],
    },
    {
      supports: "Lattice-surgery layout overhead",
      title: "Beverland et al. -- Assessing requirements to scale to practical quantum advantage",
      url: "https://arxiv.org/abs/2211.07629",
      published_on: "2022-11-14",
      retrieved_on: "2026-08-13",
      confidence: "HIGH",
      limitations: [
        "The 2n + ceil(sqrt(8n)) + 1 figure is one layout convention among several.",
      ],
    },
    {
      supports: "Standard device parameters used by the Base scenario",
      title: "Gidney, Ekera -- How to factor 2048 bit RSA integers in 8 hours using 20 million noisy qubits",
      url: "https://arxiv.org/abs/1905.09749",
      published_on: "2019-05-23",
      retrieved_on: "2026-08-13",
      confidence: "HIGH",
      limitations: [
        "A 1e-3 physical error rate and 1 microsecond cycle are conventions for analysis, not measurements of a device.",
      ],
    },
  ]
}
