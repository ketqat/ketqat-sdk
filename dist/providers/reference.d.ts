import { type HardwareProfile } from "../hardware/profile.js";
import { type QuantumCircuit } from "../circuit/graph.js";
import { type NotRunRecord, type ProviderAdapter, type ProviderCredential, type ProviderSubmission, type SubmissionEstimate } from "./adapter.js";
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
export declare const REFERENCE_PROVIDER = "reference-contract-test";
export declare class ReferenceProviderAdapter implements ProviderAdapter {
    readonly provider = "reference-contract-test";
    readonly version = "0.1.0";
    describeBackend(backend: string): Promise<HardwareProfile>;
    estimate(circuit: QuantumCircuit, backend: string, shots: number, _credential?: ProviderCredential): Promise<SubmissionEstimate>;
    submit(circuit: QuantumCircuit, backend: string, shots: number, options: {
        credential?: ProviderCredential;
        confirmed: boolean;
    }): Promise<ProviderSubmission | NotRunRecord>;
}
/** Adapters available by provider name. Real providers are added here. */
export declare const PROVIDER_ADAPTERS: Record<string, () => ProviderAdapter>;
export declare function resolveProvider(name: string): ProviderAdapter;
//# sourceMappingURL=reference.d.ts.map