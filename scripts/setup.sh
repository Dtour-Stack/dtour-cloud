#!/usr/bin/env bash
#
# dtour-cloud setup — recreates the local-checkout links + installs deps.
#
# The vendored backend packages (packages/cloud-*, packages/security) are
# committed to this repo. This script recreates the machine-specific links to a
# local elizaOS monorepo checkout (the runtime/plugins are NOT vendored — they
# resolve via these symlinks against develop) and installs third-party deps.
#
# Usage:
#   ELIZA_DIR=/path/to/eliza ./scripts/setup.sh
# Defaults ELIZA_DIR to /Users/home/Documents/milady/eliza.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELIZA_DIR="${ELIZA_DIR:-/Users/home/Documents/milady/eliza}"

cd "$ROOT"

if [ ! -d "$ELIZA_DIR/packages/core" ] || [ ! -d "$ELIZA_DIR/plugins" ]; then
  echo "ERROR: elizaOS monorepo not found at: $ELIZA_DIR" >&2
  echo "Clone github.com/elizaOS/eliza (branch develop), 'bun install' it," >&2
  echo "then re-run with ELIZA_DIR=/path/to/eliza ./scripts/setup.sh" >&2
  exit 1
fi

echo "==> Linking eliza source packages (runtime/plugins resolve to develop, not npm)"
ln -sfn "$ELIZA_DIR/plugins" plugins
for pkg in core shared ui contracts; do
  ln -sfn "$ELIZA_DIR/packages/$pkg" "packages/$pkg"
done

echo "==> Installing third-party deps (this project's own node_modules)"
bun install

echo "==> Mirroring monorepo node_modules layout for plugins not in cloud-api tsconfig paths"
mkdir -p node_modules/@elizaos
ln -sfn "$ELIZA_DIR/plugins/plugin-elizacloud" node_modules/@elizaos/plugin-elizacloud

# cloud-api resolves @elizaos/plugin-elizacloud via node_modules -> its built dist
# (it's the one @elizaos import without a tsconfig src-path). Ensure dist is built.
if [ ! -f "$ELIZA_DIR/plugins/plugin-elizacloud/dist/node/index.d.ts" ]; then
  echo "    plugin-elizacloud dist incomplete — building it"
  (cd "$ELIZA_DIR/plugins/plugin-elizacloud" && bun run build.ts)
fi

echo "==> Typechecking vendored packages"
for p in cloud-routing cloud-sdk cloud-shared cloud-api; do
  printf '    %-14s ' "$p"
  n=$(./node_modules/.bin/tsc --noEmit -p "packages/$p/tsconfig.json" 2>&1 | grep -c 'error TS' || true)
  echo "$n error(s)"
done

echo ""
echo "Done. Expected: all four packages = 0 errors."
