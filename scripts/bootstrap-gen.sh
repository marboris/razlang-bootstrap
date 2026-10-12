#!/bin/sh
# Node-free step: compile a Raz source with generation N's binary, then build with c++.
# usage: scripts/bootstrap-gen.sh <N> <source.raz> <output-binary>
set -eu
N="$1"; SRC="$2"; OUT="$3"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
case "$N" in
  0|1) GEN="$ROOT/legacy/gen$N" ;;
  2) GEN="$ROOT/compiler/razc" ;;
  *) echo "unsupported generation: $N (use 0, 1, or 2)" >&2; exit 2 ;;
esac
COMPILER="$GEN/bin/razc"
WORK="$GEN/build/work"

(cd "$GEN/bin" && sha256sum -c razc.sha256 >/dev/null) || { echo "generation $N: checksum mismatch" >&2; exit 1; }

rm -rf "$WORK"
mkdir -p "$WORK/frontend" "$WORK/backend"
if [ "$N" != "2" ]; then
  node "$ROOT/scripts/legacy-runtime.mjs" "$WORK/backend/raz_runtime.hpp"
fi
cp "$SRC" "$WORK/frontend/input.raz"

cd "$WORK"
"$COMPILER"
g++ -std=c++17 -O2 backend/output.cpp -I "$ROOT/library/raz" -o "$OUT"
echo "built $OUT with generation $N"
