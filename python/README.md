# ketqat

Run official [KetQat](https://ketqat.com) catalog products on your own machine:
quantum algorithms, quantum error correction and quantum information. Free
products need no account and no payment and send no telemetry. Every product
states its origin, upstream open-source projects, references, license and
contributors; "official" never means KetQat invented the method.

**Not on PyPI yet.** Install from a pinned commit of the repository:

```bash
pip install "ketqat[algorithms,qec,qinfo] @ git+https://github.com/ketqat/ketqat-sdk@<commit>#subdirectory=python"
ketqat catalog search
ketqat catalog run surface-code-memory@1.0.0 --param distance=5 --seed 7
```

Catalog reference: [docs/catalog.md](https://github.com/ketqat/ketqat-sdk/blob/main/docs/catalog.md).

Also included: Qiskit regression checks for the local/CI flow (start with the
[regression quickstart](https://github.com/ketqat/ketqat-sdk/blob/main/docs/regression-quickstart.md)),
and the local benchmark runner for the KetQat research registry:
`ketqat run examples/qec/surface-code-memory.yaml --output run.json` executes a
benchmark manifest against real dependencies (Stim, PyMatching for QEC; NumPy
for algorithms), producing a result JSON with a canonical reproducibility hash.
No synthetic fallback is used for QEC experiments.

## Extras

- `pip install "ketqat[qec]"` — Stim + PyMatching for QEC decoder/code benchmarks.
- `pip install "ketqat[algorithms]"` — NumPy for quantum-algorithm benchmarks.
- `pip install "ketqat[qinfo]"` — NumPy for the quantum-information catalog products.
- `pip install "ketqat[pro]"` — `cryptography`, for KetQat Pro signature checks. Free products never import it.
- `pip install "ketqat[all]"` — all of the above and the optional research extras.

(Until the first PyPI release, use the `ketqat[...] @ git+https://github.com/ketqat/ketqat-sdk@<commit>#subdirectory=python` form.)

## Submitting a result

```bash
curl -X POST https://ketqat.com/api/runs/import \
  -H "Authorization: Bearer kq_..." \
  -H "content-type: application/json" \
  -d @run.json
```

Create an API token at [ketqat.com/settings](https://ketqat.com/settings) after signing in. See the [ketqat-sdk](https://github.com/ketqat/ketqat-sdk) repository for the manifest format, schemas, and the TypeScript client.

Source, contracts, and examples: <https://github.com/ketqat/ketqat-sdk>. Apache-2.0.
