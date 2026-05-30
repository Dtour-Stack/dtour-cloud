#!/usr/bin/env bash
#
# Deploy / update the Detour Cloud stack on the droplet. Idempotent.
# Prereqs: bootstrap.sh has run, deploy/.env exists, DNS points here.
# Run from the repo root:  bash deploy/deploy.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"
[ -f deploy/.env ] || { echo "Create deploy/.env from deploy/env.prod.example first." >&2; exit 1; }

# Read values WITHOUT sourcing — the admin key contains a '|' the shell would
# treat as a pipe.
envget() { grep "^$1=" deploy/.env | head -1 | cut -d= -f2-; }
VITE_CONVEX_URL="$(envget VITE_CONVEX_URL)"
VITE_SOLANA_RPC_URL="$(envget VITE_SOLANA_RPC_URL)"
DOMAIN="$(envget DOMAIN)"
: "${VITE_CONVEX_URL:?set VITE_CONVEX_URL in deploy/.env}"

echo "==> 1/4  Building frontend (VITE_CONVEX_URL=${VITE_CONVEX_URL})"
# Containerized build — no host toolchain. The lone @elizaos import in src/ is
# type-only and erased at build, so the monorepo symlinks aren't needed.
docker run --rm -v "$ROOT":/app -w /app \
  -e VITE_CONVEX_URL="$VITE_CONVEX_URL" \
  -e VITE_SOLANA_RPC_URL="${VITE_SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}" \
  oven/bun:1 sh -c "bun install --frozen-lockfile && bun run build"
# Update dist contents IN PLACE — recreating the directory changes its inode and
# leaves the running Caddy container with a stale, empty bind-mount (→ 404s).
mkdir -p deploy/dist
find deploy/dist -mindepth 1 -delete
cp -r dist/. deploy/dist/

echo "==> 2/4  Bringing up backend + caddy + dashboard"
$COMPOSE up -d

echo "==> 3/4  Waiting for the Convex backend to be healthy"
until curl -fsS http://127.0.0.1:3210/version >/dev/null 2>&1; do sleep 2; done

if ! grep -q '^CONVEX_SELF_HOSTED_ADMIN_KEY=' deploy/.env; then
  echo "==> Generating Convex admin key"
  KEY="$($COMPOSE exec -T backend ./generate_admin_key.sh | tail -1 | tr -d '\r')"
  echo "CONVEX_SELF_HOSTED_ADMIN_KEY=${KEY}" >> deploy/.env
fi
ADMIN_KEY="$(envget CONVEX_SELF_HOSTED_ADMIN_KEY)"

echo "==> 4/4  Pushing convex schema + functions"
docker run --rm --network host -v "$ROOT":/app -w /app \
  -e CONVEX_SELF_HOSTED_URL="http://127.0.0.1:3210" \
  -e CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
  oven/bun:1 sh -c "bun install --frozen-lockfile && bunx convex deploy"

# Caddy bind-mounts deploy/Caddyfile by inode; `git reset` rewrites it with a
# NEW inode, so `up -d` (which doesn't recreate caddy) keeps serving the stale
# file and `caddy reload` reports "config is unchanged". Restart caddy so it
# re-resolves the mount and applies any Caddyfile change (~1-2s blip; the apex
# cert is cached, not re-issued).
echo "==> Restarting caddy to apply any Caddyfile change"
$COMPOSE restart caddy

# The coding-relay bind-mounts services/coding-relay and runs `bun run server.ts`
# at start; a restart re-reads the (git-reset-updated) server.ts. up -d won't
# recreate it on a code-only change, so restart explicitly.
echo "==> Restarting coding-relay to apply any code change"
$COMPOSE restart coding-relay || true

echo
echo "✅ Stack is up: https://${DOMAIN}"
echo "   First run? Seed the DB:  bash deploy/seed.sh"
