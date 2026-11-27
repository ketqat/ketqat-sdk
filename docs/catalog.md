# The official KetQat catalog

KetQat curates quantum software in three categories (`quantum-algorithms`,
`quantum-error-correction`, `quantum-information`). You find a product on
ketqat.com and run it on your own machine with the `ketqat` Python package.
The website never runs code on your machine; it shows commands to copy.

**Attribution.** "Officially provided by KetQat" means KetQat selected the
product, wrote or integrated its implementation, validated it and maintains
it. It never means KetQat invented the method. Every definition carries an
`origin` statement naming who did, the open-source projects it builds on
(`origin.upstream`), its `references`, the `license` you receive and the
`contributors`.

**All KetQat SDK algorithms and software products are free and open source.**
Every product below is Apache-2.0 code in this repository and runs from the
installed `ketqat` package with no account, payment, login, entitlement,
network access or telemetry. KetQat Academy Pro is a separate educational
subscription on ketqat.com; it is not required for any SDK functionality.

## Products

| ID | Slug | Current version | Extras |
|---|---|---|---|
| `kq.algorithms.grover-search` | `grover-search` | 1.0.0 | `algorithms` |
| `kq.algorithms.quantum-phase-estimation` | `quantum-phase-estimation` | 1.0.0 | none |
| `kq.algorithms.qaoa-maxcut` | `qaoa-maxcut` | 1.0.0 | `algorithms` |
| `kq.algorithms.vqe-ground-state` | `vqe-ground-state` | 1.0.0 | `algorithms` |
| `kq.algorithms.quantum-fourier-transform` | `quantum-fourier-transform` | 1.0.0 | `algorithms` |
| `kq.algorithms.trotter-ising-dynamics` | `trotter-ising-dynamics` | 1.0.0 | `algorithms` |
| `kq.algorithms.quantum-teleportation` | `quantum-teleportation` | 1.0.0 | `algorithms` |
| `kq.qec.surface-code-memory` | `surface-code-memory` | 1.0.0 | `qec` |
| `kq.qec.steane-code-fault-tolerance` | `steane-code` | 1.0.0 | `qinfo` (NumPy only) |
| `kq.qec.repetition-code-memory` | `repetition-code` | 1.0.0 | `qinfo` (NumPy only) |
| `kq.qinfo.state-measures` | `quantum-state-measures` | 1.0.0 | `qinfo` |
| `kq.qinfo.state-tomography` | `quantum-state-tomography` | 1.0.0 | `qinfo` |
| `kq.qinfo.channel-analysis` | `quantum-channel-analysis` | 1.1.0 (1.0.0 supported) | `qinfo` |
| `kq.qec.surface-code-threshold-study` | `surface-code-threshold-study` | 1.1.0 (1.0.0 supported) | `qec` |
| `kq.qinfo.randomized-benchmarking-suite` | `randomized-benchmarking-suite` | 1.1.0 (1.0.0 supported) | `qec` |
| `kq.qinfo.quantum-volume-certification` | `quantum-volume-certification` | 1.1.0 (1.0.0 supported) | `qinfo` |

The last four were offered as KetQat Pro at 1.0.0. Since SDK 0.4.0
(2026-11-23) their code is here under Apache-2.0 as 1.1.0; see
[Former KetQat Pro products](#former-ketqat-pro-products).

`ketqat catalog show <slug>` prints the full definition: inputs with types and
defaults, the install line, the example, limitations and references.

## Install

The package is not on PyPI yet. Install it from a commit you have reviewed:

```bash
pip install "ketqat[<extras>] @ git+https://github.com/ketqat/ketqat-sdk@<commit>#subdirectory=python"
```

Product definitions write the install line with a literal `<commit>`, because a
definition cannot name the commit that contains it. Substitute a full SHA; the
website substitutes the SDK commit it is pinned to.

`ketqat catalog install <slug>` prints the exact `pip` command that adds that
product's extras from the same source your current installation came from (the
same git commit, or the same local checkout), and runs it after you confirm.
`--yes` skips the question. Nothing is installed from a non-interactive shell
without `--yes`.

## Command line

| Command | Network | What it does |
|---|---|---|
| `ketqat catalog search [QUERY] [--category C] [--tier T] [--json]` | none | search the bundled catalog |
| `ketqat catalog show ID_OR_SLUG [--version V] [--json]` | none | details, install line, example |
| `ketqat catalog install ID_OR_SLUG[@V] [--yes]` | pip only | install exactly the product's extras |
| `ketqat catalog run ID_OR_SLUG[@V] [--param k=v ...] [--seed N] [--output DIR] [--json]` | none | run locally, write a run record |
| `ketqat runs list [--json]` / `ketqat runs show RUN_ID` | none | local run records |
| `ketqat report RUN_ID [--yes] [--base-url URL]` | yes, API token | opt-in usage report |
| `ketqat pro login` / `status` / `install [ID_OR_SLUG]` | none | deprecated since 0.4.0: prints that every product is free and open source and that nothing needs to be installed or unlocked, exits 0, reads and writes nothing |

`--param` values are read as JSON when they parse (`shots=1000`,
`marked=[3,5]`, `iterations=null`) and as plain strings otherwise
(`preset=bell`). List inputs also accept `marked=3,5`. `--output DIR` copies
the record to `DIR/<run-id>.json` in addition to `$KETQAT_HOME`.

Exit codes: `0` success; `1` the run started and failed (a failed record is
written) or a network call failed; `2` the request was
invalid (unknown product, version or parameter, a wrong type, a constraint
violated) and nothing ran.

## Python

```python
from ketqat_runner import catalog

catalog.search("entropy")                     # -> [Product]
catalog.get_product("surface-code-memory")    # by ID or slug
record = catalog.run("surface-code-memory@1.0.0", seed=7, distance=5, physical_error_rate=0.003)
record.result, record.result_sha256, record.path
```

`run(product, version=None, seed=None, **params) -> RunRecord`. `product` is an
ID or a slug, optionally pinned (`slug@1.0.0`); `version` pins the same way and
must agree. Without a seed a random one is drawn and recorded.

## Parameters

A product's `inputs` are its whole interface:

- an input with no `default` is required;
- an input with a `default` is optional; `default: null` means "no value", and
  the input's description says what the product does then;
- a parameter the product does not declare is refused, as is a wrong type or a
  value outside the declared `constraints`;
- products add their own cross-field checks (for example, `grover-search`
  refuses more than 20 qubits with the memory the state vector would need).

Nothing is coerced silently and nothing falls back to demo data.

## Run records (`ketqat.run-record/v1`)

Every run writes `$KETQAT_HOME/runs/<run-id>/record.json`, with `KETQAT_HOME`
defaulting to `~/.ketqat`:

```json
{
  "schema": "ketqat.run-record/v1",
  "runId": "20261029T120000Z-1a2b3c4d",
  "productId": "kq.qec.surface-code-memory",
  "productVersion": "1.0.0",
  "parameters": {"distance": 5, "rounds": null, "...": "every input, defaults filled in"},
  "seed": 7,
  "sdkVersion": "0.4.0",
  "environment": {"python": "3.12.12", "platform": "...", "packages": {"ketqat": "0.4.0", "stim": "..."}},
  "startedAt": "2026-10-29T12:00:00.000Z",
  "finishedAt": "2026-10-29T12:00:01.234Z",
  "status": "succeeded",
  "result": {"...": "product output"},
  "resultSha256": "...",
  "clientReportId": "uuid4, used only by `ketqat report`"
}
```

A failed run has `status: "failed"`, `result: null`, `resultSha256: null` and
an `error` string.

`resultSha256` is the SHA-256 of the canonical JSON of `result`: keys sorted,
no whitespace, numbers formatted as JavaScript formats them, and (unlike the
research reproducibility hash) no key excluded. Results contain no timings, so
the same product version, parameters and seed reproduce the digest on the same
software stack. Sampled output (shot counts) depends on the NumPy or Stim
version as well; the record's `environment.packages` says which ran.

`ketqat runs show` recomputes the digest and warns if the stored result was
edited. Records are never deleted by the SDK.

## Opt-in usage reports

`ketqat report RUN_ID` prints exactly what it would send to
`POST {base}/api/v1/usage-reports`, then asks:

```json
{
  "clientReportId": "the UUID stored in the run record",
  "productId": "kq.qec.surface-code-memory",
  "productVersion": "1.0.0",
  "status": "succeeded",
  "occurredAt": "the record's finishedAt",
  "sdkVersion": "0.4.0"
}
```

Nothing else is ever sent: no parameters, inputs, results, file paths,
environment variables or host names. Because `clientReportId` is fixed in the
record, sending the same report twice is counted once. The API token comes from
`KETQAT_API_TOKEN` (`KETQAT_TOKEN` is also accepted) and is never a
command-line option. A copy of what was sent is kept beside the record as
`report.json`.

## Former KetQat Pro products

Until SDK 0.4.0, four products were offered as KetQat Pro at version 1.0.0:
`quantum-channel-analysis`, `surface-code-threshold-study`,
`randomized-benchmarking-suite` and `quantum-volume-certification`. Their code
was proprietary and delivered as Ed25519-signed bundles under a time-limited
entitlement (`ketqat pro login`, `ketqat pro install`).

On 2026-11-23 the owner relicensed that code to Apache-2.0
([ketqat-planning#158](https://github.com/ketqat/ketqat-planning/issues/158));
the license-transition record is in [CHANGELOG.md](../CHANGELOG.md). Since 0.4.0:

- The four products are ordinary catalog products with tier `free`, license
  `Apache-2.0` and a new current version **1.1.0**. Their code lives in
  `python/src/ketqat_runner/catalog/products/` with the others.
- **1.1.0 is the 1.0.0 implementation unchanged.** 1.0.0 stays in each
  definition with status `supported`, and this package runs both from the
  same code, so the same parameters and seed give the same `resultSha256`.
  `python/tests/test_catalog_version_compat.py` checks this against hashes
  recorded from the 1.0.0 code as distributed
  (`fixtures/catalog/relicensed-products-1.0.0.json`).
- Results keep their `schema` identifiers (`ketqat.pro.channel-analysis/v1`
  and so on): they are part of the hashed result, so renaming them would break
  the promise above. They are names, not a licence or an entitlement.
- No run needs an account, login, entitlement or network access, and no run
  imports entitlement or network code (checked after runs of every product).
- `ketqat pro login|status|install` are deprecated no-ops kept so existing
  scripts do not fail. They contact no server, read and write no files, and
  exit 0. The `pro` extra installs nothing and is kept so older install lines
  still work.
- The entitlement, signing and bundle code is removed. Files an earlier SDK
  cached under `$KETQAT_HOME/pro/` are left untouched and unused. Run records,
  including runs of the 1.0.0 Pro products, stay readable and `ketqat runs show`
  still verifies their digests.

The catalog schema still accepts `tier: "pro"` with a `pro` block so that
historical definitions validate; `python -m ketqat_runner.catalog.build`
refuses it in a current definition.

## Definitions and the build

```
catalog/
  schema/product.schema.json   schema ketqat.catalog.product/v1 (JSON Schema draft-07)
  products/<id>.json           one file per product, every version inside, newest first
  catalog.json                 generated: products sorted by ID, sha256 of each file
```

`python -m ketqat_runner.catalog.build` validates every definition, normalises
its formatting, regenerates `catalog.json` and copies the tree byte for byte to
`python/src/ketqat_runner/catalog/data/`, the copy the installed package reads.
Beyond the schema it checks that file names equal IDs, slugs are unique,
versions are newest first with one current, every named validation test exists,
every product is tier `free`, every runnable version has an implementation in
this SDK, and defaults satisfy their own constraints.

`python -m ketqat_runner.catalog.build --check` writes nothing and fails if any
of that output is stale; CI runs it. `npm run verify:catalog-sync` recomputes
the hashes independently and compares the packaged copy.

The npm package exports the same files for consumers such as ketqat-web:

```js
import index from "ketqat-sdk/catalog/catalog.json" with { type: "json" }
import grover from "ketqat-sdk/catalog/products/kq.algorithms.grover-search.json" with { type: "json" }
```

Merging a definition is authoring. It does not publish the product on
ketqat.com; publication is a separate, recorded step on the website, which
accepts only a definition whose sha256 matches the one in the pinned SDK.

### `implementationStatus`

- `verified`: validation tests exist, limitations are stated, and the example
  has been executed verbatim in a clean virtualenv by CI.
- `implemented`: the implementation and its validation tests exist here, but
  the CI example execution has not yet happened.
- `experimental`: the validation cannot be inspected here, or is incomplete.

The schema refuses `verified` without an executed example, and the build
refuses it without validation entries.

### Examples

Each product's `example.code` is run verbatim by
`python/tests/test_catalog_examples.py` in a fresh virtualenv with only that
product's extras installed. The JSON object the example prints last must
contain `example.expectedOutputSubset`. The test is slow and needs the package
index, so it runs only with `KETQAT_RUN_SLOW_TESTS=1` (the `catalog` job in
`.github/workflows/python-package.yml` sets it).

## Adding a product or a version

1. Implement it under `python/src/ketqat_runner/` with tests that compare against
   independent analytic values or independent computations.
2. Register it in `ketqat_runner/catalog/products/__init__.py`.
3. Write `catalog/products/<id>.json`. A new version goes first in `versions`;
   the previous one becomes `supported` or `retired`. IDs are never reused.
4. Run `python -m ketqat_runner.catalog.build`, the tests, and the slow example
   test, and commit the generated files.
