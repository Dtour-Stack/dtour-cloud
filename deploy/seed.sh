#!/usr/bin/env bash
#
# Seed a fresh Convex deployment + set the gate's Solana RPC. Idempotent.
# Run from the repo root on the droplet (after deploy.sh):  bash deploy/seed.sh
# Override the owner wallet with:  OWNER_PUBKEY=... bash deploy/seed.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

envget() { grep "^$1=" deploy/.env | head -1 | cut -d= -f2-; }
ADMIN_KEY="$(envget CONVEX_SELF_HOSTED_ADMIN_KEY)"
[ -n "$ADMIN_KEY" ] || { echo "No admin key in deploy/.env — run deploy.sh first." >&2; exit 1; }

OWNER="${OWNER_PUBKEY:-2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7}"
RPC="$(envget VITE_SOLANA_RPC_URL)"; RPC="${RPC:-https://api.mainnet-beta.solana.com}"

docker run --rm --network host -v "$ROOT":/app -w /app \
  -e CONVEX_SELF_HOSTED_URL="http://127.0.0.1:3210" \
  -e CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
  -e OWNER="$OWNER" -e RPC="$RPC" \
  oven/bun:1 sh -c '
    bun install --frozen-lockfile >/dev/null 2>&1
    bunx convex env set SOLANA_RPC_URL "$RPC"
    bunx convex run config:seed
    bunx convex run flags:seed
    bunx convex run flags:enableBetaProductionSurfaces
    bunx convex run admin:bootstrapSuperAdmin "{\"pubkey\":\"$OWNER\",\"note\":\"owner\"}"
    bunx convex run admin:setPlan "{\"pubkey\":\"$OWNER\",\"plan\":\"lifetime\"}"
  '
echo "✅ Seeded (owner=$OWNER, plan=lifetime, gate RPC set)"
