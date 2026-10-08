#!/bin/sh
# Freeze the candidate binary of generation N into generations/genN/bin/ with its checksum.
# After this point genN is the operational compiler for L_N and the builder of genN+1.
# usage: scripts/freeze.sh <N>
# A frozen generation is never overwritten: if bin/razc already exists, this refuses.
set -eu
N="$1"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GEN="$ROOT/generations/gen$N"
CAND="$GEN/build/razc-candidate"

[ -f "$CAND" ] || { echo "no candidate at $CAND (run: npm run build:native)" >&2; exit 1; }
if [ -e "$GEN/bin/razc" ]; then
  echo "generation $N is already frozen: $GEN/bin/razc (refusing to overwrite)" >&2
  exit 1
fi

mkdir -p "$GEN/bin"
cp "$CAND" "$GEN/bin/razc"
chmod +x "$GEN/bin/razc"
(cd "$GEN/bin" && sha256sum razc > razc.sha256)
echo "generation $N frozen: $GEN/bin/razc"
