# KetQat three-minute quickstart

This quickstart is the canonical first-run path for the local KetQat runner. It does not require a KetQat account or API token. Publishing a result is a later, explicit step.

The public packages are not published yet. Until the human first-release checklist is complete, use the source-install path below. The registry commands are the intended post-release commands and are continuously tested from built artifacts in CI.

## After the first public release

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install "ketqat[qec]"

ketqat examples list
ketqat run surface-code-memory --output ketqat-qec-run.json
```

### What you will see

```
surface-code-mwpm-baseline  [COMPLETED]
  suite       surface-code-memory-mwpm 0.1.0
  domain      QEC
  points      1
  d=3, p=0.001  logical error rate < 0.0369935 (upper bound, 95% confidence)
      No logical failures in 100 shots. This bounds the rate; it does not show it is zero.
  backend     stim-pymatching
  hash        369a635373fab00c...
  written to  ketqat-qec-run.json
```

**Read that third line carefully, because it is the whole result.** The run saw
no logical failures. That does not mean the logical error rate is zero — it
means the rate is small enough that 100 shots could not resolve it. All the run
established is an upper bound, and quoting it as "zero" would be a claim the
data does not support. Increase `shots` in the manifest to tighten the bound.

The `backend` line names the real decoder that ran. There is no synthetic
fallback: if Stim and PyMatching are not installed, the run fails and tells you
what to install rather than simulating something easier and reporting it as a
QEC result.

Timed from a clean virtual environment with a cold package cache, the install
and first QEC benchmark together take about 21 seconds; the algorithm-only path
takes about 4. The three minutes in the title is the budget, not the target.

For a lighter algorithm-only smoke test:

```bash
python -m pip install ketqat
ketqat run grover-search --output ketqat-algorithm-run.json
```

## Before publication

```bash
git clone https://github.com/ketqat/ketqat-sdk
cd ketqat-sdk
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e "python[qec]"

ketqat examples list
ketqat run surface-code-memory --output ketqat-qec-run.json
```

## Inspect or customize the manifest

Packaged examples can be copied locally before running:

```bash
ketqat examples copy surface-code-memory --output surface-code-memory.yaml
ketqat run surface-code-memory.yaml --output ketqat-qec-run.json
```

The output JSON contains:

- `status: "COMPLETED"` for a successful local run
- `is_demo: false`, because this is a real local simulation rather than fixture data
- `metric_points` with logical-error-rate, timing, seed, and backend metadata
- `reproducibility_hash`, calculated from the scientific configuration and captured environment

QEC examples require real NumPy, Stim, and PyMatching dependencies. If the `qec` extra is missing, the runner exits non-zero, does not write a successful result file, and tells the user to install:

```bash
pip install "ketqat[qec]"
```

There is no synthetic QEC fallback.

## Validate with the TypeScript SDK

After installing the TypeScript package, the same result can be parsed and hash-checked:

```bash
npm install ketqat-sdk
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs"
import { BenchmarkResultSchema, calculateReproducibilityHash } from "ketqat-sdk"

const result = BenchmarkResultSchema.parse(JSON.parse(readFileSync("ketqat-qec-run.json", "utf8")))
console.log(calculateReproducibilityHash(result) === result.reproducibility_hash)
NODE
```

## Publishing later

First local success does not require login. To publish after signing in to ketqat.com, create a token in account settings and import the JSON result:

```bash
export KETQAT_API_TOKEN="kq_..."
curl -X POST https://ketqat.com/api/runs/import \
  -H "Authorization: Bearer $KETQAT_API_TOKEN" \
  -H "content-type: application/json" \
  -d @ketqat-qec-run.json
```

The server recalculates the reproducibility hash and rejects imports that do not match.

## Scientific limits

The bundled QEC quickstart is a small software simulation using Stim detector sampling and PyMatching decoding. It is useful for checking the workflow and result contract, but it is not QPU evidence and must not be used as a threshold claim. Threshold claims require larger benchmark methodology, review, and independent reproduction evidence.
