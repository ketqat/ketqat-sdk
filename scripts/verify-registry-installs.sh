#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/verify-registry-installs.sh <version>" >&2
  exit 2
fi

VERSION=$1
PYTHON_BIN="${PYTHON:-python3}"
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/ketqat-registry-readback.XXXXXX")
trap 'rm -rf "$TEMP_ROOT"' EXIT

mkdir "$TEMP_ROOT/npm"
cd "$TEMP_ROOT/npm"
npm init --yes >/dev/null
npm install --ignore-scripts --no-audit --no-fund --save-exact "ketqat-sdk@$VERSION"
node --input-type=module -e '
  const specifiers = ["ketqat-sdk", "ketqat-sdk/client", "ketqat-sdk/contracts", "ketqat-sdk/schemas", "ketqat-sdk/reproducibility", "ketqat-sdk/compatibility", "ketqat-sdk/demo"]
  for (const specifier of specifiers) {
    const loaded = await import(specifier)
    if (Object.keys(loaded).length === 0) throw new Error(`No runtime exports from ${specifier}`)
  }
'
npm audit signatures

cd - >/dev/null
"$PYTHON_BIN" -m venv "$TEMP_ROOT/python"
"$TEMP_ROOT/python/bin/python" -m pip install --upgrade pip
"$TEMP_ROOT/python/bin/python" -m pip install "ketqat[qec]==$VERSION"
"$TEMP_ROOT/python/bin/ketqat" --help >/dev/null
"$TEMP_ROOT/python/bin/python" -c "from importlib.metadata import version; from importlib.resources import files; import ketqat_runner; assert version('ketqat') == '$VERSION'; assert files('ketqat_runner').joinpath('schemas/qec-experiment-manifest.schema.json').is_file()"
"$TEMP_ROOT/python/bin/ketqat" run examples/algorithms/grover-search.yaml --output "$TEMP_ROOT/algorithm.json"
"$TEMP_ROOT/python/bin/ketqat" run examples/qec/surface-code-memory.yaml --output "$TEMP_ROOT/qec.json"
"$TEMP_ROOT/python/bin/python" -c "import json,sys; data=json.load(open(sys.argv[1])); assert data['metric_points'][0]['metadata']['backend'] == 'stim-pymatching'" "$TEMP_ROOT/qec.json"

echo "Clean registry installs passed for npm and PyPI version $VERSION."
