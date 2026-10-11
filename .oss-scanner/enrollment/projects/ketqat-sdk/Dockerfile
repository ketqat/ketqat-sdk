# Audit image, not a deployment image. Build with ketqat/ketqat-sdk as context.
# Network is available during build only; the completed image is audited offline.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MPLBACKEND=Agg \
    AWS_EC2_METADATA_DISABLED=true \
    OMP_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git build-essential clang cmake ninja-build pkg-config \
      python3 python3-dev python3-venv libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Required by OSS Scanner: preserve the source checkout at /src.
COPY . /src
WORKDIR /src

# Debian bookworm provides Python 3.11, matching the project's Python CI.
RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

RUN npm ci && npm run build

# Cover local QEC and regression workflows plus provider-adapter parsing.
# Avoid the much larger research/interoperability extras; their modules remain
# in the source tree and can be reviewed without preinstalling every framework.
RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir \
         -e './python[qec,regression,ibm,braket]' pytest build \
    && python -m pip check

# Fail the image build if the core execution engines are unavailable.
RUN python -c 'import numpy, stim, pymatching, qiskit, yaml, pydantic, jsonschema' \
    && python -c 'from ketqat_runner.providers import ibm, braket; assert ibm.available() and braket.available()'

# Record the resolved environment for reproductions. No credentials are needed.
RUN mkdir -p /opt/oss-scanner-checks \
    && python -m pip freeze > /opt/oss-scanner-checks/python-dependencies.txt \
    && node --version > /opt/oss-scanner-checks/node-version.txt \
    && npm --version > /opt/oss-scanner-checks/npm-version.txt

# Intentionally no deployment, publishing, live cloud calls or hardware jobs.
# See threat_model.md for offline runtime tests and remaining validation work.
CMD ["/bin/bash"]
