#!/usr/bin/env bash
# Signed + notarized macOS release (Developer ID). Requires .env.build — see .env.build.example.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.build ]]; then
  echo "Missing .env.build — copy .env.build.example and set APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.build
set +a

if [[ -z "${APPLE_ID:-}" || -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
  echo "APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD must be set in .env.build" >&2
  exit 1
fi

# electron-builder 25+ reads team id from env for notarization
export APPLE_TEAM_ID="${APPLE_TEAM_ID:-KB8N3Q3ZAF}"

# Build outside iCloud-synced Documents/Desktop — provenance xattrs break codesign there.
RELEASE_OUT="${SPEND_RELEASE_DIR:-/var/tmp/spend-app-release}"
export COPYFILE_DISABLE=1

if [[ -d node_modules/electron/dist ]]; then
  echo "Clearing extended attributes on node_modules/electron/dist …"
  /usr/bin/xattr -cr node_modules/electron/dist 2>/dev/null || true
fi

rm -rf "$RELEASE_OUT" release/mac release/mac-arm64

echo "Packaging signed release to ${RELEASE_OUT} (avoids iCloud codesign issues) …"
electron-builder --mac -c.directories.output="$RELEASE_OUT"

mkdir -p release
echo "Copying artifacts to ./release …"
# shellcheck disable=SC2086
rsync -a --delete "${RELEASE_OUT}/" release/

echo "Done. DMG/zip in ./release/"
