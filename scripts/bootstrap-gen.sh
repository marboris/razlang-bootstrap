#!/bin/sh
# Node-free step: compile a Raz source with generation N's binary, then build with c++.
# usage: scripts/bootstrap-gen.sh <N> <source.raz> <output-binary>
set -eu
N="$1"; SRC="$2"; OUT="$3"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GEN="$ROOT/generations/gen$N"
COMPILER="$GEN/bin/razc"
WORK="$GEN/build/work"

(cd "$GEN/bin" && sha256sum -c razc.sha256 >/dev/null) || { echo "generation $N: checksum mismatch" >&2; exit 1; }

rm -rf "$WORK"
mkdir -p "$WORK/frontend" "$WORK/backend"
cp "$ROOT/runtime/raz_runtime.hpp" "$WORK/backend/raz_runtime.hpp"
cp "$SRC" "$WORK/frontend/input.raz"

cd "$WORK"
"$COMPILER"
c++ -std=c++17 -O2 backend/output.cpp -o "$OUT"
echo "built $OUT with generation $N"
