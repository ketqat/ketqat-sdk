# KetQat SDK: audit scope and reporting guidance

## Project and trust boundaries

KetQat SDK is an Apache-2.0 TypeScript/Python project for reproducible quantum
error-correction and quantum-algorithm research, with local Qiskit regression
checks. Its public contracts include runtime validation, scientific compatibility
checks, reproducibility hashing, result bundles and a REST client. The repository
also contains CLI/MCP entry points, runner/provider adapters and worker code.

Scope is the public https://github.com/ketqat/ketqat-sdk repository only.
The hosted ketqat.com application, its database, authentication, private
repositories, customer data and deployed cloud infrastructure are not included.
Do not access production services, use real credentials, submit QPU jobs,
publish packages or deploy anything. Use local test doubles and synthetic tokens.

This is an early-stage project. Public npm/PyPI releases are described as pending
in the inspected README; no broad downstream adoption or critical-infrastructure
deployment is claimed. Maintainer authority is documented in MAINTAINERS.md.
Review current code rather than treating older documentation as a guarantee.

## Priority inputs and security properties

Treat externally supplied manifests, JSON/YAML result records, reproducibility
bundles, circuit descriptions, policies/baselines, API responses, MCP arguments
and worker job payloads as potentially adversarial at their documented entry
points. Distinguish these data inputs from source code that a local developer
explicitly chose to execute.

Prioritize:

1. Unintended code execution or unsafe deserialization through a supported data
   parser or execution path; subprocess argument/shell injection; unintended
   filesystem reads/writes or path traversal reachable from untrusted inputs.
2. Validation/canonicalization inconsistencies, omitted material fields or
   TypeScript/Python disagreements that let a tampered or incompatible record
   pass an integrity, regression-policy or verification check.
3. Trust-boundary mistakes in the CLI, MCP interface, REST client and worker
   payload/result handling, including provenance/signature validation where
   actually implemented. Demonstrate the real input path and preconditions.
4. A supplied credential or token leaking through logs, exceptions, returned
   records or an unintended destination. Use dummy values in reproductions.
5. Dependency vulnerabilities only when a vulnerable behavior is reachable
   through this repository's supported usage.

Useful starting locations: src/contracts/, src/schemas/, src/reproducibility/,
src/compatibility/, src/client/, src/cli/, src/mcp/, src/worker/, worker/,
python/src/ketqat_runner/, tests/, python/tests/, schemas/ and examples/.

## Interpretation and exclusions

A hash proves consistency with a canonical representation, not scientific truth
or authorship. A fabricated result that is correctly rehashed is not, by itself,
a cryptographic vulnerability. Report a demonstrated violation of a documented
verification level, policy or integrity boundary, not an absent promise.

Executing trusted Python/source code selected by the operator is not itself an
injection vulnerability. Demonstrate how lower-trust data reaches execution
without the intended authorization. Likewise, a local developer deliberately
requesting a very large simulation is not a remote denial-of-service exploit.

Consistent with SECURITY.md, exclude deliberately expensive local-runner inputs
without a separate exploitable boundary, generic scanner/dependency alerts with
no demonstrated impact, and numerical/model disagreements with no security or
integrity consequence. Do not infer an internet-facing service or authorization
model merely from the presence of a client or a worker module.

Do not claim to break SHA-256: distinguish a cryptographic collision from a
canonicalization/field-coverage defect. Do not report the cloud provider's own
service behavior as a vulnerability in this SDK.

## Environment and offline tests

The Dockerfile is built with this repository as its context and puts the source
at /src. Node 22, Python 3.11, npm dependencies, the editable Python runner,
optional runtime extras and pytest are installed during the online build phase.
Dependency versions are recorded under /opt/oss-scanner-checks/.

From /src in the completed image, begin with:

```sh
node tests/sdk.test.mjs
node --test tests/signed-identity.test.mjs tests/lambda-worker.test.mjs tests/worker-result-transfer.test.mjs
node --test tests/intelligence.test.mjs
node tests/mcp-conformance.test.mjs
python -m pytest python/tests -q
ketqat run surface-code-memory --output /tmp/ketqat-qec-run.json
```

Use only offline/local paths. Tests that deliberately use localhost may need the
loopback interface inside the isolated environment; they must not contact the
internet. Optional reference-framework checks can be exercised with:

```sh
python scripts/verify-resource-model-parity.py --require
python scripts/verify-mitiq-parity.py --require
```

The full `npm test` command also includes packaging, repository metadata and
clean-install checks; do not interpret inability to reach a package registry or
absence of .git in a Docker context as a product vulnerability. Use the runtime
commands above for the initial offline audit. A skipped optional test is not a
verified pass; report missing dependencies or assets explicitly.

Preparation status: the Docker image and runtime tests have NOT been executed
in the environment that prepared this enrollment. Dependency resolution,
first-run caches/assets and fully offline operation must be verified with
`tools/check ketqat-sdk` before the enrollment is submitted for review. Amend
this paragraph only after recording actual verification results.

## Severity and report format

Tie severity to an attainable attacker capability and this SDK's real deployment
model. Reserve critical/high severity for demonstrated code execution, serious
credential disclosure or a comparably material trust-boundary violation; do not
assume anonymous remote reachability. Describe integrity failures separately
from ordinary numerical disagreement. Consolidate duplicate symptoms with the
same root cause.

For each finding provide the affected commit and file/line, attacker-controlled
input, prerequisites, minimal self-contained offline reproducer, expected and
actual behavior, concrete impact, and a regression test. A minimal candidate
patch is welcome; flag public-contract, schema, hash or compatibility changes.
Do not weaken verification or restore synthetic fallback results to make tests
pass. Never include live credentials or customer data.

Reports should remain private via the configured primary contact. This threat
model contains no known undisclosed vulnerability or proof of concept.
