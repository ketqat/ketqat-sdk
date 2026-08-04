# RC1 reproduction pack

This pack lets a researcher with **no repository checkout and no KetQat
credentials** reproduce three real results from the built RC1 artifacts and
check every byte against pinned expectations. Following it is a *reproduction
attempt by you*; nothing here self-attests as an independent reproduction —
that claim only exists when someone unaffiliated runs this and says so.

## What you need

- The two RC1 artifact files, verified against these SHA-256 checksums before
  anything is installed:

  ```
  2ad833fc0ee1f76b31ef72fc16bee07be9eecf5794220fa1947a79a1c1b20c4f  ketqat-0.2.0-py3-none-any.whl
  154c057d98ed01e303a632a7f2f3d5b1d65f38837791ab81efd5160c84e8bcbf  ketqat_benchmarks-0.1.0-py3-none-any.whl
  ```

- **Python 3.12 or 3.13.** On 3.14 the tesseract decoder wheel refuses to
  import (`module was compiled for Python 3.13`) and the harness records it as
  a structured unavailable decoder while the other two still run — that is
  correct behavior, not a broken install, but it reproduces only two of the
  three decoders.
- ~2 GiB RAM, any x86-64 or arm64 machine. No network access is needed after
  `pip install`. No GPU, no quantum hardware, no paid service.

## Verified dependency set

The expected outputs below were produced with exactly:

```
beliefmatching==0.2.0
numpy==2.2.6
PyMatching==2.4.0
sinter==1.16.0
stim==1.16.0
tesseract_decoder==0.1.1.dev20260802231159
```

Stim's seeded sampler is deterministic for a given stim version. **If pip
resolves a different stim or decoder version, hashes may legitimately differ**
— that is version drift, not corruption; see "Interpreting failures".

## Setup

```bash
python3.12 -m venv rc1 && . rc1/bin/activate
sha256sum ketqat-0.2.0-py3-none-any.whl ketqat_benchmarks-0.1.0-py3-none-any.whl
pip install 'ketqat-0.2.0-py3-none-any.whl[qec]' ketqat_benchmarks-0.1.0-py3-none-any.whl \
  beliefmatching==0.2.0 tesseract-decoder sinter==1.16.0
```

## 1. Grover search (MODELLED — analytic success probability, no circuit executed)

```bash
ketqat examples copy grover-search --output grover.yaml
ketqat run grover.yaml --output grover.json
python -c "import json; r=json.load(open('grover.json')); print(r['reproducibility_hash'])"
```

Expected reproducibility hash:

```
8880875b387f3569ae23843960caf3b5f55a443cafaece517f0c8b45d1ce5d70
```

Checkable facts regardless of hash: the n=2 point reports
`success_probability` exactly `1.0` with `grover_iterations` 1 — one Grover
iteration on two qubits succeeds with certainty. A 0.25 here means you have a
pre-0.2.0 runner (ketqat-sdk#228).

## 2. Phase estimation (SIMULATED — statevector execution)

```bash
ketqat examples copy phase-estimation --output qpe.yaml
ketqat run qpe.yaml --output qpe.json
```

The dyadic phase 0.375 is exactly representable at every register width in the
example, so every point reports `success_probability` 1.0. Expected
reproducibility hash: `946de250e93211a081ac67a6b1756f5efc43d34c4f5fdc22d593e0d77f8c0ce1`.

## 3. Three-decoder QEC comparison (SIMULATION — shared Stim samples)

```bash
python -m ketqat_benchmarks.decoder_comparison \
  --distance 3 --rounds 3 --noise 0.02 --max-shots 2000 --seed 7 \
  --no-timing --output decoders.json
python - <<'EOF'
import json
d = json.load(open("decoders.json"))
print("available:", sorted(x["decoder"] for x in d["decoders"] if x["available"]))
print("shared-sample SHAs equal:", len({x["consumed_sample_sha256"] for x in d["decoders"] if x["available"]}) == 1)
print("report hash:", d["reproducibility_sha256"])
EOF
```

Expected with the pinned versions on Python 3.12/3.13:

```
available: ['beliefmatching', 'pymatching-mwpm', 'tesseract']
shared-sample SHAs equal: True
report hash: aa3a482d802c444e76e7331d0a172b4516e0bfe020fb8bfab9ca4ac4b7e58fa9
```

Every available decoder proves it consumed byte-identical detector samples —
the `consumed_sample_sha256` equality is the comparison's validity condition,
enforced by the harness, not asserted by documentation.

## Cross-language hash parity (optional, needs Node 20+)

```bash
npm init -y && npm install ketqat-sdk-0.2.0.tgz
node --input-type=module -e "
import { readFileSync } from 'node:fs'
import { BenchmarkResultSchema, calculateReproducibilityHash } from 'ketqat-sdk'
const p = BenchmarkResultSchema.parse(JSON.parse(readFileSync('grover.json','utf8')))
console.log(calculateReproducibilityHash(p) === p.reproducibility_hash ? 'PARITY' : 'MISMATCH')"
```

`PARITY` means the TypeScript implementation recomputed the Python-stamped
hash byte-identically from your local output.

## Comparing against the live registry

The production registry at https://ketqat.com carries the reference runs and
datasets these workflows correspond to (no account needed to read):

- `/algorithms/families/grover-search` and `/algorithms/families/phase-estimation`
- `/qec/families/rotated-surface-code` — threshold sweep and decoder comparison
- `/datasets` — checksummed tables with lineage to their source runs

A run page's "Hash verified" badge means the stored payload re-hashes to its
recorded digest — a storage-integrity statement. It does **not** mean the
result was independently reproduced; that stronger claim appears only through
the reproduction-request workflow with a named attestation.

## Interpreting failures

| Symptom | Meaning |
|---|---|
| Checksum mismatch on the wheel files | You do not have the RC1 artifacts; stop. |
| `tesseract` unavailable with a Python-version ImportError | Expected on Python 3.14; use 3.12/3.13 or accept a two-decoder comparison. |
| Hashes differ, versions differ from the pinned set | Version drift: stim's sampler and decoder behavior are version-dependent. Recreate the pinned set before concluding anything. |
| Hashes differ, versions match | A real discrepancy worth reporting — open an issue with your `decoders.json` and `pip freeze`. |
| `grover` n=2 success ≈ 0.25 | Pre-0.2.0 runner (ketqat-sdk#228); your wheel is not the RC1 artifact. |
