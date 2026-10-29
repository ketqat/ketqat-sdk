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

## Products

| ID | Slug | Tier | Extras |
|---|---|---|---|
| `kq.algorithms.grover-search` | `grover-search` | Free | `algorithms` |
| `kq.algorithms.quantum-phase-estimation` | `quantum-phase-estimation` | Free | none |
| `kq.qec.surface-code-memory` | `surface-code-memory` | Free | `qec` |
| `kq.qinfo.state-measures` | `quantum-state-measures` | Free | `qinfo` |
| `kq.qinfo.channel-analysis` | `quantum-channel-analysis` | Pro | `pro`, `qinfo` |

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
| `ketqat pro login [--base-url URL]` | yes, API token | fetch and cache a Pro entitlement |
| `ketqat pro status` | none | show the cached entitlement |
| `ketqat pro install ID_OR_SLUG[@V] [--base-url URL]` | yes, API token | download, verify and install a Pro bundle |

`--param` values are read as JSON when they parse (`shots=1000`,
`marked=[3,5]`, `iterations=null`) and as plain strings otherwise
(`preset=bell`). List inputs also accept `marked=3,5`. `--output DIR` copies
the record to `DIR/<run-id>.json` in addition to `$KETQAT_HOME`.

Exit codes: `0` success; `1` the run started and failed (a failed record is
written), a Pro run was refused, or a network call failed; `2` the request was
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
  "sdkVersion": "0.3.0",
  "environment": {"python": "3.12.12", "platform": "...", "packages": {"ketqat": "0.3.0", "stim": "..."}},
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
  "sdkVersion": "0.3.0"
}
```

Nothing else is ever sent: no parameters, inputs, results, file paths,
environment variables or host names. Because `clientReportId` is fixed in the
record, sending the same report twice is counted once. The API token comes from
`KETQAT_API_TOKEN` (`KETQAT_TOKEN` is also accepted) and is never a
command-line option. A copy of what was sent is kept beside the record as
`report.json`.

## KetQat Pro

Pro products are additional KetQat implementations. They run locally like Free
products; their code is delivered as a signed bundle.

```bash
pip install "ketqat[pro,qinfo] @ git+https://github.com/ketqat/ketqat-sdk@<commit>#subdirectory=python"
export KETQAT_API_TOKEN=kq_...
ketqat pro login
ketqat pro install quantum-channel-analysis
ketqat catalog run quantum-channel-analysis --param kraus_file=channel.npy
```

What is stored: only the entitlement token, at
`$KETQAT_HOME/pro/entitlement.token` (mode 0600). The API token stays in your
environment and is never written to disk by the SDK.

When it is checked: once, when a Pro run starts. A missing or expired
entitlement refuses the run with the expiry date and the renewal command
(`ketqat pro login`). A run that has started is never interrupted, and run
records and results are never deleted or locked.

What it is not: DRM. Code delivered to your machine can be copied or modified.
The entitlement gates official distribution and updates.

Free runs never import any of this: a test checks the module graph after every
Free product runs.

### Formats

These are the exact formats the SDK verifies, so that the server and the SDK
can be checked against each other.

**Entitlement token** (`POST {base}/api/v1/pro/entitlement`, response
`{"token": "..."}`): `base64url(payload) "." base64url(signature)`, padding
optional. The payload is UTF-8 JSON
`{"v":1,"kid":"...","sub":"<user id>","tier":"pro","iat":<unix s>,"exp":<unix s>}`.
The Ed25519 signature covers the exact payload bytes that were base64url-encoded.
The SDK checks the signature, `v == 1`, `tier == "pro"`, `exp > iat`, and at run
start `exp > now` and `iat` not more than five minutes in the future.

**Bundle** (`GET {base}/api/v1/pro/bundles/{productId}/{version}`):

```json
{
  "manifest": {"productId": "...", "version": "1.0.0", "sha256": {"main.py": "<hex>", "...": "..."}, "kid": "..."},
  "signature": "<base64url Ed25519 signature>",
  "files": {"main.py": "<base64>", "...": "..."}
}
```

The signature covers the manifest's canonical JSON: keys sorted at every level,
separators `,` and `:` with no whitespace, UTF-8 without escaping non-ASCII.
`files` must name exactly the manifest's paths; paths are relative, with no
`..`, empty or dot segments. Every decoded file must match its sha256. Only then
is anything written, to `$KETQAT_HOME/pro/<productId>/<version>/` (`bundle.json`
plus `files/`), and the same checks run again before every Pro run.

**Entry point.** `main.py` at the bundle root defines
`run(params: dict, seed: int) -> dict` (the JSON-serialisable result) and may
define `validate(params: dict) -> None`. Parameters are checked against the
catalog definition's `inputs` before either is called. The bundle directory is
on `sys.path` while `main.py` is imported, so it can import its own modules at
import time. Bytecode is not written into the verified directory.

### Signing keys

Trusted Ed25519 public keys are embedded in
`python/src/ketqat_runner/catalog/pro/keys.py`, by `kid`.

- `PRODUCTION_KEYS` is empty until the owner provides the production public key
  in a reviewed pull request. Until then no production token or bundle verifies.
- `TEST_KEYS` holds `ketqat-test-2026-10`, used by KetQat's own tests and
  staging. It is honoured **only** when `KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS=1`
  is set, so it cannot unlock anything on a normal installation. Its private
  half is kept outside this repository.

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
every runnable Free version has an implementation in this SDK, and defaults
satisfy their own constraints.

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

Each Free product's `example.code` is run verbatim by
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
