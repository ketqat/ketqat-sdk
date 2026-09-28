# Native Lambda worker preparation

This target is implemented and locally verified, **not deployed**. The current
GCP/Batch entry point remains the default Docker target. Migration tracking:
[SDK #272](https://github.com/ketqat/ketqat-sdk/issues/272) and
[planning #149](https://github.com/ketqat/ketqat-planning/issues/149).

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
memory or transport needs cannot be supported must also use Batch. Do not wire
this handler into production until Web dispatch, IAM, DLQ, concurrency, payload
compatibility and live callback/timeout/duplicate tests are complete.

Required non-secret configuration: `KETQAT_DEPLOYMENT_ENV`,
`KETQAT_API_BASE_URL`, and the AWS-supplied region. Runtime IAM must allow only
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
