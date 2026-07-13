#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON:-python3}"
SOURCE_ROOT=$(pwd)
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/ketqat-quickstart.XXXXXX")
trap 'rm -rf "$TEMP_ROOT"; rm -rf "$SOURCE_ROOT/python/dist"; rm -f "$SOURCE_ROOT"/ketqat-sdk-*.tgz' EXIT

npm ci --ignore-scripts
npm run build

"$PYTHON_BIN" -m venv "$TEMP_ROOT/build"
"$TEMP_ROOT/build/bin/python" -m pip install --upgrade pip build
"$TEMP_ROOT/build/bin/python" -m build python
WHEEL=$(realpath python/dist/*.whl)

"$PYTHON_BIN" -m venv "$TEMP_ROOT/base"
"$TEMP_ROOT/base/bin/python" -m pip install --upgrade pip
"$TEMP_ROOT/base/bin/python" -m pip install "$WHEEL"
"$TEMP_ROOT/base/bin/ketqat" examples list | tee "$TEMP_ROOT/examples.txt"
grep -F "grover-search" "$TEMP_ROOT/examples.txt" >/dev/null
grep -F "surface-code-memory" "$TEMP_ROOT/examples.txt" >/dev/null
"$TEMP_ROOT/base/bin/ketqat" examples copy grover-search --output "$TEMP_ROOT/grover-search.yaml"
"$TEMP_ROOT/base/bin/ketqat" run grover-search --output "$TEMP_ROOT/algorithm.json"
"$TEMP_ROOT/base/bin/python" -c "import json,sys; data=json.load(open(sys.argv[1])); assert data['domain'] == 'ALGORITHM'; assert data['status'] == 'COMPLETED'; assert data['is_demo'] is False; assert data['reproducibility_hash']" "$TEMP_ROOT/algorithm.json"

set +e
"$TEMP_ROOT/base/bin/ketqat" run surface-code-memory --output "$TEMP_ROOT/missing-extra.json" 2>"$TEMP_ROOT/missing-extra.stderr"
missing_extra_exit=$?
set -e
test "$missing_extra_exit" -ne 0
test ! -e "$TEMP_ROOT/missing-extra.json"
grep -F 'pip install "ketqat[qec]"' "$TEMP_ROOT/missing-extra.stderr" >/dev/null

"$PYTHON_BIN" -m venv "$TEMP_ROOT/qec"
"$TEMP_ROOT/qec/bin/python" -m pip install --upgrade pip
"$TEMP_ROOT/qec/bin/python" -m pip install "${WHEEL}[qec]"
"$TEMP_ROOT/qec/bin/ketqat" examples copy surface-code-memory --output "$TEMP_ROOT/surface-code-memory.yaml"
"$TEMP_ROOT/qec/bin/ketqat" run surface-code-memory --output "$TEMP_ROOT/qec.json"
"$TEMP_ROOT/qec/bin/ketqat" run qec/surface-code-memory --output "$TEMP_ROOT/qec-by-path-alias.json"
"$TEMP_ROOT/qec/bin/python" -c "import json,sys; data=json.load(open(sys.argv[1])); point=data['metric_points'][0]; assert data['domain'] == 'QEC'; assert data['is_demo'] is False; assert point['metadata']['backend'] == 'stim-pymatching'; assert 'stim' in data['environment']['packages']; assert 'pymatching' in data['environment']['packages']" "$TEMP_ROOT/qec.json"

mkdir "$TEMP_ROOT/npm"
cd "$TEMP_ROOT/npm"
npm init --yes >/dev/null
TARBALL=$(
  cd "$SOURCE_ROOT"
  npm pack --json | node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); console.log(process.cwd() + '/' + data[0].filename)"
)
npm install --ignore-scripts --no-audit --no-fund "$TARBALL"
KETQAT_QEC_RESULT="$TEMP_ROOT/qec.json" node --input-type=module - <<'NODE'
import { readFileSync } from "node:fs"
import { BenchmarkResultSchema, calculateReproducibilityHash } from "ketqat-sdk"

const result = BenchmarkResultSchema.parse(JSON.parse(readFileSync(process.env.KETQAT_QEC_RESULT, "utf8")))
if (calculateReproducibilityHash(result) !== result.reproducibility_hash) {
  throw new Error("QEC quickstart result hash does not verify with the TypeScript SDK")
}
NODE

echo "Clone-free KetQat quickstart verification passed."
