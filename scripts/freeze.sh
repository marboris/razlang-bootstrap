#!/bin/sh
# Freeze a historical generation or the active Gen2 compiler, preserving its checksum.
# After this point genN is the operational compiler for L_N and the builder of genN+1.
# usage: scripts/freeze.sh <N> [--replace-pending|--replace-frozen]
# Frozen binaries are immutable by default. --replace-pending is only for provisional
# generations; --replace-frozen is an explicit migration and keeps a backup under build/.
set -eu
N="$1"
MODE="${2:-}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
case "$N" in
  0|1) GEN="$ROOT/legacy/gen$N"; REL="legacy/gen$N" ;;
  2) GEN="$ROOT/compiler/razc"; REL="compiler/razc" ;;
  *) echo "unsupported generation: $N (use 0, 1, or 2)" >&2; exit 2 ;;
esac
CAND="$GEN/build/razc-candidate"

case "$MODE" in
  ""|--replace-pending|--replace-frozen) ;;
  *) echo "unknown option: $MODE" >&2; exit 2 ;;
esac

if [ ! -f "$CAND" ]; then
  if [ "$N" = "0" ]; then BUILD_HINT="make build-gen0"; elif [ "$N" = "1" ]; then BUILD_HINT="make build-gen1"; else BUILD_HINT="make build-gen2"; fi
  echo "no candidate at $CAND (run: $BUILD_HINT)" >&2
  exit 1
fi
[ -f "$GEN/gen.json" ] || { echo "missing generation metadata: $GEN/gen.json" >&2; exit 1; }

PREVIOUS_SHA=""
if [ -e "$GEN/bin/razc" ]; then
  if [ "$MODE" = "--replace-pending" ]; then
    node --input-type=module -e '
      import fs from "node:fs";
      const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (metadata.status !== "source-complete-bootstrap-pending") process.exit(1);
    ' "$GEN/gen.json" || {
      echo "generation $N is not marked pending; refusing to replace its binary" >&2
      exit 1
    }
  elif [ "$MODE" = "--replace-frozen" ]; then
    node --input-type=module -e '
      import fs from "node:fs";
      const metadata = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (metadata.status !== "frozen") process.exit(1);
    ' "$GEN/gen.json" || {
      echo "generation $N is not marked frozen; refusing --replace-frozen" >&2
      exit 1
    }
    STAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_DIR="$GEN/build/previous-frozen"
    mkdir -p "$BACKUP_DIR"
    PREVIOUS_SHA=$(sha256sum "$GEN/bin/razc" | awk '{print $1}')
    cp "$GEN/bin/razc" "$BACKUP_DIR/razc-$STAMP"
    printf '%s  %s\n' "$PREVIOUS_SHA" "razc-$STAMP" > "$BACKUP_DIR/razc-$STAMP.sha256"
    echo "[freeze] previous frozen binary backed up to $BACKUP_DIR/razc-$STAMP"
  else
    echo "generation $N already has a binary; refusing to overwrite. Use --replace-pending for a pending generation or --replace-frozen for an intentional frozen update." >&2
    exit 1
  fi
fi

# Freeze records build provenance and checksums. Replacing a frozen generation is
# supported only through the explicit flag above and retains a rollback copy in build/.
mkdir -p "$GEN/bin"
cp "$CAND" "$GEN/bin/razc"
chmod +x "$GEN/bin/razc"
(cd "$GEN/bin" && sha256sum razc > razc.sha256)
NEW_SHA=$(sha256sum "$GEN/bin/razc" | awk '{print $1}')
node --input-type=module -e '
  import fs from "node:fs";
  const file = process.argv[1];
  const generation = Number(process.argv[2]);
  const mode = process.argv[3];
  const previousSha = process.argv[4] || null;
  const newSha = process.argv[5];
  const relativeRoot = process.argv[6];
  const metadata = JSON.parse(fs.readFileSync(file, "utf8"));
  const date = new Date().toISOString().slice(0, 10);
  metadata.status = "frozen";
  metadata.freeze_history ??= [];
  metadata.freeze_history.push({ date, action: mode === "--replace-frozen" ? "replace-frozen" : (mode === "--replace-pending" ? "replace-pending" : "freeze"), candidate_binary: `${relativeRoot}/build/razc-candidate`, sha256: newSha, previous_sha256: previousSha });
  if (generation === 1) metadata.milestone = "M1-M5 complete; Gen1 build frozen (legacy generation)";
  if (generation === 0) metadata.frozen_binary_note = "Frozen binary updated from the rebuilt JavaScript-seed candidate; see freeze_history for provenance.";
  if (generation === 1) metadata.frozen_binary_note = "Frozen binary updated from the rebuilt Gen0 candidate; see freeze_history for provenance.";
  fs.writeFileSync(file, JSON.stringify(metadata, null, 2) + "\n", "utf8");
' "$GEN/gen.json" "$N" "$MODE" "$PREVIOUS_SHA" "$NEW_SHA" "$REL"
echo "compiler $N frozen: $GEN/bin/razc"
