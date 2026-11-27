# ketqat

Run official [KetQat](https://ketqat.com) catalog products on your own machine:
quantum algorithms, quantum error correction and quantum information. All
KetQat SDK algorithms and software products are free and open source
(Apache-2.0): they need no account, no payment and no login, and send no
telemetry. KetQat Academy Pro is a separate educational subscription on
ketqat.com and is not required for any SDK functionality. Every product
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
- `pip install "ketqat[pro]"` — installs nothing since 0.4.0; kept so older install lines still work. Every catalog product is free and open source and needs only the extras above.
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
