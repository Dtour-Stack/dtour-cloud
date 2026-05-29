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
set -a; . deploy/.env; set +a
: "${VITE_CONVEX_URL:?set VITE_CONVEX_URL in deploy/.env}"

echo "==> 1/4  Building frontend (VITE_CONVEX_URL=${VITE_CONVEX_URL})"
# Containerized build — no host toolchain. The lone @elizaos import in src/ is
# type-only and erased at build, so the monorepo symlinks aren't needed.
docker run --rm -v "$ROOT":/app -w /app \
  -e VITE_CONVEX_URL="$VITE_CONVEX_URL" \
  -e VITE_SOLANA_RPC_URL="${VITE_SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}" \
  oven/bun:1 sh -c "bun install --frozen-lockfile && bun run build"
rm -rf deploy/dist && cp -r dist deploy/dist

echo "==> 2/4  Bringing up backend + caddy + dashboard"
$COMPOSE up -d

echo "==> 3/4  Waiting for the Convex backend to be healthy"
until curl -fsS http://127.0.0.1:3210/version >/dev/null 2>&1; do sleep 2; done

# Admin key — generate once and persist to deploy/.env.
if ! grep -q '^CONVEX_SELF_HOSTED_ADMIN_KEY=' deploy/.env; then
  echo "==> Generating Convex admin key"
  KEY="$($COMPOSE exec -T backend ./generate_admin_key.sh | tail -1 | tr -d '\r')"
  echo "CONVEX_SELF_HOSTED_ADMIN_KEY=${KEY}" >> deploy/.env
fi
set -a; . deploy/.env; set +a

echo "==> 4/4  Pushing convex schema + functions"
# --network host so the container reaches the localhost-bound backend (:3210).
docker run --rm --network host -v "$ROOT":/app -w /app \
  -e CONVEX_SELF_HOSTED_URL="http://127.0.0.1:3210" \
  -e CONVEX_SELF_HOSTED_ADMIN_KEY="$CONVEX_SELF_HOSTED_ADMIN_KEY" \
  oven/bun:1 sh -c "bun install --frozen-lockfile && bunx convex deploy"

cat <<EOF

✅ Stack is up: https://${DOMAIN}

Remaining one-time setup (see docs/DEPLOY.md):
  # Gate needs a Solana RPC on the deployment:
  $COMPOSE exec -T backend sh -c 'true'   # (set via convex env, below)
  CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 CONVEX_SELF_HOSTED_ADMIN_KEY=\$KEY \\
    bunx convex env set SOLANA_RPC_URL https://your-rpc

  # Seed the fresh DB (owner wallet shown):
  bunx convex run config:seed
  bunx convex run flags:seed
  bunx convex run admin:bootstrapSuperAdmin '{"pubkey":"2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7","note":"owner"}'
  bunx convex run admin:setPlan '{"pubkey":"2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7","plan":"lifetime"}'
EOF
