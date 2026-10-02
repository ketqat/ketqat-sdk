# AWS Lambda and Batch worker runtime

Production native targets were built from source `198ab4e`, published by actual OIDC and
promoted through Web to production worker Lambda live 2 / Batch definition 2.
Signed callbacks and deterministic full SDK replay pass for both execution paths;
the production 25,166,250-byte statevector result also matches the complete local
replay. Its 48,236,185-byte authenticated browser bundle transfer is still handed
to the maintainer after Brave returned `ERR_BLOCKED_BY_CLIENT`. GCP workloads and
storage are removed. See the authoritative
[cutover record](https://github.com/ketqat/ketqat-web/blob/main/docs/aws-cutover-2026-10-03.md).

The portable default Docker entry point remains for historical compatibility;
AWS selects the explicit `lambda` / `batch` targets and `signed-request` mode.
Migration tracking: [SDK #272](https://github.com/ketqat/ketqat-sdk/issues/272) and
[planning #149](https://github.com/ketqat/ketqat-planning/issues/149).

## Historical staging preparation (October 1)

On October 1, an authenticated browser job completed on private Lambda and a
guarded canonical-queue fixture completed on Fargate with a declared 900-second
limit. Both SDK-valid SIMULATION outputs match local replay, signed callbacks
persisted the canonical Supabase records, and encrypted conditional S3
tombstones retired transport bodies. The Fargate case is neither an
authenticated HTTP submission nor 900 seconds of actual computation. A
duplicate completed Lambda dispatch was refused without changing the result or
audit history; one metadata-only failure is retained in its encrypted DLQ.

A legitimate unmeasured 20-qubit statevector also produces about 25.2 MB through
the native ARM64 isolated child/parent in a local read-only, non-root Docker
probe with no network. Its scientific output matches local SDK replay, and the
parent returns only control metadata. This probe uses callback fixtures; actual
large-result S3 delivery and authenticated cloud download remain unverified.
Full 50 MB compatibility, real long-work termination, shared capacity/burst
bounds, confirmed human alerts, OIDC release and coordinated rollback remain
acceptance gates. See [Web migration PR](https://github.com/ketqat/ketqat-web/pull/390)
for the deployment-owned evidence and current status.

## Runtime configuration and deployed behavior

The explicit `batch` Docker target shares the Lambda target's entire
filesystem and scientific child runner, with a Batch CLI entry point instead of
the AWS Lambda bootstrap. Build it with `--target batch`. It accepts a canonical
compute limit through `KETQAT_JOB_TIMEOUT_SECONDS` (up to 900), job ID and attempt
metadata, requires the platform's `AWS_BATCH_JOB_ID`, and reserves 120 additional
platform seconds for startup and callbacks. The compute limit itself does not
increase. Its task role reads the same exact environment-scoped SSM key; no
secret is injected into job-definition environment variables. Web dispatch and
Batch IaC must use this target together; do not label a Lambda entrypoint image
as the Batch image.

Both runtimes claim/validate/report through the same signed path. Batch emits
only job ID, attempt and final status; exceptions produce a fixed generic error.
The Batch container probe runs real scientific work with a declared 900-second
limit on a read-only filesystem (including `/tmp`) and no network. This tests
eligibility and output, not a 900-second workload under live Fargate. CI verifies
the two images have identical filesystem layers before applying the shared
vulnerability scan, and exercises the actual Batch default entrypoint's invalid
input failure. Peak memory, real long jobs and platform termination still
require staging verification beyond the completed small callback cases.

The prepared Web transfer API accepts native results through private S3 when
`KETQAT_RESULT_TRANSPORT=s3`. The parent requests a five-minute capability for
the exact UTF-8 byte length/SHA-256 and job attempt, uploads without callback
credentials, then signs a small completion ticket. The control plane validates
the current attempt, reads/checks the object and applies the existing result
schema before saving to Supabase. This supports the unchanged 50,000,000-byte
job limit; the worker needs no S3 IAM access. The fixed Tokyo S3 host/key,
conditional PUT, checksum, encryption and signed size are checked before sending
data. A lost PUT response or 412 is reconciled only through the server's content
verification. GCP/default SDK callbacks remain inline.

Web conditionally replaces the body with an empty tombstone after the database
commit. Keeping the key prevents reuse of the still-valid upload URL; the private
unversioned bucket's one-day lifecycle removes tombstones and abandoned results.
Cleanup failure cannot roll back a committed scientific record. Small-result
S3/IAM enforcement and staging delivery passed; an actual production 25.2 MB
scientific result and full SDK replay now pass. The production browser large
bundle transfer remains a human handoff; do not infer it from callback success.

The invocation contains only `{version: 1, jobId, attempt, timeoutSeconds}`.
It cannot choose a URL, manifest, command, package, file or credentials. The
callback origin and staging/production namespace come from deployment config.
The parent loads only `/ketqat-<environment>/worker-callback` as an encrypted SSM
parameter, signs request-bound callbacks, claims the canonical job and verifies
its ID and timeout before computing. The Supabase control plane owns atomic
claim, retry attempts and result authorization.

The scientific child gets only the validated manifest over IPC and a minimal
environment without cloud credentials. This is data separation, not an OS
sandbox for arbitrary code: only existing approved SDK operations can run.
CPU work executes in a child process so a blocked event loop cannot defeat the
parent deadline. The parent kills and waits for the child before finishing.
Timeouts and crashes produce schema-valid SIMULATION results; there is no
fabricated success. Scientific data is not written to stdout or the Lambda
return value. Failed claims/deliveries use generic errors without HTTP payloads.

Configure the function for **900 seconds** and async retry count **0**, with a
DLQ/failure alarm. The dispatcher must use Batch for jobs above **780 seconds**;
the public 900-second job limit is unchanged. At least 90 seconds of remaining
Lambda time above the requested compute deadline is required before claiming.
SSM startup is bounded at 15 seconds and each callback at 30 seconds. Jobs whose
memory or transport needs cannot be supported must also use Batch. Production
Web now dispatches to the qualified Lambda/Batch pair with scoped IAM, failure
queues and signed callbacks. Future promotions must recheck dispatch, IAM, DLQ,
concurrency, payload compatibility and callback/timeout/duplicate behavior; the
current deployed evidence does not waive those gates.

Required non-secret configuration: `KETQAT_DEPLOYMENT_ENV`,
`KETQAT_API_BASE_URL`, `KETQAT_RESULT_TRANSPORT=s3`, and the AWS-supplied region. Runtime IAM must allow only
`ssm:GetParameter` on that environment's callback parameter plus its log stream.
No Function URL or public invocation permission is needed. Do not give the
worker database credentials or permissions to change IAM/infrastructure.

Build after `npm ci && npm run build`:

```sh
docker build --platform linux/arm64 --provenance=false --target lambda \
  -f worker/Dockerfile -t ketqat-worker:lambda-local .
docker run --rm --read-only --network none --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  -v "$PWD/scripts/verify-lambda-worker-container.mjs:/verify-lambda-worker-container.mjs:ro" \
  --entrypoint /var/lang/bin/node ketqat-worker:lambda-local /verify-lambda-worker-container.mjs
```

September 29 verification: the complete SDK `npm test` passed, including six new
process/handler tests. A real CPU-blocked fixture was killed at its deadline and
the process was confirmed gone. The ARM64 image ran an actual seeded simulation
as a non-root user on a read-only filesystem without external networking. The
AWS Runtime Interface Emulator located the exported handler and exercised its
invalid-event guard. That check caught missing ESM package metadata that an
ordinary Node invocation had not caught; the image now includes it explicitly.
Control-plane/SSM callbacks in local checks are fixtures, not live AWS evidence.

The first CI scan found 11 fixable High/Critical advisories, all in the unused
AWS base image's npm dependencies. The Lambda target now removes npm/npx/corepack
and their module trees; dependency metadata is not hidden. The rebuilt ARM64
image passed the scientific/runtime probe and Trivy 0.74.0 reported zero
High/Critical findings on September 29. ECR scanning and live AWS verification
are still required before release.

October 1 revalidation: fresh CI scanning found twelve fixable High findings in
the AWS base image's OS packages and unused global SDK. Merely selecting the new
official Node 22 image did not resolve them. The target now pins the verified
official image digest, refreshes AL2023 packages before dropping privileges, and
removes the unused all-service SDK at `/var/runtime/node_modules/@aws-sdk`. The
application's separately pinned SSM SDK remains present; the AWS bootstrap,
Runtime Interface Emulator and native runtime client remain intact. OS update
cache keys can be varied with `KETQAT_OS_REFRESH` per staging release. Build once
and promote the tested immutable digest; the update repository itself can change.
See [AWS's AL2023 update guidance](https://docs.aws.amazon.com/linux/al2023/ug/security-inplace-update.html).

The complete `npm test`, both real ARM64 scientific/container probes and the
Runtime Interface Emulator handler check passed. The refreshed Lambda and Batch
filesystem layers match and the Batch default entrypoint fails closed on missing
metadata. Trivy 0.74.0 with its updated database reported **zero High/Critical
findings**, without exclusions. This is local evidence, not a fresh ECR scan or
live deployment; old September ECR digests are not this release's artifacts.

## Immutable image publication

For initial staging IaC, `--bootstrap-image-only` admits only the MFA/expiry-gated
`KetQatMigrationAdmin` role in account `291877508281`, Tokyo and staging. The
checkout must be clean and match `RELEASE_ID`; endpoint overrides are refused.
Normal publication still requires the scoped SDK release role, and production
cannot use this option. Both native probes and strict scans precede any push;
only image artifacts/manifest are written, with no workload, alias, SSM or DB
writes. A briefly absent ECR scan record is reobserved at most six times for the
same digest; permission/other errors stop immediately and no scan is restarted.
This human bootstrap does not prove OIDC or live callback/scientific acceptance.

`scripts/publish-worker-images.py` replaces the old x86 HTTP image publisher.
The enabled `AWS worker images` workflow publishes staging after successful
SDK CI on the exact current main commit. A manual production run promotes the
same Lambda and Batch digests; it never rebuilds production. Images have distinct
immutable `<source-sha>-lambda` and `<source-sha>-batch` tags in the same worker
repository. Both targets must have identical filesystem layers, ARM64/Linux,
the non-root user and their correct entrypoints. Each actual image runs its
scientific/runtime probe and a full High/Critical Trivy gate before either is
pushed. Both exact ECR digests must then pass complete ECR scans. No unfixed
finding is excluded. Registry login uses an isolated temporary Docker config,
removed on exit; credentials and raw AWS command errors are not printed.

Required configuration is `AWS_REGION=ap-northeast-1`, `AWS_ACCOUNT_ID`,
`DEPLOYMENT_ENV`, `ECR_PREFIX` and `RELEASE_ID` (the exact source SHA). The caller
must be that environment's `ketqat-<environment>-github-sdk` assumed role.
Production additionally requires `STAGING_BATCH_JOB_DEFINITION_ARN`, the exact
numbered staging definition from Web worker IaC. The publisher checks the
staging unweighted live Lambda version and active ARM64 Fargate definition against the
staging pair before and after promotion. An existing production tag must already
match staging. Permission failures are never interpreted as missing images.

The workflow additionally requires `AWS_DEPLOY_ENABLED=true` and
`AWS_WORKER_IMAGES_READY=true`. Production also requires
`AWS_WORKER_PROMOTION_READY=true`; enable it only for a qualified staging pair.
The October 2 actual OIDC staging/production publication from `198ab4e` succeeded.
Production's scoped read permissions were applied on October 1 through Web's
registry IaC. All six release policies/trusts matched the reviewed configuration
and 60 permission simulations passed; see Web's
`docs/migration-evidence/aws-registry-policies-applied-2026-10-01.json`.
Actual main-only OIDC staging and production runs succeeded; production image
publication run is `36982288801`. Recheck identity/current IAM for future releases.
Normal protected main and GitHub
environment restrictions remain required; do not weaken them for a PR run.

Only `release/worker-images.json` after successful completion authorizes a
subsequent deployment to select the pair. Reports may exist after failure, and
a push/scan failure can leave one immutable image uploaded. Such an image is
not a deployment. A rerun rechecks existing artifacts; mismatched filesystem
layers fail closed and require operator reconciliation rather than overwriting
an immutable tag. Old digests and numbered definitions remain available for
rollback.

This workflow **publishes images only**. It does not update a live alias,
register a Batch definition, change Web dispatch permissions or run scientific
jobs in staging. Deployment must still coordinate the numbered Batch revision,
Web dispatch configuration, Lambda version, live callback/timeout/duplicate
tests and rollback acceptance. Deployed image references alone do not prove
those tests passed. The SDK still owns the scientific runtime; infrastructure
and control-plane deployment remain in Web.

Run the credential-free publication failure tests with:

```sh
python3 -m unittest scripts/test_publish_worker_images.py -v
```

The Batch target declares only `VOLUME /tmp`. Web's worker IaC mounts an empty,
writable task-local volume there while keeping the root filesystem read-only
and UID/GID 10001. It has no host path or persistent/EFS volume. The publisher
rejects a Batch image without that declaration and verifies private temporary
files plus a scientific child using the same empty-volume mount; Lambda probes
retain their bounded tmpfs. Actual staging and production Fargate jobs using
the qualified definition completed with signed callbacks and full SDK replay.
This verifies those executed jobs; it is not a claim of sustained performance or
a workload that computed for the full 900-second limit.
