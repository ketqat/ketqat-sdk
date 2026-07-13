#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: scripts/release-preflight.sh [vX.Y.Z]" >&2
  exit 2
fi

RELEASE_TAG="${1:-${RELEASE_TAG:-${GITHUB_REF_NAME:-}}}"
PYTHON_BIN="${PYTHON:-python3}"
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/ketqat-release-preflight.XXXXXX")
trap 'rm -rf "$TEMP_ROOT"; rm -rf python/dist' EXIT

node scripts/check-release-version.mjs "$RELEASE_TAG"

npm ci --ignore-scripts
npm test
npm run verify:clean-install

if [[ -n "$(git status --porcelain -- schemas dist)" ]]; then
  echo "Generated TypeScript or schema files differ from the committed release source." >&2
  git status --short -- schemas dist >&2
  exit 1
fi

"$PYTHON_BIN" -m venv "$TEMP_ROOT/build"
"$TEMP_ROOT/build/bin/python" -m pip install --upgrade pip build twine pytest
"$TEMP_ROOT/build/bin/python" -m pip install -e "python[qec]"
"$TEMP_ROOT/build/bin/python" -m pytest python/tests
"$TEMP_ROOT/build/bin/python" -m build python
"$TEMP_ROOT/build/bin/python" -m twine check python/dist/*
"$TEMP_ROOT/build/bin/python" scripts/verify-python-distributions.py python/dist
cmp LICENSE python/LICENSE

WHEEL=$(realpath python/dist/*.whl)
SDIST=$(realpath python/dist/*.tar.gz)

"$PYTHON_BIN" -m venv "$TEMP_ROOT/base"
"$TEMP_ROOT/base/bin/python" -m pip install --upgrade pip
"$TEMP_ROOT/base/bin/python" -m pip install "$WHEEL"
"$TEMP_ROOT/base/bin/ketqat" --help >/dev/null
"$TEMP_ROOT/base/bin/python" -c "from importlib.resources import files; import ketqat_runner; assert files('ketqat_runner').joinpath('schemas/qec-experiment-manifest.schema.json').is_file()"
"$TEMP_ROOT/base/bin/ketqat" run examples/algorithms/grover-search.yaml --output "$TEMP_ROOT/algorithm.json"
test -s "$TEMP_ROOT/algorithm.json"

set +e
"$TEMP_ROOT/base/bin/ketqat" run examples/qec/surface-code-memory.yaml --output "$TEMP_ROOT/missing-extra.json" 2>"$TEMP_ROOT/missing-extra.stderr"
missing_extra_exit=$?
set -e
test "$missing_extra_exit" -ne 0
test ! -e "$TEMP_ROOT/missing-extra.json"
grep -F 'pip install "ketqat[qec]"' "$TEMP_ROOT/missing-extra.stderr" >/dev/null

"$PYTHON_BIN" -m venv "$TEMP_ROOT/qec"
"$TEMP_ROOT/qec/bin/python" -m pip install --upgrade pip
"$TEMP_ROOT/qec/bin/python" -m pip install "${WHEEL}[qec]"
"$TEMP_ROOT/qec/bin/python" -c "from importlib.metadata import version; import numpy, pymatching, stim; from ketqat_runner import __version__; assert __version__ == version('ketqat')"
"$TEMP_ROOT/qec/bin/ketqat" run examples/qec/surface-code-memory.yaml --output "$TEMP_ROOT/qec.json"
"$TEMP_ROOT/qec/bin/python" -c "import json,sys; data=json.load(open(sys.argv[1])); assert data['metric_points'][0]['metadata']['backend'] == 'stim-pymatching'" "$TEMP_ROOT/qec.json"

"$PYTHON_BIN" -m venv "$TEMP_ROOT/sdist-builder"
"$TEMP_ROOT/sdist-builder/bin/python" -m pip install --upgrade pip build
"$TEMP_ROOT/sdist-builder/bin/python" -m pip wheel --no-deps --wheel-dir "$TEMP_ROOT/rebuilt" "$SDIST"
test -f "$TEMP_ROOT/rebuilt/ketqat-"*.whl

echo "Release preflight passed for $RELEASE_TAG without publish credentials."
