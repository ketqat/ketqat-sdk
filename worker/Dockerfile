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
COPY --chown=root:root worker/entrypoint.mjs ./entrypoint.mjs

# Application files are root-owned and not writable by the runtime user, so a
# compromised job cannot rewrite the code that runs the next one.
USER 10001:10001

# The only writable path. Deploy with a read-only root filesystem and a tmpfs
# mounted here.
ENV TMPDIR=/tmp

# Jobs simulate circuits from their own parameters and need no egress. Deploy
# with egress denied; an allowlist becomes relevant only if a provider adapter
# is added under ADR 0004.
ENV KETQAT_WORKER_NETWORK=disabled

# --disallow-code-generation-from-strings makes eval and new Function throw at
# the process level. Nothing in the engine uses them -- parameter expressions go
# through a hand-written parser precisely so they cannot -- and this turns that
# from a code-review property into a runtime guarantee.
ENTRYPOINT ["node", "--disallow-code-generation-from-strings", "/app/entrypoint.mjs"]
