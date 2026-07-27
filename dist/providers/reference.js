import { HardwareProfileSchema, linearTopology } from "../hardware/profile.js";
import { totalQubits } from "../circuit/graph.js";
import { transpileForHardware } from "../engine/transpile.js";
import { simulateStatevector } from "../engine/statevector.js";
import { ProviderError, buildEstimate, notRun, } from "./adapter.js";
/**
 * Reference BYOC provider adapter.
 *
 * This is a **contract-test adapter**, and it says so in every result it
 * produces. It exercises the full BYOC path -- describe a backend, compile
 * against its snapshot, estimate cost, require confirmation, handle absent
 * credentials -- without contacting any provider, so the contract can be
 * verified in CI where no credential exists.
 *
 * Its results carry `execution_class: "SIMULATION"`, never `"HARDWARE"`. That is
 * the point: a contract-test adapter must be incapable of producing something
 * that reads as a device measurement. A real adapter for a real provider
 * implements the same interface and is the only thing permitted to report
 * `HARDWARE`, and only when the provider actually executed on a device.
 *
 * There is deliberately no fixture here of a "successful hardware run". Such a
 * fixture is indistinguishable from a real result in a screenshot, and
 * eventually someone cites it.
 */
export const REFERENCE_PROVIDER = "reference-contract-test";
const BACKENDS = {
    "line-5": { qubits: 5, costPerShot: 0.0001, quota: 10000 },
    "line-9": { qubits: 9, costPerShot: null, quota: null },
    "exhausted": { qubits: 5, costPerShot: 0.0001, quota: 0 },
};
export class ReferenceProviderAdapter {
    constructor() {
        this.provider = REFERENCE_PROVIDER;
        this.version = "0.1.0";
    }
    async describeBackend(backend) {
        const definition = BACKENDS[backend];
        if (!definition) {
            throw new ProviderError(`Unknown backend '${backend}'. Known backends: ${Object.keys(BACKENDS).join(", ")}.`);
        }
        return HardwareProfileSchema.parse({
            schema_version: "0.1",
            provider: this.provider,
            backend,
            snapshot_id: `contract-test-${backend}`,
            modality: "SIMULATED",
            qubit_count: definition.qubits,
            native_gates: ["h", "x", "z", "rz", "sx", "cx", "swap"],
            basis_two_qubit_gate: "cx",
            couplings: linearTopology(definition.qubits),
            qubits: Array.from({ length: definition.qubits }, (_unused, index) => ({ index, operational: true })),
            capabilities: { mid_circuit_measurement: true, feed_forward: true, reset: true },
            retrieved_at: new Date().toISOString(),
            source: "Reference contract-test adapter. Not an observation of any physical device, and this " +
                "adapter cannot produce a hardware result.",
        });
    }
    async estimate(circuit, backend, shots, _credential) {
        const definition = BACKENDS[backend];
        if (!definition) {
            throw new ProviderError(`Unknown backend '${backend}'.`);
        }
        const warnings = [
            "This is the reference contract-test adapter. It does not contact a provider and cannot " +
                "produce a hardware result.",
        ];
        const qubits = totalQubits(circuit);
        if (qubits > definition.qubits) {
            warnings.push(`Circuit uses ${qubits} qubits but ${backend} has ${definition.qubits}.`);
        }
        return buildEstimate({
            provider: this.provider,
            backend,
            shots,
            estimatedCost: definition.costPerShot === null
                ? null
                : { amount: Number((definition.costPerShot * shots).toFixed(6)), currency: "USD" },
            remainingQuota: definition.quota,
            warnings,
        });
    }
    async submit(circuit, backend, shots, options) {
        const definition = BACKENDS[backend];
        if (!definition) {
            throw new ProviderError(`Unknown backend '${backend}'.`);
        }
        // Absent credentials produce a NOT_RUN record, never an imitation result.
        if (!options.credential) {
            return notRun(this.provider, backend, "credentials_unavailable", "No provider credential was supplied, so nothing was submitted. This is recorded as not " +
                "run rather than simulated in place of a hardware result.");
        }
        // Confirmation is required per submission and never inferred.
        if (!options.confirmed) {
            return notRun(this.provider, backend, "confirmation_declined", "The submission was not confirmed. Provider, backend, shot count, estimated cost, and " +
                "quota must be shown and accepted before anything is submitted.");
        }
        if (definition.quota !== null && definition.quota <= 0) {
            return notRun(this.provider, backend, "quota_exhausted", `${backend} reports no remaining quota, so nothing was submitted.`);
        }
        // Compile against the backend's own snapshot, so the result is interpretable
        // against the device it targeted.
        const profile = await this.describeBackend(backend);
        const routed = transpileForHardware(circuit, profile);
        const executed = simulateStatevector(routed.circuit, { shots, seed: 1 });
        return {
            status: "COMPLETED",
            provider: this.provider,
            backend,
            provider_job_id: `contract-test-${Date.now()}`,
            shots,
            // Never HARDWARE. This adapter contacts no provider, so a hardware label
            // would be a false claim regardless of how the result was produced.
            execution_class: "SIMULATION",
            counts: executed.counts,
            hardware_snapshot_id: profile.snapshot_id,
            loss_report: routed.loss_report,
            submitted_at: new Date().toISOString(),
        };
    }
}
/** Adapters available by provider name. Real providers are added here. */
export const PROVIDER_ADAPTERS = {
    [REFERENCE_PROVIDER]: () => new ReferenceProviderAdapter(),
};
export function resolveProvider(name) {
    const factory = PROVIDER_ADAPTERS[name];
    if (!factory) {
        throw new ProviderError(`Unknown provider '${name}'. Available: ${Object.keys(PROVIDER_ADAPTERS).join(", ")}. ` +
            "A provider is rejected rather than defaulted, so a submission cannot silently go somewhere " +
            "other than where it was addressed.");
    }
    return factory();
}
//# sourceMappingURL=reference.js.map