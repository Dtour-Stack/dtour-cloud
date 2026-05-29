#!/usr/bin/env bash
#
# Stand up a self-hosted Convex backend for dtour-cloud and push the functions.
# Uses Convex's official self-hosted docker-compose (downloaded, not vendored,
# so it tracks upstream). Requires Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f docker-compose.yml ]; then
  echo "==> Downloading Convex self-hosted docker-compose.yml"
  curl -fsSL https://raw.githubusercontent.com/get-convex/convex-backend/main/self-hosted/docker/docker-compose.yml \
    -o docker-compose.yml
fi

echo "==> Starting Convex backend (:3210) + dashboard (:6791)"
docker compose up -d

echo "==> Waiting for the backend to come up…"
until curl -fsS http://127.0.0.1:3210/version >/dev/null 2>&1; do sleep 2; done

echo "==> Generating admin key"
ADMIN_KEY="$(docker compose exec -T backend ./generate_admin_key.sh | tail -1 | tr -d '\r')"

cat <<EOF

Convex is up. Next steps:

1. Add to .env.local (gitignored):
     CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
     CONVEX_SELF_HOSTED_ADMIN_KEY=${ADMIN_KEY}

2. Push the dtour functions (generates convex/_generated/):
     bunx convex dev          # or: npx convex dev

3. Point the gate action at a Solana RPC:
     bunx convex env set SOLANA_RPC_URL https://your-rpc-endpoint

4. Start the frontend:
     VITE_CONVEX_URL=http://127.0.0.1:3210 bun run dev

Dashboard: http://localhost:6791
EOF
