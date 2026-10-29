# Isolated execution plane for KetQat jobs (RFC 0005).
#
# The hardening below is defence in depth, not the security model. The model is
# that a job cannot express arbitrary code in the first place -- see
# src/worker/job.ts, where the schema has no field for a script, package, image,
# or command, and a forbidden-field check rejects one at any depth.
#
# Deliberately absent at runtime: no package manager, no shell tooling, no build
# toolchain, no credentials. There is little here for an escape to use.

FROM node:22-slim AS builder
WORKDIR /build
COPY package.json package-lock.json ./
# npm ci against the lockfile: a job container must never resolve a floating
# version at build time, or two builds of one commit could behave differently.
# --ignore-scripts because install scripts are arbitrary code execution.
RUN npm ci --omit=dev --ignore-scripts
COPY dist ./dist

FROM node:22-slim AS runtime

# Package managers are build tools; production executes Node directly.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Non-root. Cloud Run will not grant a privileged container, but running as root
# inside one would still let an escape write anywhere it could reach.
RUN groupadd --system --gid 10001 ketqat \
 && useradd --system --uid 10001 --gid ketqat --no-create-home ketqat

WORKDIR /app
COPY --from=builder --chown=root:root /build/node_modules ./node_modules
COPY --from=builder --chown=root:root /build/dist ./dist
# Kept under worker/ so the layout matches the repository. The entrypoint
# imports ../dist/index.js; flattening it to /app/entrypoint.mjs resolved that
# to /dist and the container failed at startup with ERR_MODULE_NOT_FOUND. The
# image was built and pushed in that state because nothing ever ran it -- which
# is why verify-worker-image.mjs below now runs the container in CI.
COPY --chown=root:root worker/entrypoint.mjs ./worker/entrypoint.mjs

# Application files are root-owned and not writable by the runtime user, so a
# compromised job cannot rewrite the code that runs the next one.
USER 10001:10001

# The only writable path. Deploy with a read-only root filesystem and a tmpfs
# mounted here.
ENV TMPDIR=/tmp

# Egress is required, and narrowly.
#
# An earlier revision of this file said to deploy with egress denied, which was
# correct while a job arrived on stdin and its result left on stdout. Callback
# mode changed that on purpose: a manifest passed through the environment shows
# up in `gcloud run jobs executions describe` output and in platform audit
# entries, and a result written to stdout is captured by the log sink, whose
# retention and access differ from the registry's. Both were worse than needing
# a network path.
#
# The worker therefore reaches exactly two destinations:
#
#   * the instance metadata server, to mint its own identity token
#   * the control plane named by KETQAT_API_BASE_URL
#
# It initiates every connection; it listens on nothing. Note that this is a
# property of the code, not one Cloud Run enforces per host today -- restricting
# egress by destination would need a VPC connector and an egress policy, which
# is worth doing and is not done here. Recorded rather than implied, because an
# unenforced control that reads as enforced is worse than a named gap.
#
# None of this is the security model. The model is that a job cannot express
# arbitrary code in the first place -- see src/worker/job.ts.
ENV KETQAT_WORKER_EGRESS=control-plane-only

# --disallow-code-generation-from-strings makes eval and new Function throw at
# the process level. Nothing in the engine uses them -- parameter expressions go
# through a hand-written parser precisely so they cannot -- and this turns that
# from a code-review property into a runtime guarantee.
ENTRYPOINT ["node", "--disallow-code-generation-from-strings", "/app/worker/entrypoint.mjs"]

FROM builder AS lambda-deps
WORKDIR /lambda-deps
COPY worker/lambda/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# The AWS base image ships its Runtime Interface Emulator (/usr/local/bin/aws-lambda-rie)
# built with Go 1.26.9, whose standard library carries a fixable High finding
# (CVE-2026-111943, fixed in Go 1.26.10). Deployed Lambda never executes it --
# /lambda-entrypoint.sh only starts it when AWS_LAMBDA_RUNTIME_API is unset -- but
# CI and the publisher drive the handler through it, so it stays and is rebuilt:
# the public v1.37 release source, pinned by commit, with the release Makefile's
# flags and a patched, digest-pinned toolchain. go.sum verifies every module.
# Remove this stage once the pinned base image ships an emulator built with a
# patched Go; the Trivy gate in ci.yml says when.
FROM golang:1.26.10-bookworm@sha256:23ce71337b726608afb1bc00986e630a05034a87a87ea1fc2cd1ae5cf33387eb AS lambda-rie
ARG RIE_COMMIT=c622c06822a4e5390cc71f29df37594646b10700
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-mod=readonly
WORKDIR /src
RUN git init -q . \
 && git fetch -q --depth 1 https://github.com/aws/aws-lambda-runtime-interface-emulator.git "$RIE_COMMIT" \
 && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$RIE_COMMIT" \
 && go build -trimpath -buildvcs=false -ldflags "-s -w" -o /out/aws-lambda-rie ./cmd/aws-lambda-rie

# Native Lambda execution uses only opaque dispatch metadata. The parent reads
# its exact SSM callback key; the CPU child receives no cloud credentials.
FROM public.ecr.aws/lambda/nodejs:22@sha256:f4f30ba3a882589f91824fc850626b7a13c6649131fc3351c252459eae605d94 AS lambda
# Refresh AL2023 security packages per release. The produced image stays immutable.
ARG KETQAT_OS_REFRESH=initial
RUN dnf upgrade -y --releasever=latest && dnf clean all
COPY --from=lambda-rie /out/aws-lambda-rie /usr/local/bin/aws-lambda-rie
# AWS's runtime image includes npm for building. Runtime needs only Node and
# the Lambda bootstrap; remove the unused package manager and its dependencies.
# The application bundles its exact SSM SDK below and never uses AWS's global
# all-service SDK. Keep the runtime interface/bootstrap and remove that unused tree.
RUN rm -rf /var/lang/lib/node_modules/npm /var/lang/lib/node_modules/corepack \
 /var/runtime/node_modules/@aws-sdk \
 && rm -f /var/lang/bin/npm /var/lang/bin/npx /var/lang/bin/corepack
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY --from=lambda-deps /lambda-deps/node_modules ./worker/lambda/node_modules
COPY worker/lambda/*.mjs worker/lambda/package.json ./worker/lambda/
USER 10001:10001
ENV TMPDIR=/tmp
CMD ["worker/lambda/handler.handler"]

# The Batch fallback shares the scanned runtime and isolated scientific runner.
# It has no public listener and does not run the Lambda entrypoint/emulator.
FROM lambda AS batch
# Fargate's empty ephemeral volume inherits /tmp's writable image permissions.
# Lambda supplies its own /tmp; this declaration applies only to the Batch target.
VOLUME ["/tmp"]
ENTRYPOINT ["/var/lang/bin/node", "--disallow-code-generation-from-strings", "/var/task/worker/lambda/batch.mjs"]
CMD []

# Existing GCP and Batch builds retain their stdin/callback entry point.
FROM runtime AS default
