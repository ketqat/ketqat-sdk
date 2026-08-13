import { type ClassicalBaseline } from "./baseline.js";
import { type EconomicModel, type ResourceScenario } from "./scenario.js";
import { type QuantumWorkload } from "./workload.js";
import type { EvidenceSource } from "./bundle.js";
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
export declare const DEMO_QASM3 = "OPENQASM 3.0;\ninclude \"stdgates.inc\";\n\n// KetQat Intelligence demonstration circuit. Not a real workload.\nqubit[6] q;\nbit[6] c;\n\nh q[0];\nh q[1];\nh q[2];\ncx q[0], q[3];\ncx q[1], q[4];\ncx q[2], q[5];\nt q[3];\nt q[4];\nt q[5];\nccx q[0], q[1], q[3];\nccx q[1], q[2], q[4];\nt q[3];\ntdg q[4];\ncx q[3], q[5];\nh q[3];\nt q[5];\nccx q[3], q[4], q[5];\ns q[0];\nt q[0];\ncx q[0], q[1];\nh q[2];\nt q[2];\nc[0] = measure q[0];\nc[1] = measure q[1];\nc[2] = measure q[2];\nc[3] = measure q[3];\nc[4] = measure q[4];\nc[5] = measure q[5];\n";
export declare function demoWorkload(): QuantumWorkload;
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
export declare function demoBaseline(): ClassicalBaseline;
/**
 * A quantum cost model, supplied only where the economic path is being exercised.
 *
 * Deliberately not attached to the default demo scenarios: the more important
 * thing to demonstrate is the *refusal* that happens without one.
 */
export declare function demoEconomicModel(): EconomicModel;
/**
 * The three presets plus a device above the code threshold.
 *
 * The fourth scenario exists to demonstrate the refusal path. A device at or
 * above the surface-code threshold cannot be error-corrected by adding distance,
 * and the estimate must say so rather than returning a very large number -- a
 * large number reads as "expensive but possible", which is the opposite of true.
 */
export declare function demoScenarios(): ResourceScenario[];
export declare function demoSources(): EvidenceSource[];
//# sourceMappingURL=demo.d.ts.map