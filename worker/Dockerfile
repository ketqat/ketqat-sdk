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
