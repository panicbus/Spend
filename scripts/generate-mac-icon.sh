#!/usr/bin/env bash
# Regenerate build/icon.icns from spend-icon-1024.png (macOS: sips + iconutil).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/spend-icon-1024.png"
if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC — add the 1024×1024 master PNG at the repo root." >&2
  exit 1
fi
ICONSET="$ROOT/build/Spend.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
sips -z 16 16 "$SRC" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$SRC" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SRC" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$SRC" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SRC" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SRC" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o "$ROOT/build/icon.icns"
rm -rf "$ICONSET"
echo "Wrote $ROOT/build/icon.icns"
