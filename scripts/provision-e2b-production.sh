#!/usr/bin/env bash
# Append E2B_API_KEY to the production deploy/.env and restart coding-relay.
#
# Usage:
#   E2B_API_KEY=e2b_… ./scripts/provision-e2b-production.sh
#   ./scripts/provision-e2b-production.sh e2b_…
#
# Optional: DROPLET=root@162.243.193.104  REPO=/opt/dtour-cloud
set -euo pipefail

KEY="${E2B_API_KEY:-${1:-}}"
DROPLET="${DROPLET:-root@162.243.193.104}"
REPO="${REPO:-/opt/dtour-cloud}"

if [[ -z "$KEY" ]]; then
  echo "Missing E2B_API_KEY. Get one at https://e2b.dev then:" >&2
  echo "  E2B_API_KEY=e2b_… $0" >&2
  exit 1
fi

if [[ "$KEY" != e2b_* ]]; then
  echo "Warning: key does not start with e2b_ — continuing anyway." >&2
fi

ssh "$DROPLET" "bash -s" <<EOF
set -euo pipefail
ENV="$REPO/deploy/.env"
touch "\$ENV"
if grep -q '^E2B_API_KEY=' "\$ENV"; then
  sed -i 's|^E2B_API_KEY=.*|E2B_API_KEY=${KEY}|' "\$ENV"
else
  echo 'E2B_API_KEY=${KEY}' >> "\$ENV"
fi
cd "$REPO"
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env restart coding-relay
sleep 2
curl -fsS "https://\$(grep '^DOMAIN=' "\$ENV" | cut -d= -f2)/coding-health" || true
EOF

echo "Done. Expect coding-health JSON with \"e2b\":true"
