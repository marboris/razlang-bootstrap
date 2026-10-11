#!/bin/sh
# Freeze the candidate binary of generation N into generations/genN/bin/ with its checksum.
# After this point genN is the operational compiler for L_N and the builder of genN+1.
# usage: scripts/freeze.sh <N> [--replace-pending]
# A frozen generation is never overwritten. The explicit option only replaces a
# provisional binary when gen.json still marks the generation as pending.
set -eu
N="$1"
MODE="${2:-}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GEN="$ROOT/generations/gen$N"
CAND="$GEN/build/razc-candidate"

case "$MODE" in
  ""|--replace-pending) ;;
  *) echo "unknown option: $MODE" >&2; exit 2 ;;
esac

if [ ! -f "$CAND" ]; then
  if [ "$N" = "0" ]; then BUILD_HINT="make build-gen0"; elif [ "$N" = "1" ]; then BUILD_HINT="make build-gen1"; else BUILD_HINT="make build-gen2"; fi
  echo "no candidate at $CAND (run: $BUILD_HINT)" >&2
  exit 1
fi
[ -f "$GEN/gen.json" ] || { echo "missing generation metadata: $GEN/gen.json" >&2; exit 1; }

if [ -e "$GEN/bin/razc" ]; then
  [ "$MODE" = "--replace-pending" ] || {
    echo "generation $N already has a binary; refusing to overwrite without --replace-pending" >&2
    exit 1
  }
  node --input-type=module -e '
    import fs from "node:fs";
    const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (metadata.status !== "source-complete-bootstrap-pending") process.exit(1);
  ' "$GEN/gen.json" || {
    echo "generation $N is not marked pending; refusing to replace its binary" >&2
    exit 1
  }
fi

# Freeze records build provenance and checksum only. Runtime acceptance checks are no
# longer coupled to generation freezing; Gen0/Gen1 are historical build stages.
mkdir -p "$GEN/bin"
cp "$CAND" "$GEN/bin/razc"
chmod +x "$GEN/bin/razc"
(cd "$GEN/bin" && sha256sum razc > razc.sha256)
node --input-type=module -e '
  import fs from "node:fs";
  const file = process.argv[1];
  const generation = Number(process.argv[2]);
  const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
  metadata.status = "frozen";
  if (generation === 1) metadata.milestone = "M1-M5 complete; Gen1 build frozen (legacy generation)";
  fs.writeFileSync(file, JSON.stringify(metadata, null, 2) + "\n", "utf8");
' "$GEN/gen.json" "$N"
echo "generation $N frozen: $GEN/bin/razc"
